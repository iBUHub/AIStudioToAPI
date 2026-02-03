/**
 * File: src/core/ProxyServerSystem.js
 * Description: Main proxy server system that orchestrates all components including HTTP/WebSocket servers, authentication, and request handling
 *
 * Author: Ellinav, iBenzene, bbbugg
 */

const { EventEmitter } = require("events");
const express = require("express");
const WebSocket = require("ws");
const http = require("http");
const https = require("https");
const fs = require("fs");
const net = require("net");
const { URL } = require("url");

const LoggingService = require("../utils/LoggingService");
const AuthSource = require("../auth/AuthSource");
const BrowserManager = require("./BrowserManager");
const ConnectionRegistry = require("./ConnectionRegistry");
const RequestHandler = require("./RequestHandler");
const ConfigLoader = require("../utils/ConfigLoader");
const WebRoutes = require("../routes/WebRoutes");

/**
 * Proxy Server System
 * Main server system class that integrates all modules
 */
class ProxyServerSystem extends EventEmitter {
    constructor() {
        super();
        this.logger = new LoggingService("ProxySystem");

        const configLoader = new ConfigLoader(this.logger);
        this.config = configLoader.loadConfiguration();
        this.streamingMode = this.config.streamingMode;
        this.forceThinking = this.config.forceThinking;
        this.forceWebSearch = this.config.forceWebSearch;
        this.forceUrlContext = this.config.forceUrlContext;

        this.authSource = new AuthSource(this.logger);
        this.browserManager = new BrowserManager(this.logger, this.config, this.authSource);

        // Create ConnectionRegistry with lightweight reconnect callback
        // When WebSocket connection is lost but browser is still running,
        // this callback attempts to refresh the page and re-inject the script
        this.connectionRegistry = new ConnectionRegistry(this.logger, async () => {
            // Skip if browser is being intentionally closed (not an unexpected disconnect)
            if (this.browserManager.isClosingIntentionally) {
                this.logger.info("[System] Browser is closing intentionally, skipping reconnect attempt.");
                return;
            }
            // Skip if the system is busy switching/recovering to avoid conflicting refreshes
            if (this.requestHandler?.isSystemBusy) {
                this.logger.info(
                    "[System] System is busy (switching/recovering), skipping lightweight reconnect attempt."
                );
                return;
            }

            if (this.browserManager.browser && this.browserManager.page && !this.browserManager.page.isClosed()) {
                this.logger.error(
                    "[System] WebSocket lost but browser still running, attempting lightweight reconnect..."
                );
                const success = await this.browserManager.attemptLightweightReconnect();
                if (!success) {
                    this.logger.warn(
                        "[System] Lightweight reconnect failed. Will attempt full recovery on next request."
                    );
                }
            } else {
                this.logger.info("[System] Browser not available, skipping lightweight reconnect.");
            }
        });
        this.requestHandler = new RequestHandler(
            this,
            this.connectionRegistry,
            this.logger,
            this.browserManager,
            this.config,
            this.authSource
        );

        this.httpServer = null;
        this.wsServer = null;
        this.webRoutes = new WebRoutes(this);
    }

    async start(initialAuthIndex = null) {
        this.logger.info("[System] Starting flexible startup process...");
        await this._startHttpServer();
        await this._startWebSocketServer();
        this.logger.info(`[System] Proxy server system startup complete.`);

        const allAvailableIndices = this.authSource.availableIndices;
        const allRotationIndices = this.authSource.getRotationIndices();

        if (allAvailableIndices.length === 0) {
            this.logger.warn("[System] No available authentication source. Starting in account binding mode.");
            this.emit("started");
            return; // Exit early
        }

        let startupOrder = allRotationIndices.length > 0 ? [...allRotationIndices] : [...allAvailableIndices];
        const hasInitialAuthIndex = Number.isInteger(initialAuthIndex);
        if (hasInitialAuthIndex) {
            const canonicalInitialIndex = this.authSource.getCanonicalIndex(initialAuthIndex);
            if (canonicalInitialIndex !== null && startupOrder.includes(canonicalInitialIndex)) {
                if (canonicalInitialIndex !== initialAuthIndex) {
                    this.logger.warn(
                        `[System] Specified startup index #${initialAuthIndex} is a duplicate for the same email, using latest auth index #${canonicalInitialIndex} instead.`
                    );
                } else {
                    this.logger.info(
                        `[System] Detected specified startup index #${initialAuthIndex}, will try it first.`
                    );
                }
                startupOrder = [canonicalInitialIndex, ...startupOrder.filter(i => i !== canonicalInitialIndex)];
            } else {
                this.logger.warn(
                    `[System] Specified startup index #${initialAuthIndex} is invalid or unavailable, will start in default order.`
                );
            }
        } else {
            this.logger.info(
                `[System] No valid startup index specified, will try in default order [${startupOrder.join(", ")}].`
            );
        }

        let isStarted = false;
        for (const index of startupOrder) {
            try {
                this.logger.info(`[System] Attempting to start service with account #${index}...`);
                this.requestHandler.authSwitcher.isSystemBusy = true;
                await this.browserManager.launchOrSwitchContext(index);

                isStarted = true;
                this.logger.info(`[System] ✅ Successfully started with account #${index}!`);
                break;
            } catch (error) {
                this.logger.error(`[System] ❌ Failed to start with account #${index}. Reason: ${error.message}`);
            } finally {
                this.requestHandler.authSwitcher.isSystemBusy = false;
            }
        }

        if (!isStarted) {
            this.logger.warn(
                "[System] All authentication sources failed to initialize. Starting in account binding mode without an active account."
            );
            // Don't throw an error, just proceed to start servers
        }

        this.emit("started");
    }

    _createAuthMiddleware() {
        return (req, res, next) => {
            // Allow access if session is authenticated (e.g. browser accessing /vnc or API from UI)
            if (req.session && req.session.isAuthenticated) {
                if (req.path === "/vnc") {
                    return next();
                }
            }

            const serverApiKeys = this.config.apiKeys;
            if (!serverApiKeys || serverApiKeys.length === 0) {
                return next();
            }

            let clientKey = null;
            if (req.headers["x-goog-api-key"]) {
                clientKey = req.headers["x-goog-api-key"];
            } else if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
                clientKey = req.headers.authorization.substring(7);
            } else if (req.headers["x-api-key"]) {
                clientKey = req.headers["x-api-key"];
            } else if (req.query.key) {
                clientKey = req.query.key;
            }

            if (clientKey && serverApiKeys.includes(clientKey)) {
                this.logger.info(
                    `[Auth] API Key verification passed (from: ${this.webRoutes.authRoutes.getClientIP(req)})`
                );
                if (req.query.key) {
                    delete req.query.key;
                }
                return next();
            }

            if (req.path !== "/favicon.ico") {
                const clientIp = this.webRoutes.authRoutes.getClientIP(req);
                this.logger.warn(
                    `[Auth] Access password incorrect or missing, request denied. IP: ${clientIp}, Path: ${req.path}`
                );
            }

            return res.status(401).json({
                error: {
                    message: "Access denied. A valid API key was not found or is incorrect.",
                },
            });
        };
    }

    async _startHttpServer() {
        const app = this._createExpressApp();

        if (this.config.sslKeyPath && this.config.sslCertPath) {
            try {
                if (fs.existsSync(this.config.sslKeyPath) && fs.existsSync(this.config.sslCertPath)) {
                    const options = {
                        cert: fs.readFileSync(this.config.sslCertPath),
                        key: fs.readFileSync(this.config.sslKeyPath),
                    };
                    this.httpServer = https.createServer(options, app);
                    this.logger.info("[System] Starting in HTTPS mode...");
                } else {
                    this.logger.warn("[System] SSL file paths provided but files not found. Falling back to HTTP.");
                    this.httpServer = http.createServer(app);
                }
            } catch (error) {
                this.logger.error(`[System] Failed to load SSL files: ${error.message}. Falling back to HTTP.`);
                this.httpServer = http.createServer(app);
            }
        } else {
            this.httpServer = http.createServer(app);
        }

        this.httpServer.on("upgrade", (req, socket) => {
            const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;

            if (pathname === "/vnc") {
                this.logger.info("[VNC Proxy] Detected VNC WebSocket upgrade request. Verifying session...");

                // Use the session parser from WebRoutes to verify authentication
                this.webRoutes.sessionParser(req, {}, () => {
                    if (!req.session || !req.session.isAuthenticated) {
                        const clientIp = this.webRoutes.authRoutes.getClientIP(req);
                        this.logger.warn(`[VNC Proxy] Unauthorized WebSocket connection attempt from ${clientIp}`);
                        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
                        socket.destroy();
                        return;
                    }

                    this.logger.info("[VNC Proxy] Session verified. Proxying...");
                    const target = net.createConnection({ host: "localhost", port: 6080 });

                    target.on("connect", () => {
                        this.logger.info("[VNC Proxy] Successfully connected to internal websockify (port 6080).");

                        // Forward the WebSocket handshake headers to the backend
                        const headers = [
                            `GET ${req.url} HTTP/1.1`,
                            "Host: localhost:6080",
                            "Upgrade: websocket",
                            "Connection: Upgrade",
                            `Sec-WebSocket-Key: ${req.headers["sec-websocket-key"]}`,
                            `Sec-WebSocket-Version: ${req.headers["sec-websocket-version"]}`,
                        ];

                        if (req.headers["sec-websocket-protocol"]) {
                            headers.push(`Sec-WebSocket-Protocol: ${req.headers["sec-websocket-protocol"]}`);
                        }

                        if (req.headers["sec-websocket-extensions"]) {
                            headers.push(`Sec-WebSocket-Extensions: ${req.headers["sec-websocket-extensions"]}`);
                        }

                        // Write the handshake to the backend
                        target.write(headers.join("\r\n") + "\r\n\r\n");

                        // Pipe the sockets together. The backend will respond with 101, which goes to the client.
                        target.pipe(socket).pipe(target);
                    });

                    target.on("error", err => {
                        this.logger.error(`[VNC Proxy] Error connecting to internal websockify: ${err.message}`);
                        socket.destroy();
                    });

                    socket.on("error", err => {
                        this.logger.error(`[VNC Proxy] Client socket error: ${err.message}`);
                        target.destroy();
                    });
                });
            } else {
                // If it's not for VNC, destroy the socket to prevent hanging connections
                this.logger.warn(
                    `[System] Received an upgrade request for an unknown path: ${pathname}. Connection terminated.`
                );
                socket.destroy();
            }
        });

        this.httpServer.keepAliveTimeout = 120000;
        this.httpServer.headersTimeout = 125000;
        this.httpServer.requestTimeout = 120000;

        return new Promise(resolve => {
            this.httpServer.listen(this.config.httpPort, this.config.host, () => {
                this.logger.info(
                    `[System] HTTP server is listening on http://${this.config.host}:${this.config.httpPort}`
                );
                this.logger.info(
                    `[System] Keep-Alive timeout set to ${this.httpServer.keepAliveTimeout / 1000} seconds.`
                );
                resolve();
            });
        });
    }

    _createExpressApp() {
        const app = express();

        // Request logging
        app.use((req, res, next) => {
            if (
                req.path !== "/api/status" &&
                req.path !== "/" &&
                req.path !== "/favicon.ico" &&
                req.path !== "/login" &&
                req.path !== "/health" &&
                !req.path.startsWith("/locales/") &&
                !req.path.startsWith("/assets/") &&
                req.path !== "/AIStudio_logo.svg" &&
                req.path !== "/AIStudio_icon.svg"
            ) {
                this.logger.info(`[Entrypoint] Received a request: ${req.method} ${req.path}`);
            }
            next();
        });

        // CORS middleware
        app.use((req, res, next) => {
            res.header("Access-Control-Allow-Origin", "*");
            res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
            res.header("Access-Control-Allow-Private-Network", "true");
            res.header(
                "Access-Control-Allow-Headers",
                "Content-Type, Authorization, x-requested-with, x-api-key, x-goog-api-key, x-goog-api-client, x-user-agent," +
                    " origin, accept, baggage, sentry-trace, openai-organization, openai-project, openai-beta, x-stainless-lang, " +
                    "x-stainless-package-version, x-stainless-os, x-stainless-arch, x-stainless-runtime, x-stainless-runtime-version, " +
                    "x-stainless-retry-count, x-stainless-timeout, sec-ch-ua, sec-ch-ua-mobile, sec-ch-ua-platform, " +
                    "x-goog-upload-protocol, x-goog-upload-command, x-goog-upload-header-content-length, " +
                    "x-goog-upload-header-content-type, x-goog-upload-url, x-goog-upload-offset, x-goog-upload-status"
            );

            // Expose all common Headers, including upload related ones (matched from BuildProxy)
            res.header("Access-Control-Expose-Headers", "*");
            res.header(
                "Access-Control-Expose-Headers",
                "x-goog-upload-url, x-goog-upload-status, x-goog-upload-chunk-granularity, " +
                    "x-goog-upload-control-url, x-goog-upload-command, x-goog-upload-content-type, " +
                    "x-goog-upload-protocol, x-goog-upload-file-name, x-goog-upload-offset, " +
                    "date, content-type, content-length, location"
            );

            if (req.method === "OPTIONS") {
                return res.sendStatus(204);
            }
            next();
        });

        // Manual body collection middleware (BuildProxy style)
        // Collects the entire raw body into req.rawBody as a Buffer
        // Also attempts to parse JSON into req.body for compatibility
        app.use((req, res, next) => {
            if (req.method === "GET" || req.method === "OPTIONS" || req.method === "HEAD") {
                return next();
            }

            const chunks = [];
            req.on("data", chunk => chunks.push(chunk));
            req.on("end", () => {
                req.rawBody = Buffer.concat(chunks);

                // Try to parse JSON for req.body compatibility
                if (req.headers["content-type"]?.includes("application/json")) {
                    try {
                        req.body = JSON.parse(req.rawBody.toString());
                    } catch (e) {
                        // Not valid JSON, keep req.body undefined or empty
                        req.body = {};
                    }
                } else if (req.headers["content-type"]?.includes("application/x-www-form-urlencoded")) {
                    try {
                        const qs = require("querystring");
                        req.body = qs.parse(req.rawBody.toString());
                    } catch (e) {
                        req.body = {};
                    }
                } else {
                    req.body = {};
                }

                next();
            });

            req.on("error", err => {
                this.logger.error(`[System] Request stream error: ${err.message}`);
                next(err);
            });
        });

        // Serve static files from ui/dist (Vite build output)
        const path = require("path");
        app.use(express.static(path.join(__dirname, "..", "..", "ui", "dist")));

        // Serve additional public assets under ui/public
        app.use(express.static(path.join(__dirname, "..", "..", "ui", "public")));

        // Serve locales for front-end only translations
        app.use("/locales", express.static(path.join(__dirname, "..", "..", "ui", "locales")));

        // Setup session and all routes (auth, status, and auth creation)
        this.webRoutes.setupSession(app);

        // API authentication middleware
        app.use(this._createAuthMiddleware());

        // API routes
        app.get(["/v1/models"], (req, res) => {
            // OpenAI format
            const models = this.config.modelList.map(model => ({
                context_window: model.inputTokenLimit,
                created: Math.floor(Date.now() / 1000),
                id: model.name.replace("models/", ""),
                max_tokens: model.outputTokenLimit,
                object: "model",
                owned_by: "google",
            }));

            res.status(200).json({
                data: models,
                object: "list",
            });
        });

        app.get(["/v1beta/models"], (req, res) => {
            res.status(200).json({ models: this.config.modelList });
        });

        app.post("/v1/chat/completions", (req, res) => {
            this.requestHandler.processOpenAIRequest(req, res);
        });

        // Claude API compatible endpoint
        app.post("/v1/messages", (req, res) => {
            this.requestHandler.processClaudeRequest(req, res);
        });

        // VNC WebSocket downgrade / missing headers handler
        // If Nginx or another proxy strips "Upgrade: websocket" headers, the request appears as a normal GET.
        // We intercept it here to prevent it from falling through to the Gemini proxy.
        app.get("/vnc", (req, res) => {
            res.status(400).send(
                "Error: WebSocket connection failed. " +
                    "If you are using a proxy (like Nginx), ensure it is configured to forward 'Upgrade' and 'Connection' headers."
            );
        });

        // File Upload Routes
        // Intercept upload requests to use specialized handler
        app.all(/\/upload\/.*/, (req, res) => {
            this.requestHandler.processUploadRequest(req, res);
        });

        app.all(/(.*)/, (req, res) => {
            this.requestHandler.processRequest(req, res);
        });

        return app;
    }

    async _startWebSocketServer() {
        this.wsServer = new WebSocket.Server({
            host: this.config.host,
            port: this.config.wsPort,
        });
        this.wsServer.on("connection", (ws, req) => {
            this.connectionRegistry.addConnection(ws, {
                address: req.socket.remoteAddress,
            });
        });
    }
}

module.exports = ProxyServerSystem;

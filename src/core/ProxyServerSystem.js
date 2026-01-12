/**
 * File: src/core/ProxyServerSystem.js
 * Description: Main proxy server system that orchestrates all components including HTTP/WebSocket servers, authentication, and request handling
 *
 * Maintainers: iBenzene, bbbugg
 * Original Author: Ellinav
 */

const { EventEmitter } = require("events");
const express = require("express");
const WebSocket = require("ws");
const http = require("http");
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
        this.connectionRegistry = new ConnectionRegistry(this.logger);
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
            // Whitelist paths that don't require API key authentication
            // Note: /, /api/status use session authentication instead
            const whitelistPaths = [
                "/",
                "/favicon.ico",
                "/login",
                "/health",
                "/api/status",
                "/api/accounts/current",
                "/api/accounts/deduplicate",
                "/api/settings/streaming-mode",
                "/api/settings/force-thinking",
                "/api/settings/force-web-search",
                "/api/settings/force-url-context",
                "/auth",
            ];

            // Whitelist path patterns (regex)
            const whitelistPatterns = [
                /^\/api\/accounts\/\d+$/, // Matches /api/accounts/:index for DELETE operations
            ];

            // Skip authentication for static files
            const staticPrefixes = ["/assests/", "/assets/", "/AIStudio_logo.svg", "/AIStudio_icon.svg", "/locales/"];
            const isStaticFile = staticPrefixes.some(prefix => req.path.startsWith(prefix) || req.path === prefix);
            const isWhitelistedPattern = whitelistPatterns.some(pattern => pattern.test(req.path));

            if (whitelistPaths.includes(req.path) || isStaticFile || isWhitelistedPattern) {
                return next();
            }

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
                    `[Auth] API Key verification passed (from: ${req.headers["x-forwarded-for"] || req.ip})`
                );
                if (req.query.key) {
                    delete req.query.key;
                }
                return next();
            }

            if (req.path !== "/favicon.ico") {
                const clientIp = req.headers["x-forwarded-for"] || req.ip;
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
        this.httpServer = http.createServer(app);

        this.httpServer.on("upgrade", (req, socket) => {
            const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;

            if (pathname === "/vnc") {
                this.logger.info("[VNC Proxy] Detected VNC WebSocket upgrade request. Proxying...");
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

        // CORS middleware
        app.use((req, res, next) => {
            res.header("Access-Control-Allow-Origin", "*");
            res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
            res.header(
                "Access-Control-Allow-Headers",
                "Content-Type, Authorization, x-requested-with, x-api-key, x-goog-api-key, x-goog-api-client, x-user-agent," +
                    " origin, accept, baggage, sentry-trace, openai-organization, openai-project, openai-beta, x-stainless-lang, " +
                    "x-stainless-package-version, x-stainless-os, x-stainless-arch, x-stainless-runtime, x-stainless-runtime-version, " +
                    "x-stainless-retry-count, x-stainless-timeout, sec-ch-ua, sec-ch-ua-mobile, sec-ch-ua-platform"
            );
            if (req.method === "OPTIONS") {
                return res.sendStatus(204);
            }
            next();
        });

        // Request logging
        app.use((req, res, next) => {
            if (
                req.path !== "/api/status" &&
                req.path !== "/" &&
                req.path !== "/favicon.ico" &&
                req.path !== "/login" &&
                req.path !== "/health"
            ) {
                this.logger.info(`[Entrypoint] Received a request: ${req.method} ${req.path}`);
            }
            next();
        });

        app.use(express.json({ limit: "100mb" }));
        app.use(express.urlencoded({ extended: true }));

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

        // VNC WebSocket downgrade / missing headers handler
        // If Nginx or another proxy strips "Upgrade: websocket" headers, the request appears as a normal GET.
        // We intercept it here to prevent it from falling through to the Gemini proxy.
        app.get("/vnc", (req, res) => {
            res.status(400).send(
                "Error: WebSocket connection failed. " +
                    "If you are using a proxy (like Nginx), ensure it is configured to forward 'Upgrade' and 'Connection' headers."
            );
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

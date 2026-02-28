/**
 * File: scripts/client/build.js
 * Description: Client-side browser script that runs in the headless browser to proxy API requests through WebSocket
 *
 * Author: Ellinav, iBenzene, bbbugg
 */

/* eslint-env browser */

const b64toBlob = (b64Data, contentType = "", sliceSize = 512) => {
    const byteCharacters = atob(b64Data);
    const byteArrays = [];
    for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
        const slice = byteCharacters.slice(offset, offset + sliceSize);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
            byteNumbers[i] = slice.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
    }
    return new Blob(byteArrays, { type: contentType });
};

const Logger = {
    _log(level, levelName, ...messages) {
        if (!this.enabled || level < this.currentLevel) return;

        // BrowserManager will add timestamp via LoggingService when forwarding logs
        // INFO level: keep original format without level tag for backward compatibility
        // Other levels: show level tag for distinction
        // Format: [ProxyClient] for INFO, [ProxyClient] Debug/Warn/Error: for others
        let consolePrefix;
        if (level === this.LEVELS.INFO) {
            consolePrefix = `[ProxyClient]`;
        } else {
            // Capitalize first letter: DEBUG -> Debug, WARN -> Warn, ERROR -> Error
            const levelLabel = levelName.charAt(0) + levelName.slice(1).toLowerCase();
            consolePrefix = `[ProxyClient] ${levelLabel}:`;
        }

        switch (level) {
            case this.LEVELS.ERROR:
                console.error(consolePrefix, ...messages);
                break;
            case this.LEVELS.WARN:
                console.warn(consolePrefix, ...messages);
                break;
            case this.LEVELS.DEBUG:
                console.debug(consolePrefix, ...messages);
                break;
            default:
                console.log(consolePrefix, ...messages);
        }

        // DOM output for debugging in browser page
        const logElement = document.createElement("div");
        if (level === this.LEVELS.INFO) {
            logElement.textContent = messages.join(" ");
        } else {
            const levelLabel = levelName.charAt(0) + levelName.slice(1).toLowerCase();
            logElement.textContent = `${levelLabel}: ${messages.join(" ")}`;
        }
        document.body.appendChild(logElement);
    },

    // [BrowserManager Injection Point] Do not modify the line below.
    // This line is dynamically replaced by BrowserManager.js based on LOG_LEVEL environment variable.
    currentLevel: 1,

    debug(...messages) {
        this._log(this.LEVELS.DEBUG, "DEBUG", ...messages);
    },

    // Default: INFO
    enabled: true,

    error(...messages) {
        this._log(this.LEVELS.ERROR, "ERROR", ...messages);
    },

    info(...messages) {
        this._log(this.LEVELS.INFO, "INFO", ...messages);
    },

    // Log levels: DEBUG < INFO < WARN < ERROR (consistent with LoggingService.js)
    LEVELS: { DEBUG: 0, ERROR: 3, INFO: 1, WARN: 2 },

    // Backward compatible method for existing code
    output(...messages) {
        this.info(...messages);
    },

    warn(...messages) {
        this._log(this.LEVELS.WARN, "WARN", ...messages);
    },
};

class ConnectionManager extends EventTarget {
    // [BrowserManager Injection Point] Do not modify the line below.
    // WebSocket endpoint is now fixed at ws://127.0.0.1:9998 and cannot be customized.
    constructor(endpoint = "ws://127.0.0.1:9998") {
        super();

        // Defer authIndex reading until establish() is called
        // This ensures window.chrome._contextId is available (set by postMessage from parent page)
        this.authIndex = null; // Will be set in establish()

        this.endpoint = endpoint;
        this.socket = null;
        this.isConnected = false;
        this.reconnectDelay = 5000;
        this.reconnectAttempts = 0;
    }

    _readAuthIndex() {
        // Read from window.chrome._contextId (set by index.html via postMessage from parent page)
        const contextId = window.chrome?._contextId;
        const authIndex = contextId !== undefined ? contextId : -1;

        // Validate authIndex: must be >= 0 and not NaN for multi-context architecture
        if (Number.isNaN(authIndex) || !Number.isInteger(authIndex) || authIndex < 0) {
            const errorMsg = `❌ FATAL: Invalid authIndex (${authIndex}). window.chrome._contextId not set.`;
            console.error(errorMsg);
            throw new Error(errorMsg);
        }

        Logger.debug(`✅ Read authIndex from window.chrome._contextId: ${authIndex}`);
        return authIndex;
    }

    async establish() {
        if (this.isConnected) return Promise.resolve();

        // Read authIndex on first connection attempt (deferred from constructor)
        if (this.authIndex === null) {
            this.authIndex = this._readAuthIndex();
            Logger.debug(`Detected authIndex: ${this.authIndex}`);
        }

        // Add authIndex to WebSocket URL for server-side identification
        const wsUrl = this.authIndex >= 0 ? `${this.endpoint}?authIndex=${this.authIndex}` : this.endpoint;
        Logger.output("Connecting to server:", wsUrl);
        return new Promise((resolve, reject) => {
            try {
                this.socket = new WebSocket(wsUrl);
                this.socket.addEventListener("open", () => {
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    Logger.output("✅ Connection successful!");
                    this.dispatchEvent(new CustomEvent("connected"));
                    resolve();
                });
                this.socket.addEventListener("close", () => {
                    this.isConnected = false;
                    Logger.output("❌ Connection disconnected, preparing to reconnect...");
                    this.dispatchEvent(new CustomEvent("disconnected"));
                    this._scheduleReconnect();
                });
                this.socket.addEventListener("error", error => {
                    Logger.output(" WebSocket connection error:", error);
                    this.dispatchEvent(new CustomEvent("error", { detail: error }));
                    if (!this.isConnected) reject(error);
                });
                this.socket.addEventListener("message", event => {
                    this.dispatchEvent(new CustomEvent("message", { detail: event.data }));
                });
            } catch (e) {
                Logger.output(
                    "WebSocket initialization failed. Please check address or browser security policy.",
                    e.message
                );
                reject(e);
            }
        });
    }

    transmit(data) {
        if (!this.isConnected || !this.socket) {
            Logger.output("Cannot send data: Connection not established");
            return false;
        }
        this.socket.send(JSON.stringify(data));
        return true;
    }

    _scheduleReconnect() {
        this.reconnectAttempts++;
        setTimeout(() => {
            Logger.output(`Attempting reconnection ${this.reconnectAttempts} attempt...`);
            this.establish().catch(() => {});
        }, this.reconnectDelay);
    }
}

class RequestProcessor {
    constructor() {
        this.activeOperations = new Map();
        this.cancelledOperations = new Set();
        // [BrowserManager Injection Point] Do not modify the line below.
        // This line is dynamically replaced by BrowserManager.js based on TARGET_DOMAIN environment variable.
        this.targetDomain = "generativelanguage.googleapis.com";
    }

    execute(requestSpec, operationId) {
        const IDLE_TIMEOUT_DURATION = 300000; // 300 seconds (5 minutes)
        const abortController = new AbortController();
        this.activeOperations.set(operationId, abortController);

        let timeoutId = null;

        const startIdleTimeout = () =>
            new Promise((_, reject) => {
                timeoutId = setTimeout(() => {
                    const error = new Error(
                        `Timeout: ${IDLE_TIMEOUT_DURATION / 1000} seconds without receiving any data`
                    );
                    abortController.abort();
                    reject(error);
                }, IDLE_TIMEOUT_DURATION);
            });

        const cancelTimeout = () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
                // Logger.output("Data chunk received, timeout restriction lifted.");
            }
        };

        const attemptPromise = (async () => {
            try {
                Logger.debug(`Executing request:`, requestSpec.method, requestSpec.path);

                const requestUrl = this._constructUrl(requestSpec);
                const requestConfig = this._buildRequestConfig(requestSpec, abortController.signal);

                const response = await fetch(requestUrl, requestConfig);

                if (!response.ok) {
                    const errorBody = await response.text();
                    const error = new Error(
                        `Google API returned error: ${response.status} ${response.statusText} ${errorBody}`
                    );
                    error.status = response.status;
                    throw error;
                }
                return response;
            } catch (error) {
                cancelTimeout();
                throw error;
            }
        })();

        const responsePromise = Promise.race([attemptPromise, startIdleTimeout()]);

        return { cancelTimeout, responsePromise };
    }

    cancelAllOperations() {
        this.activeOperations.forEach(controller => controller.abort());
        this.activeOperations.clear();
    }

    _constructUrl(requestSpec) {
        let pathAndQuery = requestSpec.url;

        if (!pathAndQuery) {
            const pathSegment = requestSpec.path || "";
            const queryParams = new URLSearchParams(requestSpec.query_params);

            // Handle fake streaming mode adjustments
            if (requestSpec.streaming_mode === "fake") {
                if (queryParams.has("alt") && queryParams.get("alt") === "sse") {
                    queryParams.delete("alt");
                }
            }

            // Special handling for legacy path construction if url not provided
            let finalPath = pathSegment;
            if (requestSpec.streaming_mode === "fake" && finalPath.includes(":streamGenerateContent")) {
                finalPath = finalPath.replace(":streamGenerateContent", ":generateContent");
            }

            const queryString = queryParams.toString();
            pathAndQuery = `${finalPath}${queryString ? "?" + queryString : ""}`;
        }

        // Rewriting absolute URLs (if provided)
        if (pathAndQuery.match(/^https?:\/\//)) {
            try {
                const urlObj = new URL(pathAndQuery);
                const originalUrl = pathAndQuery;
                pathAndQuery = urlObj.pathname + urlObj.search;
                Logger.output(`Rewriting absolute URL: ${originalUrl} -> ${pathAndQuery}`);
            } catch (e) {
                Logger.output("URL parsing warning:", e.message);
            }
        }

        let targetHost = this.targetDomain;
        if (pathAndQuery.includes("__proxy_host__=")) {
            try {
                const tempUrl = new URL(pathAndQuery, "http://dummy");
                const params = tempUrl.searchParams;
                if (params.has("__proxy_host__")) {
                    targetHost = params.get("__proxy_host__");
                    params.delete("__proxy_host__");
                    pathAndQuery = tempUrl.pathname + tempUrl.search;
                    Logger.debug(`Dynamically switching target host: ${targetHost}`);
                }
            } catch (e) {
                Logger.output("Failed to parse proxy host:", e.message);
            }
        }

        let cleanPath = pathAndQuery.replace(/^\/+/, "");
        const method = requestSpec.method ? requestSpec.method.toUpperCase() : "GET";

        if (this.targetDomain.includes("generativelanguage")) {
            const versionRegex = /v1[a-z0-9]*\/files/;
            const uploadMatch = cleanPath.match(new RegExp(`upload/${versionRegex.source}`));

            if (uploadMatch) {
                // If path already contains upload/, just ensure it's correct
                const index = cleanPath.indexOf("upload/");
                if (index > 0) {
                    const fixedPath = cleanPath.substring(index);
                    Logger.output(`Corrected path: ${cleanPath} -> ${fixedPath}`);
                    cleanPath = fixedPath;
                }
            } else if (method === "POST") {
                // Detect if it starts with version and 'files', e.g. v1beta/files
                const filesPathMatch = cleanPath.match(new RegExp(`^${versionRegex.source}`));
                if (filesPathMatch) {
                    cleanPath = "upload/" + cleanPath;
                    Logger.output("Auto-completing upload path:", cleanPath);
                }
            }
        }

        const finalUrl = `https://${targetHost}/${cleanPath}`;
        Logger.debug(`Constructed URL: ${pathAndQuery} -> ${finalUrl}`);
        return finalUrl;
    }

    _buildRequestConfig(requestSpec, signal) {
        const config = {
            headers: this._sanitizeHeaders(requestSpec.headers),
            method: requestSpec.method,
            signal,
        };

        if (["POST", "PUT", "PATCH"].includes(requestSpec.method)) {
            if (!requestSpec.is_generative && requestSpec.body_b64) {
                const contentType = requestSpec.headers?.["content-type"] || "";
                config.body = b64toBlob(requestSpec.body_b64, contentType);
                Logger.output("Using binary body (Base64 decoded) for non-generative request");
            } else if (requestSpec.body) {
                try {
                    const bodyObj = JSON.parse(requestSpec.body);

                    // --- Module 1: Image/Embedding/TTS Model Filtering ---
                    // These models do NOT support: tools, thinkingConfig, systemInstruction, response_mime_type
                    const isImageModel = requestSpec.path.includes("-image") || requestSpec.path.includes("imagen");
                    const isEmbeddingModel = requestSpec.path.includes("embedding");
                    const isTtsModel = requestSpec.path.includes("tts");
                    if (isImageModel || isEmbeddingModel || isTtsModel) {
                        // Remove tools
                        const incompatibleKeys = ["toolConfig", "tool_config", "toolChoice", "tools"];
                        incompatibleKeys.forEach(key => {
                            if (Object.prototype.hasOwnProperty.call(bodyObj, key)) delete bodyObj[key];
                        });
                        // Remove thinkingConfig
                        if (bodyObj.generationConfig?.thinkingConfig) {
                            delete bodyObj.generationConfig.thinkingConfig;
                        }
                        // Remove systemInstruction
                        if (bodyObj.systemInstruction) {
                            delete bodyObj.systemInstruction;
                        }
                        // Remove response_mime_type
                        if (bodyObj.generationConfig?.response_mime_type) {
                            delete bodyObj.generationConfig.response_mime_type;
                        }
                        if (bodyObj.generationConfig?.responseMimeType) {
                            delete bodyObj.generationConfig.responseMimeType;
                        }
                    }

                    // --- Module 1.5: responseModalities Handling ---
                    // Image: keep as-is (needed for image generation)
                    // Embedding: remove
                    // TTS: force to ["AUDIO"]
                    if (isTtsModel) {
                        if (!bodyObj.generationConfig) {
                            bodyObj.generationConfig = {};
                        }
                        bodyObj.generationConfig.responseModalities = ["AUDIO"];
                        Logger.output("TTS model detected, setting responseModalities to AUDIO");
                    } else if (isEmbeddingModel) {
                        if (bodyObj.generationConfig?.responseModalities) {
                            delete bodyObj.generationConfig.responseModalities;
                        }
                    }

                    // --- Module 2: Computer-Use Model Filtering ---
                    // Remove tools, responseModalities
                    const isComputerUseModel = requestSpec.path.includes("computer-use");
                    if (isComputerUseModel) {
                        const incompatibleKeys = ["tool_config", "toolChoice", "tools"];
                        incompatibleKeys.forEach(key => {
                            if (Object.prototype.hasOwnProperty.call(bodyObj, key)) delete bodyObj[key];
                        });
                        if (bodyObj.generationConfig?.responseModalities) {
                            delete bodyObj.generationConfig.responseModalities;
                        }
                    }

                    // --- Module 3: Robotics Model Filtering ---
                    // Remove googleSearch, urlContext from tools; also remove responseModalities
                    const isRoboticsModel = requestSpec.path.includes("robotics");
                    if (isRoboticsModel) {
                        if (Array.isArray(bodyObj.tools)) {
                            bodyObj.tools = bodyObj.tools.filter(t => !t.googleSearch && !t.urlContext);
                            if (bodyObj.tools.length === 0) delete bodyObj.tools;
                        }
                        if (bodyObj.generationConfig?.responseModalities) {
                            delete bodyObj.generationConfig.responseModalities;
                        }
                    }

                    // --- Module 4: Gemini 2 JSON Mode Tool Filtering ---
                    // If model starts with gemini-2 and response format is JSON, remove tools/toolConfig
                    // This prevents 400 errors as some Gemini 2 variants don't support combined Tool + Structured Output
                    const isGemini2 = requestSpec.path.match(/\/models\/gemini-2/);
                    const isJsonMode =
                        bodyObj.generationConfig?.responseMimeType === "application/json" ||
                        bodyObj.generationConfig?.response_mime_type === "application/json";

                    if (isGemini2 && isJsonMode) {
                        const incompatibleKeys = ["toolConfig", "tool_config", "toolChoice", "tools"];
                        let keysRemoved = 0;
                        incompatibleKeys.forEach(key => {
                            if (Object.prototype.hasOwnProperty.call(bodyObj, key)) {
                                delete bodyObj[key];
                                keysRemoved++;
                            }
                        });
                        if (keysRemoved > 0) {
                            Logger.output(
                                `Gemini 2/2.5 + JSON mode detected, automatically filtering tool parameter to prevent API error`
                            );
                        }
                    }

                    // adapt gemini 3 pro preview
                    // if raise `400 INVALID_ARGUMENT`, try to delete `thinkingLevel`
                    // if (bodyObj.generationConfig?.thinkingConfig?.thinkingLevel) {
                    //     delete bodyObj.generationConfig.thinkingConfig.thinkingLevel;
                    // }

                    // upper case `thinkingLevel`
                    if (bodyObj.generationConfig?.thinkingConfig?.thinkingLevel) {
                        bodyObj.generationConfig.thinkingConfig.thinkingLevel = String(
                            bodyObj.generationConfig.thinkingConfig.thinkingLevel
                        ).toUpperCase();
                    }

                    // upper case `responseModalities`
                    if (bodyObj.generationConfig?.responseModalities) {
                        if (Array.isArray(bodyObj.generationConfig.responseModalities)) {
                            bodyObj.generationConfig.responseModalities =
                                bodyObj.generationConfig.responseModalities.map(m =>
                                    typeof m === "string" ? m.toUpperCase() : m
                                );
                        } else if (typeof bodyObj.generationConfig.responseModalities === "string") {
                            bodyObj.generationConfig.responseModalities = [
                                bodyObj.generationConfig.responseModalities.toUpperCase(),
                            ];
                        }
                    }

                    // if raise `400 INVALID_ARGUMENT`, try to delete `thoughtSignature`
                    // if (Array.isArray(bodyObj.contents)) {
                    //     bodyObj.contents.forEach(msg => {
                    //         if (Array.isArray(msg.parts)) {
                    //             msg.parts.forEach(part => {
                    //                 if (part.thoughtSignature) {
                    //                     delete part.thoughtSignature;
                    //                 }
                    //             });
                    //         }
                    //     });
                    // }

                    config.body = JSON.stringify(bodyObj);
                } catch (e) {
                    Logger.output("Error occurred while processing request body:", e.message);
                    config.body = requestSpec.body;
                }
            }
        }

        return config;
    }

    _sanitizeHeaders(headers) {
        const sanitized = { ...headers };
        // Follow BuildProxy's forbidden list exactly
        const forbiddenHeaders = [
            "host",
            "connection",
            "content-length",
            "origin",
            "referer",
            "user-agent",
            "sec-fetch-mode",
            "sec-fetch-site",
            "sec-fetch-dest",
        ];

        forbiddenHeaders.forEach(h => delete sanitized[h]);
        return sanitized;
    }

    cancelOperation(operationId) {
        this.cancelledOperations.add(operationId); // Core: Add ID to cancelled set
        const controller = this.activeOperations.get(operationId);
        if (controller) {
            Logger.output(`Received cancel instruction, aborting operation #${operationId}...`);
            controller.abort();
        }
    }
}

class ProxySystem extends EventTarget {
    constructor(websocketEndpoint) {
        super();
        this.connectionManager = new ConnectionManager(websocketEndpoint);
        this.requestProcessor = new RequestProcessor();
        this._setupEventHandlers();
    }

    async initialize() {
        Logger.output("System initializing...");
        try {
            await this.connectionManager.establish();
            Logger.output("System initialization complete, waiting for server instructions...");
            this.dispatchEvent(new CustomEvent("ready"));
        } catch (error) {
            Logger.output("System initialization failed:", error.message);
            this.dispatchEvent(new CustomEvent("error", { detail: error }));
            throw error;
        }
    }

    _setupEventHandlers() {
        this.connectionManager.addEventListener("message", e => this._handleIncomingMessage(e.detail));
        this.connectionManager.addEventListener("disconnected", () => this.requestProcessor.cancelAllOperations());
    }

    async _handleIncomingMessage(messageData) {
        let requestSpec = {};
        try {
            requestSpec = JSON.parse(messageData);

            // --- Core modification: Dispatch tasks based on event_type ---
            switch (requestSpec.event_type) {
                case "cancel_request":
                    // If it's a cancel instruction, call the cancel method
                    this.requestProcessor.cancelOperation(requestSpec.request_id);
                    break;
                case "set_log_level":
                    // Dynamic log level adjustment at runtime
                    if (Logger.LEVELS[requestSpec.level] !== undefined) {
                        const oldLevel = Object.keys(Logger.LEVELS).find(k => Logger.LEVELS[k] === Logger.currentLevel);
                        Logger.currentLevel = Logger.LEVELS[requestSpec.level];
                        Logger.info(`Log level changed: ${oldLevel} -> ${requestSpec.level}`);
                    } else {
                        Logger.warn(`Invalid log level: ${requestSpec.level}`);
                    }
                    break;
                default:
                    // Default case, treat as proxy request
                    // [Final Optimization] Display path directly, no longer display mode as path itself is clear enough
                    Logger.output(`Received request: ${requestSpec.method} ${requestSpec.path}`);

                    await this._processProxyRequest(requestSpec);
                    break;
            }
        } catch (error) {
            Logger.output("Message processing error:", error.message);
            // Only send error response when an error occurs during proxy request processing
            if (requestSpec.request_id && requestSpec.event_type !== "cancel_request") {
                this._sendErrorResponse(error, requestSpec.request_id);
            }
        }
    }

    async _processProxyRequest(requestSpec) {
        const operationId = requestSpec.request_id;
        const mode = requestSpec.streaming_mode || "fake";
        Logger.debug(`Browser received request`);
        let cancelTimeout;

        try {
            if (this.requestProcessor.cancelledOperations.has(operationId)) {
                throw new DOMException("The user aborted a request.", "AbortError");
            }
            const { responsePromise, cancelTimeout: ct } = this.requestProcessor.execute(requestSpec, operationId);
            cancelTimeout = ct;
            const response = await responsePromise;
            if (this.requestProcessor.cancelledOperations.has(operationId)) {
                throw new DOMException("The user aborted a request.", "AbortError");
            }

            this._transmitHeaders(response, operationId, requestSpec.headers?.host);
            const reader = response.body.getReader();
            const textDecoder = new TextDecoder();

            let fullBody = "";

            // --- Core modification: Correctly dispatch streaming and non-streaming data inside the loop ---
            // Add timeout protection for each chunk read
            const CHUNK_READ_TIMEOUT = 300000; // 300 seconds (5 minutes) timeout for each chunk
            let processing = true;
            while (processing) {
                // Wrap reader.read() with timeout protection
                const readPromise = reader.read();
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => {
                        reject(
                            new Error(`Chunk read timeout: no data received for ${CHUNK_READ_TIMEOUT / 1000} seconds`)
                        );
                    }, CHUNK_READ_TIMEOUT);
                });

                const { done, value } = await Promise.race([readPromise, timeoutPromise]);
                if (done) {
                    processing = false;
                    break;
                }

                cancelTimeout();

                const chunk = textDecoder.decode(value, { stream: true });
                if (mode === "real") {
                    this._transmitChunk(chunk, operationId);
                } else {
                    fullBody += chunk;
                }
            }

            Logger.output("Data stream read complete.");

            if (mode === "fake") {
                // In non-streaming mode, after loop ends, forward the concatenated complete response body
                this._transmitChunk(fullBody, operationId);
            }

            this._transmitStreamEnd(operationId);
        } catch (error) {
            if (error.name === "AbortError") {
                Logger.output(`[Diagnosis] Operation #${operationId} has been aborted by user.`);
            } else {
                Logger.output(`❌ Request processing failed: ${error.message}`);
            }
            this._sendErrorResponse(error, operationId);
        } finally {
            if (cancelTimeout) {
                cancelTimeout();
            }
            this.requestProcessor.activeOperations.delete(operationId);
            this.requestProcessor.cancelledOperations.delete(operationId);
        }
    }

    _transmitHeaders(response, operationId, proxyHost) {
        const headerMap = {};
        response.headers.forEach((v, k) => {
            const lowerKey = k.toLowerCase();
            if ((lowerKey === "location" || lowerKey === "x-goog-upload-url") && v.includes("googleapis.com")) {
                try {
                    const urlObj = new URL(v);
                    const host = proxyHost || location.host;
                    const separator = urlObj.search ? "&" : "?";
                    const newSearch = `${urlObj.search}${separator}__proxy_host__=${urlObj.host}`;
                    const newUrl = `${location.protocol}//${host}${urlObj.pathname}${newSearch}`;
                    headerMap[k] = newUrl;
                    Logger.debug(`Rewriting header ${k}: ${v} -> ${headerMap[k]}`);
                } catch (e) {
                    headerMap[k] = v;
                }
            } else {
                headerMap[k] = v;
            }
        });
        this.connectionManager.transmit({
            event_type: "response_headers",
            headers: headerMap,
            request_id: operationId,
            status: response.status,
        });
    }

    _transmitChunk(data, operationId) {
        if (!data) return;
        this.connectionManager.transmit({
            data,
            event_type: "chunk",
            request_id: operationId,
        });
    }

    _transmitStreamEnd(operationId) {
        this.connectionManager.transmit({
            event_type: "stream_close",
            request_id: operationId,
        });
        Logger.output("Task completed, stream end signal sent");
    }

    _sendErrorResponse(error, operationId) {
        if (!operationId) return;
        this.connectionManager.transmit({
            event_type: "error",
            message: `Proxy browser error: ${error.message || "Unknown error"}`,
            request_id: operationId,
            status: error.status || 504,
        });
        // --- Core modification: Use different log wording based on error type ---
        if (error.name === "AbortError") {
            Logger.output("Sent 'abort' status back to server");
        } else {
            Logger.output("Sent 'error' information back to server");
        }
    }
}

const initializeProxySystem = async () => {
    // Clean up old logs
    document.body.innerHTML = "";

    // Wait for authIndex from parent via postMessage (promise set up in index.html)
    // Timeout fallback: if parent doesn't respond within 10s, throw fatal error
    if (window.__authIndexReady) {
        const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("authIndex postMessage timeout (10s)")), 10000)
        );
        try {
            const authIndex = await Promise.race([window.__authIndexReady, timeout]);
            Logger.output(`✅ authIndex received from parent: ${authIndex}`);
        } catch (error) {
            Logger.error(`❌ Failed to get authIndex: ${error.message}`);
            throw error;
        }
    }

    try {
        const proxySystem = new ProxySystem();
        await proxySystem.initialize();
    } catch (error) {
        console.error("Proxy system startup failed:", error);
        Logger.output("Proxy system startup failed:", error.message);
    }
};

initializeProxySystem();

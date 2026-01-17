/**
 * File: scripts/client/build.js
 * Description: Client-side browser script (圈内人称「build 反代」) that runs in the headless browser to proxy API requests through WebSocket
 *
 * Author: Ellinav
 */

/* eslint-env browser */

const Logger = {
    enabled: true,
    output(...messages) {
        if (!this.enabled) return;
        const timestamp =
            new Date().toLocaleTimeString("zh-CN", { hour12: false }) +
            "." +
            new Date().getMilliseconds().toString().padStart(3, "0");
        console.log(`[ProxyClient] ${timestamp}`, ...messages);
        const logElement = document.createElement("div");
        logElement.textContent = `[${timestamp}] ${messages.join(" ")}`;
        document.body.appendChild(logElement);
    },
};

class ConnectionManager extends EventTarget {
    // [BrowserManager Injection Point] Do not modify the line below.
    // This line is dynamically replaced by BrowserManager.js based on WS_PORT environment variable.
    constructor(endpoint = "ws://127.0.0.1:9998") {
        super();
        this.endpoint = endpoint;
        this.socket = null;
        this.isConnected = false;
        this.reconnectDelay = 5000;
        this.reconnectAttempts = 0;
    }

    async establish() {
        if (this.isConnected) return Promise.resolve();
        Logger.output("Connecting to server:", this.endpoint);
        return new Promise((resolve, reject) => {
            try {
                this.socket = new WebSocket(this.endpoint);
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
        const IDLE_TIMEOUT_DURATION = 600000;
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
                Logger.output(`Executing request:`, requestSpec.method, requestSpec.path);

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
        let pathSegment = requestSpec.path.startsWith("/") ? requestSpec.path.substring(1) : requestSpec.path;
        const queryParams = new URLSearchParams(requestSpec.query_params);
        if (requestSpec.streaming_mode === "fake") {
            Logger.output("Buffered mode activated (Non-Stream / Fake-Stream), checking request details...");
            if (pathSegment.includes(":streamGenerateContent")) {
                pathSegment = pathSegment.replace(":streamGenerateContent", ":generateContent");
                Logger.output(`API path modified to: ${pathSegment}`);
            }
            if (queryParams.has("alt") && queryParams.get("alt") === "sse") {
                queryParams.delete("alt");
                Logger.output('Removed "alt=sse" query parameter.');
            }
        }
        const queryString = queryParams.toString();
        return `https://${this.targetDomain}/${pathSegment}${queryString ? "?" + queryString : ""}`;
    }

    _generateRandomString(length) {
        const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
        let result = "";
        for (let i = 0; i < length; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
        return result;
    }

    _buildRequestConfig(requestSpec, signal) {
        const config = {
            headers: this._sanitizeHeaders(requestSpec.headers),
            method: requestSpec.method,
            signal,
        };

        if (["POST", "PUT", "PATCH"].includes(requestSpec.method) && requestSpec.body) {
            try {
                const bodyObj = JSON.parse(requestSpec.body);

                // --- Module 1: Image/Embedding/TTS Model Filtering ---
                // These models do NOT support: tools, thinkingConfig, systemInstruction, response_mime_type
                const isImageModel = requestSpec.path.includes("-image") || requestSpec.path.includes("imagen");
                const isEmbeddingModel = requestSpec.path.includes("embedding");
                const isTtsModel = requestSpec.path.includes("tts");
                if (isImageModel || isEmbeddingModel || isTtsModel) {
                    // Remove tools
                    const incompatibleKeys = ["tool_config", "toolChoice", "tools"];
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

        return config;
    }

    _sanitizeHeaders(headers) {
        const sanitized = { ...headers };
        [
            "host",
            "connection",
            "content-length",
            "origin",
            "referer",
            "user-agent",
            "sec-fetch-mode",
            "sec-fetch-site",
            "sec-fetch-dest",
        ].forEach(h => delete sanitized[h]);
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
} // <--- Critical! Ensure this bracket exists

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

    // In v3.4-black-browser.js
    // [Final Weapon - Canvas Soul Extraction] Replace entire _processProxyRequest function
    async _processProxyRequest(requestSpec) {
        const operationId = requestSpec.request_id;
        const mode = requestSpec.streaming_mode || "fake";
        Logger.output(`Browser received request`);
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

            this._transmitHeaders(response, operationId);
            const reader = response.body.getReader();
            const textDecoder = new TextDecoder();
            let fullBody = "";

            // --- Core modification: Correctly dispatch streaming and non-streaming data inside the loop ---
            let processing = true;
            while (processing) {
                const { done, value } = await reader.read();
                if (done) {
                    processing = false;
                    break;
                }

                cancelTimeout();

                const chunk = textDecoder.decode(value, { stream: true });

                if (mode === "real") {
                    // Streaming mode: immediately forward each data chunk
                    this._transmitChunk(chunk, operationId);
                } else {
                    // fake mode
                    // Non-streaming mode: concatenate data chunks, wait to forward all at once at the end
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

    _transmitHeaders(response, operationId) {
        const headerMap = {};
        response.headers.forEach((v, k) => {
            headerMap[k] = v;
        });
        this.connectionManager.transmit({
            event_type: "response_headers",
            headers: headerMap,
            request_id: operationId,
            status: response.status,
        });
    }

    _transmitChunk(chunk, operationId) {
        if (!chunk) return;
        this.connectionManager.transmit({
            data: chunk,
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
    const proxySystem = new ProxySystem();
    try {
        await proxySystem.initialize();
    } catch (error) {
        console.error("Proxy system startup failed:", error);
        Logger.output("Proxy system startup failed:", error.message);
    }
};

initializeProxySystem();

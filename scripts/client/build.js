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

// [Files API Support] Helper to convert Base64 to Blob
function b64toBlob(b64Data, contentType = '', sliceSize = 512) {
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
}


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
            this.establish().catch(() => { });
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

        // [Files API Support] Dynamic Host Switching
        let targetHost = this.targetDomain;
        if (queryParams.has("__proxy_host__")) {
            targetHost = queryParams.get("__proxy_host__");
            queryParams.delete("__proxy_host__");
            Logger.output(`[Files API] Switching target host to: ${targetHost}`);
        }

        const queryString = queryParams.toString();
        return `https://${targetHost}/${pathSegment}${queryString ? "?" + queryString : ""}`;
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

        if (["POST", "PUT", "PATCH"].includes(requestSpec.method)) {
            // [Files API Support] Handle Blob body (converted from Base64)
            if (requestSpec.body instanceof Blob) {
                config.body = requestSpec.body;
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

    // [Files API Support] Store current proxy host
    get currentProxyHost() {
        return this._currentProxyHost;
    }
    set currentProxyHost(host) {
        this._currentProxyHost = host;
    }

    async _handleIncomingMessage(messageData) {
        let requestSpec = {};
        try {
            requestSpec = JSON.parse(messageData);

            // --- Core modification: Dispatch tasks based on event_type ---
            switch (requestSpec.event_type) {
                case "cancel_request":
                    Logger.output(`[Debug] Received cancel_request for #${requestSpec.request_id}`);
                    // If it's a cancel instruction, call the cancel method
                    this.requestProcessor.cancelOperation(requestSpec.request_id);
                    break;
                default:
                    // Default case, treat as proxy request
                    // [Files API Support] Handle body_b64 conversion
                    Logger.output(`[Debug] Processing Proxy Request #${requestSpec.request_id || "unknown"}`);
                    if (requestSpec.body_b64) {
                        Logger.output(`[Debug] Found body_b64 (${requestSpec.body_b64.length} chars)`);
                        const contentType = requestSpec.headers?.['content-type'] || '';
                        requestSpec.body = b64toBlob(requestSpec.body_b64, contentType);
                        delete requestSpec.body_b64;
                        Logger.output("[Files API] Converted Base64 body to Blob.");
                    } else if (requestSpec.body) {
                        Logger.output(`[Debug] Found text body (${requestSpec.body.length} chars)`);
                    } else {
                        Logger.output(`[Debug] No body found`);
                    }

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

        // [Files API Support] Capture Proxy Host from headers
        if (requestSpec.headers) {
            const hostKey = Object.keys(requestSpec.headers).find(k => k.toLowerCase() === 'host');
            if (hostKey) {
                this.currentProxyHost = requestSpec.headers[hostKey];
            }
        }

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
            // [Files API Support] Rewrite x-goog-upload-url and location to include __proxy_host__
            // This is critical for the second step of the upload process (PUT to storage.googleapis.com)
            const lowerKey = k.toLowerCase();
            if ((lowerKey === 'location' || lowerKey === 'x-goog-upload-url') && v.includes('googleapis.com')) {
                try {
                    const urlObj = new URL(v);
                    // Use the current proxy host (which this script is running on via websocket) if we knew it?
                    // Actually, the server will rewrite the domain part.
                    // We just need to ensure the __proxy_host__ param is added so the server knows where to route next.

                    // Important: The SERVER (RequestHandler/ProxySystem) handles the domain rewrite to localhost.
                    // BUT, we need to inject the original host into the query params so the server can put it back
                    // when the next request comes in.

                    // Wait, in BuildProxy's cloud-server, it modifies the URL value directly and sends it back.
                    // Here, we are sending headers back to the local server via WebSocket.

                    // In BuildProxy implementation: 
                    // headerMap[key] = newUrl; (Logic: http://127.0.0.1:8889/...&__proxy_host__=storage...)

                    // However, AIStudioToAPI's RequestHandler doesn't seem to have the logic yet to rewrite 
                    // response headers returned from the browser (ConnectionRegistry checks for message type response_headers).
                    // Let's check ProxySystem/RequestHandler again? 
                    // RequestHandler._setResponseHeaders just copies them.

                    // So we must do the rewriting HERE in the browser, assuming we know the proxy address?
                    // OR we send the original Google URL, and the RequestHandler rewrites it?
                    // In BuildProxy, local-server.cjs rewrites it partially?
                    // No, BuildProxy local-server.cjs line 319: checks x-goog-upload-url and rewrites it to localhost
                    // taking path from originalUrl. 
                    // BUT it doesn't seem to add __proxy_host__ there.

                    // Let's re-read BuildProxy cloud-client.tsx carefully.
                    // Line 338: const newSearch = `${urlObj.search}${separator}__proxy_host__=${urlObj.host}`;
                    // Line 340: const newUrl = `http://${host}${urlObj.pathname}${newSearch}`;
                    // So the browser script does the full rewrite!

                    // Problem: This script doesn't know the user's Local Proxy IP/Port easily. 
                    // BuildProxy defaults to 127.0.0.1:8889.
                    // Ideally, we shouldn't hardcode it.

                    // Alternative: Just append `__proxy_host__` to the search params of the Google URL, 
                    // and let the RequestHandler (server-side) do the domain rewrite to localhost.
                    // The RequestHandler runs on the local server, so it knows its own address.

                    // Let's modify the plan slightly:
                    // 1. Browser: Append `__proxy_host__=<real_host>` to any googleapis URL in location/upload-url.
                    // 2. Browser: Leave the domain as googleapis.com for now? 
                    // If we leave it as googleapis.com, the client (using the proxy) might try to connect to google directly?
                    // Yes, the client needs a localhost URL.

                    // So RequestHandler MUST rewrite the domain to localhost.
                    // If Browser appends `__proxy_host__`, RequestHandler will see: `https://storage.googleapis.com/...?__proxy_host__=storage...`
                    // RequestHandler needs to change `https://storage.googleapis.com/...` to `http://localhost:port/...`.

                    // Let's check RequestHandler._setResponseHeaders again.
                    // It just does `res.set(name, value)`.

                    // So we DO need to modify RequestHandler to rewrite the domain.
                    // AND we need the Browser to append the `__proxy_host__`.

                    // Wait, better approach:
                    // Let the Browser rewrite the URL to a relative path / special format?
                    // Or follow BuildProxy: Browser does it all. 
                    // But Browser needs `proxyHost`.
                    // In BuildProxy, cloud-client.tsx receives `proxyHost` from the request headers (Host header) of the previous request!
                    // See line 458 in cloud-client.tsx: `if (hostKey) proxyHost = requestSpec.headers[hostKey];`

                    // We can implement that! 
                    // 1. Extract `Host` header in `_handleIncomingMessage` or `_processProxyRequest`.
                    // 2. Pass it to `_transmitHeaders`.

                    // Let's update `_processProxyRequest` to capture host first.

                    const separator = urlObj.search ? '&' : '?';
                    const newSearch = `${urlObj.search}${separator}__proxy_host__=${urlObj.host}`;

                    // We'll use a placeholder for now if we don't have the proxy host, 
                    // or we can rely on RequestHandler to fix the domain if we send a special marker.
                    // But implementing the "extract host" strategy is best.

                    // For now, let's inject the param. We'll update the domain to a placeholder 
                    // that RequestHandler can interpret or, if we implement the Host capture, use that.

                    // Let's assume we can get the host. 
                    // Accessing `this.currentProxyHost` (we need to store it).
                    const host = this.currentProxyHost || '127.0.0.1:8889';
                    const newUrl = `http://${host}${urlObj.pathname}${newSearch}`;
                    headerMap[k] = newUrl;

                    Logger.output(`[Files API] Rewrote ${k}: ${newUrl}`);
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

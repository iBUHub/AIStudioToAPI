/**
 * File: src/handlers/requestHandler.js
 * Description: Main request handler that processes API requests, manages retries, and coordinates between authentication and format conversion
 *
 * Maintainers: iBenzene, bbbugg
 * Original Author: Ellinav
 */

/**
 * Request Handler Module (Refactored)
 * Main request handler that coordinates between other modules
 */
const AuthSwitcher = require("../auth/authSwitcher");
const FormatConverter = require("./formatConverter");

class RequestHandler {
    constructor(
        serverSystem,
        connectionRegistry,
        logger,
        browserManager,
        config,
        authSource
    ) {
        this.serverSystem = serverSystem;
        this.connectionRegistry = connectionRegistry;
        this.logger = logger;
        this.browserManager = browserManager;
        this.config = config;
        this.authSource = authSource;

        // Initialize sub-modules
        this.authSwitcher = new AuthSwitcher(logger, config, authSource, browserManager);
        this.formatConverter = new FormatConverter(logger, serverSystem);

        this.maxRetries = this.config.maxRetries;
        this.retryDelay = this.config.retryDelay;
        this.needsSwitchingAfterRequest = false;
    }

    // Delegate properties to AuthSwitcher
    get currentAuthIndex() {
        return this.authSwitcher.currentAuthIndex;
    }

    get failureCount() {
        return this.authSwitcher.failureCount;
    }

    get usageCount() {
        return this.authSwitcher.usageCount;
    }

    get isSystemBusy() {
        return this.authSwitcher.isSystemBusy;
    }

    // Process standard Google API requests
    async processRequest(req, res) {
        const requestId = this._generateRequestId();

        res.on("close", () => {
            if (!res.writableEnded) {
                this.logger.warn(
                    `[Request] Client closed request #${requestId} connection prematurely.`
                );
                this._cancelBrowserRequest(requestId);
            }
        });

        // Check browser connection
        if (!this.connectionRegistry.hasActiveConnections()) {
            if (this.authSwitcher.isSystemBusy) {
                this.logger.warn(
                    "[System] Connection disconnection detected, but system is switching/recovering, rejecting new request."
                );
                return this._sendErrorResponse(
                    res,
                    503,
                    "Server undergoing internal maintenance (account switching/recovery), please try again later."
                );
            }

            this.logger.error(
                "❌ [System] Browser WebSocket connection disconnected! Possible process crash. Attempting recovery..."
            );
            this.authSwitcher.isSystemBusy = true;
            try {
                await this.browserManager.launchOrSwitchContext(this.currentAuthIndex);
                this.logger.info(`✅ [System] Browser successfully recovered!`);
            } catch (error) {
                this.logger.error(`❌ [System] Browser auto-recovery failed: ${error.message}`);
                return this._sendErrorResponse(
                    res,
                    503,
                    "Service temporarily unavailable: Backend browser instance crashed and cannot auto-recover, please contact administrator."
                );
            } finally {
                this.authSwitcher.isSystemBusy = false;
            }
        }

        if (this.authSwitcher.isSystemBusy) {
            this.logger.warn(
                "[System] Received new request, but system is switching/recovering, rejecting new request."
            );
            return this._sendErrorResponse(
                res,
                503,
                "Server undergoing internal maintenance (account switching/recovery), please try again later."
            );
        }

        // Handle usage-based account switching
        const isGenerativeRequest
            = req.method === "POST"
            && (req.path.includes("generateContent")
                || req.path.includes("streamGenerateContent"));

        if (isGenerativeRequest) {
            const usageCount = this.authSwitcher.incrementUsageCount();
            if (usageCount > 0) {
                this.logger.info(
                    `[Request] Generation request - account rotation count: ${usageCount}/${this.config.switchOnUses} (Current account: ${this.currentAuthIndex})`
                );
                if (this.authSwitcher.shouldSwitchByUsage()) {
                    this.needsSwitchingAfterRequest = true;
                }
            }
        }

        const proxyRequest = this._buildProxyRequest(req, requestId);
        proxyRequest.is_generative = isGenerativeRequest;
        const messageQueue = this.connectionRegistry.createMessageQueue(requestId);

        const wantsStreamByHeader
            = req.headers.accept && req.headers.accept.includes("text/event-stream");
        const wantsStreamByPath = req.path.includes(":streamGenerateContent");
        const wantsStream = wantsStreamByHeader || wantsStreamByPath;

        try {
            if (wantsStream) {
                this.logger.info(
                    `[Request] Client enabled streaming (${this.serverSystem.streamingMode}), entering streaming processing mode...`
                );
                if (this.serverSystem.streamingMode === "fake") {
                    await this._handlePseudoStreamResponse(
                        proxyRequest,
                        messageQueue,
                        req,
                        res
                    );
                } else {
                    await this._handleRealStreamResponse(proxyRequest, messageQueue, res);
                }
            } else {
                proxyRequest.streaming_mode = "fake";
                await this._handleNonStreamResponse(proxyRequest, messageQueue, res);
            }
        } catch (error) {
            this._handleRequestError(error, res);
        } finally {
            this.connectionRegistry.removeMessageQueue(requestId);
            if (this.needsSwitchingAfterRequest) {
                this.logger.info(
                    `[Auth] Rotation count reached switching threshold (${this.authSwitcher.usageCount}/${this.config.switchOnUses}), will automatically switch account in background...`
                );
                this.authSwitcher.switchToNextAuth().catch(err => {
                    this.logger.error(`[Auth] Background account switching task failed: ${err.message}`);
                });
                this.needsSwitchingAfterRequest = false;
            }
        }
    }

    // Process OpenAI format requests
    async processOpenAIRequest(req, res) {
        const requestId = this._generateRequestId();
        const isOpenAIStream = req.body.stream === true;
        const model = req.body.model || "gemini-2.5-flash-lite";
        const systemStreamMode = this.serverSystem.streamingMode;
        const useRealStream = isOpenAIStream && systemStreamMode === "real";

        // Handle usage counting
        const usageCount = this.authSwitcher.incrementUsageCount();
        if (usageCount > 0) {
            this.logger.info(
                `[Request] OpenAI generation request - account rotation count: ${usageCount}/${this.config.switchOnUses} (Current account: ${this.currentAuthIndex})`
            );
            if (this.authSwitcher.shouldSwitchByUsage()) {
                this.needsSwitchingAfterRequest = true;
            }
        }

        // Translate OpenAI format to Google format
        let googleBody;
        try {
            googleBody = this.formatConverter.translateOpenAIToGoogle(req.body, model);
        } catch (error) {
            this.logger.error(`[Adapter] OpenAI request translation failed: ${error.message}`);
            return this._sendErrorResponse(
                res,
                400,
                "Invalid OpenAI request format."
            );
        }

        const googleEndpoint = useRealStream
            ? "streamGenerateContent"
            : "generateContent";
        const proxyRequest = {
            path: `/v1beta/models/${model}:${googleEndpoint}`,
            method: "POST",
            headers: { "Content-Type": "application/json" },
            query_params: useRealStream ? { alt: "sse" } : {},
            body: JSON.stringify(googleBody),
            request_id: requestId,
            is_generative: true,
            streaming_mode: useRealStream ? "real" : "fake",
        };

        const messageQueue = this.connectionRegistry.createMessageQueue(requestId);

        try {
            this._forwardRequest(proxyRequest);
            const initialMessage = await messageQueue.dequeue();

            if (initialMessage.event_type === "error") {
                this.logger.error(
                    `[Adapter] Received error from browser, will trigger switching logic. Status code: ${initialMessage.status}, message: ${initialMessage.message}`
                );
                await this.authSwitcher.handleRequestFailureAndSwitch(
                    initialMessage,
                    msg => this._sendErrorChunkToClient(res, msg)
                );
                if (isOpenAIStream) {
                    if (!res.writableEnded) {
                        res.write("data: [DONE]\n\n");
                        res.end();
                    }
                } else {
                    this._sendErrorResponse(
                        res,
                        initialMessage.status || 500,
                        initialMessage.message
                    );
                }
                return;
            }

            if (this.authSwitcher.failureCount > 0) {
                this.logger.info(
                    `✅ [Auth] OpenAI interface request successful - failure count reset from ${this.authSwitcher.failureCount} to 0`
                );
                this.authSwitcher.failureCount = 0;
            }

            if (isOpenAIStream) {
                res.status(200).set({
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    Connection: "keep-alive",
                });

                if (useRealStream) {
                    this.logger.info(`[Adapter] OpenAI streaming response (Real Mode) started...`);
                    await this._streamOpenAIResponse(messageQueue, res, model, requestId);
                } else {
                    this.logger.info(`[Adapter] OpenAI streaming response (Fake Mode) started...`);
                    let fullBody = "";
                    let streaming = true;
                    while (streaming) {
                        const message = await messageQueue.dequeue(300000);
                        if (message.type === "STREAM_END") {
                            streaming = false;
                            break;
                        }
                        if (message.data) fullBody += message.data;
                    }

                    const translatedChunk = this.formatConverter.translateGoogleToOpenAIStream(
                        fullBody,
                        model
                    );
                    if (translatedChunk) {
                        res.write(translatedChunk);
                    }
                    res.write("data: [DONE]\n\n");
                    this.logger.info("[Adapter] Fake mode: Complete content sent at once.");
                }
            } else {
                await this._sendOpenAINonStreamResponse(messageQueue, res, model);
            }
        } catch (error) {
            this._handleRequestError(error, res);
        } finally {
            this.connectionRegistry.removeMessageQueue(requestId);
            if (this.needsSwitchingAfterRequest) {
                this.logger.info(
                    `[Auth] Rotation count reached switching threshold, will automatically switch account in background...`
                );
                this.authSwitcher.switchToNextAuth().catch(err => {
                    this.logger.error(`[Auth] Background account switching task failed: ${err.message}`);
                });
                this.needsSwitchingAfterRequest = false;
            }
        }

        if (!res.writableEnded) res.end();
    }

    // === Response Handlers ===

    async _handlePseudoStreamResponse(proxyRequest, messageQueue, req, res) {
        this.logger.info("[Request] Entering pseudo-stream mode...");

        let connectionMaintainer;
        const scheduleNextKeepAlive = () => {
            const randomInterval = 12000 + Math.floor(Math.random() * 6000); // 12 - 18 seconds
            connectionMaintainer = setTimeout(() => {
                if (!res.headersSent) {
                    res.setHeader("Content-Type", "text/event-stream");
                    res.setHeader("Cache-Control", "no-cache");
                    res.setHeader("Connection", "keep-alive");
                }
                if (!res.writableEnded) {
                    res.write(": keep-alive\n\n");
                    scheduleNextKeepAlive();
                }
            }, randomInterval);
        };
        scheduleNextKeepAlive();

        try {
            this._forwardRequest(proxyRequest);
            let requestFailed = false;
            let lastMessage = null;

            for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
                lastMessage = await messageQueue.dequeue();

                if (lastMessage.event_type === "timeout") {
                    lastMessage = {
                        event_type: "error",
                        status: 504,
                        message: lastMessage.message,
                    };
                }

                if (lastMessage.event_type === "error") {
                    if (
                        !(
                            lastMessage.message
                            && lastMessage.message.includes("The user aborted a request")
                        )
                    ) {
                        this.logger.warn(
                            `[Request] Attempt #${attempt} failed: Received ${lastMessage.status || "unknown"
                            } error - ${lastMessage.message}`
                        );
                    }

                    if (attempt < this.maxRetries) {
                        await new Promise(resolve =>
                            setTimeout(resolve, this.retryDelay)
                        );
                        continue;
                    }
                    requestFailed = true;
                }
                break;
            }

            if (requestFailed) {
                if (
                    lastMessage.message
                    && lastMessage.message.includes("The user aborted a request")
                ) {
                    this.logger.info(
                        `[Request] Request #${proxyRequest.request_id} was properly cancelled by user, not counted in failure statistics.`
                    );
                } else {
                    this.logger.error(
                        `[Request] All ${this.maxRetries} retries failed, will be counted in failure statistics.`
                    );
                    await this.authSwitcher.handleRequestFailureAndSwitch(
                        lastMessage,
                        msg => this._sendErrorChunkToClient(res, msg)
                    );
                    this._sendErrorChunkToClient(
                        res,
                        `Request finally failed: ${lastMessage.message}`
                    );
                }
                return;
            }

            if (proxyRequest.is_generative && this.authSwitcher.failureCount > 0) {
                this.logger.info(
                    `✅ [Auth] Generation request successful - failure count reset from ${this.authSwitcher.failureCount} to 0`
                );
                this.authSwitcher.failureCount = 0;
            }

            const dataMessage = await messageQueue.dequeue();
            const endMessage = await messageQueue.dequeue();
            if (dataMessage.data) {
                res.write(`data: ${dataMessage.data}\n\n`);
            }
            if (endMessage.type !== "STREAM_END") {
                this.logger.warn("[Request] Expected stream end signal not received.");
            }

            try {
                const fullResponse = JSON.parse(dataMessage.data);
                const finishReason
                    = fullResponse.candidates?.[0]?.finishReason || "UNKNOWN";
                this.logger.info(
                    `✅ [Request] Response ended, reason: ${finishReason}, request ID: ${proxyRequest.request_id}`
                );
            } catch (e) {
                // Ignore errors when parsing finish reason
            }
            res.write("data: [DONE]\n\n");
        } catch (error) {
            this._handleRequestError(error, res);
        } finally {
            clearTimeout(connectionMaintainer);
            if (!res.writableEnded) {
                res.end();
            }
            this.logger.info(
                `[Request] Response processing ended, request ID: ${proxyRequest.request_id}`
            );
        }
    }

    async _handleRealStreamResponse(proxyRequest, messageQueue, res) {
        this.logger.info(`[Request] Request dispatched to browser for processing...`);
        this._forwardRequest(proxyRequest);
        const headerMessage = await messageQueue.dequeue();

        if (headerMessage.event_type === "error") {
            if (
                headerMessage.message
                && headerMessage.message.includes("The user aborted a request")
            ) {
                this.logger.info(
                    `[Request] Request #${proxyRequest.request_id} was properly cancelled by user, not counted in failure statistics.`
                );
            } else {
                this.logger.error(`[Request] Request failed, will be counted in failure statistics.`);
                await this.authSwitcher.handleRequestFailureAndSwitch(headerMessage, null);
                return this._sendErrorResponse(
                    res,
                    headerMessage.status,
                    headerMessage.message
                );
            }
            if (!res.writableEnded) res.end();
            return;
        }

        if (proxyRequest.is_generative && this.authSwitcher.failureCount > 0) {
            this.logger.info(
                `✅ [Auth] Generation request successful - failure count reset from ${this.authSwitcher.failureCount} to 0`
            );
            this.authSwitcher.failureCount = 0;
        }

        this._setResponseHeaders(res, headerMessage);
        this.logger.info("[Request] Starting streaming transmission...");
        try {
            let lastChunk = "";
            let streaming = true;
            while (streaming) {
                const dataMessage = await messageQueue.dequeue(30000);
                if (dataMessage.type === "STREAM_END") {
                    this.logger.info("[Request] Received stream end signal.");
                    streaming = false;
                    break;
                }
                if (dataMessage.data) {
                    res.write(dataMessage.data);
                    lastChunk = dataMessage.data;
                }
            }
            try {
                if (lastChunk.startsWith("data: ")) {
                    const jsonString = lastChunk.substring(6).trim();
                    if (jsonString) {
                        const lastResponse = JSON.parse(jsonString);
                        const finishReason
                            = lastResponse.candidates?.[0]?.finishReason || "UNKNOWN";
                        this.logger.info(
                            `✅ [Request] Response ended, reason: ${finishReason}, request ID: ${proxyRequest.request_id}`
                        );
                    }
                }
            } catch (e) {
                // Ignore JSON parsing errors for finish reason
            }
        } catch (error) {
            if (error.message !== "Queue timeout") throw error;
            this.logger.warn("[Request] Real stream response timeout, stream may have ended normally.");
        } finally {
            if (!res.writableEnded) res.end();
            this.logger.info(
                `[Request] Real stream response connection closed, request ID: ${proxyRequest.request_id}`
            );
        }
    }

    async _handleNonStreamResponse(proxyRequest, messageQueue, res) {
        this.logger.info(`[Request] Entering non-stream processing mode...`);
        this._forwardRequest(proxyRequest);

        try {
            const headerMessage = await messageQueue.dequeue();
            if (headerMessage.event_type === "error") {
                if (headerMessage.message?.includes("The user aborted a request")) {
                    this.logger.info(
                        `[Request] Request #${proxyRequest.request_id} was properly cancelled by user.`
                    );
                } else {
                    this.logger.error(
                        `[Request] Browser returned error: ${headerMessage.message}`
                    );
                    await this.authSwitcher.handleRequestFailureAndSwitch(headerMessage, null);
                }
                return this._sendErrorResponse(
                    res,
                    headerMessage.status || 500,
                    headerMessage.message
                );
            }

            let fullBody = "";
            let receiving = true;
            while (receiving) {
                const message = await messageQueue.dequeue(300000);
                if (message.type === "STREAM_END") {
                    this.logger.info("[Request] Received end signal, data reception complete.");
                    receiving = false;
                    break;
                }
                if (message.event_type === "chunk" && message.data) {
                    fullBody += message.data;
                }
            }

            if (proxyRequest.is_generative && this.authSwitcher.failureCount > 0) {
                this.logger.info(
                    `✅ [Auth] Non-stream generation request successful - failure count reset from ${this.authSwitcher.failureCount} to 0`
                );
                this.authSwitcher.failureCount = 0;
            }

            // Intelligent image processing
            fullBody = this._processImageInResponse(fullBody);

            try {
                const fullResponse = JSON.parse(fullBody);
                const finishReason
                    = fullResponse.candidates?.[0]?.finishReason || "UNKNOWN";
                this.logger.info(
                    `✅ [Request] Response ended, reason: ${finishReason}, request ID: ${proxyRequest.request_id}`
                );
            } catch (e) {
                // Ignore JSON parsing errors for finish reason
            }

            res
                .status(headerMessage.status || 200)
                .type("application/json")
                .send(fullBody || "{}");

            this.logger.info(`[Request] Complete non-stream response sent to client.`);
        } catch (error) {
            this._handleRequestError(error, res);
        }
    }

    // === Helper Methods ===

    _processImageInResponse(fullBody) {
        try {
            const parsedBody = JSON.parse(fullBody);
            let needsReserialization = false;

            const candidate = parsedBody.candidates?.[0];
            if (candidate?.content?.parts) {
                const imagePartIndex = candidate.content.parts.findIndex(
                    p => p.inlineData
                );

                if (imagePartIndex > -1) {
                    this.logger.info(
                        "[Proxy] Detected image data in Google format response, converting to Markdown..."
                    );
                    const imagePart = candidate.content.parts[imagePartIndex];
                    const image = imagePart.inlineData;

                    const markdownTextPart = {
                        text: `![Generated Image](data:${image.mimeType};base64,${image.data})`,
                    };

                    candidate.content.parts[imagePartIndex] = markdownTextPart;
                    needsReserialization = true;
                }
            }

            if (needsReserialization) {
                return JSON.stringify(parsedBody);
            }
        } catch (e) {
            this.logger.warn(
                `[Proxy] Response body is not valid JSON, or error occurred while processing image: ${e.message}`
            );
        }
        return fullBody;
    }

    async _streamOpenAIResponse(messageQueue, res, model, requestId) {
        const streamState = { inThought: false };
        let streaming = true;

        while (streaming) {
            const message = await messageQueue.dequeue(30000);
            if (message.type === "STREAM_END") {
                // Close thought tag if still in thought mode
                if (streamState.inThought) {
                    const closeThoughtPayload = {
                        id: `chatcmpl-${requestId}`,
                        object: "chat.completion.chunk",
                        created: Math.floor(Date.now() / 1000),
                        model,
                        choices: [
                            {
                                index: 0,
                                delta: { content: "\n</think>\n" },
                                finish_reason: null,
                            },
                        ],
                    };
                    res.write(`data: ${JSON.stringify(closeThoughtPayload)}\n\n`);
                    this.logger.info("[Adapter] Closed thought tag in streaming response.");
                }

                this.logger.info("[Request] Stream end signal received.");
                res.write("data: [DONE]\n\n");
                streaming = false;
                break;
            }
            if (message.data) {
                const openAIChunk = this.formatConverter.translateGoogleToOpenAIStream(
                    message.data,
                    model,
                    streamState
                );
                if (openAIChunk) {
                    res.write(openAIChunk);
                }
            }
        }
    }

    async _sendOpenAINonStreamResponse(messageQueue, res, model) {
        let fullBody = "";
        let receiving = true;
        while (receiving) {
            const message = await messageQueue.dequeue(300000);
            if (message.type === "STREAM_END") {
                this.logger.info("[Request] Received end signal.");
                receiving = false;
                break;
            }
            if (message.event_type === "chunk" && message.data) {
                fullBody += message.data;
            }
        }

        // Parse and convert to OpenAI format
        try {
            const googleResponse = JSON.parse(fullBody);
            const openAIResponse = this.formatConverter.convertGoogleToOpenAINonStream(
                googleResponse,
                model
            );
            res.type("application/json").send(JSON.stringify(openAIResponse));
        } catch (e) {
            this.logger.error(`[Request] Failed to parse response: ${e.message}`);
            this._sendErrorResponse(res, 500, "Failed to parse backend response");
        }
    }

    _setResponseHeaders(res, headerMessage) {
        res.status(headerMessage.status || 200);
        const headers = headerMessage.headers || {};
        Object.entries(headers).forEach(([name, value]) => {
            if (name.toLowerCase() !== "content-length") res.set(name, value);
        });
    }

    _handleRequestError(error, res) {
        if (res.headersSent) {
            this.logger.error(`[Request] Request processing error (headers already sent): ${error.message}`);
            if (this.serverSystem.streamingMode === "fake")
                this._sendErrorChunkToClient(res, `Processing failed: ${error.message}`);
            if (!res.writableEnded) res.end();
        } else {
            this.logger.error(`[Request] Request processing error: ${error.message}`);
            const status = error.message.toLowerCase().includes("timeout") ? 504 : 500;
            this._sendErrorResponse(res, status, `Proxy error: ${error.message}`);
        }
    }

    _sendErrorResponse(res, status, message) {
        if (!res.headersSent) {
            const errorPayload = {
                error: {
                    code: status || 500,
                    message,
                    status: "SERVICE_UNAVAILABLE",
                },
            };
            res
                .status(status || 500)
                .type("application/json")
                .send(JSON.stringify(errorPayload));
        }
    }

    _sendErrorChunkToClient(res, message) {
        if (!res.headersSent) {
            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Connection", "keep-alive");
        }
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
        }
    }

    _cancelBrowserRequest(requestId) {
        const connection = this.connectionRegistry.getFirstConnection();
        if (connection) {
            this.logger.info(`[Request] Cancelling request #${requestId}`);
            connection.send(
                JSON.stringify({
                    event_type: "cancel_request",
                    request_id: requestId,
                })
            );
        } else {
            this.logger.warn(
                `[Request] Unable to send cancel instruction: No available WebSocket connection.`
            );
        }
    }

    _buildProxyRequest(req, requestId) {
        const fullPath = req.path;
        const cleanPath = fullPath.replace(/^\/proxy/, "");
        const bodyObj = req.body;

        // Force thinking for native Google requests
        if (
            this.serverSystem.forceThinking
            && req.method === "POST"
            && bodyObj
            && bodyObj.contents
        ) {
            if (!bodyObj.generationConfig) {
                bodyObj.generationConfig = {};
            }
            if (!bodyObj.generationConfig.thinkingConfig) {
                this.logger.info(
                    `[Proxy] ⚠️ Force thinking enabled and client did not provide config, injecting thinkingConfig... (Google Native)`
                );
                bodyObj.generationConfig.thinkingConfig = { includeThoughts: true };
            } else {
                this.logger.info(
                    `[Proxy] ✅ Client-provided thinking config detected, skipping force injection. (Google Native)`
                );
            }
        }

        // Force web search and URL context for native Google requests
        if (
            (this.serverSystem.forceWebSearch || this.serverSystem.forceUrlContext)
            && req.method === "POST"
            && bodyObj
            && bodyObj.contents
        ) {
            if (!bodyObj.tools) {
                bodyObj.tools = [];
            }

            const toolsToAdd = [];

            // Handle Google Search
            if (this.serverSystem.forceWebSearch) {
                const hasSearch = bodyObj.tools.some(t => t.googleSearch);
                if (!hasSearch) {
                    bodyObj.tools.push({ googleSearch: {} });
                    toolsToAdd.push("googleSearch");
                } else {
                    this.logger.info(
                        `[Proxy] ✅ Client-provided web search detected, skipping force injection. (Google Native)`
                    );
                }
            }

            // Handle URL Context
            if (this.serverSystem.forceUrlContext) {
                const hasUrlContext = bodyObj.tools.some(t => t.urlContext);
                if (!hasUrlContext) {
                    bodyObj.tools.push({ urlContext: {} });
                    toolsToAdd.push("urlContext");
                } else {
                    this.logger.info(
                        `[Proxy] ✅ Client-provided URL context detected, skipping force injection. (Google Native)`
                    );
                }
            }

            if (toolsToAdd.length > 0) {
                this.logger.info(
                    `[Proxy] ⚠️ Forcing tools enabled, injecting: [${toolsToAdd.join(
                        ", "
                    )}] (Google Native)`
                );
            }
        }

        return {
            path: cleanPath,
            method: req.method,
            headers: req.headers,
            query_params: req.query || {},
            body: req.method !== "GET" ? JSON.stringify(bodyObj) : undefined,
            request_id: requestId,
            streaming_mode: this.serverSystem.streamingMode,
        };
    }

    _forwardRequest(proxyRequest) {
        const connection = this.connectionRegistry.getFirstConnection();
        if (connection) {
            connection.send(
                JSON.stringify({
                    event_type: "proxy_request",
                    ...proxyRequest,
                })
            );
        } else {
            throw new Error("Unable to forward request: No available WebSocket connection.");
        }
    }

    _generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }
}

module.exports = RequestHandler;

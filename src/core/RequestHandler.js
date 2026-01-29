/**
 * File: src/core/RequestHandler.js
 * Description: Main request handler that processes API requests, manages retries, and coordinates between authentication and format conversion
 *
 * Author: Ellinav, iBenzene, bbbugg
 */

/**
 * Request Handler Module (Refactored)
 * Main request handler that coordinates between other modules
 */
const AuthSwitcher = require("../auth/AuthSwitcher");
const FormatConverter = require("./FormatConverter");

class RequestHandler {
    constructor(serverSystem, connectionRegistry, logger, browserManager, config, authSource) {
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

    // Delegate methods to AuthSwitcher
    async _switchToNextAuth() {
        return this.authSwitcher.switchToNextAuth();
    }

    async _switchToSpecificAuth(targetIndex) {
        return this.authSwitcher.switchToSpecificAuth(targetIndex);
    }

    /**
     * Wait for WebSocket connection to be established
     * @param {number} timeoutMs - Maximum time to wait in milliseconds
     * @returns {Promise<boolean>} true if connection established, false if timeout
     */
    async _waitForConnection(timeoutMs = 10000) {
        const startTime = Date.now();
        const checkInterval = 200; // Check every 200ms

        while (Date.now() - startTime < timeoutMs) {
            if (this.connectionRegistry.hasActiveConnections()) {
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }

        return false;
    }

    /**
     * Wait for system to become ready (not busy with switching/recovery)
     * @param {number} timeoutMs - Maximum time to wait in milliseconds (default 120s, same as browser launch timeout)
     * @returns {Promise<boolean>} true if system becomes ready, false if timeout
     */
    async _waitForSystemReady(timeoutMs = 120000) {
        if (!this.authSwitcher.isSystemBusy) {
            return true;
        }

        this.logger.info(`[System] System is busy (switching/recovering), waiting up to ${timeoutMs / 1000}s...`);

        const startTime = Date.now();
        const checkInterval = 200; // Check every 200ms

        while (Date.now() - startTime < timeoutMs) {
            if (!this.authSwitcher.isSystemBusy) {
                this.logger.info(`[System] System ready after ${Date.now() - startTime}ms.`);
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }

        this.logger.warn(`[System] Timeout waiting for system after ${timeoutMs}ms.`);
        return false;
    }

    /**
     * Handle browser recovery when connection is lost
     *
     * Important: isSystemBusy flag management strategy:
     * - Direct recovery (recoveryAuthIndex >= 0): We manually set and reset isSystemBusy
     * - Switch to next account (recoveryAuthIndex = -1): Let switchToNextAuth() manage isSystemBusy internally
     * - This prevents the bug where isSystemBusy is set here, then switchToNextAuth() checks it and returns "already in progress"
     *
     * @returns {boolean} true if recovery successful, false otherwise
     */
    async _handleBrowserRecovery(res) {
        // Wait for system to become ready if it's busy (someone else is starting/switching browser)
        if (this.authSwitcher.isSystemBusy) {
            const ready = await this._waitForSystemReady();
            if (!ready) {
                await this._sendErrorResponse(
                    res,
                    503,
                    "Server undergoing internal maintenance (account switching/recovery), please try again later."
                );
                return false;
            }
            // After waiting, also wait for WebSocket connection to be established
            if (!this.connectionRegistry.hasActiveConnections()) {
                const connectionReady = await this._waitForConnection(10000);
                if (!connectionReady) {
                    // The other process failed to establish connection, return error
                    this.logger.error(
                        "[System] WebSocket connection not established after system ready, browser startup may have failed."
                    );
                    await this._sendErrorResponse(
                        res,
                        503,
                        "Service temporarily unavailable: Browser failed to start. Please try again."
                    );
                    return false;
                }
            }
            return true;
        }

        this.logger.error(
            "❌ [System] Browser WebSocket connection disconnected! Possible process crash. Attempting recovery..."
        );

        const recoveryAuthIndex = this.currentAuthIndex;
        let wasDirectRecovery = false;
        let recoverySuccess = false;

        try {
            if (recoveryAuthIndex >= 0) {
                // Direct recovery: we manage isSystemBusy ourselves
                wasDirectRecovery = true;
                this.authSwitcher.isSystemBusy = true;
                this.logger.info(`[System] Set isSystemBusy=true for direct recovery to account #${recoveryAuthIndex}`);

                await this.browserManager.launchOrSwitchContext(recoveryAuthIndex);
                this.logger.info(`✅ [System] Browser successfully recovered to account #${recoveryAuthIndex}!`);

                // Wait for WebSocket connection to be established
                this.logger.info("[System] Waiting for WebSocket connection to be ready...");
                const connectionReady = await this._waitForConnection(10000); // 10 seconds timeout
                if (!connectionReady) {
                    throw new Error("WebSocket connection not established within timeout period");
                }
                this.logger.info("✅ [System] WebSocket connection is ready!");
                recoverySuccess = true;
            } else if (this.authSource.getRotationIndices().length > 0) {
                this.logger.warn("⚠️ [System] No current account, attempting to switch to first available account...");
                // Don't set isSystemBusy here - let switchToNextAuth manage it
                const result = await this.authSwitcher.switchToNextAuth();
                if (!result.success) {
                    this.logger.error(`❌ [System] Failed to switch to available account: ${result.reason}`);
                    await this._sendErrorResponse(res, 503, `Service temporarily unavailable: ${result.reason}`);
                    recoverySuccess = false;
                } else {
                    this.logger.info(`✅ [System] Successfully recovered to account #${result.newIndex}!`);

                    // Wait for WebSocket connection to be established
                    this.logger.info("[System] Waiting for WebSocket connection to be ready...");
                    const connectionReady = await this._waitForConnection(10000); // 10 seconds timeout
                    if (!connectionReady) {
                        throw new Error("WebSocket connection not established within timeout period");
                    }
                    this.logger.info("✅ [System] WebSocket connection is ready!");
                    recoverySuccess = true;
                }
            } else {
                this.logger.error("❌ [System] No available accounts for recovery.");
                await this._sendErrorResponse(res, 503, "Service temporarily unavailable: No available accounts.");
                recoverySuccess = false;
            }
        } catch (error) {
            this.logger.error(`❌ [System] Recovery failed: ${error.message}`);

            if (wasDirectRecovery && this.authSource.getRotationIndices().length > 1) {
                this.logger.warn("⚠️ [System] Attempting to switch to alternative account...");
                try {
                    const result = await this.authSwitcher.switchToNextAuth();
                    if (!result.success) {
                        this.logger.error(`❌ [System] Failed to switch to alternative account: ${result.reason}`);
                        await this._sendErrorResponse(res, 503, `Service temporarily unavailable: ${result.reason}`);
                        recoverySuccess = false;
                    } else {
                        this.logger.info(
                            `✅ [System] Successfully switched to alternative account #${result.newIndex}!`
                        );

                        // Wait for WebSocket connection to be established
                        this.logger.info("[System] Waiting for WebSocket connection to be ready...");
                        const connectionReady = await this._waitForConnection(10000);
                        if (!connectionReady) {
                            throw new Error("WebSocket connection not established within timeout period");
                        }
                        this.logger.info("✅ [System] WebSocket connection is ready!");
                        recoverySuccess = true;
                    }
                } catch (switchError) {
                    this.logger.error(`❌ [System] All accounts failed: ${switchError.message}`);
                    await this._sendErrorResponse(res, 503, "Service temporarily unavailable: All accounts failed.");
                    recoverySuccess = false;
                }
            } else {
                await this._sendErrorResponse(
                    res,
                    503,
                    "Service temporarily unavailable: Browser crashed and cannot auto-recover."
                );
                recoverySuccess = false;
            }
        } finally {
            // Only reset if we set it (for direct recovery attempt)
            if (wasDirectRecovery) {
                this.logger.info("[System] Resetting isSystemBusy=false in recovery finally block");
                this.authSwitcher.isSystemBusy = false;
            }
        }

        return recoverySuccess;
    }

    // Process standard Google API requests
    async processRequest(req, res) {
        const requestId = this._generateRequestId();

        // Check browser connection
        if (!this.connectionRegistry.hasActiveConnections()) {
            const recovered = await this._handleBrowserRecovery(res);
            if (!recovered) return;
        }

        // Wait for system to become ready if it's busy
        if (this.authSwitcher.isSystemBusy) {
            const ready = await this._waitForSystemReady();
            if (!ready) {
                return this._sendErrorResponse(
                    res,
                    503,
                    "Server undergoing internal maintenance (account switching/recovery), please try again later."
                );
            }
            // After system ready, ensure connection is available
            if (!this.connectionRegistry.hasActiveConnections()) {
                const connectionReady = await this._waitForConnection(10000);
                if (!connectionReady) {
                    return this._sendErrorResponse(
                        res,
                        503,
                        "Service temporarily unavailable: Connection not established after switching."
                    );
                }
            }
        }
        if (this.browserManager) {
            this.browserManager.notifyUserActivity();
        }
        // Handle usage-based account switching
        const isGenerativeRequest =
            req.method === "POST" &&
            (req.path.includes("generateContent") || req.path.includes("streamGenerateContent"));

        if (isGenerativeRequest) {
            const usageCount = this.authSwitcher.incrementUsageCount();
            if (usageCount > 0) {
                const rotationCountText =
                    this.config.switchOnUses > 0 ? `${usageCount}/${this.config.switchOnUses}` : `${usageCount}`;
                this.logger.info(
                    `[Request] Generation request - account rotation count: ${rotationCountText} (Current account: ${this.currentAuthIndex})`
                );
                if (this.authSwitcher.shouldSwitchByUsage()) {
                    this.needsSwitchingAfterRequest = true;
                }
            }
        }

        res.on("close", () => {
            if (!res.writableEnded) {
                this.logger.warn(`[Request] Client closed request #${requestId} connection prematurely.`);
                this._cancelBrowserRequest(requestId);
            }
        });

        const proxyRequest = this._buildProxyRequest(req, requestId);
        proxyRequest.is_generative = isGenerativeRequest;
        const messageQueue = this.connectionRegistry.createMessageQueue(requestId);

        const wantsStreamByHeader = req.headers.accept && req.headers.accept.includes("text/event-stream");
        const wantsStreamByPath = req.path.includes(":streamGenerateContent");
        const wantsStream = wantsStreamByHeader || wantsStreamByPath;

        try {
            if (wantsStream) {
                this.logger.info(
                    `[Request] Client enabled streaming (${this.serverSystem.streamingMode}), entering streaming processing mode...`
                );
                if (this.serverSystem.streamingMode === "fake") {
                    await this._handlePseudoStreamResponse(proxyRequest, messageQueue, req, res);
                } else {
                    await this._handleRealStreamResponse(proxyRequest, messageQueue, req, res);
                }
            } else {
                proxyRequest.streaming_mode = "fake";
                await this._handleNonStreamResponse(proxyRequest, messageQueue, req, res);
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

    // Process File Upload requests
    async processUploadRequest(req, res) {
        const requestId = this._generateRequestId();
        this.logger.info(`[Upload] Processing upload request ${req.method} ${req.path} (ID: ${requestId})`);

        // Check browser connection
        if (!this.connectionRegistry.hasActiveConnections()) {
            const recovered = await this._handleBrowserRecovery(res);
            if (!recovered) return;
        }

        // Wait for system to become ready if it's busy
        if (this.authSwitcher.isSystemBusy) {
            const ready = await this._waitForSystemReady();
            if (!ready) {
                return this._sendErrorResponse(
                    res,
                    503,
                    "Server undergoing internal maintenance (account switching/recovery), please try again later."
                );
            }
            if (!this.connectionRegistry.hasActiveConnections()) {
                const connectionReady = await this._waitForConnection(10000);
                if (!connectionReady) {
                    return this._sendErrorResponse(
                        res,
                        503,
                        "Service temporarily unavailable: Connection not established after switching."
                    );
                }
            }
        }

        if (this.browserManager) {
            this.browserManager.notifyUserActivity();
        }

        res.on("close", () => {
            if (!res.writableEnded) {
                this.logger.warn(`[Upload] Client closed request #${requestId} connection prematurely.`);
                this._cancelBrowserRequest(requestId);
            }
        });

        const proxyRequest = {
            body_b64: req.rawBody ? req.rawBody.toString("base64") : undefined,
            headers: req.headers,
            is_generative: false, // Uploads are never generative
            method: req.method,
            path: req.path.replace(/^\/proxy/, ""),
            query_params: req.query || {},
            request_id: requestId,
            streaming_mode: "fake", // Uploads always return a single JSON response
        };

        const messageQueue = this.connectionRegistry.createMessageQueue(requestId);

        try {
            await this._handleNonStreamResponse(proxyRequest, messageQueue, req, res);
        } catch (error) {
            this._handleRequestError(error, res);
        } finally {
            this.connectionRegistry.removeMessageQueue(requestId);
        }
    }

    // Process OpenAI format requests
    async processOpenAIRequest(req, res) {
        const requestId = this._generateRequestId();

        // Check browser connection
        if (!this.connectionRegistry.hasActiveConnections()) {
            const recovered = await this._handleBrowserRecovery(res);
            if (!recovered) return;
        }

        // Wait for system to become ready if it's busy
        if (this.authSwitcher.isSystemBusy) {
            const ready = await this._waitForSystemReady();
            if (!ready) {
                return this._sendErrorResponse(
                    res,
                    503,
                    "Server undergoing internal maintenance (account switching/recovery), please try again later."
                );
            }
            // After system ready, ensure connection is available
            if (!this.connectionRegistry.hasActiveConnections()) {
                const connectionReady = await this._waitForConnection(10000);
                if (!connectionReady) {
                    return this._sendErrorResponse(
                        res,
                        503,
                        "Service temporarily unavailable: Connection not established after switching."
                    );
                }
            }
        }
        if (this.browserManager) {
            this.browserManager.notifyUserActivity();
        }
        const isOpenAIStream = req.body.stream === true;
        const systemStreamMode = this.serverSystem.streamingMode;
        const useRealStream = isOpenAIStream && systemStreamMode === "real";

        // Handle usage counting
        const usageCount = this.authSwitcher.incrementUsageCount();
        if (usageCount > 0) {
            const rotationCountText =
                this.config.switchOnUses > 0 ? `${usageCount}/${this.config.switchOnUses}` : `${usageCount}`;
            this.logger.info(
                `[Request] OpenAI generation request - account rotation count: ${rotationCountText} (Current account: ${this.currentAuthIndex})`
            );
            if (this.authSwitcher.shouldSwitchByUsage()) {
                this.needsSwitchingAfterRequest = true;
            }
        }

        // Translate OpenAI format to Google format (also handles model name suffix parsing)
        let googleBody, model;
        try {
            const result = await this.formatConverter.translateOpenAIToGoogle(req.body);
            googleBody = result.googleRequest;
            model = result.cleanModelName;
        } catch (error) {
            this.logger.error(`[Adapter] OpenAI request translation failed: ${error.message}`);
            return this._sendErrorResponse(res, 400, "Invalid OpenAI request format.");
        }

        const googleEndpoint = useRealStream ? "streamGenerateContent" : "generateContent";
        const proxyRequest = {
            body: JSON.stringify(googleBody),
            headers: { "Content-Type": "application/json" },
            is_generative: true,
            method: "POST",
            path: `/v1beta/models/${model}:${googleEndpoint}`,
            query_params: useRealStream ? { alt: "sse" } : {},
            request_id: requestId,
            streaming_mode: useRealStream ? "real" : "fake",
        };

        const messageQueue = this.connectionRegistry.createMessageQueue(requestId);

        try {
            if (useRealStream) {
                this._forwardRequest(proxyRequest);
                const initialMessage = await messageQueue.dequeue();

                if (initialMessage.event_type === "error") {
                    this.logger.error(
                        `[Adapter] Received error from browser, will trigger switching logic. Status code: ${initialMessage.status}, message: ${initialMessage.message}`
                    );

                    // Send standard HTTP error response
                    this._sendErrorResponse(res, initialMessage.status || 500, initialMessage.message);

                    // Handle account switch without sending callback to client (response is closed)
                    await this.authSwitcher.handleRequestFailureAndSwitch(initialMessage, null);
                    return;
                }

                if (this.authSwitcher.failureCount > 0) {
                    this.logger.info(
                        `✅ [Auth] OpenAI interface request successful - failure count reset from ${this.authSwitcher.failureCount} to 0`
                    );
                    this.authSwitcher.failureCount = 0;
                }

                res.status(200).set({
                    "Cache-Control": "no-cache",
                    Connection: "keep-alive",
                    "Content-Type": "text/event-stream",
                });
                this.logger.info(`[Adapter] OpenAI streaming response (Real Mode) started...`);
                await this._streamOpenAIResponse(messageQueue, res, model);
            } else {
                // OpenAI Fake Stream / Non-Stream mode
                // Set up keep-alive timer for fake stream mode to prevent client timeout
                let connectionMaintainer;
                if (isOpenAIStream) {
                    const scheduleNextKeepAlive = () => {
                        const randomInterval = 12000 + Math.floor(Math.random() * 6000); // 12 - 18 seconds
                        connectionMaintainer = setTimeout(() => {
                            if (!res.headersSent) {
                                res.status(200).set({
                                    "Cache-Control": "no-cache",
                                    Connection: "keep-alive",
                                    "Content-Type": "text/event-stream",
                                });
                            }
                            if (!res.writableEnded) {
                                res.write(": keep-alive\n\n");
                                scheduleNextKeepAlive();
                            }
                        }, randomInterval);
                    };
                    scheduleNextKeepAlive();
                }

                try {
                    const result = await this._executeRequestWithRetries(proxyRequest, messageQueue);

                    if (!result.success) {
                        // Send standard HTTP error response for both streaming and non-streaming
                        if (connectionMaintainer) clearTimeout(connectionMaintainer);
                        this._sendErrorResponse(res, result.error.status || 500, result.error.message);

                        // Handle account switch without sending callback to client
                        await this.authSwitcher.handleRequestFailureAndSwitch(result.error, null);
                        return;
                    }

                    if (this.authSwitcher.failureCount > 0) {
                        this.logger.info(`✅ [Auth] OpenAI interface request successful - failure count reset to 0`);
                        this.authSwitcher.failureCount = 0;
                    }

                    if (isOpenAIStream) {
                        // Fake stream - ensure headers are set before sending data
                        if (!res.headersSent) {
                            res.status(200).set({
                                "Cache-Control": "no-cache",
                                Connection: "keep-alive",
                                "Content-Type": "text/event-stream",
                            });
                        }
                        // Clear keep-alive timer as we are about to send real data
                        if (connectionMaintainer) clearTimeout(connectionMaintainer);

                        this.logger.info(`[Adapter] OpenAI streaming response (Fake Mode) started...`);
                        let fullBody = "";
                        let streaming = true;
                        while (streaming) {
                            const message = await messageQueue.dequeue();
                            if (message.type === "STREAM_END") {
                                streaming = false;
                                break;
                            }
                            if (message.data) fullBody += message.data;
                        }
                        const streamState = {};
                        const translatedChunk = this.formatConverter.translateGoogleToOpenAIStream(
                            fullBody,
                            model,
                            streamState
                        );
                        if (translatedChunk) res.write(translatedChunk);
                        res.write("data: [DONE]\n\n");
                        this.logger.info("[Adapter] Fake mode: Complete content sent at once.");
                    } else {
                        // Non-stream
                        await this._sendOpenAINonStreamResponse(messageQueue, res, model);
                    }
                } finally {
                    if (connectionMaintainer) clearTimeout(connectionMaintainer);
                }
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

        // Per user request, convert the backend call to non-streaming.
        proxyRequest.path = proxyRequest.path.replace(":streamGenerateContent", ":generateContent");
        if (proxyRequest.query_params && proxyRequest.query_params.alt) {
            delete proxyRequest.query_params.alt;
        }

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
            const result = await this._executeRequestWithRetries(proxyRequest, messageQueue);

            if (!result.success) {
                clearTimeout(connectionMaintainer);

                if (result.error.message?.includes("The user aborted a request")) {
                    this.logger.info(
                        `[Request] Request #${proxyRequest.request_id} was properly cancelled by user, not counted in failure statistics.`
                    );
                } else {
                    this.logger.error(
                        `[Request] All ${this.maxRetries} retries failed, will be counted in failure statistics.`
                    );

                    // Send standard HTTP error response
                    this._sendErrorResponse(res, result.error.status || 500, result.error.message);

                    // Handle account switch without sending callback to client
                    await this.authSwitcher.handleRequestFailureAndSwitch(result.error, null);
                }
                return;
            }

            if (proxyRequest.is_generative && this.authSwitcher.failureCount > 0) {
                this.logger.info(
                    `✅ [Auth] Generation request successful - failure count reset from ${this.authSwitcher.failureCount} to 0`
                );
                this.authSwitcher.failureCount = 0;
            }

            if (!res.headersSent) {
                res.setHeader("Content-Type", "text/event-stream");
                res.setHeader("Cache-Control", "no-cache");
                res.setHeader("Connection", "keep-alive");
            }
            // Clear the keep-alive timer as we are about to send real data
            clearTimeout(connectionMaintainer);

            // Read all data chunks until STREAM_END to handle potential fragmentation
            let fullData = "";
            let streaming = true;
            while (streaming) {
                const message = await messageQueue.dequeue(); // 5 min timeout
                if (message.type === "STREAM_END") {
                    streaming = false;
                    break;
                }
                if (message.data) {
                    fullData += message.data;
                }
            }

            try {
                const googleResponse = JSON.parse(fullData);
                const candidate = googleResponse.candidates?.[0];

                if (candidate && candidate.content && Array.isArray(candidate.content.parts)) {
                    this.logger.info(
                        "[Request] Splitting full Gemini response into 'thought' and 'content' chunks for pseudo-stream."
                    );

                    const thinkingParts = candidate.content.parts.filter(p => p.thought === true);
                    const contentParts = candidate.content.parts.filter(p => p.thought !== true);
                    const role = candidate.content.role || "model";

                    // Send thinking part first
                    if (thinkingParts.length > 0) {
                        const thinkingResponse = {
                            candidates: [
                                {
                                    content: {
                                        parts: thinkingParts,
                                        role,
                                    },
                                    // We don't include finishReason here
                                },
                            ],
                            // We don't include usageMetadata here
                        };
                        res.write(`data: ${JSON.stringify(thinkingResponse)}\n\n`);
                        this.logger.info(`[Request] Sent ${thinkingParts.length} thinking part(s).`);
                    }

                    // Then send content part
                    if (contentParts.length > 0) {
                        const contentResponse = {
                            candidates: [
                                {
                                    content: {
                                        parts: contentParts,
                                        role,
                                    },
                                    finishReason: candidate.finishReason,
                                    // Other candidate fields can be preserved if needed
                                },
                            ],
                            usageMetadata: googleResponse.usageMetadata,
                        };
                        res.write(`data: ${JSON.stringify(contentResponse)}\n\n`);
                        this.logger.info(`[Request] Sent ${contentParts.length} content part(s).`);
                    } else if (candidate.finishReason) {
                        // If there's no content but a finish reason, send an empty content message with it
                        const finalResponse = {
                            candidates: [
                                {
                                    content: { parts: [], role },
                                    finishReason: candidate.finishReason,
                                },
                            ],
                            usageMetadata: googleResponse.usageMetadata,
                        };
                        res.write(`data: ${JSON.stringify(finalResponse)}\n\n`);
                    }
                } else if (fullData) {
                    // Fallback for responses without candidates or parts, or if parsing fails
                    this.logger.warn(
                        "[Request] Response structure not recognized for splitting, sending as a single chunk."
                    );
                    res.write(`data: ${fullData}\n\n`);
                }
            } catch (e) {
                this.logger.error(
                    `[Request] Failed to parse and split Gemini response: ${e.message}. Sending raw data.`
                );
                if (fullData) {
                    res.write(`data: ${fullData}\n\n`);
                }
            }

            const finishReason = (() => {
                try {
                    return JSON.parse(fullData).candidates?.[0]?.finishReason || "UNKNOWN";
                } catch {
                    return "UNKNOWN";
                }
            })();
            this.logger.info(
                `✅ [Request] Response ended, reason: ${finishReason}, request ID: ${proxyRequest.request_id}`
            );
        } catch (error) {
            this._handleRequestError(error, res);
        } finally {
            clearTimeout(connectionMaintainer);
            if (!res.writableEnded) {
                res.end();
            }
            this.logger.info(`[Request] Response processing ended, request ID: ${proxyRequest.request_id}`);
        }
    }

    async _handleRealStreamResponse(proxyRequest, messageQueue, req, res) {
        this.logger.info(`[Request] Request dispatched to browser for processing...`);
        this._forwardRequest(proxyRequest);
        const headerMessage = await messageQueue.dequeue();

        if (headerMessage.event_type === "error") {
            if (headerMessage.message && headerMessage.message.includes("The user aborted a request")) {
                this.logger.info(
                    `[Request] Request #${proxyRequest.request_id} was properly cancelled by user, not counted in failure statistics.`
                );
            } else {
                this.logger.error(`[Request] Request failed, will be counted in failure statistics.`);
                await this.authSwitcher.handleRequestFailureAndSwitch(headerMessage, null);
                return this._sendErrorResponse(res, headerMessage.status, headerMessage.message);
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

        this._setResponseHeaders(res, headerMessage, req);
        // Fallback: Ensure Content-Type is set for streaming response
        if (!res.get("Content-Type")) {
            res.type("text/event-stream");
        }
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
                        const finishReason = lastResponse.candidates?.[0]?.finishReason || "UNKNOWN";
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

    async _handleNonStreamResponse(proxyRequest, messageQueue, req, res) {
        this.logger.info(`[Request] Entering non-stream processing mode...`);

        try {
            const result = await this._executeRequestWithRetries(proxyRequest, messageQueue);

            if (!result.success) {
                // If retries failed, handle the failure (e.g., switch account)
                if (result.error.message?.includes("The user aborted a request")) {
                    this.logger.info(`[Request] Request #${proxyRequest.request_id} was properly cancelled by user.`);
                } else {
                    this.logger.error(`[Request] Browser returned error after retries: ${result.error.message}`);
                    await this.authSwitcher.handleRequestFailureAndSwitch(result.error, null);
                }
                return this._sendErrorResponse(res, result.error.status || 500, result.error.message);
            }

            // On success, reset failure count if needed
            if (proxyRequest.is_generative && this.authSwitcher.failureCount > 0) {
                this.logger.info(
                    `✅ [Auth] Non-stream generation request successful - failure count reset from ${this.authSwitcher.failureCount} to 0`
                );
                this.authSwitcher.failureCount = 0;
            }

            const headerMessage = result.message;
            const chunks = [];
            let receiving = true;
            while (receiving) {
                const message = await messageQueue.dequeue();
                if (message.type === "STREAM_END") {
                    this.logger.info("[Request] Received end signal, data reception complete.");
                    receiving = false;
                    break;
                }
                if (message.event_type === "chunk" && message.data) {
                    chunks.push(Buffer.from(message.data));
                }
            }

            const fullBodyBuffer = Buffer.concat(chunks);

            try {
                const fullResponse = JSON.parse(fullBodyBuffer.toString());
                const finishReason = fullResponse.candidates?.[0]?.finishReason || "UNKNOWN";
                this.logger.info(
                    `✅ [Request] Response ended, reason: ${finishReason}, request ID: ${proxyRequest.request_id}`
                );
            } catch (e) {
                // Ignore JSON parsing errors for finish reason
            }

            this._setResponseHeaders(res, headerMessage, req);

            // Ensure Content-Type is set (Express defaults Buffer to application/octet-stream)
            if (!res.get("Content-Type")) {
                res.type("application/json");
            }

            res.send(fullBodyBuffer);

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
                const imagePartIndex = candidate.content.parts.findIndex(p => p.inlineData);

                if (imagePartIndex > -1) {
                    this.logger.info(
                        "[Proxy] Detected image data in Google format response, converting to Markdown..."
                    );
                    const imagePart = candidate.content.parts[imagePartIndex];
                    const image = imagePart.inlineData;

                    candidate.content.parts[imagePartIndex] = {
                        text: `![Generated Image](data:${image.mimeType};base64,${image.data})`,
                    };
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

    async _executeRequestWithRetries(proxyRequest, messageQueue) {
        let lastError = null;

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                this._forwardRequest(proxyRequest);

                const initialMessage = await messageQueue.dequeue();

                if (initialMessage.event_type === "timeout") {
                    throw new Error(
                        JSON.stringify({
                            event_type: "error",
                            message: "Request timed out waiting for browser response.",
                            status: 504,
                        })
                    );
                }

                if (initialMessage.event_type === "error") {
                    // Throw a structured error to be caught by the catch block
                    throw new Error(JSON.stringify(initialMessage));
                }

                // Success, return the initial message
                return { message: initialMessage, success: true };
            } catch (error) {
                // Parse the structured error message
                let errorPayload;
                try {
                    errorPayload = JSON.parse(error.message);
                } catch (e) {
                    errorPayload = { message: error.message, status: 500 };
                }

                lastError = errorPayload;

                // Check if we should stop retrying immediately based on status code
                if (
                    this.config.immediateSwitchStatusCodes &&
                    this.config.immediateSwitchStatusCodes.includes(errorPayload.status)
                ) {
                    this.logger.warn(
                        `[Request] Critical error ${errorPayload.status} detected (${errorPayload.message}), aborting retries immediately.`
                    );
                    break;
                }

                // Log the warning for the current attempt
                this.logger.warn(
                    `[Request] Attempt #${attempt}/${this.maxRetries} for request #${proxyRequest.request_id} failed: ${errorPayload.message}`
                );

                // If it's the last attempt, break the loop to return failure
                if (attempt >= this.maxRetries) {
                    this.logger.error(
                        `[Request] All ${this.maxRetries} retries failed for request #${proxyRequest.request_id}. Final error: ${errorPayload.message}`
                    );
                    break;
                }

                // Wait before the next retry
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
            }
        }

        // After all retries, return the final failure result
        return { error: lastError, success: false };
    }

    async _streamOpenAIResponse(messageQueue, res, model) {
        const streamState = {};
        let streaming = true;

        while (streaming) {
            const message = await messageQueue.dequeue(30000);
            if (message.type === "STREAM_END") {
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
            const message = await messageQueue.dequeue();
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
            const openAIResponse = this.formatConverter.convertGoogleToOpenAINonStream(googleResponse, model);
            res.type("application/json").send(JSON.stringify(openAIResponse));
        } catch (e) {
            this.logger.error(`[Request] Failed to parse response: ${e.message}`);
            this._sendErrorResponse(res, 500, "Failed to parse backend response");
        }
    }

    _setResponseHeaders(res, headerMessage, req) {
        res.status(headerMessage.status || 200);
        const headers = headerMessage.headers || {};

        // Filter headers that might cause CORS conflicts
        const forbiddenHeaders = [
            "access-control-allow-origin",
            "access-control-allow-methods",
            "access-control-allow-headers",
        ];

        Object.entries(headers).forEach(([name, value]) => {
            const lowerName = name.toLowerCase();
            if (forbiddenHeaders.includes(lowerName)) return;
            if (lowerName === "content-length") return;

            // Special handling for upload URL and redirects: point them back to this proxy
            if ((lowerName === "x-goog-upload-url" || lowerName === "location") && value.includes("googleapis.com")) {
                try {
                    const urlObj = new URL(value);
                    // Rewrite upload/redirect URLs to point to this proxy server
                    // build.js already rewrote the URL to localhost with __proxy_host__ param
                    // Here we just ensure it matches the client's request host (for Docker/remote access)
                    let newAuthority;
                    if (req && req.headers && req.headers.host) {
                        newAuthority = req.headers.host;
                    } else {
                        const host =
                            this.serverSystem.config.host === "0.0.0.0" ? "127.0.0.1" : this.serverSystem.config.host;
                        newAuthority = `${host}:${this.serverSystem.config.httpPort}`;
                    }

                    const protocol =
                        req.secure || (req.get && req.get("X-Forwarded-Proto") === "https") ? "https" : "http";
                    const newUrl = `${protocol}://${newAuthority}${urlObj.pathname}${urlObj.search}`;

                    this.logger.debug(`[Response] Debug: Rewriting header ${name}: ${value} -> ${newUrl}`);
                    res.set(name, newUrl);
                } catch (e) {
                    res.set(name, value);
                }
            } else {
                res.set(name, value);
            }
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
            res.status(status || 500)
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
            this.logger.warn(`[Request] Unable to send cancel instruction: No available WebSocket connection.`);
        }
    }

    /**
     * Set browser (build.js) log level at runtime
     * @param {string} level - 'DEBUG', 'INFO', 'WARN', or 'ERROR'
     * @returns {boolean} true if message sent successfully, false otherwise
     */
    setBrowserLogLevel(level) {
        const validLevels = ["DEBUG", "INFO", "WARN", "ERROR"];
        const upperLevel = level?.toUpperCase();

        if (!validLevels.includes(upperLevel)) {
            return false;
        }

        const connection = this.connectionRegistry.getFirstConnection();
        if (connection) {
            connection.send(
                JSON.stringify({
                    event_type: "set_log_level",
                    level: upperLevel,
                })
            );
            this.logger.info(`[Config] Browser log level set to: ${upperLevel}`);

            // Also update server-side LoggingService level to keep in sync
            const LoggingService = require("../utils/LoggingService");
            LoggingService.setLevel(upperLevel);
            this.logger.info(`[Config] Server log level synchronized to: ${upperLevel}`);

            return true;
        } else {
            this.logger.warn(`[Config] Unable to set browser log level: No available WebSocket connection.`);
            return false;
        }
    }

    _buildProxyRequest(req, requestId) {
        const fullPath = req.path;
        let cleanPath = fullPath.replace(/^\/proxy/, "");
        const bodyObj = req.body;

        // Parse thinkingLevel suffix from model name in native Gemini generation requests
        // Only handle generation requests: /v1beta/models/{modelName}:generateContent or :streamGenerateContent
        const modelPathMatch = cleanPath.match(
            /^(\/v1beta\/models\/)([^:]+)(:(generateContent|streamGenerateContent).*)$/
        );
        let modelThinkingLevel = null;

        if (modelPathMatch) {
            const pathPrefix = modelPathMatch[1];
            const rawModelName = modelPathMatch[2];
            const pathSuffix = modelPathMatch[3];

            const FormatConverter = require("./FormatConverter");
            const { cleanModelName, thinkingLevel } = FormatConverter.parseModelThinkingLevel(rawModelName);

            if (thinkingLevel) {
                modelThinkingLevel = thinkingLevel;
                cleanPath = `${pathPrefix}${cleanModelName}${pathSuffix}`;
                this.logger.info(
                    `[Proxy] Detected thinkingLevel suffix in model path: "${rawModelName}" -> model="${cleanModelName}", thinkingLevel="${thinkingLevel}"`
                );
            }
        }

        // Force thinking for native Google requests (processed first)
        if (this.serverSystem.forceThinking && req.method === "POST" && bodyObj && bodyObj.contents) {
            if (!bodyObj.generationConfig) {
                bodyObj.generationConfig = {};
            }
            if (
                !bodyObj.generationConfig.thinkingConfig ||
                !bodyObj.generationConfig.thinkingConfig.includeThoughts ||
                bodyObj.generationConfig.thinkingConfig.includeThoughts === false
            ) {
                this.logger.info(
                    `[Proxy] ⚠️ Force thinking enabled and client did not provide config, injecting thinkingConfig. (Google Native)`
                );
                bodyObj.generationConfig.thinkingConfig = {
                    ...(bodyObj.generationConfig.thinkingConfig || {}),
                    includeThoughts: true,
                };
            } else {
                this.logger.info(
                    `[Proxy] ✅ Client-provided thinking config detected, skipping force injection. (Google Native)`
                );
            }
        }

        // If thinkingLevel is parsed from model name suffix, inject into thinkingConfig (after force thinking, higher priority, direct override)
        if (modelThinkingLevel && req.method === "POST" && bodyObj && bodyObj.contents) {
            if (!bodyObj.generationConfig) {
                bodyObj.generationConfig = {};
            }
            if (!bodyObj.generationConfig.thinkingConfig) {
                bodyObj.generationConfig.thinkingConfig = {};
            }
            // Model name suffix thinkingLevel has highest priority, direct override
            bodyObj.generationConfig.thinkingConfig.thinkingLevel = modelThinkingLevel;
            this.logger.info(
                `[Proxy] Applied thinkingLevel from model name suffix: ${modelThinkingLevel} (Google Native)`
            );
        }

        // Pre-process native Google requests
        // 1. Ensure thoughtSignature for functionCall (not functionResponse)
        // 2. Sanitize tools (remove unsupported fields, convert type to uppercase)
        if (req.method === "POST" && bodyObj) {
            if (bodyObj.contents) {
                this.formatConverter.ensureThoughtSignature(bodyObj);
            }
            if (bodyObj.tools) {
                this.formatConverter.sanitizeGeminiTools(bodyObj);
            }
        }

        // Force web search and URL context for native Google requests
        if (
            (this.serverSystem.forceWebSearch || this.serverSystem.forceUrlContext) &&
            req.method === "POST" &&
            bodyObj &&
            bodyObj.contents
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
                    `[Proxy] ⚠️ Forcing tools enabled, injecting: [${toolsToAdd.join(", ")}] (Google Native)`
                );
            }
        }

        return {
            body: req.method !== "GET" ? JSON.stringify(bodyObj) : undefined,
            headers: req.headers,
            is_generative:
                req.method === "POST" &&
                (req.path.includes("generateContent") || req.path.includes("streamGenerateContent")),
            method: req.method,
            path: cleanPath,
            query_params: req.query || {},
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

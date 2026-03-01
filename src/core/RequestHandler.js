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
const { isUserAbortedError } = require("../utils/CustomErrors");
const { QueueClosedError } = require("../utils/MessageQueue");

// Timeout constants (in milliseconds)
const TIMEOUTS = {
    FAKE_STREAM: 300000, // 300 seconds (5 minutes) - timeout for fake streaming (buffered response)
    STREAM_CHUNK: 60000, // 60 seconds - timeout between stream chunks
};

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

        // Timeout settings
        this.timeouts = TIMEOUTS;
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

    async _waitForGraceReconnect(timeoutMs = 60000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            if (!this.connectionRegistry.isInGracePeriod() && !this.connectionRegistry.isReconnectingInProgress()) {
                const connectionReady = await this._waitForConnection(10000);
                return connectionReady;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return !!this.connectionRegistry.getConnectionByAuth(this.currentAuthIndex);
    }

    _isConnectionResetError(error) {
        if (!error) return false;
        // Check for QueueClosedError type
        if (error instanceof QueueClosedError) return true;
        // Check for error code
        if (error.code === "QUEUE_CLOSED") return true;
        // Fallback to message check for backward compatibility
        if (error.message) {
            return (
                error.message.includes("Queue closed") ||
                error.message.includes("Queue is closed") ||
                error.message.includes("Connection lost")
            );
        }
        return false;
    }

    /**
     * Wait for WebSocket connection to be established for current account
     * @param {number} timeoutMs - Maximum time to wait in milliseconds
     * @returns {Promise<boolean>} true if connection established, false if timeout
     */
    async _waitForConnection(timeoutMs = 10000) {
        const startTime = Date.now();
        const checkInterval = 200; // Check every 200ms

        while (Date.now() - startTime < timeoutMs) {
            const connection = this.connectionRegistry.getConnectionByAuth(this.currentAuthIndex);
            // Check both existence and readyState (1 = OPEN)
            if (connection && connection.readyState === 1) {
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, checkInterval));
        }

        this.logger.warn(
            `[Request] Timeout waiting for WebSocket connection for account #${this.currentAuthIndex}. Closing unresponsive context...`
        );
        // Proactively close the unresponsive context so subsequent attempts re-initialize it
        if (this.browserManager) {
            try {
                await this.browserManager.closeContext(this.currentAuthIndex);
            } catch (e) {
                this.logger.warn(
                    `[System] Failed to close unresponsive context for account #${this.currentAuthIndex}: ${e.message}`
                );
            }
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
        // If within grace period or lightweight reconnect is running, wait up to 60s for WebSocket reconnection
        if (this.connectionRegistry.isInGracePeriod() || this.connectionRegistry.isReconnectingInProgress()) {
            this.logger.info(
                "[System] Waiting up to 60s for WebSocket reconnection (grace/reconnect in progress) before full recovery..."
            );
            const reconnected = await this._waitForGraceReconnect(60000);
            if (reconnected) {
                this.logger.info("[System] Connection restored, skipping recovery.");
                return true;
            }
            this.logger.warn("[System] Reconnection wait expired, proceeding to recovery workflow.");
        }

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
            // After waiting, also wait for WebSocket connection to be established for current account
            if (!this.connectionRegistry.getConnectionByAuth(this.currentAuthIndex)) {
                const connectionReady = await this._waitForConnection(10000);
                if (!connectionReady) {
                    // The other process failed to establish connection, return error
                    this.logger.error(
                        `[System] WebSocket connection not established for account #${this.currentAuthIndex} after system ready, browser startup may have failed.`
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

        // Determine if this is first-time startup or actual crash recovery
        const recoveryAuthIndex = this.currentAuthIndex;
        const isFirstTimeStartup = recoveryAuthIndex < 0 && !this.browserManager.browser;

        if (isFirstTimeStartup) {
            this.logger.info(
                "🚀 [System] Browser not yet started. Initializing browser with first available account..."
            );
        } else {
            this.logger.error(
                "❌ [System] Browser WebSocket connection disconnected! Possible process crash. Attempting recovery..."
            );
        }

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
                // Reset isSystemBusy before calling switchToNextAuth to avoid "already in progress" rejection
                this.authSwitcher.isSystemBusy = false;
                wasDirectRecovery = false; // Prevent finally block from resetting again
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

        // Check current account's browser connection
        if (!this.connectionRegistry.getConnectionByAuth(this.currentAuthIndex)) {
            this.logger.warn(`[Request] No WebSocket connection for current account #${this.currentAuthIndex}`);
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
            // After system ready, ensure connection is available for current account
            if (!this.connectionRegistry.getConnectionByAuth(this.currentAuthIndex)) {
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

        const proxyRequest = this._buildProxyRequest(req, requestId);
        proxyRequest.is_generative = isGenerativeRequest;
        const messageQueue = this.connectionRegistry.createMessageQueue(requestId, this.currentAuthIndex);

        this._setupClientDisconnectHandler(res, requestId);

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
            // Don't log as error if it's just a client disconnect
            if (this._isConnectionResetError(error)) {
                this.logger.info(`[Request] Request terminated: Queue closed (${error.reason || "connection_lost"})`);
            } else {
                this._handleRequestError(error, res);
            }
        } finally {
            this.connectionRegistry.removeMessageQueue(requestId, "request_complete");
            if (this.needsSwitchingAfterRequest) {
                this.logger.info(
                    `[Auth] Rotation count reached switching threshold (${this.authSwitcher.usageCount}/${this.config.switchOnUses}), will automatically switch account in background...`
                );
                this.authSwitcher.switchToNextAuth().catch(err => {
                    this.logger.error(`[Auth] Background account switching task failed: ${err.message}`);
                });
                this.needsSwitchingAfterRequest = false;
            }
            if (!res.writableEnded) res.end();
        }
    }

    // Process File Upload requests
    async processUploadRequest(req, res) {
        const requestId = this._generateRequestId();
        this.logger.info(`[Upload] Processing upload request ${req.method} ${req.path} (ID: ${requestId})`);

        // Check current account's browser connection
        if (!this.connectionRegistry.getConnectionByAuth(this.currentAuthIndex)) {
            this.logger.warn(`[Upload] No WebSocket connection for current account #${this.currentAuthIndex}`);
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
            if (!this.connectionRegistry.getConnectionByAuth(this.currentAuthIndex)) {
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

        const messageQueue = this.connectionRegistry.createMessageQueue(requestId, this.currentAuthIndex);

        this._setupClientDisconnectHandler(res, requestId);

        try {
            await this._handleNonStreamResponse(proxyRequest, messageQueue, req, res);
        } catch (error) {
            // Don't log as error if it's just a client disconnect
            if (this._isConnectionResetError(error)) {
                this.logger.info(`[Request] Request terminated: Queue closed (${error.reason || "connection_lost"})`);
            } else {
                this._handleRequestError(error, res);
            }
        } finally {
            this.connectionRegistry.removeMessageQueue(requestId, "request_complete");
            if (!res.writableEnded) res.end();
        }
    }

    // Process OpenAI format requests
    async processOpenAIRequest(req, res) {
        const requestId = this._generateRequestId();

        // Check current account's browser connection
        if (!this.connectionRegistry.getConnectionByAuth(this.currentAuthIndex)) {
            this.logger.warn(`[Request] No WebSocket connection for current account #${this.currentAuthIndex}`);
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
            // After system ready, ensure connection is available for current account
            if (!this.connectionRegistry.getConnectionByAuth(this.currentAuthIndex)) {
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

        const messageQueue = this.connectionRegistry.createMessageQueue(requestId, this.currentAuthIndex);

        this._setupClientDisconnectHandler(res, requestId);

        try {
            if (useRealStream) {
                this._forwardRequest(proxyRequest);
                const initialMessage = await messageQueue.dequeue();

                if (initialMessage.event_type === "error") {
                    this.logger.error(
                        `[Request] Received error from browser, will trigger switching logic. Status code: ${initialMessage.status}, message: ${initialMessage.message}`
                    );

                    // Send standard HTTP error response
                    this._sendErrorResponse(res, initialMessage.status || 500, initialMessage.message);

                    // Avoid switching account if the error is just a connection reset
                    if (!this._isConnectionResetError(initialMessage)) {
                        await this.authSwitcher.handleRequestFailureAndSwitch(initialMessage, null);
                    } else {
                        this.logger.info(
                            "[Request] Failure due to connection reset (Real Stream), skipping account switch."
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

                res.status(200).set({
                    "Cache-Control": "no-cache",
                    Connection: "keep-alive",
                    "Content-Type": "text/event-stream",
                });
                this.logger.info(`[Request] OpenAI streaming response (Real Mode) started...`);
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

                        // Avoid switching account if the error is just a connection reset
                        if (!this._isConnectionResetError(result.error)) {
                            await this.authSwitcher.handleRequestFailureAndSwitch(result.error, null);
                        } else {
                            this.logger.info(
                                "[Request] Failure due to connection reset (OpenAI), skipping account switch."
                            );
                        }
                        return;
                    }

                    if (this.authSwitcher.failureCount > 0) {
                        this.logger.info(`✅ [Auth] OpenAI interface request successful - failure count reset to 0`);
                        this.authSwitcher.failureCount = 0;
                    }

                    // Use the queue that successfully received the initial message
                    const activeQueue = result.queue;

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

                        this.logger.info(`[Request] OpenAI streaming response (Fake Mode) started...`);
                        let fullBody = "";
                        try {
                            // eslint-disable-next-line no-constant-condition
                            while (true) {
                                const message = await activeQueue.dequeue(this.timeouts.FAKE_STREAM);
                                if (message.type === "STREAM_END") {
                                    break;
                                }

                                if (message.event_type === "error") {
                                    this.logger.error(
                                        `[Request] Error received during OpenAI fake stream: ${message.message}`
                                    );
                                    // Check if response is still writable before attempting to write
                                    if (this._isResponseWritable(res)) {
                                        try {
                                            res.write(
                                                `data: ${JSON.stringify({ error: { code: 500, message: message.message, type: "api_error" } })}\n\n`
                                            );
                                        } catch (writeError) {
                                            this.logger.debug(
                                                `[Request] Failed to write error to OpenAI fake stream: ${writeError.message}`
                                            );
                                        }
                                    }
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
                            this.logger.info("[Request] Fake mode: Complete content sent at once.");
                        } catch (error) {
                            // Handle timeout or other errors during streaming
                            if (this._isResponseWritable(res)) {
                                try {
                                    res.write(
                                        `data: ${JSON.stringify({ error: { code: 504, message: `Stream timeout: ${error.message}`, type: "timeout_error" } })}\n\n`
                                    );
                                } catch (writeError) {
                                    this.logger.debug(
                                        `[Request] Failed to write fake stream timeout error to client: ${writeError.message}`
                                    );
                                }
                            }
                        }
                    } else {
                        // Non-stream
                        await this._sendOpenAINonStreamResponse(activeQueue, res, model);
                    }
                } finally {
                    if (connectionMaintainer) clearTimeout(connectionMaintainer);
                }
            }
        } catch (error) {
            // Don't log as error if it's just a client disconnect
            if (this._isConnectionResetError(error)) {
                this.logger.info(`[Request] Request terminated: Queue closed (${error.reason || "connection_lost"})`);
            } else {
                this._handleRequestError(error, res);
            }
        } finally {
            this.connectionRegistry.removeMessageQueue(requestId, "request_complete");
            if (this.needsSwitchingAfterRequest) {
                this.logger.info(
                    `[Auth] Rotation count reached switching threshold (${this.authSwitcher.usageCount}/${this.config.switchOnUses}), will automatically switch account in background...`
                );
                this.authSwitcher.switchToNextAuth().catch(err => {
                    this.logger.error(`[Auth] Background account switching task failed: ${err.message}`);
                });
                this.needsSwitchingAfterRequest = false;
            }
            if (!res.writableEnded) res.end();
        }
    }

    // Process Claude API format requests
    async processClaudeRequest(req, res) {
        const requestId = this._generateRequestId();

        // Check current account's browser connection
        if (!this.connectionRegistry.getConnectionByAuth(this.currentAuthIndex)) {
            this.logger.warn(`[Request] No WebSocket connection for current account #${this.currentAuthIndex}`);
            const recovered = await this._handleBrowserRecovery(res);
            if (!recovered) return;
        }

        // Wait for system to become ready if it's busy
        if (this.authSwitcher.isSystemBusy) {
            const ready = await this._waitForSystemReady();
            if (!ready) {
                return this._sendClaudeErrorResponse(
                    res,
                    503,
                    "overloaded_error",
                    "Server undergoing internal maintenance, please try again later."
                );
            }
            if (!this.connectionRegistry.getConnectionByAuth(this.currentAuthIndex)) {
                const connectionReady = await this._waitForConnection(10000);
                if (!connectionReady) {
                    return this._sendClaudeErrorResponse(
                        res,
                        503,
                        "overloaded_error",
                        "Service temporarily unavailable: Connection not established."
                    );
                }
            }
        }

        if (this.browserManager) {
            this.browserManager.notifyUserActivity();
        }

        const isClaudeStream = req.body.stream === true;
        const systemStreamMode = this.serverSystem.streamingMode;
        const useRealStream = isClaudeStream && systemStreamMode === "real";

        // Handle usage counting
        const usageCount = this.authSwitcher.incrementUsageCount();
        if (usageCount > 0) {
            const rotationCountText =
                this.config.switchOnUses > 0 ? `${usageCount}/${this.config.switchOnUses}` : `${usageCount}`;
            this.logger.info(
                `[Request] Claude generation request - account rotation count: ${rotationCountText} (Current account: ${this.currentAuthIndex})`
            );
            if (this.authSwitcher.shouldSwitchByUsage()) {
                this.needsSwitchingAfterRequest = true;
            }
        }

        // Translate Claude format to Google format
        let googleBody, model;
        try {
            const result = await this.formatConverter.translateClaudeToGoogle(req.body);
            googleBody = result.googleRequest;
            model = result.cleanModelName;
        } catch (error) {
            this.logger.error(`[Adapter] Claude request translation failed: ${error.message}`);
            return this._sendClaudeErrorResponse(res, 400, "invalid_request_error", "Invalid Claude request format.");
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

        const messageQueue = this.connectionRegistry.createMessageQueue(requestId, this.currentAuthIndex);

        this._setupClientDisconnectHandler(res, requestId);

        try {
            if (useRealStream) {
                this._forwardRequest(proxyRequest);
                const initialMessage = await messageQueue.dequeue();

                if (initialMessage.event_type === "error") {
                    this.logger.error(
                        `[Request] Received error from browser, will trigger switching logic. Status code: ${initialMessage.status}, message: ${initialMessage.message}`
                    );
                    this._sendClaudeErrorResponse(
                        res,
                        initialMessage.status || 500,
                        "api_error",
                        initialMessage.message
                    );
                    if (!this._isConnectionResetError(initialMessage)) {
                        await this.authSwitcher.handleRequestFailureAndSwitch(initialMessage, null);
                    }
                    return;
                }

                if (this.authSwitcher.failureCount > 0) {
                    this.logger.info(`✅ [Auth] Claude request successful - failure count reset to 0`);
                    this.authSwitcher.failureCount = 0;
                }

                res.status(200).set({
                    "Cache-Control": "no-cache",
                    Connection: "keep-alive",
                    "Content-Type": "text/event-stream",
                });
                this.logger.info(`[Request] Claude streaming response (Real Mode) started...`);
                await this._streamClaudeResponse(messageQueue, res, model);
            } else {
                // Claude Fake Stream / Non-Stream mode
                let connectionMaintainer;
                if (isClaudeStream) {
                    const scheduleNextKeepAlive = () => {
                        const randomInterval = 12000 + Math.floor(Math.random() * 6000);
                        connectionMaintainer = setTimeout(() => {
                            if (!res.headersSent) {
                                res.status(200).set({
                                    "Cache-Control": "no-cache",
                                    Connection: "keep-alive",
                                    "Content-Type": "text/event-stream",
                                });
                            }
                            if (!res.writableEnded) {
                                res.write("event: ping\ndata: {}\n\n");
                                scheduleNextKeepAlive();
                            }
                        }, randomInterval);
                    };
                    scheduleNextKeepAlive();
                }

                try {
                    const result = await this._executeRequestWithRetries(proxyRequest, messageQueue);

                    if (!result.success) {
                        if (connectionMaintainer) clearTimeout(connectionMaintainer);
                        this._sendClaudeErrorResponse(
                            res,
                            result.error.status || 500,
                            "api_error",
                            result.error.message
                        );
                        if (!this._isConnectionResetError(result.error)) {
                            await this.authSwitcher.handleRequestFailureAndSwitch(result.error, null);
                        }
                        return;
                    }

                    if (this.authSwitcher.failureCount > 0) {
                        this.logger.info(`✅ [Auth] Claude request successful - failure count reset to 0`);
                        this.authSwitcher.failureCount = 0;
                    }

                    // Use the queue that successfully received the initial message
                    const activeQueue = result.queue;

                    if (isClaudeStream) {
                        // Fake stream
                        if (!res.headersSent) {
                            res.status(200).set({
                                "Cache-Control": "no-cache",
                                Connection: "keep-alive",
                                "Content-Type": "text/event-stream",
                            });
                        }
                        if (connectionMaintainer) clearTimeout(connectionMaintainer);

                        this.logger.info(`[Request] Claude streaming response (Fake Mode) started...`);
                        let fullBody = "";
                        try {
                            // eslint-disable-next-line no-constant-condition
                            while (true) {
                                const message = await activeQueue.dequeue(this.timeouts.FAKE_STREAM);
                                if (message.type === "STREAM_END") {
                                    break;
                                }

                                if (message.event_type === "error") {
                                    this.logger.error(
                                        `[Request] Error received during Claude fake stream: ${message.message}`
                                    );
                                    // Check if response is still writable before attempting to write
                                    if (this._isResponseWritable(res)) {
                                        try {
                                            res.write(
                                                `event: error\ndata: ${JSON.stringify({
                                                    error: {
                                                        message: message.message,
                                                        type: "api_error",
                                                    },
                                                    type: "error",
                                                })}\n\n`
                                            );
                                        } catch (writeError) {
                                            this.logger.debug(
                                                `[Request] Failed to write error to Claude fake stream: ${writeError.message}`
                                            );
                                        }
                                    }
                                    break;
                                }

                                if (message.data) fullBody += message.data;
                            }
                            const streamState = {};
                            const translatedChunk = this.formatConverter.translateGoogleToClaudeStream(
                                fullBody,
                                model,
                                streamState
                            );
                            if (translatedChunk) res.write(translatedChunk);
                            this.logger.info("[Request] Claude fake mode: Complete content sent at once.");
                        } catch (error) {
                            // Handle timeout or other errors during streaming
                            if (this._isResponseWritable(res)) {
                                try {
                                    res.write(
                                        `event: error\ndata: ${JSON.stringify({
                                            error: {
                                                message: `Stream timeout: ${error.message}`,
                                                type: "timeout_error",
                                            },
                                            type: "error",
                                        })}\n\n`
                                    );
                                } catch (writeError) {
                                    this.logger.debug(
                                        `[Request] Failed to write fake stream timeout error to client: ${writeError.message}`
                                    );
                                }
                            }
                        }
                    } else {
                        // Non-stream
                        await this._sendClaudeNonStreamResponse(activeQueue, res, model);
                    }
                } finally {
                    if (connectionMaintainer) clearTimeout(connectionMaintainer);
                }
            }
        } catch (error) {
            // Don't log as error if it's just a client disconnect
            if (this._isConnectionResetError(error)) {
                this.logger.info(`[Request] Request terminated: Queue closed (${error.reason || "connection_lost"})`);
            } else {
                this._handleClaudeRequestError(error, res);
            }
        } finally {
            this.connectionRegistry.removeMessageQueue(requestId, "request_complete");
            if (this.needsSwitchingAfterRequest) {
                this.logger.info(
                    `[Auth] Rotation count reached switching threshold (${this.authSwitcher.usageCount}/${this.config.switchOnUses}), will automatically switch account in background...`
                );
                this.authSwitcher.switchToNextAuth().catch(err => {
                    this.logger.error(`[Auth] Background account switching task failed: ${err.message}`);
                });
                this.needsSwitchingAfterRequest = false;
            }
            if (!res.writableEnded) res.end();
        }
    }

    // Process Claude count tokens request
    async processClaudeCountTokens(req, res) {
        const requestId = this._generateRequestId();

        // Check current account's browser connection
        if (!this.connectionRegistry.getConnectionByAuth(this.currentAuthIndex)) {
            this.logger.warn(`[Request] No WebSocket connection for current account #${this.currentAuthIndex}`);
            const recovered = await this._handleBrowserRecovery(res);
            if (!recovered) return;
        }

        // Wait for system to become ready if it's busy
        if (this.authSwitcher.isSystemBusy) {
            const ready = await this._waitForSystemReady();
            if (!ready) {
                return this._sendClaudeErrorResponse(
                    res,
                    503,
                    "overloaded_error",
                    "Server undergoing internal maintenance, please try again later."
                );
            }
            if (!this.connectionRegistry.getConnectionByAuth(this.currentAuthIndex)) {
                const connectionReady = await this._waitForConnection(10000);
                if (!connectionReady) {
                    return this._sendClaudeErrorResponse(
                        res,
                        503,
                        "overloaded_error",
                        "Service temporarily unavailable: Connection not established."
                    );
                }
            }
        }

        if (this.browserManager) {
            this.browserManager.notifyUserActivity();
        }

        // Translate Claude format to Google format
        let googleBody, model;
        try {
            const result = await this.formatConverter.translateClaudeToGoogle(req.body);
            googleBody = result.googleRequest;
            model = result.cleanModelName;
        } catch (error) {
            this.logger.error(`[Adapter] Claude request translation failed: ${error.message}`);
            return this._sendClaudeErrorResponse(res, 400, "invalid_request_error", "Invalid Claude request format.");
        }

        // Build countTokens request
        // Per Gemini API docs, countTokens accepts:
        // - contents[] (simple mode)
        // - generateContentRequest (full request with model, contents, tools, systemInstruction, etc.)
        const countTokensBody = {
            generateContentRequest: {
                model: `models/${model}`,
                ...googleBody,
            },
        };

        const proxyRequest = {
            body: JSON.stringify(countTokensBody),
            headers: { "Content-Type": "application/json" },
            is_generative: false,
            method: "POST",
            path: `/v1beta/models/${model}:countTokens`,
            query_params: {},
            request_id: requestId,
        };

        const messageQueue = this.connectionRegistry.createMessageQueue(requestId, this.currentAuthIndex);

        this._setupClientDisconnectHandler(res, requestId);

        try {
            this._forwardRequest(proxyRequest);
            const response = await messageQueue.dequeue();

            if (response.event_type === "error") {
                this.logger.error(
                    `[Request] Received error from browser, will trigger switching logic. Status code: ${response.status}, message: ${response.message}`
                );
                this._sendClaudeErrorResponse(res, response.status || 500, "api_error", response.message);
                if (!this._isConnectionResetError(response)) {
                    await this.authSwitcher.handleRequestFailureAndSwitch(response, null);
                }
                return;
            }

            // For non-streaming requests, consume all chunks until STREAM_END
            let fullBody = "";
            if (response.type !== "STREAM_END") {
                if (response.data) fullBody += response.data;
                // eslint-disable-next-line no-constant-condition
                while (true) {
                    const message = await messageQueue.dequeue();
                    if (message.type === "STREAM_END") {
                        break;
                    }
                    if (message.event_type === "error") {
                        this.logger.error(`[Request] Error received during count tokens: ${message.message}`);
                        return this._sendClaudeErrorResponse(res, 500, "api_error", message.message);
                    }
                    if (message.data) fullBody += message.data;
                }
            }

            // Parse Gemini response
            const geminiResponse = JSON.parse(fullBody || response.body);
            const totalTokens = geminiResponse.totalTokens || 0;

            // Reset failure count on success
            if (this.authSwitcher.failureCount > 0) {
                this.logger.info(
                    `✅ [Auth] Count tokens request successful - failure count reset from ${this.authSwitcher.failureCount} to 0`
                );
                this.authSwitcher.failureCount = 0;
            }

            // Return Claude-compatible response
            res.status(200).json({
                input_tokens: totalTokens,
            });

            this.logger.info(`[Request] Claude count tokens completed: ${totalTokens} input tokens`);
        } catch (error) {
            // Don't log as error if it's just a client disconnect
            if (this._isConnectionResetError(error)) {
                this.logger.info(`[Request] Request terminated: Queue closed (${error.reason || "connection_lost"})`);
            } else {
                this._handleClaudeRequestError(error, res);
            }
        } finally {
            this.connectionRegistry.removeMessageQueue(requestId, "request_complete");
            if (!res.writableEnded) res.end();
        }
    }

    // === Response Handlers ===

    async _streamClaudeResponse(messageQueue, res, model) {
        const streamState = {};

        try {
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const message = await messageQueue.dequeue(this.timeouts.STREAM_CHUNK);

                if (message.type === "STREAM_END") {
                    this.logger.info("[Request] Claude stream end signal received.");
                    break;
                }

                if (message.event_type === "error") {
                    this.logger.error(`[Request] Error received during Claude stream: ${message.message}`);
                    // Attempt to send error event to client if headers allowed, then close
                    // Check if response is still writable before attempting to write
                    if (this._isResponseWritable(res)) {
                        try {
                            res.write(
                                `event: error\ndata: ${JSON.stringify({
                                    error: {
                                        message: message.message,
                                        type: "api_error",
                                    },
                                    type: "error",
                                })}\n\n`
                            );
                        } catch (writeError) {
                            this.logger.debug(
                                `[Request] Failed to write error to Claude stream: ${writeError.message}`
                            );
                        }
                    }
                    break;
                }

                if (message.data) {
                    const claudeChunk = this.formatConverter.translateGoogleToClaudeStream(
                        message.data,
                        model,
                        streamState
                    );
                    if (claudeChunk) {
                        res.write(claudeChunk);
                    }
                }
            }
        } catch (error) {
            // Handle timeout or other errors during streaming
            // Don't attempt to write if it's a connection reset (client disconnect) or if response is destroyed
            if (this._isConnectionResetError(error)) {
                this.logger.debug("[Request] Claude stream interrupted by connection reset, skipping error write");
                return;
            }

            // Check if response is still writable before attempting to write
            if (this._isResponseWritable(res)) {
                try {
                    res.write(
                        `event: error\ndata: ${JSON.stringify({
                            error: {
                                message: `Stream timeout: ${error.message}`,
                                type: "timeout_error",
                            },
                            type: "error",
                        })}\n\n`
                    );
                } catch (writeError) {
                    this.logger.debug(
                        `[Request] Failed to write error to Claude stream (connection likely closed): ${writeError.message}`
                    );
                }
            }
        }
    }

    async _sendClaudeNonStreamResponse(messageQueue, res, model) {
        let fullBody = "";
        let receiving = true;
        while (receiving) {
            const message = await messageQueue.dequeue();
            if (message.type === "STREAM_END") {
                this.logger.info("[Request] Claude received end signal.");
                receiving = false;
                break;
            }

            if (message.event_type === "error") {
                this.logger.error(`[Adapter] Error during Claude non-stream conversion: ${message.message}`);
                this._sendClaudeErrorResponse(res, 500, "api_error", message.message);
                return;
            }

            if (message.event_type === "chunk" && message.data) {
                fullBody += message.data;
            }
        }

        try {
            const googleResponse = JSON.parse(fullBody);
            const claudeResponse = this.formatConverter.convertGoogleToClaudeNonStream(googleResponse, model);
            res.type("application/json").send(JSON.stringify(claudeResponse));
        } catch (e) {
            this.logger.error(`[Adapter] Failed to parse response for Claude: ${e.message}`);
            this._sendClaudeErrorResponse(res, 500, "api_error", "Failed to parse backend response");
        }
    }

    _sendClaudeErrorResponse(res, status, errorType, message) {
        if (!res.headersSent) {
            res.status(status)
                .type("application/json")
                .send(
                    JSON.stringify({
                        error: {
                            message,
                            type: errorType,
                        },
                        type: "error",
                    })
                );
        }
    }

    _handleClaudeRequestError(error, res) {
        // Normalize error message to handle non-Error objects and missing/non-string messages
        const errorMsg = String(error?.message ?? error);
        const errorMsgLower = errorMsg.toLowerCase();

        if (res.headersSent) {
            this.logger.error(`[Request] Claude request error (headers already sent): ${errorMsg}`);
            if (!res.writableEnded) res.end();
        } else {
            this.logger.error(`[Request] Claude request error: ${errorMsg}`);
            let status = 500;
            let errorType = "api_error";
            if (errorMsgLower.includes("timeout")) {
                status = 504;
                errorType = "timeout_error";
            } else if (this._isConnectionResetError(error)) {
                status = 503;
                errorType = "overloaded_error";
            }
            this._sendClaudeErrorResponse(res, status, errorType, `Proxy error: ${errorMsg}`);
        }
    }

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

                if (isUserAbortedError(result.error)) {
                    this.logger.info(
                        `[Request] Request #${proxyRequest.request_id} was properly cancelled by user, not counted in failure statistics.`
                    );
                } else {
                    this.logger.error(
                        `[Request] All ${this.maxRetries} retries failed, will be counted in failure statistics.`
                    );

                    // Send standard HTTP error response
                    this._sendErrorResponse(res, result.error.status || 500, result.error.message);

                    // Avoid switching account if the error is just a connection reset
                    if (!this._isConnectionResetError(result.error)) {
                        await this.authSwitcher.handleRequestFailureAndSwitch(result.error, null);
                    } else {
                        this.logger.info(
                            "[Request] Failure due to connection reset (Gemini Non-Stream), skipping account switch."
                        );
                    }
                }
                return;
            }

            if (proxyRequest.is_generative && this.authSwitcher.failureCount > 0) {
                this.logger.info(
                    `✅ [Auth] Generation request successful - failure count reset from ${this.authSwitcher.failureCount} to 0`
                );
                this.authSwitcher.failureCount = 0;
            }

            // Use the queue that successfully received the initial message
            const activeQueue = result.queue;

            if (!res.headersSent) {
                res.setHeader("Content-Type", "text/event-stream");
                res.setHeader("Cache-Control", "no-cache");
                res.setHeader("Connection", "keep-alive");
            }
            // Clear the keep-alive timer as we are about to send real data
            clearTimeout(connectionMaintainer);

            // Read all data chunks until STREAM_END to handle potential fragmentation
            let fullData = "";
            try {
                // eslint-disable-next-line no-constant-condition
                while (true) {
                    const message = await activeQueue.dequeue(this.timeouts.FAKE_STREAM); // 5 min timeout for fake streaming
                    if (message.type === "STREAM_END") {
                        break;
                    }

                    if (message.event_type === "error") {
                        this.logger.error(`[Request] Error received during Gemini pseudo-stream: ${message.message}`);
                        this._sendErrorChunkToClient(res, message.message);
                        break;
                    }

                    if (message.data) {
                        fullData += message.data;
                    }
                }
            } catch (error) {
                // Handle timeout or other errors during streaming
                // Don't attempt to write if it's a connection reset or if response is destroyed
                if (!this._isConnectionResetError(error)) {
                    // Check if response is still writable before attempting to write
                    if (this._isResponseWritable(res)) {
                        try {
                            res.write(
                                `data: ${JSON.stringify({ error: { code: 504, message: `Stream timeout: ${error.message}`, status: "TIMEOUT" } })}\n\n`
                            );
                        } catch (writeError) {
                            this.logger.debug(
                                `[Request] Failed to write error to Gemini pseudo-stream: ${writeError.message}`
                            );
                        }
                    }
                } else {
                    this.logger.debug(
                        "[Request] Gemini pseudo-stream interrupted by connection reset, skipping error write"
                    );
                }
                // Return early to prevent JSON parsing of incomplete data
                return;
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
            // Don't log as error if it's just a client disconnect
            if (this._isConnectionResetError(error)) {
                this.logger.info(`[Request] Request terminated: Queue closed (${error.reason || "connection_lost"})`);
            } else {
                this._handleRequestError(error, res);
            }
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
            if (isUserAbortedError(headerMessage)) {
                this.logger.info(
                    `[Request] Request #${proxyRequest.request_id} was properly cancelled by user, not counted in failure statistics.`
                );
            } else {
                this.logger.error(`[Request] Request failed, will be counted in failure statistics.`);
                // Avoid switching account if the error is just a connection reset
                if (!this._isConnectionResetError(headerMessage)) {
                    await this.authSwitcher.handleRequestFailureAndSwitch(headerMessage, null);
                } else {
                    this.logger.info(
                        "[Request] Failure due to connection reset (Gemini Real Stream), skipping account switch."
                    );
                }
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
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const dataMessage = await messageQueue.dequeue(this.timeouts.STREAM_CHUNK);
                if (dataMessage.type === "STREAM_END") {
                    this.logger.info("[Request] Received stream end signal.");
                    break;
                }

                if (dataMessage.event_type === "error") {
                    this.logger.error(`[Request] Error received during Gemini real stream: ${dataMessage.message}`);
                    // Check if response is still writable before attempting to write
                    if (this._isResponseWritable(res)) {
                        try {
                            res.write(
                                `data: ${JSON.stringify({ error: { code: 500, message: dataMessage.message, status: "INTERNAL_ERROR" } })}\n\n`
                            );
                        } catch (writeError) {
                            this.logger.debug(
                                `[Request] Failed to write error to Gemini real stream: ${writeError.message}`
                            );
                        }
                    }
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
                if (isUserAbortedError(result.error)) {
                    this.logger.info(`[Request] Request #${proxyRequest.request_id} was properly cancelled by user.`);
                } else {
                    this.logger.error(`[Request] Browser returned error after retries: ${result.error.message}`);
                    // Avoid switching account if the error is just a connection reset
                    if (!this._isConnectionResetError(result.error)) {
                        await this.authSwitcher.handleRequestFailureAndSwitch(result.error, null);
                    } else {
                        this.logger.info(
                            "[Request] Failure due to connection reset (Gemini Non-Stream), skipping account switch."
                        );
                    }
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

            // Use the queue that successfully received the initial message
            const activeQueue = result.queue;

            const headerMessage = result.message;
            const chunks = [];
            let receiving = true;
            while (receiving) {
                const message = await activeQueue.dequeue();
                if (message.type === "STREAM_END") {
                    this.logger.info("[Request] Received end signal, data reception complete.");
                    receiving = false;
                    break;
                }

                if (message.event_type === "error") {
                    this.logger.error(`[Request] Error received during Gemini non-stream: ${message.message}`);
                    this._sendErrorResponse(res, 500, message.message);
                    return;
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
        let currentQueue = messageQueue;
        // Track the authIndex for the current queue to ensure proper cleanup
        let currentQueueAuthIndex = this.currentAuthIndex;

        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                this._forwardRequest(proxyRequest);

                const initialMessage = await currentQueue.dequeue();

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

                // Success, return the initial message and the queue that received it
                return { message: initialMessage, queue: currentQueue, success: true };
            } catch (error) {
                // Parse the structured error message
                let errorPayload;
                try {
                    errorPayload = JSON.parse(error.message);
                } catch (e) {
                    errorPayload = { message: error.message, status: 500 };
                }

                // Stop retrying immediately if the queue is closed (connection reset)
                if (this._isConnectionResetError(error)) {
                    this.logger.warn(
                        `[Request] Message queue closed unexpectedly (likely due to connection reset), aborting retries.`
                    );
                    lastError = { message: "Connection lost (client disconnect)", status: 503 };
                    break;
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

                // CRITICAL FIX: Cancel browser request on the ORIGINAL account that owns this queue
                // If account has switched, currentAuthIndex may differ from currentQueueAuthIndex
                this._cancelBrowserRequest(proxyRequest.request_id, currentQueueAuthIndex);

                // CRITICAL FIX: Explicitly close the old queue before creating a new one
                // This ensures waitingResolvers are properly rejected even if authIndex changed
                try {
                    currentQueue.close("retry_creating_new_queue");
                } catch (e) {
                    this.logger.debug(`[Request] Failed to close old queue before retry: ${e.message}`);
                }

                // Create a new message queue for the retry with CURRENT account
                // Note: We keep the same requestId so the browser response routes to the new queue
                // createMessageQueue will automatically close and remove any existing queue with the same ID from the registry
                this.logger.debug(
                    `[Request] Creating new message queue for retry #${attempt + 1} for request #${proxyRequest.request_id} (switching from account #${currentQueueAuthIndex} to #${this.currentAuthIndex})`
                );
                currentQueue = this.connectionRegistry.createMessageQueue(
                    proxyRequest.request_id,
                    this.currentAuthIndex
                );
                // Update tracked authIndex for the new queue
                currentQueueAuthIndex = this.currentAuthIndex;

                // Wait before the next retry
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
            }
        }

        // After all retries, return the final failure result
        return { error: lastError, success: false };
    }

    async _streamOpenAIResponse(messageQueue, res, model) {
        const streamState = {};

        try {
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const message = await messageQueue.dequeue(this.timeouts.STREAM_CHUNK);
                if (message.type === "STREAM_END") {
                    this.logger.info("[Request] OpenAI stream end signal received.");
                    res.write("data: [DONE]\n\n");
                    break;
                }

                if (message.event_type === "error") {
                    this.logger.error(`[Request] Error received during OpenAI stream: ${message.message}`);
                    // Attempt to send error event to client if headers allowed, then close
                    // Check if response is still writable before attempting to write
                    if (this._isResponseWritable(res)) {
                        try {
                            res.write(
                                `data: ${JSON.stringify({ error: { code: 500, message: message.message, type: "api_error" } })}\n\n`
                            );
                        } catch (writeError) {
                            this.logger.debug(
                                `[Request] Failed to write error to OpenAI stream: ${writeError.message}`
                            );
                        }
                    }
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
        } catch (error) {
            // Handle timeout or other errors during streaming
            // Don't attempt to write if it's a connection reset (client disconnect) or if response is destroyed
            if (this._isConnectionResetError(error)) {
                this.logger.debug("[Request] OpenAI stream interrupted by connection reset, skipping error write");
                return;
            }

            // Check if response is still writable before attempting to write
            if (this._isResponseWritable(res)) {
                try {
                    res.write(
                        `data: ${JSON.stringify({ error: { code: 504, message: `Stream timeout: ${error.message}`, type: "timeout_error" } })}\n\n`
                    );
                } catch (writeError) {
                    this.logger.debug(
                        `[Request] Failed to write error to OpenAI stream (connection likely closed): ${writeError.message}`
                    );
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
                this.logger.info("[Request] OpenAI received end signal.");
                receiving = false;
                break;
            }

            if (message.event_type === "error") {
                this.logger.error(`[Adapter] Error during OpenAI non-stream conversion: ${message.message}`);
                this._sendErrorResponse(res, 500, message.message);
                return;
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
            this.logger.error(`[Adapter] Failed to parse response for OpenAI: ${e.message}`);
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
        // Normalize error message to handle non-Error objects and missing/non-string messages
        const errorMsg = String(error?.message ?? error);
        const errorMsgLower = errorMsg.toLowerCase();

        if (res.headersSent) {
            this.logger.error(`[Request] Request processing error (headers already sent): ${errorMsg}`);

            // Try to send error in the stream format
            if (this._isResponseWritable(res)) {
                const contentType = res.getHeader("content-type");

                if (contentType && contentType.includes("text/event-stream")) {
                    // SSE format - send error event
                    try {
                        const errorMessage = errorMsgLower.includes("timeout")
                            ? `Stream timeout: ${errorMsg}`
                            : `Processing failed: ${errorMsg}`;

                        res.write(
                            `data: ${JSON.stringify({
                                error: {
                                    code: errorMsgLower.includes("timeout") ? 504 : 500,
                                    message: errorMessage,
                                    type: errorMsgLower.includes("timeout") ? "timeout_error" : "api_error",
                                },
                            })}\n\n`
                        );
                        this.logger.info("[Request] Error event sent to SSE stream");
                    } catch (writeError) {
                        const writeErrorMsg = String(writeError?.message ?? writeError);
                        this.logger.error(`[Request] Failed to write error to stream: ${writeErrorMsg}`);
                    }
                } else if (this.serverSystem.streamingMode === "fake") {
                    // Fake streaming mode - try to send error chunk
                    try {
                        this._sendErrorChunkToClient(res, `Processing failed: ${errorMsg}`);
                    } catch (writeError) {
                        const writeErrorMsg = String(writeError?.message ?? writeError);
                        this.logger.error(`[Request] Failed to write error chunk: ${writeErrorMsg}`);
                    }
                }

                try {
                    res.end();
                } catch (endError) {
                    this.logger.debug(`[Request] Failed to end response: ${endError.message}`);
                }
            }
        } else {
            this.logger.error(`[Request] Request processing error: ${errorMsg}`);
            let status = 500;
            if (errorMsgLower.includes("timeout")) {
                status = 504;
            } else if (this._isConnectionResetError(error)) {
                status = 503;
                // Only log as debug for client disconnect, log as info for other connection resets
                if (error.code === "QUEUE_CLOSED" || error instanceof QueueClosedError) {
                    this.logger.debug("[Request] Client disconnect detected, returning 503 Service Unavailable.");
                } else {
                    this.logger.info("[Request] Connection reset detected, returning 503 Service Unavailable.");
                }
            }
            this._sendErrorResponse(res, status, `Proxy error: ${errorMsg}`);
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

    _isResponseWritable(res) {
        // Comprehensive check to ensure response is writable
        return (
            !res.writableEnded && !res.destroyed && res.socket && !res.socket.destroyed && res.socket.writable !== false
        );
    }

    _sendErrorChunkToClient(res, message) {
        if (!res.headersSent) {
            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Connection", "keep-alive");
        }
        // Check if response is still writable before attempting to write
        if (this._isResponseWritable(res)) {
            try {
                res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
            } catch (writeError) {
                this.logger.debug(`[Request] Failed to write error chunk to client: ${writeError.message}`);
            }
        }
    }

    _setupClientDisconnectHandler(res, requestId) {
        res.on("close", () => {
            if (!res.writableEnded) {
                this.logger.warn(`[Request] Client closed request #${requestId} connection prematurely.`);

                // Dynamically look up the current authIndex from the connection registry
                // This ensures we cancel on the correct account even after retries switch accounts
                const targetAuthIndex =
                    this.connectionRegistry.getAuthIndexForRequest(requestId) ?? this.currentAuthIndex;

                this._cancelBrowserRequest(requestId, targetAuthIndex);
                // Close and remove the message queue to unblock any waiting dequeue() calls
                this.connectionRegistry.removeMessageQueue(requestId, "client_disconnect");
            }
        });
    }

    _cancelBrowserRequest(requestId, authIndex) {
        const targetAuthIndex = authIndex !== undefined ? authIndex : this.currentAuthIndex;
        const connection = this.connectionRegistry.getConnectionByAuth(targetAuthIndex);
        if (connection) {
            this.logger.info(`[Request] Cancelling request #${requestId} on account #${targetAuthIndex}`);
            connection.send(
                JSON.stringify({
                    event_type: "cancel_request",
                    request_id: requestId,
                })
            );
        } else {
            this.logger.warn(
                `[Request] Unable to send cancel instruction: No available WebSocket connection for account #${targetAuthIndex}.`
            );
        }
    }

    /**
     * Set browser (build.js) log level at runtime for all active contexts
     * @param {string} level - 'DEBUG', 'INFO', 'WARN', or 'ERROR'
     * @returns {number} Number of browser contexts updated (0 if none)
     */
    setBrowserLogLevel(level) {
        const validLevels = ["DEBUG", "INFO", "WARN", "ERROR"];
        const upperLevel = level?.toUpperCase();

        if (!validLevels.includes(upperLevel)) {
            return 0;
        }

        // Broadcast to all active browser contexts
        const sentCount = this.connectionRegistry.broadcastMessage(
            JSON.stringify({
                event_type: "set_log_level",
                level: upperLevel,
            })
        );

        if (sentCount > 0) {
            this.logger.info(`[Config] Browser log level set to: ${upperLevel} (${sentCount} context(s) updated)`);

            // Also update server-side LoggingService level to keep in sync
            const LoggingService = require("../utils/LoggingService");
            LoggingService.setLevel(upperLevel);
            this.logger.info(`[Config] Server log level synchronized to: ${upperLevel}`);

            return sentCount;
        } else {
            this.logger.warn(`[Config] Unable to set browser log level: No active WebSocket connections.`);
            return 0;
        }
    }

    _buildProxyRequest(req, requestId) {
        const fullPath = req.path;
        let cleanPath = fullPath.replace(/^\/proxy/, "");
        const bodyObj = req.body;

        this.logger.debug(`[Proxy] Debug: incoming Gemini Body (Google Native) = ${JSON.stringify(bodyObj, null, 2)}`);

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

        this.logger.debug(`[Proxy] Debug: Final Gemini Request (Google Native) = ${JSON.stringify(bodyObj, null, 2)}`);

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
        const connection = this.connectionRegistry.getConnectionByAuth(this.currentAuthIndex);
        if (connection) {
            this.logger.debug(
                `[Request] Forwarding request #${proxyRequest.request_id} via connection for authIndex=${this.currentAuthIndex}`
            );
            connection.send(
                JSON.stringify({
                    event_type: "proxy_request",
                    ...proxyRequest,
                })
            );
        } else {
            throw new Error(
                `Unable to forward request: No WebSocket connection found for authIndex=${this.currentAuthIndex}`
            );
        }
    }

    _generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    }
}

module.exports = RequestHandler;

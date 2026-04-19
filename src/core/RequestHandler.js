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
const { QueueClosedError, QueueTimeoutError } = require("../utils/MessageQueue");

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

    _getUsageStatsService() {
        return this.serverSystem.usageStatsService || null;
    }

    _getAccountNameForIndex(authIndex) {
        if (!Number.isInteger(authIndex) || authIndex < 0) {
            return null;
        }

        return this.authSource?.accountNameMap?.get(authIndex) || null;
    }

    _getClientIp(req) {
        return this.serverSystem.webRoutes.authRoutes.getClientIP(req);
    }

    _extractModelFromPath(pathValue) {
        if (typeof pathValue !== "string") return null;

        const match = pathValue.match(/\/models\/([^:/?]+)(?::|$)/);
        return match?.[1] || null;
    }

    _categorizeRequest(pathValue, fallback = "request") {
        if (typeof pathValue !== "string") return fallback;
        if (pathValue.includes("countTokens") || pathValue.includes("input_tokens")) return "count_tokens";
        if (pathValue.includes("generateContent") || pathValue.includes("streamGenerateContent")) return "generation";
        if (pathValue.includes("/upload/")) return "upload";
        return fallback;
    }

    _startTrackedRequest(requestId, req, meta = {}) {
        const usageStatsService = this._getUsageStatsService();
        if (!usageStatsService) return;

        usageStatsService.startRequest(requestId, {
            clientIp: this._getClientIp(req),
            initialAccountName: this._getAccountNameForIndex(this.currentAuthIndex),
            initialAuthIndex: this.currentAuthIndex,
            method: req.method,
            path: req.path,
            ...meta,
        });
    }

    _updateTrackedRequest(requestId, patch = {}) {
        const usageStatsService = this._getUsageStatsService();
        if (!usageStatsService) return;
        usageStatsService.updateRequest(requestId, patch);
    }

    _finalizeTrackedRequest(requestId, res, overrides = {}) {
        const usageStatsService = this._getUsageStatsService();
        if (!usageStatsService) return;

        let outcome = overrides.outcome;
        if (!outcome) {
            if (res.__usageTrackingClientAborted) {
                outcome = "aborted";
            } else if (res.__usageTrackingOutcome) {
                outcome = res.__usageTrackingOutcome;
            } else {
                const statusCode = Number.isFinite(res.statusCode) ? Number(res.statusCode) : null;
                outcome = statusCode !== null && statusCode >= 400 ? "error" : "success";
            }
        }

        const statusCode =
            overrides.statusCode ??
            res.__usageTrackingErrorStatus ??
            (Number.isFinite(res.statusCode) && res.statusCode > 0 ? Number(res.statusCode) : null);

        const errorMessage =
            overrides.errorMessage ??
            res.__usageTrackingErrorMessage ??
            (outcome === "error" ? "Request failed" : null);

        usageStatsService.finishRequest(requestId, {
            errorMessage,
            finalAccountName: overrides.finalAccountName,
            finalAuthIndex: overrides.finalAuthIndex,
            outcome,
            statusCode,
        });
    }

    _markTrackedResponseError(res, message, statusCode = null, outcome = "error") {
        if (!res) return;
        res.__usageTrackingOutcome = outcome;
        res.__usageTrackingErrorMessage = message || null;
        if (Number.isFinite(statusCode)) {
            res.__usageTrackingErrorStatus = Number(statusCode);
        }
    }

    _markTrackedClientAbort(res, message = "Client disconnected") {
        if (!res) return;
        res.__usageTrackingClientAborted = true;
        res.__usageTrackingOutcome = "aborted";
        res.__usageTrackingErrorMessage = message;
    }

    _markTrackedEarlyExitIfNeeded(res, message = "Service temporarily unavailable.", statusCode = 503) {
        if (!res || res.__usageTrackingClientAborted || res.__usageTrackingOutcome) return;
        if (!this._isResponseWritable(res)) {
            this._markTrackedClientAbort(res, message);
            return;
        }
        this._markTrackedResponseError(res, message, statusCode);
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

    _logGeminiNativeChunkDebug(googleChunk, mode = "stream") {
        this.logger.debug(`[Proxy] Debug: Received Google chunk for Gemini native ${mode}: ${googleChunk}`);
    }

    _logGeminiNativeResponseDebug(googleResponse, mode = "non-stream") {
        try {
            this.logger.debug(
                `[Proxy] Debug: Received Google response for Gemini native ${mode}: ${JSON.stringify(googleResponse)}`
            );
        } catch (e) {
            this.logger.debug(
                `[Proxy] Debug: Received Google response for Gemini native ${mode} (non-serializable): ${String(
                    googleResponse
                )}`
            );
        }
    }

    /**
     * Handle queue closed error in real streaming mode with proper SSE error response
     * @param {Error} error - The error object (QueueClosedError)
     * @param {Object} res - Express response object
     * @param {string} format - Response format ('openai', 'response_api', 'claude', or 'gemini')
     * @returns {boolean} true if error was handled, false otherwise
     */
    _handleRealStreamQueueClosedError(error, res, format) {
        const isClientDisconnect = error.reason === "client_disconnect" || !this._isResponseWritable(res);

        if (isClientDisconnect) {
            // Client disconnected or queue closed due to client disconnect - no error needed
            this._markTrackedClientAbort(res, error.message || "Client disconnected");
            this.logger.debug(
                `[Request] ${format} stream interrupted by client disconnect (reason: ${error.reason || "connection_lost"})`
            );
            return true;
        }

        // Queue was closed for other reasons (account switch, page_closed, etc.)
        // but client is still connected - send proper error SSE
        this.logger.warn(
            `[Request] ${format} stream interrupted: Queue closed (reason: ${error.reason || "unknown"}), sending error SSE`
        );

        if (!this._isResponseWritable(res)) {
            return true;
        }

        try {
            const errorMessage = `Stream interrupted: ${error.reason === "page_closed" ? "Account context closed" : error.reason || "Connection lost"}`;
            this._markTrackedResponseError(res, errorMessage, 503);

            if (format === "claude") {
                // Claude format: event: error\ndata: {...}
                res.write(
                    `event: error\ndata: ${JSON.stringify({
                        error: {
                            message: errorMessage,
                            type: "api_error",
                        },
                        type: "error",
                    })}\n\n`
                );
            } else if (format === "openai") {
                // OpenAI format: data: {"error": {...}}
                res.write(
                    `data: ${JSON.stringify({
                        error: {
                            code: 503,
                            message: errorMessage,
                            type: "api_error",
                        },
                    })}\n\n`
                );
            } else if (format === "response_api") {
                // OpenAI Response API format: event: error\ndata: {...}
                if (res.__responseApiSeq == null) res.__responseApiSeq = 0;
                res.__responseApiSeq += 1;
                res.write(
                    `event: error\ndata: ${JSON.stringify({
                        code: "service_unavailable",
                        message: `Service unavailable: ${errorMessage}`,
                        param: null,
                        sequence_number: res.__responseApiSeq,
                        type: "error",
                    })}\n\n`
                );
            } else if (format === "gemini") {
                // Gemini format: data: {"error": {...}}
                res.write(
                    `data: ${JSON.stringify({
                        error: {
                            code: 503,
                            message: errorMessage,
                            status: "UNAVAILABLE",
                        },
                    })}\n\n`
                );
            }
        } catch (writeError) {
            this.logger.debug(`[Request] Failed to write error to ${format} stream: ${writeError.message}`);
        }

        return true;
    }

    /**
     * Classify and handle fake stream errors
     * @param {Error} error - The error object
     * @param {Object} res - Express response object
     * @param {string} format - Response format ('openai', 'response_api', 'claude', or 'gemini')
     * @throws {Error} Rethrows unexpected errors for outer handler
     */
    _handleFakeStreamError(error, res, format) {
        if (!this._isResponseWritable(res)) {
            return; // Client disconnected, no need to send error
        }

        try {
            let errorPayload;
            let trackingStatus = 500;
            let trackingMessage = String(error?.message ?? error);

            if (error.code === "QUEUE_TIMEOUT" || error instanceof QueueTimeoutError) {
                // True timeout error - 504
                trackingStatus = 504;
                trackingMessage = `Stream timeout: ${trackingMessage}`;
                if (format === "openai") {
                    errorPayload = {
                        error: {
                            code: 504,
                            message: `Stream timeout: ${error.message}`,
                            type: "timeout_error",
                        },
                    };
                    if (this._isResponseWritable(res)) {
                        res.write(`data: ${JSON.stringify(errorPayload)}\n\n`);
                    }
                } else if (format === "claude") {
                    errorPayload = {
                        error: {
                            message: `Stream timeout: ${error.message}`,
                            type: "timeout_error",
                        },
                        type: "error",
                    };
                    if (this._isResponseWritable(res)) {
                        res.write(`event: error\ndata: ${JSON.stringify(errorPayload)}\n\n`);
                    }
                } else if (format === "response_api") {
                    // OpenAI Response API format
                    errorPayload = {
                        code: "timeout_error",
                        message: `Stream timeout: ${error.message}`,
                        param: null,
                        sequence_number: 0,
                        type: "error",
                    };
                    if (res.__responseApiSeq == null) res.__responseApiSeq = 0;
                    res.__responseApiSeq += 1;
                    errorPayload.sequence_number = res.__responseApiSeq;
                    if (this._isResponseWritable(res)) {
                        res.write(`event: error\ndata: ${JSON.stringify(errorPayload)}\n\n`);
                    }
                } else {
                    // gemini
                    errorPayload = {
                        error: {
                            code: 504,
                            message: `Stream timeout: ${error.message}`,
                            status: "DEADLINE_EXCEEDED",
                        },
                    };
                    if (this._isResponseWritable(res)) {
                        res.write(`data: ${JSON.stringify(errorPayload)}\n\n`);
                    }
                }
            } else if (error.code === "QUEUE_CLOSED" || error instanceof QueueClosedError) {
                // Queue closed (account switch, system reset, etc.) - 503
                trackingStatus = 503;
                trackingMessage = `Service unavailable: ${trackingMessage}`;
                if (format === "openai") {
                    errorPayload = {
                        error: {
                            code: 503,
                            message: `Service unavailable: ${error.message}`,
                            type: "service_unavailable",
                        },
                    };
                    if (this._isResponseWritable(res)) {
                        res.write(`data: ${JSON.stringify(errorPayload)}\n\n`);
                    }
                } else if (format === "claude") {
                    errorPayload = {
                        error: {
                            message: `Service unavailable: ${error.message}`,
                            type: "overloaded_error",
                        },
                        type: "error",
                    };
                    if (this._isResponseWritable(res)) {
                        res.write(`event: error\ndata: ${JSON.stringify(errorPayload)}\n\n`);
                    }
                } else if (format === "response_api") {
                    // OpenAI Response API format
                    errorPayload = {
                        code: "service_unavailable",
                        message: `Service unavailable: ${error.message}`,
                        param: null,
                        sequence_number: 0,
                        type: "error",
                    };
                    if (res.__responseApiSeq == null) res.__responseApiSeq = 0;
                    res.__responseApiSeq += 1;
                    errorPayload.sequence_number = res.__responseApiSeq;
                    if (this._isResponseWritable(res)) {
                        res.write(`event: error\ndata: ${JSON.stringify(errorPayload)}\n\n`);
                    }
                } else {
                    // gemini
                    errorPayload = {
                        error: {
                            code: 503,
                            message: `Service unavailable: ${error.message}`,
                            status: "UNAVAILABLE",
                        },
                    };
                    if (this._isResponseWritable(res)) {
                        res.write(`data: ${JSON.stringify(errorPayload)}\n\n`);
                    }
                }
            } else {
                // Other unexpected errors - rethrow to outer handler
                throw error;
            }

            this._markTrackedResponseError(res, trackingMessage, trackingStatus);
        } catch (writeError) {
            this.logger.debug(`[Request] Failed to write fake stream error to client: ${writeError.message}`);
            // If write failed or unexpected error, rethrow original error
            throw error;
        }
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

    async _waitForSystemAndConnectionIfBusy(res = null, options = {}) {
        if (!this.authSwitcher.isSystemBusy) {
            return true;
        }

        const {
            busyMessage = "Server undergoing internal maintenance (account switching/recovery), please try again later.",
            connectionMessage = "Service temporarily unavailable: Connection not established after switching.",
            connectionTimeoutMs = 10000,
            onConnectionTimeout,
            sendError = res ? (status, message) => this._sendErrorResponse(res, status, message) : () => {},
        } = options;

        const ready = await this._waitForSystemReady();
        if (!ready) {
            sendError(503, busyMessage);
            return false;
        }

        if (!this.connectionRegistry.getConnectionByAuth(this.currentAuthIndex)) {
            const connectionReady = await this._waitForConnection(connectionTimeoutMs);
            if (!connectionReady) {
                if (typeof onConnectionTimeout === "function") {
                    try {
                        onConnectionTimeout();
                    } catch (e) {
                        this.logger.debug(`[System] onConnectionTimeout handler failed: ${e.message}`);
                    }
                }
                sendError(503, connectionMessage);
                return false;
            }
        }

        return true;
    }

    _createImmediateSwitchTracker() {
        const attemptedAuthIndices = new Set();
        if (Number.isInteger(this.currentAuthIndex) && this.currentAuthIndex >= 0) {
            attemptedAuthIndices.add(this.currentAuthIndex);
        }
        return { attemptedAuthIndices };
    }

    async _performImmediateSwitchRetry(errorDetails, requestId, tracker) {
        await this.authSwitcher.handleRequestFailureAndSwitch(
            { message: errorDetails.message, status: Number(errorDetails.status) },
            null
        );

        const ready = await this._waitForSystemAndConnectionIfBusy(null, {
            sendError: () => {},
        });
        if (!ready) {
            throw new Error("System not ready after immediate-switch retry.");
        }

        const newAuthIndex = this.currentAuthIndex;
        if (!Number.isInteger(newAuthIndex) || newAuthIndex < 0) {
            this.logger.warn(
                `[Request] Immediate switch for request #${requestId} did not produce a valid target account.`
            );
            return false;
        }

        if (tracker.attemptedAuthIndices.has(newAuthIndex)) {
            this.logger.warn(
                `[Request] Immediate switch for request #${requestId} returned to already-attempted account #${newAuthIndex}, stopping account-switch retries.`
            );
            return false;
        }

        tracker.attemptedAuthIndices.add(newAuthIndex);
        return true;
    }

    _logFinalRequestFailure(errorDetails, contextLabel = "Request") {
        this.logger.error(
            `[Request] ${contextLabel} failed after retries. Status code: ${errorDetails?.status || 500}, message: ${errorDetails?.message || "Unknown error"}`
        );
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
            return await this._waitForSystemAndConnectionIfBusy(res, {
                connectionMessage: "Service temporarily unavailable: Browser failed to start. Please try again.",
                onConnectionTimeout: () => {
                    this.logger.error(
                        `[System] WebSocket connection not established for account #${this.currentAuthIndex} after system ready, browser startup may have failed.`
                    );
                },
            });
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
        this._startTrackedRequest(requestId, req, {
            apiFormat: "gemini",
            requestCategory: this._categorizeRequest(req.path, "request"),
        });
        res.__proxyResponseStreamMode = null;

        try {
            // Check current account's browser connection
            if (!this.connectionRegistry.getConnectionByAuth(this.currentAuthIndex)) {
                this.logger.warn(`[Request] No WebSocket connection for current account #${this.currentAuthIndex}`);
                const recovered = await this._handleBrowserRecovery(res);
                if (!recovered) {
                    this._markTrackedEarlyExitIfNeeded(
                        res,
                        "Service temporarily unavailable: Browser recovery failed."
                    );
                    return;
                }
            }

            // Wait for system to become ready if it's busy
            {
                const ready = await this._waitForSystemAndConnectionIfBusy(res);
                if (!ready) {
                    this._markTrackedEarlyExitIfNeeded(res, "Service temporarily unavailable: System not ready.");
                    return;
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
            this._initializeProxyRequestAttempt(proxyRequest);

            const wantsStream = req.path.includes(":streamGenerateContent");
            res.__proxyResponseStreamMode = wantsStream ? proxyRequest.streaming_mode : null;

            this._updateTrackedRequest(requestId, {
                isStreaming: wantsStream,
                model: this._extractModelFromPath(proxyRequest.path),
                path: proxyRequest.path,
                requestCategory: this._categorizeRequest(
                    proxyRequest.path,
                    isGenerativeRequest ? "generation" : "request"
                ),
                streamMode: wantsStream ? proxyRequest.streaming_mode : null,
            });

            try {
                // Create message queue inside try-catch to handle invalid authIndex
                const messageQueue = this.connectionRegistry.createMessageQueue(
                    requestId,
                    this.currentAuthIndex,
                    proxyRequest.request_attempt_id
                );
                this._setupClientDisconnectHandler(res, requestId);

                if (wantsStream) {
                    this.logger.info(
                        `[Request] Client enabled streaming (${proxyRequest.streaming_mode}), entering streaming processing mode...`
                    );
                    if (proxyRequest.streaming_mode === "fake") {
                        await this._handlePseudoStreamResponse(proxyRequest, messageQueue, req, res);
                    } else {
                        await this._handleRealStreamResponse(proxyRequest, messageQueue, req, res);
                    }
                } else {
                    proxyRequest.streaming_mode = "fake";
                    await this._handleNonStreamResponse(proxyRequest, messageQueue, req, res);
                }
            } catch (error) {
                // Handle queue timeout by notifying browser
                this._handleQueueTimeout(error, requestId);

                this._handleRequestError(error, res, "gemini");
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
        } finally {
            this._finalizeTrackedRequest(requestId, res);
        }
    }

    // Process File Upload requests
    async processUploadRequest(req, res) {
        const requestId = this._generateRequestId();
        this.logger.info(`[Upload] Processing upload request ${req.method} ${req.path} (ID: ${requestId})`);
        this._startTrackedRequest(requestId, req, {
            apiFormat: "upload",
            isStreaming: false,
            requestCategory: "upload",
            streamMode: null,
        });

        try {
            // Check current account's browser connection
            if (!this.connectionRegistry.getConnectionByAuth(this.currentAuthIndex)) {
                this.logger.warn(`[Upload] No WebSocket connection for current account #${this.currentAuthIndex}`);
                const recovered = await this._handleBrowserRecovery(res);
                if (!recovered) {
                    this._markTrackedEarlyExitIfNeeded(
                        res,
                        "Service temporarily unavailable: Browser recovery failed."
                    );
                    return;
                }
            }

            // Wait for system to become ready if it's busy
            {
                const ready = await this._waitForSystemAndConnectionIfBusy(res);
                if (!ready) {
                    this._markTrackedEarlyExitIfNeeded(res, "Service temporarily unavailable: System not ready.");
                    return;
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
            this._initializeProxyRequestAttempt(proxyRequest);
            this._updateTrackedRequest(requestId, {
                path: proxyRequest.path,
            });

            try {
                // Create message queue inside try-catch to handle invalid authIndex
                const messageQueue = this.connectionRegistry.createMessageQueue(
                    requestId,
                    this.currentAuthIndex,
                    proxyRequest.request_attempt_id
                );
                this._setupClientDisconnectHandler(res, requestId);

                await this._handleNonStreamResponse(proxyRequest, messageQueue, req, res);
            } catch (error) {
                this._handleRequestError(error, res);
            } finally {
                this.connectionRegistry.removeMessageQueue(requestId, "request_complete");
                if (!res.writableEnded) res.end();
            }
        } finally {
            this._finalizeTrackedRequest(requestId, res);
        }
    }

    // Process OpenAI format requests
    async processOpenAIRequest(req, res) {
        const requestId = this._generateRequestId();
        this._startTrackedRequest(requestId, req, {
            apiFormat: "openai",
            isStreaming: req.body.stream === true,
            requestCategory: "generation",
            streamMode: req.body.stream === true ? this.serverSystem.streamingMode : null,
        });
        res.__proxyResponseStreamMode = null;

        try {
            // Check current account's browser connection
            if (!this.connectionRegistry.getConnectionByAuth(this.currentAuthIndex)) {
                this.logger.warn(`[Request] No WebSocket connection for current account #${this.currentAuthIndex}`);
                const recovered = await this._handleBrowserRecovery(res);
                if (!recovered) {
                    this._markTrackedEarlyExitIfNeeded(
                        res,
                        "Service temporarily unavailable: Browser recovery failed."
                    );
                    return;
                }
            }

            // Wait for system to become ready if it's busy
            {
                const ready = await this._waitForSystemAndConnectionIfBusy(res);
                if (!ready) {
                    this._markTrackedEarlyExitIfNeeded(res, "Service temporarily unavailable: System not ready.");
                    return;
                }
            }
            if (this.browserManager) {
                this.browserManager.notifyUserActivity();
            }

            const isOpenAIStream = req.body.stream === true;
            const systemStreamMode = this.serverSystem.streamingMode;

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
            let googleBody, model, modelStreamingMode;
            try {
                const result = await this.formatConverter.translateOpenAIToGoogle(req.body);
                googleBody = result.googleRequest;
                model = result.cleanModelName;
                modelStreamingMode = result.modelStreamingMode || null;
            } catch (error) {
                this.logger.error(`[Adapter] OpenAI request translation failed: ${error.message}`);
                return this._sendErrorResponse(res, 400, "Invalid OpenAI request format.");
            }

            const effectiveStreamMode = modelStreamingMode || systemStreamMode;
            const useRealStream = isOpenAIStream && effectiveStreamMode === "real";
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
            this._initializeProxyRequestAttempt(proxyRequest);
            res.__proxyResponseStreamMode = isOpenAIStream ? (useRealStream ? "real" : "fake") : null;
            this._updateTrackedRequest(requestId, {
                isStreaming: isOpenAIStream,
                model,
                path: proxyRequest.path,
                requestCategory: "generation",
                ...(isOpenAIStream ? { streamMode: useRealStream ? "real" : "fake" } : {}),
            });

            try {
                // Create message queue inside try-catch to handle invalid authIndex
                const messageQueue = this.connectionRegistry.createMessageQueue(
                    requestId,
                    this.currentAuthIndex,
                    proxyRequest.request_attempt_id
                );
                this._setupClientDisconnectHandler(res, requestId);

                if (useRealStream) {
                    let currentQueue = messageQueue;
                    let initialMessage;
                    let skipFinalFailureSwitch = false;
                    const immediateSwitchTracker = this._createImmediateSwitchTracker();

                    // eslint-disable-next-line no-constant-condition
                    while (true) {
                        this._getUsageStatsService()?.recordAttempt(
                            proxyRequest.request_id,
                            this.currentAuthIndex,
                            this._getAccountNameForIndex(this.currentAuthIndex)
                        );
                        this._forwardRequest(proxyRequest);
                        initialMessage = await currentQueue.dequeue();

                        const initialStatus = Number(initialMessage?.status);
                        if (
                            initialMessage.event_type === "error" &&
                            !isUserAbortedError(initialMessage) &&
                            Number.isFinite(initialStatus) &&
                            this.config?.immediateSwitchStatusCodes?.includes(initialStatus)
                        ) {
                            this.logger.warn(
                                `[Request] OpenAI real stream received ${initialStatus}, switching account and retrying...`
                            );
                            const switched = await this._performImmediateSwitchRetry(
                                initialMessage,
                                requestId,
                                immediateSwitchTracker
                            );
                            if (!switched) {
                                skipFinalFailureSwitch = true;
                                break;
                            }

                            try {
                                currentQueue.close("retry_after_429");
                            } catch {
                                /* empty */
                            }
                            this._advanceProxyRequestAttempt(proxyRequest);
                            currentQueue = this.connectionRegistry.createMessageQueue(
                                requestId,
                                this.currentAuthIndex,
                                proxyRequest.request_attempt_id
                            );
                            continue;
                        }

                        break;
                    }

                    if (initialMessage.event_type === "error") {
                        this._logFinalRequestFailure(initialMessage, "OpenAI real stream");

                        // Send standard HTTP error response
                        this._sendErrorResponse(res, initialMessage.status || 500, initialMessage.message);

                        // Avoid switching account if the error is just a connection reset
                        if (!skipFinalFailureSwitch && !this._isConnectionResetError(initialMessage)) {
                            await this.authSwitcher.handleRequestFailureAndSwitch(initialMessage, null);
                        } else if (skipFinalFailureSwitch) {
                            this.logger.info(
                                "[Request] Immediate-switch retries exhausted, skipping additional account switch."
                            );
                        } else {
                            this.logger.info(
                                "[Request] Failure due to connection reset (Real Stream), skipping account switch."
                            );
                        }
                        return;
                    }

                    if (this.authSwitcher.failureCount > 0) {
                        this.logger.debug(
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
                    await this._streamOpenAIResponse(currentQueue, res, model);
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
                            this._logFinalRequestFailure(result.error, "OpenAI fake/non-stream");
                            // Send standard HTTP error response for both streaming and non-streaming
                            if (connectionMaintainer) clearTimeout(connectionMaintainer);
                            if (isOpenAIStream && res.headersSent) {
                                // If keep-alives already started the SSE response, send an SSE error event instead of JSON.
                                this._handleRequestError(result.error, res, "openai");
                            } else {
                                this._sendErrorResponse(res, result.error.status || 500, result.error.message);
                            }

                            // Avoid switching account if the error is just a connection reset
                            if (!result.error.skipAccountSwitch && !this._isConnectionResetError(result.error)) {
                                await this.authSwitcher.handleRequestFailureAndSwitch(result.error, null);
                            } else if (result.error.skipAccountSwitch) {
                                this.logger.info(
                                    "[Request] Immediate-switch retries exhausted, skipping additional account switch."
                                );
                            } else {
                                this.logger.info(
                                    "[Request] Failure due to connection reset (OpenAI), skipping account switch."
                                );
                            }
                            return;
                        }

                        if (this.authSwitcher.failureCount > 0) {
                            this.logger.debug(
                                `✅ [Auth] OpenAI interface request successful - failure count reset to 0`
                            );
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
                            let hadStreamError = false;
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
                                        this._markTrackedResponseError(res, message.message, 500);
                                        hadStreamError = true;
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
                                if (hadStreamError) {
                                    // Backend errored; don't attempt to translate/send a "normal" stream afterwards.
                                    return;
                                }
                                const streamState = {};
                                const translatedChunk = this.formatConverter.translateGoogleToOpenAIStream(
                                    fullBody,
                                    model,
                                    streamState
                                );
                                if (this._isResponseWritable(res)) {
                                    try {
                                        if (translatedChunk) {
                                            res.write(translatedChunk);
                                        }
                                        res.write("data: [DONE]\n\n");
                                    } catch (writeError) {
                                        this.logger.debug(
                                            `[Request] Failed to write final fake OpenAI stream chunks: ${writeError.message}`
                                        );
                                    }
                                } else {
                                    this.logger.debug(
                                        "[Request] Response no longer writable before final fake OpenAI stream chunks."
                                    );
                                }
                                this.logger.info("[Request] Fake mode: Complete content sent at once.");
                            } catch (error) {
                                // Classify error type and send appropriate response
                                this._handleFakeStreamError(error, res, "openai");
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
                // Handle queue timeout by notifying browser
                this._handleQueueTimeout(error, requestId);

                this._handleRequestError(error, res);
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
        } finally {
            this._finalizeTrackedRequest(requestId, res);
        }
    }

    // Process OpenAI Response API format requests
    async processOpenAIResponseRequest(req, res) {
        const requestId = this._generateRequestId();
        this._startTrackedRequest(requestId, req, {
            apiFormat: "response_api",
            isStreaming: req.body.stream === true,
            requestCategory: "generation",
            streamMode: req.body.stream === true ? this.serverSystem.streamingMode : null,
        });
        res.__proxyResponseStreamMode = null;

        try {
            // Check current account's browser connection
            if (!this.connectionRegistry.getConnectionByAuth(this.currentAuthIndex)) {
                this.logger.warn(`[Request] No WebSocket connection for current account #${this.currentAuthIndex}`);
                const recovered = await this._handleBrowserRecovery(res);
                if (!recovered) {
                    this._markTrackedEarlyExitIfNeeded(
                        res,
                        "Service temporarily unavailable: Browser recovery failed."
                    );
                    return;
                }
            }

            // Wait for system to become ready if it's busy
            {
                const ready = await this._waitForSystemAndConnectionIfBusy(res);
                if (!ready) {
                    this._markTrackedEarlyExitIfNeeded(res, "Service temporarily unavailable: System not ready.");
                    return;
                }
            }
            if (this.browserManager) {
                this.browserManager.notifyUserActivity();
            }

            const isOpenAIStream = req.body.stream === true;
            const normalizeInstructions = value => {
                if (typeof value === "string") return value;
                if (!Array.isArray(value)) return null;
                const chunks = [];
                for (const item of value) {
                    if (!item || typeof item !== "object") continue;
                    const content = item.content;
                    if (typeof content === "string") {
                        chunks.push(content);
                        continue;
                    }
                    if (!Array.isArray(content)) continue;
                    for (const part of content) {
                        if (!part || typeof part !== "object") continue;
                        if (part.type === "text" || part.type === "input_text") {
                            if (typeof part.text === "string" && part.text) chunks.push(part.text);
                        }
                    }
                }
                return chunks.length > 0 ? chunks.join("\n") : null;
            };
            const responseDefaultsRaw = {
                instructions: normalizeInstructions(req.body?.instructions),
                max_output_tokens: req.body?.max_output_tokens ?? null,
                metadata:
                    req.body?.metadata && typeof req.body.metadata === "object" && !Array.isArray(req.body.metadata)
                        ? req.body.metadata
                        : {},
                parallel_tool_calls:
                    typeof req.body?.parallel_tool_calls === "boolean" ? req.body.parallel_tool_calls : true,
                reasoning:
                    req.body?.reasoning && typeof req.body.reasoning === "object" && !Array.isArray(req.body.reasoning)
                        ? req.body.reasoning
                        : undefined,
                temperature: typeof req.body?.temperature === "number" ? req.body.temperature : undefined,
                text:
                    req.body?.text && typeof req.body.text === "object" && !Array.isArray(req.body.text)
                        ? req.body.text
                        : undefined,
                tool_choice: req.body?.tool_choice ?? undefined,
                tools: Array.isArray(req.body?.tools) ? req.body.tools : undefined,
                top_p: typeof req.body?.top_p === "number" ? req.body.top_p : undefined,
                truncation: typeof req.body?.truncation === "string" ? req.body.truncation : undefined,
                user: typeof req.body?.user === "string" ? req.body.user : undefined,
            };

            const responseDefaults = Object.fromEntries(
                Object.entries(responseDefaultsRaw).filter(([, v]) => v !== undefined)
            );
            const systemStreamMode = this.serverSystem.streamingMode;

            // Handle usage counting
            const usageCount = this.authSwitcher.incrementUsageCount();
            if (usageCount > 0) {
                const rotationCountText =
                    this.config.switchOnUses > 0 ? `${usageCount}/${this.config.switchOnUses}` : `${usageCount}`;
                this.logger.info(
                    `[Request] OpenAI Response generation request - account rotation count: ${rotationCountText} (Current account: ${this.currentAuthIndex})`
                );
                if (this.authSwitcher.shouldSwitchByUsage()) {
                    this.needsSwitchingAfterRequest = true;
                }
            }

            // Translate OpenAI Response format to Google format
            let googleBody, model, modelStreamingMode;
            try {
                const result = await this.formatConverter.translateOpenAIResponseToGoogle(req.body);
                googleBody = result.googleRequest;
                model = result.cleanModelName;
                modelStreamingMode = result.modelStreamingMode || null;
            } catch (error) {
                this.logger.error(`[Adapter] OpenAI Response request translation failed: ${error.message}`);
                return this._sendErrorResponse(res, 400, "Invalid OpenAI Response request format.");
            }

            const effectiveStreamMode = modelStreamingMode || systemStreamMode;
            const useRealStream = isOpenAIStream && effectiveStreamMode === "real";

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
            this._initializeProxyRequestAttempt(proxyRequest);
            res.__proxyResponseStreamMode = isOpenAIStream ? (useRealStream ? "real" : "fake") : null;
            this._updateTrackedRequest(requestId, {
                isStreaming: isOpenAIStream,
                model,
                path: proxyRequest.path,
                requestCategory: "generation",
                ...(isOpenAIStream ? { streamMode: useRealStream ? "real" : "fake" } : {}),
            });

            try {
                // Create message queue inside try-catch to handle invalid authIndex
                const messageQueue = this.connectionRegistry.createMessageQueue(
                    requestId,
                    this.currentAuthIndex,
                    proxyRequest.request_attempt_id
                );
                this._setupClientDisconnectHandler(res, requestId);

                if (useRealStream) {
                    let currentQueue = messageQueue;
                    let initialMessage;
                    let skipFinalFailureSwitch = false;
                    const immediateSwitchTracker = this._createImmediateSwitchTracker();

                    // eslint-disable-next-line no-constant-condition
                    while (true) {
                        this._getUsageStatsService()?.recordAttempt(
                            proxyRequest.request_id,
                            this.currentAuthIndex,
                            this._getAccountNameForIndex(this.currentAuthIndex)
                        );
                        this._forwardRequest(proxyRequest);
                        initialMessage = await currentQueue.dequeue();

                        const initialStatus = Number(initialMessage?.status);
                        if (
                            initialMessage.event_type === "error" &&
                            !isUserAbortedError(initialMessage) &&
                            Number.isFinite(initialStatus) &&
                            this.config?.immediateSwitchStatusCodes?.includes(initialStatus)
                        ) {
                            this.logger.warn(
                                `[Request] OpenAI Response API real stream received ${initialStatus}, switching account and retrying...`
                            );
                            const switched = await this._performImmediateSwitchRetry(
                                initialMessage,
                                requestId,
                                immediateSwitchTracker
                            );
                            if (!switched) {
                                skipFinalFailureSwitch = true;
                                break;
                            }

                            try {
                                currentQueue.close("retry_after_429");
                            } catch {
                                /* empty */
                            }
                            this._advanceProxyRequestAttempt(proxyRequest);
                            currentQueue = this.connectionRegistry.createMessageQueue(
                                requestId,
                                this.currentAuthIndex,
                                proxyRequest.request_attempt_id
                            );
                            continue;
                        }

                        break;
                    }

                    if (initialMessage.event_type === "error") {
                        this._logFinalRequestFailure(initialMessage, "OpenAI Response API real stream");

                        // Send standard HTTP error response
                        this._sendErrorResponse(res, initialMessage.status || 500, initialMessage.message);

                        // Avoid switching account if the error is just a connection reset
                        if (!skipFinalFailureSwitch && !this._isConnectionResetError(initialMessage)) {
                            await this.authSwitcher.handleRequestFailureAndSwitch(initialMessage, null);
                        } else if (skipFinalFailureSwitch) {
                            this.logger.info(
                                "[Request] Immediate-switch retries exhausted, skipping additional account switch."
                            );
                        } else {
                            this.logger.info(
                                "[Request] Failure due to connection reset (Real Stream), skipping account switch."
                            );
                        }
                        return;
                    }

                    if (this.authSwitcher.failureCount > 0) {
                        this.logger.debug(
                            `✅ [Auth] OpenAI Response API request successful - failure count reset from ${this.authSwitcher.failureCount} to 0`
                        );
                        this.authSwitcher.failureCount = 0;
                    }

                    res.status(200).set({
                        "Cache-Control": "no-cache",
                        Connection: "keep-alive",
                        "Content-Type": "text/event-stream",
                    });
                    this.logger.info(`[Request] OpenAI Response API streaming response (Real Mode) started...`);
                    await this._streamOpenAIResponseAPIResponse(currentQueue, res, model, {
                        responseDefaults,
                    });
                } else {
                    // OpenAI Response API Fake Stream / Non-Stream mode
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
                            this._logFinalRequestFailure(result.error, "OpenAI Response API fake/non-stream");
                            // Send standard HTTP error response for both streaming and non-streaming
                            if (connectionMaintainer) clearTimeout(connectionMaintainer);
                            if (isOpenAIStream && res.headersSent) {
                                // If keep-alives already started the SSE response, send an SSE error event instead of JSON.
                                this._handleRequestError(result.error, res, "response_api");
                            } else {
                                this._sendErrorResponse(res, result.error.status || 500, result.error.message);
                            }

                            // Avoid switching account if the error is just a connection reset
                            if (!result.error.skipAccountSwitch && !this._isConnectionResetError(result.error)) {
                                await this.authSwitcher.handleRequestFailureAndSwitch(result.error, null);
                            } else if (result.error.skipAccountSwitch) {
                                this.logger.info(
                                    "[Request] Immediate-switch retries exhausted, skipping additional account switch."
                                );
                            } else {
                                this.logger.info(
                                    "[Request] Failure due to connection reset (Response API), skipping account switch."
                                );
                            }
                            return;
                        }

                        if (this.authSwitcher.failureCount > 0) {
                            this.logger.debug(
                                `✅ [Auth] OpenAI Response API request successful - failure count reset to 0`
                            );
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

                            this.logger.info(`[Request] OpenAI Response API streaming response (Fake Mode) started...`);
                            let fullBody = "";
                            if (res.__responseApiSeq == null) res.__responseApiSeq = 0;
                            let hadStreamError = false;
                            try {
                                // eslint-disable-next-line no-constant-condition
                                while (true) {
                                    const message = await activeQueue.dequeue(this.timeouts.FAKE_STREAM);
                                    if (message.type === "STREAM_END") {
                                        break;
                                    }

                                    if (message.event_type === "error") {
                                        this.logger.error(
                                            `[Request] Error received during OpenAI Response API fake stream: ${message.message}`
                                        );
                                        this._markTrackedResponseError(res, message.message, 500);
                                        hadStreamError = true;
                                        // Check if response is still writable before attempting to write
                                        if (this._isResponseWritable(res)) {
                                            try {
                                                res.__responseApiSeq += 1;
                                                res.write(
                                                    `event: error\ndata: ${JSON.stringify({
                                                        code: "api_error",
                                                        message: message.message,
                                                        param: null,
                                                        sequence_number: res.__responseApiSeq,
                                                        type: "error",
                                                    })}\n\n`
                                                );
                                            } catch (writeError) {
                                                this.logger.debug(
                                                    `[Request] Failed to write error to OpenAI Response API fake stream: ${writeError.message}`
                                                );
                                            }
                                        }
                                        break;
                                    }

                                    if (message.data) fullBody += message.data;
                                }

                                // If backend errored, don't attempt to translate/send a "normal" Responses stream afterwards.
                                if (hadStreamError) {
                                    return;
                                }

                                const streamState = {};
                                streamState.responseDefaults = responseDefaults;
                                const translatedChunk = this.formatConverter.translateGoogleToResponseAPIStream(
                                    fullBody,
                                    model,
                                    streamState
                                );
                                if (this._isResponseWritable(res)) {
                                    try {
                                        if (translatedChunk) {
                                            res.write(translatedChunk);
                                        }
                                    } catch (writeError) {
                                        this.logger.debug(
                                            `[Request] Failed to write final fake OpenAI Response API stream chunks: ${writeError.message}`
                                        );
                                    }
                                } else {
                                    this.logger.debug(
                                        "[Request] Response no longer writable before final fake OpenAI Response API stream chunks."
                                    );
                                }
                                this.logger.info("[Request] Fake mode: Complete content sent at once.");
                            } catch (error) {
                                // Classify error type and send appropriate response
                                this._handleFakeStreamError(error, res, "response_api");
                            }
                        } else {
                            // Non-stream
                            await this._sendOpenAIResponseAPINonStreamResponse(
                                activeQueue,
                                res,
                                model,
                                responseDefaults
                            );
                        }
                    } finally {
                        if (connectionMaintainer) clearTimeout(connectionMaintainer);
                    }
                }
            } catch (error) {
                // Handle queue timeout by notifying browser
                this._handleQueueTimeout(error, requestId);

                this._handleRequestError(error, res, "response_api");
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
        } finally {
            this._finalizeTrackedRequest(requestId, res);
        }
    }

    // Process Claude API format requests
    async processClaudeRequest(req, res) {
        const requestId = this._generateRequestId();
        this._startTrackedRequest(requestId, req, {
            apiFormat: "claude",
            isStreaming: req.body.stream === true,
            requestCategory: "generation",
            streamMode: req.body.stream === true ? this.serverSystem.streamingMode : null,
        });
        res.__proxyResponseStreamMode = null;

        try {
            // Check current account's browser connection
            if (!this.connectionRegistry.getConnectionByAuth(this.currentAuthIndex)) {
                this.logger.warn(`[Request] No WebSocket connection for current account #${this.currentAuthIndex}`);
                const recovered = await this._handleBrowserRecovery(res);
                if (!recovered) {
                    this._markTrackedEarlyExitIfNeeded(
                        res,
                        "Service temporarily unavailable: Browser recovery failed."
                    );
                    return;
                }
            }

            // Wait for system to become ready if it's busy
            {
                const ready = await this._waitForSystemAndConnectionIfBusy(res, {
                    sendError: (status, message) =>
                        this._sendClaudeErrorResponse(res, status, "overloaded_error", message),
                });
                if (!ready) {
                    this._markTrackedEarlyExitIfNeeded(res, "Service temporarily unavailable: System not ready.");
                    return;
                }
            }

            if (this.browserManager) {
                this.browserManager.notifyUserActivity();
            }

            const isClaudeStream = req.body.stream === true;
            const systemStreamMode = this.serverSystem.streamingMode;

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
            let googleBody, model, modelStreamingMode;
            try {
                const result = await this.formatConverter.translateClaudeToGoogle(req.body);
                googleBody = result.googleRequest;
                model = result.cleanModelName;
                modelStreamingMode = result.modelStreamingMode || null;
            } catch (error) {
                this.logger.error(`[Adapter] Claude request translation failed: ${error.message}`);
                return this._sendClaudeErrorResponse(
                    res,
                    400,
                    "invalid_request_error",
                    "Invalid Claude request format."
                );
            }

            const effectiveStreamMode = modelStreamingMode || systemStreamMode;
            const useRealStream = isClaudeStream && effectiveStreamMode === "real";

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
            this._initializeProxyRequestAttempt(proxyRequest);
            res.__proxyResponseStreamMode = isClaudeStream ? (useRealStream ? "real" : "fake") : null;
            this._updateTrackedRequest(requestId, {
                isStreaming: isClaudeStream,
                model,
                path: proxyRequest.path,
                requestCategory: "generation",
                ...(isClaudeStream ? { streamMode: useRealStream ? "real" : "fake" } : {}),
            });

            try {
                // Create message queue inside try-catch to handle invalid authIndex
                const messageQueue = this.connectionRegistry.createMessageQueue(
                    requestId,
                    this.currentAuthIndex,
                    proxyRequest.request_attempt_id
                );
                this._setupClientDisconnectHandler(res, requestId);

                if (useRealStream) {
                    let currentQueue = messageQueue;
                    let initialMessage;
                    let skipFinalFailureSwitch = false;
                    const immediateSwitchTracker = this._createImmediateSwitchTracker();

                    // eslint-disable-next-line no-constant-condition
                    while (true) {
                        this._getUsageStatsService()?.recordAttempt(
                            proxyRequest.request_id,
                            this.currentAuthIndex,
                            this._getAccountNameForIndex(this.currentAuthIndex)
                        );
                        this._forwardRequest(proxyRequest);
                        initialMessage = await currentQueue.dequeue();

                        const initialStatus = Number(initialMessage?.status);
                        if (
                            initialMessage.event_type === "error" &&
                            !isUserAbortedError(initialMessage) &&
                            Number.isFinite(initialStatus) &&
                            this.config?.immediateSwitchStatusCodes?.includes(initialStatus)
                        ) {
                            this.logger.warn(
                                `[Request] Claude real stream received ${initialStatus}, switching account and retrying...`
                            );
                            const switched = await this._performImmediateSwitchRetry(
                                initialMessage,
                                requestId,
                                immediateSwitchTracker
                            );
                            if (!switched) {
                                skipFinalFailureSwitch = true;
                                break;
                            }

                            try {
                                currentQueue.close("retry_after_429");
                            } catch {
                                /* empty */
                            }
                            this._advanceProxyRequestAttempt(proxyRequest);
                            currentQueue = this.connectionRegistry.createMessageQueue(
                                requestId,
                                this.currentAuthIndex,
                                proxyRequest.request_attempt_id
                            );
                            continue;
                        }

                        break;
                    }

                    if (initialMessage.event_type === "error") {
                        this._logFinalRequestFailure(initialMessage, "Claude real stream");
                        this._sendClaudeErrorResponse(
                            res,
                            initialMessage.status || 500,
                            "api_error",
                            initialMessage.message
                        );
                        if (!skipFinalFailureSwitch && !this._isConnectionResetError(initialMessage)) {
                            await this.authSwitcher.handleRequestFailureAndSwitch(initialMessage, null);
                        } else if (skipFinalFailureSwitch) {
                            this.logger.info(
                                "[Request] Immediate-switch retries exhausted, skipping additional account switch."
                            );
                        }
                        return;
                    }

                    if (this.authSwitcher.failureCount > 0) {
                        this.logger.debug(`✅ [Auth] Claude request successful - failure count reset to 0`);
                        this.authSwitcher.failureCount = 0;
                    }

                    res.status(200).set({
                        "Cache-Control": "no-cache",
                        Connection: "keep-alive",
                        "Content-Type": "text/event-stream",
                    });
                    this.logger.info(`[Request] Claude streaming response (Real Mode) started...`);
                    await this._streamClaudeResponse(currentQueue, res, model);
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
                            this._logFinalRequestFailure(result.error, "Claude fake/non-stream");
                            if (connectionMaintainer) clearTimeout(connectionMaintainer);
                            if (isClaudeStream && res.headersSent) {
                                // If keep-alives already started the SSE response, send an SSE error event instead of JSON.
                                this._handleClaudeRequestError(result.error, res);
                            } else {
                                this._sendClaudeErrorResponse(
                                    res,
                                    result.error.status || 500,
                                    "api_error",
                                    result.error.message
                                );
                            }
                            if (!result.error.skipAccountSwitch && !this._isConnectionResetError(result.error)) {
                                await this.authSwitcher.handleRequestFailureAndSwitch(result.error, null);
                            } else if (result.error.skipAccountSwitch) {
                                this.logger.info(
                                    "[Request] Immediate-switch retries exhausted, skipping additional account switch."
                                );
                            }
                            return;
                        }

                        if (this.authSwitcher.failureCount > 0) {
                            this.logger.debug(`✅ [Auth] Claude request successful - failure count reset to 0`);
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
                            let hadStreamError = false;
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
                                        this._markTrackedResponseError(res, message.message, 500);
                                        hadStreamError = true;
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
                                if (hadStreamError) {
                                    // Backend errored; don't attempt to translate/send a "normal" stream afterwards.
                                    return;
                                }
                                const streamState = {};
                                const translatedChunk = this.formatConverter.translateGoogleToClaudeStream(
                                    fullBody,
                                    model,
                                    streamState
                                );
                                if (this._isResponseWritable(res)) {
                                    try {
                                        if (translatedChunk) {
                                            res.write(translatedChunk);
                                        }
                                    } catch (writeError) {
                                        this.logger.debug(
                                            `[Request] Failed to write final fake Claude stream chunk: ${writeError.message}`
                                        );
                                    }
                                } else {
                                    this.logger.debug(
                                        "[Request] Response no longer writable before final fake Claude stream chunk."
                                    );
                                }
                                this.logger.info("[Request] Claude fake mode: Complete content sent at once.");
                            } catch (error) {
                                // Classify error type and send appropriate response
                                this._handleFakeStreamError(error, res, "claude");
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
                // Handle queue timeout by notifying browser
                this._handleQueueTimeout(error, requestId);

                this._handleClaudeRequestError(error, res);
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
        } finally {
            this._finalizeTrackedRequest(requestId, res);
        }
    }

    // Process Claude count tokens request
    async processClaudeCountTokens(req, res) {
        const requestId = this._generateRequestId();
        this._startTrackedRequest(requestId, req, {
            apiFormat: "claude",
            isStreaming: false,
            requestCategory: "count_tokens",
            streamMode: null,
        });

        try {
            // Check current account's browser connection
            if (!this.connectionRegistry.getConnectionByAuth(this.currentAuthIndex)) {
                this.logger.warn(`[Request] No WebSocket connection for current account #${this.currentAuthIndex}`);
                const recovered = await this._handleBrowserRecovery(res);
                if (!recovered) {
                    this._markTrackedEarlyExitIfNeeded(
                        res,
                        "Service temporarily unavailable: Browser recovery failed."
                    );
                    return;
                }
            }

            // Wait for system to become ready if it's busy
            {
                const ready = await this._waitForSystemAndConnectionIfBusy(res, {
                    sendError: (status, message) =>
                        this._sendClaudeErrorResponse(res, status, "overloaded_error", message),
                });
                if (!ready) {
                    this._markTrackedEarlyExitIfNeeded(res, "Service temporarily unavailable: System not ready.");
                    return;
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
                return this._sendClaudeErrorResponse(
                    res,
                    400,
                    "invalid_request_error",
                    "Invalid Claude request format."
                );
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
            this._initializeProxyRequestAttempt(proxyRequest);
            this._updateTrackedRequest(requestId, {
                model,
                path: proxyRequest.path,
                requestCategory: "count_tokens",
            });

            try {
                // Create message queue inside try-catch to handle invalid authIndex
                const messageQueue = this.connectionRegistry.createMessageQueue(
                    requestId,
                    this.currentAuthIndex,
                    proxyRequest.request_attempt_id
                );
                this._setupClientDisconnectHandler(res, requestId);

                this._getUsageStatsService()?.recordAttempt(
                    requestId,
                    this.currentAuthIndex,
                    this._getAccountNameForIndex(this.currentAuthIndex)
                );
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
                            this._markTrackedResponseError(res, message.message, 500);
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
                    this.logger.debug(
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
                this._handleClaudeRequestError(error, res);
            } finally {
                this.connectionRegistry.removeMessageQueue(requestId, "request_complete");
                if (!res.writableEnded) res.end();
            }
        } finally {
            this._finalizeTrackedRequest(requestId, res);
        }
    }

    // OpenAI Response API count input tokens endpoint
    // Mirrors OpenAI's /v1/responses/input_tokens by returning only the request-side token count.
    async processOpenAIResponseInputTokens(req, res) {
        const requestId = this._generateRequestId();
        this._startTrackedRequest(requestId, req, {
            apiFormat: "response_api",
            isStreaming: false,
            requestCategory: "count_tokens",
            streamMode: null,
        });

        try {
            // Check current account's browser connection
            if (!this.connectionRegistry.getConnectionByAuth(this.currentAuthIndex)) {
                this.logger.warn(`[Request] No WebSocket connection for current account #${this.currentAuthIndex}`);
                const recovered = await this._handleBrowserRecovery(res);
                if (!recovered) {
                    this._markTrackedEarlyExitIfNeeded(
                        res,
                        "Service temporarily unavailable: Browser recovery failed."
                    );
                    return;
                }
            }

            // Wait for system to become ready if it's busy
            {
                const ready = await this._waitForSystemAndConnectionIfBusy(res);
                if (!ready) {
                    this._markTrackedEarlyExitIfNeeded(res, "Service temporarily unavailable: System not ready.");
                    return;
                }
            }

            if (this.browserManager) {
                this.browserManager.notifyUserActivity();
            }

            // Translate OpenAI Response format to Google format (so we can use Gemini countTokens)
            let googleBody, model;
            try {
                const result = await this.formatConverter.translateOpenAIResponseToGoogle(req.body);
                googleBody = result.googleRequest;
                model = result.cleanModelName;
            } catch (error) {
                this.logger.error(`[Adapter] OpenAI Response input_tokens translation failed: ${error.message}`);
                return this._sendErrorResponse(res, 400, "Invalid OpenAI Response request format.");
            }

            // Gemini countTokens accepts either:
            // - contents[]
            // - generateContentRequest (full request; required here because tools/systemInstruction/etc may be present)
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
            this._initializeProxyRequestAttempt(proxyRequest);
            this._updateTrackedRequest(requestId, {
                model,
                path: proxyRequest.path,
                requestCategory: "count_tokens",
            });

            try {
                const messageQueue = this.connectionRegistry.createMessageQueue(
                    requestId,
                    this.currentAuthIndex,
                    proxyRequest.request_attempt_id
                );
                this._setupClientDisconnectHandler(res, requestId);

                this._getUsageStatsService()?.recordAttempt(
                    requestId,
                    this.currentAuthIndex,
                    this._getAccountNameForIndex(this.currentAuthIndex)
                );
                this._forwardRequest(proxyRequest);
                const response = await messageQueue.dequeue();

                if (response.event_type === "error") {
                    this.logger.error(
                        `[Request] Received error from browser for input_tokens, will trigger switching logic. Status code: ${response.status}, message: ${response.message}`
                    );

                    this._sendErrorResponse(res, response.status || 500, response.message);

                    // Avoid switching account if the error is just a connection reset
                    if (!this._isConnectionResetError(response)) {
                        await this.authSwitcher.handleRequestFailureAndSwitch(response, null);
                    } else {
                        this.logger.info(
                            "[Request] Failure due to connection reset (input_tokens), skipping account switch."
                        );
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
                            this.logger.error(`[Request] Error received during input_tokens count: ${message.message}`);
                            this._markTrackedResponseError(res, message.message, 500);
                            this._sendErrorResponse(res, 500, message.message);
                            return;
                        }
                        if (message.data) fullBody += message.data;
                    }
                }

                // Parse Gemini response
                let geminiResponse;
                try {
                    geminiResponse = JSON.parse(fullBody || response.body);
                } catch (parseError) {
                    this.logger.error(`[Request] Failed to parse countTokens response: ${parseError.message}`);
                    this._sendErrorResponse(res, 500, "Failed to parse backend response");
                    return;
                }

                const totalTokens = geminiResponse.totalTokens || 0;

                // Reset failure count on success
                if (this.authSwitcher.failureCount > 0) {
                    this.logger.debug(
                        `✅ [Auth] input_tokens request successful - failure count reset from ${this.authSwitcher.failureCount} to 0`
                    );
                    this.authSwitcher.failureCount = 0;
                }

                res.status(200).json({
                    input_tokens: totalTokens,
                });

                this.logger.info(`[Request] OpenAI Response input_tokens completed: ${totalTokens} input tokens`);
            } catch (error) {
                this._handleRequestError(error, res);
            } finally {
                this.connectionRegistry.removeMessageQueue(requestId, "request_complete");
                if (!res.writableEnded) res.end();
            }
        } finally {
            this._finalizeTrackedRequest(requestId, res);
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
                    this._markTrackedResponseError(res, message.message, 500);
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
                        // Before writing, ensure the response is still writable to avoid
                        // throwing if the client disconnected mid-stream.
                        if (!this._isResponseWritable(res)) {
                            this.logger.debug(
                                "[Request] Response no longer writable during Claude stream; stopping stream."
                            );
                            break;
                        }
                        try {
                            res.write(claudeChunk);
                        } catch (writeError) {
                            this.logger.debug(
                                `[Request] Failed to write Claude chunk to stream: ${writeError.message}`
                            );
                            // Stop streaming on write failure to avoid misclassifying as a timeout.
                            break;
                        }
                    }
                }
            }
        } catch (error) {
            // Only handle connection reset errors here (client disconnect)
            // Let other errors (timeout, parsing, logic errors) propagate to outer catch
            if (this._isConnectionResetError(error)) {
                this._handleRealStreamQueueClosedError(error, res, "claude");
                return;
            }

            // Re-throw all other errors to be handled by outer catch block
            throw error;
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
            this._markTrackedResponseError(res, message, status || 500);
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

        // Check if this is a client disconnect - if so, just log and return
        if (this._isConnectionResetError(error)) {
            const isClientDisconnect = error.reason === "client_disconnect" || !this._isResponseWritable(res);
            if (isClientDisconnect) {
                this._markTrackedClientAbort(res, errorMsg);
                this.logger.info(`[Request] Request terminated: Queue closed (${error.reason || "connection_lost"})`);
                if (!res.writableEnded) {
                    try {
                        res.end();
                    } catch (e) {
                        // Ignore end errors for disconnected clients
                    }
                }
                return;
            }
        }

        if (res.headersSent) {
            this.logger.error(`[Request] Claude request error (headers already sent): ${errorMsg}`);

            // Try to send error in SSE format if response is still writable
            if (this._isResponseWritable(res)) {
                const contentType = res.getHeader("content-type");

                if (contentType && contentType.includes("text/event-stream")) {
                    try {
                        let errorType = "api_error";
                        let errorMessage = `Processing failed: ${errorMsg}`;
                        let errorStatus = 500;

                        // Use precise error type checking instead of string matching
                        if (error instanceof QueueTimeoutError || error.code === "QUEUE_TIMEOUT") {
                            errorType = "timeout_error";
                            errorMessage = `Stream timeout: ${errorMsg}`;
                            errorStatus = 504;
                        } else if (this._isConnectionResetError(error)) {
                            errorType = "overloaded_error";
                            errorMessage = `Service unavailable: ${errorMsg}`;
                            errorStatus = 503;
                        }

                        this._markTrackedResponseError(res, errorMessage, errorStatus);

                        res.write(
                            `event: error\ndata: ${JSON.stringify({
                                error: {
                                    message: errorMessage,
                                    type: errorType,
                                },
                                type: "error",
                            })}\n\n`
                        );
                        this.logger.info("[Request] Claude error event sent to SSE stream");
                    } catch (writeError) {
                        this.logger.error(`[Request] Failed to write error to Claude stream: ${writeError.message}`);
                    }
                }
            }

            if (!res.writableEnded) res.end();
        } else {
            this.logger.error(`[Request] Claude request error: ${errorMsg}`);
            let status = 500;
            let errorType = "api_error";
            // Use precise error type checking instead of string matching
            if (error instanceof QueueTimeoutError || error.code === "QUEUE_TIMEOUT") {
                status = 504;
                errorType = "timeout_error";
            } else if (this._isConnectionResetError(error)) {
                status = 503;
                errorType = "overloaded_error";
                this.logger.info(`[Request] Queue closed, returning 503 Service Unavailable.`);
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
                    this.logger.debug(
                        `[Request] Request #${proxyRequest.request_id} was properly cancelled by user, not counted in failure statistics.`
                    );
                } else {
                    this._logFinalRequestFailure(result.error, "Gemini fake stream");
                    // If keep-alives already started the SSE response, send an SSE error event instead of JSON.
                    if (res.headersSent) {
                        this._handleRequestError(result.error, res, "gemini");
                    } else {
                        this._sendErrorResponse(res, result.error.status || 500, result.error.message);
                    }

                    // Avoid switching account if the error is just a connection reset
                    if (!result.error.skipAccountSwitch && !this._isConnectionResetError(result.error)) {
                        await this.authSwitcher.handleRequestFailureAndSwitch(result.error, null);
                    } else if (result.error.skipAccountSwitch) {
                        this.logger.info(
                            "[Request] Immediate-switch retries exhausted, skipping additional account switch."
                        );
                    } else {
                        this.logger.info(
                            "[Request] Failure due to connection reset (Gemini Non-Stream), skipping account switch."
                        );
                    }
                }
                return;
            }

            if (proxyRequest.is_generative && this.authSwitcher.failureCount > 0) {
                this.logger.debug(
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
            let hadStreamError = false;
            try {
                // eslint-disable-next-line no-constant-condition
                while (true) {
                    const message = await activeQueue.dequeue(this.timeouts.FAKE_STREAM); // 5 min timeout for fake streaming
                    if (message.type === "STREAM_END") {
                        break;
                    }

                    if (message.event_type === "error") {
                        this.logger.error(`[Request] Error received during Gemini pseudo-stream: ${message.message}`);
                        this._markTrackedResponseError(res, message.message, 500);
                        hadStreamError = true;
                        this._handleRequestError({ message: message.message }, res, "gemini");
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
                    // Classify error type and send appropriate response
                    this._handleFakeStreamError(error, res, "gemini");
                } else {
                    this.logger.debug(
                        "[Request] Gemini pseudo-stream interrupted by connection reset, skipping error write"
                    );
                }
                // Return early to prevent JSON parsing of incomplete data
                return;
            }
            if (hadStreamError) {
                // Backend errored; don't attempt to parse/split/send "normal" chunks afterwards.
                return;
            }

            try {
                const googleResponse = JSON.parse(fullData);
                this._logGeminiNativeResponseDebug(googleResponse, "pseudo-stream");
                const candidate = googleResponse.candidates?.[0];

                if (candidate && candidate.content && Array.isArray(candidate.content.parts)) {
                    this.logger.debug(
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
                        if (!this._isResponseWritable(res)) {
                            this.logger.debug(
                                "[Request] Response no longer writable during Gemini stream (thinking parts); stopping stream."
                            );
                            return;
                        }
                        try {
                            res.write(`data: ${JSON.stringify(thinkingResponse)}\n\n`);
                        } catch (writeError) {
                            this.logger.debug(
                                `[Request] Failed to write Gemini thinking chunk to stream: ${writeError.message}`
                            );
                            return;
                        }
                        this.logger.debug(`[Request] Sent ${thinkingParts.length} thinking part(s).`);
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
                        if (!this._isResponseWritable(res)) {
                            this.logger.debug(
                                "[Request] Response no longer writable during Gemini stream (content parts); stopping stream."
                            );
                            return;
                        }
                        try {
                            res.write(`data: ${JSON.stringify(contentResponse)}\n\n`);
                        } catch (writeError) {
                            this.logger.debug(
                                `[Request] Failed to write Gemini content chunk to stream: ${writeError.message}`
                            );
                            return;
                        }
                        this.logger.debug(`[Request] Sent ${contentParts.length} content part(s).`);
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
                        if (!this._isResponseWritable(res)) {
                            this.logger.debug(
                                "[Request] Response no longer writable during Gemini stream (final response); stopping stream."
                            );
                            return;
                        }
                        try {
                            res.write(`data: ${JSON.stringify(finalResponse)}\n\n`);
                        } catch (writeError) {
                            this.logger.debug(
                                `[Request] Failed to write Gemini final chunk to stream: ${writeError.message}`
                            );
                            return;
                        }
                    }
                } else if (fullData) {
                    // Fallback for responses without candidates or parts, or if parsing fails
                    this.logger.warn(
                        "[Request] Response structure not recognized for splitting, sending as a single chunk."
                    );
                    if (!this._isResponseWritable(res)) {
                        this.logger.debug(
                            "[Request] Response no longer writable during Gemini stream (fallback); stopping stream."
                        );
                        return;
                    }
                    try {
                        res.write(`data: ${fullData}\n\n`);
                    } catch (writeError) {
                        this.logger.debug(
                            `[Request] Failed to write Gemini fallback chunk to stream: ${writeError.message}`
                        );
                        return;
                    }
                }
            } catch (e) {
                this.logger.error(
                    `[Request] Failed to parse and split Gemini response: ${e.message}. Sending raw data.`
                );
                if (fullData) {
                    if (!this._isResponseWritable(res)) {
                        this.logger.debug(
                            "[Request] Response no longer writable during Gemini stream (error fallback); stopping stream."
                        );
                        return;
                    }
                    try {
                        res.write(`data: ${fullData}\n\n`);
                    } catch (writeError) {
                        this.logger.debug(
                            `[Request] Failed to write Gemini error fallback chunk to stream: ${writeError.message}`
                        );
                        return;
                    }
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
            this._handleRequestError(error, res, "gemini");
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
        let currentQueue = messageQueue;
        let headerMessage;
        let skipFinalFailureSwitch = false;
        const immediateSwitchTracker = this._createImmediateSwitchTracker();

        // eslint-disable-next-line no-constant-condition
        while (true) {
            // Record attempt before forwarding, so failed attempts are also counted
            this._getUsageStatsService()?.recordAttempt(
                proxyRequest.request_id,
                this.currentAuthIndex,
                this._getAccountNameForIndex(this.currentAuthIndex)
            );
            this._forwardRequest(proxyRequest);
            headerMessage = await currentQueue.dequeue();

            const headerStatus = Number(headerMessage?.status);
            if (
                headerMessage.event_type === "error" &&
                proxyRequest.is_generative &&
                !isUserAbortedError(headerMessage) &&
                Number.isFinite(headerStatus) &&
                this.config?.immediateSwitchStatusCodes?.includes(headerStatus)
            ) {
                this.logger.warn(
                    `[Request] Gemini real stream received ${headerStatus}, switching account and retrying...`
                );
                const switched = await this._performImmediateSwitchRetry(
                    headerMessage,
                    proxyRequest.request_id,
                    immediateSwitchTracker
                );
                if (!switched) {
                    skipFinalFailureSwitch = true;
                    break;
                }

                try {
                    currentQueue.close("retry_after_429");
                } catch {
                    /* empty */
                }

                this._advanceProxyRequestAttempt(proxyRequest);
                currentQueue = this.connectionRegistry.createMessageQueue(
                    proxyRequest.request_id,
                    this.currentAuthIndex,
                    proxyRequest.request_attempt_id
                );
                continue;
            }

            break;
        }

        if (headerMessage.event_type === "error") {
            if (isUserAbortedError(headerMessage)) {
                this.logger.debug(
                    `[Request] Request #${proxyRequest.request_id} was properly cancelled by user, not counted in failure statistics.`
                );
            } else {
                this._logFinalRequestFailure(headerMessage, "Gemini real stream");
                // Avoid switching account if the error is just a connection reset
                if (!skipFinalFailureSwitch && !this._isConnectionResetError(headerMessage)) {
                    await this.authSwitcher.handleRequestFailureAndSwitch(headerMessage, null);
                } else if (skipFinalFailureSwitch) {
                    this.logger.info(
                        "[Request] Immediate-switch retries exhausted, skipping additional account switch."
                    );
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
            this.logger.debug(
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
                const dataMessage = await currentQueue.dequeue(this.timeouts.STREAM_CHUNK);
                if (dataMessage.type === "STREAM_END") {
                    this.logger.info("[Request] Received stream end signal.");
                    break;
                }

                if (dataMessage.event_type === "error") {
                    this.logger.error(`[Request] Error received during Gemini real stream: ${dataMessage.message}`);
                    this._markTrackedResponseError(res, dataMessage.message, 500);
                    // Check if response is still writable before attempting to write
                    if (this._isResponseWritable(res)) {
                        try {
                            res.write(
                                `data: ${JSON.stringify({ error: { code: 500, message: dataMessage.message, status: "INTERNAL" } })}\n\n`
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
                    this._logGeminiNativeChunkDebug(dataMessage.data, "stream");
                    if (!this._isResponseWritable(res)) {
                        this.logger.debug(
                            "[Request] Response no longer writable during Gemini real stream; stopping stream."
                        );
                        break;
                    }
                    try {
                        res.write(dataMessage.data);
                        lastChunk = dataMessage.data;
                    } catch (writeError) {
                        this.logger.debug(
                            `[Request] Failed to write Gemini data chunk to stream: ${writeError.message}`
                        );
                        break;
                    }
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
            // Handle queue closed errors (account switch, context closed, etc.)
            if (this._isConnectionResetError(error)) {
                this._handleRealStreamQueueClosedError(error, res, "gemini");
            } else if (error instanceof QueueTimeoutError || error.code === "QUEUE_TIMEOUT") {
                // Keep behavior consistent with other interfaces: treat missing stream chunks as a timeout error.
                this._handleRequestError(error, res, "gemini");
            } else {
                // Unexpected error - rethrow to outer handler
                throw error;
            }
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
                    this._logFinalRequestFailure(result.error, "Gemini non-stream");
                    // Avoid switching account if the error is just a connection reset
                    if (!result.error.skipAccountSwitch && !this._isConnectionResetError(result.error)) {
                        await this.authSwitcher.handleRequestFailureAndSwitch(result.error, null);
                    } else if (result.error.skipAccountSwitch) {
                        this.logger.info(
                            "[Request] Immediate-switch retries exhausted, skipping additional account switch."
                        );
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
                this.logger.debug(
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
                    this._markTrackedResponseError(res, message.message, 500);
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
                this._logGeminiNativeResponseDebug(fullResponse, "non-stream");
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
        let retryAttempt = 1;
        const immediateSwitchTracker = this._createImmediateSwitchTracker();

        while (retryAttempt <= this.maxRetries) {
            // Record attempt at the start of each retry, before forwarding.
            // This ensures failed attempts (e.g. 429 before any response) are also counted.
            this._getUsageStatsService()?.recordAttempt(
                proxyRequest.request_id,
                this.currentAuthIndex,
                this._getAccountNameForIndex(this.currentAuthIndex)
            );
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
                    // JSON parse failed - check if it's a timeout error
                    if (error.code === "QUEUE_TIMEOUT" || error instanceof QueueTimeoutError) {
                        errorPayload = { message: error.message || "Queue timeout", status: 504 };
                    } else {
                        errorPayload = { message: error.message, status: 500 };
                    }
                }

                // Stop retrying immediately if the queue is closed
                if (this._isConnectionResetError(error)) {
                    // Check the actual closure reason to provide accurate error messages
                    const reason = error.reason || "unknown";
                    const isClientDisconnect = reason === "client_disconnect";

                    if (isClientDisconnect) {
                        this.logger.warn(`[Request] Message queue closed due to client disconnect, aborting retries.`);
                        lastError = { message: "Connection lost (client disconnect)", status: 503 };
                    } else {
                        // Queue closed for other reasons (account_switch, system_reset, etc.)
                        this.logger.warn(`[Request] Message queue closed (reason: ${reason}), aborting retries.`);
                        lastError = {
                            message: `Queue closed: ${error.message || reason}`,
                            reason,
                            status: 503,
                        };
                    }
                    break;
                }

                lastError = errorPayload;

                // Check if we should stop retrying immediately based on status code
                const errorStatus = Number(errorPayload?.status);
                if (
                    Number.isFinite(errorStatus) &&
                    this.config?.immediateSwitchStatusCodes?.includes(errorStatus) &&
                    !isUserAbortedError(errorPayload)
                ) {
                    this.logger.warn(`[Request] Received ${errorStatus}, switching account and retrying...`);
                    try {
                        const switched = await this._performImmediateSwitchRetry(
                            errorPayload,
                            proxyRequest.request_id,
                            immediateSwitchTracker
                        );
                        if (!switched) {
                            lastError = { ...errorPayload, skipAccountSwitch: true };
                            break;
                        }
                    } catch (switchError) {
                        lastError = { ...errorPayload, skipAccountSwitch: true };
                        this.logger.error(
                            `[Request] Account switch failed during immediate-switch retry flow: ${switchError.message}`
                        );
                        break;
                    }
                    try {
                        currentQueue.close("retry_creating_new_queue");
                    } catch (e) {
                        this.logger.debug(`[Request] Failed to close old queue before retry: ${e.message}`);
                    }

                    this.logger.debug(
                        `[Request] Creating new message queue after immediate switch for request #${proxyRequest.request_id} (switching from account #${currentQueueAuthIndex} to #${this.currentAuthIndex})`
                    );
                    this._advanceProxyRequestAttempt(proxyRequest);
                    currentQueue = this.connectionRegistry.createMessageQueue(
                        proxyRequest.request_id,
                        this.currentAuthIndex,
                        proxyRequest.request_attempt_id
                    );
                    currentQueueAuthIndex = this.currentAuthIndex;
                    continue;
                }

                // Log the warning for the current attempt
                this.logger.warn(
                    `[Request] Attempt #${retryAttempt}/${this.maxRetries} for request #${proxyRequest.request_id} failed: ${errorPayload.message}`
                );

                // If it's the last attempt, break the loop to return failure
                if (retryAttempt >= this.maxRetries) {
                    this.logger.error(
                        `[Request] All ${this.maxRetries} retries failed for request #${proxyRequest.request_id}. Final error: ${errorPayload.message}`
                    );
                    break;
                }

                // Cancel browser request on the ORIGINAL account that owns this queue.
                // request_attempt_id isolates retries so a delayed cancel cannot abort a newer attempt.
                // If account has switched, currentAuthIndex may differ from currentQueueAuthIndex.
                this._cancelBrowserRequest(
                    proxyRequest.request_id,
                    currentQueueAuthIndex,
                    proxyRequest.request_attempt_id
                );

                // Explicitly close the old queue before creating a new one
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
                    `[Request] Creating new message queue for retry #${retryAttempt + 1} for request #${proxyRequest.request_id} (switching from account #${currentQueueAuthIndex} to #${this.currentAuthIndex})`
                );
                this._advanceProxyRequestAttempt(proxyRequest);
                currentQueue = this.connectionRegistry.createMessageQueue(
                    proxyRequest.request_id,
                    this.currentAuthIndex,
                    proxyRequest.request_attempt_id
                );
                // Update tracked authIndex for the new queue
                currentQueueAuthIndex = this.currentAuthIndex;

                // Wait before the next retry
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                retryAttempt++;
            }
        }

        // After all retries, return the final failure result
        return { error: lastError, success: false };
    }

    async _streamOpenAIResponseAPIResponse(messageQueue, res, model, streamOptions = {}) {
        const streamState = {
            responseDefaults: streamOptions.responseDefaults || {},
        };
        // Keep Response API sequence numbers consistent across helpers that might write to the same SSE response.
        if (res.__responseApiSeq == null) res.__responseApiSeq = 0;
        streamState.sequenceNumber = res.__responseApiSeq;

        try {
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const message = await messageQueue.dequeue(this.timeouts.STREAM_CHUNK);
                if (message.type === "STREAM_END") {
                    this.logger.info("[Request] OpenAI Response API stream end signal received.");
                    break;
                }

                if (message.event_type === "error") {
                    this.logger.error(`[Request] Error received during Response API stream: ${message.message}`);
                    this._markTrackedResponseError(res, message.message, 500);
                    if (this._isResponseWritable(res)) {
                        try {
                            if (!streamState.sequenceNumber) streamState.sequenceNumber = 0;
                            streamState.sequenceNumber++;
                            res.__responseApiSeq = streamState.sequenceNumber;
                            res.write(
                                `event: error\ndata: ${JSON.stringify({
                                    code: "api_error",
                                    message: message.message,
                                    param: null,
                                    sequence_number: streamState.sequenceNumber,
                                    type: "error",
                                })}\n\n`
                            );
                        } catch (writeError) {
                            this.logger.debug(
                                `[Request] Failed to write error to Response API stream: ${writeError.message}`
                            );
                        }
                    }
                    break;
                }

                if (message.data) {
                    const responseAPIChunk = this.formatConverter.translateGoogleToResponseAPIStream(
                        message.data,
                        model,
                        streamState
                    );
                    if (typeof streamState.sequenceNumber === "number") {
                        res.__responseApiSeq = streamState.sequenceNumber;
                    }
                    if (responseAPIChunk) {
                        if (!this._isResponseWritable(res)) {
                            this.logger.debug(
                                "[Request] Response no longer writable during Response API stream; stopping stream."
                            );
                            break;
                        }
                        try {
                            res.write(responseAPIChunk);
                        } catch (writeError) {
                            this.logger.debug(
                                `[Request] Failed to write Response API chunk (connection likely closed): ${writeError.message}`
                            );
                            break;
                        }
                    }
                }
            }
        } catch (error) {
            // Only handle connection reset errors here (client disconnect / queue closed).
            // Let other errors (timeout, parsing, logic errors) propagate to the outer catch.
            if (this._isConnectionResetError(error)) {
                this._handleRealStreamQueueClosedError(error, res, "response_api");
                return;
            }

            throw error;
        }
    }

    async _streamOpenAIResponse(messageQueue, res, model) {
        const streamState = {};

        try {
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const message = await messageQueue.dequeue(this.timeouts.STREAM_CHUNK);
                if (message.type === "STREAM_END") {
                    this.logger.info("[Request] OpenAI stream end signal received.");
                    if (this._isResponseWritable(res)) {
                        try {
                            res.write("data: [DONE]\n\n");
                        } catch (writeError) {
                            this.logger.debug(
                                `[Request] Failed to write final [DONE] to OpenAI stream (connection likely closed): ${writeError.message}`
                            );
                        }
                    }
                    break;
                }

                if (message.event_type === "error") {
                    this.logger.error(`[Request] Error received during OpenAI stream: ${message.message}`);
                    this._markTrackedResponseError(res, message.message, 500);
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
                        if (!this._isResponseWritable(res)) {
                            this.logger.debug(
                                "[Request] Response no longer writable during OpenAI stream; stopping stream."
                            );
                            break;
                        }
                        try {
                            res.write(openAIChunk);
                        } catch (writeError) {
                            this.logger.debug(
                                `[Request] Failed to write OpenAI chunk to stream: ${writeError.message}`
                            );
                            break;
                        }
                    }
                }
            }
        } catch (error) {
            // Only handle connection reset errors here (client disconnect)
            // Let other errors (timeout, parsing, logic errors) propagate to outer catch
            if (this._isConnectionResetError(error)) {
                this._handleRealStreamQueueClosedError(error, res, "openai");
                return;
            }

            // Re-throw all other errors to be handled by outer catch block
            throw error;
        }
    }

    async _sendOpenAIResponseAPINonStreamResponse(messageQueue, res, model, responseDefaults = {}) {
        let fullBody = "";
        let receiving = true;
        while (receiving) {
            const message = await messageQueue.dequeue();
            if (message.type === "STREAM_END") {
                this.logger.info("[Request] OpenAI Response API received end signal.");
                receiving = false;
                break;
            }

            if (message.event_type === "error") {
                this.logger.error(
                    `[Adapter] Error during OpenAI Response API non-stream conversion: ${message.message}`
                );
                this._sendErrorResponse(res, 500, message.message);
                return;
            }

            if (message.event_type === "chunk" && message.data) {
                fullBody += message.data;
            }
        }

        // Parse and convert to OpenAI Response API format
        try {
            const googleResponse = JSON.parse(fullBody);
            const responseAPIResponse = this.formatConverter.convertGoogleToResponseAPINonStream(
                googleResponse,
                model,
                responseDefaults
            );
            res.type("application/json").send(JSON.stringify(responseAPIResponse));
        } catch (e) {
            this.logger.error(`[Adapter] Failed to parse response for OpenAI Response API: ${e.message}`);
            this._sendErrorResponse(res, 500, "Failed to parse backend response");
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

    _handleRequestError(error, res, format = "openai") {
        // Normalize error message to handle non-Error objects and missing/non-string messages
        const errorMsg = String(error?.message ?? error);

        // Check if this is a client disconnect - if so, just log and return
        if (this._isConnectionResetError(error)) {
            const isClientDisconnect = error.reason === "client_disconnect" || !this._isResponseWritable(res);
            if (isClientDisconnect) {
                this._markTrackedClientAbort(res, errorMsg);
                this.logger.info(`[Request] Request terminated: Queue closed (${error.reason || "connection_lost"})`);
                if (!res.writableEnded) {
                    try {
                        res.end();
                    } catch (e) {
                        // Ignore end errors for disconnected clients
                    }
                }
                return;
            }
        }

        if (res.headersSent) {
            this.logger.error(`[Request] Request processing error (headers already sent): ${errorMsg}`);

            // Try to send error in the stream format
            if (this._isResponseWritable(res)) {
                const contentType = res.getHeader("content-type");

                if (contentType && contentType.includes("text/event-stream")) {
                    // SSE format - send error event
                    try {
                        // Determine error code and type based on error classification
                        let errorCode = 500;
                        let errorType = "api_error";
                        let errorMessage = `Processing failed: ${errorMsg}`;

                        // Use precise error type checking instead of string matching
                        if (error instanceof QueueTimeoutError || error.code === "QUEUE_TIMEOUT") {
                            errorCode = 504;
                            errorType = "timeout_error";
                            errorMessage = `Stream timeout: ${errorMsg}`;
                        } else if (this._isConnectionResetError(error)) {
                            errorCode = 503;
                            errorType = "service_unavailable";
                            errorMessage = `Service unavailable: ${errorMsg}`;
                        }

                        this._markTrackedResponseError(res, errorMessage, errorCode);

                        if (format === "response_api") {
                            if (res.__responseApiSeq == null) res.__responseApiSeq = 0;
                            res.__responseApiSeq += 1;
                            res.write(
                                `event: error\ndata: ${JSON.stringify({
                                    code: errorType,
                                    message: errorMessage,
                                    param: null,
                                    sequence_number: res.__responseApiSeq,
                                    type: "error",
                                })}\n\n`
                            );
                        } else if (format === "claude") {
                            res.write(
                                `event: error\ndata: ${JSON.stringify({
                                    error: {
                                        message: errorMessage,
                                        type: errorType,
                                    },
                                    type: "error",
                                })}\n\n`
                            );
                        } else if (format === "gemini") {
                            let statusText = "INTERNAL";
                            if (errorCode === 504) statusText = "DEADLINE_EXCEEDED";
                            else if (errorCode === 503) statusText = "UNAVAILABLE";
                            res.write(
                                `data: ${JSON.stringify({
                                    error: {
                                        code: errorCode,
                                        message: errorMessage,
                                        status: statusText,
                                    },
                                })}\n\n`
                            );
                        } else {
                            res.write(
                                `data: ${JSON.stringify({
                                    error: {
                                        code: errorCode,
                                        message: errorMessage,
                                        type: errorType,
                                    },
                                })}\n\n`
                            );
                        }
                        this.logger.info("[Request] Error event sent to SSE stream");
                    } catch (writeError) {
                        const writeErrorMsg = String(writeError?.message ?? writeError);
                        this.logger.error(`[Request] Failed to write error to stream: ${writeErrorMsg}`);
                    }
                } else if (res.__proxyResponseStreamMode === "fake") {
                    // Request-scoped fake stream mode - try to send an SSE-style error chunk
                    try {
                        let status = 500;
                        if (error instanceof QueueTimeoutError || error.code === "QUEUE_TIMEOUT") {
                            status = 504;
                        } else if (this._isConnectionResetError(error)) {
                            status = 503;
                        }
                        this._sendErrorChunkToClient(res, `Processing failed: ${errorMsg}`, status);
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
            // Use precise error type checking instead of string matching
            if (error instanceof QueueTimeoutError || error.code === "QUEUE_TIMEOUT") {
                status = 504;
            } else if (this._isConnectionResetError(error)) {
                status = 503;
                this.logger.info(`[Request] Queue closed, returning 503 Service Unavailable.`);
            }
            this._sendErrorResponse(res, status, `Proxy error: ${errorMsg}`);
        }
    }

    _sendErrorResponse(res, status, message) {
        if (!res.headersSent) {
            this._markTrackedResponseError(res, message, status || 500);
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
        // Explicitly return boolean to avoid returning null/undefined from res.socket check
        return Boolean(
            !res.writableEnded && !res.destroyed && res.socket && !res.socket.destroyed && res.socket.writable !== false
        );
    }

    _sendErrorChunkToClient(res, message, statusCode = 500) {
        if (!res.headersSent) {
            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Connection", "keep-alive");
        }
        this._markTrackedResponseError(res, message, statusCode);
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
                this._markTrackedClientAbort(res);
                this.logger.warn(`[Request] Client closed request #${requestId} connection prematurely.`);

                // Dynamically look up the current authIndex from the connection registry
                // This ensures we cancel on the correct account even after retries switch accounts
                const targetAuthIndex =
                    this.connectionRegistry.getAuthIndexForRequest(requestId) ?? this.currentAuthIndex;
                const requestAttemptId = this.connectionRegistry.getRequestAttemptIdForRequest(requestId);

                this._cancelBrowserRequest(requestId, targetAuthIndex, requestAttemptId);
                // Close and remove the message queue to unblock any waiting dequeue() calls
                this.connectionRegistry.removeMessageQueue(requestId, "client_disconnect");
            }
        });
    }

    _cancelBrowserRequest(requestId, authIndex, requestAttemptId = null) {
        const targetAuthIndex = authIndex !== undefined ? authIndex : this.currentAuthIndex;
        const connection = this.connectionRegistry.getConnectionByAuth(targetAuthIndex);
        if (connection) {
            this.logger.info(
                `[Request] Cancelling request #${requestId} on account #${targetAuthIndex}` +
                    (requestAttemptId ? ` (attempt ${requestAttemptId})` : "")
            );
            connection.send(
                JSON.stringify({
                    event_type: "cancel_request",
                    request_attempt_id: requestAttemptId,
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
     * Handle queue timeout by notifying browser to cancel the request
     * @param {Error} error - The timeout error
     * @param {string} requestId - The request ID
     */
    _handleQueueTimeout(error, requestId) {
        if (error.code === "QUEUE_TIMEOUT" || error instanceof QueueTimeoutError) {
            // Get the authIndex for this request from the registry
            const authIndex = this.connectionRegistry.getAuthIndexForRequest(requestId);
            const requestAttemptId = this.connectionRegistry.getRequestAttemptIdForRequest(requestId);
            if (authIndex !== null) {
                this.logger.debug(
                    `[Request] Queue timeout for request #${requestId}, notifying browser on account #${authIndex} to cancel`
                );
                this._cancelBrowserRequest(requestId, authIndex, requestAttemptId);
            } else {
                this.logger.debug(
                    `[Request] Queue timeout for request #${requestId}, but queue already removed (authIndex not found)`
                );
            }
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

        // Parse model suffixes from model name in native Gemini generation requests
        // Only handle generation requests: /v1beta/models/{modelName}:generateContent or :streamGenerateContent
        const modelPathMatch = cleanPath.match(
            /^(\/v1beta\/models\/)([^:]+)(:(generateContent|streamGenerateContent).*)$/
        );
        let modelThinkingLevel = null;
        let modelStreamingMode = null;
        let modelForceWebSearch = false;

        if (modelPathMatch) {
            const pathPrefix = modelPathMatch[1];
            const rawModelName = modelPathMatch[2];
            const pathSuffix = modelPathMatch[3];

            const { cleanModelName: searchStrippedModel, forceWebSearch: parsedForceWebSearch } =
                FormatConverter.parseModelWebSearchSuffix(rawModelName);
            const { cleanModelName: streamStrippedModel, streamingMode: parsedStreamingMode } =
                FormatConverter.parseModelStreamingModeSuffix(searchStrippedModel);
            const { cleanModelName, thinkingLevel: parsedThinkingLevel } =
                FormatConverter.parseModelThinkingLevel(streamStrippedModel);
            modelForceWebSearch = parsedForceWebSearch;
            modelStreamingMode = parsedStreamingMode;
            modelThinkingLevel = parsedThinkingLevel;

            if (modelForceWebSearch) {
                this.logger.info(
                    `[Proxy] Detected webSearch suffix in model path: "${rawModelName}" -> model="${searchStrippedModel}", forceWebSearch=true`
                );
            }

            if (modelStreamingMode) {
                this.logger.info(
                    `[Proxy] Detected streamingMode suffix in model path: "${searchStrippedModel}" -> model="${streamStrippedModel}", streamingMode="${modelStreamingMode}"`
                );
            }

            if (modelThinkingLevel) {
                this.logger.info(
                    `[Proxy] Detected thinkingLevel suffix in model path: "${streamStrippedModel}" -> model="${cleanModelName}", thinkingLevel="${modelThinkingLevel}"`
                );
            }

            // Always strip recognized directives from path model name
            if (cleanModelName !== rawModelName) {
                cleanPath = `${pathPrefix}${cleanModelName}${pathSuffix}`;
            }
        }

        // Force thinking for native Google requests (processed first)
        if (this.serverSystem.forceThinking && req.method === "POST" && bodyObj && bodyObj.contents) {
            if (!bodyObj.generationConfig) {
                bodyObj.generationConfig = {};
            }
            if (
                !bodyObj.generationConfig.thinkingConfig ||
                bodyObj.generationConfig.thinkingConfig.includeThoughts === undefined
            ) {
                this.logger.info(`[Proxy] ⚠️ Force thinking enabled, setting includeThoughts=true. (Google Native)`);
                bodyObj.generationConfig.thinkingConfig = {
                    ...(bodyObj.generationConfig.thinkingConfig || {}),
                    includeThoughts: true,
                };
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
            (this.serverSystem.forceWebSearch || modelForceWebSearch || this.serverSystem.forceUrlContext) &&
            req.method === "POST" &&
            bodyObj &&
            bodyObj.contents
        ) {
            if (!bodyObj.tools) {
                bodyObj.tools = [];
            }

            const toolsToAdd = [];

            // Handle Google Search
            if (this.serverSystem.forceWebSearch || modelForceWebSearch) {
                const hasSearch = FormatConverter.hasGeminiGoogleSearchTool(bodyObj.tools);
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
                const hasUrlContext = FormatConverter.hasGeminiUrlContextTool(bodyObj.tools);
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

        this.formatConverter.ensureServerSideToolInvocations(bodyObj, "[Proxy]");

        // Apply safety settings for native Google requests (only if not already provided)
        if (req.method === "POST" && bodyObj && bodyObj.contents && !bodyObj.safetySettings) {
            bodyObj.safetySettings = this.formatConverter.getDefaultSafetySettings();
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
            streaming_mode: modelStreamingMode || this.serverSystem.streamingMode,
        };
    }

    _initializeProxyRequestAttempt(proxyRequest) {
        if (!proxyRequest.request_attempt_number) {
            proxyRequest.request_attempt_number = 1;
        }
        proxyRequest.request_attempt_id = this._generateRequestAttemptId(
            proxyRequest.request_id,
            proxyRequest.request_attempt_number
        );
    }

    _advanceProxyRequestAttempt(proxyRequest) {
        proxyRequest.request_attempt_number = (proxyRequest.request_attempt_number || 1) + 1;
        proxyRequest.request_attempt_id = this._generateRequestAttemptId(
            proxyRequest.request_id,
            proxyRequest.request_attempt_number
        );
    }

    _forwardRequest(proxyRequest) {
        const connection = this.connectionRegistry.getConnectionByAuth(this.currentAuthIndex);
        if (connection) {
            this.logger.debug(
                `[Request] Forwarding request #${proxyRequest.request_id} via connection for authIndex=${this.currentAuthIndex}` +
                    ` (attempt=${proxyRequest.request_attempt_id})`
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

    _generateRequestAttemptId(requestId, attemptNumber) {
        return `${requestId}_attempt_${attemptNumber}_${Math.random().toString(36).substring(2, 8)}`;
    }
}

module.exports = RequestHandler;

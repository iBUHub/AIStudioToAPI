/**
 * File: src/core/ConnectionRegistry.js
 * Description: Connection registry that manages WebSocket connections and routes messages to appropriate message queues
 *
 * Author: Ellinav, iBenzene, bbbugg
 */

const { EventEmitter } = require("events");
const MessageQueue = require("../utils/MessageQueue");
const { ReconnectCancelledError, isReconnectCancelledError } = require("../utils/CustomErrors");

/**
 * Connection Registry Module
 * Responsible for managing WebSocket connections and message queues
 */
class ConnectionRegistry extends EventEmitter {
    /**
     * @param {Object} logger - Logger instance
     * @param {Function} [onConnectionLostCallback] - Optional callback to invoke when connection is lost after grace period
     * @param {Function} [getCurrentAuthIndex] - Function to get current auth index
     */
    constructor(logger, onConnectionLostCallback = null, getCurrentAuthIndex = null, browserManager = null) {
        super();
        this.logger = logger;
        this.onConnectionLostCallback = onConnectionLostCallback;
        this.getCurrentAuthIndex = getCurrentAuthIndex;
        this.browserManager = browserManager;
        // Map: authIndex -> WebSocket connection
        this.connectionsByAuth = new Map();
        // Map: requestId -> { queue: MessageQueue, authIndex: number, createdAt: number }
        this.messageQueues = new Map();
        // Map: authIndex -> timerId, supports independent grace period for each account
        this.reconnectGraceTimers = new Map();
        // Map: authIndex -> boolean, supports independent reconnect status for each account
        this.reconnectingAccounts = new Map();
        // Map: authIndex -> timeoutId, stores lightweight reconnect timeout timers
        this.lightweightReconnectTimeouts = new Map();
    }

    addConnection(websocket, clientInfo) {
        const authIndex = clientInfo.authIndex;

        // Validate authIndex: must be a valid non-negative integer
        if (authIndex === undefined || authIndex < 0 || !Number.isInteger(authIndex)) {
            this.logger.error(
                `[Server] Rejecting connection with invalid authIndex: ${authIndex}. Connection will be closed.`
            );
            this._safeCloseWebSocket(websocket, 1008, "Invalid authIndex");
            return;
        }

        // Check if there's already a connection for this authIndex
        const existingConnection = this.connectionsByAuth.get(authIndex);
        if (existingConnection && existingConnection !== websocket) {
            this.logger.warn(
                `[Server] Duplicate connection detected for authIndex=${authIndex}, closing old connection...`
            );
            try {
                // Remove event listeners to prevent them from firing during close
                existingConnection.removeAllListeners();
            } catch (e) {
                this.logger.warn(`[Server] Error removing listeners from old connection: ${e.message}`);
            }
            this._safeCloseWebSocket(existingConnection, 1000, "Replaced by new connection");
        }

        // Clear grace timer for this authIndex
        if (this.reconnectGraceTimers.has(authIndex)) {
            clearTimeout(this.reconnectGraceTimers.get(authIndex));
            this.reconnectGraceTimers.delete(authIndex);
            this.logger.debug(`[Server] Grace timer cleared for reconnected authIndex=${authIndex}`);
        }

        // Clear reconnecting status for this authIndex when connection is re-established
        if (this.reconnectingAccounts.has(authIndex)) {
            this.reconnectingAccounts.delete(authIndex);
            this.logger.debug(`[Server] Cleared reconnecting status for reconnected authIndex=${authIndex}`);
        }

        // Clear lightweight reconnect timeout timer for this authIndex
        if (this.lightweightReconnectTimeouts.has(authIndex)) {
            const { timeoutId, timeoutReject } = this.lightweightReconnectTimeouts.get(authIndex);
            clearTimeout(timeoutId);
            // Reject the timeout promise to unblock Promise.race() - this is caught and ignored
            if (timeoutReject) {
                timeoutReject(new ReconnectCancelledError("Reconnect succeeded, timeout cancelled"));
            }
            this.lightweightReconnectTimeouts.delete(authIndex);
            this.logger.debug(`[Server] Cleared lightweight reconnect timeout for reconnected authIndex=${authIndex}`);
        }

        // Clear message queues for the reconnecting account.
        // When WebSocket disconnects, the browser aborts all in-flight requests for that account.
        // Keeping those queues would cause them to hang until timeout.
        this.closeMessageQueuesForAuth(authIndex, "reconnect_cleanup");

        // Store connection by authIndex
        this.connectionsByAuth.set(authIndex, websocket);
        this.logger.info(
            `[Server] Internal WebSocket client connected (from: ${clientInfo.address}, authIndex: ${authIndex})`
        );

        // Store authIndex on websocket for cleanup
        websocket._authIndex = authIndex;

        websocket.on("message", data => this._handleIncomingMessage(data.toString()));
        websocket.on("close", () => this._removeConnection(websocket));
        websocket.on("error", error =>
            this.logger.error(`[Server] Internal WebSocket connection error: ${error.message}`)
        );
        this.emit("connectionAdded", websocket);
    }

    _removeConnection(websocket) {
        const disconnectedAuthIndex = websocket._authIndex;

        // Remove from connectionsByAuth if it has an authIndex
        if (disconnectedAuthIndex !== undefined && disconnectedAuthIndex >= 0) {
            this.connectionsByAuth.delete(disconnectedAuthIndex);
            this.logger.info(`[Server] Internal WebSocket client disconnected (authIndex: ${disconnectedAuthIndex}).`);
        } else {
            this.logger.info("[Server] Internal WebSocket client disconnected.");
            // Early return for invalid authIndex - no reconnect logic needed
            this.emit("connectionRemoved", websocket);
            return;
        }

        // Check if the page still exists for this account
        // If page is closed/missing, it means the context was intentionally closed, skip reconnect
        if (this.browserManager) {
            const contextData = this.browserManager.contexts.get(disconnectedAuthIndex);
            if (!contextData || !contextData.page || contextData.page.isClosed()) {
                this.logger.info(
                    `[Server] Account #${disconnectedAuthIndex} page is closed/missing, skipping reconnect logic.`
                );
                // Clear any existing grace timer
                if (this.reconnectGraceTimers.has(disconnectedAuthIndex)) {
                    clearTimeout(this.reconnectGraceTimers.get(disconnectedAuthIndex));
                    this.reconnectGraceTimers.delete(disconnectedAuthIndex);
                }
                // Clear reconnecting status
                if (this.reconnectingAccounts.has(disconnectedAuthIndex)) {
                    this.reconnectingAccounts.delete(disconnectedAuthIndex);
                }
                // Clear lightweight reconnect timeout
                if (this.lightweightReconnectTimeouts.has(disconnectedAuthIndex)) {
                    const { timeoutId, timeoutReject } = this.lightweightReconnectTimeouts.get(disconnectedAuthIndex);
                    clearTimeout(timeoutId);
                    if (timeoutReject) {
                        timeoutReject(new ReconnectCancelledError("Page closed, reconnect cancelled"));
                    }
                    this.lightweightReconnectTimeouts.delete(disconnectedAuthIndex);
                }
                // Close pending message queues for this account to prevent in-flight requests
                // from hanging until timeout
                this.closeMessageQueuesForAuth(disconnectedAuthIndex, "page_closed");
                // Emit event after all cleanup is done
                this.emit("connectionRemoved", websocket);
                return;
            }
        }

        // Clear any existing grace timer for THIS account before starting a new one
        if (this.reconnectGraceTimers.has(disconnectedAuthIndex)) {
            clearTimeout(this.reconnectGraceTimers.get(disconnectedAuthIndex));
        }

        this.logger.info(`[Server] Starting 10-second reconnect grace period for account #${disconnectedAuthIndex}...`);
        const graceTimerId = setTimeout(async () => {
            this.logger.debug(
                `[Server] Grace period ended for account #${disconnectedAuthIndex}, no reconnection detected.`
            );

            // Close queues belonging to the disconnected account.
            // Since queues are now bound to authIndex, this is safe even if the current account
            // has since switched — only account #disconnectedAuthIndex's queues are affected.
            this.closeMessageQueuesForAuth(disconnectedAuthIndex, "grace_period_timeout");

            // Attempt lightweight reconnect if callback is provided and this account is not already reconnecting
            const isAccountReconnecting = this.reconnectingAccounts.get(disconnectedAuthIndex) || false;
            if (this.onConnectionLostCallback && !isAccountReconnecting) {
                this.reconnectingAccounts.set(disconnectedAuthIndex, true);
                const lightweightReconnectTimeoutMs = 50000;
                this.logger.info(
                    `[Server] Attempting lightweight reconnect for account #${disconnectedAuthIndex} (timeout ${lightweightReconnectTimeoutMs / 1000}s)...`
                );
                let timeoutId;
                let timeoutReject;
                try {
                    const callbackPromise = this.onConnectionLostCallback(disconnectedAuthIndex);
                    const timeoutPromise = new Promise((_, reject) => {
                        timeoutReject = reject;
                        timeoutId = setTimeout(
                            () => reject(new Error("Lightweight reconnect timed out")),
                            lightweightReconnectTimeoutMs
                        );
                    });
                    // Store timeout ID and reject function so they can be cleared/resolved if connection is re-established
                    this.lightweightReconnectTimeouts.set(disconnectedAuthIndex, { timeoutId, timeoutReject });

                    await Promise.race([callbackPromise, timeoutPromise]);
                    this.logger.info(
                        `[Server] Lightweight reconnect callback completed for account #${disconnectedAuthIndex}.`
                    );
                } catch (error) {
                    // Check if this is a cancellation (reconnect succeeded) or a real failure
                    if (isReconnectCancelledError(error)) {
                        this.logger.info(
                            `[Server] Lightweight reconnect cancelled for account #${disconnectedAuthIndex} (connection re-established)`
                        );
                    } else {
                        this.logger.error(
                            `[Server] Lightweight reconnect failed for account #${disconnectedAuthIndex}: ${error.message}`
                        );
                    }
                } finally {
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                    }
                    this.lightweightReconnectTimeouts.delete(disconnectedAuthIndex);
                    this.reconnectingAccounts.delete(disconnectedAuthIndex);
                }
            }

            this.reconnectGraceTimers.delete(disconnectedAuthIndex);
        }, 10000);

        if (disconnectedAuthIndex !== undefined && disconnectedAuthIndex >= 0) {
            this.reconnectGraceTimers.set(disconnectedAuthIndex, graceTimerId);
        }

        // Emit event after grace timer is set up
        this.emit("connectionRemoved", websocket);
    }

    _handleIncomingMessage(messageData) {
        try {
            const parsedMessage = JSON.parse(messageData);
            const requestId = parsedMessage.request_id;
            if (!requestId) {
                this.logger.warn("[Server] Received invalid message: missing request_id");
                return;
            }
            const entry = this.messageQueues.get(requestId);
            if (entry) {
                this._routeMessage(parsedMessage, entry.queue);
            } else {
                this.logger.warn(`[Server] Received message for unknown or outdated request ID: ${requestId}`);
            }
        } catch (error) {
            this.logger.error(`[Server] Failed to parse internal WebSocket message: ${error.message}`);
        }
    }

    _routeMessage(message, queue) {
        const { event_type } = message;
        switch (event_type) {
            case "response_headers":
            case "chunk":
            case "error":
                queue.enqueue(message);
                break;
            case "stream_close":
                queue.enqueue({ type: "STREAM_END" });
                break;
            default:
                this.logger.warn(`[Server] Unknown internal event type: ${event_type}`);
        }
    }

    isReconnectingInProgress() {
        // Only check if current account is reconnecting, to avoid non-current account reconnection affecting current account's request handling
        const currentAuthIndex = this.getCurrentAuthIndex ? this.getCurrentAuthIndex() : -1;
        return currentAuthIndex >= 0 && (this.reconnectingAccounts.get(currentAuthIndex) || false);
    }

    isInGracePeriod() {
        // Only check if current account is in grace period, to avoid non-current account disconnection affecting current account's request handling
        const currentAuthIndex = this.getCurrentAuthIndex ? this.getCurrentAuthIndex() : -1;
        return currentAuthIndex >= 0 && this.reconnectGraceTimers.has(currentAuthIndex);
    }

    getConnectionByAuth(authIndex, log = true) {
        const connection = this.connectionsByAuth.get(authIndex);
        if (connection && log) {
            this.logger.debug(`[Registry] Found WebSocket connection for authIndex=${authIndex}`);
        } else if (this.logger.getLevel?.() === "DEBUG") {
            this.logger.debug(
                `[Registry] No WebSocket connection found for authIndex=${authIndex}. Available: [${Array.from(this.connectionsByAuth.keys()).join(", ")}]`
            );
        }
        return connection;
    }

    /**
     * Get all active WebSocket connections
     * @returns {Map<number, WebSocket>} Map of authIndex -> WebSocket connection
     */
    getAllConnections() {
        return this.connectionsByAuth;
    }

    /**
     * Broadcast a message to all active WebSocket connections
     * @param {string} message - JSON string to broadcast
     * @returns {number} Number of connections the message was sent to
     */
    broadcastMessage(message) {
        let sentCount = 0;
        for (const [authIndex, connection] of this.connectionsByAuth.entries()) {
            try {
                // WebSocket readyState: 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
                // Only send if connection is OPEN
                if (connection.readyState === 1) {
                    connection.send(message);
                    sentCount++;
                } else {
                    this.logger.debug(
                        `[Registry] Skipping broadcast to authIndex=${authIndex} (readyState=${connection.readyState})`
                    );
                }
            } catch (error) {
                this.logger.warn(`[Registry] Failed to broadcast to authIndex=${authIndex}: ${error.message}`);
            }
        }
        return sentCount;
    }

    /**
     * Close WebSocket connection for a specific account
     *
     * IMPORTANT: When deleting an account, always call BrowserManager.closeContext() BEFORE this method
     * Calling order: closeContext() -> closeConnectionByAuth()
     *
     * Reason: closeContext() removes the context from the contexts Map before closing it.
     * When this method closes the WebSocket, _removeConnection() will check if the context exists.
     * If context is already removed, _removeConnection() skips reconnect logic (which is desired for deletion).
     * If you call this method first, _removeConnection() may trigger unnecessary reconnect attempts.
     *
     * @param {number} authIndex - The auth index to close connection for
     */
    closeConnectionByAuth(authIndex) {
        const connection = this.connectionsByAuth.get(authIndex);
        if (connection) {
            this.logger.info(`[Registry] Closing WebSocket connection for authIndex=${authIndex}`);
            try {
                connection.close();
            } catch (e) {
                this.logger.warn(`[Registry] Error closing WebSocket for authIndex=${authIndex}: ${e.message}`);
            }
            // Remove from map immediately (the close event will also trigger _removeConnection)
            this.connectionsByAuth.delete(authIndex);

            // Clear any grace timers for this account
            if (this.reconnectGraceTimers.has(authIndex)) {
                clearTimeout(this.reconnectGraceTimers.get(authIndex));
                this.reconnectGraceTimers.delete(authIndex);
            }

            // Clear reconnecting status for this account
            if (this.reconnectingAccounts.has(authIndex)) {
                this.reconnectingAccounts.delete(authIndex);
                this.logger.debug(`[Registry] Cleared reconnecting status for authIndex=${authIndex}`);
            }

            // Clear lightweight reconnect timeout for this account
            if (this.lightweightReconnectTimeouts.has(authIndex)) {
                const { timeoutId, timeoutReject } = this.lightweightReconnectTimeouts.get(authIndex);
                clearTimeout(timeoutId);
                if (timeoutReject) {
                    timeoutReject(new ReconnectCancelledError("Connection closed manually, reconnect cancelled"));
                }
                this.lightweightReconnectTimeouts.delete(authIndex);
                this.logger.debug(`[Registry] Cleared lightweight reconnect timeout for authIndex=${authIndex}`);
            }
        } else {
            this.logger.debug(`[Registry] No WebSocket connection to close for authIndex=${authIndex}`);
        }
    }

    createMessageQueue(requestId, authIndex) {
        // Validate authIndex: must be a valid non-negative integer
        if (authIndex === undefined || authIndex < 0 || !Number.isInteger(authIndex)) {
            this.logger.error(
                `[Registry] Cannot create message queue with invalid authIndex: ${authIndex} for request ${requestId}`
            );
            throw new Error(`Invalid authIndex: ${authIndex}. Must be a non-negative integer.`);
        }

        // If a queue with the same requestId already exists, close and remove it first
        // This prevents stale queues from lingering when retrying failed requests
        const existingEntry = this.messageQueues.get(requestId);
        if (existingEntry) {
            this.logger.debug(
                `[Registry] Found existing message queue for request ${requestId} (authIndex=${existingEntry.authIndex}), closing it before creating new one`
            );
            try {
                existingEntry.queue.close("retry_replaced");
            } catch (e) {
                this.logger.debug(`[Registry] Failed to close existing queue for ${requestId}: ${e.message}`);
            }
            this.messageQueues.delete(requestId);
        }

        const queue = new MessageQueue();
        // Add timestamp for stale queue detection
        this.messageQueues.set(requestId, { authIndex, createdAt: Date.now(), queue });
        return queue;
    }

    removeMessageQueue(requestId, reason = "handler_cleanup") {
        const entry = this.messageQueues.get(requestId);
        if (entry) {
            entry.queue.close(reason);
            this.messageQueues.delete(requestId);
        }
    }

    /**
     * Get the authIndex associated with a specific request
     * @param {string} requestId - The request ID to look up
     * @returns {number|null} The authIndex for the request, or null if not found
     */
    getAuthIndexForRequest(requestId) {
        const entry = this.messageQueues.get(requestId);
        return entry ? entry.authIndex : null;
    }

    /**
     * Close all message queues belonging to a specific account
     * @param {number} authIndex - The account whose queues should be closed
     * @returns {number} Number of queues closed
     */
    closeMessageQueuesForAuth(authIndex, reason = "auth_context_closed") {
        let count = 0;
        for (const [requestId, entry] of this.messageQueues.entries()) {
            if (entry.authIndex === authIndex) {
                try {
                    entry.queue.close(reason);
                } catch (e) {
                    this.logger.warn(`[Registry] Failed to close message queue for request ${requestId}: ${e.message}`);
                }
                this.messageQueues.delete(requestId);
                count++;
            }
        }
        if (count > 0) {
            this.logger.info(
                `[Registry] Force closed ${count} pending message queue(s) for account #${authIndex} (reason: ${reason})`
            );
        }
        return count;
    }

    /**
     * Force close all message queues regardless of account
     * Used when the entire system is being reset
     */
    closeAllMessageQueues() {
        if (this.messageQueues.size > 0) {
            this.logger.info(`[Registry] Force closing ${this.messageQueues.size} pending message queues...`);
            this.messageQueues.forEach((entry, requestId) => {
                try {
                    entry.queue.close("system_reset");
                } catch (e) {
                    this.logger.warn(`[Registry] Failed to close message queue for request ${requestId}: ${e.message}`);
                }
            });
            this.messageQueues.clear();
        }
    }

    /**
     * Clean up stale message queues that have been waiting too long
     * This is a safety mechanism to prevent queue leaks from race conditions
     * @param {number} maxAgeMs - Maximum age in milliseconds (default: 10 minutes)
     * @returns {number} Number of stale queues cleaned up
     */
    cleanupStaleQueues(maxAgeMs = 600000) {
        const now = Date.now();
        let cleanedCount = 0;

        for (const [requestId, entry] of this.messageQueues.entries()) {
            const age = now - entry.createdAt;
            if (age > maxAgeMs) {
                this.logger.warn(
                    `[Registry] Cleaning up stale message queue for request ${requestId} (age: ${Math.round(age / 1000)}s, authIndex: ${entry.authIndex})`
                );
                try {
                    entry.queue.close("stale_cleanup");
                } catch (e) {
                    this.logger.debug(`[Registry] Failed to close stale queue for ${requestId}: ${e.message}`);
                }
                this.messageQueues.delete(requestId);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            this.logger.info(`[Registry] Cleaned up ${cleanedCount} stale message queue(s)`);
        }

        return cleanedCount;
    }

    /**
     * Safely close a WebSocket connection with readyState check
     * @param {WebSocket} ws - The WebSocket to close
     * @param {number} code - Close code (e.g., 1000, 1008)
     * @param {string} reason - Close reason
     */
    _safeCloseWebSocket(ws, code, reason) {
        if (!ws) {
            return;
        }

        // WebSocket readyState: 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
        // Only attempt to close if not already closing or closed
        if (ws.readyState === 0 || ws.readyState === 1) {
            try {
                ws.close(code, reason);
            } catch (error) {
                this.logger.warn(
                    `[Registry] Failed to close WebSocket (code=${code}, reason="${reason}"): ${error.message}`
                );
            }
        } else {
            this.logger.debug(
                `[Registry] WebSocket already closing/closed (readyState=${ws.readyState}), skipping close()`
            );
        }
    }
}

module.exports = ConnectionRegistry;

/**
 * File: src/core/ConnectionRegistry.js
 * Description: Connection registry that manages WebSocket connections and routes messages to appropriate message queues
 *
 * Author: Ellinav, iBenzene, bbbugg
 */

const { EventEmitter } = require("events");
const MessageQueue = require("../utils/MessageQueue");

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
        this.messageQueues = new Map();
        // Map: authIndex -> timerId, supports independent grace period for each account
        this.reconnectGraceTimers = new Map();
        // Map: authIndex -> boolean, supports independent reconnect status for each account
        this.reconnectingAccounts = new Map();
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
            this.logger.info(`[Server] Grace timer cleared for reconnected authIndex=${authIndex}`);
        }

        // Clear reconnecting status for this authIndex when connection is re-established
        if (this.reconnectingAccounts.has(authIndex)) {
            this.reconnectingAccounts.delete(authIndex);
            this.logger.info(`[Server] Cleared reconnecting status for reconnected authIndex=${authIndex}`);
        }

        // Clear message queues for reconnected current account
        // IMPORTANT: This must be done regardless of whether grace timer existed
        // Scenario: If WebSocket reconnects after grace period timeout (>10s),
        // grace timer is already deleted, but new message queues may have been created
        // When WebSocket disconnects, browser aborts all in-flight requests
        // Keeping these queues would cause them to hang until timeout
        const currentAuthIndex = this.getCurrentAuthIndex ? this.getCurrentAuthIndex() : -1;
        if (authIndex === currentAuthIndex && this.messageQueues.size > 0) {
            this.logger.info(
                `[Server] Reconnected current account #${authIndex}, clearing ${this.messageQueues.size} stale message queues...`
            );
            this.closeAllMessageQueues();
        }

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
                // Close pending message queues if this is the current account
                // to prevent in-flight requests from hanging until timeout
                const currentAuthIndex = this.getCurrentAuthIndex ? this.getCurrentAuthIndex() : -1;
                if (disconnectedAuthIndex === currentAuthIndex) {
                    this.closeAllMessageQueues();
                }
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
            this.logger.info(
                `[Server] Grace period ended for account #${disconnectedAuthIndex}, no reconnection detected.`
            );

            // Re-check if this is the current account at the time of grace period expiry
            const currentAuthIndex = this.getCurrentAuthIndex ? this.getCurrentAuthIndex() : -1;
            const isCurrentAccount = disconnectedAuthIndex === currentAuthIndex;

            // Only clear message queues if this is the current account
            if (isCurrentAccount) {
                this.closeAllMessageQueues();
            } else {
                this.logger.info(
                    `[Server] Non-current account #${disconnectedAuthIndex} disconnected, keeping message queues intact.`
                );
            }

            // Attempt lightweight reconnect if callback is provided and this account is not already reconnecting
            const isAccountReconnecting = this.reconnectingAccounts.get(disconnectedAuthIndex) || false;
            if (this.onConnectionLostCallback && !isAccountReconnecting) {
                this.reconnectingAccounts.set(disconnectedAuthIndex, true);
                const lightweightReconnectTimeoutMs = 50000;
                this.logger.info(
                    `[Server] Attempting lightweight reconnect for account #${disconnectedAuthIndex} (timeout ${lightweightReconnectTimeoutMs / 1000}s)...`
                );
                let timeoutId;
                try {
                    const callbackPromise = this.onConnectionLostCallback(disconnectedAuthIndex);
                    const timeoutPromise = new Promise((_, reject) => {
                        timeoutId = setTimeout(
                            () => reject(new Error("Lightweight reconnect timed out")),
                            lightweightReconnectTimeoutMs
                        );
                    });
                    await Promise.race([callbackPromise, timeoutPromise]);
                    this.logger.info(
                        `[Server] Lightweight reconnect callback completed for account #${disconnectedAuthIndex}.`
                    );
                } catch (error) {
                    this.logger.error(
                        `[Server] Lightweight reconnect failed for account #${disconnectedAuthIndex}: ${error.message}`
                    );
                } finally {
                    if (timeoutId) {
                        clearTimeout(timeoutId);
                    }
                    this.reconnectingAccounts.delete(disconnectedAuthIndex);
                }
            }

            this.reconnectGraceTimers.delete(disconnectedAuthIndex);
        }, 10000);

        if (disconnectedAuthIndex !== undefined && disconnectedAuthIndex >= 0) {
            this.reconnectGraceTimers.set(disconnectedAuthIndex, graceTimerId);
        }

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
            const queue = this.messageQueues.get(requestId);
            if (queue) {
                this._routeMessage(parsedMessage, queue);
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

    getConnectionByAuth(authIndex) {
        const connection = this.connectionsByAuth.get(authIndex);
        if (connection) {
            this.logger.debug(`[Registry] Found WebSocket connection for authIndex=${authIndex}`);
        } else if (this.logger.getLevel?.() === "DEBUG") {
            this.logger.debug(
                `[Registry] No WebSocket connection found for authIndex=${authIndex}. Available: [${Array.from(this.connectionsByAuth.keys()).join(", ")}]`
            );
        }
        return connection;
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
                this.logger.info(`[Registry] Cleared reconnecting status for authIndex=${authIndex}`);
            }
        } else {
            this.logger.debug(`[Registry] No WebSocket connection to close for authIndex=${authIndex}`);
        }
    }

    createMessageQueue(requestId) {
        const queue = new MessageQueue();
        this.messageQueues.set(requestId, queue);
        return queue;
    }

    removeMessageQueue(requestId) {
        const queue = this.messageQueues.get(requestId);
        if (queue) {
            queue.close();
            this.messageQueues.delete(requestId);
        }
    }

    /**
     * Force close all message queues
     * Used when the active account is deleted/reset and we want to terminate all pending requests immediately
     */
    closeAllMessageQueues() {
        if (this.messageQueues.size > 0) {
            this.logger.info(`[Registry] Force closing ${this.messageQueues.size} pending message queues...`);
            this.messageQueues.forEach((queue, requestId) => {
                try {
                    queue.close();
                } catch (e) {
                    this.logger.warn(`[Registry] Failed to close message queue for request ${requestId}: ${e.message}`);
                }
            });
            this.messageQueues.clear();
        }
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

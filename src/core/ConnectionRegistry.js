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
     */
    constructor(logger, onConnectionLostCallback = null) {
        super();
        this.logger = logger;
        this.onConnectionLostCallback = onConnectionLostCallback;
        this.connections = new Set();
        this.messageQueues = new Map();
        this.reconnectGraceTimer = null;
        this.isReconnecting = false; // Flag to prevent multiple simultaneous reconnect attempts
    }

    addConnection(websocket, clientInfo) {
        if (this.reconnectGraceTimer) {
            clearTimeout(this.reconnectGraceTimer);
            this.reconnectGraceTimer = null;
            this.messageQueues.forEach(queue => queue.close());
            this.messageQueues.clear();
        }

        this.connections.add(websocket);
        this.logger.info(`[Server] Internal WebSocket client connected (from: ${clientInfo.address})`);
        websocket.on("message", data => this._handleIncomingMessage(data.toString()));
        websocket.on("close", () => this._removeConnection(websocket));
        websocket.on("error", error =>
            this.logger.error(`[Server] Internal WebSocket connection error: ${error.message}`)
        );
        this.emit("connectionAdded", websocket);
    }

    _removeConnection(websocket) {
        this.connections.delete(websocket);
        this.logger.warn("[Server] Internal WebSocket client disconnected.");

        // Clear any existing grace timer before starting a new one
        // This prevents multiple timers from running if connections disconnect in quick succession
        if (this.reconnectGraceTimer) {
            clearTimeout(this.reconnectGraceTimer);
        }

        this.logger.info("[Server] Starting 60-second reconnect grace period...");
        this.reconnectGraceTimer = setTimeout(async () => {
            this.logger.error(
                "[Server] Grace period ended, no reconnection detected. Connection lost confirmed, cleaning up all pending requests..."
            );
            this.messageQueues.forEach(queue => queue.close());
            this.messageQueues.clear();

            // Attempt lightweight reconnect if callback is provided and not already reconnecting
            if (this.onConnectionLostCallback && !this.isReconnecting) {
                this.isReconnecting = true;
                this.logger.info("[Server] Attempting lightweight reconnect...");
                try {
                    await this.onConnectionLostCallback();
                    this.logger.info("[Server] Lightweight reconnect callback completed.");
                } catch (error) {
                    this.logger.error(`[Server] Lightweight reconnect failed: ${error.message}`);
                } finally {
                    this.isReconnecting = false;
                }
            }

            this.emit("connectionLost");

            this.reconnectGraceTimer = null;
        }, 60000);

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
            this.logger.error("[Server] Failed to parse internal WebSocket message");
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

    hasActiveConnections() {
        return this.connections.size > 0;
    }

    isInGracePeriod() {
        return !!this.reconnectGraceTimer;
    }

    getFirstConnection() {
        return this.connections.values().next().value;
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
}

module.exports = ConnectionRegistry;

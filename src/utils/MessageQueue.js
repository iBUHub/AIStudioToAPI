/**
 * File: src/utils/MessageQueue.js
 * Description: Asynchronous message queue for managing request/response communication between server and browser client
 *
 * Author: Ellinav, iBenzene, bbbugg
 */

const { EventEmitter } = require("events");

/**
 * Custom error class for queue closed errors
 */
class QueueClosedError extends Error {
    constructor(message = "Queue is closed", reason = "unknown") {
        super(message);
        this.name = "QueueClosedError";
        this.code = "QUEUE_CLOSED";
        this.reason = reason;
    }
}

/**
 * Custom error class for queue timeout errors
 */
class QueueTimeoutError extends Error {
    constructor(message = "Queue timeout") {
        super(message);
        this.name = "QueueTimeoutError";
        this.code = "QUEUE_TIMEOUT";
    }
}

/**
 * Message Queue Module
 * Responsible for managing asynchronous message enqueue and dequeue
 */
class MessageQueue extends EventEmitter {
    constructor(timeoutMs = 300000) {
        super();
        this.messages = [];
        this.waitingResolvers = [];
        this.defaultTimeout = timeoutMs;
        this.closed = false;
        this.closeReason = null;
    }

    enqueue(message) {
        if (this.closed) return;
        if (this.waitingResolvers.length > 0) {
            const resolver = this.waitingResolvers.shift();
            // Check if resolver is still valid (not timed out)
            if (resolver && resolver.timeoutId) {
                clearTimeout(resolver.timeoutId);
                resolver.resolve(message);
            } else {
                // Resolver already timed out, push message to queue instead
                this.messages.push(message);
            }
        } else {
            this.messages.push(message);
        }
    }

    async dequeue(timeoutMs = this.defaultTimeout) {
        if (this.closed) {
            const reason = this.closeReason || "unknown";
            throw new QueueClosedError(`Queue is closed (reason: ${reason})`, reason);
        }
        return new Promise((resolve, reject) => {
            if (this.messages.length > 0) {
                resolve(this.messages.shift());
                return;
            }
            const resolver = { reject, resolve, timeoutId: null };
            this.waitingResolvers.push(resolver);
            resolver.timeoutId = setTimeout(() => {
                const index = this.waitingResolvers.indexOf(resolver);
                if (index !== -1) {
                    this.waitingResolvers.splice(index, 1);
                }
                // Clear timeoutId to mark resolver as invalid
                resolver.timeoutId = null;
                reject(new QueueTimeoutError());
            }, timeoutMs);
        });
    }

    close(reason = "unknown") {
        this.closed = true;
        this.closeReason = reason;
        this.waitingResolvers.forEach(resolver => {
            clearTimeout(resolver.timeoutId);
            resolver.reject(new QueueClosedError(`Queue is closed (reason: ${reason})`, reason));
        });
        this.waitingResolvers = [];
        this.messages = [];
    }
}

module.exports = MessageQueue;
module.exports.QueueClosedError = QueueClosedError;
module.exports.QueueTimeoutError = QueueTimeoutError;

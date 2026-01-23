/**
 * File: src/utils/MessageQueue.js
 * Description: Asynchronous message queue for managing request/response communication between server and browser client
 *
 * Author: Ellinav, iBenzene, bbbugg
 */

const { EventEmitter } = require("events");

/**
 * Message Queue Module
 * Responsible for managing asynchronous message enqueue and dequeue
 */
class MessageQueue extends EventEmitter {
    constructor(timeoutMs = 600000) {
        super();
        this.messages = [];
        this.waitingResolvers = [];
        this.defaultTimeout = timeoutMs;
        this.closed = false;
    }

    enqueue(message) {
        if (this.closed) return;
        if (this.waitingResolvers.length > 0) {
            const resolver = this.waitingResolvers.shift();
            clearTimeout(resolver.timeoutId);
            resolver.resolve(message);
        } else {
            this.messages.push(message);
        }
    }

    async dequeue(timeoutMs = this.defaultTimeout) {
        if (this.closed) {
            throw new Error("Queue is closed");
        }
        return new Promise((resolve, reject) => {
            if (this.messages.length > 0) {
                resolve(this.messages.shift());
                return;
            }
            const resolver = { reject, resolve };
            this.waitingResolvers.push(resolver);
            resolver.timeoutId = setTimeout(() => {
                const index = this.waitingResolvers.indexOf(resolver);
                if (index !== -1) {
                    this.waitingResolvers.splice(index, 1);
                    reject(new Error("Queue timeout"));
                }
            }, timeoutMs);
        });
    }

    close() {
        this.closed = true;
        this.waitingResolvers.forEach(resolver => {
            clearTimeout(resolver.timeoutId);
            resolver.reject(new Error("Queue closed"));
        });
        this.waitingResolvers = [];
        this.messages = [];
    }
}

module.exports = MessageQueue;

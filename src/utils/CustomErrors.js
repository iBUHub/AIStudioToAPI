/**
 * File: src/utils/CustomErrors.js
 * Description: Custom error classes for type-safe error handling without string matching
 *
 * Author: iBenzene, bbbugg
 */

/**
 * Custom error class for authentication expiration
 * Used to distinguish auth expiration from other errors without string matching
 */
class AuthExpiredError extends Error {
    constructor(
        message = "🚨 Cookie expired/invalid! Browser was redirected to Google login page. Please re-extract storageState."
    ) {
        super(message);
        this.name = "AuthExpiredError";
        this.isAuthExpired = true;
    }
}

/**
 * Custom error class for reconnect cancellation
 * Thrown when a lightweight reconnect is cancelled because the connection was re-established
 */
class ReconnectCancelledError extends Error {
    constructor(message = "Reconnect cancelled") {
        super(message);
        this.name = "ReconnectCancelledError";
        this.isReconnectCancelled = true;
    }
}

/**
 * Custom error class for user-aborted requests
 * Thrown when a user explicitly cancels/aborts an API request
 */
class UserAbortedError extends Error {
    constructor(message = "The user aborted a request") {
        super(message);
        this.name = "UserAbortedError";
        this.isUserAborted = true;
    }
}

/**
 * Custom error class for context initialization abort
 * Thrown when a context initialization is aborted (e.g., marked for deletion or background preload cancelled)
 */
class ContextAbortedError extends Error {
    constructor(authIndex, reason = "marked for deletion") {
        super(`Context initialization aborted for index ${authIndex} (${reason})`);
        this.name = "ContextAbortedError";
        this.isContextAborted = true;
        this.authIndex = authIndex;
        this.reason = reason;
    }
}

/**
 * Helper function to check if an error is an auth expiration error
 * @param {Error} error - The error to check
 * @returns {boolean} True if the error indicates auth expiration
 */
function isAuthExpiredError(error) {
    return error instanceof AuthExpiredError || error?.isAuthExpired === true;
}

/**
 * Helper function to check if an error is a reconnect cancellation
 * @param {Error} error - The error to check
 * @returns {boolean} True if the error indicates reconnect cancellation
 */
function isReconnectCancelledError(error) {
    return error instanceof ReconnectCancelledError || error?.isReconnectCancelled === true;
}

/**
 * Helper function to check if an error is a user abort
 * @param {Error|Object} error - The error to check (can be Error object, DOMException, or message object with .message field)
 * @returns {boolean} True if the error indicates user abort
 */
function isUserAbortedError(error) {
    if (error instanceof UserAbortedError || error?.isUserAborted === true) {
        return true;
    }
    // Check for DOMException with name "AbortError" (thrown by browser-side script)
    if (error?.name === "AbortError") {
        return true;
    }
    // Also check message string for compatibility with message objects from WebSocket
    if (typeof error?.message === "string" && error.message.includes("The user aborted a request")) {
        return true;
    }
    return false;
}

/**
 * Helper function to check if an error is a context initialization abort
 * @param {Error} error - The error to check
 * @returns {boolean} True if the error indicates context abort
 */
function isContextAbortedError(error) {
    if (error instanceof ContextAbortedError || error?.isContextAborted === true) {
        return true;
    }
    // Also check message string for backward compatibility
    if (typeof error?.message === "string" && error.message.includes("aborted for index")) {
        return true;
    }
    return false;
}

module.exports = {
    AuthExpiredError,
    ContextAbortedError,
    isAuthExpiredError,
    isContextAbortedError,
    isReconnectCancelledError,
    isUserAbortedError,
    ReconnectCancelledError,
    UserAbortedError,
};

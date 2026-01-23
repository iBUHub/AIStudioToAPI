/**
 * File: src/utils/LoggingService.js
 * Description: Logging service that formats, buffers, and outputs system logs with different severity levels
 *
 * Author: Ellinav, iBenzene, bbbugg
 */

/**
 * Logging Service Module
 * Responsible for formatting and recording system logs
 */
class LoggingService {
    // Log levels: DEBUG < INFO < WARN < ERROR
    static LEVELS = { DEBUG: 0, ERROR: 3, INFO: 1, WARN: 2 };
    static currentLevel =
        process.env.LOG_LEVEL?.toUpperCase() === "DEBUG" ? LoggingService.LEVELS.DEBUG : LoggingService.LEVELS.INFO;

    /**
     * Set the global log level
     * @param {string} level - 'DEBUG', 'INFO', 'WARN', or 'ERROR'
     */
    static setLevel(level) {
        const upperLevel = level.toUpperCase();
        if (LoggingService.LEVELS[upperLevel] !== undefined) {
            LoggingService.currentLevel = LoggingService.LEVELS[upperLevel];
        }
    }

    /**
     * Get the current log level name
     * @returns {string} Current level name
     */
    static getLevel() {
        return Object.keys(LoggingService.LEVELS).find(
            key => LoggingService.LEVELS[key] === LoggingService.currentLevel
        );
    }

    /**
     * Check if debug mode is enabled
     * @returns {boolean}
     */
    static isDebugEnabled() {
        return LoggingService.currentLevel <= LoggingService.LEVELS.DEBUG;
    }

    constructor(serviceName = "ProxyServer") {
        this.serviceName = serviceName;
        this.logBuffer = [];
        this.maxBufferSize = 100;
    }

    /**
     * Format timestamp with timezone support
     * Supports Docker TZ environment variable (e.g., TZ=Asia/Shanghai)
     * @returns {string} Formatted timestamp string
     */
    _getTimestamp() {
        const now = new Date();
        const timezone = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;

        try {
            // Format: YYYY-MM-DD HH:mm:ss.SSS [Timezone]
            return (
                now
                    .toLocaleString("zh-CN", {
                        day: "2-digit",
                        hour: "2-digit",
                        hour12: false,
                        minute: "2-digit",
                        month: "2-digit",
                        second: "2-digit",
                        timeZone: timezone,
                        year: "numeric",
                    })
                    .replace(/\//g, "-") + `.${now.getMilliseconds().toString().padStart(3, "0")} [${timezone}]`
            );
        } catch (err) {
            // Fallback to ISO format if timezone is invalid
            return now.toISOString();
        }
    }

    _formatMessage(level, message) {
        const timestamp = this._getTimestamp();
        const formatted = `[${level}] ${timestamp} [${this.serviceName}] - ${message}`;

        this.logBuffer.push(formatted);
        if (this.logBuffer.length > this.maxBufferSize) {
            this.logBuffer.shift();
        }

        return formatted;
    }

    info(message) {
        console.log(this._formatMessage("INFO", message));
    }

    error(message) {
        console.error(this._formatMessage("ERROR", message));
    }

    warn(message) {
        console.warn(this._formatMessage("WARN", message));
    }

    debug(message) {
        if (LoggingService.currentLevel <= LoggingService.LEVELS.DEBUG) {
            console.debug(this._formatMessage("DEBUG", message));
        }
    }
}

module.exports = LoggingService;

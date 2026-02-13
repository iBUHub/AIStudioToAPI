/**
 * File: src/utils/ConfigLoader.js
 * Description: Configuration loader that reads and validates system settings from environment variables
 *
 * Author: Ellinav, iBenzene, bbbugg
 */

const fs = require("fs");
const path = require("path");

/**
 * Configuration Loader Module
 * Responsible for loading system configuration from environment variables
 */
class ConfigLoader {
    constructor(logger) {
        this.logger = logger;
    }

    loadConfiguration() {
        const config = {
            apiKeys: [],
            apiKeySource: "Not set",
            browserExecutablePath: null,
            enableAuthUpdate: true,
            failureThreshold: 3,
            forceThinking: false,
            forceUrlContext: false,
            forceWebSearch: false,
            host: "0.0.0.0",
            httpPort: 7860,
            immediateSwitchStatusCodes: [429, 503],
            maxContexts: 1,
            maxRetries: 3,
            retryDelay: 2000,
            streamingMode: "real",
            switchOnUses: 40,
            wsPort: 9998,
        };

        // Environment variable overrides
        if (process.env.PORT) {
            const parsed = parseInt(process.env.PORT, 10);
            config.httpPort = Number.isFinite(parsed) ? parsed : config.httpPort;
        }
        if (process.env.HOST) config.host = process.env.HOST;
        if (process.env.STREAMING_MODE) config.streamingMode = process.env.STREAMING_MODE;
        if (process.env.FAILURE_THRESHOLD) {
            const parsed = parseInt(process.env.FAILURE_THRESHOLD, 10);
            config.failureThreshold = Number.isFinite(parsed) ? Math.max(0, parsed) : config.failureThreshold;
        }
        if (process.env.SWITCH_ON_USES) {
            const parsed = parseInt(process.env.SWITCH_ON_USES, 10);
            config.switchOnUses = Number.isFinite(parsed) ? Math.max(0, parsed) : config.switchOnUses;
        }
        if (process.env.MAX_RETRIES) {
            const parsed = parseInt(process.env.MAX_RETRIES, 10);
            config.maxRetries = Number.isFinite(parsed) ? Math.max(1, parsed) : config.maxRetries;
        }
        if (process.env.RETRY_DELAY) {
            const parsed = parseInt(process.env.RETRY_DELAY, 10);
            config.retryDelay = Number.isFinite(parsed) ? Math.max(50, parsed) : config.retryDelay;
        }
        if (process.env.WS_PORT) {
            // WS_PORT environment variable is no longer supported
            this.logger.error(
                `[Config] ❌ WS_PORT environment variable is deprecated and no longer supported. ` +
                    `The WebSocket port is now fixed at 9998. Please remove WS_PORT from your .env file.`
            );
            // Do not modify config.wsPort - keep it at default 9998
        }
        if (process.env.MAX_CONTEXTS) {
            const parsed = parseInt(process.env.MAX_CONTEXTS, 10);
            config.maxContexts = Number.isFinite(parsed) ? Math.max(0, parsed) : config.maxContexts;
        }
        if (process.env.CAMOUFOX_EXECUTABLE_PATH) config.browserExecutablePath = process.env.CAMOUFOX_EXECUTABLE_PATH;
        if (process.env.API_KEYS) {
            config.apiKeys = process.env.API_KEYS.split(",");
        }
        if (process.env.FORCE_THINKING) config.forceThinking = process.env.FORCE_THINKING.toLowerCase() === "true";
        if (process.env.FORCE_WEB_SEARCH) config.forceWebSearch = process.env.FORCE_WEB_SEARCH.toLowerCase() === "true";
        if (process.env.FORCE_URL_CONTEXT)
            config.forceUrlContext = process.env.FORCE_URL_CONTEXT.toLowerCase() === "true";
        if (process.env.ENABLE_AUTH_UPDATE)
            config.enableAuthUpdate = process.env.ENABLE_AUTH_UPDATE.toLowerCase() !== "false";

        let rawCodes = process.env.IMMEDIATE_SWITCH_STATUS_CODES;
        let codesSource = "environment variable";

        if (
            rawCodes === undefined &&
            config.immediateSwitchStatusCodes &&
            Array.isArray(config.immediateSwitchStatusCodes)
        ) {
            rawCodes = config.immediateSwitchStatusCodes.join(",");
            codesSource = "default value";
        }

        if (rawCodes && typeof rawCodes === "string") {
            config.immediateSwitchStatusCodes = rawCodes
                .split(",")
                .map(code => parseInt(String(code).trim(), 10))
                .filter(code => !isNaN(code) && code >= 400 && code <= 599);
        } else {
            config.immediateSwitchStatusCodes = [];
        }
        if (config.immediateSwitchStatusCodes.length > 0) {
            this.logger.info(`[System] Loaded "immediate switch status codes" from ${codesSource}.`);
        }
        if (Array.isArray(config.apiKeys)) {
            config.apiKeys = config.apiKeys.map(k => String(k).trim()).filter(k => k);
        } else {
            config.apiKeys = [];
        }

        if (config.apiKeys.length > 0) {
            config.apiKeySource = "Custom";
        } else {
            config.apiKeys = ["123456"];
            config.apiKeySource = "Default";
            this.logger.info("[System] No API key set, using default password: 123456");
        }

        // Load model list
        const modelsPath = path.join(process.cwd(), "configs", "models.json");
        try {
            if (fs.existsSync(modelsPath)) {
                const modelsFileContent = fs.readFileSync(modelsPath, "utf-8");
                const modelsData = JSON.parse(modelsFileContent);
                if (modelsData && modelsData.models) {
                    config.modelList = modelsData.models;
                    this.logger.info(
                        `[System] Successfully loaded ${config.modelList.length} models from models.json.`
                    );
                } else {
                    this.logger.warn(`[System] models.json is not in the expected format, using default model list.`);
                    config.modelList = [{ name: "models/gemini-2.5-flash-lite" }];
                }
            } else {
                this.logger.warn(`[System] models.json file not found, using default model list.`);
                config.modelList = [{ name: "models/gemini-2.5-flash-lite" }];
            }
        } catch (error) {
            this.logger.error(
                `[System] Failed to read or parse models.json: ${error.message}, using default model list.`
            );
            config.modelList = [{ name: "models/gemini-2.5-flash-lite" }];
        }

        this._printConfiguration(config);
        return config;
    }

    _printConfiguration(config) {
        this.logger.info("================ [ Active Configuration ] ================");
        this.logger.info(`  HTTP Server Port: ${config.httpPort}`);
        this.logger.info(`  Listening Address: ${config.host}`);
        this.logger.info(`  Streaming Mode: ${config.streamingMode}`);
        this.logger.info(`  Force Thinking: ${config.forceThinking}`);
        this.logger.info(`  Force Web Search: ${config.forceWebSearch}`);
        this.logger.info(`  Force URL Context: ${config.forceUrlContext}`);
        this.logger.info(`  Auto Update Auth: ${config.enableAuthUpdate}`);
        this.logger.info(`  Max Contexts: ${config.maxContexts === 0 ? "Unlimited" : config.maxContexts}`);
        this.logger.info(
            `  Usage-based Switch Threshold: ${
                config.switchOnUses > 0 ? `Switch after every ${config.switchOnUses} requests` : "Disabled"
            }`
        );
        this.logger.info(
            `  Failure-based Switch: ${
                config.failureThreshold > 0 ? `Switch after ${config.failureThreshold} failures` : "Disabled"
            }`
        );
        this.logger.info(
            `  Immediate Switch Status Codes: ${
                config.immediateSwitchStatusCodes.length > 0 ? config.immediateSwitchStatusCodes.join(", ") : "Disabled"
            }`
        );
        this.logger.info(`  Max Retries per Request: ${config.maxRetries} times`);
        this.logger.info(`  Retry Delay: ${config.retryDelay}ms`);
        this.logger.info(`  API Key Source: ${config.apiKeySource}`);
        this.logger.info("=============================================================");
    }
}

module.exports = ConfigLoader;

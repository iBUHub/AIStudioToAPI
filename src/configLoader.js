/**
 * File: src/configLoader.js
 * Description: Configuration loader that reads and validates system settings from config.json and environment variables
 *
 * Maintainers: iBenzene, bbbugg
 * Original Author: Ellinav
 */

const fs = require("fs");
const path = require("path");

/**
 * Configuration Loader Module
 * Responsible for loading system configuration from config.json and environment variables
 */
class ConfigLoader {
    constructor(logger) {
        this.logger = logger;
    }

    loadConfiguration() {
        let config = {
            httpPort: 7860,
            host: "0.0.0.0",
            wsPort: 9998,
            streamingMode: "real",
            failureThreshold: 3,
            switchOnUses: 40,
            maxRetries: 3,
            retryDelay: 2000,
            browserExecutablePath: null,
            apiKeys: [],
            immediateSwitchStatusCodes: [429, 503],
            apiKeySource: "Not set",
            forceThinking: false,
            forceWebSearch: false,
            forceUrlContext: false,
        };

        const configPath = path.join(process.cwd(), "config.json");
        try {
            if (fs.existsSync(configPath)) {
                const fileConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
                config = { ...config, ...fileConfig };
                this.logger.info("[System] Configuration loaded from config.json.");
            }
        } catch (error) {
            this.logger.warn(`[System] Unable to read or parse config.json: ${error.message}`);
        }

        // Environment variable overrides
        if (process.env.PORT)
            config.httpPort = parseInt(process.env.PORT, 10) || config.httpPort;
        if (process.env.HOST) config.host = process.env.HOST;
        if (process.env.STREAMING_MODE)
            config.streamingMode = process.env.STREAMING_MODE;
        if (process.env.FAILURE_THRESHOLD)
            config.failureThreshold
                = parseInt(process.env.FAILURE_THRESHOLD, 10) || config.failureThreshold;
        if (process.env.SWITCH_ON_USES)
            config.switchOnUses
                = parseInt(process.env.SWITCH_ON_USES, 10) || config.switchOnUses;
        if (process.env.MAX_RETRIES)
            config.maxRetries
                = parseInt(process.env.MAX_RETRIES, 10) || config.maxRetries;
        if (process.env.RETRY_DELAY)
            config.retryDelay
                = parseInt(process.env.RETRY_DELAY, 10) || config.retryDelay;
        if (process.env.CAMOUFOX_EXECUTABLE_PATH)
            config.browserExecutablePath = process.env.CAMOUFOX_EXECUTABLE_PATH;
        if (process.env.API_KEYS) {
            config.apiKeys = process.env.API_KEYS.split(",");
        }
        if (process.env.FORCE_THINKING)
            config.forceThinking = process.env.FORCE_THINKING === "true";
        if (process.env.FORCE_WEB_SEARCH)
            config.forceWebSearch = process.env.FORCE_WEB_SEARCH === "true";
        if (process.env.FORCE_URL_CONTEXT)
            config.forceUrlContext = process.env.FORCE_URL_CONTEXT === "true";

        let rawCodes = process.env.IMMEDIATE_SWITCH_STATUS_CODES;
        let codesSource = "environment variable";

        if (
            !rawCodes
            && config.immediateSwitchStatusCodes
            && Array.isArray(config.immediateSwitchStatusCodes)
        ) {
            rawCodes = config.immediateSwitchStatusCodes.join(",");
            codesSource = "config.json file or default value";
        }

        if (rawCodes && typeof rawCodes === "string") {
            config.immediateSwitchStatusCodes = rawCodes
                .split(",")
                .map(code => parseInt(String(code).trim(), 10))
                .filter(code => !isNaN(code) && code >= 400 && code <= 599);
            if (config.immediateSwitchStatusCodes.length > 0) {
                this.logger.info(`[System] Loaded "immediate switch status codes" from ${codesSource}.`);
            }
        } else {
            config.immediateSwitchStatusCodes = [];
        }

        if (Array.isArray(config.apiKeys)) {
            config.apiKeys = config.apiKeys
                .map(k => String(k).trim())
                .filter(k => k);
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
                config.modelList = JSON.parse(modelsFileContent);
                this.logger.info(
                    `[System] Successfully loaded ${config.modelList.length} models from models.json.`
                );
            } else {
                this.logger.warn(
                    `[System] models.json file not found, using default model list.`
                );
                config.modelList = ["gemini-2.5-flash-lite"];
            }
        } catch (error) {
            this.logger.error(
                `[System] Failed to read or parse models.json: ${error.message}, using default model list.`
            );
            config.modelList = ["gemini-2.5-flash-lite"];
        }

        this._printConfiguration(config);
        return config;
    }

    _printConfiguration(config) {
        this.logger.info("================ [ Active Configuration ] ================");
        this.logger.info(`  HTTP Server Port: ${config.httpPort}`);
        this.logger.info(`  Listening Address: ${config.host}`);
        this.logger.info(`  Streaming Mode: ${config.streamingMode}`);
        this.logger.info(
            `  Usage-based Switch Threshold: ${config.switchOnUses > 0
                ? `Switch after every ${config.switchOnUses} requests`
                : "Disabled"
            }`
        );
        this.logger.info(
            `  Failure-based Switch: ${config.failureThreshold > 0
                ? `Switch after ${config.failureThreshold} failures`
                : "Disabled"
            }`
        );
        this.logger.info(
            `  Immediate Switch Status Codes: ${config.immediateSwitchStatusCodes.length > 0
                ? config.immediateSwitchStatusCodes.join(", ")
                : "Disabled"
            }`
        );
        this.logger.info(`  Max Retries per Request: ${config.maxRetries} times`);
        this.logger.info(`  Retry Delay: ${config.retryDelay}ms`);
        this.logger.info(`  API Key Source: ${config.apiKeySource}`);
        this.logger.info(
            "============================================================="
        );
    }
}

module.exports = ConfigLoader;

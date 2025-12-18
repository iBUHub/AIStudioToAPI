/**
 * File: src/routes/statusRoutes.js
 * Description: Status and system management routes
 *
 * Maintainers: iBenzene, bbbugg
 * Original Author: Ellinav
 */

const fs = require("fs");
const path = require("path");

/**
 * Status Routes Manager
 * Manages system status, account management, and settings routes
 */
class StatusRoutes {
    constructor(serverSystem) {
        this.serverSystem = serverSystem;
        this.logger = serverSystem.logger;
        this.config = serverSystem.config;
        this.distIndexPath = serverSystem.distIndexPath;
    }

    /**
     * Setup status and management routes
     */
    setupRoutes(app, isAuthenticated) {
        // Favicon endpoint (public, no authentication required)
        app.get("/favicon.ico", (req, res) => {
            const iconUrl = process.env.ICON_URL || "/AIStudio_logo.svg";

            // Redirect to the configured icon URL (default: local SVG icon)
            // This supports any icon format (ICO, PNG, SVG, etc.) and any size
            res.redirect(302, iconUrl);
        });

        // Health check endpoint (public, no authentication required)
        app.get("/health", (req, res) => {
            const now = new Date();
            const timezone = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
            let timestamp;

            try {
                timestamp =
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
                        .replace(/\//g, "-") + `.${now.getMilliseconds().toString().padStart(3, "0")} [${timezone}]`;
            } catch (err) {
                timestamp = now.toISOString();
            }

            const healthStatus = {
                browserConnected: !!this.serverSystem.browserManager.browser,
                status: "ok",
                timestamp,
                uptime: process.uptime(),
            };
            res.status(200).json(healthStatus);
        });

        app.get("/", isAuthenticated, (req, res) => {
            res.status(200).sendFile(this.distIndexPath);
        });

        app.get("/auth", isAuthenticated, (req, res) => {
            res.sendFile(this.distIndexPath);
        });

        app.get("/api/status", isAuthenticated, async (req, res) => {
            // Force a reload of auth sources on each status check for real-time accuracy
            this.serverSystem.authSource.reloadAuthSources();

            const { authSource, browserManager, requestHandler } = this.serverSystem;

            // If the system is busy switching accounts, skip the validity check to prevent race conditions
            if (requestHandler.isSystemBusy) {
                return res.json(this._getStatusData());
            }

            // After reloading, only check for auth validity if a browser is active.
            if (browserManager.browser) {
                const currentAuthIndex = requestHandler.currentAuthIndex;

                if (currentAuthIndex !== null && !authSource.availableIndices.includes(currentAuthIndex)) {
                    this.logger.warn(
                        `[System] Current auth index #${currentAuthIndex} is no longer valid after reload (e.g., file deleted).`
                    );
                    this.logger.warn("[System] Closing browser connection due to invalid auth.");
                    try {
                        // Await closing to prevent repeated checks on subsequent status polls
                        await browserManager.closeBrowser();
                        // Reset currentAuthIndex to 0 to reflect that no valid account is currently active
                        browserManager.currentAuthIndex = 0;
                    } catch (err) {
                        this.logger.error(`[System] Error while closing browser automatically: ${err.message}`);
                    }
                }
            }

            res.json(this._getStatusData());
        });

        app.put("/api/accounts/current", isAuthenticated, async (req, res) => {
            try {
                const { targetIndex } = req.body;
                if (targetIndex !== undefined && targetIndex !== null) {
                    this.logger.info(`[WebUI] Received request to switch to specific account #${targetIndex}...`);
                    const result = await this.serverSystem.requestHandler._switchToSpecificAuth(targetIndex);
                    if (result.success) {
                        res.status(200).json({ message: "accountSwitchSuccess", newIndex: result.newIndex });
                    } else {
                        res.status(400).json({ message: "accountSwitchFailed", reason: result.reason });
                    }
                } else {
                    this.logger.info("[WebUI] Received manual request to switch to next account...");
                    if (this.serverSystem.authSource.availableIndices.length <= 1) {
                        return res.status(400).json({ message: "accountSwitchCancelledSingle" });
                    }
                    const result = await this.serverSystem.requestHandler._switchToNextAuth();
                    if (result.success) {
                        res.status(200).json({ message: "accountSwitchSuccessNext", newIndex: result.newIndex });
                    } else if (result.fallback) {
                        res.status(200).json({ message: "accountSwitchFallback", newIndex: result.newIndex });
                    } else {
                        res.status(409).json({ message: "accountSwitchSkipped", reason: result.reason });
                    }
                }
            } catch (error) {
                res.status(500).json({ error: error.message, message: "accountSwitchFatal" });
            }
        });

        app.delete("/api/accounts/:index", isAuthenticated, (req, res) => {
            const rawIndex = req.params.index;
            const targetIndex = Number(rawIndex);
            const currentAuthIndex = this.serverSystem.requestHandler.currentAuthIndex;

            if (!Number.isInteger(targetIndex)) {
                return res.status(400).json({ message: "errorInvalidIndex" });
            }

            if (targetIndex === currentAuthIndex) {
                return res.status(400).json({ message: "errorDeleteCurrentAccount" });
            }

            const { authSource } = this.serverSystem;

            if (!authSource.availableIndices.includes(targetIndex)) {
                return res.status(404).json({ index: targetIndex, message: "errorAccountNotFound" });
            }

            try {
                authSource.removeAuth(targetIndex);
                this.logger.warn(
                    `[WebUI] Account #${targetIndex} deleted via web interface. Current account: #${currentAuthIndex}`
                );
                res.status(200).json({ index: targetIndex, message: "accountDeleteSuccess" });
            } catch (error) {
                this.logger.error(`[WebUI] Failed to delete account #${targetIndex}: ${error.message}`);
                return res.status(500).json({ error: error.message, message: "accountDeleteFailed" });
            }
        });

        app.put("/api/settings/streaming-mode", isAuthenticated, (req, res) => {
            const newMode = req.body.mode;
            if (newMode === "fake" || newMode === "real") {
                this.serverSystem.streamingMode = newMode;
                this.logger.info(
                    `[WebUI] Streaming mode switched by authenticated user to: ${this.serverSystem.streamingMode}`
                );
                res.status(200).json({ message: "settingUpdateSuccess", setting: "streamingMode", value: newMode });
            } else {
                res.status(400).json({ message: "errorInvalidMode" });
            }
        });

        app.put("/api/settings/force-thinking", isAuthenticated, (req, res) => {
            this.serverSystem.forceThinking = !this.serverSystem.forceThinking;
            const statusText = this.serverSystem.forceThinking;
            this.logger.info(`[WebUI] Force thinking toggle switched to: ${statusText}`);
            res.status(200).json({ message: "settingUpdateSuccess", setting: "forceThinking", value: statusText });
        });

        app.put("/api/settings/force-web-search", isAuthenticated, (req, res) => {
            this.serverSystem.forceWebSearch = !this.serverSystem.forceWebSearch;
            const statusText = this.serverSystem.forceWebSearch;
            this.logger.info(`[WebUI] Force web search toggle switched to: ${statusText}`);
            res.status(200).json({ message: "settingUpdateSuccess", setting: "forceWebSearch", value: statusText });
        });

        app.put("/api/settings/force-url-context", isAuthenticated, (req, res) => {
            this.serverSystem.forceUrlContext = !this.serverSystem.forceUrlContext;
            const statusText = this.serverSystem.forceUrlContext;
            this.logger.info(`[WebUI] Force URL context toggle switched to: ${statusText}`);
            res.status(200).json({ message: "settingUpdateSuccess", setting: "forceUrlContext", value: statusText });
        });
    }

    /**
     * Escape HTML to prevent XSS attacks
     */
    _escapeHtml(text) {
        const htmlEscapeMap = {
            '"': "&quot;",
            "&": "&amp;",
            "'": "&#x27;",
            "/": "&#x2F;",
            "<": "&lt;",
            ">": "&gt;",
        };
        return text.replace(/[&<>"'/]/g, char => htmlEscapeMap[char]);
    }

    _getStatusData() {
        const { config, requestHandler, authSource, browserManager } = this.serverSystem;
        const initialIndices = authSource.initialIndices || [];
        const invalidIndices = initialIndices.filter(i => !authSource.availableIndices.includes(i));
        const logs = this.logger.logBuffer || [];
        const accountNameMap = authSource.accountNameMap;
        const accountDetails = initialIndices.map(index => {
            const isInvalid = invalidIndices.includes(index);
            const name = isInvalid ? "N/A (JSON format error)" : accountNameMap.get(index) || "N/A (Unnamed)";
            return { index, name };
        });

        const currentAuthIndex = requestHandler.currentAuthIndex;
        const currentAccountName = accountNameMap.get(currentAuthIndex) || "N/A";

        const usageCount =
            config.switchOnUses > 0
                ? `${requestHandler.usageCount} / ${config.switchOnUses}`
                : requestHandler.usageCount;

        const failureCount =
            config.failureThreshold > 0
                ? `${requestHandler.failureCount} / ${config.failureThreshold}`
                : requestHandler.failureCount;

        return {
            logCount: logs.length,
            logs: logs.join("\n"),
            status: {
                accountDetails,
                apiKeySource: config.apiKeySource,
                browserConnected: !!browserManager.browser,
                currentAccountName,
                currentAuthIndex,
                failureCount,
                forceThinking: this.serverSystem.forceThinking,
                forceUrlContext: this.serverSystem.forceUrlContext,
                forceWebSearch: this.serverSystem.forceWebSearch,
                immediateSwitchStatusCodes:
                    config.immediateSwitchStatusCodes.length > 0
                        ? `[${config.immediateSwitchStatusCodes.join(", ")}]`
                        : "Disabled",
                initialIndicesRaw: initialIndices,
                invalidIndicesRaw: invalidIndices,
                isSystemBusy: requestHandler.isSystemBusy,
                streamingMode: this.serverSystem.streamingMode,
                usageCount,
            },
        };
    }

    _generateStatusPage() {
        const { config, requestHandler, authSource, browserManager } = this.serverSystem;
        const initialIndices = authSource.initialIndices || [];
        const availableIndices = authSource.availableIndices || [];
        const invalidIndices = initialIndices.filter(i => !availableIndices.includes(i));
        const logs = this.logger.logBuffer || [];

        const accountNameMap = authSource.accountNameMap;
        const accountDetailsHtml = initialIndices
            .map(index => {
                const isInvalid = invalidIndices.includes(index);
                const name = isInvalid ? "N/A (JSON format error)" : accountNameMap.get(index) || "N/A (Unnamed)";

                // Escape account name to prevent XSS
                const escapedName = this._escapeHtml(String(name));
                return `<span class="label" style="padding-left: 20px;">Account ${index}</span>: ${escapedName}`;
            })
            .join("\n");

        const currentAuthIndex = requestHandler.currentAuthIndex;
        const accountOptionsHtml = availableIndices
            .map(index => {
                const selected = index === currentAuthIndex ? " selected" : "";
                return `<option value="${index}"${selected}>Account #${index}</option>`;
            })
            .join("");

        const currentAccountName = accountNameMap.get(currentAuthIndex) || "N/A";

        const usageCount =
            config.switchOnUses > 0
                ? `${requestHandler.usageCount} / ${config.switchOnUses}`
                : requestHandler.usageCount;

        const failureCount =
            config.failureThreshold > 0
                ? `${requestHandler.failureCount} / ${config.failureThreshold}`
                : requestHandler.failureCount;

        return this._loadTemplate("status.html", {
            accountDetailsHtml,
            accountOptionsHtml,
            apiKeySource: config.apiKeySource,
            browserConnected: !!browserManager.browser,
            currentAccountName: this._escapeHtml(currentAccountName),
            currentAuthIndex,
            failureCount,
            initialForceThinking: String(this.serverSystem.forceThinking),
            initialForceUrlContext: String(this.serverSystem.forceUrlContext),
            initialForceWebSearch: String(this.serverSystem.forceWebSearch),
            initialStreamingMode: config.streamingMode,
            logCount: logs.length,
            logs: this._escapeHtml(logs.join("\n")),
            usageCount,
        });
    }

    /**
     * Load HTML template and replace placeholders
     */
    _loadTemplate(templateName, data = {}) {
        const templatePath = path.join(__dirname, "..", "ui", "templates", templateName);
        let template = fs.readFileSync(templatePath, "utf8");

        // Replace all {{placeholder}} with corresponding data
        for (const [key, value] of Object.entries(data)) {
            const regex = new RegExp(`{{${key}}}`, "g");

            // HTML escape the value to prevent XSS (except for pre-built HTML like accountDetailsHtml)
            const escapedValue = key.endsWith("Html") ? value : this._escapeHtml(String(value));
            template = template.replace(regex, escapedValue);
        }

        return template;
    }
}

module.exports = StatusRoutes;

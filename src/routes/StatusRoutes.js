/**
 * File: src/routes/StatusRoutes.js
 * Description: Status and system management routes
 *
 * Author: Ellinav, iBenzene, bbbugg
 */

const fs = require("fs");
const path = require("path");
const VersionChecker = require("../utils/VersionChecker");
const LoggingService = require("../utils/LoggingService");

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
        this.versionChecker = new VersionChecker(this.logger);
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

        app.post("/", (req, res) => {
            res.status(405).json({ error: "Method Not Allowed" });
        });

        app.get("/auth", isAuthenticated, (req, res) => {
            res.sendFile(this.distIndexPath);
        });

        // Version check endpoint - separate from status to avoid frequent calls
        app.get("/api/version/check", isAuthenticated, async (req, res) => {
            // Check if update checking is disabled via environment variable
            const checkUpdate = process.env.CHECK_UPDATE?.toLowerCase() !== "false";
            if (!checkUpdate) {
                return res.status(200).json({
                    current: this.versionChecker.getCurrentVersion(),
                    disabled: true,
                    hasUpdate: false,
                    latest: null,
                    releaseUrl: null,
                });
            }

            try {
                const result = await this.versionChecker.checkForUpdates();
                res.status(200).json(result);
            } catch (error) {
                this.logger.error(`[VersionCheck] Error: ${error.message}`);
                res.status(500).json({ error: "Failed to check for updates" });
            }
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

                if (currentAuthIndex === -1 || !authSource.availableIndices.includes(currentAuthIndex)) {
                    this.logger.warn(
                        `[System] Current auth index #${currentAuthIndex} is no longer valid after reload (e.g., file deleted).`
                    );
                    this.logger.warn("[System] Closing browser connection due to invalid auth.");
                    try {
                        // Await closing to prevent repeated checks on subsequent status polls
                        await browserManager.closeBrowser();
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
                    if (this.serverSystem.authSource.getRotationIndices().length <= 1) {
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

        app.post("/api/accounts/deduplicate", isAuthenticated, async (req, res) => {
            try {
                const { authSource, requestHandler } = this.serverSystem;

                const duplicateGroups = authSource.getDuplicateGroups() || [];
                if (duplicateGroups.length === 0) {
                    return res.status(200).json({
                        message: "accountDedupNoop",
                        removedIndices: [],
                    });
                }

                this.logger.warn(
                    "[Auth] Dedup cleanup will keep the auth file with the highest index per email and delete the other duplicates. " +
                        "Assumption: for the same account, auth indices are created in chronological order (higher index = newer)."
                );

                const currentAuthIndex = requestHandler.currentAuthIndex;
                if (Number.isInteger(currentAuthIndex) && currentAuthIndex >= 0) {
                    const canonicalCurrent = authSource.getCanonicalIndex(currentAuthIndex);
                    if (canonicalCurrent !== null && canonicalCurrent !== currentAuthIndex) {
                        this.logger.warn(
                            `[Auth] Current active auth #${currentAuthIndex} is a duplicate. Switching to the latest auth #${canonicalCurrent} before cleanup.`
                        );
                        const switchResult = await requestHandler._switchToSpecificAuth(canonicalCurrent);
                        if (!switchResult.success) {
                            return res.status(409).json({
                                message: "accountDedupSwitchFailed",
                                reason: switchResult.reason,
                            });
                        }
                    }
                }

                const removedIndices = [];
                const failed = [];

                for (const group of duplicateGroups) {
                    const removed = Array.isArray(group.removedIndices) ? group.removedIndices : [];
                    if (removed.length === 0) continue;

                    this.logger.info(
                        `[Auth] Dedup: email ${group.email} -> keep auth-${group.keptIndex}.json, delete [${removed
                            .map(i => `auth-${i}.json`)
                            .join(", ")}]`
                    );

                    for (const index of removed) {
                        try {
                            authSource.removeAuth(index);
                            removedIndices.push(index);
                        } catch (error) {
                            failed.push({ error: error.message, index });
                            this.logger.error(`[Auth] Dedup delete failed for auth-${index}.json: ${error.message}`);
                        }
                    }
                }

                if (failed.length > 0) {
                    return res.status(500).json({
                        failed,
                        message: "accountDedupPartialFailed",
                        removedIndices,
                    });
                }

                return res.status(200).json({
                    message: "accountDedupSuccess",
                    removedIndices,
                });
            } catch (error) {
                this.logger.error(`[Auth] Dedup cleanup failed: ${error.message}`);
                return res.status(500).json({ error: error.message, message: "accountDedupFailed" });
            }
        });

        app.delete("/api/accounts/:index", isAuthenticated, (req, res) => {
            const rawIndex = req.params.index;
            const targetIndex = Number(rawIndex);
            const currentAuthIndex = this.serverSystem.requestHandler.currentAuthIndex;
            const forceDelete = req.query.force === "true"; // Check if force delete is confirmed

            if (!Number.isInteger(targetIndex)) {
                return res.status(400).json({ message: "errorInvalidIndex" });
            }

            const { authSource } = this.serverSystem;

            if (!authSource.initialIndices.includes(targetIndex)) {
                return res.status(404).json({ index: targetIndex, message: "errorAccountNotFound" });
            }

            // If deleting current account without confirmation, return warning
            if (targetIndex === currentAuthIndex && !forceDelete) {
                return res.status(409).json({
                    index: targetIndex,
                    message: "warningDeleteCurrentAccount",
                    requiresConfirmation: true,
                });
            }

            try {
                authSource.removeAuth(targetIndex);

                // If deleting current account, close browser connection
                if (targetIndex === currentAuthIndex) {
                    this.logger.warn(
                        `[WebUI] Current active account #${targetIndex} was deleted. Closing browser connection...`
                    );
                    this.serverSystem.browserManager.closeBrowser().catch(err => {
                        this.logger.error(`[WebUI] Error closing browser after account deletion: ${err.message}`);
                    });
                    // Reset current account index through browserManager
                    this.serverSystem.browserManager.currentAuthIndex = -1;
                }

                this.logger.warn(
                    `[WebUI] Account #${targetIndex} deleted via web interface. Previous current account: #${currentAuthIndex}`
                );
                res.status(200).json({
                    index: targetIndex,
                    message: "accountDeleteSuccess",
                    wasCurrentAccount: targetIndex === currentAuthIndex,
                });
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

        app.put("/api/settings/debug-mode", isAuthenticated, (req, res) => {
            const currentLevel = LoggingService.getLevel();
            const newLevel = currentLevel === "DEBUG" ? "INFO" : "DEBUG";
            LoggingService.setLevel(newLevel);
            this.logger.info(`[WebUI] Log level switched to: ${newLevel}`);

            // Sync browser log level via WebSocket
            const browserSynced = this.serverSystem.requestHandler.setBrowserLogLevel(newLevel);
            if (!browserSynced) {
                this.logger.warn(`[WebUI] Browser log level sync failed (no active connection)`);
            }

            res.status(200).json({
                browserSynced,
                message: "settingUpdateSuccess",
                setting: "logLevel",
                value: newLevel === "DEBUG" ? "debug" : "normal",
            });
        });

        app.put("/api/settings/log-max-count", isAuthenticated, (req, res) => {
            const { count } = req.body;
            const newCount = parseInt(count, 10);

            if (!isNaN(newCount) && newCount > 0) {
                this.logger.setDisplayLimit(newCount);
                this.logger.info(`[WebUI] Log display limit updated to: ${newCount}`);
                res.status(200).json({ message: "settingUpdateSuccess", setting: "logMaxCount", value: newCount });
            } else {
                res.status(400).json({ error: "Invalid count", message: "settingFailed" });
            }
        });

        app.post("/api/files", isAuthenticated, (req, res) => {
            const { content } = req.body;
            // Ignore req.body.filename - auto rename

            if (!content) {
                return res.status(400).json({ error: "Missing content" });
            }

            try {
                // Ensure directory exists
                const configDir = path.join(process.cwd(), "configs", "auth");
                if (!fs.existsSync(configDir)) {
                    fs.mkdirSync(configDir, { recursive: true });
                }

                // If content is object, stringify it
                const fileContent = typeof content === "object" ? JSON.stringify(content, null, 2) : content;

                // Always use max index + 1 to ensure new auth is always the latest
                // This simplifies dedup logic assumption: higher index = newer auth
                const existingIndices = this.serverSystem.authSource.availableIndices || [];
                const nextAuthIndex = existingIndices.length > 0 ? Math.max(...existingIndices) + 1 : 0;

                const newFilename = `auth-${nextAuthIndex}.json`;
                const filePath = path.join(configDir, newFilename);

                fs.writeFileSync(filePath, fileContent);

                // Reload auth sources to pick up changes
                this.serverSystem.authSource.reloadAuthSources();

                this.logger.info(`[WebUI] File uploaded via API: generated ${newFilename}`);
                res.status(200).json({ filename: newFilename, message: "File uploaded successfully" });
            } catch (error) {
                this.logger.error(`[WebUI] Failed to write file: ${error.message}`);
                res.status(500).json({ error: "Failed to save file" });
            }
        });

        app.get("/api/files/:filename", isAuthenticated, (req, res) => {
            const filename = req.params.filename;
            // Security check
            if (!/^[a-zA-Z0-9.-]+$/.test(filename) || filename.includes("..")) {
                return res.status(400).json({ error: "Invalid filename" });
            }
            const filePath = path.join(process.cwd(), "configs", "auth", filename);
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: "File not found" });
            }
            res.download(filePath);
        });
    }

    _getStatusData() {
        const { config, requestHandler, authSource, browserManager } = this.serverSystem;
        const initialIndices = authSource.initialIndices || [];
        const invalidIndices = initialIndices.filter(i => !authSource.availableIndices.includes(i));
        const rotationIndices = authSource.getRotationIndices();
        const duplicateIndices = authSource.duplicateIndices || [];
        const limit = this.logger.displayLimit || 100;
        const allLogs = this.logger.logBuffer || [];
        const displayLogs = allLogs.slice(-limit);
        const accountNameMap = authSource.accountNameMap;
        const accountDetails = initialIndices.map(index => {
            const isInvalid = invalidIndices.includes(index);
            const name = isInvalid ? null : accountNameMap.get(index) || null;

            const canonicalIndex = isInvalid ? null : authSource.getCanonicalIndex(index);
            const isDuplicate = canonicalIndex !== null && canonicalIndex !== index;
            const isRotation = rotationIndices.includes(index);

            return { canonicalIndex, index, isDuplicate, isInvalid, isRotation, name };
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
            logCount: displayLogs.length,
            logs: displayLogs.join("\n"),
            status: {
                accountDetails,
                apiKeySource: config.apiKeySource,
                browserConnected: !!browserManager.browser,
                currentAccountName,
                currentAuthIndex,
                debugMode: LoggingService.isDebugEnabled(),
                duplicateIndicesRaw: duplicateIndices,
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
                logMaxCount: limit,
                rotationIndicesRaw: rotationIndices,
                streamingMode: this.serverSystem.streamingMode,
                usageCount,
            },
        };
    }
}

module.exports = StatusRoutes;

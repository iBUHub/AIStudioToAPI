/**
 * File: src/auth/AuthSwitcher.js
 * Description: Authentication switcher that handles account rotation logic, failure tracking, and usage-based switching
 *
 * Maintainers: iBenzene, bbbugg
 * Original Author: Ellinav
 */

/**
 * Authentication Switcher Module
 * Handles account switching logic including single/multi-account modes and fallback mechanisms
 */
class AuthSwitcher {
    constructor(logger, config, authSource, browserManager) {
        this.logger = logger;
        this.config = config;
        this.authSource = authSource;
        this.browserManager = browserManager;
        this.failureCount = 0;
        this.usageCount = 0;
        this.isSystemBusy = false;
    }

    get currentAuthIndex() {
        return this.browserManager.currentAuthIndex;
    }

    getNextAuthIndex() {
        const available = this.authSource.availableIndices;
        if (available.length === 0) return null;

        const currentIndexInArray = available.indexOf(this.currentAuthIndex);

        if (currentIndexInArray === -1) {
            this.logger.warn(
                `[Auth] Current index ${this.currentAuthIndex} not in available list, switching to first available index.`
            );
            return available[0];
        }

        const nextIndexInArray = (currentIndexInArray + 1) % available.length;
        return available[nextIndexInArray];
    }

    async switchToNextAuth() {
        const available = this.authSource.availableIndices;

        if (available.length === 0) {
            throw new Error("No available authentication sources, cannot switch.");
        }

        if (this.isSystemBusy) {
            this.logger.info("🔄 [Auth] Account switching/restarting in progress, skipping duplicate operation");
            return { reason: "Switch already in progress.", success: false };
        }

        this.isSystemBusy = true;

        try {
            // Single account mode
            if (available.length === 1) {
                const singleIndex = available[0];
                this.logger.info("==================================================");
                this.logger.info(
                    `🔄 [Auth] Single account mode: Rotation threshold reached, performing in-place restart...`
                );
                this.logger.info(`   • Target account: #${singleIndex}`);
                this.logger.info("==================================================");

                try {
                    await this.browserManager.launchOrSwitchContext(singleIndex);
                    this.failureCount = 0;
                    this.usageCount = 0;

                    this.logger.info(
                        `✅ [Auth] Single account #${singleIndex} restart/refresh successful, usage count reset.`
                    );
                    return { newIndex: singleIndex, success: true };
                } catch (error) {
                    this.logger.error(`❌ [Auth] Single account restart failed: ${error.message}`);
                    throw error;
                }
            }

            // Multi-account mode
            const previousAuthIndex = this.currentAuthIndex;
            const nextAuthIndex = this.getNextAuthIndex();

            this.logger.info("==================================================");
            this.logger.info(`🔄 [Auth] Multi-account mode: Starting account switching process`);
            this.logger.info(`   • Current account: #${previousAuthIndex}`);
            this.logger.info(`   • Target account: #${nextAuthIndex}`);
            this.logger.info("==================================================");

            try {
                await this.browserManager.switchAccount(nextAuthIndex);
                this.failureCount = 0;
                this.usageCount = 0;
                this.logger.info(
                    `✅ [Auth] Successfully switched to account #${this.currentAuthIndex}, counters reset.`
                );
                return { newIndex: this.currentAuthIndex, success: true };
            } catch (error) {
                this.logger.error(`❌ [Auth] Switching to account #${nextAuthIndex} failed: ${error.message}`);
                this.logger.warn(
                    `🚨 [Auth] Switch failed, attempting to fall back to previous available account #${previousAuthIndex}...`
                );
                try {
                    await this.browserManager.launchOrSwitchContext(previousAuthIndex);
                    this.logger.info(`✅ [Auth] Successfully fell back to account #${previousAuthIndex}!`);
                    this.failureCount = 0;
                    this.usageCount = 0;
                    this.logger.info("[Auth] Failure and usage counters reset to 0 after successful fallback.");
                    return {
                        fallback: true,
                        newIndex: this.currentAuthIndex,
                        success: false,
                    };
                } catch (fallbackError) {
                    this.logger.error(
                        `FATAL: ❌❌❌ [Auth] Emergency fallback to account #${previousAuthIndex} also failed! Service may be interrupted.`
                    );
                    throw fallbackError;
                }
            }
        } finally {
            this.isSystemBusy = false;
        }
    }

    async switchToSpecificAuth(targetIndex) {
        if (this.isSystemBusy) {
            this.logger.info("🔄 [Auth] Account switching in progress, skipping duplicate operation");
            return { reason: "Switch already in progress.", success: false };
        }
        if (!this.authSource.availableIndices.includes(targetIndex)) {
            return {
                reason: `Switch failed: Account #${targetIndex} invalid or does not exist.`,
                success: false,
            };
        }

        this.isSystemBusy = true;
        try {
            this.logger.info(`🔄 [Auth] Starting switch to specified account #${targetIndex}...`);
            await this.browserManager.switchAccount(targetIndex);
            this.failureCount = 0;
            this.usageCount = 0;
            this.logger.info(`✅ [Auth] Successfully switched to account #${this.currentAuthIndex}, counters reset.`);
            return { newIndex: this.currentAuthIndex, success: true };
        } catch (error) {
            this.logger.error(`❌ [Auth] Switch to specified account #${targetIndex} failed: ${error.message}`);
            throw error;
        } finally {
            this.isSystemBusy = false;
        }
    }

    async handleRequestFailureAndSwitch(errorDetails, sendErrorCallback) {
        this.failureCount++;
        if (this.config.failureThreshold > 0) {
            this.logger.warn(
                `⚠️ [Auth] Request failed - failure count: ${this.failureCount}/${this.config.failureThreshold} (Current account index: ${this.currentAuthIndex})`
            );
        } else {
            this.logger.warn(
                `⚠️ [Auth] Request failed - failure count: ${this.failureCount} (Current account index: ${this.currentAuthIndex})`
            );
        }

        const isImmediateSwitch = this.config.immediateSwitchStatusCodes.includes(errorDetails.status);
        const isThresholdReached =
            this.config.failureThreshold > 0 && this.failureCount >= this.config.failureThreshold;

        if (isImmediateSwitch || isThresholdReached) {
            if (isImmediateSwitch) {
                this.logger.warn(
                    `🔴 [Auth] Received status code ${errorDetails.status}, triggering immediate account switch...`
                );
            } else {
                this.logger.warn(
                    `🔴 [Auth] Failure threshold reached (${this.failureCount}/${this.config.failureThreshold})! Preparing to switch account...`
                );
            }

            try {
                await this.switchToNextAuth();
                const successMessage = `🔄 Target account invalid, automatically fell back to account #${this.currentAuthIndex}.`;
                this.logger.info(`[Auth] ${successMessage}`);
                if (sendErrorCallback) sendErrorCallback(successMessage);
            } catch (error) {
                let userMessage = `❌ Fatal error: Unknown switching error occurred: ${error.message}`;

                if (error.message.includes("Only one account is available")) {
                    userMessage = "❌ Switch failed: Only one account available.";
                    this.logger.info("[Auth] Only one account available, failure count reset.");
                    this.failureCount = 0;
                } else if (error.message.includes("Fallback failed reason")) {
                    userMessage = `❌ Fatal error: Both automatic switching and emergency fallback failed, service may be interrupted, please check logs!`;
                } else if (error.message.includes("Switching to account")) {
                    userMessage = `⚠️ Automatic switch failed: Automatically fell back to account #${this.currentAuthIndex}, please check if target account has issues.`;
                }

                this.logger.error(`[Auth] Background account switching task failed: ${error.message}`);
                if (sendErrorCallback) sendErrorCallback(userMessage);
            }
        }
    }

    incrementUsageCount() {
        this.usageCount++;
        return this.usageCount;
    }

    shouldSwitchByUsage() {
        return this.config.switchOnUses > 0 && this.usageCount >= this.config.switchOnUses;
    }

    resetCounters() {
        this.failureCount = 0;
        this.usageCount = 0;
    }
}

module.exports = AuthSwitcher;

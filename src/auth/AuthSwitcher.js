/**
 * File: src/auth/AuthSwitcher.js
 * Description: Authentication switcher that handles account rotation logic, failure tracking, and usage-based switching
 *
 * Author: Ellinav, iBenzene, bbbugg
 */

/**
 * Authentication Switcher Module
 * Handles account switching logic including single/multi-account modes and fallback mechanisms
 */
class AuthSwitcher {
    // Dispose a context only after this many consecutive empty-upstream judgments on the SAME context.
    // Prevents a hot dispose/recreate loop when every account is judged empty (e.g. detector false-positive).
    static EMPTY_DISPOSE_THRESHOLD = 3;

    constructor(logger, config, authSource, browserManager) {
        this.logger = logger;
        this.config = config;
        this.authSource = authSource;
        this.browserManager = browserManager;
        this.failureCount = 0;
        this.usageCount = 0;
        this.isSystemBusy = false;
        // authIndex -> consecutive empty_upstream_response judgment count.
        this._emptyJudgmentCounts = new Map();
    }

    get currentAuthIndex() {
        return this.browserManager.currentAuthIndex;
    }

    set currentAuthIndex(value) {
        this.browserManager.currentAuthIndex = value;
    }
    /**
     * Reset the consecutive empty-upstream judgment counter for a successful auth index.
     * A success on an account means its next empty judgment starts counting from 1 again;
     * only consecutive empties without an intervening success may reach the dispose threshold.
     * @param {number|null} authIndex - The account index that served a successful request.
     */
    resetEmptyJudgmentCountForAuth(authIndex) {
        if (Number.isInteger(authIndex) && authIndex >= 0) {
            this._emptyJudgmentCounts.delete(authIndex);
        }
    }

    // getNextAuthIndex() {
    //     const available = this.authSource.getRotationIndices();
    //     if (available.length === 0) return null;

    //     const currentCanonicalIndex =
    //         this.currentAuthIndex >= 0
    //             ? this.authSource.getCanonicalIndex(this.currentAuthIndex)
    //             : this.currentAuthIndex;
    //     const currentIndexInArray = available.indexOf(currentCanonicalIndex);

    //     if (currentIndexInArray === -1) {
    //         this.logger.warn(
    //             `[Auth] Current index ${this.currentAuthIndex} not in available list, switching to first available index.`
    //         );
    //         return available[0];
    //     }

    //     const nextIndexInArray = (currentIndexInArray + 1) % available.length;
    //     return available[nextIndexInArray];
    // }

    async switchToNextAuth(failedAuthIndex = this.currentAuthIndex, allowOriginalFallback = true) {
        const available = this.authSource.getRotationIndices();

        if (available.length === 0) {
            throw new Error("No available authentication sources, cannot switch.");
        }

        if (this.isSystemBusy) {
            this.logger.info("🔄 [Auth] Account switching/restarting in progress, skipping duplicate operation");
            return { reason: "Switch already in progress.", success: false };
        }

        this.isSystemBusy = true;

        try {
            const getCurrentCanonicalIndex = () =>
                failedAuthIndex >= 0 ? this.authSource.getCanonicalIndex(failedAuthIndex) : -1;

            if (failedAuthIndex >= 0) {
                const emptyCount = this._emptyJudgmentCounts.get(failedAuthIndex) || 0;
                // Churn guard: dispose a context only after K consecutive empty-upstream judgments
                // on it. Non-empty failures (429/403/5xx) never dispose — the context stays warm
                // and the account recovers after cooldown, keeping switching instant.
                if (emptyCount >= AuthSwitcher.EMPTY_DISPOSE_THRESHOLD) {
                    this.logger.info(
                        `🗑️ [Auth] Disposing tainted context #${failedAuthIndex} on account switch/retry...`
                    );
                    await this.browserManager.closeContext(failedAuthIndex).catch(err => {
                        this.logger.warn(`[Auth] Failed to close context #${failedAuthIndex}: ${err.message}`);
                    });
                    if (emptyCount > 0) this._emptyJudgmentCounts.delete(failedAuthIndex);
                } else {
                    this.logger.info(
                        `🛡️ [Auth] Skipping context #${failedAuthIndex} disposal (${emptyCount}/${AuthSwitcher.EMPTY_DISPOSE_THRESHOLD} consecutive empty judgments) to avoid churn.`
                    );
                }
            }
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
                    this._emptyJudgmentCounts.delete(singleIndex);
                    this.resetCounters();
                    this.browserManager.rebalanceContextPool().catch(err => {
                        this.logger.error(`[Auth] Background rebalance failed: ${err.message}`);
                    });

                    this.logger.info(
                        `✅ [Auth] Single account #${singleIndex} restart/refresh successful, usage count reset.`
                    );
                    return { newIndex: singleIndex, success: true };
                } catch (error) {
                    this.logger.error(`❌ [Auth] Single account restart failed: ${error.message}`);
                    throw new Error(`Only one account is available and restart failed: ${error.message}`);
                }
            }

            // Multi-account mode
            const currentIndexInArray = available.indexOf(getCurrentCanonicalIndex());
            const hasCurrentAccount = currentIndexInArray !== -1;
            const startIndex = hasCurrentAccount ? currentIndexInArray : 0;
            const originalStartAccount = hasCurrentAccount ? available[startIndex] : null;

            this.logger.info("==================================================");
            this.logger.info(`🔄 [Auth] Multi-account mode: Starting intelligent account switching`);
            this.logger.info(`   • Failed account: #${failedAuthIndex}`);
            this.logger.info(
                `   • Available accounts (dedup by email, keeping latest index): [${available.join(", ")}]`
            );
            if (hasCurrentAccount) {
                this.logger.info(`   • Starting from: #${originalStartAccount}`);
            } else {
                this.logger.info(`   • No current account, will try all available accounts`);
            }
            this.logger.info("==================================================");

            const failedAccounts = [];
            // If no current account (currentAuthIndex=-1), start from i=0 to try all accounts
            // If has current account, start from i=1 to skip current and try others
            const startOffset = hasCurrentAccount ? 1 : 0;
            const tryCount = hasCurrentAccount ? available.length - 1 : available.length;

            for (let i = startOffset; i < startOffset + tryCount; i++) {
                const tryIndex = (startIndex + i) % available.length;
                const accountIndex = available[tryIndex];

                const attemptNumber = i - startOffset + 1;
                this.logger.info(
                    `🔄 [Auth] Attempting to switch to account #${accountIndex} (${attemptNumber}/${tryCount} accounts)...`
                );

                const prevIdx = this.currentAuthIndex;
                try {
                    // Pre-cleanup: remove excess contexts BEFORE creating new one to avoid exceeding maxContexts
                    await this.browserManager.preCleanupForSwitch(accountIndex);
                    await this.browserManager.switchAccount(accountIndex);
                    this.resetCounters();
                    this.browserManager.rebalanceContextPool().catch(err => {
                        this.logger.error(`[Auth] Background rebalance failed: ${err.message}`);
                    });

                    if (failedAccounts.length > 0) {
                        this.logger.info(
                            `✅ [Auth] Successfully switched to account #${accountIndex} after skipping failed accounts: [${failedAccounts.join(", ")}]`
                        );
                    } else {
                        this.logger.info(
                            `✅ [Auth] Successfully switched to account #${accountIndex}, counters reset.`
                        );
                    }

                    return { failedAccounts, newIndex: accountIndex, success: true };
                } catch (error) {
                    this.logger.error(`❌ [Auth] Account #${accountIndex} failed: ${error.message}`);
                    if (this.browserManager.currentAuthIndex === accountIndex) {
                        this.browserManager.currentAuthIndex = prevIdx;
                    }
                    failedAccounts.push(accountIndex);
                }
            }

            // Manual rotation may fall back to the original account; failure recovery must not retry it.
            if (allowOriginalFallback && hasCurrentAccount && originalStartAccount !== null) {
                this.logger.warn("==================================================");
                this.logger.warn(
                    `⚠️ [Auth] All other accounts failed. Making final attempt with original starting account #${originalStartAccount}...`
                );
                this.logger.warn("==================================================");

                try {
                    // Pre-cleanup: remove excess contexts BEFORE creating new one to avoid exceeding maxContexts
                    await this.browserManager.preCleanupForSwitch(originalStartAccount);
                    await this.browserManager.switchAccount(originalStartAccount);
                    this.resetCounters();
                    this.browserManager.rebalanceContextPool().catch(err => {
                        this.logger.error(`[Auth] Background rebalance failed: ${err.message}`);
                    });
                    this.logger.info(
                        `✅ [Auth] Final attempt succeeded! Switched to account #${originalStartAccount}.`
                    );
                    return {
                        failedAccounts,
                        finalAttempt: true,
                        newIndex: originalStartAccount,
                        success: true,
                    };
                } catch (finalError) {
                    this.logger.error(
                        `FATAL: ❌❌❌ [Auth] Final attempt with account #${originalStartAccount} also failed!`
                    );
                    failedAccounts.push(originalStartAccount);

                    // Throw fallback failure error with detailed information
                    this.currentAuthIndex = -1;
                    throw new Error(
                        `Fallback failed reason: All accounts failed including fallback to #${originalStartAccount}. Failed accounts: [${failedAccounts.join(", ")}]`
                    );
                }
            }

            // All accounts failed
            this.logger.error(
                `FATAL: All ${available.length} accounts failed! Failed accounts: [${failedAccounts.join(", ")}]`
            );
            this.currentAuthIndex = -1;
            throw new Error(
                `Switching to account failed: All ${available.length} available accounts failed to initialize. Failed accounts: [${failedAccounts.join(", ")}]`
            );
        } finally {
            this.isSystemBusy = false;
        }
    }

    async switchToSpecificAuth(targetIndex) {
        if (this.isSystemBusy) {
            this.logger.info("🔄 [Auth] Account switching in progress, skipping duplicate operation");
            return { reason: "Switch already in progress.", success: false };
        }

        // For manual switch, respect user's choice - don't auto-redirect to canonical index
        // UI already shows duplicate indicator, so user is making a deliberate choice
        if (!this.authSource.availableIndices.includes(targetIndex)) {
            return {
                reason: `Switch failed: Account #${targetIndex} invalid or does not exist.`,
                success: false,
            };
        }

        this.isSystemBusy = true;
        try {
            this.logger.info(`🔄 [Auth] Starting switch to specified account #${targetIndex}...`);
            // Pre-cleanup: remove excess contexts BEFORE creating new one to avoid exceeding maxContexts
            await this.browserManager.preCleanupForSwitch(targetIndex);
            await this.browserManager.switchAccount(targetIndex);
            this.resetCounters();
            this.browserManager.rebalanceContextPool().catch(err => {
                this.logger.error(`[Auth] Background rebalance failed: ${err.message}`);
            });
            this.logger.info(`✅ [Auth] Successfully switched to account #${targetIndex}, counters reset.`);
            return { newIndex: targetIndex, success: true };
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

        const isImmediateSwitch =
            this.config.immediateSwitchStatusCodes.includes(errorDetails.status) ||
            errorDetails.status === 502 ||
            errorDetails.reason === "empty_upstream_response";

        // Track consecutive empty-upstream judgments per context so we don't dispose/recreate
        // contexts in a hot loop when every account is judged empty. Reset on any non-empty failure.
        const idx = Number.isInteger(errorDetails.authIndex) ? errorDetails.authIndex : this.currentAuthIndex;
        if (errorDetails.reason === "empty_upstream_response") {
            if (idx >= 0) {
                this._emptyJudgmentCounts.set(idx, (this._emptyJudgmentCounts.get(idx) || 0) + 1);
            }
        } else {
            if (idx >= 0) {
                this._emptyJudgmentCounts.delete(idx);
            }
        }
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
                const result = await this.switchToNextAuth(idx, false);
                if (!result.success) {
                    this.logger.warn(`⚠️ [Auth] Account switch skipped: ${result.reason}`);
                    if (sendErrorCallback) {
                        sendErrorCallback(`⚠️ Account switch skipped: ${result.reason}`);
                    }
                    return;
                }
                const successMessage = `🔄 Account switch completed, now using account #${this.currentAuthIndex}.`;
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

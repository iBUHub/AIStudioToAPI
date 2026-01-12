/**
 * File: src/auth/AuthSource.js
 * Description: Authentication source manager that loads and validates authentication data from config files
 *
 * Maintainers: iBenzene, bbbugg
 * Original Author: Ellinav
 */

const fs = require("fs");
const path = require("path");

/**
 * Authentication Source Management Module
 * Responsible for loading and managing authentication information from the file system
 */
class AuthSource {
    constructor(logger) {
        this.logger = logger;
        this.authMode = "file";
        this.availableIndices = [];
        // Indices used for rotation/switching (deduplicated by email, keeping the latest index per account)
        this.rotationIndices = [];
        // Duplicate auth indices detected (valid JSON but skipped from rotation due to same email)
        this.duplicateIndices = [];
        this.initialIndices = [];
        this.accountNameMap = new Map();
        // Map any valid index -> canonical (latest) index for the same account email
        this.canonicalIndexMap = new Map();
        // Duplicate groups (email -> kept + duplicates)
        this.duplicateGroups = [];
        this.lastScannedIndices = "[]"; // Cache to track changes

        this.logger.info('[Auth] Using files in "configs/auth/" directory for authentication.');

        this.reloadAuthSources(true); // Initial load

        if (this.availableIndices.length === 0) {
            this.logger.warn(
                `[Auth] No valid authentication sources found in 'file' mode. The server will start in account binding mode.`
            );
        }
    }

    reloadAuthSources(isInitialLoad = false) {
        const oldIndices = this.lastScannedIndices;
        this._discoverAvailableIndices();
        const newIndices = JSON.stringify(this.initialIndices);

        // Only log verbosely if it's the first load or if the file list has actually changed.
        if (isInitialLoad || oldIndices !== newIndices) {
            this.logger.info(`[Auth] Auth file scan detected changes. Reloading and re-validating...`);
            this._preValidateAndFilter();
            this.logger.info(
                `[Auth] Reload complete. ${this.availableIndices.length} valid sources available: [${this.availableIndices.join(", ")}]`
            );
            this.lastScannedIndices = newIndices;
        }
    }

    removeAuth(index) {
        if (!Number.isInteger(index)) {
            throw new Error("Invalid account index.");
        }

        const authFilePath = path.join(process.cwd(), "configs", "auth", `auth-${index}.json`);
        if (!fs.existsSync(authFilePath)) {
            throw new Error(`Auth file for account #${index} does not exist.`);
        }

        try {
            fs.unlinkSync(authFilePath);
        } catch (error) {
            throw new Error(`Failed to delete auth file for account #${index}: ${error.message}`);
        }

        return {
            remainingAccounts: this.availableIndices.length,
            removedIndex: index,
        };
    }

    _discoverAvailableIndices() {
        let indices = [];
        const configDir = path.join(process.cwd(), "configs", "auth");
        if (!fs.existsSync(configDir)) {
            this.availableIndices = [];
            this.initialIndices = [];
            return;
        }
        try {
            const files = fs.readdirSync(configDir);
            const authFiles = files.filter(file => /^auth-\d+\.json$/.test(file));
            indices = authFiles.map(file => parseInt(file.match(/^auth-(\d+)\.json$/)[1], 10));
        } catch (error) {
            this.logger.error(`[Auth] Failed to scan "configs/auth/" directory: ${error.message}`);
            this.availableIndices = [];
            this.initialIndices = [];
            return;
        }

        this.initialIndices = [...new Set(indices)].sort((a, b) => a - b);
    }

    _preValidateAndFilter() {
        if (this.initialIndices.length === 0) {
            this.availableIndices = [];
            this.rotationIndices = [];
            this.duplicateIndices = [];
            this.accountNameMap.clear();
            this.canonicalIndexMap.clear();
            this.duplicateGroups = [];
            return;
        }

        const validIndices = [];
        const invalidSourceDescriptions = [];
        this.accountNameMap.clear(); // Clear old names before re-validating
        this.canonicalIndexMap.clear();
        this.duplicateGroups = [];

        for (const index of this.initialIndices) {
            // Iterate over initial to check all, not just previously available
            const authContent = this._getAuthContent(index);
            if (authContent) {
                try {
                    const authData = JSON.parse(authContent);
                    validIndices.push(index);
                    this.accountNameMap.set(index, authData.accountName || null);
                } catch (e) {
                    invalidSourceDescriptions.push(`auth-${index}`);
                }
            } else {
                invalidSourceDescriptions.push(`auth-${index} (unreadable)`);
            }
        }

        if (invalidSourceDescriptions.length > 0) {
            this.logger.warn(
                `⚠️ [Auth] Pre-validation found ${
                    invalidSourceDescriptions.length
                } authentication sources with format errors or unreadable: [${invalidSourceDescriptions.join(
                    ", "
                )}], will be removed from available list.`
            );
        }

        this.availableIndices = validIndices.sort((a, b) => a - b);
        this._buildRotationIndices();
    }

    _normalizeEmailKey(accountName) {
        if (typeof accountName !== "string") return null;
        const trimmed = accountName.trim();
        if (!trimmed) return null;
        // Conservative: only deduplicate when the name looks like an email address.
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(trimmed)) return null;
        return trimmed.toLowerCase();
    }

    _buildRotationIndices() {
        this.rotationIndices = [];
        this.duplicateIndices = [];
        this.duplicateGroups = [];

        const emailKeyToIndices = new Map();

        for (const index of this.availableIndices) {
            const accountName = this.accountNameMap.get(index);
            const emailKey = this._normalizeEmailKey(accountName);

            if (!emailKey) {
                this.rotationIndices.push(index);
                this.canonicalIndexMap.set(index, index);
                continue;
            }

            const list = emailKeyToIndices.get(emailKey) || [];
            list.push(index);
            emailKeyToIndices.set(emailKey, list);
        }

        for (const [emailKey, indices] of emailKeyToIndices.entries()) {
            indices.sort((a, b) => a - b);
            const keptIndex = indices[indices.length - 1];
            this.rotationIndices.push(keptIndex);

            const duplicateIndices = [];
            for (const index of indices) {
                this.canonicalIndexMap.set(index, keptIndex);
                if (index !== keptIndex) {
                    duplicateIndices.push(index);
                }
            }

            if (duplicateIndices.length > 0) {
                this.duplicateIndices.push(...duplicateIndices);
                this.duplicateGroups.push({
                    email: emailKey,
                    keptIndex,
                    removedIndices: duplicateIndices,
                });
            }
        }

        this.rotationIndices = [...new Set(this.rotationIndices)].sort((a, b) => a - b);
        this.duplicateIndices = [...new Set(this.duplicateIndices)].sort((a, b) => a - b);

        if (this.duplicateIndices.length > 0) {
            this.logger.warn(
                `[Auth] Detected ${this.duplicateIndices.length} duplicate auth files (same email). ` +
                    `Rotation will only use latest index per account: [${this.rotationIndices.join(", ")}].`
            );
        }
    }

    _getAuthContent(index) {
        const authFilePath = path.join(process.cwd(), "configs", "auth", `auth-${index}.json`);
        if (!fs.existsSync(authFilePath)) return null;
        try {
            return fs.readFileSync(authFilePath, "utf-8");
        } catch (e) {
            return null;
        }
    }

    getAuth(index) {
        if (!this.availableIndices.includes(index)) {
            this.logger.error(`[Auth] Requested invalid or non-existent authentication index: ${index}`);
            return null;
        }

        const jsonString = this._getAuthContent(index);
        if (!jsonString) {
            this.logger.error(`[Auth] Unable to retrieve content for authentication source #${index} during read.`);
            return null;
        }

        try {
            return JSON.parse(jsonString);
        } catch (e) {
            this.logger.error(`[Auth] Failed to parse JSON content from authentication source #${index}: ${e.message}`);
            return null;
        }
    }

    getRotationIndices() {
        return this.rotationIndices;
    }

    getCanonicalIndex(index) {
        if (!Number.isInteger(index)) return null;
        if (!this.availableIndices.includes(index)) return null;
        return this.canonicalIndexMap.get(index) ?? index;
    }

    getDuplicateGroups() {
        return this.duplicateGroups;
    }
}

module.exports = AuthSource;

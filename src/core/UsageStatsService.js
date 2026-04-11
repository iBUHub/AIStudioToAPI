/**
 * File: src/core/UsageStatsService.js
 * Description: In-memory usage statistics and request history service
 *
 * Author: OpenAI Codex
 */

const fs = require("fs");
const path = require("path");

class UsageStatsService {
    constructor(authSource, logger, dataDir, enabled = true) {
        this.authSource = authSource;
        this.logger = logger;
        this.dataDir = dataDir || path.join(process.cwd(), "data");
        this.statsFilePath = path.join(this.dataDir, "usage-stats.jsonl");
        this.enabled = enabled !== false;
        this.appendPromise = Promise.resolve();

        if (this.enabled) {
            // Ensure data directory exists
            if (!fs.existsSync(this.dataDir)) {
                fs.mkdirSync(this.dataDir, { recursive: true });
            }

            // Load persisted state
            this._loadFromFile();
        }

        if (!this.startedAt) {
            this.startedAtMs = Date.now();
            this.startedAt = new Date(this.startedAtMs).toISOString();
        }
        if (!this.summary) {
            this.summary = {
                abortedCount: 0,
                errorCount: 0,
                successCount: 0,
                totalDurationMs: 0,
                totalRequests: 0,
            };
        }
        if (!this.activeRequests) {
            this.activeRequests = new Map();
        }
        if (!this.records) {
            this.records = [];
        }
        if (!this.accountStats) {
            this.accountStats = new Map();
        }
        if (!this.formatStats) {
            this.formatStats = new Map();
        }
        if (!this.categoryStats) {
            this.categoryStats = new Map();
        }
        if (this.sequence === undefined) {
            this.sequence = 0;
        }
    }

    startRequest(requestId, meta = {}) {
        if (!this.enabled) return null;
        if (!requestId) return null;

        const tracker = {
            apiFormat: meta.apiFormat || "unknown",
            attemptCount: 0,
            attempts: [],
            clientIp: meta.clientIp || null,
            initialAccountName: this._normalizeAccountName(meta.initialAccountName),
            initialAuthIndex: this._normalizeAuthIndex(meta.initialAuthIndex),
            isStreaming: Boolean(meta.isStreaming),
            method: meta.method || "GET",
            model: meta.model || null,
            path: meta.path || "/",
            requestCategory: meta.requestCategory || "request",
            requestId,
            startedAt: new Date().toISOString(),
            startedAtMs: Date.now(),
            streamMode: meta.streamMode || null,
        };

        this.activeRequests.set(requestId, tracker);
        return tracker;
    }

    updateRequest(requestId, patch = {}) {
        if (!this.enabled) return;
        const tracker = this.activeRequests.get(requestId);
        if (!tracker) return;

        if (patch.apiFormat !== undefined) tracker.apiFormat = patch.apiFormat || tracker.apiFormat;
        if (patch.clientIp !== undefined) tracker.clientIp = patch.clientIp || null;
        if (patch.isStreaming !== undefined) tracker.isStreaming = Boolean(patch.isStreaming);
        if (patch.method !== undefined) tracker.method = patch.method || tracker.method;
        if (patch.model !== undefined) tracker.model = patch.model || null;
        if (patch.path !== undefined) tracker.path = patch.path || tracker.path;
        if (patch.requestCategory !== undefined)
            tracker.requestCategory = patch.requestCategory || tracker.requestCategory;
        if (patch.streamMode !== undefined) tracker.streamMode = patch.streamMode || null;

        if (patch.initialAuthIndex !== undefined) {
            tracker.initialAuthIndex = this._normalizeAuthIndex(patch.initialAuthIndex);
        }
        if (patch.initialAccountName !== undefined) {
            tracker.initialAccountName = this._normalizeAccountName(patch.initialAccountName);
        }
    }

    recordAttempt(requestId, authIndex, accountName = undefined) {
        if (!this.enabled) return;
        const tracker = this.activeRequests.get(requestId);
        if (!tracker) return;

        const normalizedAuthIndex = this._normalizeAuthIndex(authIndex);
        if (normalizedAuthIndex === null) return;

        const resolvedAccountName =
            accountName !== undefined
                ? this._normalizeAccountName(accountName)
                : this._resolveAccountName(normalizedAuthIndex);

        this._pushAttempt(tracker, normalizedAuthIndex, resolvedAccountName);
    }

    finishRequest(requestId, result = {}) {
        if (!this.enabled) return null;
        const tracker = this.activeRequests.get(requestId);
        if (!tracker) return null;

        this.activeRequests.delete(requestId);

        const finishedAtMs = Date.now();
        const lastAttempt = tracker.attempts[tracker.attempts.length - 1] || null;
        const lastParsed = lastAttempt?.accountKey ? this._parseAccountKey(lastAttempt.accountKey) : {};
        const finalAuthIndex =
            this._normalizeAuthIndex(result.finalAuthIndex) ?? lastParsed.authIndex ?? tracker.initialAuthIndex ?? null;
        const finalAccountName =
            this._normalizeAccountName(result.finalAccountName) ??
            lastParsed.accountName ??
            tracker.initialAccountName ??
            null;
        const outcome = this._normalizeOutcome(result.outcome);
        const statusCode = Number.isFinite(result.statusCode) ? Number(result.statusCode) : null;
        const durationMs = Math.max(0, finishedAtMs - tracker.startedAtMs);
        const accountKey = this._buildAccountKey(finalAuthIndex, finalAccountName);

        const record = {
            accountKey,
            apiFormat: tracker.apiFormat,
            attemptCount: tracker.attemptCount,
            attempts: tracker.attempts.map(item => ({ accountKey: item.accountKey })),
            clientIp: tracker.clientIp,
            durationMs,
            errorMessage: result.errorMessage || null,
            finalAccountName,
            finalAuthIndex,
            finishedAt: new Date(finishedAtMs).toISOString(),
            initialAccountName: tracker.initialAccountName,
            initialAuthIndex: tracker.initialAuthIndex,
            isStreaming: tracker.isStreaming,
            method: tracker.method,
            model: tracker.model,
            outcome,
            path: tracker.path,
            requestCategory: tracker.requestCategory,
            requestId: tracker.requestId,
            sequence: ++this.sequence,
            startedAt: tracker.startedAt,
            statusCode,
            streamMode: tracker.requestCategory === "generation" ? tracker.streamMode || "non" : null,
        };

        this.records.push(record);
        this._updateSummary(record);
        this._updateBreakdown(this.formatStats, record.apiFormat);
        this._updateBreakdown(this.categoryStats, record.requestCategory);
        this._updateAccountStats(record);

        // Append record to file (one line per record)
        this._appendRecord(record);

        return record;
    }

    getSnapshot() {
        if (!this.enabled) {
            return UsageStatsService.createEmptySnapshot();
        }

        const totalRequests = this.summary.totalRequests;
        const avgDurationMs = totalRequests > 0 ? Math.round(this.summary.totalDurationMs / totalRequests) : 0;
        const successRate =
            totalRequests > 0 ? Number(((this.summary.successCount / totalRequests) * 100).toFixed(1)) : 0;

        const accounts = Array.from(this.accountStats.values())
            .map(item => ({
                abortedCount: item.abortedCount,
                accountKey: item.accountKey,
                accountName: item.accountName,
                authIndex: item.authIndex,
                avgDurationMs: item.totalRequests > 0 ? Math.round(item.totalDurationMs / item.totalRequests) : 0,
                errorCount: item.errorCount,
                lastPath: item.lastPath,
                lastUsedAt: item.lastUsedAt,
                modelCounts: Object.entries(item.modelCounts || {})
                    .map(([key, count]) => ({ count, key }))
                    .sort((a, b) => b.count - a.count),
                successCount: item.successCount,
                successRate:
                    item.totalRequests > 0 ? Number(((item.successCount / item.totalRequests) * 100).toFixed(1)) : 0,
                totalDurationMs: item.totalDurationMs,
                totalRequests: item.totalRequests,
            }))
            .sort((a, b) => {
                if (b.totalRequests !== a.totalRequests) return b.totalRequests - a.totalRequests;
                return (b.lastUsedAt || "").localeCompare(a.lastUsedAt || "");
            });

        return {
            accounts,
            // Return full request history for display and client-side filtering
            records: this.records.slice().reverse(),
            startedAt: this.startedAt,
            summary: {
                abortedCount: this.summary.abortedCount,
                activeRequests: this.activeRequests.size,
                avgDurationMs,
                errorCount: this.summary.errorCount,
                formatBreakdown: this._serializeBreakdown(this.formatStats),
                requestCategoryBreakdown: this._serializeBreakdown(this.categoryStats),
                successCount: this.summary.successCount,
                successRate,
                totalRequests,
                uniqueAccountPairs: this.accountStats.size,
                uptimeSeconds: Math.max(0, Math.floor((Date.now() - this.startedAtMs) / 1000)),
            },
        };
    }

    _loadFromFile() {
        if (!this.enabled) return;
        try {
            if (!fs.existsSync(this.statsFilePath)) return;

            const lines = fs.readFileSync(this.statsFilePath, "utf-8").split("\n").filter(Boolean);
            this.records = [];
            this.sequence = 0;

            for (const line of lines) {
                try {
                    const record = this._normalizeLoadedRecord(JSON.parse(line));
                    this.records.push(record);
                    if (record.sequence > this.sequence) {
                        this.sequence = record.sequence;
                    }
                } catch {
                    // Skip malformed lines
                }
            }

            // Recalculate aggregates from all loaded records
            this._recalculateFromRecords();

            if (this.logger) {
                this.logger.info(`[UsageStats] Loaded ${this.records.length} records from ${this.statsFilePath}`);
            }
        } catch (err) {
            if (this.logger) {
                this.logger.warn(`[UsageStats] Failed to load stats file: ${err.message}`);
            }
        }
    }

    _appendRecord(record) {
        if (!this.enabled) return;
        const line = JSON.stringify(record) + "\n";
        this.appendPromise = this.appendPromise
            .catch(() => {})
            .then(() => fs.promises.appendFile(this.statsFilePath, line, "utf-8"))
            .catch(err => {
                if (this.logger) {
                    this.logger.warn(`[UsageStats] Failed to append record: ${err.message}`);
                }
            });
    }

    _recalculateFromRecords() {
        this.startedAtMs = Date.now();
        this.startedAt = new Date(this.startedAtMs).toISOString();
        this.summary = {
            abortedCount: 0,
            errorCount: 0,
            successCount: 0,
            totalDurationMs: 0,
            totalRequests: 0,
        };
        this.accountStats = new Map();
        this.formatStats = new Map();
        this.categoryStats = new Map();

        for (const record of this.records) {
            this._updateSummary(record);
            this._updateBreakdown(this.formatStats, record.apiFormat);
            this._updateBreakdown(this.categoryStats, record.requestCategory);
            this._updateAccountStats(record);
        }
    }

    _pushAttempt(tracker, authIndex, accountName) {
        const normalizedAccountName = this._normalizeAccountName(accountName);
        const accountKey = this._buildAccountKey(authIndex, normalizedAccountName);

        tracker.attemptCount += 1;
        tracker.attempts.push({ accountKey });
    }

    _updateSummary(record) {
        const durationMs = this._normalizeDurationMs(record.durationMs);
        this.summary.totalRequests += 1;
        this.summary.totalDurationMs += durationMs;

        if (record.outcome === "success") {
            this.summary.successCount += 1;
        } else if (record.outcome === "aborted") {
            this.summary.abortedCount += 1;
        } else {
            this.summary.errorCount += 1;
        }
    }

    _updateBreakdown(targetMap, key) {
        const currentKey = key || "unknown";
        const existing = targetMap.get(currentKey) || { count: 0, key: currentKey };
        existing.count += 1;
        targetMap.set(currentKey, existing);
    }

    _updateAccountStats(record) {
        const durationMs = this._normalizeDurationMs(record.durationMs);
        const accountKey = record.accountKey || this._buildAccountKey(record.finalAuthIndex, record.finalAccountName);
        const existing = this.accountStats.get(accountKey) || {
            abortedCount: 0,
            accountKey,
            accountName: record.finalAccountName,
            authIndex: record.finalAuthIndex,
            errorCount: 0,
            lastPath: null,
            lastUsedAt: record.finishedAt,
            modelCounts: {},
            successCount: 0,
            totalDurationMs: 0,
            totalRequests: 0,
        };

        existing.accountName = record.finalAccountName;
        existing.authIndex = record.finalAuthIndex;
        const modelKey = record.model || "unknown";
        existing.modelCounts[modelKey] = (existing.modelCounts[modelKey] || 0) + 1;
        existing.lastPath = record.path || existing.lastPath;
        existing.lastUsedAt = record.finishedAt;
        existing.totalDurationMs += durationMs;
        existing.totalRequests += 1;

        if (record.outcome === "success") {
            existing.successCount += 1;
        } else if (record.outcome === "aborted") {
            existing.abortedCount += 1;
        } else {
            existing.errorCount += 1;
        }

        this.accountStats.set(accountKey, existing);
    }

    _serializeBreakdown(sourceMap) {
        return Array.from(sourceMap.values()).sort((a, b) => b.count - a.count);
    }

    _normalizeOutcome(outcome) {
        if (outcome === "success" || outcome === "aborted") {
            return outcome;
        }
        return "error";
    }

    _normalizeDurationMs(value) {
        const durationMs = Number(value);
        return Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0;
    }

    _normalizeLoadedRecord(record) {
        return {
            ...record,
            durationMs: this._normalizeDurationMs(record?.durationMs),
            outcome: this._normalizeOutcome(record?.outcome),
            statusCode: Number.isFinite(Number(record?.statusCode)) ? Number(record.statusCode) : null,
        };
    }

    _normalizeAuthIndex(value) {
        return Number.isInteger(value) && value >= 0 ? value : null;
    }

    _normalizeAccountName(value) {
        if (typeof value !== "string") return null;
        const trimmed = value.trim();
        return trimmed ? trimmed : null;
    }

    _resolveAccountName(authIndex) {
        if (!this.authSource?.accountNameMap || authIndex === null) return null;
        return this._normalizeAccountName(this.authSource.accountNameMap.get(authIndex));
    }

    _buildAccountKey(authIndex, accountName) {
        if (authIndex === null) {
            return accountName ? `unassigned:${accountName}` : "unassigned";
        }

        return `${authIndex}:${accountName || "N/A"}`;
    }

    _parseAccountKey(accountKey) {
        if (!accountKey || accountKey === "unassigned") {
            return { accountName: null, authIndex: null };
        }
        const colonIdx = accountKey.indexOf(":");
        if (colonIdx === -1) {
            return { accountName: accountKey, authIndex: null };
        }
        const authIndex = Number(accountKey.slice(0, colonIdx));
        const accountName = accountKey.slice(colonIdx + 1);
        return { accountName, authIndex: Number.isFinite(authIndex) ? authIndex : null };
    }

    static createEmptySnapshot() {
        return {
            accounts: [],
            records: [],
            startedAt: null,
            summary: {
                abortedCount: 0,
                activeRequests: 0,
                avgDurationMs: 0,
                errorCount: 0,
                formatBreakdown: [],
                requestCategoryBreakdown: [],
                successCount: 0,
                successRate: 0,
                totalRequests: 0,
                uniqueAccountPairs: 0,
                uptimeSeconds: 0,
            },
        };
    }
}

module.exports = UsageStatsService;

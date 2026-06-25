/**
 * File: src/utils/StickyProxyManager.js
 * Description: Persistent per-account proxy assignment for Playwright browser contexts
 *
 * Supports proxylist.txt entries in these formats:
 * - user:pass@ip:port
 * - ip:port:user:pass
 * - ip:port
 * - http://user:pass@ip:port
 */

const fs = require("fs");
const path = require("path");

const DEFAULT_STICKY_PROXY_BYPASS = "127.0.0.1,localhost,0.0.0.0";

class StickyProxyManager {
    constructor(logger, authSource, options = {}) {
        this.logger = logger;
        this.authSource = authSource;
        this.proxyFilePath = options.proxyFilePath || path.join(process.cwd(), "proxylist.txt");
        this.mappingFilePath = options.mappingFilePath || path.join(process.cwd(), "proxy_mapping.json");
        this.proxyBypass = options.proxyBypass || process.env.STICKY_PROXY_BYPASS || DEFAULT_STICKY_PROXY_BYPASS;
        this._lastEnabledLogState = null;
        this._lastLoadedProxyCount = null;
        this._loggedBypass = false;
    }

    isEnabled() {
        return this._loadProxies().length > 0;
    }

    reserveProxyForNewAccount(label = "pending-vnc-account") {
        const proxies = this._loadProxies();
        if (proxies.length === 0) {
            if (fs.existsSync(this.proxyFilePath)) {
                throw new Error("Sticky proxy enabled but proxylist.txt does not contain any valid proxies.");
            }
            this._logEnabledState(false);
            return null;
        }

        this._logEnabledState(true);

        const accounts = this._getActiveAccountIdentities();
        const mapping = this._getProxyMapping(accounts, proxies);
        const usedProxies = new Set(Object.values(mapping));
        const proxyLine = proxies.find(candidate => !usedProxies.has(candidate));

        if (!proxyLine) {
            throw new Error(
                `Sticky proxy enabled but no free proxy is available for ${label}. ` +
                    "Add more entries to proxylist.txt or remove unused accounts."
            );
        }

        return {
            display: this._proxyDisplay(proxyLine),
            proxy: this.parseProxy(proxyLine),
            proxyLine,
        };
    }

    commitReservedProxyToAccount(proxyLine, accountName, authIndex = null) {
        const proxies = this._loadProxies();
        if (proxies.length === 0 || !proxyLine) {
            return false;
        }

        const trimmedProxyLine = String(proxyLine).trim();
        if (!proxies.includes(trimmedProxyLine)) {
            this.logger.warn(
                `[StickyProxy] VNC proxy ${this._proxyDisplay(
                    trimmedProxyLine
                )} is no longer present in proxylist.txt; mapping was not saved.`
            );
            return false;
        }

        const label = typeof accountName === "string" && accountName.trim() ? accountName.trim() : `auth-${authIndex}`;
        const accountKey = label.toLowerCase();
        const accounts = this._getActiveAccountIdentities();
        if (!accounts.some(account => account.key === accountKey)) {
            accounts.push({ authIndex, key: accountKey, label });
        }

        const mapping = this._getProxyMapping(accounts, proxies);
        const conflictingKey = Object.entries(mapping).find(
            ([key, value]) => key !== accountKey && value === trimmedProxyLine
        )?.[0];

        if (conflictingKey) {
            this.logger.warn(
                `[StickyProxy] VNC proxy ${this._proxyDisplay(
                    trimmedProxyLine
                )} is already assigned to "${conflictingKey}"; keeping existing mapping.`
            );
            return false;
        }

        mapping[accountKey] = trimmedProxyLine;
        this._saveMapping(mapping);
        this.logger.info(
            `[StickyProxy] Saved sticky proxy mapping for account "${label}"${
                authIndex !== null ? ` (#${authIndex})` : ""
            }: ${this._proxyDisplay(trimmedProxyLine)}`
        );
        return true;
    }

    getProxyForAuth(authIndex) {
        const proxies = this._loadProxies();
        if (proxies.length === 0) {
            this._logEnabledState(false);
            return null;
        }

        this._logEnabledState(true);

        const account = this._getAccountIdentity(authIndex);
        const accounts = this._getActiveAccountIdentities();
        if (!accounts.some(entry => entry.key === account.key)) {
            accounts.push(account);
        }

        const mapping = this._getProxyMapping(accounts, proxies);
        const proxyLine = mapping[account.key];

        if (!proxyLine) {
            throw new Error(
                `Sticky proxy enabled but no proxy is available for account "${account.label}" (#${authIndex}). ` +
                    `Add more entries to proxylist.txt.`
            );
        }

        const proxy = this.parseProxy(proxyLine);
        return {
            accountKey: account.key,
            display: this._proxyDisplay(proxyLine),
            proxy,
            proxyLine,
        };
    }

    reassignProxyForAuth(authIndex) {
        const proxies = this._loadProxies();
        if (proxies.length === 0) {
            return null;
        }

        const account = this._getAccountIdentity(authIndex);
        const accounts = this._getActiveAccountIdentities();
        if (!accounts.some(entry => entry.key === account.key)) {
            accounts.push(account);
        }

        const mapping = this._getProxyMapping(accounts, proxies);
        const usedProxies = new Set(
            Object.entries(mapping)
                .filter(([key]) => key !== account.key)
                .map(([, v]) => v)
        );
        const freeProxy = proxies.find(proxyLine => !usedProxies.has(proxyLine) && proxyLine !== mapping[account.key]);

        if (!freeProxy) {
            this.logger.warn(`[StickyProxy] No replacement proxy available for account "${account.label}".`);
            return null;
        }

        mapping[account.key] = freeProxy;
        this._saveMapping(mapping);
        this.logger.warn(
            `[StickyProxy] Reassigned account "${account.label}" (#${authIndex}) to proxy ${this._proxyDisplay(
                freeProxy
            )}.`
        );

        return {
            accountKey: account.key,
            display: this._proxyDisplay(freeProxy),
            proxy: this.parseProxy(freeProxy),
            proxyLine: freeProxy,
        };
    }

    isProxyError(error) {
        const message = String(error?.message || error || "").toLowerCase();
        return [
            "proxy",
            "tunnel",
            "connect",
            "connection refused",
            "connection reset",
            "econnrefused",
            "econnreset",
            "etimedout",
            "timeout",
            "socket hang up",
            "ns_error_proxy",
            "ns_error_net_timeout",
            "err_proxy_connection_failed",
            "err_tunnel_connection_failed",
        ].some(signal => message.includes(signal));
    }

    parseProxy(proxyLine) {
        const raw = String(proxyLine || "").trim();
        if (!raw) {
            throw new Error("Empty proxy line");
        }

        if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
            return this._parseProxyUrl(raw);
        }

        if (raw.includes("@")) {
            const atIndex = raw.lastIndexOf("@");
            const auth = raw.slice(0, atIndex);
            const address = raw.slice(atIndex + 1);
            const colonIndex = auth.indexOf(":");

            if (colonIndex === -1) {
                throw new Error(`Invalid proxy auth format: ${raw}`);
            }

            const username = auth.slice(0, colonIndex);
            const password = auth.slice(colonIndex + 1);
            const { host, port } = this._splitHostPort(address, raw);
            return this._withBypass({
                password,
                server: `http://${host}:${port}`,
                username,
            });
        }

        const parts = raw.split(":");
        if (parts.length === 4) {
            const [host, port, username, password] = parts;
            return this._withBypass({
                password,
                server: `http://${host}:${port}`,
                username,
            });
        }

        if (parts.length === 2) {
            const [host, port] = parts;
            return this._withBypass({
                server: `http://${host}:${port}`,
            });
        }

        throw new Error(`Invalid proxy format: ${raw}`);
    }

    _withBypass(proxy) {
        if (!this.proxyBypass) {
            return proxy;
        }
        return {
            ...proxy,
            bypass: this.proxyBypass,
        };
    }

    _parseProxyUrl(raw) {
        const parsed = new URL(raw);
        if (!parsed.hostname || !parsed.port) {
            throw new Error(`Invalid proxy URL: ${raw}`);
        }

        const proxy = {
            server: `${parsed.protocol}//${parsed.hostname}:${parsed.port}`,
        };

        if (parsed.username) {
            proxy.username = decodeURIComponent(parsed.username);
        }
        if (parsed.password) {
            proxy.password = decodeURIComponent(parsed.password);
        }

        return this._withBypass(proxy);
    }

    _splitHostPort(address, originalLine) {
        const parts = address.split(":");
        if (parts.length !== 2 || !parts[0] || !parts[1]) {
            throw new Error(`Invalid proxy address format: ${originalLine}`);
        }
        return { host: parts[0], port: parts[1] };
    }

    _loadProxies() {
        if (!fs.existsSync(this.proxyFilePath)) {
            return [];
        }

        try {
            const seen = new Set();
            const proxies = [];
            const lines = fs.readFileSync(this.proxyFilePath, "utf-8").split(/\r?\n/);

            for (const line of lines) {
                const proxyLine = line.trim();
                if (!proxyLine || proxyLine.startsWith("#")) {
                    continue;
                }
                if (seen.has(proxyLine)) {
                    continue;
                }
                try {
                    this.parseProxy(proxyLine);
                } catch (error) {
                    this.logger.warn(`[StickyProxy] Ignoring invalid proxy line "${proxyLine}": ${error.message}`);
                    continue;
                }
                seen.add(proxyLine);
                proxies.push(proxyLine);
            }

            this._logLoadedProxyCount(proxies.length);
            return proxies;
        } catch (error) {
            this.logger.warn(`[StickyProxy] Failed to read proxylist.txt: ${error.message}`);
            return [];
        }
    }

    _loadMapping() {
        if (!fs.existsSync(this.mappingFilePath)) {
            return {};
        }

        try {
            const mapping = JSON.parse(fs.readFileSync(this.mappingFilePath, "utf-8"));
            return mapping && typeof mapping === "object" && !Array.isArray(mapping) ? mapping : {};
        } catch (error) {
            this.logger.warn(`[StickyProxy] Failed to read proxy_mapping.json, starting fresh: ${error.message}`);
            return {};
        }
    }

    _saveMapping(mapping) {
        const tmpPath = `${this.mappingFilePath}.tmp`;
        fs.writeFileSync(tmpPath, JSON.stringify(mapping, null, 2));
        fs.renameSync(tmpPath, this.mappingFilePath);
    }

    _getProxyMapping(accounts, proxies) {
        const mapping = this._loadMapping();
        const availableProxies = new Set(proxies);
        const activeAccounts = new Set(accounts.map(account => account.key));
        let changed = false;

        for (const key of Object.keys(mapping)) {
            if (!activeAccounts.has(key) || !availableProxies.has(mapping[key])) {
                delete mapping[key];
                changed = true;
            }
        }

        const usedProxies = new Set(Object.values(mapping));
        const freeProxies = proxies.filter(proxyLine => !usedProxies.has(proxyLine));
        let assignedCount = 0;

        for (const account of accounts) {
            if (mapping[account.key]) {
                continue;
            }
            if (freeProxies.length === 0) {
                break;
            }
            mapping[account.key] = freeProxies.shift();
            assignedCount++;
            changed = true;
        }

        if (assignedCount > 0) {
            this.logger.info(`[StickyProxy] Assigned proxies to ${assignedCount} new account(s).`);
        }

        if (changed) {
            this._saveMapping(mapping);
        }

        return mapping;
    }

    _getActiveAccountIdentities() {
        const indices = Array.isArray(this.authSource?.availableIndices) ? this.authSource.availableIndices : [];
        return indices
            .filter(index => !this.authSource?.isExpired?.(index))
            .map(index => this._getAccountIdentity(index));
    }

    _getAccountIdentity(authIndex) {
        const authData = this.authSource?.getAuth?.(authIndex);
        const rawName = typeof authData?.accountName === "string" ? authData.accountName.trim() : "";
        const key = rawName ? rawName.toLowerCase() : `auth-${authIndex}`;
        const label = rawName || `auth-${authIndex}`;
        return { authIndex, key, label };
    }

    _proxyDisplay(proxyLine) {
        const raw = String(proxyLine || "").trim();
        if (!raw) return "N/A";
        if (raw.includes("@")) {
            return raw.slice(raw.lastIndexOf("@") + 1);
        }
        if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
            try {
                const parsed = new URL(raw);
                return `${parsed.hostname}:${parsed.port}`;
            } catch (error) {
                return raw;
            }
        }

        const parts = raw.split(":");
        if (parts.length === 4) {
            return `${parts[0]}:${parts[1]}`;
        }
        return raw;
    }

    _logEnabledState(enabled) {
        if (this._lastEnabledLogState === enabled) {
            return;
        }
        this._lastEnabledLogState = enabled;
        if (enabled) {
            this.logger.info("[StickyProxy] proxylist.txt detected; per-account sticky proxies are enabled.");
            if (!this._loggedBypass) {
                this._loggedBypass = true;
                this.logger.info(`[StickyProxy] Proxy bypass list: ${this.proxyBypass || "(none)"}`);
            }
        }
    }

    _logLoadedProxyCount(count) {
        if (count <= 0 || this._lastLoadedProxyCount === count) {
            return;
        }
        this._lastLoadedProxyCount = count;
        this.logger.info(`[StickyProxy] Loaded ${count} proxies from proxylist.txt.`);
    }
}

module.exports = StickyProxyManager;

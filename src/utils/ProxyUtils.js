/**
 * File: src/utils/ProxyUtils.js
 * Description: Utility functions for parsing proxy configuration from environment variables
 *
 * Author: iBenzene, bbbugg
 */

/**
 * Parse proxy configuration from environment variables
 * Supports HTTPS_PROXY, HTTP_PROXY, ALL_PROXY and their lowercase variants
 * Also supports NO_PROXY for bypass rules
 *
 * @returns {Object|null} Proxy config object for Playwright, or null if no proxy configured
 * @example
 * // Returns: { server: "http://127.0.0.1:7890", bypass: "localhost,127.0.0.1" }
 * // Or with auth: { server: "http://proxy.com:8080", username: "user", password: "pass" }
 */
const parseProxyFromEnv = () => {
    const serverRaw =
        process.env.HTTPS_PROXY ||
        process.env.https_proxy ||
        process.env.HTTP_PROXY ||
        process.env.http_proxy ||
        process.env.ALL_PROXY ||
        process.env.all_proxy;

    if (!serverRaw) return null;

    const bypassRaw = process.env.NO_PROXY || process.env.no_proxy;

    // Default bypass list for local connections
    const defaultBypass = ["localhost", "127.0.0.1", "::1", "0.0.0.0"];
    let finalBypass = [...defaultBypass];

    if (bypassRaw) {
        const userBypass = bypassRaw
            .split(",")
            .map(s => s.trim())
            .filter(Boolean);
        finalBypass = [...new Set([...defaultBypass, ...userBypass])];
    } else {
        // If user didn't specify NO_PROXY, we should at least bypass local addresses
        // to prevent WebSocket connection failures when proxy is set.
    }

    const bypassString = finalBypass.join(",");

    // Playwright expects: { server, bypass?, username?, password? }
    // server examples: "http://127.0.0.1:7890", "socks5://127.0.0.1:7890"
    try {
        const u = new URL(serverRaw);
        const proxy = {
            bypass: bypassString,
            server: `${u.protocol}//${u.host}`,
        };

        if (u.username) proxy.username = decodeURIComponent(u.username);
        if (u.password) proxy.password = decodeURIComponent(u.password);

        return proxy;
    } catch {
        // If URL parsing fails, use raw value directly
        const proxy = {
            bypass: bypassString,
            server: serverRaw,
        };
        return proxy;
    }
};

module.exports = { parseProxyFromEnv };

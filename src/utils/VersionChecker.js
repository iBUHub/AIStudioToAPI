/**
 * File: src/utils/VersionChecker.js
 * Description: Checks for new versions by querying GitHub Tags API
 *
 * Author: Ellinav, iBenzene, bbbugg
 */

const axios = require("axios");

/**
 * VersionChecker
 * Checks GitHub for latest version and compares with current
 */
class VersionChecker {
    constructor(logger) {
        this.logger = logger;
        this.repoOwner = "iBUHub";
        this.repoName = "AIStudioToAPI";
    }

    /**
     * Get current app version from build-time injection or package.json
     */
    getCurrentVersion() {
        // Try environment variable first (set during Docker build)
        if (process.env.VERSION) {
            return process.env.VERSION;
        }
        // Fall back to package.json
        try {
            const packageJson = require("../../package.json");
            return packageJson.version;
        } catch {
            return "unknown";
        }
    }

    /**
     * Parse version string to comparable format
     * @param {string} version - Version like "v0.2.9" or "0.2.9"
     * @returns {number[]} Array of version parts [major, minor, patch]
     */
    parseVersion(version) {
        const cleaned = version.replace(/^v/, "");
        const parts = cleaned.split(".").map(p => parseInt(p, 10) || 0);
        return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
    }

    /**
     * Compare two versions
     * @returns {number} 1 if a > b, -1 if a < b, 0 if equal
     */
    compareVersions(a, b) {
        const [aMajor, aMinor, aPatch] = this.parseVersion(a);
        const [bMajor, bMinor, bPatch] = this.parseVersion(b);

        if (aMajor !== bMajor) return aMajor > bMajor ? 1 : -1;
        if (aMinor !== bMinor) return aMinor > bMinor ? 1 : -1;
        if (aPatch !== bPatch) return aPatch > bPatch ? 1 : -1;
        return 0;
    }

    /**
     * Check if Docker image exists on GHCR
     * @param {string} tag - Tag to check
     * @returns {Promise<boolean>}
     */
    async checkDockerImageExists(tag) {
        const image = "ibuhub/aistudio-to-api";
        const registry = "ghcr.io";
        const manifestUrl = `https://${registry}/v2/${image}/manifests/${tag}`;

        try {
            // 1. Try to fetch manifest (expecting 401 first)
            try {
                await axios.head(manifestUrl, { timeout: 5000 });
                return true;
            } catch (error) {
                if (error.response && error.response.status === 401) {
                    // Auth required, parse header
                    const authHeader = error.response.headers["www-authenticate"];
                    if (!authHeader) return false;

                    const realmMatch = authHeader.match(/realm="([^"]+)"/);
                    const serviceMatch = authHeader.match(/service="([^"]+)"/);
                    const scopeMatch = authHeader.match(/scope="([^"]+)"/);

                    if (!realmMatch || !serviceMatch) return false;

                    const realm = realmMatch[1];
                    const service = serviceMatch[1];
                    const scope = scopeMatch ? scopeMatch[1] : `repository:${image}:pull`;

                    // Get token
                    const tokenResponse = await axios.get(realm, {
                        params: { scope, service },
                        timeout: 5000,
                    });
                    const token = tokenResponse.data.token;

                    // Retry with token
                    const res = await axios.head(manifestUrl, {
                        headers: { Authorization: `Bearer ${token}` },
                        timeout: 5000,
                    });

                    return res.status === 200;
                } else if (error.response && error.response.status === 404) {
                    return false;
                }
                throw error; // Other errors
            }
        } catch (error) {
            this.logger?.warn(`[VersionChecker] Failed to check Docker image for ${tag}: ${error.message}`);
            return false;
        }
    }

    /**
     * Check for updates
     * @returns {Promise<object>}
     */
    /**
     * Fetch all version tags from GitHub
     * @returns {Promise<Array<{name: string, url: string}>>}
     */
    async fetchTags() {
        try {
            const response = await axios.get(`https://api.github.com/repos/${this.repoOwner}/${this.repoName}/tags`, {
                headers: {
                    Accept: "application/vnd.github.v3+json",
                    "User-Agent": "AIStudioToAPI-VersionChecker",
                },
                timeout: 10000,
            });

            const tags = response.data || [];

            // Filter: only v* tags, exclude preview-*
            const versionTags = tags.filter(tag => tag.name.startsWith("v") && !tag.name.includes("preview"));

            // Sort by version (descending)
            versionTags.sort((a, b) => this.compareVersions(b.name, a.name));

            return versionTags.map(tag => ({
                name: tag.name,
                url: `https://github.com/${this.repoOwner}/${this.repoName}/releases/tag/${tag.name}`,
            }));
        } catch (error) {
            this.logger?.warn(`[VersionChecker] Failed to fetch tags: ${error.message}`);
            return [];
        }
    }

    /**
     * Check for updates
     * @returns {Promise<object>}
     */
    async checkForUpdates() {
        const current = this.getCurrentVersion();
        const allTags = await this.fetchTags();

        if (allTags.length === 0) {
            return {
                current,
                error: "Unable to fetch tags",
                hasUpdate: false,
                latest: null,
                releaseUrl: null,
            };
        }

        // Filter tags that are strictly newer than current
        const newerTags = allTags.filter(tag => this.compareVersions(tag.name, current) > 0);

        if (newerTags.length === 0) {
            return {
                current,
                hasUpdate: false,
                latest: current,
                releaseUrl: null,
            };
        }

        this.logger?.debug(
            `[VersionChecker] Found ${newerTags.length} newer tags. Checking Docker image availability...`
        );

        // Iterate through newer tags to find the first one with an available Docker image
        for (const tagInfo of newerTags) {
            const imageExists = await this.checkDockerImageExists(tagInfo.name);

            if (imageExists) {
                this.logger?.info(
                    `[VersionChecker] New version available and Docker image ready: ${tagInfo.name} (current: ${current})`
                );
                return {
                    current,
                    hasUpdate: true,
                    latest: tagInfo.name,
                    releaseUrl: tagInfo.url,
                };
            }

            this.logger?.debug(
                `[VersionChecker] Tag ${tagInfo.name} exists but Docker image is not yet available. Checking next...`
            );
        }

        this.logger?.debug(`[VersionChecker] No newer versions have available Docker images yet.`);

        return {
            current,
            hasUpdate: false,
            latest: current,
            releaseUrl: null,
        };
    }
}

module.exports = VersionChecker;

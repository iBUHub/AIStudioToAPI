/**
 * File: src/core/BrowserManager.js
 * Description: Browser manager for launching and controlling headless Firefox instances with authentication contexts
 *
 * Author: Ellinav, iBenzene, bbbugg, 挈挈
 */

const fs = require("fs");
const path = require("path");
const { firefox, devices } = require("playwright");
const os = require("os");

const { parseProxyFromEnv } = require("../utils/ProxyUtils");

/**
 * Browser Manager Module
 * Responsible for launching, managing, and switching browser contexts
 */
class BrowserManager {
    constructor(logger, config, authSource) {
        this.logger = logger;
        this.config = config;
        this.authSource = authSource;
        this.browser = null;

        // Multi-context architecture: Store all initialized contexts
        // Map: authIndex -> {context, page, healthMonitorInterval}
        this.contexts = new Map();

        // Context pool state tracking
        this.initializingContexts = new Set(); // Indices currently being initialized in background
        this.abortedContexts = new Set(); // Indices that should be aborted during background init
        this._backgroundPreloadTask = null; // Current background preload task promise (only one at a time)
        this._backgroundPreloadAbort = false; // Flag to signal background task to abort

        // Legacy single context references (for backward compatibility)
        this.context = null;
        this.page = null;

        // currentAuthIndex is the single source of truth for current account, accessed via getter/setter
        // -1 means no account is currently active (invalid/error state)
        this._currentAuthIndex = -1;

        // Flag to distinguish intentional close from unexpected disconnect
        // Used by ConnectionRegistry callback to skip unnecessary reconnect attempts
        this.isClosingIntentionally = false;

        // Background wakeup service status (instance-level, tracks this.page)
        // Prevents multiple BackgroundWakeup instances from running simultaneously
        this.backgroundWakeupRunning = false;

        // Added for background wakeup logic from new core
        this.noButtonCount = 0;

        // WebSocket initialization state per context - prevents cross-contamination
        // between concurrent init/reconnect operations on different accounts
        // Map: authIndex -> { success: boolean, failed: boolean }
        this._wsInitState = new Map();

        // Target URL for AI Studio app
        this.targetUrl = "https://ai.studio/apps/63257911-1f2c-441d-8022-effaa4ca4580";

        // Firefox/Camoufox does not use Chromium-style command line args.
        // We keep this empty; Camoufox has its own anti-fingerprinting optimizations built-in.
        this.launchArgs = [];

        // Firefox-specific preferences for optimization (passed to firefox.launch)
        this.firefoxUserPrefs = {
            "app.update.enabled": false, // Disable auto updates
            "browser.cache.disk.enable": false, // Disable disk cache
            "browser.ping-centre.telemetry": false, // Disable ping telemetry
            "browser.safebrowsing.enabled": false, // Disable safe browsing
            "browser.safebrowsing.malware.enabled": false, // Disable malware check
            "browser.safebrowsing.phishing.enabled": false, // Disable phishing check
            "browser.search.update": false, // Disable search engine auto-update
            "browser.shell.checkDefaultBrowser": false, // Skip default browser check
            "browser.tabs.warnOnClose": false, // No warning on closing tabs
            "datareporting.policy.dataSubmissionEnabled": false, // Disable data reporting
            "dom.webnotifications.enabled": false, // Disable notifications
            "extensions.update.enabled": false, // Disable extension auto-update
            "general.smoothScroll": false, // Disable smooth scrolling
            "gfx.webrender.all": false, // Disable WebRender (GPU-based renderer)
            "layers.acceleration.disabled": true, // Disable GPU hardware acceleration
            "media.autoplay.default": 5, // 5 = Block all autoplay
            "media.volume_scale": "0.0", // Mute audio
            "network.dns.disablePrefetch": true, // Disable DNS prefetching
            "network.http.speculative-parallel-limit": 0, // Disable speculative connections
            "network.prefetch-next": false, // Disable link prefetching
            "permissions.default.geo": 0, // 0 = Always deny geolocation
            "services.sync.enabled": false, // Disable Firefox Sync
            "toolkit.cosmeticAnimations.enabled": false, // Disable UI animations
            "toolkit.telemetry.archive.enabled": false, // Disable telemetry archive
            "toolkit.telemetry.enabled": false, // Disable telemetry
            "toolkit.telemetry.unified": false, // Disable unified telemetry
        };

        if (this.config.browserExecutablePath) {
            this.browserExecutablePath = this.config.browserExecutablePath;
        } else {
            const platform = os.platform();
            if (platform === "linux") {
                this.browserExecutablePath = path.join(process.cwd(), "camoufox-linux", "camoufox");
            } else if (platform === "win32") {
                this.browserExecutablePath = path.join(process.cwd(), "camoufox", "camoufox.exe");
            } else if (platform === "darwin") {
                this.browserExecutablePath = path.join(
                    process.cwd(),
                    "camoufox-macos",
                    "Camoufox.app",
                    "Contents",
                    "MacOS",
                    "camoufox"
                );
            } else {
                throw new Error(`Unsupported operating system: ${platform}`);
            }
        }
    }

    get currentAuthIndex() {
        return this._currentAuthIndex;
    }

    set currentAuthIndex(value) {
        this._currentAuthIndex = value;
    }

    /**
     * Helper: Check for page errors that require refresh
     * @returns {Object} Object with error flags
     */
    async _checkPageErrors(page) {
        try {
            return await page.evaluate(() => {
                // eslint-disable-next-line no-undef
                const bodyText = document.body.innerText || "";
                return {
                    appletFailed: bodyText.includes("Failed to initialize applet"),
                    concurrentUpdates:
                        bodyText.includes("There are concurrent updates") || bodyText.includes("concurrent updates"),
                    snapshotFailed:
                        bodyText.includes("Failed to create snapshot") || bodyText.includes("Please try again"),
                };
            });
        } catch (e) {
            return { appletFailed: false, concurrentUpdates: false, snapshotFailed: false };
        }
    }

    /**
     * Helper: Wait for WebSocket initialization with log monitoring
     * Supports abort for background tasks and context deletion
     * @param {object} page - Playwright page object
     * @param {string} logPrefix - Log prefix for messages
     * @param {number} timeout - Timeout in milliseconds (default 60000)
     * @param {number} authIndex - Auth index for this context (default -1)
     * @param {boolean} isBackgroundTask - Whether this is a background preload task (default false)
     * @returns {Promise<boolean>} true if initialization succeeded, false if failed or aborted
     */
    async _waitForWebSocketInit(
        page,
        logPrefix = "[Browser]",
        timeout = 60000,
        authIndex = -1,
        isBackgroundTask = false
    ) {
        this.logger.info(`${logPrefix} ⏳ Waiting for WebSocket initialization (timeout: ${timeout / 1000}s)...`);

        const startTime = Date.now();
        const checkInterval = 1000; // Check every 1 second

        try {
            while (Date.now() - startTime < timeout) {
                // Check if this specific context was marked for abort
                if (this.abortedContexts.has(authIndex)) {
                    this.logger.info(`${logPrefix} WebSocket wait aborted (context marked for deletion)`);
                    return false;
                }

                // Check if background preload was aborted (only for background tasks)
                if (isBackgroundTask && this._backgroundPreloadAbort) {
                    this.logger.info(`${logPrefix} WebSocket wait aborted (background preload aborted)`);
                    return false;
                }

                // Read state fresh each iteration
                const state = this._wsInitState.get(authIndex);

                // Check if initialization succeeded
                if (state && state.success) {
                    return true;
                }

                // Check if initialization failed
                if (state && state.failed) {
                    this.logger.warn(`${logPrefix} Initialization failed`);
                    return false;
                }

                // Check for page errors
                const errors = await this._checkPageErrors(page);
                if (errors.appletFailed || errors.concurrentUpdates || errors.snapshotFailed) {
                    this.logger.warn(`${logPrefix} Detected page error: ${JSON.stringify(errors)}`);
                    return false;
                }

                // Wait before next check
                await page.waitForTimeout(checkInterval);
            }

            // Timeout reached
            this.logger.error(`${logPrefix} ⏱️ WebSocket initialization timeout after ${timeout / 1000}s`);
            return false;
        } catch (error) {
            this.logger.error(`${logPrefix} Error during WebSocket initialization wait: ${error.message}`);
            return false;
        }
    }

    /**
     * Feature: Update authentication file
     * Writes the current storageState back to the auth file, effectively extending session validity.
     * @param {number} authIndex - The auth index to update
     */
    async _updateAuthFile(authIndex) {
        // Retrieve the target account's context from the multi-context Map to avoid cross-contamination of auth data by using this.context
        const contextData = this.contexts.get(authIndex);
        if (!contextData || !contextData.context) return;

        // Check availability of auto-update feature from config
        if (!this.config.enableAuthUpdate) {
            return;
        }

        try {
            const configDir = path.join(process.cwd(), "configs", "auth");
            const authFilePath = path.join(configDir, `auth-${authIndex}.json`);

            // Read original file content to preserve all fields (e.g. accountName, custom fields)
            // Relies on AuthSource validation (checks valid index AND file existence)
            const authData = this.authSource.getAuth(authIndex);
            if (!authData) {
                this.logger.warn(
                    `[Auth Update] Auth source #${authIndex} returned no data (invalid index or file missing), skipping update.`
                );
                return;
            }

            const storageState = await contextData.context.storageState();

            // Merge new credentials into existing data
            authData.cookies = storageState.cookies;
            authData.origins = storageState.origins;

            // Note: We do NOT force-set accountName. If it was there, it stays; if not, it remains missing.
            // This preserves the "missing state" as requested.

            // Overwrite the file with merged data
            await fs.promises.writeFile(authFilePath, JSON.stringify(authData, null, 2));

            this.logger.info(`[Auth Update] 💾 Successfully updated auth credentials for account #${authIndex}`);
        } catch (error) {
            this.logger.error(`[Auth Update] ❌ Failed to update auth file: ${error.message}`);
        }
    }

    /**
     * Get pool target indices based on current account and rotation order
     * @param {number} maxContexts - Max pool size (0 = unlimited)
     * @returns {number[]} Target indices for the pool
     */
    // _getPoolTargetIndices(maxContexts) {
    //     const rotation = this.authSource.getRotationIndices();
    //     if (rotation.length === 0) return [];
    //     if (maxContexts === 0 || maxContexts >= rotation.length) return [...rotation];
    //
    //     const currentCanonical =
    //         this._currentAuthIndex >= 0 ? this.authSource.getCanonicalIndex(this._currentAuthIndex) : null;
    //     const startPos = currentCanonical !== null ? rotation.indexOf(currentCanonical) : -1;
    //     const start = startPos >= 0 ? startPos : 0;
    //
    //     const result = [];
    //     for (let i = 0; i < maxContexts && i < rotation.length; i++) {
    //         result.push(rotation[(start + i) % rotation.length]);
    //     }
    //     return result;
    // }

    /**
     * Interface: Notify user activity
     * Used to force wake up the Launch detection when a request comes in
     */
    notifyUserActivity() {
        if (this.noButtonCount > 0) {
            this.logger.info("[Browser] ⚡ User activity detected, forcing Launch detection wakeup...");
            this.noButtonCount = 0;
        }
    }

    /**
     * Helper: Generate a consistent numeric seed from a string
     * Used to keep fingerprints consistent for the same account index
     */
    _generateIdentitySeed(str) {
        let hashValue = 0;
        for (let i = 0; i < str.length; i++) {
            const charCode = str.charCodeAt(i);
            hashValue = (hashValue << 5) - hashValue + charCode;
            hashValue |= 0; // Convert to 32bit integer
        }
        return Math.abs(hashValue);
    }

    /**
     * Feature: Generate Privacy Protection Script (Stealth Mode)
     * Injects specific GPU info and masks webdriver properties to avoid bot detection.
     */
    _getPrivacyProtectionScript(authIndex) {
        let seedSource = `account_salt_${authIndex}`;

        // Attempt to use accountName (email) for better consistency across index reordering
        try {
            const authData = this.authSource.getAuth(authIndex);
            if (authData && authData.accountName && typeof authData.accountName === "string") {
                const cleanName = authData.accountName.trim().toLowerCase();
                if (cleanName.length > 0) {
                    seedSource = `account_email_${cleanName}`;
                }
            }
        } catch (e) {
            // Fallback to index-based seed if auth data read fails
        }

        // Use a consistent seed so the fingerprint remains static for this specific account
        let seed = this._generateIdentitySeed(seedSource);

        // Pseudo-random generator based on the seed
        const deterministicRandom = () => {
            const x = Math.sin(seed++) * 10000;
            return x - Math.floor(x);
        };

        // Select a GPU profile consistent with this account
        const gpuProfiles = [
            { renderer: "Intel Iris OpenGL Engine", vendor: "Intel Inc." },
            {
                renderer: "ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)",
                vendor: "Google Inc. (NVIDIA)",
            },
            {
                renderer: "ANGLE (AMD, AMD Radeon RX 580 Series Direct3D11 vs_5_0 ps_5_0, D3D11)",
                vendor: "Google Inc. (AMD)",
            },
        ];
        const profile = gpuProfiles[Math.floor(deterministicRandom() * gpuProfiles.length)];

        // We inject a noise variable to make the environment unique but stable
        const randomArtifact = Math.floor(deterministicRandom() * 1000);

        return `
            (function() {
                if (window._privacyProtectionInjected) return;
                window._privacyProtectionInjected = true;

                try {
                    // 1. Mask WebDriver property
                    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

                    // 2. Mock Plugins if empty
                    if (navigator.plugins.length === 0) {
                        Object.defineProperty(navigator, 'plugins', {
                            get: () => new Array(${3 + Math.floor(deterministicRandom() * 3)}),
                        });
                    }

                    // 3. Spoof WebGL Renderer (High Impact)
                    const getParameterProxy = WebGLRenderingContext.prototype.getParameter;
                    WebGLRenderingContext.prototype.getParameter = function(parameter) {
                        // 37445: UNMASKED_VENDOR_WEBGL
                        // 37446: UNMASKED_RENDERER_WEBGL
                        if (parameter === 37445) return '${profile.vendor}';
                        if (parameter === 37446) return '${profile.renderer}';
                        return getParameterProxy.apply(this, arguments);
                    };

                    // 4. Inject benign noise
                    window['_canvas_noise_${randomArtifact}'] = '${randomArtifact}';

                    if (window === window.top) {
                        console.log("[ProxyClient] Privacy protection layer active: ${profile.renderer}");

                        // PostMessage responder for authIndex requests from cross-origin iframes
                        // Injected via addInitScript so it's ready BEFORE any iframe loads (no race condition)
                        window.addEventListener('message', function(event) {
                            if (event.data && event.data.type === 'requestAuthIndex') {
                                console.log('[BrowserManager] Received authIndex request, responding with: ${authIndex}');
                                event.source.postMessage({
                                    type: 'authIndexResponse',
                                    authIndex: ${authIndex}
                                }, '*');
                            }
                        });
                    }
                } catch (err) {
                    console.error("[ProxyClient] Failed to inject privacy script", err);
                }
            })();
        `;
    }

    /**
     * Feature: Natural Mouse Movement
     * Simulates human-like mouse jitters instead of instant teleportation
     */
    async _simulateHumanMovement(page, targetX, targetY) {
        try {
            // Split movement into 3 segments with random deviations
            const steps = 3;
            for (let i = 1; i <= steps; i++) {
                const intermediateX = targetX + (Math.random() - 0.5) * (100 / i);
                const intermediateY = targetY + (Math.random() - 0.5) * (100 / i);

                // Final step must be precise
                const destX = i === steps ? targetX : intermediateX;
                const destY = i === steps ? targetY : intermediateY;

                await page.mouse.move(destX, destY, {
                    steps: 5 + Math.floor(Math.random() * 5), // Optimized speed (was 10-20)
                });
            }
        } catch (e) {
            // Ignore movement errors if page is closed
        }
    }

    /**
     * Feature: Smart "Code" Button Clicking
     * Tries multiple selectors (Code, Develop, Edit, Icons) to be robust against UI changes.
     */
    // async _smartClickCode(page) {
    //     const selectors = [
    //         // Priority 1: Exact text match (Fastest)
    //         'button:text("Code")',
    //         // Priority 2: Alternative texts used by Google
    //         'button:text("Develop")',
    //         'button:text("Edit")',
    //         // Priority 3: Fuzzy attribute matching
    //         'button[aria-label*="Code"]',
    //         'button[aria-label*="code"]',
    //         // Priority 4: Icon based
    //         'button mat-icon:text("code")',
    //         'button span:has-text("Code")',
    //     ];
    //
    //     this.logger.info('[Browser] Trying to locate "Code" entry point using smart selectors...');
    //
    //     for (const selector of selectors) {
    //         try {
    //             // Use a short timeout for quick fail-over
    //             const element = page.locator(selector).first();
    //             if (await element.isVisible({ timeout: 2000 })) {
    //                 this.logger.info(`[Browser] ✅ Smart match: "${selector}", clicking...`);
    //                 // Direct click with force as per new logic
    //                 await element.click({ force: true, timeout: 10000 });
    //                 return true;
    //             }
    //         } catch (e) {
    //             // Ignore timeout for single selector, try next
    //         }
    //     }
    //
    //     throw new Error('Unable to find "Code" button or alternatives (Smart Click Failed)');
    // }

    /**
     * Helper: Load and configure build.js script content
     * Applies environment-specific configurations (TARGET_DOMAIN, LOG_LEVEL)
     * @returns {string} Configured build.js script content
     */
    // _loadAndConfigureBuildScript() {
    //     let buildScriptContent = fs.readFileSync(
    //         path.join(__dirname, "..", "..", "scripts", "client", "build.js"),
    //         "utf-8"
    //     );
    //
    //     if (process.env.TARGET_DOMAIN) {
    //         const lines = buildScriptContent.split("\n");
    //         let domainReplaced = false;
    //         for (let i = 0; i < lines.length; i++) {
    //             if (lines[i].includes("this.targetDomain =")) {
    //                 this.logger.info(`[Config] Found targetDomain line: ${lines[i]}`);
    //                 lines[i] = `        this.targetDomain = "${process.env.TARGET_DOMAIN}";`;
    //                 this.logger.info(`[Config] Replaced with: ${lines[i]}`);
    //                 domainReplaced = true;
    //                 break;
    //             }
    //         }
    //         if (domainReplaced) {
    //             buildScriptContent = lines.join("\n");
    //         } else {
    //             this.logger.warn("[Config] Failed to find targetDomain line in build.js, ignoring.");
    //         }
    //     }
    //
    //     if (process.env.WS_PORT) {
    //         // WS_PORT environment variable is no longer supported
    //         this.logger.error(
    //             `[Config] ❌ WS_PORT environment variable is deprecated and no longer supported. ` +
    //                 `The WebSocket port is now fixed at 9998. Please remove WS_PORT from your .env file.`
    //         );
    //         // Do not modify the default WS_PORT - keep it at 9998
    //     }
    //
    //     // Inject LOG_LEVEL configuration into build.js
    //     // Read from LoggingService.currentLevel instead of environment variable
    //     // This ensures runtime log level changes are respected when browser restarts
    //     const LoggingService = require("../utils/LoggingService");
    //     const currentLogLevel = LoggingService.currentLevel; // 0=DEBUG, 1=INFO, 2=WARN, 3=ERROR
    //     const currentLogLevelName = LoggingService.getLevel(); // "DEBUG", "INFO", etc.
    //
    //     if (currentLogLevel !== 1) {
    //         const lines = buildScriptContent.split("\n");
    //         let levelReplaced = false;
    //         for (let i = 0; i < lines.length; i++) {
    //             // Match "currentLevel: <number>," pattern, ignoring comments
    //             // This is more robust than looking for specific comments like "// Default: INFO"
    //             if (/^\s*currentLevel:\s*\d+/.test(lines[i])) {
    //                 this.logger.info(`[Config] Found LOG_LEVEL config line: ${lines[i]}`);
    //                 lines[i] = `    currentLevel: ${currentLogLevel}, // Injected: ${currentLogLevelName}`;
    //                 this.logger.info(`[Config] Replaced with: ${lines[i]}`);
    //                 levelReplaced = true;
    //                 break;
    //             }
    //         }
    //         if (levelReplaced) {
    //             buildScriptContent = lines.join("\n");
    //         } else {
    //             this.logger.warn("[Config] Failed to find LOG_LEVEL config line in build.js, using default INFO.");
    //         }
    //     }
    //
    //     return buildScriptContent;
    // }

    /**
     * Activate a context as the current one: update legacy references, reset wakeup state,
     * and start background services (health monitor + wakeup + active trigger).
     * @param {object} ctx - The browser context object
     * @param {object} pg - The page object
     * @param {number} authIndex - The auth index being activated
     */
    _activateContext(ctx, pg, authIndex) {
        this.context = ctx;
        this.page = pg;
        this._currentAuthIndex = authIndex;
        this.noButtonCount = 0;
        this._startHealthMonitor();
        this._startBackgroundWakeup();
        this._sendActiveTrigger("[Browser]");
    }

    /**
     * Helper: Send active trigger
     * Sends a trigger request to wake up Google backend
     * This is a fire-and-forget operation - we don't wait for the trigger request to complete
     * @param {string} logPrefix - Log prefix for step messages (e.g., "[Browser]" or "[Reconnect]")
     */
    _sendActiveTrigger(logPrefix = "[Browser]") {
        // Active Trigger (Hack to wake up Google Backend)
        this.logger.info(`${logPrefix} ⚡ Sending active trigger request to Launch flow...`);

        // Fire-and-forget: send trigger request in background without waiting
        this.page
            .evaluate(async () => {
                try {
                    await fetch("https://generativelanguage.googleapis.com/v1beta/models?key=ActiveTrigger", {
                        headers: { "Content-Type": "application/json" },
                        method: "GET",
                    });
                } catch (e) {
                    console.log("[ProxyClient] Active trigger sent");
                }
            })
            .catch(() => {
                // Silently ignore errors - this is a best-effort trigger
            });
    }

    /**
     * Helper: Navigate to target page and wake up the page
     * Contains the common navigation and page activation logic
     * @param {Page} page - The page object to navigate
     * @param {string} logPrefix - Log prefix for messages (e.g., "[Browser]" or "[Reconnect]")
     */
    async _navigateAndWakeUpPage(page, logPrefix = "[Browser]") {
        this.logger.debug(`${logPrefix} Navigating to target page...`);

        await page.goto(this.targetUrl, {
            timeout: 180000,
            waitUntil: "domcontentloaded",
        });
        this.logger.debug(`${logPrefix} Page loaded.`);

        // Wait for page to stabilize
        await page.waitForTimeout(2000 + Math.random() * 1000);
    }

    /**
     * Helper: Verify navigation to correct page and retry if needed
     * Throws error on failure, which will be caught by the caller's try-catch block
     * @param {string} logPrefix - Log prefix for messages (e.g., "[Browser]" or "[Reconnect]")
     * @throws {Error} If navigation fails after retry
     */
    // async _verifyAndRetryNavigation(logPrefix = "[Browser]") {
    //     let currentUrl = this.page.url();
    //
    //     if (!currentUrl.includes(this.expectedAppId)) {
    //         this.logger.warn(`${logPrefix} ⚠️ Page redirected to: ${currentUrl}`);
    //         this.logger.info(`${logPrefix} Expected app ID: ${this.expectedAppId}`);
    //         this.logger.info(`${logPrefix} Attempting to navigate again...`);
    //
    //         // Reset WebSocket initialization flags before re-navigation
    //         this._wsInitSuccess = false;
    //         this._wsInitFailed = false;
    //
    //         // Wait a bit before retrying
    //         await this.page.waitForTimeout(2000);
    //
    //         // Try navigating again
    //         await this.page.goto(this.targetUrl, {
    //             timeout: 180000,
    //             waitUntil: "domcontentloaded",
    //         });
    //         await this.page.waitForTimeout(2000);
    //
    //         // Check URL again
    //         currentUrl = this.page.url();
    //         if (!currentUrl.includes(this.expectedAppId)) {
    //             this.logger.error(`${logPrefix} ❌ Still on wrong page after retry: ${currentUrl}`);
    //             throw new Error(
    //                 `Failed to navigate to correct page. Current URL: ${currentUrl}, Expected app ID: ${this.expectedAppId}`
    //             );
    //         } else {
    //             this.logger.info(`${logPrefix} ✅ Successfully navigated to correct page on retry: ${currentUrl}`);
    //         }
    //     } else {
    //         this.logger.info(`${logPrefix} ✅ Confirmed on correct page: ${currentUrl}`);
    //     }
    // }

    /**
     * Helper: Check page status and detect various error conditions
     * Detects: cookie expiration, region restrictions, 403 errors, page load failures
     * @param {Page} page - The page object to check
     * @param {string} logPrefix - Log prefix for messages (e.g., "[Browser]" or "[Reconnect]")
     * @throws {Error} If any error condition is detected
     */
    async _checkPageStatusAndErrors(page, logPrefix = "[Browser]") {
        const currentUrl = page.url();
        let pageTitle = "";
        try {
            pageTitle = await page.title();
        } catch (e) {
            this.logger.warn(`${logPrefix} Unable to get page title: ${e.message}`);
        }

        this.logger.debug(`${logPrefix} [Diagnostic] URL: ${currentUrl}`);
        this.logger.debug(`${logPrefix} [Diagnostic] Title: "${pageTitle}"`);

        // Check for various error conditions
        if (
            currentUrl.includes("accounts.google.com") ||
            currentUrl.includes("ServiceLogin") ||
            pageTitle.includes("Sign in") ||
            pageTitle.includes("登录")
        ) {
            throw new Error(
                "🚨 Cookie expired/invalid! Browser was redirected to Google login page. Please re-extract storageState."
            );
        }

        if (pageTitle.includes("Available regions") || pageTitle.includes("not available")) {
            throw new Error(
                "🚨 Current IP does not support access to Google AI Studio (region restricted). Claw node may be identified as restricted region, try restarting container to get a new IP."
            );
        }

        if (pageTitle.includes("403") || pageTitle.includes("Forbidden")) {
            throw new Error("🚨 403 Forbidden: Current IP reputation too low, access denied by Google risk control.");
        }

        if (currentUrl === "about:blank") {
            throw new Error("🚨 Page load failed (about:blank), possibly network timeout or browser crash.");
        }
    }

    /**
     * Helper: Handle various popups with intelligent detection
     * Uses short polling instead of long hard-coded timeouts
     * @param {Page} page - The page object to check for popups
     * @param {string} logPrefix - Log prefix for messages (e.g., "[Browser]" or "[Reconnect]")
     */
    async _handlePopups(page, logPrefix = "[Browser]") {
        this.logger.debug(`${logPrefix} 🔍 Starting intelligent popup detection (max 6s)...`);

        const popupConfigs = [
            {
                logFound: `${logPrefix} Found "Continue to the app" button, clicking...`,
                name: "Continue to the app",
                selector: 'button:text("Continue to the app")',
            },
        ];

        // Polling-based detection with smart exit conditions
        // - Initial wait: give popups time to render after page load
        // - Consecutive idle tracking: exit after N consecutive iterations with no new popups
        const maxIterations = 12; // Max polling iterations
        const pollInterval = 500; // Interval between polls (ms)
        const minIterations = 6; // Min iterations (3s), ensure slow popups have time to load
        const idleThreshold = 4; // Exit after N consecutive iterations with no new popups
        const handledPopups = new Set();
        let consecutiveIdleCount = 0; // Counter for consecutive idle iterations

        for (let i = 0; i < maxIterations; i++) {
            let foundAny = false;

            for (const popup of popupConfigs) {
                if (handledPopups.has(popup.name)) continue;

                try {
                    const element = page.locator(popup.selector).first();
                    // Quick visibility check with very short timeout
                    if (await element.isVisible({ timeout: 200 })) {
                        this.logger.info(popup.logFound);
                        await element.click({ force: true });
                        handledPopups.add(popup.name);
                        foundAny = true;

                        // "Continue to the app" confirms entry, exit popup detection early
                        if (popup.name === "Continue to the app") {
                            return;
                        }

                        // Short pause after clicking to let next popup appear
                        await page.waitForTimeout(800);
                    }
                } catch (error) {
                    // Element not visible or doesn't exist is expected here,
                    // but propagate clearly critical browser/page issues.
                    if (error && error.message) {
                        const msg = error.message;
                        if (
                            msg.includes("Execution context was destroyed") ||
                            msg.includes("Target page, context or browser has been closed") ||
                            msg.includes("Protocol error") ||
                            msg.includes("Navigation failed because page was closed")
                        ) {
                            throw error;
                        }
                        if (this.logger && typeof this.logger.debug === "function") {
                            this.logger.debug(
                                `${logPrefix} Ignored error while checking popup "${popup.name}": ${msg}`
                            );
                        }
                    }
                }
            }

            // Update consecutive idle counter
            if (foundAny) {
                consecutiveIdleCount = 0; // Found popup, reset counter
            } else {
                consecutiveIdleCount++;
            }

            // Exit conditions:
            // 1. Must have completed minimum iterations (ensure slow popups have time to load)
            // 2. Consecutive idle count exceeds threshold (no new popups appearing)
            if (i >= minIterations - 1 && consecutiveIdleCount >= idleThreshold) {
                this.logger.debug(
                    `${logPrefix} Popup detection complete (${i + 1} iterations, ${handledPopups.size} popups handled)`
                );
                break;
            }

            if (i < maxIterations - 1) {
                await page.waitForTimeout(pollInterval);
            }
        }

        // Log final summary
        if (handledPopups.size === 0) {
            this.logger.info(`${logPrefix} No popups detected during scan`);
        } else {
            this.logger.info(
                `${logPrefix} Popup detection complete: handled ${handledPopups.size} popup(s) - ${Array.from(handledPopups).join(", ")}`
            );
        }
    }

    /**
     * Helper: Try to click Launch button if it exists on the page
     * This is not a popup, but a page button that may need to be clicked
     * @param {string} logPrefix - Log prefix for messages (e.g., "[Browser]" or "[Reconnect]")
     */
    async _tryClickLaunchButton(page, logPrefix = "[Browser]") {
        try {
            this.logger.debug(`${logPrefix} 🔍 Checking for Launch button...`);

            // Try to find Launch button with multiple selectors
            const launchSelectors = [
                'button:text("Launch")',
                'button:has-text("Launch")',
                'button[aria-label*="Launch"]',
                'button span:has-text("Launch")',
                'div[role="button"]:has-text("Launch")',
            ];

            let clicked = false;
            for (const selector of launchSelectors) {
                try {
                    const element = page.locator(selector).first();
                    if (await element.isVisible({ timeout: 2000 })) {
                        this.logger.debug(`${logPrefix} Found Launch button with selector: ${selector}`);
                        await element.click({ force: true, timeout: 5000 });
                        this.logger.info(`${logPrefix} Launch button clicked successfully`);
                        clicked = true;
                        await page.waitForTimeout(1000);
                        break;
                    }
                } catch (e) {
                    // Continue to next selector
                }
            }

            if (!clicked) {
                this.logger.info(`${logPrefix} ℹ️ No Launch button found (this is normal if already launched)`);
            }
        } catch (error) {
            this.logger.warn(`${logPrefix} ⚠️ Error while checking for Launch button: ${error.message}`);
        }
    }

    /**
     * Feature: Background Health Monitor (The "Scavenger")
     * Periodically cleans up popups and keeps the session alive.
     * In multi-context mode, stores the interval in the context data.
     */
    _startHealthMonitor() {
        const authIndex = this._currentAuthIndex;
        if (authIndex < 0) {
            this.logger.warn("[Browser] Cannot start health monitor: no active auth index");
            return;
        }

        // Get context data
        const contextData = this.contexts.get(authIndex);
        if (!contextData) {
            this.logger.warn(`[Browser] Cannot start health monitor: context #${authIndex} not found`);
            return;
        }

        // Clear existing interval if any
        if (contextData.healthMonitorInterval) {
            clearInterval(contextData.healthMonitorInterval);
        }

        this.logger.info(`[Context#${authIndex}] 🛡️ Background health monitor service (Scavenger) started...`);

        let tickCount = 0;

        // Run every 4 seconds
        contextData.healthMonitorInterval = setInterval(async () => {
            try {
                // Check if this is still the current active account
                // This prevents background contexts from running healthMonitor unnecessarily
                if (this._currentAuthIndex !== authIndex) {
                    // Silently skip - this context is not active
                    return;
                }

                const page = contextData.page;
                // Double check page status
                if (!page || page.isClosed()) {
                    if (contextData.healthMonitorInterval) {
                        clearInterval(contextData.healthMonitorInterval);
                        contextData.healthMonitorInterval = null;
                        this.logger.info(`[HealthMonitor#${authIndex}] Page closed, stopped background task.`);
                    }
                    return;
                }

                tickCount++;

                try {
                    // 1. Keep-Alive: Random micro-actions (30% chance)
                    if (Math.random() < 0.3) {
                        try {
                            // Optimized randomness based on viewport
                            const vp = page.viewportSize() || { height: 1080, width: 1920 };

                            // Scroll
                            // eslint-disable-next-line no-undef
                            await page.evaluate(() => window.scrollBy(0, (Math.random() - 0.5) * 20));
                            // Human-like mouse jitter
                            const x = Math.floor(Math.random() * (vp.width * 0.8));
                            const y = Math.floor(Math.random() * (vp.height * 0.8));
                            await this._simulateHumanMovement(page, x, y);
                        } catch (e) {
                            /* empty */
                        }
                    }

                    // 2. Anti-Timeout: Move to top-left corner (1,1) every ~1 minute (15 ticks)
                    if (tickCount % 15 === 0) {
                        try {
                            await this._simulateHumanMovement(page, 1, 1);
                        } catch (e) {
                            /* empty */
                        }
                    }

                    // 3. Auto-Save Auth: Every ~24 hours (21600 ticks * 4s = 86400s)
                    if (tickCount % 21600 === 0) {
                        try {
                            this.logger.info(
                                `[HealthMonitor#${authIndex}] 💾 Triggering daily periodic auth file update...`
                            );
                            await this._updateAuthFile(authIndex);
                        } catch (e) {
                            this.logger.warn(`[HealthMonitor#${authIndex}] Auth update failed: ${e.message}`);
                        }
                    }

                    // 4. Popup & Overlay Cleanup
                    await page.evaluate(() => {
                        const blockers = [
                            "div.cdk-overlay-backdrop",
                            "div.cdk-overlay-container",
                            "div.cdk-global-overlay-wrapper",
                        ];

                        const targetTexts = ["Reload", "Retry", "Got it", "Dismiss", "Not now"];

                        // Remove passive blockers
                        blockers.forEach(selector => {
                            // eslint-disable-next-line no-undef
                            document.querySelectorAll(selector).forEach(el => el.remove());
                        });

                        // Click active buttons if visible
                        // eslint-disable-next-line no-undef
                        document.querySelectorAll("button").forEach(btn => {
                            // Check if the element occupies space (simple visibility check)
                            const rect = btn.getBoundingClientRect();
                            const isVisible = rect.width > 0 && rect.height > 0;

                            if (isVisible) {
                                const text = (btn.innerText || "").trim();
                                const ariaLabel = btn.getAttribute("aria-label");

                                // Match text or aria-label
                                if (targetTexts.includes(text) || ariaLabel === "Close") {
                                    console.log(`[ProxyClient] HealthMonitor clicking: ${text || "Close Button"}`);
                                    btn.click();
                                }
                            }
                        });
                    });
                } catch (err) {
                    // Silent catch to prevent log spamming on navigation
                }
            } catch (globalError) {
                // Catch any other unexpected errors in the interval
                this.logger.warn(`[HealthMonitor#${authIndex}] Detailed error: ${globalError.message}`);
                // If the page is definitely gone, stop the monitor
                if (globalError.message.includes("Target page, context or browser has been closed")) {
                    if (contextData.healthMonitorInterval) {
                        clearInterval(contextData.healthMonitorInterval);
                        contextData.healthMonitorInterval = null;
                        this.logger.info(
                            `[HealthMonitor#${authIndex}] Page closed (detected by error), stopped background task.`
                        );
                    }
                }
            }
        }, 4000);
    }

    /**
     * Helper: Save debug information (screenshot and HTML) to root directory
     * @param {string} suffix - Suffix for the debug file names
     * @param {number} [authIndex] - Optional auth index to get the correct page from contexts Map
     * @param {object} [explicitPage] - Optional explicit page object to use (for cases where page is not yet in contexts)
     */
    async _saveDebugArtifacts(suffix = "final", authIndex = null, explicitPage = null) {
        // Prioritize explicit page, then retrieve from contexts Map, finally fall back to this.page
        let targetPage = explicitPage;
        if (!targetPage) {
            targetPage = this.page;
            if (authIndex !== null && this.contexts.has(authIndex)) {
                const ctxData = this.contexts.get(authIndex);
                if (ctxData && ctxData.page) {
                    targetPage = ctxData.page;
                }
            }
        }
        if (!targetPage || targetPage.isClosed()) return;
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
            const screenshotPath = path.join(process.cwd(), `debug_screenshot_${suffix}_${timestamp}.png`);
            await targetPage.screenshot({
                fullPage: true,
                path: screenshotPath,
            });
            this.logger.info(`[Debug] Failure screenshot saved to: ${screenshotPath}`);

            const htmlPath = path.join(process.cwd(), `debug_page_source_${suffix}_${timestamp}.html`);
            const htmlContent = await targetPage.content();
            fs.writeFileSync(htmlPath, htmlContent);
            this.logger.info(`[Debug] Failure page source saved to: ${htmlPath}`);
        } catch (e) {
            this.logger.error(`[Debug] Failed to save debug artifacts: ${e.message}`);
        }
    }

    /**
     * Feature: Background Wakeup & "Launch" Button Handler
     * Specifically handles the "Rocket/Launch" button which blocks model loading.
     * This service is bound to this.page (instance-level), not individual contexts.
     * Only one instance should run at a time, tracking the current active page.
     */
    async _startBackgroundWakeup() {
        // Prevent multiple instances from running simultaneously
        if (this.backgroundWakeupRunning) {
            this.logger.info("[Browser] BackgroundWakeup already running, skipping duplicate start.");
            return;
        }

        this.logger.debug("[Browser] Starting BackgroundWakeup initialization...");
        this.backgroundWakeupRunning = true;

        // Initial buffer - wait before starting the main loop to let page stabilize
        await new Promise(r => setTimeout(r, 1500));

        // Verify page is still valid after the initial delay
        try {
            if (!this.page || this.page.isClosed()) {
                this.backgroundWakeupRunning = false;
                this.logger.info(
                    "[Browser] BackgroundWakeup stopped: page became null or closed during startup delay."
                );
                return;
            }
        } catch (error) {
            this.backgroundWakeupRunning = false;
            this.logger.warn(`[Browser] BackgroundWakeup stopped: error checking page status: ${error.message}`);
            return;
        }

        this.logger.info("[Browser] 🛡️ Background Wakeup Service (Rocket Handler) started...");

        // Main loop: directly use this.page, automatically follows context switches
        while (this.page && !this.page.isClosed()) {
            try {
                const currentPage = this.page; // Capture for this iteration

                // 1. Force page wake-up
                await currentPage.bringToFront().catch(() => {});

                // Micro-movements to trigger rendering frames in headless mode
                const vp = currentPage.viewportSize() || { height: 1080, width: 1920 };
                const moveX = Math.floor(Math.random() * (vp.width * 0.3));
                const moveY = Math.floor(Math.random() * (vp.height * 0.3));
                await this._simulateHumanMovement(currentPage, moveX, moveY);

                // 2. Intelligent Scan for "Launch" or "Rocket" button
                const targetInfo = await currentPage.evaluate(() => {
                    // Optimized precise check
                    try {
                        const preciseCandidates = Array.from(
                            // eslint-disable-next-line no-undef
                            document.querySelectorAll(".interaction-modal p, .interaction-modal button")
                        );
                        for (const el of preciseCandidates) {
                            if (/Launch|rocket_launch/i.test((el.innerText || "").trim())) {
                                const rect = el.getBoundingClientRect();
                                if (rect.width > 0 && rect.height > 0) {
                                    return {
                                        found: true,
                                        tagName: el.tagName,
                                        text: (el.innerText || "").trim().substring(0, 15),
                                        x: rect.left + rect.width / 2,
                                        y: rect.top + rect.height / 2,
                                    };
                                }
                            }
                        }
                    } catch (e) {
                        /* empty */
                    }

                    const MIN_Y = 400;
                    const MAX_Y = 800;

                    const isValid = rect => rect.width > 0 && rect.height > 0 && rect.top > MIN_Y && rect.top < MAX_Y;

                    // eslint-disable-next-line no-undef
                    const candidates = Array.from(document.querySelectorAll("button, span, div, a, i"));

                    for (const el of candidates) {
                        const text = (el.innerText || "").trim();
                        // Match "Launch" or material icon "rocket_launch"
                        if (!/Launch|rocket_launch/i.test(text)) continue;

                        let targetEl = el;
                        let rect = targetEl.getBoundingClientRect();

                        // Recursive parent check (up to 3 levels)
                        let parentDepth = 0;
                        while (parentDepth < 3 && targetEl.parentElement) {
                            if (targetEl.tagName === "BUTTON" || targetEl.getAttribute("role") === "button") break;
                            const parent = targetEl.parentElement;
                            const pRect = parent.getBoundingClientRect();
                            if (isValid(pRect)) {
                                targetEl = parent;
                                rect = pRect;
                            }
                            parentDepth++;
                        }

                        if (isValid(rect)) {
                            return {
                                found: true,
                                tagName: targetEl.tagName,
                                text: text.substring(0, 15),
                                x: rect.left + rect.width / 2,
                                y: rect.top + rect.height / 2,
                            };
                        }
                    }
                    return { found: false };
                });

                // 3. Execute Click if found
                if (targetInfo.found) {
                    this.logger.info(`[Browser] 🎯 Found Rocket/Launch button [${targetInfo.tagName}], engaging...`);

                    // Physical Click
                    await currentPage.mouse.move(targetInfo.x, targetInfo.y, { steps: 5 });
                    await new Promise(r => setTimeout(r, 300));
                    await currentPage.mouse.down();
                    await new Promise(r => setTimeout(r, 400));
                    await currentPage.mouse.up();

                    this.logger.info(`[Browser] 🖱️ Physical click executed. Verifying...`);
                    await new Promise(r => setTimeout(r, 1500));

                    // Strategy B: JS Click (Fallback)
                    const isStillThere = await currentPage.evaluate(() => {
                        // eslint-disable-next-line no-undef
                        const els = Array.from(document.querySelectorAll('button, span, div[role="button"]'));
                        return els.some(el => {
                            const r = el.getBoundingClientRect();
                            return (
                                /Launch|rocket_launch/i.test(el.innerText) && r.top > 400 && r.top < 800 && r.height > 0
                            );
                        });
                    });

                    if (isStillThere) {
                        this.logger.warn(`[Browser] ⚠️ Physical click ineffective, attempting JS force click...`);
                        await currentPage.evaluate(() => {
                            const candidates = Array.from(
                                // eslint-disable-next-line no-undef
                                document.querySelectorAll('button, span, div[role="button"]')
                            );
                            for (const el of candidates) {
                                const r = el.getBoundingClientRect();
                                if (/Launch|rocket_launch/i.test(el.innerText) && r.top > 400 && r.top < 800) {
                                    (el.closest("button") || el).click();
                                    return true;
                                }
                            }
                        });
                        await new Promise(r => setTimeout(r, 2000));
                    } else {
                        this.logger.info(`[Browser] ✅ Click successful, button disappeared.`);
                        // Long sleep on success, but check for context switches every second
                        for (let i = 0; i < 60; i++) {
                            if (this.noButtonCount === 0) {
                                this.logger.info(`[Browser] ⚡ Woken up early due to user activity or context switch.`);
                                break; // Wake up early if user activity detected
                            }
                            await new Promise(r => setTimeout(r, 1000));
                        }
                    }
                } else {
                    this.noButtonCount++;
                    // Smart Sleep
                    if (this.noButtonCount > 20) {
                        // Long sleep, but check for user activity
                        for (let i = 0; i < 30; i++) {
                            if (this.noButtonCount === 0) break; // Woken up by request
                            await new Promise(r => setTimeout(r, 1000));
                        }
                    } else {
                        await new Promise(r => setTimeout(r, 1500));
                    }
                }
            } catch (e) {
                // Ignore errors during page navigation/reload
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        // Reset flag when loop exits
        this.backgroundWakeupRunning = false;

        // Log the reason for stopping
        if (!this.page) {
            this.logger.info("[Browser] Background Wakeup Service stopped: this.page is null.");
        } else if (this.page.isClosed()) {
            this.logger.info("[Browser] Background Wakeup Service stopped: this.page was closed.");
        } else {
            this.logger.info("[Browser] Background Wakeup Service stopped: unknown reason.");
        }
    }

    async launchBrowserForVNC(extraArgs = {}) {
        this.logger.info("🚀 [VNC] Launching a new, separate, headful browser instance for VNC session...");
        if (!fs.existsSync(this.browserExecutablePath)) {
            throw new Error(`Browser executable not found at path: ${this.browserExecutablePath}`);
        }

        const proxyConfig = parseProxyFromEnv();
        if (proxyConfig) {
            this.logger.info(`[VNC] 🌐 Using proxy: ${proxyConfig.server}`);
        }

        // This browser instance is temporary and specific to the VNC session.
        // It does NOT affect the main `this.browser` used for the API proxy.
        const vncBrowser = await firefox.launch({
            args: this.launchArgs,
            env: {
                ...process.env,
                ...extraArgs.env,
            },
            executablePath: this.browserExecutablePath,
            firefoxUserPrefs: this.firefoxUserPrefs,
            // Must be false for VNC to be visible.
            headless: false,
            ...(proxyConfig ? { proxy: proxyConfig } : {}),
        });

        vncBrowser.on("disconnected", () => {
            this.logger.warn("ℹ️ [VNC] The temporary VNC browser instance has been disconnected.");
        });

        this.logger.info("✅ [VNC] Temporary VNC browser instance launched successfully.");

        let contextOptions = {};
        if (extraArgs.isMobile) {
            this.logger.info("[VNC] Mobile device detected. Applying mobile user-agent, viewport, and touch events.");
            const mobileDevice = devices["Pixel 5"];
            contextOptions = {
                hasTouch: mobileDevice.hasTouch,
                userAgent: mobileDevice.userAgent,
                viewport: { height: 915, width: 412 }, // Set a specific portrait viewport
            };
        }

        const context = await vncBrowser.newContext(
            proxyConfig ? { ...contextOptions, proxy: proxyConfig } : contextOptions
        );
        this.logger.info("✅ [VNC] VNC browser context successfully created.");

        // Return both the browser and context so the caller can manage their lifecycle.
        return { browser: vncBrowser, context };
    }

    /**
     * Preload a pool of contexts at startup
     * Synchronously initializes the first context, then starts remaining in background
     * @param {number[]} startupOrder - Ordered list of auth indices to try
     * @param {number} maxContexts - Max pool size (0 = unlimited)
     * @returns {Promise<{firstReady: number|null}>}
     */
    async preloadContextPool(startupOrder, maxContexts) {
        const poolSize = maxContexts === 0 ? startupOrder.length : Math.min(maxContexts, startupOrder.length);
        this.logger.info(
            `🚀 [ContextPool] Starting pool preload (pool=${poolSize}, order=[${startupOrder.join(", ")}])...`
        );

        // Abort any existing background preload/rebalance to ensure clean state
        await this.abortBackgroundPreload();

        // Launch browser if not already running
        if (!this.browser) {
            await this._ensureBrowser();
        }

        // Synchronously try ALL indices until one succeeds (fallback beyond poolSize)
        let firstReady = null;

        for (let i = 0; i < startupOrder.length; i++) {
            const authIndex = startupOrder[i];

            // If already initialized, use it directly
            if (this.contexts.has(authIndex)) {
                this.logger.info(`[ContextPool] Context #${authIndex} already exists, reusing`);
                firstReady = authIndex;
                break;
            }

            // If being initialized by another task, wait for it to finish and verify success
            if (this.initializingContexts.has(authIndex)) {
                this.logger.info(`[ContextPool] Context #${authIndex} being initialized, waiting...`);
                await this._waitForContextInit(authIndex);
                if (this.contexts.has(authIndex)) {
                    this.logger.info(`[ContextPool] Context #${authIndex} initialized successfully, reusing`);
                    firstReady = authIndex;
                    break;
                }
                this.logger.warn(`[ContextPool] Context #${authIndex} initialization failed, trying next`);
                continue;
            }

            this.initializingContexts.add(authIndex);
            try {
                this.logger.info(`[ContextPool] Initializing context #${authIndex}...`);
                await this._initializeContext(authIndex);
                firstReady = authIndex;
                this.logger.info(`✅ [ContextPool] First context #${authIndex} ready.`);
                break;
            } catch (error) {
                this.logger.error(`❌ [ContextPool] Context #${authIndex} failed: ${error.message}`);
            } finally {
                // Note: _initializeContext already removes from initializingContexts in its finally block
            }
        }

        if (firstReady === null) {
            if (this.browser) await this.closeBrowser();
            return { firstReady: null };
        }

        // Early return if pool size is 1 (single context mode) - no need for background preload
        if (poolSize === 1) {
            this.logger.info(`[ContextPool] Single context mode (maxContexts=1), skipping background preload.`);
            return { firstReady };
        }

        // Background: calculate remaining contexts using rotation order (same logic as rebalanceContextPool)
        // This ensures startup pool matches the rotation order used during account switching
        const rotation = this.authSource.getRotationIndices();
        const currentCanonical = this.authSource.getCanonicalIndex(firstReady);
        const startPos = currentCanonical !== null ? Math.max(rotation.indexOf(currentCanonical), 0) : 0;
        const ordered = [];
        for (let i = 0; i < rotation.length; i++) {
            ordered.push(rotation[(startPos + i) % rotation.length]);
        }

        // Calculate how many more contexts we need to reach poolSize
        const needCount = poolSize - this.contexts.size;
        if (needCount > 0) {
            // Get candidates from ordered list (excluding already initialized contexts)
            // Convert existing contexts to canonical indices to handle duplicate accounts
            const existingCanonical = new Set(
                [...this.contexts.keys()].map(idx => this.authSource.getCanonicalIndex(idx) ?? idx)
            );
            const candidates = ordered.filter(
                idx => !existingCanonical.has(idx) && !this.initializingContexts.has(idx)
            );

            if (candidates.length > 0) {
                this.logger.info(
                    `[ContextPool] Background preload will try [${candidates.join(", ")}] to reach pool size ${poolSize} (need ${needCount} more)`
                );
                // Pass all candidates, not just the first needCount
                // This allows the background task to try subsequent accounts if earlier ones fail
                this._preloadBackgroundContexts(candidates, poolSize);
            }
        }

        return { firstReady };
    }

    /**
     * Launch browser instance if not already running
     */
    async _ensureBrowser() {
        if (this.browser) return;

        const proxyConfig = parseProxyFromEnv();
        this.logger.info("🚀 [Browser] Launching main browser instance...");
        if (!fs.existsSync(this.browserExecutablePath)) {
            this._currentAuthIndex = -1;
            throw new Error(`Browser executable not found at path: ${this.browserExecutablePath}`);
        }
        this.browser = await firefox.launch({
            args: this.launchArgs,
            executablePath: this.browserExecutablePath,
            firefoxUserPrefs: this.firefoxUserPrefs,
            headless: true,
            ...(proxyConfig ? { proxy: proxyConfig } : {}),
        });
        this.browser.on("disconnected", () => {
            if (!this.isClosingIntentionally) {
                this.logger.error("❌ [Browser] Main browser unexpectedly disconnected!");
            } else {
                this.logger.info("[Browser] Main browser closed intentionally.");
            }
            this.browser = null;
            this._cleanupAllContexts();
        });
        this.logger.info("✅ [Browser] Main browser instance launched successfully.");
    }

    /**
     * Abort any ongoing background preload task and wait for it to complete
     * This is a public method that encapsulates access to internal preload state
     * @returns {Promise<void>} Resolves when the background task has been aborted and cleaned up
     */
    async abortBackgroundPreload() {
        if (!this._backgroundPreloadTask) {
            return; // No task to abort
        }

        this.logger.info(`[ContextPool] Aborting background preload task...`);
        this._backgroundPreloadAbort = true;

        try {
            await this._backgroundPreloadTask;
        } catch (error) {
            // Ignore errors from aborted task
            this.logger.debug(`[ContextPool] Background preload aborted: ${error.message}`);
        }

        this.logger.info(`[ContextPool] Background preload aborted successfully`);
    }

    /**
     * Background sequential initialization of contexts (fire-and-forget)
     * Only one instance should be active at a time - new calls abort old ones
     * @param {number[]} indices - Auth indices to initialize (candidates, may exceed pool size)
     * @param {number} maxPoolSize - Stop when this.contexts.size reaches this limit (0 = no limit)
     */
    async _preloadBackgroundContexts(indices, maxPoolSize = 0) {
        // If there's an existing background task, abort it and wait for it to finish
        await this.abortBackgroundPreload();

        // Reset abort flag and create new background task
        this._backgroundPreloadAbort = false;
        const currentTask = this._executePreloadTask(indices, maxPoolSize);
        this._backgroundPreloadTask = currentTask;

        // Don't await here - this is fire-and-forget
        // But ensure we clean up the task reference when done
        currentTask
            .catch(error => {
                this.logger.error(`[ContextPool] Background preload task failed: ${error.message}`);
            })
            .finally(() => {
                // Only clear if this is still the current task
                if (this._backgroundPreloadTask === currentTask) {
                    this._backgroundPreloadTask = null;
                }
            });
    }

    /**
     * Internal method to execute the actual preload task
     * @private
     */
    async _executePreloadTask(indices, maxPoolSize) {
        this.logger.info(
            `[ContextPool] Background preload starting for [${indices.join(", ")}] (poolCap=${maxPoolSize || "unlimited"})...`
        );

        let aborted = false;

        for (const authIndex of indices) {
            // Check if abort was requested
            if (this._backgroundPreloadAbort) {
                this.logger.info(`[ContextPool] Background preload aborted by request`);
                aborted = true;
                break;
            }

            // Check if browser is available, launch if needed
            if (!this.browser) {
                this.logger.info(`[ContextPool] Browser not available, launching browser for background preload...`);
                try {
                    await this._ensureBrowser();
                    this.logger.info(`[ContextPool] Browser launched successfully for background preload`);
                } catch (error) {
                    this.logger.error(
                        `[ContextPool] Failed to launch browser for background preload: ${error.message}`
                    );
                    break;
                }
            }

            // Check pool size limit
            if (maxPoolSize > 0 && this.contexts.size >= maxPoolSize) {
                this.logger.info(`[ContextPool] Pool size limit reached, stopping preload`);
                break;
            }

            // Skip if already exists or being initialized by another task
            if (this.contexts.has(authIndex)) {
                this.logger.debug(`[ContextPool] Context #${authIndex} already exists, skipping`);
                continue;
            }
            if (this.initializingContexts.has(authIndex)) {
                this.logger.info(
                    `[ContextPool] Context #${authIndex} already being initialized by another task, skipping`
                );
                continue;
            }

            this.initializingContexts.add(authIndex);
            try {
                this.logger.info(`[ContextPool] Background preload init context #${authIndex}...`);
                await this._initializeContext(authIndex, true); // Mark as background task
                this.logger.info(`✅ [ContextPool] Background context #${authIndex} ready.`);
            } catch (error) {
                // Check if this is an abort error (user deleted the account during initialization)
                const isAbortError = error.message && error.message.includes("aborted for index");
                if (isAbortError) {
                    this.logger.info(`[ContextPool] Background context #${authIndex} aborted (account deleted)`);
                    // If aborted due to background preload abort, mark as aborted
                    aborted = true;
                } else {
                    this.logger.error(`❌ [ContextPool] Background context #${authIndex} failed: ${error.message}`);
                }
            }
            // Note: initializingContexts and abortedContexts cleanup is handled in _initializeContext's finally block
        }

        if (!aborted) {
            this.logger.info(`[ContextPool] Background preload complete.`);
        }
    }

    /**
     * Pre-cleanup before switching to a new account
     * Removes contexts that will be excess after the switch to avoid exceeding maxContexts
     * @param {number} targetAuthIndex - The account index we're about to switch to
     */
    async preCleanupForSwitch(targetAuthIndex) {
        const maxContexts = this.config.maxContexts;
        const isUnlimited = maxContexts === 0;

        // Abort any ongoing background preload task before cleanup
        // This prevents race conditions where background tasks continue initializing contexts
        // that will be immediately removed by the new rebalance after switch
        await this.abortBackgroundPreload();

        // Test: Check if initializingContexts is empty after aborting background task
        if (this.initializingContexts.size > 0) {
            const initializingList = [...this.initializingContexts].join(", ");
            this.logger.error(
                `[ContextPool] Pre-cleanup ERROR: initializingContexts not empty after aborting background task! Contexts still initializing: [${initializingList}]`
            );
            throw new Error(
                `Pre-cleanup failed: initializingContexts not empty (${initializingList}). This should not happen after aborting background task.`
            );
        }

        // In unlimited mode, no need to pre-cleanup
        if (isUnlimited) {
            this.logger.debug(`[ContextPool] Pre-cleanup skipped: unlimited mode`);
            return;
        }

        // If target context already exists or is being initialized, no new context will be created
        if (this.contexts.has(targetAuthIndex)) {
            this.logger.debug(`[ContextPool] Pre-cleanup skipped: target context #${targetAuthIndex} already exists`);
            return;
        }

        if (this.initializingContexts.has(targetAuthIndex)) {
            this.logger.debug(
                `[ContextPool] Pre-cleanup skipped: target context #${targetAuthIndex} is being initialized`
            );
            return;
        }

        // Calculate how many contexts we'll have after adding the new one
        // Include contexts that are currently being initialized in background
        const currentSize = this.contexts.size + this.initializingContexts.size;
        const futureSize = currentSize + 1;

        // If we won't exceed the limit, no cleanup needed
        if (futureSize <= maxContexts) {
            this.logger.debug(
                `[ContextPool] Pre-cleanup skipped: future size ${futureSize} (${this.contexts.size} ready + ${this.initializingContexts.size} initializing + 1 new) <= maxContexts ${maxContexts}`
            );
            return;
        }

        // We need to remove (futureSize - maxContexts) contexts
        const removeCount = futureSize - maxContexts;

        // Build removal priority list (from lowest to highest priority to keep):
        // Priority 1: Old duplicate accounts (removedIndices from duplicateGroups)
        // Priority 2: Accounts in rotation, ordered by distance from target (farthest first)

        const rotation = this.authSource.getRotationIndices();
        const targetCanonical = this.authSource.getCanonicalIndex(targetAuthIndex);
        const duplicateGroups = this.authSource.getDuplicateGroups();

        // Get all old duplicate indices (not in rotation)
        const oldDuplicates = new Set();
        for (const group of duplicateGroups) {
            for (const idx of group.removedIndices) {
                oldDuplicates.add(idx);
            }
        }

        // Build rotation order starting from target (accounts closer to target have higher priority)
        const startPos = Math.max(rotation.indexOf(targetCanonical), 0);
        const orderedFromTarget = [];
        for (let i = 0; i < rotation.length; i++) {
            orderedFromTarget.push(rotation[(startPos + i) % rotation.length]);
        }

        // Collect all context indices (existing + initializing)
        const allContextIndices = new Set([...this.contexts.keys(), ...this.initializingContexts]);

        // Build removal priority list
        const removalPriority = [];

        // Special case: If target is an old duplicate, prioritize removing its canonical version
        // Because we're about to create the old duplicate, and they're the same account
        const isTargetOldDuplicate = oldDuplicates.has(targetAuthIndex);
        if (isTargetOldDuplicate) {
            // Find the canonical version of target in existing contexts
            for (const idx of allContextIndices) {
                if (this.authSource.getCanonicalIndex(idx) === targetCanonical && idx === targetCanonical) {
                    removalPriority.push(idx);
                    break;
                }
            }
        }

        // Priority 1: Old duplicate accounts (lowest priority to keep)
        for (const idx of allContextIndices) {
            if (oldDuplicates.has(idx) && !removalPriority.includes(idx)) {
                removalPriority.push(idx);
            }
        }

        // Priority 2: Accounts in rotation, from farthest to closest (reverse rotation order)
        for (let i = orderedFromTarget.length - 1; i >= 0; i--) {
            const canonical = orderedFromTarget[i];
            // Find all contexts with this canonical index
            for (const idx of allContextIndices) {
                if (this.authSource.getCanonicalIndex(idx) === canonical && !removalPriority.includes(idx)) {
                    removalPriority.push(idx);
                }
            }
        }

        // Remove contexts according to priority until we have enough space
        const toRemove = removalPriority.slice(0, removeCount);

        this.logger.info(
            `[ContextPool] Pre-cleanup: removing ${toRemove.length} contexts before switch to #${targetAuthIndex}: [${toRemove}] (${this.contexts.size} ready + ${this.initializingContexts.size} initializing)`
        );

        for (const idx of toRemove) {
            await this.closeContext(idx);
        }
    }

    /**
     * Rebalance context pool after account changes
     * Removes excess contexts and starts missing ones in background
     */
    async rebalanceContextPool() {
        const maxContexts = this.config.maxContexts;
        // maxContexts === 0 means unlimited pool size
        const isUnlimited = maxContexts === 0;

        // Build full rotation ordered from current account
        const rotation = this.authSource.getRotationIndices();
        const currentCanonical =
            this._currentAuthIndex >= 0 ? this.authSource.getCanonicalIndex(this._currentAuthIndex) : null;
        const startPos = currentCanonical !== null ? Math.max(rotation.indexOf(currentCanonical), 0) : 0;
        const ordered = [];
        for (let i = 0; i < rotation.length; i++) {
            ordered.push(rotation[(startPos + i) % rotation.length]);
        }

        // Targets = first maxContexts from ordered (or all available if unlimited)
        // In unlimited mode, include all valid accounts (rotation + duplicates)
        let targets;
        if (isUnlimited) {
            targets = new Set(this.authSource.availableIndices);
        } else {
            targets = new Set(ordered.slice(0, maxContexts));
        }

        // Remove contexts not in targets (except current)
        // Special handling: if current account is a duplicate (old version), also remove its canonical version
        // BUT only in limited mode - in unlimited mode, keep all contexts
        const toRemove = [];
        const currentCanonicalIndex = currentCanonical; // Already calculated above
        const isDuplicateAccount =
            this._currentAuthIndex >= 0 &&
            currentCanonicalIndex !== null &&
            currentCanonicalIndex !== this._currentAuthIndex;

        for (const idx of this.contexts.keys()) {
            // Skip current account
            if (idx === this._currentAuthIndex) continue;

            // If current is a duplicate AND we're in limited mode, remove the canonical version (we're using the old one)
            if (!isUnlimited && isDuplicateAccount && idx === currentCanonicalIndex) {
                toRemove.push(idx);
                continue;
            }

            // Remove if not in targets
            if (!targets.has(idx)) {
                toRemove.push(idx);
            }
        }

        // Candidates: all accounts from ordered that are not yet initialized
        // Pass the full ordered list to allow fallback if target accounts fail
        // The background task will stop when poolSize is reached
        // Convert activeContexts to canonical indices to handle duplicate accounts
        const activeContextsRaw = new Set([...this.contexts.keys()].filter(idx => !toRemove.includes(idx)));
        const activeContexts = new Set(
            [...activeContextsRaw].map(idx => this.authSource.getCanonicalIndex(idx) ?? idx)
        );
        // Don't filter out initializingContexts here - let _executePreloadTask handle it
        // This ensures that if a background task is aborted, the account will be retried
        // If a foreground task is running, _executePreloadTask will skip it (line 1382)
        const candidates = ordered.filter(idx => !activeContexts.has(idx));

        this.logger.info(
            `[ContextPool] Rebalance: targets=[${[...targets]}], remove=[${toRemove}], candidates=[${candidates}]`
        );

        for (const idx of toRemove) {
            await this.closeContext(idx);
        }

        // Preload candidates if we have room in the pool
        if (candidates.length > 0 && (isUnlimited || this.contexts.size < maxContexts)) {
            this._preloadBackgroundContexts(candidates, isUnlimited ? 0 : maxContexts);
        }
    }

    /**
     * Wait for a background context initialization to complete
     * @param {number} authIndex - The auth index to wait for
     * @param {number} timeoutMs - Timeout in milliseconds
     */
    async _waitForContextInit(authIndex, timeoutMs = 120000) {
        const start = Date.now();
        while (this.initializingContexts.has(authIndex)) {
            if (Date.now() - start > timeoutMs) {
                throw new Error(`Timeout waiting for context #${authIndex} initialization`);
            }
            await new Promise(r => setTimeout(r, 500));
        }
    }

    /**
     * Initialize a single context for the given auth index
     * This is a helper method used by both preloadContextPool and launchOrSwitchContext
     * @param {number} authIndex - The auth index to initialize
     * @param {boolean} isBackgroundTask - Whether this is a background preload task (can be aborted by _backgroundPreloadAbort)
     * @returns {Promise<{context, page}>}
     */
    async _initializeContext(authIndex, isBackgroundTask = false) {
        let context = null;
        let page = null;

        try {
            // Check if this context has been marked for abort before starting
            if (this.abortedContexts.has(authIndex)) {
                throw new Error(`Context initialization aborted for index ${authIndex} (marked for deletion)`);
            }

            // Check if background preload was aborted (only for background tasks)
            if (isBackgroundTask && this._backgroundPreloadAbort) {
                throw new Error(`Context initialization aborted for index ${authIndex} (background preload aborted)`);
            }

            // Initialize per-context WebSocket state to ensure clean state for this context
            // Each context gets its own state object, preventing cross-contamination
            // between concurrent init/reconnect operations on different accounts
            this._wsInitState.set(authIndex, { failed: false, success: false });

            const proxyConfig = parseProxyFromEnv();
            const storageStateObject = this.authSource.getAuth(authIndex);
            if (!storageStateObject) {
                throw new Error(`Failed to get or parse auth source for index ${authIndex}.`);
            }

            // Viewport Randomization
            const randomWidth = 1920 + Math.floor(Math.random() * 50);
            const randomHeight = 1080 + Math.floor(Math.random() * 50);

            // Check abort status before expensive operations
            if (this.abortedContexts.has(authIndex) || (isBackgroundTask && this._backgroundPreloadAbort)) {
                throw new Error(`Context initialization aborted for index ${authIndex} (marked for deletion)`);
            }

            context = await this.browser.newContext({
                deviceScaleFactor: 1,
                storageState: storageStateObject,
                viewport: { height: randomHeight, width: randomWidth },
                ...(proxyConfig ? { proxy: proxyConfig } : {}),
            });

            // Check abort status after context creation
            if (this.abortedContexts.has(authIndex) || (isBackgroundTask && this._backgroundPreloadAbort)) {
                throw new Error(`Context initialization aborted for index ${authIndex} (marked for deletion)`);
            }

            // Inject Privacy Script immediately after context creation
            const privacyScript = this._getPrivacyProtectionScript(authIndex);
            await context.addInitScript(privacyScript);

            page = await context.newPage();

            // Pure JS Wakeup (Focus & Mouse Movement)
            try {
                await page.bringToFront();
                // eslint-disable-next-line no-undef
                await page.evaluate(() => window.focus());
                const vp = page.viewportSize() || { height: 1080, width: 1920 };
                const startX = Math.floor(Math.random() * (vp.width * 0.5));
                const startY = Math.floor(Math.random() * (vp.height * 0.5));
                await this._simulateHumanMovement(page, startX, startY);
            } catch (e) {
                this.logger.warn(`[Context#${authIndex}] Wakeup minor error: ${e.message}`);
            }

            page.on("console", msg => {
                const msgText = msg.text();
                if (msgText.includes("Content-Security-Policy")) {
                    return;
                }

                // Filter out WebGL not supported warning (expected when GPU is disabled for privacy)
                if (msgText.includes("WebGL not supported")) {
                    return;
                }

                if (msgText.includes("[ProxyClient]")) {
                    this.logger.info(`[Context#${authIndex}] ${msgText.replace("[ProxyClient] ", "")}`);
                } else if (msg.type() === "error") {
                    this.logger.error(`[Context#${authIndex} Page Error] ${msgText}`);
                }

                // Check for WebSocket initialization status
                if (msgText.includes("Connection successful")) {
                    this.logger.debug(
                        `[Context#${authIndex}] ✅ Detected successful WebSocket connection from browser`
                    );
                    const s = this._wsInitState.get(authIndex);
                    if (s) s.success = true;
                } else if (msgText.includes("WebSocket initialization failed")) {
                    this.logger.warn(
                        `[Context#${authIndex}] ❌ Detected WebSocket initialization failure from browser`
                    );
                    const s = this._wsInitState.get(authIndex);
                    if (s) s.failed = true;
                }
            });

            // Check abort status before navigation (most time-consuming part)
            if (this.abortedContexts.has(authIndex) || (isBackgroundTask && this._backgroundPreloadAbort)) {
                throw new Error(`Context initialization aborted for index ${authIndex} (marked for deletion)`);
            }

            await this._navigateAndWakeUpPage(page, `[Context#${authIndex}]`);

            // Check abort status after navigation
            if (this.abortedContexts.has(authIndex) || (isBackgroundTask && this._backgroundPreloadAbort)) {
                throw new Error(`Context initialization aborted for index ${authIndex} (marked for deletion)`);
            }

            await this._checkPageStatusAndErrors(page, `[Context#${authIndex}]`);

            if (this.abortedContexts.has(authIndex) || (isBackgroundTask && this._backgroundPreloadAbort)) {
                throw new Error(`Context initialization aborted for index ${authIndex} (marked for deletion)`);
            }

            await this._handlePopups(page, `[Context#${authIndex}]`);

            if (this.abortedContexts.has(authIndex) || (isBackgroundTask && this._backgroundPreloadAbort)) {
                throw new Error(`Context initialization aborted for index ${authIndex} (marked for deletion)`);
            }

            // Try to click Launch button if it exists (not a popup, but a page button)
            await this._tryClickLaunchButton(page, `[Context#${authIndex}]`);

            // Wait for WebSocket initialization (no retry)
            // Check if initialization already succeeded (console listener may have detected it)
            const wsState = this._wsInitState.get(authIndex);
            if (wsState && wsState.success) {
                this.logger.info(`[Context#${authIndex}] ✅ WebSocket already initialized, skipping wait`);
            } else {
                // Wait for WebSocket initialization (60 second timeout)
                const initSuccess = await this._waitForWebSocketInit(
                    page,
                    `[Context#${authIndex}]`,
                    60000,
                    authIndex,
                    isBackgroundTask
                );

                if (!initSuccess) {
                    throw new Error("WebSocket initialization failed. Please check browser logs and page errors.");
                }
            }

            // Final check before adding to contexts map
            if (this.abortedContexts.has(authIndex) || (isBackgroundTask && this._backgroundPreloadAbort)) {
                throw new Error(`Context initialization aborted for index ${authIndex} (marked for deletion)`);
            }

            // Save to contexts map - with atomic abort check to prevent race condition
            // between the check above and actually adding to the map
            if (!this.abortedContexts.has(authIndex) && !(isBackgroundTask && this._backgroundPreloadAbort)) {
                this.contexts.set(authIndex, {
                    context,
                    healthMonitorInterval: null,
                    page,
                });
            } else {
                throw new Error(`Context initialization aborted for index ${authIndex} (marked for deletion)`);
            }

            // Update auth file
            await this._updateAuthFile(authIndex);

            return { context, page };
        } catch (error) {
            // Check if this is an abort error
            const isAbortError = error.message && error.message.includes("aborted for index");
            if (isAbortError) {
                this.logger.info(`[Browser] Context #${authIndex} initialization aborted as requested.`);
            } else {
                this.logger.error(`❌ [Browser] Context initialization failed for index ${authIndex}, cleaning up...`);
            }

            // Save debug artifacts before closing the page (only for non-abort errors)
            if (!isAbortError && page && !page.isClosed()) {
                await this._saveDebugArtifacts("init_failed", authIndex, page);
            }

            // Remove from contexts map if it was added
            if (this.contexts.has(authIndex)) {
                this.contexts.delete(authIndex);
                this.logger.info(`[Browser] Removed failed context #${authIndex} from contexts map`);
            }

            // Close context if it was created
            if (context) {
                try {
                    await context.close();
                    if (isAbortError) {
                        this.logger.info(`[Browser] Cleaned up aborted context for index ${authIndex}`);
                    } else {
                        this.logger.info(`[Browser] Cleaned up leaked context for index ${authIndex}`);
                    }
                } catch (closeError) {
                    this.logger.warn(`[Browser] Failed to close context during cleanup: ${closeError.message}`);
                }
            }
            throw error;
        } finally {
            // Ensure cleanup of tracking sets even if error is thrown
            this.initializingContexts.delete(authIndex);
            this.abortedContexts.delete(authIndex);
        }
    }

    async launchOrSwitchContext(authIndex) {
        if (typeof authIndex !== "number" || authIndex < 0) {
            this.logger.error(`[Browser] Invalid authIndex: ${authIndex}. authIndex must be >= 0.`);
            this._currentAuthIndex = -1;
            throw new Error(`Invalid authIndex: ${authIndex}. Must be >= 0.`);
        }

        // [Auth Switch] Save current auth data before switching
        if (this.browser && this._currentAuthIndex >= 0 && this._currentAuthIndex !== authIndex) {
            try {
                await this._updateAuthFile(this._currentAuthIndex);
            } catch (e) {
                this.logger.warn(`[Browser] Failed to save current auth during switch: ${e.message}`);
            }
        }

        // Wait for background initialization if in progress
        if (this.initializingContexts.has(authIndex)) {
            this.logger.info(`[Browser] Context #${authIndex} is being initialized in background, waiting...`);
            await this._waitForContextInit(authIndex);
        }

        // Check if browser is running, launch if needed
        if (!this.browser) {
            await this._ensureBrowser();
        }

        // Check if context already exists (fast switch path)
        if (this.contexts.has(authIndex)) {
            this.logger.info("==================================================");
            this.logger.info(`⚡ [FastSwitch] Switching to pre-loaded context for account #${authIndex}`);
            this.logger.info("==================================================");

            // Validate that the page is still alive before switching
            const contextData = this.contexts.get(authIndex);
            if (!contextData || !contextData.page || contextData.page.isClosed()) {
                this.logger.warn(
                    `[FastSwitch] Page for account #${authIndex} is closed, cleaning up and re-initializing...`
                );
                // Clean up the dead context
                await this.closeContext(authIndex);
                // Fall through to slow path to re-initialize
            } else {
                // Quick auth status check without navigation
                try {
                    const currentUrl = contextData.page.url();
                    const pageTitle = await contextData.page.title();

                    // Check if redirected to login page (auth expired)
                    if (
                        currentUrl.includes("accounts.google.com") ||
                        currentUrl.includes("ServiceLogin") ||
                        pageTitle.includes("Sign in") ||
                        pageTitle.includes("登录")
                    ) {
                        this.logger.warn(
                            `[FastSwitch] Account #${authIndex} auth expired (redirected to login), cleaning up and re-initializing...`
                        );
                        // Clean up the expired context
                        await this.closeContext(authIndex);
                        // Fall through to slow path to re-initialize
                    } else {
                        // Page is alive and auth is valid, proceed with fast switch
                        // Stop background tasks for old context
                        if (this._currentAuthIndex >= 0 && this.contexts.has(this._currentAuthIndex)) {
                            const oldContextData = this.contexts.get(this._currentAuthIndex);
                            if (oldContextData.healthMonitorInterval) {
                                clearInterval(oldContextData.healthMonitorInterval);
                                oldContextData.healthMonitorInterval = null;
                            }
                        }

                        // Switch to new context
                        this._activateContext(contextData.context, contextData.page, authIndex);

                        this.logger.info(`✅ [FastSwitch] Switched to account #${authIndex} instantly!`);
                        return;
                    }
                } catch (error) {
                    this.logger.warn(
                        `[FastSwitch] Failed to check auth status for account #${authIndex}: ${error.message}, cleaning up and re-initializing...`
                    );
                    // Clean up the problematic context
                    await this.closeContext(authIndex);
                    // Fall through to slow path to re-initialize
                }
            }
        }

        // Context doesn't exist, need to initialize it (slow path)
        this.logger.info("==================================================");
        this.logger.info(`🔄 [Browser] Context for account #${authIndex} not found, initializing...`);
        this.logger.info("==================================================");

        // Check again if another caller started initializing while we were checking
        // This protects against race condition where multiple callers finish waiting
        // at the same time and all try to initialize the same context
        if (this.initializingContexts.has(authIndex)) {
            this.logger.info(`[Browser] Another caller is initializing context #${authIndex}, waiting...`);
            await this._waitForContextInit(authIndex);
            // After waiting, recursively call to use the fast path or retry
            return await this.launchOrSwitchContext(authIndex);
        }

        this.initializingContexts.add(authIndex);

        try {
            // Stop background tasks for old context
            if (this._currentAuthIndex >= 0 && this.contexts.has(this._currentAuthIndex)) {
                const oldContextData = this.contexts.get(this._currentAuthIndex);
                if (oldContextData.healthMonitorInterval) {
                    clearInterval(oldContextData.healthMonitorInterval);
                    oldContextData.healthMonitorInterval = null;
                }
            }

            // Initialize new context (isBackgroundTask=false for foreground initialization)
            const { context, page } = await this._initializeContext(authIndex, false);

            this._activateContext(context, page, authIndex);

            this.logger.info("==================================================");
            this.logger.info(`✅ [Browser] Account ${authIndex} context initialized successfully!`);
            this.logger.info("✅ [Browser] Browser client is ready.");
            this.logger.info("==================================================");
        } catch (error) {
            this.logger.error(`❌ [Browser] Account ${authIndex} context initialization failed: ${error.message}`);
            // Debug artifacts are already saved in _initializeContext's catch block

            // Clean up if HealthMonitor was started
            if (this.contexts.has(authIndex)) {
                const contextData = this.contexts.get(authIndex);
                if (contextData.healthMonitorInterval) {
                    clearInterval(contextData.healthMonitorInterval);
                    this.logger.info(`[Browser] Cleaned up health monitor for failed context #${authIndex}`);
                }
            }

            // Reset state
            this.context = null;
            this.page = null;
            this._currentAuthIndex = -1;
            // DO NOT reset backgroundWakeupRunning here!
            // If a BackgroundWakeup was running, it will detect this.page === null and exit on its own.
            // Resetting the flag here could allow a new instance to start before the old one exits.

            throw error;
        }
    }

    /**
     * Lightweight Reconnect: Refreshes the page and clicks "Continue to the app" button
     * without restarting the entire browser instance.
     *
     * This method is called when WebSocket connection is lost but the browser
     * process is still running. It's much faster than a full browser restart.
     *
     * @returns {Promise<boolean>} true if reconnect was successful, false otherwise
     */
    /**
     * Attempt lightweight reconnect for a specific account
     * Refreshes the page and re-injects the proxy script without restarting the browser
     * @param {number} authIndex - The auth index to reconnect (defaults to current if not specified)
     * @returns {Promise<boolean>} true if reconnect was successful, false otherwise
     */
    async attemptLightweightReconnect(authIndex = null) {
        // Use provided authIndex or fall back to current
        const targetAuthIndex = authIndex !== null ? authIndex : this._currentAuthIndex;

        if (targetAuthIndex < 0) {
            this.logger.warn("[Reconnect] Invalid auth index, cannot perform lightweight reconnect.");
            return false;
        }

        // Get the context data for this account
        const contextData = this.contexts.get(targetAuthIndex);
        if (!contextData || !contextData.page) {
            this.logger.warn(
                `[Reconnect] No context found for account #${targetAuthIndex}, cannot perform lightweight reconnect.`
            );
            return false;
        }

        const page = contextData.page;

        // Verify browser and page are still valid
        if (!this.browser || !page) {
            this.logger.warn(
                `[Reconnect] Browser or page is not available for account #${targetAuthIndex}, cannot perform lightweight reconnect.`
            );
            return false;
        }

        // Check if page is closed
        if (page.isClosed()) {
            this.logger.warn(
                `[Reconnect] Page is closed for account #${targetAuthIndex}, cannot perform lightweight reconnect.`
            );
            return false;
        }

        this.logger.info("==================================================");
        this.logger.info(`🔄 [Reconnect] Starting lightweight reconnect for account #${targetAuthIndex}...`);
        this.logger.info("==================================================");

        // Stop existing background tasks only if this is the current account
        const isCurrentAccount = targetAuthIndex === this._currentAuthIndex;
        if (isCurrentAccount) {
            const ctxData = this.contexts.get(targetAuthIndex);
            if (ctxData && ctxData.healthMonitorInterval) {
                clearInterval(ctxData.healthMonitorInterval);
                ctxData.healthMonitorInterval = null;
                this.logger.info("[Reconnect] Stopped background health monitor.");
            }
        }

        try {
            // Reset per-context WebSocket state to ensure clean state for reconnection
            this._wsInitState.set(targetAuthIndex, { failed: false, success: false });
            this.logger.info("[Reconnect] Reset WebSocket initialization state");

            // Navigate to target page and wake it up
            await this._navigateAndWakeUpPage(page, "[Reconnect]");

            // Check for cookie expiration, region restrictions, and other errors
            await this._checkPageStatusAndErrors(page, "[Reconnect]");

            // Handle various popups (Cookie consent, Got it, Onboarding, etc.)
            await this._handlePopups(page, "[Reconnect]");

            // Try to click Launch button if it exists (not a popup, but a page button)
            await this._tryClickLaunchButton(page, "[Reconnect]");

            // Wait for WebSocket initialization (no retry)
            // Check if initialization already succeeded (console listener may have detected it)
            const wsState = this._wsInitState.get(targetAuthIndex);
            if (wsState && wsState.success) {
                this.logger.info(`[Reconnect] ✅ WebSocket already initialized, skipping wait`);
            } else {
                // Wait for WebSocket initialization (60 second timeout)
                const initSuccess = await this._waitForWebSocketInit(
                    page,
                    "[Reconnect]",
                    60000,
                    targetAuthIndex,
                    false
                );

                if (!initSuccess) {
                    this.logger.error("[Reconnect] WebSocket initialization failed.");
                    return false;
                }
            }

            this._sendActiveTrigger("[Reconnect]");

            // [Auth Update] Save the refreshed cookies to the auth file immediately
            await this._updateAuthFile(targetAuthIndex);

            this.logger.info("==================================================");
            this.logger.info(`✅ [Reconnect] Lightweight reconnect successful for account #${targetAuthIndex}!`);
            this.logger.info("==================================================");

            // Restart background tasks only if this is the current account
            if (isCurrentAccount) {
                // Reset BackgroundWakeup state after reconnect
                this.noButtonCount = 0;
                this._startHealthMonitor();
                this._startBackgroundWakeup(); // Internal check prevents duplicate instances
            }

            return true;
        } catch (error) {
            this.logger.error(
                `❌ [Reconnect] Lightweight reconnect failed for account #${targetAuthIndex}: ${error.message}`
            );
            await this._saveDebugArtifacts("reconnect_failed", targetAuthIndex);
            return false;
        }
    }

    /**
     * Close a single context for a specific account
     *
     * IMPORTANT: When deleting an account, always call this method BEFORE closeConnectionByAuth()
     * Calling order: closeContext() -> closeConnectionByAuth()
     *
     * Reason: This method removes the context from the contexts Map BEFORE closing it.
     * When context.close() triggers WebSocket disconnect, ConnectionRegistry._removeConnection()
     * will check if the context still exists. If not found, it skips reconnect logic.
     * If you call closeConnectionByAuth() first, _removeConnection() will see the context
     * still exists and may trigger unnecessary reconnect attempts.
     *
     * @param {number} authIndex - The auth index to close
     */
    async closeContext(authIndex) {
        // If context is being initialized in background, signal abort and wait
        if (this.initializingContexts.has(authIndex)) {
            this.logger.info(`[Browser] Context #${authIndex} is being initialized, marking for abort and waiting...`);
            this.abortedContexts.add(authIndex);
            await this._waitForContextInit(authIndex);
            this.abortedContexts.delete(authIndex);
        }

        if (!this.contexts.has(authIndex)) {
            // Context doesn't exist (was never initialized or was aborted)
            // Still check if we need to close the browser
            // Only close if there are no contexts AND no contexts being initialized
            if (this.contexts.size === 0 && this.initializingContexts.size === 0 && this.browser) {
                this.logger.info(`[Browser] All contexts closed, closing browser instance...`);
                await this.closeBrowser();
            }
            return;
        }

        const contextData = this.contexts.get(authIndex);

        // Stop health monitor for this context
        if (contextData.healthMonitorInterval) {
            clearInterval(contextData.healthMonitorInterval);
            contextData.healthMonitorInterval = null;
            this.logger.info(`[Browser] Stopped health monitor for context #${authIndex}`);
        }

        // Remove from contexts map FIRST, before closing context
        // This ensures that when context.close() triggers WebSocket disconnect,
        // _removeConnection will see that the context is already gone and skip reconnect logic
        this.contexts.delete(authIndex);

        // If this was the current context, reset current references
        if (this._currentAuthIndex === authIndex) {
            this.context = null;
            this.page = null;
            this._currentAuthIndex = -1;
            // DO NOT reset backgroundWakeupRunning here!
            // If a BackgroundWakeup was running, it will detect this.page === null and exit on its own.
            // Resetting the flag here could allow a new instance to start before the old one exits.
            this.logger.info(`[Browser] Current context was closed, currentAuthIndex reset to -1.`);
        }

        // Close the context AFTER removing from map
        try {
            if (contextData.context) {
                await contextData.context.close();
                this.logger.info(`[Browser] Context #${authIndex} closed.`);
            }
        } catch (e) {
            this.logger.warn(`[Browser] Error closing context #${authIndex}: ${e.message}`);
        }

        // If this was the last context, close the browser to free resources
        // This ensures a clean state when all accounts are deleted
        // Only close if there are no contexts AND no contexts being initialized
        if (this.contexts.size === 0 && this.initializingContexts.size === 0 && this.browser) {
            this.logger.info(`[Browser] All contexts closed, closing browser instance...`);
            await this.closeBrowser();
        }
    }

    /**
     * Helper: Clean up all context resources (health monitors, etc.)
     * Called when browser is closing or has disconnected
     */
    _cleanupAllContexts() {
        // Clean up all context health monitors
        for (const [authIndex, contextData] of this.contexts.entries()) {
            if (contextData.healthMonitorInterval) {
                clearInterval(contextData.healthMonitorInterval);
                contextData.healthMonitorInterval = null;
                this.logger.info(`[Browser] Stopped health monitor for context #${authIndex}`);
            }
        }

        // Reset all references
        this.contexts.clear();
        this.initializingContexts.clear();
        this.abortedContexts.clear();
        this._wsInitState.clear();
        this.context = null;
        this.page = null;
        this._currentAuthIndex = -1;
        // DO NOT reset backgroundWakeupRunning here!
        // If a BackgroundWakeup was running, it will detect this.page === null and exit on its own.
        // Resetting the flag here could allow a new instance to start before the old one exits.
    }

    /**
     * Unified cleanup method for the main browser instance.
     * Handles intervals, timeouts, and resetting all references.
     * In multi-context mode, cleans up all contexts.
     */
    async closeBrowser() {
        // Set flag to indicate intentional close - prevents ConnectionRegistry from
        // attempting lightweight reconnect when WebSocket disconnects
        this.isClosingIntentionally = true;

        // Legacy single health monitor cleanup (for backward compatibility)
        if (this.healthMonitorInterval) {
            clearInterval(this.healthMonitorInterval);
            this.healthMonitorInterval = null;
        }

        if (this.browser) {
            this.logger.info("[Browser] Closing main browser instance and all contexts...");
            try {
                // Give close() 5 seconds, otherwise force proceed
                await Promise.race([this.browser.close(), new Promise(resolve => setTimeout(resolve, 5000))]);
            } catch (e) {
                this.logger.warn(`[Browser] Error during close (ignored): ${e.message}`);
            }

            this.browser = null;
            this._cleanupAllContexts();
            this.logger.info("[Browser] Main browser instance and all contexts closed, currentAuthIndex reset to -1.");
        }

        // Reset flag after close is complete
        this.isClosingIntentionally = false;
    }

    async switchAccount(newAuthIndex) {
        this.logger.info(`🔄 [Browser] Starting account switch: from ${this._currentAuthIndex} to ${newAuthIndex}`);
        await this.launchOrSwitchContext(newAuthIndex);
        this.logger.info(`✅ [Browser] Account switch completed, current account: ${this._currentAuthIndex}`);
    }
}

module.exports = BrowserManager;

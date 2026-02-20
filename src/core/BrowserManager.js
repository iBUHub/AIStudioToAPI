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
        this.context = null;
        this.page = null;
        // currentAuthIndex is the single source of truth for current account, accessed via getter/setter
        // -1 means no account is currently active (invalid/error state)
        this._currentAuthIndex = -1;

        // Flag to distinguish intentional close from unexpected disconnect
        // Used by ConnectionRegistry callback to skip unnecessary reconnect attempts
        this.isClosingIntentionally = false;

        // Added for background wakeup logic from new core
        this.noButtonCount = 0;

        // WebSocket initialization flags - track browser-side initialization status
        this._wsInitSuccess = false;
        this._wsInitFailed = false;
        this._consoleListenerRegistered = false;

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
    async _checkPageErrors() {
        try {
            const hasError = await this.page.evaluate(() => {
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
            return hasError;
        } catch (e) {
            return { appletFailed: false, concurrentUpdates: false, snapshotFailed: false };
        }
    }

    /**
     * Helper: Wait for WebSocket initialization with log monitoring
     * @param {string} logPrefix - Log prefix for messages
     * @param {number} timeout - Timeout in milliseconds (default 60000)
     * @returns {Promise<boolean>} true if initialization succeeded, false if failed
     */
    async _waitForWebSocketInit(logPrefix = "[Browser]", timeout = 60000) {
        this.logger.info(`${logPrefix} ⏳ Waiting for WebSocket initialization (timeout: ${timeout / 1000}s)...`);

        // Don't reset flags here - they should be reset before calling this method
        // This allows the method to detect if initialization already completed

        const startTime = Date.now();
        const checkInterval = 1000; // Check every 1 second

        try {
            while (Date.now() - startTime < timeout) {
                // Check if initialization succeeded
                if (this._wsInitSuccess) {
                    return true;
                }

                // Check if initialization failed
                if (this._wsInitFailed) {
                    this.logger.warn(`${logPrefix} Initialization failed, will attempt refresh...`);
                    return false;
                }

                // Check for page errors
                const errors = await this._checkPageErrors();
                if (errors.appletFailed || errors.concurrentUpdates || errors.snapshotFailed) {
                    this.logger.warn(
                        `${logPrefix} Detected page error: ${JSON.stringify(errors)}, will attempt refresh...`
                    );
                    return false;
                }

                // Wait before next check
                await this.page.waitForTimeout(checkInterval);
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
        if (!this.context) return;

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

            const storageState = await this.context.storageState();

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
    async _smartClickCode(page) {
        const selectors = [
            // Priority 1: Exact text match (Fastest)
            'button:text("Code")',
            // Priority 2: Alternative texts used by Google
            'button:text("Develop")',
            'button:text("Edit")',
            // Priority 3: Fuzzy attribute matching
            'button[aria-label*="Code"]',
            'button[aria-label*="code"]',
            // Priority 4: Icon based
            'button mat-icon:text("code")',
            'button span:has-text("Code")',
        ];

        this.logger.info('[Browser] Trying to locate "Code" entry point using smart selectors...');

        for (const selector of selectors) {
            try {
                // Use a short timeout for quick fail-over
                const element = page.locator(selector).first();
                if (await element.isVisible({ timeout: 2000 })) {
                    this.logger.info(`[Browser] ✅ Smart match: "${selector}", clicking...`);
                    // Direct click with force as per new logic
                    await element.click({ force: true, timeout: 10000 });
                    return true;
                }
            } catch (e) {
                // Ignore timeout for single selector, try next
            }
        }

        throw new Error('Unable to find "Code" button or alternatives (Smart Click Failed)');
    }

    /**
     * Helper: Load and configure build.js script content
     * Applies environment-specific configurations (TARGET_DOMAIN, WS_PORT, LOG_LEVEL)
     * @returns {string} Configured build.js script content
     */
    _loadAndConfigureBuildScript() {
        let buildScriptContent = fs.readFileSync(
            path.join(__dirname, "..", "..", "scripts", "client", "build.js"),
            "utf-8"
        );

        if (process.env.TARGET_DOMAIN) {
            const lines = buildScriptContent.split("\n");
            let domainReplaced = false;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes("this.targetDomain =")) {
                    this.logger.info(`[Config] Found targetDomain line: ${lines[i]}`);
                    lines[i] = `        this.targetDomain = "${process.env.TARGET_DOMAIN}";`;
                    this.logger.info(`[Config] Replaced with: ${lines[i]}`);
                    domainReplaced = true;
                    break;
                }
            }
            if (domainReplaced) {
                buildScriptContent = lines.join("\n");
            } else {
                this.logger.warn("[Config] Failed to find targetDomain line in build.js, ignoring.");
            }
        }

        if (process.env.WS_PORT) {
            const lines = buildScriptContent.split("\n");
            let portReplaced = false;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('constructor(endpoint = "ws://127.0.0.1:9998")')) {
                    this.logger.info(`[Config] Found port config line: ${lines[i]}`);
                    lines[i] = `    constructor(endpoint = "ws://127.0.0.1:${process.env.WS_PORT}") {`;
                    this.logger.info(`[Config] Replaced with: ${lines[i]}`);
                    portReplaced = true;
                    break;
                }
            }
            if (portReplaced) {
                buildScriptContent = lines.join("\n");
            } else {
                this.logger.warn("[Config] Failed to find port config line in build.js, using default.");
            }
        }

        // Inject LOG_LEVEL configuration into build.js
        // Read from LoggingService.currentLevel instead of environment variable
        // This ensures runtime log level changes are respected when browser restarts
        const LoggingService = require("../utils/LoggingService");
        const currentLogLevel = LoggingService.currentLevel; // 0=DEBUG, 1=INFO, 2=WARN, 3=ERROR
        const currentLogLevelName = LoggingService.getLevel(); // "DEBUG", "INFO", etc.

        if (currentLogLevel !== 1) {
            const lines = buildScriptContent.split("\n");
            let levelReplaced = false;
            for (let i = 0; i < lines.length; i++) {
                // Match "currentLevel: <number>," pattern, ignoring comments
                // This is more robust than looking for specific comments like "// Default: INFO"
                if (/^\s*currentLevel:\s*\d+/.test(lines[i])) {
                    this.logger.info(`[Config] Found LOG_LEVEL config line: ${lines[i]}`);
                    lines[i] = `    currentLevel: ${currentLogLevel}, // Injected: ${currentLogLevelName}`;
                    this.logger.info(`[Config] Replaced with: ${lines[i]}`);
                    levelReplaced = true;
                    break;
                }
            }
            if (levelReplaced) {
                buildScriptContent = lines.join("\n");
            } else {
                this.logger.warn("[Config] Failed to find LOG_LEVEL config line in build.js, using default INFO.");
            }
        }

        return buildScriptContent;
    }

    /**
     * Helper: Inject script into editor and activate
     * Contains the common UI interaction logic for both launchOrSwitchContext and attemptLightweightReconnect
     * @param {string} buildScriptContent - The script content to inject
     * @param {string} logPrefix - Log prefix for step messages (e.g., "[Browser]" or "[Reconnect]")
     */
    async _injectScriptToEditor(buildScriptContent, logPrefix = "[Browser]") {
        this.logger.info(`${logPrefix} Preparing UI interaction, forcefully removing all possible overlay layers...`);
        /* eslint-disable no-undef */
        await this.page.evaluate(() => {
            const overlays = document.querySelectorAll("div.cdk-overlay-backdrop");
            if (overlays.length > 0) {
                console.log(`[ProxyClient] (Internal JS) Found and removed ${overlays.length} overlay layers.`);
                overlays.forEach(el => el.remove());
            }
        });
        /* eslint-enable no-undef */

        this.logger.info(`${logPrefix} (Step 1/5) Preparing to click "Code" button...`);
        const maxTimes = 15;
        for (let i = 1; i <= maxTimes; i++) {
            try {
                this.logger.info(`  [Attempt ${i}/${maxTimes}] Cleaning overlay layers and clicking...`);
                /* eslint-disable no-undef */
                await this.page.evaluate(() => {
                    document.querySelectorAll("div.cdk-overlay-backdrop").forEach(el => el.remove());
                });
                /* eslint-enable no-undef */
                await this.page.waitForTimeout(500);

                // Use Smart Click instead of hardcoded locator
                await this._smartClickCode(this.page);

                this.logger.info("  ✅ Click successful!");
                break;
            } catch (error) {
                this.logger.warn(`  [Attempt ${i}/${maxTimes}] Click failed: ${error.message.split("\n")[0]}`);
                if (i === maxTimes) {
                    throw new Error(`Unable to click "Code" button after multiple attempts, initialization failed.`);
                }
            }
        }

        this.logger.info(
            `${logPrefix} (Step 2/5) "Code" button clicked successfully, waiting for editor to become visible...`
        );
        const editorContainerLocator = this.page.locator("div.monaco-editor").first();
        await editorContainerLocator.waitFor({
            state: "visible",
            timeout: 60000,
        });

        this.logger.info(
            `${logPrefix} (Cleanup #2) Preparing to click editor, forcefully removing all possible overlay layers again...`
        );
        /* eslint-disable no-undef */
        await this.page.evaluate(() => {
            const overlays = document.querySelectorAll("div.cdk-overlay-backdrop");
            if (overlays.length > 0) {
                console.log(
                    `[ProxyClient] (Internal JS) Found and removed ${overlays.length} newly appeared overlay layers.`
                );
                overlays.forEach(el => el.remove());
            }
        });
        /* eslint-enable no-undef */
        await this.page.waitForTimeout(250);

        this.logger.info(`${logPrefix} (Step 3/5) Editor displayed, focusing and pasting script...`);
        await editorContainerLocator.click({ timeout: 30000 });

        /* eslint-disable no-undef */
        await this.page.evaluate(text => navigator.clipboard.writeText(text), buildScriptContent);
        /* eslint-enable no-undef */
        const isMac = os.platform() === "darwin";
        const pasteKey = isMac ? "Meta+V" : "Control+V";
        await this.page.keyboard.press(pasteKey);
        this.logger.info(`${logPrefix} (Step 4/5) Script pasted.`);
        this.logger.info(`${logPrefix} (Step 5/5) Clicking "Preview" button to activate script...`);
        await this.page.locator('button:text("Preview")').click();
        this.logger.info(`${logPrefix} ✅ UI interaction complete, script is now running.`);

        // Active Trigger (Hack to wake up Google Backend)
        this.logger.info(`${logPrefix} ⚡ Sending active trigger request to Launch flow...`);
        try {
            await this.page.evaluate(async () => {
                try {
                    await fetch("https://generativelanguage.googleapis.com/v1beta/models?key=ActiveTrigger", {
                        headers: { "Content-Type": "application/json" },
                        method: "GET",
                    });
                } catch (e) {
                    console.log("[ProxyClient] Active trigger sent");
                }
            });
        } catch (e) {
            /* empty */
        }

        this._startHealthMonitor();
    }

    /**
     * Helper: Navigate to target page and wake up the page
     * Contains the common navigation and page activation logic
     * @param {string} logPrefix - Log prefix for messages (e.g., "[Browser]" or "[Reconnect]")
     */
    async _navigateAndWakeUpPage(logPrefix = "[Browser]") {
        this.logger.info(`${logPrefix} Navigating to target page...`);
        const targetUrl = "https://ai.studio/apps/0400c62c-9bcb-48c1-b056-9b5cf4cb5603";
        await this.page.goto(targetUrl, {
            timeout: 180000,
            waitUntil: "domcontentloaded",
        });
        this.logger.info(`${logPrefix} Page loaded.`);

        // Wake up window using JS and Human Movement
        try {
            await this.page.bringToFront();

            // Get viewport size for realistic movement range
            const vp = this.page.viewportSize() || { height: 1080, width: 1920 };

            // 1. Move to a random point to simulate activity
            const randomX = Math.floor(Math.random() * (vp.width * 0.7));
            const randomY = Math.floor(Math.random() * (vp.height * 0.7));
            await this._simulateHumanMovement(this.page, randomX, randomY);

            // 2. Move to (1,1) specifically for a safe click, using human simulation
            await this._simulateHumanMovement(this.page, 1, 1);
            await this.page.mouse.down();
            await this.page.waitForTimeout(50 + Math.random() * 100);
            await this.page.mouse.up();

            this.logger.info(`${logPrefix} ✅ Executed realistic page activation (Random -> 1,1 Click).`);
        } catch (e) {
            this.logger.warn(`${logPrefix} Wakeup minor error: ${e.message}`);
        }
        await this.page.waitForTimeout(2000 + Math.random() * 2000);
    }

    /**
     * Helper: Check page status and detect various error conditions
     * Detects: cookie expiration, region restrictions, 403 errors, page load failures
     * @param {string} logPrefix - Log prefix for messages (e.g., "[Browser]" or "[Reconnect]")
     * @throws {Error} If any error condition is detected
     */
    async _checkPageStatusAndErrors(logPrefix = "[Browser]") {
        const currentUrl = this.page.url();
        let pageTitle = "";
        try {
            pageTitle = await this.page.title();
        } catch (e) {
            this.logger.warn(`${logPrefix} Unable to get page title: ${e.message}`);
        }

        this.logger.info(`${logPrefix} [Diagnostic] URL: ${currentUrl}`);
        this.logger.info(`${logPrefix} [Diagnostic] Title: "${pageTitle}"`);

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
     * @param {string} logPrefix - Log prefix for messages (e.g., "[Browser]" or "[Reconnect]")
     */
    async _handlePopups(logPrefix = "[Browser]") {
        this.logger.info(`${logPrefix} 🔍 Starting intelligent popup detection (max 6s)...`);

        const popupConfigs = [
            {
                logFound: `${logPrefix} ✅ Found "Continue to the app" button, clicking...`,
                name: "Continue to the app",
                selector: 'button:text("Continue to the app")',
            },
            {
                logFound: `${logPrefix} ✅ Found Cookie consent banner, clicking "Agree"...`,
                name: "Cookie consent",
                selector: 'button:text("Agree")',
            },
            {
                logFound: `${logPrefix} ✅ Found "Got it" popup, clicking...`,
                name: "Got it dialog",
                selector: 'div.dialog button:text("Got it")',
            },
            {
                logFound: `${logPrefix} ✅ Found onboarding tutorial popup, clicking close button...`,
                name: "Onboarding tutorial",
                selector: 'button[aria-label="Close"]',
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
                    const element = this.page.locator(popup.selector).first();
                    // Quick visibility check with very short timeout
                    if (await element.isVisible({ timeout: 200 })) {
                        this.logger.info(popup.logFound);
                        await element.click({ force: true });
                        handledPopups.add(popup.name);
                        foundAny = true;
                        // Short pause after clicking to let next popup appear
                        await this.page.waitForTimeout(800);
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
                this.logger.info(
                    `${logPrefix} ✅ Popup detection complete (${i + 1} iterations, ${handledPopups.size} popups handled)`
                );
                break;
            }

            if (i < maxIterations - 1) {
                await this.page.waitForTimeout(pollInterval);
            }
        }
    }

    /**
     * Feature: Background Health Monitor (The "Scavenger")
     * Periodically cleans up popups and keeps the session alive.
     */
    _startHealthMonitor() {
        // Clear existing interval if any
        if (this.healthMonitorInterval) clearInterval(this.healthMonitorInterval);

        this.logger.info("[Browser] 🛡️ Background health monitor service (Scavenger) started...");

        let tickCount = 0;

        // Run every 4 seconds
        this.healthMonitorInterval = setInterval(async () => {
            const page = this.page;
            if (!page || page.isClosed()) {
                clearInterval(this.healthMonitorInterval);
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

                // 2. Anti-Timeout: Click top-left corner (1,1) every ~1 minute (15 ticks)
                if (tickCount % 15 === 0) {
                    try {
                        await this._simulateHumanMovement(page, 1, 1);
                        await page.mouse.down();
                        await page.waitForTimeout(100 + Math.random() * 100);
                        await page.mouse.up();
                    } catch (e) {
                        /* empty */
                    }
                }

                // 3. Auto-Save Auth: Every ~24 hours (21600 ticks * 4s = 86400s)
                if (tickCount % 21600 === 0) {
                    if (this._currentAuthIndex >= 0) {
                        try {
                            this.logger.info("[HealthMonitor] 💾 Triggering daily periodic auth file update...");
                            await this._updateAuthFile(this._currentAuthIndex);
                        } catch (e) {
                            this.logger.warn(`[HealthMonitor] Auth update failed: ${e.message}`);
                        }
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
                        // 检查元素是否占据空间（简单的可见性检查）
                        const rect = btn.getBoundingClientRect();
                        const isVisible = rect.width > 0 && rect.height > 0;

                        if (isVisible) {
                            const text = (btn.innerText || "").trim();
                            const ariaLabel = btn.getAttribute("aria-label");

                            // 匹配文本 或 aria-label
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
        }, 4000);
    }

    /**
     * Helper: Save debug information (screenshot and HTML) to root directory
     */
    async _saveDebugArtifacts(suffix = "final") {
        if (!this.page || this.page.isClosed()) return;
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-").substring(0, 19);
            const screenshotPath = path.join(process.cwd(), `debug_screenshot_${suffix}_${timestamp}.png`);
            await this.page.screenshot({
                fullPage: true,
                path: screenshotPath,
            });
            this.logger.info(`[Debug] Failure screenshot saved to: ${screenshotPath}`);

            const htmlPath = path.join(process.cwd(), `debug_page_source_${suffix}_${timestamp}.html`);
            const htmlContent = await this.page.content();
            fs.writeFileSync(htmlPath, htmlContent);
            this.logger.info(`[Debug] Failure page source saved to: ${htmlPath}`);
        } catch (e) {
            this.logger.error(`[Debug] Failed to save debug artifacts: ${e.message}`);
        }
    }

    /**
     * Feature: Background Wakeup & "Launch" Button Handler
     * Specifically handles the "Rocket/Launch" button which blocks model loading.
     */
    async _startBackgroundWakeup() {
        const currentPage = this.page;
        // Initial buffer
        await new Promise(r => setTimeout(r, 1500));

        if (!currentPage || currentPage.isClosed() || this.page !== currentPage) return;

        this.logger.info("[Browser] 🛡️ Background Wakeup Service (Rocket Handler) started...");

        while (currentPage && !currentPage.isClosed() && this.page === currentPage) {
            try {
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
                        await new Promise(r => setTimeout(r, 60000)); // Long sleep on success
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

    async launchOrSwitchContext(authIndex) {
        if (typeof authIndex !== "number" || authIndex < 0) {
            this.logger.error(`[Browser] Invalid authIndex: ${authIndex}. authIndex must be >= 0.`);
            this._currentAuthIndex = -1;
            throw new Error(`Invalid authIndex: ${authIndex}. Must be >= 0.`);
        }

        // [Auth Switch] Save current auth data before switching
        if (this.browser && this._currentAuthIndex >= 0) {
            try {
                await this._updateAuthFile(this._currentAuthIndex);
            } catch (e) {
                this.logger.warn(`[Browser] Failed to save current auth during switch: ${e.message}`);
            }
        }

        const proxyConfig = parseProxyFromEnv();
        if (proxyConfig) {
            this.logger.info(`[Browser] 🌐 Using proxy: ${proxyConfig.server}`);
        }

        if (!this.browser) {
            this.logger.info("🚀 [Browser] Main browser instance not running, performing first-time launch...");
            if (!fs.existsSync(this.browserExecutablePath)) {
                this._currentAuthIndex = -1;
                throw new Error(`Browser executable not found at path: ${this.browserExecutablePath}`);
            }
            this.browser = await firefox.launch({
                args: this.launchArgs,
                executablePath: this.browserExecutablePath,
                firefoxUserPrefs: this.firefoxUserPrefs,
                headless: true, // Main browser is always headless
                ...(proxyConfig ? { proxy: proxyConfig } : {}),
            });
            this.browser.on("disconnected", () => {
                this.logger.error("❌ [Browser] Main browser unexpectedly disconnected!");
                this.browser = null;
                this.context = null;
                this.page = null;
                this._currentAuthIndex = -1;
                this.logger.warn("[Browser] Reset currentAuthIndex to -1 due to unexpected disconnect.");
            });
            this.logger.info("✅ [Browser] Main browser instance successfully launched.");
        }

        if (this.healthMonitorInterval) {
            clearInterval(this.healthMonitorInterval);
            this.healthMonitorInterval = null;
            this.logger.info("[Browser] Stopped background tasks (Scavenger) for old page.");
        }

        if (this.context) {
            this.logger.info("[Browser] Closing old API browser context...");
            const closePromise = this.context.close();
            const timeoutPromise = new Promise(r => setTimeout(r, 5000)); // 5秒超时
            await Promise.race([closePromise, timeoutPromise]);
            this.context = null;
            this.page = null;

            // Reset flags when closing context, as page object is no longer valid
            this._consoleListenerRegistered = false;
            this._wsInitSuccess = false;
            this._wsInitFailed = false;

            this.logger.info("[Browser] Old API context closed, flags reset.");
        }

        const sourceDescription = `File auth-${authIndex}.json`;
        this.logger.info("==================================================");
        this.logger.info(`🔄 [Browser] Creating new API browser context for account #${authIndex}`);
        this.logger.info(`   • Auth source: ${sourceDescription}`);
        this.logger.info("==================================================");

        const storageStateObject = this.authSource.getAuth(authIndex);
        if (!storageStateObject) {
            throw new Error(`Failed to get or parse auth source for index ${authIndex}.`);
        }

        try {
            // Viewport Randomization
            const randomWidth = 1920 + Math.floor(Math.random() * 50);
            const randomHeight = 1080 + Math.floor(Math.random() * 50);

            this.context = await this.browser.newContext({
                deviceScaleFactor: 1,
                storageState: storageStateObject,
                viewport: { height: randomHeight, width: randomWidth },
                ...(proxyConfig ? { proxy: proxyConfig } : {}),
            });

            // Inject Privacy Script immediately after context creation
            const privacyScript = this._getPrivacyProtectionScript(authIndex);
            await this.context.addInitScript(privacyScript);

            this.page = await this.context.newPage();

            // Pure JS Wakeup (Focus & Click)
            try {
                await this.page.bringToFront();
                // eslint-disable-next-line no-undef
                await this.page.evaluate(() => window.focus());
                // Get viewport size for realistic movement range
                const vp = this.page.viewportSize() || { height: 1080, width: 1920 };
                const startX = Math.floor(Math.random() * (vp.width * 0.5));
                const startY = Math.floor(Math.random() * (vp.height * 0.5));
                await this._simulateHumanMovement(this.page, startX, startY);
                await this.page.mouse.down();
                await this.page.waitForTimeout(100);
                await this.page.mouse.up();
                this.logger.info("[Browser] ⚡ Forced window wake-up via JS focus.");
            } catch (e) {
                this.logger.warn(`[Browser] Wakeup minor error: ${e.message}`);
            }

            // Register console listener only once to avoid duplicate registrations
            if (!this._consoleListenerRegistered) {
                this.page.on("console", msg => {
                    const msgText = msg.text();
                    if (msgText.includes("Content-Security-Policy")) {
                        return;
                    }

                    if (msgText.includes("[ProxyClient]")) {
                        this.logger.info(`[Browser] ${msgText.replace("[ProxyClient] ", "")}`);
                    } else if (msg.type() === "error") {
                        this.logger.error(`[Browser Page Error] ${msgText}`);
                    }

                    // Check for WebSocket initialization status
                    if (msgText.includes("System initialization complete, waiting for server instructions")) {
                        this.logger.info(`[Browser] ✅ Detected successful initialization message from browser`);
                        this._wsInitSuccess = true;
                    } else if (msgText.includes("System initialization failed")) {
                        this.logger.warn(`[Browser] ❌ Detected initialization failure message from browser`);
                        this._wsInitFailed = true;
                    }
                });
                this._consoleListenerRegistered = true;
            }

            await this._navigateAndWakeUpPage("[Browser]");

            // Check for cookie expiration, region restrictions, and other errors
            await this._checkPageStatusAndErrors("[Browser]");

            // Wait for WebSocket initialization with error checking and retry logic
            const maxRetries = 3;
            let retryCount = 0;
            let initSuccess = false;

            // Reset flags before starting retry loop
            this._wsInitSuccess = false;
            this._wsInitFailed = false;

            while (retryCount < maxRetries && !initSuccess) {
                if (retryCount > 0) {
                    this.logger.info(`[Browser] 🔄 Retry attempt ${retryCount}/${maxRetries - 1}...`);

                    // Reset flags before page refresh to ensure clean state
                    this._wsInitSuccess = false;
                    this._wsInitFailed = false;

                    // Refresh the page and re-handle popups
                    await this.page.reload({ waitUntil: "domcontentloaded" });
                    await this.page.waitForTimeout(2000);
                }

                // Handle various popups (Cookie consent, Got it, Onboarding, etc.)
                // Always handle popups to ensure they don't block initialization
                await this._handlePopups("[Browser]");

                // Wait for WebSocket initialization (60 second timeout)
                initSuccess = await this._waitForWebSocketInit("[Browser]", 60000);

                if (!initSuccess) {
                    retryCount++;
                    if (retryCount < maxRetries) {
                        this.logger.warn(`[Browser] Initialization failed, refreshing page...`);
                    }
                }
            }

            if (!initSuccess) {
                throw new Error(
                    "WebSocket initialization failed after multiple retries. Please check browser logs and page errors."
                );
            }

            // Start background services - only started here during initial browser launch
            this._startBackgroundWakeup();
            this._startHealthMonitor();

            this._currentAuthIndex = authIndex;

            // [Auth Update] Save the refreshed cookies to the auth file immediately
            await this._updateAuthFile(authIndex);

            this.logger.info("==================================================");
            this.logger.info(`✅ [Browser] Account ${authIndex} context initialized successfully!`);
            this.logger.info("✅ [Browser] Browser client is ready.");
            this.logger.info("==================================================");
        } catch (error) {
            this.logger.error(`❌ [Browser] Account ${authIndex} context initialization failed: ${error.message}`);
            await this._saveDebugArtifacts("init_failed");
            await this.closeBrowser();
            this._currentAuthIndex = -1;
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
    async attemptLightweightReconnect() {
        // Verify browser and page are still valid
        if (!this.browser || !this.page) {
            this.logger.warn("[Reconnect] Browser or page is not available, cannot perform lightweight reconnect.");
            return false;
        }

        // Check if page is closed
        if (this.page.isClosed()) {
            this.logger.warn("[Reconnect] Page is closed, cannot perform lightweight reconnect.");
            return false;
        }

        const authIndex = this._currentAuthIndex;
        if (authIndex < 0) {
            this.logger.warn("[Reconnect] No current auth index, cannot perform lightweight reconnect.");
            return false;
        }

        this.logger.info("==================================================");
        this.logger.info(`🔄 [Reconnect] Starting lightweight reconnect for account #${authIndex}...`);
        this.logger.info("==================================================");

        // Stop existing background tasks
        if (this.healthMonitorInterval) {
            clearInterval(this.healthMonitorInterval);
            this.healthMonitorInterval = null;
            this.logger.info("[Reconnect] Stopped background health monitor.");
        }

        try {
            // Navigate to target page and wake it up
            await this._navigateAndWakeUpPage("[Reconnect]");

            // Check for cookie expiration, region restrictions, and other errors
            await this._checkPageStatusAndErrors("[Reconnect]");

            // Wait for WebSocket initialization with error checking and retry logic
            const maxRetries = 3;
            let retryCount = 0;
            let initSuccess = false;

            // Reset flags before starting retry loop
            this._wsInitSuccess = false;
            this._wsInitFailed = false;

            while (retryCount < maxRetries && !initSuccess) {
                if (retryCount > 0) {
                    this.logger.info(`[Reconnect] 🔄 Retry attempt ${retryCount}/${maxRetries - 1}...`);

                    // Reset flags before page refresh to ensure clean state
                    this._wsInitSuccess = false;
                    this._wsInitFailed = false;

                    // Refresh the page and re-handle popups
                    await this.page.reload({ waitUntil: "domcontentloaded" });
                    await this.page.waitForTimeout(2000);
                }

                // Handle various popups (Cookie consent, Got it, Onboarding, etc.)
                // Always handle popups to ensure they don't block initialization
                await this._handlePopups("[Reconnect]");

                // Wait for WebSocket initialization (60 second timeout)
                initSuccess = await this._waitForWebSocketInit("[Reconnect]", 60000);

                if (!initSuccess) {
                    retryCount++;
                    if (retryCount < maxRetries) {
                        this.logger.warn(`[Reconnect] Initialization failed, refreshing page...`);
                    }
                }
            }

            if (!initSuccess) {
                this.logger.error("[Reconnect] WebSocket initialization failed after multiple retries.");
                return false;
            }

            // Restart health monitor after successful reconnect
            // Note: _startBackgroundWakeup is not restarted because it's a continuous loop
            // that checks this.page === currentPage, and will continue running after page reload
            this._startHealthMonitor();

            // [Auth Update] Save the refreshed cookies to the auth file immediately
            await this._updateAuthFile(authIndex);

            this.logger.info("==================================================");
            this.logger.info(`✅ [Reconnect] Lightweight reconnect successful for account #${authIndex}!`);
            this.logger.info("==================================================");

            return true;
        } catch (error) {
            this.logger.error(`❌ [Reconnect] Lightweight reconnect failed: ${error.message}`);
            await this._saveDebugArtifacts("reconnect_failed");
            return false;
        }
    }

    /**
     * Unified cleanup method for the main browser instance.
     * Handles intervals, timeouts, and resetting all references.
     */
    async closeBrowser() {
        // Set flag to indicate intentional close - prevents ConnectionRegistry from
        // attempting lightweight reconnect when WebSocket disconnects
        this.isClosingIntentionally = true;

        if (this.healthMonitorInterval) {
            clearInterval(this.healthMonitorInterval);
            this.healthMonitorInterval = null;
        }
        if (this.browser) {
            this.logger.info("[Browser] Closing main browser instance...");
            try {
                // Give close() 5 seconds, otherwise force proceed
                await Promise.race([this.browser.close(), new Promise(resolve => setTimeout(resolve, 5000))]);
            } catch (e) {
                this.logger.warn(`[Browser] Error during close (ignored): ${e.message}`);
            }

            // Reset all references and flags
            this.browser = null;
            this.context = null;
            this.page = null;
            this._currentAuthIndex = -1;

            // Reset WebSocket initialization flags
            this._consoleListenerRegistered = false;
            this._wsInitSuccess = false;
            this._wsInitFailed = false;

            this.logger.info("[Browser] Main browser instance closed, all references and flags reset.");
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

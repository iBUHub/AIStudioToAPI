/**
 * File: src/auth/ScreencastAuth.js
 * Description: CDP Screencast-based auth session manager.
 *              Launches a temporary Chromium browser, streams JPEG frames via WebSocket,
 *              forwards user input via CDP, and extracts auth after login.
 */

const fs = require("fs");
const path = require("path");
const { chromium } = require("patchright");
const { parseProxyFromEnv } = require("../utils/ProxyUtils");

const GOOGLE_DOMAIN_PATTERNS = [
    ".google.com",
    ".google.co.",
    ".googleapis.com",
    ".youtube.com",
    ".gstatic.com",
    ".googleusercontent.com",
    "accounts.google.com",
];

// Navigate to AI Studio directly — Google will redirect to login naturally
const TARGET_URL = "https://aistudio.google.com";

// Virtual key code lookup for special keys
const VK_MAP = {
    Backspace: 8,
    Tab: 9,
    Enter: 13,
    Shift: 16,
    Control: 17,
    Alt: 18,
    Escape: 27,
    " ": 32,
    PageUp: 33,
    PageDown: 34,
    End: 35,
    Home: 36,
    ArrowLeft: 37,
    ArrowUp: 38,
    ArrowRight: 39,
    ArrowDown: 40,
    Delete: 46,
    Meta: 91,
};

class ScreencastAuth {
    constructor(serverSystem) {
        this.serverSystem = serverSystem;
        this.logger = serverSystem.logger;
        this.session = null;
    }

    /**
     * Handle a new WebSocket connection for screencast
     */
    async handleConnection(ws) {
        if (this.session) {
            this._sendStatus(ws, "error", "Another screencast session is already active.");
            ws.close();
            return;
        }

        this.session = { ws, browser: null, context: null, page: null, cdpSession: null, pageWidth: 1280, pageHeight: 800 };

        ws.on("close", () => this.cleanup());
        ws.on("error", err => {
            this.logger.error(`[Screencast] WebSocket error: ${err.message}`);
            this.cleanup();
        });

        try {
            this._sendStatus(ws, "connecting");
            await this._launchTemporaryBrowser();

            const cdpSession = await this.session.context.newCDPSession(this.session.page);
            this.session.cdpSession = cdpSession;

            await this._startScreencast();
            this._sendStatus(ws, "ready");

            ws.on("message", data => {
                try {
                    const msg = JSON.parse(data.toString());
                    this._handleClientMessage(msg).catch(err => {
                        this.logger.error(`[Screencast] Error handling message: ${err.message}`);
                    });
                } catch {
                    // Ignore non-JSON messages
                }
            });
        } catch (err) {
            this.logger.error(`[Screencast] Failed to start session: ${err.message}`);
            this._sendStatus(ws, "error", err.message);
            await this.cleanup();
        }
    }

    async _launchTemporaryBrowser() {
        const browserManager = this.serverSystem.browserManager;
        const proxyConfig = parseProxyFromEnv();

        const launchOptions = {
            args: [...browserManager.launchArgs, "--disable-blink-features=AutomationControlled"],
            headless: false,
            ...(browserManager.browserExecutablePath
                ? { executablePath: browserManager.browserExecutablePath }
                : {}),
            ...(proxyConfig ? { proxy: proxyConfig } : {}),
        };

        this.logger.info("[Screencast] Launching temporary browser for login...");
        const browser = await chromium.launch(launchOptions);

        const context = await browser.newContext({
            viewport: { width: 1280, height: 800 },
            ...(proxyConfig ? { proxy: proxyConfig } : {}),
        });

        // Inject anti-detection script (same as BrowserManager)
        await context.addInitScript(this._getStealthScript());

        const page = await context.newPage();
        await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 60000 });

        Object.assign(this.session, { browser, context, page });
        this.logger.info("[Screencast] Temporary browser launched, navigated to Google login.");
    }

    async _startScreencast() {
        const { cdpSession, ws } = this.session;

        cdpSession.on("Page.screencastFrame", async frame => {
            if (ws.readyState !== 1) return; // WebSocket.OPEN

            // Send binary JPEG frame
            try {
                ws.send(Buffer.from(frame.data, "base64"));
            } catch {
                // ws closed
                return;
            }

            // Ack the frame
            await cdpSession.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});

            // Send resize if dimensions changed
            const { deviceWidth, deviceHeight } = frame.metadata;
            if (deviceWidth && deviceHeight && (deviceWidth !== this.session.pageWidth || deviceHeight !== this.session.pageHeight)) {
                this.session.pageWidth = deviceWidth;
                this.session.pageHeight = deviceHeight;
                this._sendJSON(ws, { type: "resize", width: deviceWidth, height: deviceHeight });
            }
        });

        await cdpSession.send("Page.startScreencast", {
            everyNthFrame: 2,
            format: "jpeg",
            maxHeight: 800,
            maxWidth: 1280,
            quality: 80,
        });

        this.logger.info("[Screencast] CDP screencast started.");
    }

    async _handleClientMessage(msg) {
        if (!this.session) return;

        switch (msg.type) {
            case "mouse":
                await this._handleMouse(msg);
                break;
            case "key":
                await this._handleKey(msg);
                break;
            case "save":
                await this._saveAuth();
                break;
            case "navigate":
                await this._navigate(msg.url);
                break;
        }
    }

    async _handleMouse(data) {
        const { cdpSession } = this.session;
        if (!cdpSession) return;

        const buttonMap = { 0: "left", 1: "middle", 2: "right" };
        const button = buttonMap[data.button] || "none";
        const baseParams = { x: data.x, y: data.y, pointerType: "mouse" };

        switch (data.event) {
            case "move":
                await cdpSession.send("Input.dispatchMouseEvent", { ...baseParams, type: "mouseMoved" });
                break;
            case "down":
                await cdpSession.send("Input.dispatchMouseEvent", { ...baseParams, type: "mousePressed", button, clickCount: 1 });
                break;
            case "up":
                await cdpSession.send("Input.dispatchMouseEvent", { ...baseParams, type: "mouseReleased", button });
                break;
            case "wheel":
                await cdpSession.send("Input.dispatchMouseEvent", {
                    ...baseParams,
                    type: "mouseWheel",
                    deltaX: data.deltaX || 0,
                    deltaY: data.deltaY || 0,
                });
                break;
        }
    }

    async _handleKey(data) {
        const { cdpSession } = this.session;
        if (!cdpSession) return;

        const modifiers = data.modifiers || 0;
        const vkCode = VK_MAP[data.key] || (data.key.length === 1 ? data.key.toUpperCase().charCodeAt(0) : 0);

        switch (data.event) {
            case "down":
                await cdpSession.send("Input.dispatchKeyEvent", {
                    type: "keyDown",
                    key: data.key,
                    code: data.code,
                    modifiers,
                    windowsVirtualKeyCode: vkCode,
                    nativeVirtualKeyCode: vkCode,
                });
                // Also send char for printable characters
                if (data.text && data.text.length === 1) {
                    await cdpSession.send("Input.dispatchKeyEvent", {
                        type: "char",
                        text: data.text,
                        unmodifiedText: data.text,
                        key: data.key,
                        code: data.code,
                        modifiers,
                        windowsVirtualKeyCode: vkCode,
                    });
                }
                break;
            case "up":
                await cdpSession.send("Input.dispatchKeyEvent", {
                    type: "keyUp",
                    key: data.key,
                    code: data.code,
                    modifiers,
                    windowsVirtualKeyCode: vkCode,
                    nativeVirtualKeyCode: vkCode,
                });
                break;
        }
    }

    async _saveAuth() {
        if (!this.session || !this.session.context) return;
        const { ws, context, page } = this.session;

        try {
            this._sendStatus(ws, "saving");

            // Visit both AI Studio and Gemini to ensure cookies/localStorage for both services
            const currentUrl = page.url();
            if (!currentUrl.includes("aistudio.google.com")) {
                await page.goto("https://aistudio.google.com", { waitUntil: "domcontentloaded", timeout: 30000 });
            }

            // Extract AI Studio localStorage
            let aistudioLocalStorage = [];
            try {
                /* eslint-disable no-undef */
                aistudioLocalStorage = await page.evaluate(() => {
                    const items = [];
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        items.push({ name: key, value: localStorage.getItem(key) });
                    }
                    return items;
                });
                /* eslint-enable no-undef */
            } catch (e) {
                this.logger.warn(`[Screencast] Failed to extract AI Studio localStorage: ${e.message}`);
            }

            // Extract email from AI Studio page
            let accountName = "unknown";
            try {
                /* eslint-disable no-undef */
                accountName = await page.evaluate(() => {
                    const re = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
                    // Check script[type="application/json"] tags
                    for (const el of document.querySelectorAll('script[type="application/json"]')) {
                        const m = (el.textContent || "").match(re);
                        if (m) return m[0];
                    }
                    // Fallback: check all script tags
                    for (const el of document.querySelectorAll("script")) {
                        const m = (el.textContent || "").match(re);
                        if (m) return m[0];
                    }
                    // Fallback: check page text
                    const bodyMatch = (document.body?.innerText || "").match(re);
                    if (bodyMatch) return bodyMatch[0];
                    return "unknown";
                });
                /* eslint-enable no-undef */
            } catch {
                // ignore
            }

            // Also visit Gemini to capture Gemini-specific cookies and localStorage
            await page.goto("https://gemini.google.com", { waitUntil: "domcontentloaded", timeout: 30000 });
            let geminiLocalStorage = [];
            try {
                /* eslint-disable no-undef */
                geminiLocalStorage = await page.evaluate(() => {
                    const items = [];
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        items.push({ name: key, value: localStorage.getItem(key) });
                    }
                    return items;
                });
                /* eslint-enable no-undef */
            } catch (e) {
                this.logger.warn(`[Screencast] Failed to extract Gemini localStorage: ${e.message}`);
            }

            // Fallback email extraction from Gemini page
            if (accountName === "unknown") {
                try {
                    /* eslint-disable no-undef */
                    accountName = await page.evaluate(() => {
                        const re = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
                        for (const el of document.querySelectorAll("script")) {
                            const m = (el.textContent || "").match(re);
                            if (m) return m[0];
                        }
                        return "unknown";
                    });
                    /* eslint-enable no-undef */
                } catch {
                    // ignore
                }
            }

            // Extract ALL cookies (after visiting both sites)
            const allCookies = await context.cookies();
            const googleCookies = allCookies.filter(c => {
                const domain = c.domain || "";
                return GOOGLE_DOMAIN_PATTERNS.some(p => domain.includes(p));
            });

            const storageState = {
                accountName,
                cookies: googleCookies,
                origins: [
                    { localStorage: aistudioLocalStorage, origin: "https://aistudio.google.com" },
                    { localStorage: geminiLocalStorage, origin: "https://gemini.google.com" },
                ],
            };

            // Validate
            const lineCount = JSON.stringify(storageState, null, 2).split("\n").length;
            if (lineCount <= 100) {
                this._sendStatus(ws, "error", "Login state appears incomplete. Please ensure you are fully logged in.");
                return;
            }

            // Save file
            const configDir = path.join(process.cwd(), "configs", "auth");
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }

            const existingIndices = this.serverSystem.authSource.availableIndices || [];
            const nextIndex = existingIndices.length > 0 ? Math.max(...existingIndices) + 1 : 0;
            const filename = `auth-${nextIndex}.json`;
            const filePath = path.join(configDir, filename);

            await fs.promises.writeFile(filePath, JSON.stringify(storageState, null, 2));

            // Reload and rebalance
            this.serverSystem.authSource.reloadAuthSources();
            this.serverSystem.browserManager.rebalanceContextPool().catch(err => {
                this.logger.error(`[Screencast] Background rebalance failed: ${err.message}`);
            });

            this.logger.info(`[Screencast] Auth saved: ${filename} (account: ${accountName})`);
            this._sendStatus(ws, "saved", filename);

            // Auto-close the temporary browser after saving
            setTimeout(() => this.cleanup(), 1500);
        } catch (err) {
            this.logger.error(`[Screencast] Failed to save auth: ${err.message}`);
            this._sendStatus(ws, "error", `Save failed: ${err.message}`);
        }
    }

    async _navigate(url) {
        if (!this.session || !this.session.page || !url) return;

        try {
            const parsed = new URL(url);
            const isGoogle = /(google\.(com?\.)?[a-z]*|googleapis\.com|youtube\.com|gstatic\.com)$/i.test(parsed.hostname);
            if (!isGoogle) {
                this._sendStatus(this.session.ws, "error", "Only Google domains are allowed.");
                return;
            }
            await this.session.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        } catch (err) {
            this._sendStatus(this.session.ws, "error", `Navigation failed: ${err.message}`);
        }
    }

    async cleanup() {
        if (!this.session) return;
        const { cdpSession, context, browser, ws } = this.session;
        this.session = null;

        try {
            if (cdpSession) await cdpSession.send("Page.stopScreencast").catch(() => {});
            if (cdpSession) await cdpSession.detach().catch(() => {});
            if (context) await context.close().catch(() => {});
            if (browser) await browser.close().catch(() => {});
            if (ws && ws.readyState <= 1) ws.close();
        } catch {
            // ignore cleanup errors
        }

        this.logger.info("[Screencast] Session cleaned up.");
    }

    _getStealthScript() {
        return `
            (function() {
                if (window._stealthInjected) return;
                window._stealthInjected = true;
                try {
                    // Mask WebDriver property
                    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

                    // Mock Plugins if empty
                    if (navigator.plugins.length === 0) {
                        Object.defineProperty(navigator, 'plugins', {
                            get: () => new Array(${3 + Math.floor(Math.random() * 3)}),
                        });
                    }

                    // Spoof WebGL Renderer
                    const getParameterProxy = WebGLRenderingContext.prototype.getParameter;
                    WebGLRenderingContext.prototype.getParameter = function(parameter) {
                        if (parameter === 37445) return 'Google Inc. (NVIDIA)';
                        if (parameter === 37446) return 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1050 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)';
                        return getParameterProxy.apply(this, arguments);
                    };

                    // Mock chrome.runtime for Google login detection
                    if (!window.chrome) window.chrome = {};
                    if (!window.chrome.runtime) window.chrome.runtime = {};
                } catch(e) {}
            })();
        `;
    }

    _sendStatus(ws, state, message) {
        this._sendJSON(ws, { type: "status", state, ...(message ? { message } : {}) });
    }

    _sendJSON(ws, data) {
        if (ws && ws.readyState === 1) {
            try {
                ws.send(JSON.stringify(data));
            } catch {
                // ignore
            }
        }
    }
}

module.exports = ScreencastAuth;

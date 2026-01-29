/**
 * File: src/auth/CreateAuth.js
 * Description: Authentication creation handler for VNC-based auth generation
 *
 * Author: Ellinav, iBenzene, bbbugg
 */

const fs = require("fs");
const path = require("path");
const net = require("net");
const { spawn } = require("child_process");

/**
 * CreateAuth Manager
 * Handles VNC session creation and auth file generation
 */
class CreateAuth {
    constructor(serverSystem) {
        this.serverSystem = serverSystem;
        this.logger = serverSystem.logger;
        this.config = serverSystem.config;
        this.vncSession = null;
        this.currentLockToken = null; // Token to identify who holds the lock
        this.currentVncAbortController = null; // Controller to abort ongoing setup
    }

    /**
     * Helper: Run a promise but reject immediately if the signal is aborted.
     * Ensures we don't block on long operations (like browser launch/nav) if a new request comes in.
     */
    async _runWithSignal(promise, signal) {
        if (signal?.aborted) throw new Error("VNC_SETUP_ABORTED");
        if (!signal) return promise;

        return new Promise((resolve, reject) => {
            const onAbort = () => {
                signal.removeEventListener("abort", onAbort);
                reject(new Error("VNC_SETUP_ABORTED"));
            };

            signal.addEventListener("abort", onAbort);

            promise.then(
                val => {
                    signal.removeEventListener("abort", onAbort);
                    if (signal.aborted) {
                        // ZOMBIE CLEANUP: The operation succeeded but we already moved on.
                        // If the result contains a browser instance, kill it.
                        if (val && val.browser) {
                            this.logger.warn("[VNC] 🧟 Zombie browser instance detected after abort. Killing it...");
                            val.browser.close().catch(() => {});
                        }
                    } else {
                        resolve(val);
                    }
                },
                err => {
                    signal.removeEventListener("abort", onAbort);
                    if (!signal.aborted) {
                        reject(err);
                    }
                    // If aborted, we ignore the error of the abandoned promise
                }
            );
        });
    }

    _waitForPort(port, timeout = 5000, signal = null) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            let timerHandle = null;
            let socket = null;

            const cleanup = () => {
                if (timerHandle) {
                    clearTimeout(timerHandle);
                    timerHandle = null;
                }
                if (socket) {
                    socket.destroy();
                    socket = null;
                }
                if (signal) {
                    signal.removeEventListener("abort", onAbort);
                }
            };

            const onAbort = () => {
                cleanup();
                reject(new Error("VNC_SETUP_ABORTED"));
            };

            if (signal) {
                if (signal.aborted) return onAbort();
                signal.addEventListener("abort", onAbort);
            }

            const tryConnect = () => {
                if (signal?.aborted) return;

                socket = new net.Socket();
                socket.once("connect", () => {
                    cleanup(); // Success! Clean up listeners/timers/sockets
                    resolve(); // Resolve with nothing (void)
                });

                socket.once("error", () => {
                    // Socket failed, destroy it immediately
                    socket.destroy();
                    socket = null;

                    if (signal?.aborted) return;

                    if (Date.now() - startTime > timeout) {
                        cleanup();
                        reject(new Error(`Timeout waiting for port ${port}`));
                    } else {
                        timerHandle = setTimeout(tryConnect, 100);
                    }
                });
                socket.connect(port, "localhost");
            };
            tryConnect();
        });
    }

    async startVncSession(req, res) {
        if (process.platform === "win32") {
            this.logger.error("[VNC] VNC feature is not supported on Windows.");
            return res.status(501).json({ message: "errorVncUnsupportedOs" });
        }

        // --- Concurrency Handling with Token Ownership ---
        const myToken = {}; // Unique object identity

        if (this.currentLockToken) {
            this.logger.warn("[VNC] A VNC operation is already in progress. Signal interruption...");

            if (this.currentVncAbortController) {
                this.currentVncAbortController.abort();
            }

            // Wait for the previous operation to clean up and release the lock
            const waitStart = Date.now();
            while (this.currentLockToken) {
                // If another session managed to start while we were waiting, abort it too.
                // This ensures the latest request always wins and doesn't queue up behind others.
                if (this.currentVncAbortController) {
                    this.currentVncAbortController.abort();
                }

                if (Date.now() - waitStart > 6000) {
                    // Maximum wait 6s (covers 2s cleanup + overhead)
                    this.logger.error("[VNC] Timeout waiting for previous session to abort.");
                    return res.status(503).json({ message: "errorVncBusyTimeout" });
                }
                await new Promise(resolve => setTimeout(resolve, 200));
            }
            this.logger.info("[VNC] Lock acquired after previous session cleanup.");

            // CAS (Compare-And-Swap) Check:
            if (this.currentLockToken) {
                this.logger.warn("[VNC] Queue race detected: Lock stolen by another request. Aborting execution.");
                return res.status(503).json({ message: "errorVncBusyPreempted" });
            }
        }

        this.currentLockToken = myToken;
        this.currentVncAbortController = new AbortController();
        const { signal } = this.currentVncAbortController;

        const checkAborted = () => {
            if (signal.aborted) {
                throw new Error("VNC_SETUP_ABORTED");
            }
        };

        const sessionResources = {};

        try {
            // Check immediately
            checkAborted();

            // Always clean up any existing session before starting a new one
            // Pass global clean up false, we want to clean whatever is current
            await this._cleanupVncSession("new_session_request", this.vncSession);
            checkAborted();

            // Add a small delay to ensure OS releases ports
            await this._runWithSignal(new Promise(resolve => setTimeout(resolve, 200)), signal);
            checkAborted();

            const userAgent = req.headers["user-agent"] || "";
            const isMobile = /Mobi|Android/i.test(userAgent);
            this.logger.info(`[VNC] Detected User-Agent: "${userAgent}". Is mobile: ${isMobile}`);

            const { width, height } = req.body;
            const screenWidth =
                typeof width === "number" && width > 0 ? Math.floor(width / 2) * 2 : isMobile ? 412 : 1280;
            const screenHeight =
                typeof height === "number" && height > 0 ? Math.floor(height / 2) * 2 : isMobile ? 915 : 720;

            const screenResolution = `${screenWidth}x${screenHeight}x24`;
            this.logger.info(`[VNC] Requested VNC resolution: ${screenWidth}x${screenHeight}`);

            const vncPort = 5901;
            const websockifyPort = 6080;
            const display = ":99";

            // Define a scoped cleanup for this specific session instance
            const scopedCleanup = reason => this._cleanupVncSession(reason, sessionResources);

            this.logger.info(
                `[VNC] Starting virtual screen (Xvfb) on display ${display} with resolution ${screenResolution}...`
            );
            const xvfb = spawn("Xvfb", [display, "-screen", "0", screenResolution, "+extension", "RANDR"]);
            xvfb.on("error", err => {
                if (err.code === "ENOENT") {
                    this.logger.error("[VNC:Xvfb] Not installed. VNC functionality requires Xvfb to be available.");
                } else {
                    this.logger.error(`[VNC:Xvfb] Spawn error: ${err.message}`);
                }
            });
            xvfb.stderr.on("data", data => {
                const msg = data.toString();
                // Filter out common, harmless X11 warnings
                if (msg.includes("_XSERVTransmkdir: ERROR: euid != 0")) {
                    return;
                }
                this.logger.info(`[VNC:Xvfb] ${msg}`);
            });
            xvfb.once("close", code => {
                this.logger.warn(`[VNC:Xvfb] Process exited with code ${code}. Triggering cleanup.`);
                scopedCleanup("xvfb_closed");
            });
            sessionResources.xvfb = xvfb;

            // Wait for Xvfb to be ready
            await this._runWithSignal(new Promise(resolve => setTimeout(resolve, 500)), signal);
            checkAborted();

            this.logger.info(`[VNC] Starting VNC server (x11vnc) on port ${vncPort}...`);
            const x11vnc = spawn("x11vnc", [
                "-display",
                display,
                "-rfbport",
                String(vncPort),
                "-forever",
                "-nopw",
                "-shared",
                "-quiet",
                "-repeat",
            ]);
            x11vnc.on("error", err => {
                if (err.code === "ENOENT") {
                    this.logger.error("[VNC:x11vnc] Not installed. VNC functionality requires x11vnc to be available.");
                } else {
                    this.logger.error(`[VNC:x11vnc] Spawn error: ${err.message}`);
                }
            });
            x11vnc.stderr.on("data", data => {
                const msg = data.toString();
                // Filter out common, harmless X11 warnings and info messages
                if (
                    msg.includes('extension "DPMS" missing') ||
                    msg.includes("caught signal") ||
                    msg.includes("X connection to") ||
                    msg.includes("The VNC desktop is:")
                ) {
                    return; // Ignore these messages
                }
                this.logger.error(`[VNC:x11vnc] ${msg}`);
            });
            x11vnc.once("close", code => {
                this.logger.warn(`[VNC:x11vnc] Process exited with code ${code}. Triggering cleanup.`);
                scopedCleanup("x11vnc_closed");
            });
            sessionResources.x11vnc = x11vnc;

            await this._waitForPort(vncPort, 5000, signal);
            this.logger.info("[VNC] VNC server is ready.");
            checkAborted();

            this.logger.info(`[VNC] Starting websockify on port ${websockifyPort}...`);
            const websockify = spawn("websockify", [String(websockifyPort), `localhost:${vncPort}`]);
            websockify.on("error", err => {
                if (err.code === "ENOENT") {
                    this.logger.error(
                        "[VNC:Proxy] websockify not installed. VNC functionality requires websockify to be available."
                    );
                } else {
                    this.logger.error(`[VNC:Proxy] websockify spawn error: ${err.message}`);
                }
            });
            websockify.stdout.on("data", data => this.logger.info(`[VNC:Proxy] ${data.toString()}`));
            websockify.stderr.on("data", data => {
                const msg = data.toString();

                // Downgrade ECONNRESET to INFO as it's expected during cleanup
                if (msg.includes("read ECONNRESET")) {
                    this.logger.info(`[VNC:Proxy] Connection reset, likely during cleanup: ${msg.trim()}`);
                    return;
                }

                // Log normal connection info as INFO
                if (
                    msg.includes("Plain non-SSL (ws://) WebSocket connection") ||
                    msg.includes("Path: '/vnc'") ||
                    msg.includes("connecting to:")
                ) {
                    this.logger.info(`[VNC:Proxy] ${msg.trim()}`);
                    return;
                }

                // Filter out websockify startup info that is printed to stderr
                if (
                    msg.includes("In exit") ||
                    msg.includes("WebSocket server settings") ||
                    msg.includes("- Listen on") ||
                    msg.includes("- Web server") ||
                    msg.includes("- No SSL") ||
                    msg.includes("- proxying from")
                ) {
                    return;
                }
                this.logger.error(`[VNC:Proxy] ${msg}`);
            });
            websockify.once("close", code => {
                this.logger.warn(`[VNC:Proxy] Process exited with code ${code}. Triggering cleanup.`);
                scopedCleanup("websockify_closed");
            });
            sessionResources.websockify = websockify;

            await this._waitForPort(websockifyPort, 5000, signal);
            this.logger.info("[VNC] Websockify is ready.");
            checkAborted();

            this.logger.info("[VNC] Launching browser for VNC session...");
            const { browser, context } = await this._runWithSignal(
                this.serverSystem.browserManager.launchBrowserForVNC({
                    env: { DISPLAY: display },
                    isMobile,
                }),
                signal
            );
            sessionResources.browser = browser;
            sessionResources.context = context;

            browser.once("disconnected", () => {
                this.logger.warn("[VNC] Browser disconnected. Triggering cleanup.");
                scopedCleanup("browser_disconnected");
            });

            // Double check before heavy page load
            checkAborted();

            const page = await this._runWithSignal(context.newPage(), signal);

            await this._runWithSignal(
                page.setViewportSize({
                    height: screenHeight,
                    width: screenWidth,
                }),
                signal
            );

            await page.addInitScript(`
                (function() {
                    const style = document.createElement("style");
                    style.textContent = \`
                        html, body {
                            margin: 0 !important;
                            padding: 0 !important;
                            width: 100vw !important;
                            height: 100vh !important;
                            overflow: hidden !important;
                        }
                    \`;
                    document.addEventListener("DOMContentLoaded", () => {
                        document.head.appendChild(style);
                    });
                })();
            `);

            await this._runWithSignal(
                page
                    .goto("https://aistudio.google.com/", {
                        timeout: 120000,
                        waitUntil: "domcontentloaded",
                    })
                    .catch(e => {
                        // Swallow "Target closed" error if it happens during abort/cleanup
                        if (
                            e.message.includes("closed") ||
                            e.message.includes("Target page, context or browser has been closed")
                        ) {
                            return null;
                        }
                        throw e;
                    }),
                signal
            );
            sessionResources.page = page;
            checkAborted();

            sessionResources.timeoutHandle = setTimeout(
                () => {
                    this.logger.warn("[VNC] Session has been idle for 10 minutes. Automatically cleaning up.");
                    scopedCleanup("idle_timeout");
                },
                10 * 60 * 1000
            );

            this.vncSession = sessionResources;

            this.logger.info(`[VNC] VNC session is live and accessible via the server's WebSocket proxy.`);
            res.json({ protocol: "websocket", success: true });
        } catch (error) {
            if (error.message === "VNC_SETUP_ABORTED") {
                this.logger.warn("[VNC] Current session setup aborted by new incoming request.");
                // We pass sessionResources (if any) to ensure we clean what we started,
                // though usually vncSession is assigned late.
                // If we assigned vncSession, cleanup will handle it.
                await this._cleanupVncSession("setup_aborted", sessionResources);

                if (!res.headersSent) {
                    res.status(499).json({ message: "errorVncSetupAborted" }); // 499 Client Closed Request (Nginx style) or just 503
                }
            } else {
                this.logger.error(`[VNC] Failed to start VNC session: ${error.message}`);
                await this._cleanupVncSession("startup_error", sessionResources);
                if (!res.headersSent) {
                    res.status(500).json({ message: "errorVncStartFailed" });
                }
            }
        } finally {
            // Only release lock if *this* instance holds it.
            if (this.currentLockToken === myToken) {
                this.logger.info("[VNC] Releasing lock for current session.");
                this.currentLockToken = null;
                this.currentVncAbortController = null;
            } else {
                this.logger.warn("[VNC] Lock ownership changed during execution; skipping release.");
            }
        }
    }

    async saveAuthFile(req, res) {
        if (!this.vncSession || !this.vncSession.context) {
            return res.status(400).json({ message: "errorVncNoSession" });
        }

        let { accountName } = req.body;
        const { context, page } = this.vncSession;
        // Capture session ref to prevent global change affecting us
        const sessionRef = this.vncSession;

        if (accountName) {
            this.logger.info(`[VNC] Using provided account name: ${accountName}`);
        } else {
            try {
                this.logger.info("[VNC] Attempting to retrieve account name by scanning <script> JSON...");
                const scriptLocators = page.locator('script[type="application/json"]');
                const count = await scriptLocators.count();
                this.logger.info(`[VNC] -> Found ${count} JSON <script> tags.`);

                const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;
                let foundEmail = false;

                for (let i = 0; i < count; i++) {
                    const content = await scriptLocators.nth(i).textContent();
                    if (content) {
                        const match = content.match(emailRegex);
                        if (match && match[0]) {
                            accountName = match[0];
                            this.logger.info(`[VNC] -> Successfully retrieved account: ${accountName}`);
                            foundEmail = true;
                            break;
                        }
                    }
                }

                if (!foundEmail) {
                    throw new Error(`Iterated through all ${count} <script> tags, but no email found.`);
                }
            } catch (e) {
                this.logger.warn(
                    `[VNC] Could not automatically detect email: ${e.message}. Requesting manual input from client.`
                );
                return res.status(400).json({ message: "errorVncEmailFetchFailed" });
            }
        }

        try {
            const storageState = await context.storageState();
            const authData = { ...storageState, accountName };

            const configDir = path.join(process.cwd(), "configs", "auth");
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }

            // Always use max index + 1 to ensure new auth is always the latest
            // This simplifies dedup logic assumption: higher index = newer auth
            const existingIndices = this.serverSystem.authSource.availableIndices || [];
            const nextAuthIndex = existingIndices.length > 0 ? Math.max(...existingIndices) + 1 : 0;

            const newAuthFilePath = path.join(configDir, `auth-${nextAuthIndex}.json`);
            fs.writeFileSync(newAuthFilePath, JSON.stringify(authData, null, 2));

            this.logger.info(`[VNC] Saved new auth file: ${newAuthFilePath}`);

            this.serverSystem.authSource.reloadAuthSources();

            res.json({
                accountName,
                accountNameMap: Object.fromEntries(this.serverSystem.authSource.accountNameMap),
                availableIndices: this.serverSystem.authSource.availableIndices,
                filePath: newAuthFilePath,
                message: "vncAuthSaveSuccess",
                newAuthIndex: nextAuthIndex,
            });

            setTimeout(() => {
                this.logger.info("[VNC] Cleaning up VNC session after saving...");
                this._cleanupVncSession("auth_saved", sessionRef);
            }, 500);
        } catch (error) {
            this.logger.error(`[VNC] Failed to save auth file: ${error.message}`);
            res.status(500).json({
                error: error.message,
                message: "errorVncSaveFailed",
            });
        }
    }

    async _cleanupVncSession(reason = "unknown", specificSession = null) {
        // If specific session provided, operate on it.
        // Otherwise use global (and nullify global if it matches).
        let sessionToCleanup = specificSession;

        if (!sessionToCleanup) {
            sessionToCleanup = this.vncSession;
            this.vncSession = null;
        } else {
            // If we are cleaning the active global session, null it out
            if (this.vncSession === sessionToCleanup) {
                this.vncSession = null;
            }
        }

        if (!sessionToCleanup) {
            return;
        }

        this.logger.info(`[VNC] Starting VNC session cleanup (Reason: ${reason})...`);

        const { browser, context, xvfb, x11vnc, websockify, timeoutHandle } = sessionToCleanup;

        if (timeoutHandle) {
            clearTimeout(timeoutHandle);
        }

        xvfb?.removeAllListeners();
        x11vnc?.removeAllListeners();
        websockify?.removeAllListeners();
        browser?.removeAllListeners();

        // Helper to race a promise against a timeout
        const withTimeout = (promise, ms) =>
            Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), ms))]);

        try {
            if (browser) {
                // Optimize: Browser close includes context close.
                // Only need to wait for browser. Max 2 seconds.
                await withTimeout(browser.close(), 2000);
            } else if (context) {
                // Fallback: If no browser (failed launch), try valid context
                await withTimeout(context.close(), 2000);
            }
        } catch (e) {
            this.logger.info(
                `[VNC] Browser/Context close timed out or failed: ${e.message}. Proceeding to force kill.`
            );
        }

        const killProcess = (proc, name) => {
            if (proc && !proc.killed) {
                try {
                    // Use SIGKILL for immediate termination to prevent hangs
                    proc.kill("SIGKILL");
                    this.logger.info(`[VNC] Forcefully terminated ${name} process.`);
                } catch (e) {
                    this.logger.warn(`[VNC] Failed to kill ${name} process: ${e.message}`);
                }
            }
        };

        killProcess(websockify, "websockify");
        killProcess(x11vnc, "x11vnc");
        killProcess(xvfb, "Xvfb");

        this.logger.info("[VNC] VNC session cleanup finished.");
    }
}

module.exports = CreateAuth;

/**
 * File: src/routes/AuthRoutes.js
 * Description: Authentication routes for login and logout functionality
 *
 * Author: Ellinav, iBenzene, bbbugg
 */

const CreateAuth = require("../auth/CreateAuth");

/**
 * Auth Routes Manager
 * Manages authentication-related routes (login, logout, session, and auth creation)
 */
class AuthRoutes {
    constructor(serverSystem) {
        this.serverSystem = serverSystem;
        this.logger = serverSystem.logger;
        this.config = serverSystem.config;
        this.distIndexPath = serverSystem.distIndexPath;
        this.loginAttempts = new Map(); // Track login attempts for rate limiting

        // Initialize auth creation handler
        this.createAuth = new CreateAuth(serverSystem);

        // Rate limiting configuration from environment variables
        this.rateLimitEnabled = process.env.RATE_LIMIT_MAX_ATTEMPTS !== "0";

        const parsedWindow = parseInt(process.env.RATE_LIMIT_WINDOW_MINUTES, 10);
        this.rateLimitWindow = Number.isFinite(parsedWindow) && parsedWindow > 0 ? parsedWindow : 15; // minutes

        const parsedMaxAttempts = parseInt(process.env.RATE_LIMIT_MAX_ATTEMPTS, 10);
        this.rateLimitMaxAttempts = Number.isFinite(parsedMaxAttempts) && parsedMaxAttempts > 0 ? parsedMaxAttempts : 5;

        if (this.rateLimitEnabled) {
            this.logger.info(
                `[Auth] Rate limiting enabled: ${this.rateLimitMaxAttempts} attempts per ${this.rateLimitWindow} minutes`
            );
        } else {
            this.logger.info("[Auth] Rate limiting disabled");
        }
    }

    /**
     * Get real client IP address, handling various proxy scenarios
     * Priority: CDN headers > X-Real-IP > X-Forwarded-For (first IP) > req.ip
     *
     * Supports common CDN providers:
     * - Cloudflare: CF-Connecting-IP
     * - Fastly/Firebase: Fastly-Client-IP
     * - Akamai/Cloudfront: True-Client-IP
     */
    getClientIP(req) {
        // Priority 1: CDN-specific headers (most reliable when using CDN)
        // Cloudflare
        if (req.headers["cf-connecting-ip"]) {
            return req.headers["cf-connecting-ip"];
        }
        // Fastly / Firebase Hosting
        if (req.headers["fastly-client-ip"]) {
            return req.headers["fastly-client-ip"];
        }
        // Akamai / Cloudfront
        if (req.headers["true-client-ip"]) {
            return req.headers["true-client-ip"];
        }
        // Alibaba Cloud's ESA
        if (req.headers["ali-real-client-ip"]) {
            return req.headers["ali-real-client-ip"];
        }
        // Tencent Cloud's EdgeOne
        if (req.headers["eo-connecting-ip"]) {
            return req.headers["eo-connecting-ip"];
        }

        // Priority 2: X-Real-IP (reliable in trusted internal proxy chains)
        if (req.headers["x-real-ip"]) {
            return req.headers["x-real-ip"];
        }

        // Priority 3: X-Forwarded-For (can be spoofed, use as fallback)
        // Format: client, proxy1, proxy2, ...
        // We want the first IP (the original client)
        if (req.headers["x-forwarded-for"]) {
            return req.headers["x-forwarded-for"].split(",")[0].trim();
        }

        // Priority 4: Direct connection IP (fallback)
        // This will be the direct connection IP if no proxy headers exist
        return req.ip || req.connection.remoteAddress || "unknown";
    }

    /**
     * Authentication middleware
     */
    isAuthenticated(req, res, next) {
        if (req.session.isAuthenticated) {
            return next();
        }

        // Use 303 See Other to force the browser to use GET for the redirect
        // This solves the issue where DELETE/POST requests would otherwise be redirected as DELETE/POST /login
        if (req.xhr || req.headers.accept?.includes("application/json")) {
            return res.status(401).json({ message: "unlimited" });
        }

        res.redirect(303, "/login");
    }

    /**
     * Setup authentication routes
     */
    setupRoutes(app) {
        app.get("/login", (req, res) => {
            if (req.session.isAuthenticated) {
                return res.redirect("/");
            }
            res.sendFile(this.distIndexPath);
        });

        // Login endpoint with rate limiting
        app.post("/login", (req, res) => {
            const ip = this.getClientIP(req);
            const now = Date.now();
            const RATE_LIMIT_WINDOW = this.rateLimitWindow * 60 * 1000; // Convert minutes to milliseconds
            const MAX_ATTEMPTS = this.rateLimitMaxAttempts;

            // Skip rate limiting if disabled
            if (this.rateLimitEnabled) {
                const attempts = this.loginAttempts.get(ip) || { count: 0, firstAttempt: now, lastAttempt: 0 };

                // Clean up old entries (older than rate limit window)
                if (now - attempts.firstAttempt > RATE_LIMIT_WINDOW) {
                    // Time window expired, reset counter
                    attempts.count = 0;
                    attempts.firstAttempt = now;
                }

                // Check if IP is rate limited (MAX_ATTEMPTS in RATE_LIMIT_WINDOW)
                if (attempts.count >= MAX_ATTEMPTS) {
                    const timeLeft = Math.ceil((RATE_LIMIT_WINDOW - (now - attempts.firstAttempt)) / 60000);
                    this.logger.warn(`[Auth] Rate limit exceeded for IP: ${ip}, ${timeLeft} minutes remaining`);
                    return res.redirect("/login?error=2");
                }
            }

            const { apiKey } = req.body;
            if (apiKey && this.config.apiKeys.includes(apiKey)) {
                // Clear failed attempts on successful login
                if (this.rateLimitEnabled) {
                    this.loginAttempts.delete(ip);
                }

                // Regenerate session to prevent session fixation attacks
                req.session.regenerate(err => {
                    if (err) {
                        this.logger.error(`[Auth] Session regeneration failed: ${err.message}`);
                        return res.redirect("/login?error=1");
                    }
                    req.session.isAuthenticated = true;
                    this.logger.info(`[Auth] Successful login from IP: ${ip}`);
                    res.redirect("/");
                });
            } else {
                // Record failed login attempt (only if rate limiting is enabled)
                if (this.rateLimitEnabled) {
                    const attempts = this.loginAttempts.get(ip) || { count: 0, firstAttempt: now, lastAttempt: 0 };
                    attempts.count++;
                    attempts.lastAttempt = now;
                    this.loginAttempts.set(ip, attempts);
                    this.logger.warn(`[Auth] Failed login attempt from IP: ${ip} (${attempts.count}/${MAX_ATTEMPTS})`);

                    // Periodic cleanup: remove expired entries from other IPs
                    if (Math.random() < 0.1) {
                        // 10% chance to trigger cleanup
                        this._cleanupExpiredAttempts(now, RATE_LIMIT_WINDOW);
                    }
                } else {
                    this.logger.warn(`[Auth] Failed login attempt from IP: ${ip}`);
                }

                res.redirect("/login?error=1");
            }
        });

        // Logout endpoint
        const isAuthenticated = this.isAuthenticated.bind(this);
        app.post("/logout", isAuthenticated, (req, res) => {
            const ip = this.getClientIP(req);
            req.session.destroy(err => {
                if (err) {
                    this.logger.error(`[Auth] Session destruction failed for IP ${ip}: ${err.message}`);
                    return res.status(500).json({ message: "logoutFailed" });
                }
                this.logger.info(`[Auth] User logged out from IP: ${ip}`);
                res.clearCookie("connect.sid");
                res.status(200).json({ message: "logoutSuccess" });
            });
        });

        // VNC-based auth creation routes
        app.post("/api/vnc/sessions", isAuthenticated, this.createAuth.startVncSession.bind(this.createAuth));
        app.post("/api/vnc/auth", isAuthenticated, this.createAuth.saveAuthFile.bind(this.createAuth));
        app.delete("/api/vnc/sessions", isAuthenticated, async (req, res) => {
            this.logger.info("[VNC] Received cleanup request from client (beacon).");
            await this.createAuth._cleanupVncSession("client_beacon");
            res.sendStatus(204); // No content
        });
    }

    /**
     * Clean up expired login attempt records to prevent memory leaks
     */
    _cleanupExpiredAttempts(now, rateLimit) {
        for (const [ip, data] of this.loginAttempts.entries()) {
            if (now - data.firstAttempt > rateLimit) {
                this.loginAttempts.delete(ip);
            }
        }
    }
}

module.exports = AuthRoutes;

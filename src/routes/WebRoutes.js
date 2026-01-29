/**
 * File: src/routes/WebRoutes.js
 * Description: Web routes coordinator - delegates to specialized route handlers
 *
 * Author: Ellinav, iBenzene, bbbugg
 */

const session = require("express-session");
const cookieParser = require("cookie-parser");
const crypto = require("crypto");
const path = require("path");
const AuthRoutes = require("./AuthRoutes");
const StatusRoutes = require("./StatusRoutes");

/**
 * Web Routes Manager
 * Coordinates and delegates to specialized route handlers
 */
class WebRoutes {
    constructor(serverSystem) {
        this.serverSystem = serverSystem;
        this.logger = serverSystem.logger;
        this.config = serverSystem.config;
        this.distIndexPath = path.join(__dirname, "..", "..", "ui", "dist", "index.html");

        // Pass distIndexPath to serverSystem for other modules to access
        serverSystem.distIndexPath = this.distIndexPath;

        // Initialize specialized route handlers
        this.authRoutes = new AuthRoutes(serverSystem);
        this.statusRoutes = new StatusRoutes(serverSystem);
    }

    /**
     * Configure session and login related middleware
     */
    setupSession(app) {
        // Generate a secure random session secret
        const sessionSecret = crypto.randomBytes(32).toString("hex");

        // Trust first proxy (Nginx) for secure cookies and IP forwarding
        app.set("trust proxy", 1);

        app.use(cookieParser());
        this.sessionParser = session({
            cookie: {
                httpOnly: true,

                maxAge: 86400000,

                sameSite: "lax",
                // This allows HTTP access in production if HTTPS is not configured
                // Set SECURE_COOKIES=true when using HTTPS/SSL
                secure: process.env.SECURE_COOKIES?.toLowerCase() === "true",
            },
            resave: false,
            saveUninitialized: false,
            secret: sessionSecret,
        });
        app.use(this.sessionParser);

        // Setup all route handlers
        this.authRoutes.setupRoutes(app);
        this.statusRoutes.setupRoutes(app, this.authRoutes.isAuthenticated.bind(this.authRoutes));
    }
}

module.exports = WebRoutes;

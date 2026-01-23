/**
 * File: main.js
 * Description: Main entry file that initializes and starts the AIStudio To API proxy server system
 *
 * Author: Ellinav, iBenzene, bbbugg
 */

// Load environment variables based on NODE_ENV
const path = require("path");
const envFile = process.env.NODE_ENV === "production" ? ".env" : ".env.development";
require("dotenv").config({ path: path.resolve(__dirname, envFile) });

const ProxyServerSystem = require("./src/core/ProxyServerSystem");

/**
 * Initialize and start the server
 */
const initializeServer = async () => {
    const initialAuthIndex = parseInt(process.env.INITIAL_AUTH_INDEX, 10) || null;

    try {
        const serverSystem = new ProxyServerSystem();
        await serverSystem.start(initialAuthIndex);
    } catch (error) {
        console.error("❌ Server startup failed:", error.message);
        process.exit(1);
    }
};

// If this file is run directly, start the server
if (require.main === module) {
    initializeServer();
}

module.exports = { initializeServer, ProxyServerSystem };

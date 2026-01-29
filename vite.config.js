/**
 * File: vite.config.js
 * Description: Vite build configuration for the Vue frontend application
 *
 * Author: Ellinav, iBenzene, bbbugg
 */

const { defineConfig } = require("vite");
const vue = require("@vitejs/plugin-vue");
const packageJson = require("./package.json");

module.exports = defineConfig({
    define: {
        __APP_VERSION__: JSON.stringify(process.env.VERSION || packageJson.version),
    },
    base: "/",
    build: {
        assetsDir: "assets",
        emptyOutDir: true,
        outDir: "../dist",
    },
    plugins: [vue()],
    publicDir: "../public",
    root: "ui/app",
    server: {
        port: 5173,
        proxy: {
            // Proxy API requests to the Express backend
            "/api": {
                changeOrigin: true,
                target: "http://localhost:7860",
            },
            "/health": {
                changeOrigin: true,
                target: "http://localhost:7860",
            },
            "/locales": {
                changeOrigin: true,
                target: "http://localhost:7860",
            },
            "/login": {
                changeOrigin: true,
                target: "http://localhost:7860",
            },
            "/logout": {
                changeOrigin: true,
                target: "http://localhost:7860",
            },
        },
        strictPort: true,
    },
});

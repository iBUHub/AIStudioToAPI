/**
 * File: src/utils/bodySizeLimit.js
 * Description: Request body collection middleware with a configurable, per-path size cap
 *
 * Author: OrbisAI Security
 */

const querystring = require("querystring");

/**
 * Creates the request body collection middleware (BuildProxy style). Collects
 * the entire raw body into req.rawBody as a Buffer and parses JSON/urlencoded
 * bodies into req.body for compatibility, exactly as before. Unlike before,
 * cumulative byte length is tracked while chunks arrive so an oversized body
 * is rejected (413) and the socket is torn down before the full payload is
 * buffered into memory, instead of only being checked after the fact.
 */
function createBodyCollector({ logger, getMaxBytesForPath }) {
    return (req, res, next) => {
        if (req.method === "GET" || req.method === "OPTIONS" || req.method === "HEAD") {
            return next();
        }

        const maxBytes = getMaxBytesForPath(req.path);

        const contentLength = Number(req.headers["content-length"]);
        if (Number.isFinite(contentLength) && contentLength > maxBytes) {
            return res.status(413).json({ message: "requestBodyTooLarge" });
        }

        const chunks = [];
        let totalBytes = 0;
        let rejected = false;

        req.on("data", chunk => {
            if (rejected) return;

            totalBytes += chunk.length;
            if (totalBytes > maxBytes) {
                rejected = true;
                chunks.length = 0;
                res.status(413).json({ message: "requestBodyTooLarge" });
                req.destroy();
                return;
            }

            chunks.push(chunk);
        });

        req.on("end", () => {
            if (rejected) return;

            req.rawBody = Buffer.concat(chunks);

            // Try to parse JSON for req.body compatibility
            if (req.headers["content-type"]?.includes("application/json")) {
                try {
                    req.body = JSON.parse(req.rawBody.toString());
                } catch (e) {
                    // Not valid JSON, keep req.body undefined or empty
                    req.body = {};
                }
            } else if (req.headers["content-type"]?.includes("application/x-www-form-urlencoded")) {
                try {
                    req.body = querystring.parse(req.rawBody.toString());
                } catch (e) {
                    req.body = {};
                }
            } else {
                req.body = {};
            }

            next();
        });

        req.on("error", err => {
            if (rejected) return;
            logger.error(`[System] Request stream error: ${err.message}`);
            next(err);
        });
    };
}

module.exports = { createBodyCollector };

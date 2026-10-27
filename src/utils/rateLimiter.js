/**
 * File: src/utils/rateLimiter.js
 * Description: Bounded, TTL-based in-memory rate limiter middleware factory
 *
 * Author: OrbisAI Security
 */

/**
 * Creates a lightweight in-memory, fixed-window rate limiter to protect
 * authenticated endpoints from abuse/resource exhaustion. Expired entries are
 * periodically swept so the internal Map cannot grow without bound.
 */
function createRateLimiter({ windowMs, max, now = Date.now, sweepIntervalMs = windowMs }) {
    const hits = new Map();

    function sweep(currentTime = now()) {
        for (const [key, record] of hits) {
            if (currentTime - record.start > windowMs) {
                hits.delete(key);
            }
        }
    }

    const sweepTimer = setInterval(() => sweep(), sweepIntervalMs);
    sweepTimer.unref();

    function middleware(req, res, next) {
        const key = req.session?.id || req.ip;
        const currentTime = now();
        const record = hits.get(key);
        if (!record || currentTime - record.start > windowMs) {
            hits.set(key, { count: 1, start: currentTime });
            return next();
        }
        record.count += 1;
        if (record.count > max) {
            return res.status(429).json({ message: "tooManyRequests" });
        }
        return next();
    }

    middleware.sweep = sweep;
    middleware.size = () => hits.size;
    middleware.stop = () => clearInterval(sweepTimer);

    return middleware;
}

module.exports = { createRateLimiter };

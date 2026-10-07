const test = require("node:test");
const assert = require("node:assert/strict");
const StatusRoutes = require("../../src/routes/StatusRoutes");

function createFakeApp() {
    const handlers = {};
    const fakeApp = {};

    for (const method of ["get", "post", "put", "delete"]) {
        fakeApp[method] = (routePath, ...rest) => {
            handlers[`${method} ${routePath}`] = rest[rest.length - 1];
            return fakeApp;
        };
    }

    fakeApp.handlers = handlers;
    return fakeApp;
}

function createFakeRes() {
    const res = {
        body: null,
        statusCode: null,
    };
    res.status = code => {
        res.statusCode = code;
        return res;
    };
    res.json = body => {
        res.body = body;
        return res;
    };
    return res;
}

const noopLogger = { error: () => {}, info: () => {}, warn: () => {} };

function createStatusRoutes(usageStatsService) {
    const serverSystem = {
        config: {
            statusRateLimitMaxAttempts: 60,
            statusRateLimitWindowMinutes: 1,
            usageStatsImportRateLimitMaxAttempts: 5,
            usageStatsImportRateLimitWindowMinutes: 1,
            usageStatsRateLimitMaxAttempts: 30,
            usageStatsRateLimitWindowMinutes: 1,
        },
        logger: noopLogger,
        usageStatsService,
    };
    return new StatusRoutes(serverSystem);
}

function getImportHandler(statusRoutes) {
    const app = createFakeApp();
    statusRoutes.setupRoutes(app, (req, res, next) => next());
    return app.handlers["post /api/usage-stats/import"];
}

test("maps the too-many-lines import error to a 400 response", async t => {
    const fakeService = {
        enabled: true,
        importJsonl: async () => {
            const error = new Error("Import exceeds maximum of 5 records (received 6)");
            error.code = "USAGE_STATS_IMPORT_TOO_MANY_LINES";
            throw error;
        },
        isImportingStats: false,
        maxImportLines: 5,
    };
    const statusRoutes = createStatusRoutes(fakeService);
    t.after(() => {
        statusRoutes.statusRateLimiter.stop();
        statusRoutes.usageStatsRateLimiter.stop();
        statusRoutes.usageStatsImportRateLimiter.stop();
    });

    const handler = getImportHandler(statusRoutes);
    const req = { body: { content: "irrelevant", filename: "stats.jsonl" } };
    const res = createFakeRes();

    await handler(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.message, "usageStatsImportTooManyLines");
    assert.equal(res.body.maxLines, 5);
});

test("maps any other import error to a 500 response", async t => {
    const fakeService = {
        enabled: true,
        importJsonl: async () => {
            throw new Error("disk is full");
        },
        isImportingStats: false,
        maxImportLines: 5,
    };
    const statusRoutes = createStatusRoutes(fakeService);
    t.after(() => {
        statusRoutes.statusRateLimiter.stop();
        statusRoutes.usageStatsRateLimiter.stop();
        statusRoutes.usageStatsImportRateLimiter.stop();
    });

    const handler = getImportHandler(statusRoutes);
    const req = { body: { content: "irrelevant", filename: "stats.jsonl" } };
    const res = createFakeRes();

    await handler(req, res);

    assert.equal(res.statusCode, 500);
    assert.equal(res.body.message, "usageStatsImportFailed");
});

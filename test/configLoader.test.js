const { test } = require("node:test");
const assert = require("node:assert");
const ConfigLoader = require("../src/utils/ConfigLoader");

test("ConfigLoader defaults streamTimeoutMs to 0", () => {
    const logger = { debug: () => {}, error: () => {}, info: () => {}, warn: () => {} };
    const loader = new ConfigLoader(logger);

    // Save and clear env var
    const origEnv = process.env.STREAM_TIMEOUT_MS;
    delete process.env.STREAM_TIMEOUT_MS;

    try {
        const config = loader.loadConfiguration();
        assert.strictEqual(config.streamTimeoutMs, 0);
    } finally {
        if (origEnv !== undefined) {
            process.env.STREAM_TIMEOUT_MS = origEnv;
        } else {
            delete process.env.STREAM_TIMEOUT_MS;
        }
    }
});

test("ConfigLoader parses positive STREAM_TIMEOUT_MS environment variable", () => {
    const logger = { debug: () => {}, error: () => {}, info: () => {}, warn: () => {} };
    const loader = new ConfigLoader(logger);

    const origEnv = process.env.STREAM_TIMEOUT_MS;
    process.env.STREAM_TIMEOUT_MS = "60000";

    try {
        const config = loader.loadConfiguration();
        assert.strictEqual(config.streamTimeoutMs, 60000);
    } finally {
        if (origEnv !== undefined) {
            process.env.STREAM_TIMEOUT_MS = origEnv;
        } else {
            delete process.env.STREAM_TIMEOUT_MS;
        }
    }
});

test("ConfigLoader clamps STREAM_TIMEOUT_MS above hard max to 300000", () => {
    const logger = { debug: () => {}, error: () => {}, info: () => {}, warn: () => {} };
    const loader = new ConfigLoader(logger);

    const origEnv = process.env.STREAM_TIMEOUT_MS;
    process.env.STREAM_TIMEOUT_MS = "600000";

    try {
        const config = loader.loadConfiguration();
        assert.strictEqual(config.streamTimeoutMs, 300000);
    } finally {
        if (origEnv !== undefined) {
            process.env.STREAM_TIMEOUT_MS = origEnv;
        } else {
            delete process.env.STREAM_TIMEOUT_MS;
        }
    }
});

test("ConfigLoader keeps explicit 0 STREAM_TIMEOUT_MS as 0 (disabled)", () => {
    const logger = { debug: () => {}, error: () => {}, info: () => {}, warn: () => {} };
    const loader = new ConfigLoader(logger);

    const origEnv = process.env.STREAM_TIMEOUT_MS;
    process.env.STREAM_TIMEOUT_MS = "0";

    try {
        const config = loader.loadConfiguration();
        assert.strictEqual(config.streamTimeoutMs, 0);
    } finally {
        if (origEnv !== undefined) {
            process.env.STREAM_TIMEOUT_MS = origEnv;
        } else {
            delete process.env.STREAM_TIMEOUT_MS;
        }
    }
});

test("ConfigLoader normalizes invalid or negative STREAM_TIMEOUT_MS to 0", () => {
    const logger = { debug: () => {}, error: () => {}, info: () => {}, warn: () => {} };
    const loader = new ConfigLoader(logger);

    const origEnv = process.env.STREAM_TIMEOUT_MS;

    const invalidInputs = ["-500", "invalid", "-1"];
    for (const input of invalidInputs) {
        process.env.STREAM_TIMEOUT_MS = input;
        try {
            const config = loader.loadConfiguration();
            assert.strictEqual(config.streamTimeoutMs, 0, `Input '${input}' should normalize to 0`);
        } finally {
            if (origEnv !== undefined) {
                process.env.STREAM_TIMEOUT_MS = origEnv;
            } else {
                delete process.env.STREAM_TIMEOUT_MS;
            }
        }
    }
});

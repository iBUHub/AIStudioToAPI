const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const UsageStatsService = require("../../src/core/UsageStatsService");

const noopLogger = { error: () => {}, info: () => {}, warn: () => {} };

function createService(maxImportLines) {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "aistudio-usage-stats-"));
    const service = new UsageStatsService(null, noopLogger, dataDir, true, maxImportLines);
    return { dataDir, service };
}

function jsonlOf(count) {
    const lines = [];
    for (let i = 0; i < count; i++) {
        lines.push(JSON.stringify({ requestId: `req-${i}` }));
    }
    return lines.join("\n");
}

test("rejects an import that exceeds the configured line cap", async t => {
    const { dataDir, service } = createService(5);
    t.after(() => fs.rmSync(dataDir, { force: true, recursive: true }));

    await assert.rejects(
        () => service.importJsonl(jsonlOf(6)),
        err => err.code === "USAGE_STATS_IMPORT_TOO_MANY_LINES"
    );
});

test("accepts an import exactly at the line cap", async t => {
    const { dataDir, service } = createService(5);
    t.after(() => fs.rmSync(dataDir, { force: true, recursive: true }));

    const result = await service.importJsonl(jsonlOf(5));

    assert.equal(result.importedCount, 5);
    assert.equal(result.totalRecords, 5);
    assert.equal(result.duplicateCount, 0);
    assert.equal(result.invalidLineCount, 0);
    assert.equal(result.missingRequestIdCount, 0);
});

test("trailing blank lines do not count toward the line cap", async t => {
    const { dataDir, service } = createService(5);
    t.after(() => fs.rmSync(dataDir, { force: true, recursive: true }));

    const content = `${jsonlOf(5)}\n\n\n`;
    const result = await service.importJsonl(content);

    assert.equal(result.importedCount, 5);
});

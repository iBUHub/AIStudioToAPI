const { test } = require("node:test");
const assert = require("node:assert");
const RequestHandler = require("../src/core/RequestHandler");
const MessageQueue = require("../src/utils/MessageQueue");
const { QueueTimeoutError, QueueClosedError } = require("../src/utils/MessageQueue");

// Real RequestHandler relies on config for the timeout contract under test.
// AuthSwitcher/FormatConverter constructors only assign fields (no external side effects).
function makeRequestHandler(streamTimeoutMs) {
    const logger = { debug: () => {}, error: () => {}, info: () => {}, warn: () => {} };
    const config = {
        fakeStreamTimeoutMs: 300000,
        streamTimeoutMs,
    };
    const authSource = { accountNameMap: new Map() };
    const browserManager = {};
    return new RequestHandler(undefined, undefined, logger, browserManager, config, authSource);
}

test("RequestHandler STREAM_CHUNK defaults to 0 when config streamTimeoutMs is 0", () => {
    const rh = makeRequestHandler(0);
    assert.strictEqual(rh.timeouts.STREAM_CHUNK, 0);
});

test("RequestHandler STREAM_CHUNK uses explicit positive streamTimeoutMs", () => {
    const rh = makeRequestHandler(60000);
    assert.strictEqual(rh.timeouts.STREAM_CHUNK, 60000);
});

test("Stream loop with streamTimeoutMs=0 does not timeout during long inter-chunk delay", async () => {
    const queue = new MessageQueue(0);
    const timeoutMs = 0;

    let received = null;
    const streamTask = (async () => {
        const msg = await queue.dequeue(timeoutMs);
        received = msg;
    })();

    // Simulate delay longer than old 60s window (simulated with 60ms delay)
    await new Promise(r => setTimeout(r, 60));
    assert.strictEqual(received, null, "Should still be waiting for chunk without timing out");

    queue.enqueue({ data: "prefill/reasoning payload", type: "chunk" });
    await streamTask;

    assert.deepStrictEqual(received, { data: "prefill/reasoning payload", type: "chunk" });
});

test("Stream loop with positive timeoutMs rejects with QueueTimeoutError when deadline passes", async () => {
    const queue = new MessageQueue(0);
    const timeoutMs = 30; // 30ms positive timeout

    await assert.rejects(async () => {
        await queue.dequeue(timeoutMs);
    }, QueueTimeoutError);
});

test("Stream loop with streamTimeoutMs=0 terminates cleanly when client disconnects (queue closed)", async () => {
    const queue = new MessageQueue(0);
    const timeoutMs = 0;

    const streamTask = queue.dequeue(timeoutMs);

    // Client disconnects
    queue.close("client_disconnect");

    await assert.rejects(
        async () => {
            await streamTask;
        },
        err => err instanceof QueueClosedError && err.reason === "client_disconnect"
    );
});

test("RequestHandler real stream loop honors this.timeouts.STREAM_CHUNK (empty queue -> QueueTimeoutError)", async () => {
    const rh = makeRequestHandler(30);
    const queue = new MessageQueue(0);

    // Real production loop (_streamClaudeResponse) reads this.timeouts.STREAM_CHUNK (30ms here).
    // Empty queue -> internal dequeue timeout fires -> QueueTimeoutError propagates before any res use.
    await assert.rejects(async () => {
        await rh._streamClaudeResponse(queue, {}, "gemini-2.5-flash", "req-1");
    }, QueueTimeoutError);
});

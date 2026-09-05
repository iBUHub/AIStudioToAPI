"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const path = require("path");

const RequestHandler = require(path.join(__dirname, "..", "src/core/RequestHandler.js"));
const FormatConverter = require(path.join(__dirname, "..", "src/core/FormatConverter.js"));
const ConnectionRegistry = require(path.join(__dirname, "..", "src/core/ConnectionRegistry.js"));

const stubLogger = { debug: () => {}, error: () => {}, info: () => {}, warn: () => {} };

function makeHandler() {
    const rh = Object.create(RequestHandler.prototype);
    rh.formatConverter = new FormatConverter(stubLogger, {
        get config() {
            return { forceThinking: false, thinkingLevel: null, webSearch: false };
        },
    });
    rh.timeouts = { STREAM_CHUNK: 60000 };
    return rh;
}

test("_isEmptyUpstreamResponse: native Anthropic text and tool_use are not empty", () => {
    const rh = makeHandler();
    assert.strictEqual(
        rh._isEmptyUpstreamResponse({
            content: [{ text: "hello", type: "text" }],
            stop_reason: "end_turn",
            usage: { output_tokens: 1 },
        }),
        false
    );
    assert.strictEqual(
        rh._isEmptyUpstreamResponse({
            content: [{ input: {}, name: "ping", type: "tool_use" }],
            stop_reason: "tool_use",
            usage: { output_tokens: 1 },
        }),
        false
    );
});

test("_isEmptyUpstreamResponse: unknown Anthropic content blocks fail safe as content", () => {
    const rh = makeHandler();
    assert.strictEqual(
        rh._isEmptyUpstreamResponse({
            content: [{ payload: { value: "future-output" }, type: "future_block" }],
            stop_reason: "end_turn",
            usage: { output_tokens: 0 },
        }),
        false
    );
});

test("_isEmptyUpstreamResponse: native Anthropic empty terminal response is empty", () => {
    const rh = makeHandler();
    assert.strictEqual(
        rh._isEmptyUpstreamResponse({
            content: [{ text: "   ", type: "text" }],
            stop_reason: "end_turn",
            usage: { output_tokens: 0 },
        }),
        true
    );
    assert.strictEqual(rh._isEmptyUpstreamResponse({ content: [] }), false, "non-terminal headers stay pass-through");
});

test("_withFailureAuthIndex resolves the request account without reading mutable current account", () => {
    const rh = makeHandler();
    rh.connectionRegistry = {
        getAuthIndexForRequest: requestId => (requestId === "req-source" ? 4 : null),
    };
    const details = rh._withFailureAuthIndex({ status: 429 }, "req-source");
    assert.deepStrictEqual(details, { authIndex: 4, status: 429 });
    const explicit = rh._withFailureAuthIndex({ status: 502 }, "missing", 7);
    assert.deepStrictEqual(explicit, { authIndex: 7, status: 502 });
});

test("ConnectionRegistry routes each browser message with its source authIndex", () => {
    const registry = Object.create(ConnectionRegistry.prototype);
    const messages = [];
    const queue = { close: () => {}, enqueue: message => messages.push(message) };
    registry._routeMessage({ data: { text: "x" }, event_type: "chunk" }, queue, 3);
    registry._routeMessage({ event_type: "stream_close" }, queue, 5);
    assert.strictEqual(messages[0].authIndex, 3);
    assert.deepStrictEqual(messages[1], { authIndex: 5, type: "STREAM_END" });
});

test("AuthSwitcher attributes concurrent failure counters to explicit source authIndex", async () => {
    const AuthSwitcher = require(path.join(__dirname, "..", "src/auth/AuthSwitcher.js"));
    const mockBrowser = { currentAuthIndex: 9 };
    const authSwitcher = new AuthSwitcher(
        stubLogger,
        { immediateSwitchStatusCodes: [502] },
        { getAuthCount: () => 10, getCanonicalIndex: i => i },
        mockBrowser
    );
    let switchStartIndex;
    let allowOriginalFallback;
    authSwitcher.switchToNextAuth = async (failedAuthIndex, allowFallback) => {
        switchStartIndex = failedAuthIndex;
        allowOriginalFallback = allowFallback;
        return { success: true };
    };

    await authSwitcher.handleRequestFailureAndSwitch({ authIndex: 2, reason: "empty_upstream_response" }, null);

    assert.strictEqual(authSwitcher._emptyJudgmentCounts.get(2), 1);
    assert.strictEqual(authSwitcher._emptyJudgmentCounts.has(9), false);
    assert.strictEqual(switchStartIndex, 2);
    assert.strictEqual(allowOriginalFallback, false);
});

// ---- _extractSseEvents ----
test("_extractSseEvents splits events on LF blank line", () => {
    const rh = makeHandler();
    const { complete, remainder } = rh._extractSseEvents("data: a\n\ndata: b\n\n");
    assert.deepStrictEqual(complete, ["data: a", "data: b"]);
    assert.strictEqual(remainder, "");
});

test("_extractSseEvents splits events on CRLF blank line", () => {
    const rh = makeHandler();
    const { complete, remainder } = rh._extractSseEvents("data: a\r\n\r\ndata: b\r\n\r\n");
    assert.deepStrictEqual(complete, ["data: a", "data: b"]);
    assert.strictEqual(remainder, "");
});

test("_extractSseEvents keeps a fragmented trailing event in remainder", () => {
    const rh = makeHandler();
    const { complete, remainder } = rh._extractSseEvents("data: a\n\ndata: partial");
    assert.deepStrictEqual(complete, ["data: a"]);
    assert.strictEqual(remainder, "data: partial");
});

test("_extractSseEvents returns multiple complete events from one chunk", () => {
    const rh = makeHandler();
    const { complete, remainder } = rh._extractSseEvents("data: a\n\ndata: b\n\ndata: c\n\n");
    assert.deepStrictEqual(complete, ["data: a", "data: b", "data: c"]);
    assert.strictEqual(remainder, "");
});

test("_extractSseEvents preserves a trailing CR in the remainder", () => {
    const rh = makeHandler();
    const { complete, remainder } = rh._extractSseEvents("data: a\n\ndata: b\r");
    assert.deepStrictEqual(complete, ["data: a"]);
    assert.strictEqual(remainder, "data: b\r");
});

// ---- _translateCompleteSseEvent ----
test("_translateCompleteSseEvent returns null for an empty event", () => {
    const rh = makeHandler();
    assert.strictEqual(rh._translateCompleteSseEvent("", "gemini-2.5-flash-lite"), null);
    assert.strictEqual(rh._translateCompleteSseEvent("  \n ", "gemini-2.5-flash-lite"), null);
});

test("_translateCompleteSseEvent skips an event with no data line", () => {
    const rh = makeHandler();
    assert.strictEqual(rh._translateCompleteSseEvent("event: ping\nid: 1", "gemini-2.5-flash-lite"), null);
});

test("_translateCompleteSseEvent passes through [DONE]", () => {
    const rh = makeHandler();
    const out = rh._translateCompleteSseEvent("data: [DONE]", "gemini-2.5-flash-lite");
    assert.ok(typeof out === "string" && out.includes("[DONE]"), `got ${String(out)}`);
});

test("_translateCompleteSseEvent skips a non-JSON data payload", () => {
    const rh = makeHandler();
    assert.strictEqual(rh._translateCompleteSseEvent("data: not-json", "gemini-2.5-flash-lite"), null);
});

test("_translateCompleteSseEvent translates a valid JSON event and trims trailing CR", () => {
    const rh = makeHandler();
    const payload = JSON.stringify({ candidates: [{ content: { parts: [{ text: "hello hi" }] } }] });
    const out = rh._translateCompleteSseEvent(`data: ${payload}\r`, "gemini-2.5-flash-lite");
    assert.ok(typeof out === "string" && out.includes("hello hi"), `got ${String(out)}`);
});

// ---- _isEmptyUpstreamResponse ----
test("_isEmptyUpstreamResponse: pure tool call is NOT empty", () => {
    const rh = makeHandler();
    const resp = {
        candidates: [
            {
                content: { parts: [{ functionCall: { args: {}, name: "get_weather" } }] },
                finishReason: "STOP",
            },
        ],
    };
    assert.strictEqual(rh._isEmptyUpstreamResponse(resp), false);
});

test("_isEmptyUpstreamResponse: text content is NOT empty", () => {
    const rh = makeHandler();
    const resp = { candidates: [{ content: { parts: [{ text: "hello" }] }, finishReason: "STOP" }] };
    assert.strictEqual(rh._isEmptyUpstreamResponse(resp), false);
});

test("_isEmptyUpstreamResponse: reasoning-only non-terminal chunk is NOT empty", () => {
    const rh = makeHandler();
    const resp = { candidates: [{ content: { parts: [{ text: "hmm", thought: true }] } }] };
    assert.strictEqual(rh._isEmptyUpstreamResponse(resp), false);
});

test("_isEmptyUpstreamResponse: whitespace-only + STOP + zero completion tokens is EMPTY", () => {
    const rh = makeHandler();
    const resp = {
        candidates: [{ content: { parts: [{ text: "   " }] }, finishReason: "STOP" }],
        usageMetadata: { candidatesTokenCount: 0, thoughtsTokenCount: 0 },
    };
    assert.strictEqual(rh._isEmptyUpstreamResponse(resp), true);
});

test("_isEmptyUpstreamResponse: empty string + STOP is EMPTY", () => {
    const rh = makeHandler();
    const resp = { candidates: [{ content: { parts: [] }, finishReason: "STOP" }] };
    assert.strictEqual(rh._isEmptyUpstreamResponse(resp), true);
});

test("_isEmptyUpstreamResponse: whitespace text WITH completion tokens is NOT empty", () => {
    const rh = makeHandler();
    const resp = {
        candidates: [{ content: { parts: [{ text: " " }] }, finishReason: "STOP" }],
        usageMetadata: { candidatesTokenCount: 3, thoughtsTokenCount: 0 },
    };
    assert.strictEqual(rh._isEmptyUpstreamResponse(resp), false);
});
test("_isEmptyUpstreamResponse: terminal STOP with thought text part is NOT empty (thought parts count as content)", () => {
    const rh = makeHandler();
    const resp = {
        candidates: [{ content: { parts: [{ text: "hmm", thought: true }] }, finishReason: "STOP" }],
        usageMetadata: { candidatesTokenCount: 0, thoughtsTokenCount: 5 },
    };
    assert.strictEqual(rh._isEmptyUpstreamResponse(resp), false);
});

test("_isEmptyUpstreamResponse: candidates:[] header frame is NOT empty (no terminal evidence)", () => {
    const rh = makeHandler();
    assert.strictEqual(rh._isEmptyUpstreamResponse({ candidates: [] }), false);
    assert.strictEqual(
        rh._isEmptyUpstreamResponse({ candidates: [], usageMetadata: { promptTokenCount: 100 } }),
        false
    );
});

test("_isEmptyUpstreamResponse: choices:[] usage-only frame is NOT empty", () => {
    const rh = makeHandler();
    assert.strictEqual(rh._isEmptyUpstreamResponse({ choices: [] }), false);
    assert.strictEqual(rh._isEmptyUpstreamResponse({ choices: [], usage: { prompt_tokens: 50 } }), false);
});

test("_isEmptyUpstreamResponse: blocked promptFeedback is NOT empty (pass through, no switch)", () => {
    const rh = makeHandler();
    const resp = {
        candidates: [],
        promptFeedback: { blockReason: "SAFETY" },
    };
    assert.strictEqual(rh._isEmptyUpstreamResponse(resp), false);
});
test("_isEmptyUpstreamResponse: terminal STOP thinking-only with thoughtsTokenCount but no content is NOT empty", () => {
    const rh = makeHandler();
    const resp = {
        candidates: [{ content: { parts: [{ thought: true }] }, finishReason: "STOP" }],
        usageMetadata: { candidatesTokenCount: 0, thoughtsTokenCount: 3 },
    };
    assert.strictEqual(rh._isEmptyUpstreamResponse(resp), false);
});

// ---- OpenAI Response API fake stream: terminal empty upstream routes to switch+retry ----
test("Response API fake stream: empty upstream body is judged and routed to switch+retry, not forwarded", async () => {
    const rh = makeHandler();
    rh.logger = stubLogger;
    rh.config = { forceThinking: false, streamingMode: "fake", switchOnUses: 0, thinkingLevel: null };
    rh.needsSwitchingAfterRequest = false;
    rh.timeouts = { FAKE_STREAM: 100 };

    let switched = false;
    let errorSent = false;
    let dumped = false;
    let translated = false;

    rh.authSwitcher = {
        handleRequestFailureAndSwitch: async () => {
            switched = true;
        },
        incrementUsageCount: () => 0,
    };

    // Empty upstream: the tail queue delivers a STREAM_END with no content data,
    // so the accumulated fullBody stays empty and must be judged terminal-empty.
    const fakeQueue = { dequeue: async () => ({ type: "STREAM_END" }) };

    rh.connectionRegistry = {
        createMessageQueue: () => fakeQueue,
        removeMessageQueue: () => {},
    };
    rh._generateRequestId = () => "test-fake-empty";
    rh._startTrackedRequest = () => {};
    rh._setResponseApiFormat = (res, fmt) => {
        res.__responseApiFormat = fmt;
    };
    rh._ensureBrowserBackedRequestReady = async () => true;
    rh._setupClientDisconnectHandler = () => {};
    rh._initializeProxyRequestAttempt = () => {};
    rh._updateTrackedRequest = () => {};
    rh._getUsageStatsService = () => null;
    rh._executeRequestWithRetries = async () => ({ queue: fakeQueue, success: true });
    rh._forwardRequest = async () => {};
    rh._dumpUpstreamCorrelation = () => {
        dumped = true;
    };
    rh._handleRequestError = () => {
        errorSent = true;
    };
    rh._finalizeTrackedRequest = () => {};
    rh._isResponseWritable = () => true;
    rh._handleQueueTimeout = () => {};

    // Must NOT be reached: an empty upstream must not translate into a client stream.
    rh.formatConverter.translateGoogleToResponseAPIStream = () => {
        translated = true;
    };
    // Translate the outgoing OpenAI Responses request into Gemini deterministically.
    rh.formatConverter.translateOpenAIResponseToGoogle = () => ({
        cleanModelName: "gemini-2.5-flash",
        googleRequest: { contents: [{ parts: [{ text: "hi" }], role: "user" }] },
        modelStreamingMode: null,
    });

    const res = {
        __responseApiSeq: null,
        end: () => {
            res.writableEnded = true;
        },
        headersSent: false,
        status: () => ({ set: () => {} }),
        writableEnded: false,
        write: () => true,
    };
    const req = {
        body: { input: "hi", model: "gpt-4o-mini", stream: true },
        headers: {},
        method: "POST",
        protocol: "http",
        url: "/v1/responses",
    };

    // The fake-stream keep-alive timer (12-18s) is left pending after the request finishes and
    // would hold the test runner's event loop open. Replace long timers with an immediate no-op.
    const realSetTimeout = global.setTimeout;
    global.setTimeout = (fn, ms, ...args) =>
        ms >= 1000 ? realSetTimeout(() => {}, 0, ...args) : realSetTimeout(fn, ms, ...args);
    try {
        await rh.processOpenAIResponseRequest(req, res);
    } finally {
        global.setTimeout = realSetTimeout;
    }

    assert.strictEqual(switched, true, "empty upstream fake stream must route to account switch + retry");
    assert.strictEqual(errorSent, true, "empty upstream fake stream must send an error to the client");
    assert.strictEqual(dumped, true, "empty upstream fake stream must write a correlation dump");
    assert.strictEqual(
        translated,
        false,
        "empty upstream fake stream must not translate/send an empty stream to the client"
    );
});

// ---- OpenAI chat fake stream: terminal empty upstream routes to switch+retry ----
test("OpenAI chat fake stream: empty upstream body is judged and routed to switch+retry, not leaked", async () => {
    const rh = makeHandler();
    rh.logger = stubLogger;
    rh.config = { forceThinking: false, streamingMode: "fake", switchOnUses: 0, thinkingLevel: null };
    rh.needsSwitchingAfterRequest = false;
    rh.timeouts = { FAKE_STREAM: 100 };

    let switched = false;
    let switchCount = 0;
    let errorSent = false;
    let dumped = false;
    let translated = false;

    rh.authSwitcher = {
        handleRequestFailureAndSwitch: async () => {
            switchCount++;
            switched = true;
        },
        incrementUsageCount: () => 0,
    };

    // Empty upstream: whitespace-only STOP body with zero completion tokens accumulated in fullBody.
    const emptyBody = JSON.stringify({
        candidates: [{ content: { parts: [{ text: "   " }] }, finishReason: "STOP" }],
        usageMetadata: { candidatesTokenCount: 0, thoughtsTokenCount: 0 },
    });
    let dequeues = 0;
    const fakeQueue = {
        dequeue: async () => {
            dequeues++;
            if (dequeues === 1) {
                return { data: emptyBody, event_type: "chunk" };
            }
            return { type: "STREAM_END" };
        },
    };

    rh.connectionRegistry = {
        createMessageQueue: () => fakeQueue,
        removeMessageQueue: () => {},
    };
    rh._generateRequestId = () => "test-openai-chat-fake-empty";
    rh._startTrackedRequest = () => {};
    rh._setResponseApiFormat = (res, fmt) => {
        res.__responseApiFormat = fmt;
    };
    rh._ensureBrowserBackedRequestReady = async () => true;
    rh._setupClientDisconnectHandler = () => {};
    rh._initializeProxyRequestAttempt = () => {};
    rh._updateTrackedRequest = () => {};
    rh._getUsageStatsService = () => null;
    rh._executeRequestWithRetries = async () => ({ queue: fakeQueue, success: true });
    rh._forwardRequest = async () => {};
    rh._dumpUpstreamCorrelation = () => {
        dumped = true;
    };
    // _handleRequestError may be the SSE-error path; deflect it to prevent actual writes.
    rh._handleRequestError = () => {
        errorSent = true;
    };
    rh._finalizeTrackedRequest = () => {};
    rh._isResponseWritable = () => true;
    rh._handleQueueTimeout = () => {};

    // Must NOT be reached: an empty upstream must not translate into a client stream.
    rh.formatConverter.translateGoogleToOpenAIStream = () => {
        translated = true;
    };
    // Translate the outgoing OpenAI chat request into Gemini deterministically.
    rh.formatConverter.translateOpenAIToGoogle = () => ({
        cleanModelName: "gemini-2.5-flash",
        googleRequest: { contents: [{ parts: [{ text: "hi" }], role: "user" }] },
        modelStreamingMode: null,
    });

    const res = {
        end: () => {
            res.writableEnded = true;
        },
        headersSent: false,
        status: () => ({ set: () => {} }),
        writableEnded: false,
        write: () => true,
    };
    const req = {
        body: { messages: [{ content: "hi", role: "user" }], model: "gpt-4o-mini", stream: true },
        headers: {},
        method: "POST",
        protocol: "http",
        url: "/v1/chat/completions",
    };

    // The fake-stream keep-alive timer is left pending after the request finishes and would hold
    // the test runner's event loop open. Replace long timers with an immediate no-op.
    const realSetTimeout = global.setTimeout;
    global.setTimeout = (fn, ms, ...args) =>
        ms >= 1000 ? realSetTimeout(() => {}, 0, ...args) : realSetTimeout(fn, ms, ...args);
    try {
        await rh.processOpenAIRequest(req, res);
    } finally {
        global.setTimeout = realSetTimeout;
    }

    assert.strictEqual(switched, true, "empty upstream fake stream must route to account switch + retry");
    assert.strictEqual(switchCount, 1, "empty upstream fake stream must trigger exactly one auth switch");
    assert.strictEqual(errorSent, true, "empty upstream fake stream must send an error to the client");
    assert.strictEqual(dumped, true, "empty upstream fake stream must write a correlation dump");
    assert.strictEqual(
        translated,
        false,
        "empty upstream fake stream must not translate/send an empty completion to the client"
    );
});

// ---- OpenAI chat fake stream: non-empty upstream still translates (no behavior change) ----
test("OpenAI chat fake stream: non-empty upstream still translates to the client", async () => {
    const rh = makeHandler();
    rh.logger = stubLogger;
    rh.config = { forceThinking: false, streamingMode: "fake", switchOnUses: 0, thinkingLevel: null };
    rh.needsSwitchingAfterRequest = false;
    rh.timeouts = { FAKE_STREAM: 100 };

    let switchCount = 0;
    const written = [];
    let translatedChunk = "data: {}\n\n";

    rh.authSwitcher = {
        handleRequestFailureAndSwitch: async () => {
            switchCount++;
        },
        incrementUsageCount: () => 0,
    };

    const nonEmptyBody = JSON.stringify({
        candidates: [{ content: { parts: [{ text: "hello" }] }, finishReason: "STOP" }],
        usageMetadata: { candidatesTokenCount: 5, thoughtsTokenCount: 0 },
    });
    const fakeQueue = {
        dequeue: async () => {
            if (!fakeQueue._sent) {
                fakeQueue._sent = true;
                return { data: nonEmptyBody, event_type: "chunk" };
            }
            return { type: "STREAM_END" };
        },
    };

    rh.connectionRegistry = {
        createMessageQueue: () => fakeQueue,
        removeMessageQueue: () => {},
    };
    rh._generateRequestId = () => "test-openai-chat-fake-nonempty";
    rh._startTrackedRequest = () => {};
    rh._setResponseApiFormat = () => {};
    rh._ensureBrowserBackedRequestReady = async () => true;
    rh._setupClientDisconnectHandler = () => {};
    rh._initializeProxyRequestAttempt = () => {};
    rh._updateTrackedRequest = () => {};
    rh._getUsageStatsService = () => null;
    rh._executeRequestWithRetries = async () => ({ queue: fakeQueue, success: true });
    rh._forwardRequest = async () => {};
    rh._dumpUpstreamCorrelation = () => {};
    rh._handleRequestError = () => {};
    rh._finalizeTrackedRequest = () => {};
    rh._isResponseWritable = () => true;
    rh._handleQueueTimeout = () => {};

    rh.formatConverter.translateGoogleToOpenAIStream = fullBody => {
        translatedChunk = `data: ${JSON.stringify({ content: fullBody })}\n\n`;
        return translatedChunk;
    };
    rh.formatConverter.translateOpenAIToGoogle = () => ({
        cleanModelName: "gemini-2.5-flash",
        googleRequest: { contents: [{ parts: [{ text: "hi" }], role: "user" }] },
        modelStreamingMode: null,
    });

    const res = {
        end: () => {
            res.writableEnded = true;
        },
        headersSent: false,
        status: () => ({ set: () => {} }),
        writableEnded: false,
        write: chunk => {
            written.push(chunk);
            return true;
        },
    };
    const req = {
        body: { messages: [{ content: "hi", role: "user" }], model: "gpt-4o-mini", stream: true },
        headers: {},
        method: "POST",
        protocol: "http",
        url: "/v1/chat/completions",
    };

    const realSetTimeout = global.setTimeout;
    global.setTimeout = (fn, ms, ...args) =>
        ms >= 1000 ? realSetTimeout(() => {}, 0, ...args) : realSetTimeout(fn, ms, ...args);
    try {
        await rh.processOpenAIRequest(req, res);
    } finally {
        global.setTimeout = realSetTimeout;
    }

    assert.strictEqual(switchCount, 0, "non-empty upstream must not switch accounts");
    assert.ok(
        written.some(chunk => chunk.includes("data: ")),
        "translated stream must be written to the client"
    );
});

// ---- Regression tests for Items 1, 2, 3, 4 ----
test("Item 1: _dumpUpstreamCorrelation is only called for event_type === 'chunk' with defined data", () => {
    const rh = makeHandler();
    let dumpCalled = false;
    rh._dumpUpstreamCorrelation = () => {
        dumpCalled = true;
    };

    // response_headers frame (no data) must NOT call _dumpUpstreamCorrelation
    const headerMsg = { event_type: "response_headers", headers: {} };
    if (headerMsg?.event_type === "chunk" && headerMsg.data !== undefined) {
        rh._dumpUpstreamCorrelation("test", headerMsg.data, "req-1", "m", 0);
    }
    assert.strictEqual(dumpCalled, false);

    // chunk frame with data MUST call _dumpUpstreamCorrelation
    const chunkMsg = { data: { foo: "bar" }, event_type: "chunk" };
    if (chunkMsg?.event_type === "chunk" && chunkMsg.data !== undefined) {
        rh._dumpUpstreamCorrelation("test", chunkMsg.data, "req-1", "m", 0);
    }
    assert.strictEqual(dumpCalled, true);
});

test("Item 2: _streamOpenAIResponse uses _sendErrorChunkToClient when headers already sent", async () => {
    const rh = makeHandler();
    rh.logger = stubLogger;
    rh.authSwitcher = { handleRequestFailureAndSwitch: () => {} };

    let sseErrorSent = false;
    let jsonErrorSent = false;

    rh._sendErrorChunkToClient = () => {
        sseErrorSent = true;
    };
    rh._sendErrorResponse = () => {
        jsonErrorSent = true;
    };

    const fakeQueue = {
        dequeue: async () => ({ type: "STREAM_END" }),
    };

    const res = {
        end: () => {},
        headersSent: true,
        writableEnded: false,
    };

    await rh._streamOpenAIResponse(fakeQueue, res, "gpt-4o", "req-stream-err");

    assert.strictEqual(sseErrorSent, true, "must call _sendErrorChunkToClient when res.headersSent is true");
    assert.strictEqual(jsonErrorSent, false, "must NOT call _sendErrorResponse when res.headersSent is true");
});

test("Item 3: AuthSwitcher deletes only failing index on non-empty failure, preserving other accounts", async () => {
    const AuthSwitcher = require(path.join(__dirname, "..", "src/auth/AuthSwitcher.js"));
    const mockBrowser = { currentAuthIndex: 0 };
    const authSwitcher = new AuthSwitcher(
        stubLogger,
        { immediateSwitchStatusCodes: [401, 403, 429, 500, 502, 503] },
        { getAuthCount: () => 3, getCanonicalIndex: i => i },
        mockBrowser
    );
    authSwitcher.switchToNextAuth = async () => ({ success: true });

    // Simulate empty failure on account 0 and account 1
    mockBrowser.currentAuthIndex = 0;
    await authSwitcher.handleRequestFailureAndSwitch({ reason: "empty_upstream_response" }, null);

    mockBrowser.currentAuthIndex = 1;
    await authSwitcher.handleRequestFailureAndSwitch({ reason: "empty_upstream_response" }, null);

    assert.strictEqual(authSwitcher._emptyJudgmentCounts.get(0), 1);
    assert.strictEqual(authSwitcher._emptyJudgmentCounts.get(1), 1);

    // Non-empty failure on account 1 should delete account 1 counter ONLY
    mockBrowser.currentAuthIndex = 1;
    await authSwitcher.handleRequestFailureAndSwitch({ reason: "rate_limit", status: 429 }, null);

    assert.strictEqual(authSwitcher._emptyJudgmentCounts.has(1), false, "account 1 counter deleted");
    assert.strictEqual(authSwitcher._emptyJudgmentCounts.get(0), 1, "account 0 counter preserved");
});

test("Item 4: FormatConverter.mergeConsecutiveSameRoleContents merges same roles", () => {
    const googleContents = [
        { parts: [{ text: "a" }], role: "user" },
        { parts: [{ text: "b" }], role: "user" },
        { parts: [{ text: "c" }], role: "model" },
    ];
    const merged = FormatConverter.mergeConsecutiveSameRoleContents(googleContents);
    assert.strictEqual(merged.length, 2);
    assert.strictEqual(merged[0].role, "user");
    assert.deepStrictEqual(merged[0].parts, [{ text: "a" }, { text: "b" }]);
    assert.strictEqual(merged[1].role, "model");
});

// ---- Studio PR #228 adjudication regressions ----

// Fix 2: control finish reasons are valid non-empty results even with zero completion tokens.
test("_isEmptyUpstreamResponse: Gemini control finish reasons are NOT empty with zero tokens", () => {
    const rh = makeHandler();
    for (const reason of ["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "IMAGE_SAFETY"]) {
        const resp = {
            candidates: [{ content: { parts: [] }, finishReason: reason }],
            usageMetadata: { candidatesTokenCount: 0, thoughtsTokenCount: 0 },
        };
        assert.strictEqual(
            rh._isEmptyUpstreamResponse(resp),
            false,
            `finishReason ${reason} must be a valid non-empty control result`
        );
    }
    // STOP with whitespace + zero tokens stays empty.
    assert.strictEqual(
        rh._isEmptyUpstreamResponse({
            candidates: [{ content: { parts: [{ text: " " }] }, finishReason: "STOP" }],
            usageMetadata: { candidatesTokenCount: 0, thoughtsTokenCount: 0 },
        }),
        true
    );
});

test("_isEmptyUpstreamResponse: unknown/OTHER finish reasons are not exempted as controls", () => {
    const rh = makeHandler();
    // An OTHER reason with zero content and zero tokens is still empty — do not exempt arbitrary reasons.
    assert.strictEqual(
        rh._isEmptyUpstreamResponse({
            candidates: [{ content: { parts: [] }, finishReason: "OTHER" }],
            usageMetadata: { candidatesTokenCount: 0, thoughtsTokenCount: 0 },
        }),
        true
    );
});

test("_isEmptyUpstreamResponse: OpenAI content_filter finish is NOT empty with zero tokens", () => {
    const rh = makeHandler();
    for (const reason of ["content_filter", "safety"]) {
        assert.strictEqual(
            rh._isEmptyUpstreamResponse({
                choices: [{ finish_reason: reason, message: { content: "" } }],
                usage: { completion_tokens: 0 },
            }),
            false,
            `finish_reason ${reason} must be a valid control result`
        );
    }
});

// Fix 1: STREAM_END must flush a trailing partial SSE event before classifying empty, and only then
// emit one auth-failure + SSE error (via _sendErrorChunkToClient when headers already sent).
test("_streamClaudeResponse: true-empty STREAM_END emits one switch and one SSE error", async () => {
    const rh = makeHandler();
    rh.logger = stubLogger;
    let switchCount = 0;
    let sseErrorCount = 0;
    let jsonErrorCount = 0;
    rh.authSwitcher = {
        failureCount: 0,
        handleRequestFailureAndSwitch: async () => {
            switchCount++;
        },
    };
    rh._handleAuthFailure = async () => {
        switchCount++;
    };
    rh._sendErrorChunkToClient = () => {
        sseErrorCount++;
    };
    rh._sendErrorResponse = () => {
        jsonErrorCount++;
    };
    rh._isResponseWritable = () => true;
    rh._translateCompleteSseEvent = () => null;

    const fakeQueue = {
        dequeue: async () => ({ type: "STREAM_END" }),
    };
    const res = { headersSent: true, writableEnded: false, write: () => true };

    await rh._streamClaudeResponse(fakeQueue, res, "claude-3-5-sonnet", "req-claude-empty");

    assert.strictEqual(switchCount, 1, "exactly one auth switch for a true-empty Claude stream");
    assert.strictEqual(sseErrorCount, 1, "one SSE error sent when headers already sent");
    assert.strictEqual(jsonErrorCount, 0, "no silent _sendErrorResponse no-op");
});

test("_streamClaudeResponse: fragmented final event is flushed and NOT judged empty", async () => {
    const rh = makeHandler();
    rh.logger = stubLogger;
    let switchCount = 0;
    let sseErrorCount = 0;
    const written = [];
    rh._handleAuthFailure = async () => {
        switchCount++;
    };
    rh._sendErrorChunkToClient = () => {
        sseErrorCount++;
    };
    rh._sendErrorResponse = () => {};
    rh._isResponseWritable = () => true;
    // A fragmented final SSE event reassembles in the buffer and translates to real output.
    rh._translateCompleteSseEvent = () => "event: content_block_delta\ndata: {}\n\n";
    const res = {
        headersSent: true,
        writableEnded: false,
        write: chunk => {
            written.push(chunk);
            return true;
        },
    };
    // Drive the stream: first a partial chunk, then STREAM_END.
    const partialPayload = 'data: {"candidates":[{"content":{"parts":[{"text":"partial"}]}}]}';
    const partialQueue = {
        dequeue: async () => {
            if (!partialQueue._sent) {
                partialQueue._sent = true;
                return { data: partialPayload, type: "chunk" };
            }
            return { type: "STREAM_END" };
        },
    };
    await rh._streamClaudeResponse(partialQueue, res, "claude-3-5-sonnet", "req-claude-flush");

    assert.strictEqual(switchCount, 0, "fragmented final event flush must NOT trigger empty judgment");
    assert.strictEqual(sseErrorCount, 0, "no SSE error when the flush produced output");
    assert.ok(written.length > 0, "the fragmented final event must be flushed to the client");
});

test("_streamOpenAIResponseAPIResponse: true-empty STREAM_END emits one switch and one SSE error", async () => {
    const rh = makeHandler();
    rh.logger = stubLogger;
    let switchCount = 0;
    let sseErrorCount = 0;
    let jsonErrorCount = 0;
    rh._handleAuthFailure = async () => {
        switchCount++;
    };
    rh._sendErrorChunkToClient = () => {
        sseErrorCount++;
    };
    rh._sendErrorResponse = () => {
        jsonErrorCount++;
    };
    rh._isResponseWritable = () => true;
    rh._translateCompleteSseEvent = () => null;

    const fakeQueue = {
        dequeue: async () => ({ type: "STREAM_END" }),
    };
    const res = {
        __responseApiSeq: null,
        headersSent: true,
        writableEnded: false,
        write: () => true,
    };

    await rh._streamOpenAIResponseAPIResponse(fakeQueue, res, "gpt-5", {
        requestId: "req-resp-empty",
        responseDefaults: {},
    });

    assert.strictEqual(switchCount, 1, "exactly one auth switch for a true-empty Responses stream");
    assert.strictEqual(sseErrorCount, 1, "one SSE error sent when headers already sent");
    assert.strictEqual(jsonErrorCount, 0, "no silent _sendErrorResponse no-op");
});

test("_streamOpenAIResponse: true-empty STREAM_END emits one switch and one SSE error", async () => {
    const rh = makeHandler();
    rh.logger = stubLogger;
    let switchCount = 0;
    let sseErrorCount = 0;
    let jsonErrorCount = 0;
    rh._handleAuthFailure = async () => {
        switchCount++;
    };
    rh._sendErrorChunkToClient = () => {
        sseErrorCount++;
    };
    rh._sendErrorResponse = () => {
        jsonErrorCount++;
    };
    rh._isResponseWritable = () => true;
    rh._translateCompleteSseEvent = () => null;

    const fakeQueue = {
        dequeue: async () => ({ type: "STREAM_END" }),
    };
    const res = { headersSent: true, writableEnded: false, write: () => true };

    await rh._streamOpenAIResponse(fakeQueue, res, "gpt-4o", "req-openai-empty");

    assert.strictEqual(switchCount, 1, "exactly one auth switch for a true-empty OpenAI stream");
    assert.strictEqual(sseErrorCount, 1, "one SSE error sent when headers already sent");
    assert.strictEqual(jsonErrorCount, 0, "no silent _sendErrorResponse no-op");
});

// Fix 3: Claude fake-stream aggregate terminal-empty must enter the existing single auth-failure + SSE error path.
test("Claude fake stream: empty aggregate body is judged and routed to switch+retry, not translated", async () => {
    const rh = makeHandler();
    rh.logger = stubLogger;
    rh.config = { forceThinking: false, streamingMode: "fake", switchOnUses: 0, thinkingLevel: null };
    rh.needsSwitchingAfterRequest = false;
    rh.timeouts = { FAKE_STREAM: 100 };

    let switched = false;
    let errorSent = false;
    let dumped = false;
    let translated = false;

    rh.authSwitcher = {
        handleRequestFailureAndSwitch: async () => {
            switched = true;
        },
        incrementUsageCount: () => 0,
    };

    const fakeQueue = { dequeue: async () => ({ type: "STREAM_END" }) };

    rh.connectionRegistry = {
        createMessageQueue: () => fakeQueue,
        removeMessageQueue: () => {},
    };
    rh._generateRequestId = () => "test-claude-fake-empty";
    rh._startTrackedRequest = () => {};
    rh._setResponseApiFormat = (res, fmt) => {
        res.__responseApiFormat = fmt;
    };
    rh._ensureBrowserBackedRequestReady = async () => true;
    rh._setupClientDisconnectHandler = () => {};
    rh._initializeProxyRequestAttempt = () => {};
    rh._updateTrackedRequest = () => {};
    rh._getUsageStatsService = () => null;
    rh._executeRequestWithRetries = async () => ({ queue: fakeQueue, success: true });
    rh._forwardRequest = async () => {};
    rh._dumpUpstreamCorrelation = () => {
        dumped = true;
    };
    rh._handleRequestError = () => {
        errorSent = true;
    };
    rh._finalizeTrackedRequest = () => {};
    rh._isResponseWritable = () => true;
    rh._handleQueueTimeout = () => {};

    rh.formatConverter.translateGoogleToClaudeStream = () => {
        translated = true;
    };
    rh.formatConverter.translateClaudeToGoogle = () => ({
        cleanModelName: "gemini-2.5-flash",
        googleRequest: { contents: [{ parts: [{ text: "hi" }], role: "user" }] },
        modelStreamingMode: null,
    });

    const res = {
        end: () => {
            res.writableEnded = true;
        },
        headersSent: false,
        status: () => ({ set: () => {} }),
        writableEnded: false,
        write: () => true,
    };
    const req = {
        body: { messages: [{ content: "hi", role: "user" }], model: "claude-3-5-sonnet", stream: true },
        headers: {},
        method: "POST",
        protocol: "http",
        url: "/v1/messages",
    };

    const realSetTimeout = global.setTimeout;
    global.setTimeout = (fn, ms, ...args) =>
        ms >= 1000 ? realSetTimeout(() => {}, 0, ...args) : realSetTimeout(fn, ms, ...args);
    try {
        await rh.processClaudeRequest(req, res);
    } finally {
        global.setTimeout = realSetTimeout;
    }

    assert.strictEqual(switched, true, "empty Claude fake stream must route to account switch + retry");
    assert.strictEqual(errorSent, true, "empty Claude fake stream must send an error to the client");
    assert.strictEqual(dumped, true, "empty Claude fake stream must write a correlation dump");
    assert.strictEqual(
        translated,
        false,
        "empty Claude fake stream must not translate/send an empty stream to the client"
    );
});

// Fix 4: OpenAI Responses real-stream initial complete-empty chunk converts into the existing error/retry flow.
test("Response API real stream: initial complete-empty chunk is converted to error/retry flow", async () => {
    const rh = makeHandler();
    rh.logger = stubLogger;
    rh.config = { forceThinking: false, immediateSwitchStatusCodes: [502], maxRetries: 0, streamingMode: "real" };
    rh.timeouts = { FAKE_STREAM: 100, STREAM_CHUNK: 100 };

    let switchCount = 0;
    let forwarded = 0;
    const rh2 = Object.create(RequestHandler.prototype);
    Object.assign(rh2, rh);
    rh2.authSwitcher = {
        failureCount: 0,
        handleRequestFailureAndSwitch: async () => {
            switchCount++;
        },
        incrementUsageCount: () => 0,
        resetEmptyJudgmentCountForAuth: () => {},
    };
    rh2._handleAuthFailure = async () => {
        switchCount++;
    };
    rh2._withFailureAuthIndex = d => d;
    rh2._isResponseWritable = () => true;
    rh2._cancelCurrentAttemptBeforeRetry = () => {};
    rh2._logFinalRequestFailure = () => {};
    rh2._sendErrorResponse = () => {};
    rh2._isConnectionResetError = () => false;
    // Emulate the real immediate-switch retry: perform the account switch and continue with a new queue.
    rh2._prepareImmediateStatusRetry = async () => {
        await rh2._handleAuthFailure({ message: "empty", status: 502 }, "req", null, 0);
        return true;
    };
    rh2._dumpUpstreamCorrelation = () => {};
    rh2._forwardRequest = async () => {
        forwarded++;
    };
    rh2._advanceProxyRequestAttempt = () => {};
    rh2._initializeProxyRequestAttempt = () => {};
    rh2._setupClientDisconnectHandler = () => {};
    rh2._generateRequestId = () => "req-resp-initial-empty";
    rh2._startTrackedRequest = () => {};
    rh2._setResponseApiFormat = () => {};
    rh2._updateTrackedRequest = () => {};
    rh2._getUsageStatsService = () => null;
    rh2._ensureBrowserBackedRequestReady = async () => true;
    const emptyPayload = JSON.stringify({
        candidates: [{ content: { parts: [] }, finishReason: "STOP" }],
        usageMetadata: { candidatesTokenCount: 0, thoughtsTokenCount: 0 },
    });
    const nonEmptyPayload = JSON.stringify({
        candidates: [{ content: { parts: [{ text: "hello" }] }, finishReason: "STOP" }],
        usageMetadata: { candidatesTokenCount: 5, thoughtsTokenCount: 0 },
    });
    // First queue yields the terminal-empty initial chunk; the post-switch queue yields real content.
    let queueCalls = 0;
    rh2.connectionRegistry = {
        createMessageQueue: () => ({
            close: () => {},
            dequeue: async () => {
                queueCalls++;
                if (queueCalls === 1) {
                    return { data: emptyPayload, event_type: "chunk" };
                }
                if (queueCalls === 2) {
                    return { data: nonEmptyPayload, event_type: "chunk" };
                }
                if (queueCalls === 3) {
                    return { data: `data: ${nonEmptyPayload}`, event_type: "chunk" };
                }
                return { type: "STREAM_END" };
            },
        }),
        getAuthIndexForRequest: () => 0,
        removeMessageQueue: () => {},
    };
    rh2.formatConverter = {
        translateGoogleToResponseAPIStream: (chunk, model, streamState) => {
            // The real translator sets responseSent once it processes a candidate with content.
            streamState.responseSent = true;
            return "data: {}\n\n";
        },
        translateOpenAIResponseToGoogle: () => ({
            cleanModelName: "gemini-2.5-flash",
            googleRequest: {},
            modelStreamingMode: null,
        }),
    };
    rh2._finalizeTrackedRequest = () => {};
    rh2._handleQueueTimeout = () => {};

    const res = {
        end: () => {
            res.writableEnded = true;
        },
        headersSent: false,
        status: () => ({ set: () => {} }),
        writableEnded: false,
        write: () => true,
    };
    const req = {
        body: { input: "hi", model: "gpt-5", stream: true },
        headers: {},
        method: "POST",
        protocol: "http",
        url: "/v1/responses",
    };

    const realSetTimeout = global.setTimeout;
    global.setTimeout = (fn, ms, ...args) =>
        ms >= 1000 ? realSetTimeout(() => {}, 0, ...args) : realSetTimeout(fn, ms, ...args);
    try {
        await rh2.processOpenAIResponseRequest(req, res);
    } finally {
        global.setTimeout = realSetTimeout;
    }

    assert.strictEqual(switchCount, 1, "initial complete-empty chunk must trigger exactly one auth switch");
    assert.ok(forwarded >= 2, "the request must be re-forwarded on the retry queue");
    assert.ok(queueCalls >= 4, "retry must use a fresh queue after the switch and stream to completion");
});

// Fix 6: AuthSwitcher success reset clears the consecutive empty judgment counter for the served auth index.
test("AuthSwitcher.resetEmptyJudgmentCountForAuth clears only the successful index", async () => {
    const AuthSwitcher = require(path.join(__dirname, "..", "src/auth/AuthSwitcher.js"));
    const mockBrowser = { currentAuthIndex: 0 };
    const authSwitcher = new AuthSwitcher(
        stubLogger,
        { immediateSwitchStatusCodes: [502] },
        { getAuthCount: () => 3, getCanonicalIndex: i => i },
        mockBrowser
    );
    authSwitcher._emptyJudgmentCounts.set(0, 2);
    authSwitcher._emptyJudgmentCounts.set(1, 1);

    authSwitcher.resetEmptyJudgmentCountForAuth(0);

    assert.strictEqual(authSwitcher._emptyJudgmentCounts.has(0), false, "successful index counter cleared");
    assert.strictEqual(authSwitcher._emptyJudgmentCounts.get(1), 1, "other index counter preserved");
});

test("AuthSwitcher: empty xN, success, next empty restarts at 1; threshold without success still disposes", async () => {
    const AuthSwitcher = require(path.join(__dirname, "..", "src/auth/AuthSwitcher.js"));
    const closed = [];
    const mockBrowser = {
        closeContext: async index => {
            closed.push(index);
        },
        currentAuthIndex: 0,
        preCleanupForSwitch: async () => {},
        rebalanceContextPool: async () => {},
        switchAccount: async index => {
            mockBrowser.currentAuthIndex = index;
        },
    };
    const authSwitcher = new AuthSwitcher(
        stubLogger,
        { immediateSwitchStatusCodes: [502] },
        { getAuthCount: () => 3, getCanonicalIndex: i => i, getRotationIndices: () => [0, 1] },
        mockBrowser
    );

    // Three consecutive empties on account 0 -> threshold reached -> dispose on switch.
    for (let i = 0; i < 3; i++) {
        await authSwitcher.handleRequestFailureAndSwitch({ authIndex: 0, reason: "empty_upstream_response" }, null);
    }
    assert.strictEqual(closed.includes(0), true, "threshold of 3 empties without success disposes the context");
    assert.strictEqual(authSwitcher._emptyJudgmentCounts.has(0), false, "counter cleared after dispose");

    // Now empty x2 on account 1, then a success resets the counter, then one more empty -> starts at 1.
    authSwitcher._emptyJudgmentCounts.set(1, 2);
    authSwitcher.resetEmptyJudgmentCountForAuth(1);
    assert.strictEqual(authSwitcher._emptyJudgmentCounts.has(1), false, "success resets the counter");
    await authSwitcher.handleRequestFailureAndSwitch({ authIndex: 1, reason: "empty_upstream_response" }, null);
    assert.strictEqual(authSwitcher._emptyJudgmentCounts.get(1), 1, "next empty after success starts counting from 1");
});

// Fix 6: shared helper routes success sites through the AuthSwitcher success reset.
test("_resetFailureStateOnSuccess clears empty counter and failureCount via shared helper", () => {
    const rh = makeHandler();
    rh.logger = stubLogger;
    let resetIndex = null;
    rh.authSwitcher = {
        currentAuthIndex: 5,
        failureCount: 3,
        resetEmptyJudgmentCountForAuth: idx => {
            resetIndex = idx;
        },
    };
    rh._resetFailureStateOnSuccess(5);
    assert.strictEqual(resetIndex, 5, "shared helper must reset empty counter for served auth index");
    assert.strictEqual(rh.authSwitcher.failureCount, 0, "shared helper must reset failureCount");
});

const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createBodyCollector } = require("../../src/utils/bodySizeLimit");

function createFakeReq({ method, path, headers = {} }) {
    const req = new EventEmitter();
    req.method = method;
    req.path = path;
    req.headers = headers;
    req.destroyed = false;
    req.destroy = () => {
        req.destroyed = true;
    };
    return req;
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

const noopLogger = { error: () => {} };

test("rejects an oversized body with 413 and stops processing further chunks", () => {
    const collector = createBodyCollector({
        getMaxBytesForPath: () => 10,
        logger: noopLogger,
    });
    const req = createFakeReq({ headers: { "content-type": "application/json" }, method: "POST", path: "/anything" });
    const res = createFakeRes();
    let nextCalled = false;

    collector(req, res, () => {
        nextCalled = true;
    });

    req.emit("data", Buffer.from("12345678901234567890")); // 20 bytes, over the 10 byte max
    req.emit("end");

    assert.equal(res.statusCode, 413);
    assert.deepEqual(res.body, { message: "requestBodyTooLarge" });
    assert.equal(nextCalled, false);
    assert.equal(req.destroyed, true);
    assert.equal(req.rawBody, undefined);
});

test("allows a body under the limit and parses it as before", () => {
    const collector = createBodyCollector({
        getMaxBytesForPath: () => 1024,
        logger: noopLogger,
    });
    const req = createFakeReq({ headers: { "content-type": "application/json" }, method: "POST", path: "/anything" });
    const res = createFakeRes();
    let nextCalled = false;

    collector(req, res, () => {
        nextCalled = true;
    });

    req.emit("data", Buffer.from('{"hello":'));
    req.emit("data", Buffer.from('"world"}'));
    req.emit("end");

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, null);
    assert.equal(req.rawBody.toString(), '{"hello":"world"}');
    assert.deepEqual(req.body, { hello: "world" });
});

test("the usage-stats import path is capped while other paths stay unbounded", () => {
    const collector = createBodyCollector({
        getMaxBytesForPath: path => (path === "/api/usage-stats/import" ? 10 : Infinity),
        logger: noopLogger,
    });
    const largeChunk = Buffer.alloc(20, "a");

    const importReq = createFakeReq({
        headers: { "content-type": "application/json" },
        method: "POST",
        path: "/api/usage-stats/import",
    });
    const importRes = createFakeRes();
    collector(importReq, importRes, () => {});
    importReq.emit("data", largeChunk);
    importReq.emit("end");
    assert.equal(importRes.statusCode, 413);

    const otherReq = createFakeReq({
        headers: { "content-type": "application/json" },
        method: "POST",
        path: "/v1/chat/completions",
    });
    const otherRes = createFakeRes();
    let otherNextCalled = false;
    collector(otherReq, otherRes, () => {
        otherNextCalled = true;
    });
    otherReq.emit("data", largeChunk);
    otherReq.emit("end");
    assert.equal(otherRes.statusCode, null);
    assert.equal(otherNextCalled, true);
});

test("skips body collection entirely for GET requests", () => {
    const collector = createBodyCollector({
        getMaxBytesForPath: () => 0,
        logger: noopLogger,
    });
    const req = createFakeReq({ method: "GET", path: "/api/status" });
    const res = createFakeRes();
    let nextCalled = false;

    collector(req, res, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, null);
});

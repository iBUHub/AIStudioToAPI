const test = require("node:test");
const assert = require("node:assert/strict");
const { createRateLimiter } = require("../../src/utils/rateLimiter");

function createFakeReq(key) {
    return { ip: key, session: null };
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

test("allows requests under the max and blocks once the max is exceeded", () => {
    const limiter = createRateLimiter({ max: 2, windowMs: 60_000 });
    const req = createFakeReq("1.1.1.1");

    for (let i = 0; i < 2; i++) {
        let nextCalled = false;
        limiter(req, createFakeRes(), () => {
            nextCalled = true;
        });
        assert.equal(nextCalled, true);
    }

    const res = createFakeRes();
    let nextCalled = false;
    limiter(req, res, () => {
        nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 429);
    assert.deepEqual(res.body, { message: "tooManyRequests" });

    limiter.stop();
});

test("tracks distinct keys independently", () => {
    const limiter = createRateLimiter({ max: 1, windowMs: 60_000 });

    let nextCalledA = false;
    limiter(createFakeReq("a"), createFakeRes(), () => {
        nextCalledA = true;
    });
    assert.equal(nextCalledA, true);

    let nextCalledB = false;
    limiter(createFakeReq("b"), createFakeRes(), () => {
        nextCalledB = true;
    });
    assert.equal(nextCalledB, true);

    limiter.stop();
});

test("resets the counter once the window has elapsed", () => {
    let fakeNow = 0;
    const limiter = createRateLimiter({ max: 1, now: () => fakeNow, windowMs: 1000 });
    const req = createFakeReq("1.1.1.1");

    let firstNext = false;
    limiter(req, createFakeRes(), () => {
        firstNext = true;
    });
    assert.equal(firstNext, true);

    const blockedRes = createFakeRes();
    limiter(req, blockedRes, () => {});
    assert.equal(blockedRes.statusCode, 429);

    fakeNow = 2000;
    let afterWindowNext = false;
    limiter(req, createFakeRes(), () => {
        afterWindowNext = true;
    });
    assert.equal(afterWindowNext, true);

    limiter.stop();
});

test("sweep evicts entries older than the window without waiting on the real timer", () => {
    let fakeNow = 0;
    const limiter = createRateLimiter({ max: 5, now: () => fakeNow, windowMs: 1000 });

    limiter(createFakeReq("a"), createFakeRes(), () => {});
    limiter(createFakeReq("b"), createFakeRes(), () => {});
    assert.equal(limiter.size(), 2);

    fakeNow = 5000;
    limiter.sweep(fakeNow);
    assert.equal(limiter.size(), 0);

    limiter.stop();
});

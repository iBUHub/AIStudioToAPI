const { test } = require("node:test");
const assert = require("node:assert");
const MessageQueue = require("../src/utils/MessageQueue");
const { QueueTimeoutError, QueueClosedError } = require("../src/utils/MessageQueue");

test("MessageQueue no-arg constructor retains a finite default timeout (300000ms)", async () => {
    const queue = new MessageQueue();
    assert.strictEqual(queue.defaultTimeout, 300000, "no-arg must keep the finite 300000ms default");

    // A no-arg dequeue applies the constructor default: with a small default it times out.
    const smallQueue = new MessageQueue(10);
    assert.strictEqual(smallQueue.defaultTimeout, 10);
    await assert.rejects(async () => {
        await smallQueue.dequeue();
    }, QueueTimeoutError);
});

test("MessageQueue explicit 0 remains unlimited (no-arg dequeue on a 0-constructed queue)", async () => {
    const queue = new MessageQueue(0);
    assert.strictEqual(queue.defaultTimeout, 0, "explicit 0 must stay unlimited");

    let resolved = false;
    const promise = queue.dequeue().then(msg => {
        resolved = true;
        return msg;
    });
    await new Promise(r => setTimeout(r, 50));
    assert.strictEqual(resolved, false, "no-arg dequeue on explicit-0 queue must remain pending");

    queue.enqueue("hello");
    assert.strictEqual(await promise, "hello");
});

test("MessageQueue dequeue(0) remains pending until chunk is enqueued", async () => {
    const queue = new MessageQueue();
    let resolved = false;
    let result = null;

    const promise = queue.dequeue(0).then(msg => {
        resolved = true;
        result = msg;
    });

    // Wait short scheduling interval
    await new Promise(r => setTimeout(r, 50));
    assert.strictEqual(resolved, false, "dequeue(0) should remain pending");

    queue.enqueue("hello");
    await promise;
    assert.strictEqual(resolved, true);
    assert.strictEqual(result, "hello");
});

test("MessageQueue invalid/negative/null/undefined timeouts default to 0 (no timeout)", async () => {
    const invalidValues = [-100, null, undefined, NaN, "invalid"];

    for (const val of invalidValues) {
        const queue = new MessageQueue();
        let rejected = false;

        const promise = queue.dequeue(val).catch(err => {
            rejected = true;
            return err;
        });

        await new Promise(r => setTimeout(r, 20));
        assert.strictEqual(rejected, false, `dequeue(${val}) should not reject automatically`);

        queue.close("cleanup");
        const err = await promise;
        assert.ok(err instanceof QueueClosedError);
        assert.strictEqual(err.reason, "cleanup");
    }
});

test("MessageQueue explicit positive timeout rejects after deadline", async () => {
    const queue = new MessageQueue();

    const start = Date.now();
    await assert.rejects(async () => {
        await queue.dequeue(40);
    }, QueueTimeoutError);

    const elapsed = Date.now() - start;
    assert.ok(elapsed >= 30, `Elapsed time should be near 40ms, was ${elapsed}ms`);
});

test("MessageQueue enqueue before positive timeout deadline clears timer and next dequeue gets fresh window", async () => {
    const queue = new MessageQueue();

    const dequeuePromise = queue.dequeue(100);
    setTimeout(() => queue.enqueue("chunk1"), 20);

    const res1 = await dequeuePromise;
    assert.strictEqual(res1, "chunk1");

    // Next dequeue gets fresh window and resolves on chunk2
    const dequeuePromise2 = queue.dequeue(100);
    setTimeout(() => queue.enqueue("chunk2"), 20);

    const res2 = await dequeuePromise2;
    assert.strictEqual(res2, "chunk2");
});

test("MessageQueue close('client_disconnect') rejects pending dequeue(0) promptly", async () => {
    const queue = new MessageQueue();

    const promise = queue.dequeue(0);
    queue.close("client_disconnect");

    await assert.rejects(
        async () => {
            await promise;
        },
        err => err instanceof QueueClosedError && err.reason === "client_disconnect"
    );
});

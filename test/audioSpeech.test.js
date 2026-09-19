const assert = require("node:assert/strict");
const test = require("node:test");

const FormatConverter = require("../src/core/FormatConverter");
const ProxyServerSystem = require("../src/core/ProxyServerSystem");
const RequestHandler = require("../src/core/RequestHandler");

const logger = {
    debug() {},
    error() {},
    info() {},
    warn() {},
};

function createMockResponse() {
    return {
        body: null,
        destroyed: false,
        end(body) {
            if (body !== undefined) this.body = body;
            this.headersSent = true;
            this.writableEnded = true;
            return this;
        },
        get(name) {
            return this.headers[String(name).toLowerCase()];
        },
        getHeader(name) {
            return this.headers[String(name).toLowerCase()];
        },
        headers: {},
        headersSent: false,
        on() {
            return this;
        },
        send(body) {
            this.body = body;
            this.headersSent = true;
            this.writableEnded = true;
            return this;
        },
        set(nameOrHeaders, value) {
            if (typeof nameOrHeaders === "string") {
                this.headers[nameOrHeaders.toLowerCase()] = value;
            } else {
                for (const [name, headerValue] of Object.entries(nameOrHeaders)) {
                    this.headers[name.toLowerCase()] = headerValue;
                }
            }
            return this;
        },
        setHeader(name, value) {
            this.headers[String(name).toLowerCase()] = value;
        },
        socket: { destroyed: false, writable: true },
        status(statusCode) {
            this.statusCode = statusCode;
            return this;
        },
        statusCode: 200,
        type(contentType) {
            this.headers["content-type"] = contentType;
            return this;
        },
        writableEnded: false,
        write() {
            this.headersSent = true;
            return true;
        },
    };
}

function createRequest(body) {
    return {
        body,
        headers: { "content-type": "application/json" },
        method: "POST",
        path: "/v1/audio/speech",
        query: {},
    };
}

function createQueue(messages) {
    const pendingMessages = [...messages];
    return {
        async dequeue() {
            assert.notEqual(pendingMessages.length, 0, "test queue ran out of messages");
            return pendingMessages.shift();
        },
    };
}

function createHandler(executeResultFactory) {
    const formatConverter = new FormatConverter(logger, { config: {} });
    const handler = Object.create(RequestHandler.prototype);
    handler.authSwitcher = {
        currentAuthIndex: 0,
        failureCount: 0,
        handleRequestFailureAndSwitch: async () => {},
        incrementUsageCount: () => 1,
        shouldSwitchByUsage: () => false,
        switchToNextAuth: async () => {},
        usageCount: 1,
    };
    handler.browserManager = { notifyUserActivity() {} };
    handler.config = {
        maxRetries: 1,
        retryDelay: 0,
        switchOnUses: 0,
    };
    handler.connectionRegistry = {
        createMessageQueue: () => ({}),
        removeMessageQueue() {},
    };
    handler.formatConverter = formatConverter;
    handler.logger = logger;
    handler.needsSwitchingAfterRequest = false;
    handler.serverSystem = {
        usageStatsService: null,
        webRoutes: { authRoutes: { getClientIP: () => "127.0.0.1" } },
    };
    handler.timeouts = { FAKE_STREAM: 1000, STREAM_CHUNK: 1000 };
    handler._ensureBrowserBackedRequestReady = async () => true;
    handler._executeRequestWithRetries = executeResultFactory;
    handler._handleQueueTimeout = () => {};
    handler._setupClientDisconnectHandler = () => {};
    return handler;
}

function createGeminiAudioResponse(pcmBuffer, mimeType = "audio/L16;codec=pcm;rate=24000") {
    return {
        candidates: [
            {
                content: {
                    parts: [
                        {
                            inlineData: {
                                data: pcmBuffer.toString("base64"),
                                mimeType,
                            },
                        },
                    ],
                },
            },
        ],
    };
}

test("registers the OpenAI speech route before the catch-all without replacing chat completions", () => {
    let chatCalls = 0;
    let speechCalls = 0;
    const system = Object.create(ProxyServerSystem.prototype);
    system.config = { apiKeys: [], modelList: [] };
    system.logger = logger;
    system.requestHandler = {
        processClaudeCountTokens() {},
        processClaudeRequest() {},
        processOpenAIEmbeddingsRequest() {},
        processOpenAIRequest() {
            chatCalls += 1;
        },
        processOpenAIResponseInputTokens() {},
        processOpenAIResponseRequest() {},
        processOpenAISpeechRequest() {
            speechCalls += 1;
        },
        processRequest() {},
        processUploadRequest() {},
    };
    system.webRoutes = {
        authRoutes: { getClientIP: () => "127.0.0.1" },
        setupSession() {},
    };

    const app = system._createExpressApp();
    const routeLayers = app._router.stack.filter(layer => layer.route);
    const speechIndex = routeLayers.findIndex(layer => layer.route.path === "/v1/audio/speech");
    const chatIndex = routeLayers.findIndex(layer => layer.route.path === "/v1/chat/completions");
    const catchAllIndex = routeLayers.findIndex(layer => String(layer.route.path).includes("(.*)"));

    assert.ok(speechIndex >= 0);
    assert.ok(chatIndex >= 0);
    assert.ok(catchAllIndex > speechIndex);

    routeLayers[speechIndex].route.stack[0].handle({}, {});
    routeLayers[chatIndex].route.stack[0].handle({}, {});
    assert.equal(speechCalls, 1);
    assert.equal(chatCalls, 1);
});

test("validates required OpenAI speech fields before checking browser readiness", async t => {
    for (const missingField of ["model", "input", "voice"]) {
        await t.test(`missing ${missingField}`, async () => {
            let readinessChecks = 0;
            const handler = createHandler(async () => {
                throw new Error("upstream should not be called");
            });
            handler._ensureBrowserBackedRequestReady = async () => {
                readinessChecks += 1;
                return true;
            };
            const body = {
                input: "Hello",
                model: "gemini-3.1-flash-tts-preview",
                response_format: "wav",
                voice: "Kore",
            };
            delete body[missingField];
            const res = createMockResponse();

            await handler.processOpenAISpeechRequest(createRequest(body), res);

            assert.equal(res.statusCode, 400);
            assert.equal(readinessChecks, 0);
            const errorPayload = JSON.parse(res.body);
            assert.equal(errorPayload.error.type, "invalid_request_error");
            assert.match(errorPayload.error.message, new RegExp(missingField));
        });
    }
});

test("builds the Gemini native TTS payload and returns binary WAV with MIME-derived metadata", async () => {
    const pcmBuffer = Buffer.from([0x00, 0x00, 0x10, 0x00, 0xf0, 0xff, 0x00, 0x00]);
    const googleResponse = createGeminiAudioResponse(pcmBuffer, "audio/L16;codec=pcm;rate=16000;channels=1");
    let capturedProxyRequest;
    const responseQueue = createQueue([
        { data: JSON.stringify(googleResponse), event_type: "chunk" },
        { type: "STREAM_END" },
    ]);
    const handler = createHandler(async proxyRequest => {
        capturedProxyRequest = proxyRequest;
        return {
            message: { headers: { "content-type": "application/json" }, status: 200 },
            queue: responseQueue,
            success: true,
        };
    });
    const res = createMockResponse();

    await handler.processOpenAISpeechRequest(
        createRequest({
            input: "Hello, this is a text to speech test.",
            model: "gemini-3.1-flash-tts-preview",
            response_format: "wav",
            voice: "Kore",
        }),
        res
    );

    assert.equal(capturedProxyRequest.path, "/v1beta/models/gemini-3.1-flash-tts-preview:generateContent");
    assert.equal(capturedProxyRequest.is_generative, true);
    assert.equal(capturedProxyRequest.streaming_mode, "fake");
    assert.deepEqual(JSON.parse(capturedProxyRequest.body), {
        contents: [
            {
                parts: [{ text: "Hello, this is a text to speech test." }],
                role: "user",
            },
        ],
        generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: "Kore" },
                },
            },
        },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["content-type"], "audio/wav");
    assert.equal(Number(res.headers["content-length"]), res.body.length);
    assert.ok(Buffer.isBuffer(res.body));
    assert.equal(res.body.toString("ascii", 0, 4), "RIFF");
    assert.equal(res.body.toString("ascii", 8, 12), "WAVE");
    assert.equal(res.body.readUInt16LE(20), 1);
    assert.equal(res.body.readUInt16LE(22), 1);
    assert.equal(res.body.readUInt32LE(24), 16000);
    assert.equal(res.body.readUInt16LE(34), 16);
    assert.equal(res.body.readUInt32LE(40), pcmBuffer.length);
    assert.deepEqual(res.body.subarray(44), pcmBuffer);
});

test("returns raw PCM bytes with an accurate content type", async () => {
    const pcmBuffer = Buffer.from([0x01, 0x00, 0x02, 0x00]);
    const responseQueue = createQueue([
        { data: JSON.stringify(createGeminiAudioResponse(pcmBuffer)), event_type: "chunk" },
        { type: "STREAM_END" },
    ]);
    const handler = createHandler(async () => ({
        message: { headers: {}, status: 200 },
        queue: responseQueue,
        success: true,
    }));
    const res = createMockResponse();

    await handler.processOpenAISpeechRequest(
        createRequest({
            input: "Hello",
            model: "gemini-3.1-flash-tts-preview",
            response_format: "pcm",
            voice: "Kore",
        }),
        res
    );

    assert.equal(res.headers["content-type"], "audio/L16;codec=pcm;rate=24000");
    assert.equal(Number(res.headers["content-length"]), pcmBuffer.length);
    assert.deepEqual(res.body, pcmBuffer);
});

test("returns an OpenAI-style 400 for unsupported formats and fields", async t => {
    const invalidBodies = [
        {
            expected: "response_format",
            request: {
                input: "Hello",
                model: "gemini-3.1-flash-tts-preview",
                response_format: "mp3",
                voice: "Kore",
            },
        },
        {
            expected: "speed",
            request: {
                input: "Hello",
                model: "gemini-3.1-flash-tts-preview",
                response_format: "wav",
                speed: 1.25,
                voice: "Kore",
            },
        },
        {
            expected: "instructions",
            request: {
                input: "Hello",
                instructions: "Speak slowly",
                model: "gemini-3.1-flash-tts-preview",
                response_format: "wav",
                voice: "Kore",
            },
        },
        {
            expected: "stream",
            request: {
                input: "Hello",
                model: "gemini-3.1-flash-tts-preview",
                response_format: "wav",
                stream: false,
                voice: "Kore",
            },
        },
        {
            expected: "stream_format",
            request: {
                input: "Hello",
                model: "gemini-3.1-flash-tts-preview",
                response_format: "wav",
                stream_format: "audio",
                voice: "Kore",
            },
        },
    ];

    for (const { expected, request } of invalidBodies) {
        await t.test(expected, async () => {
            const handler = createHandler(async () => {
                throw new Error("upstream should not be called");
            });
            const res = createMockResponse();
            await handler.processOpenAISpeechRequest(createRequest(request), res);
            assert.equal(res.statusCode, 400);
            const errorPayload = JSON.parse(res.body);
            assert.equal(errorPayload.error.type, "invalid_request_error");
            assert.match(errorPayload.error.message, new RegExp(expected));
        });
    }
});

test("returns a 502 OpenAI error when Gemini omits inline audio", async () => {
    const responseQueue = createQueue([
        {
            data: JSON.stringify({ candidates: [{ content: { parts: [{ text: "No audio" }] } }] }),
            event_type: "chunk",
        },
        { type: "STREAM_END" },
    ]);
    const handler = createHandler(async () => ({
        message: { headers: {}, status: 200 },
        queue: responseQueue,
        success: true,
    }));
    const res = createMockResponse();

    await handler.processOpenAISpeechRequest(
        createRequest({
            input: "Hello",
            model: "gemini-3.1-flash-tts-preview",
            response_format: "wav",
            voice: "Kore",
        }),
        res
    );

    assert.equal(res.statusCode, 502);
    const errorPayload = JSON.parse(res.body);
    assert.equal(errorPayload.error.type, "api_error");
    assert.match(errorPayload.error.message, /inline audio data/);
});

test("returns a safe 502 OpenAI error for malformed Gemini JSON", async () => {
    const responseQueue = createQueue([
        { data: "not-json-with-private-upstream-content", event_type: "chunk" },
        { type: "STREAM_END" },
    ]);
    const handler = createHandler(async () => ({
        message: { headers: {}, status: 200 },
        queue: responseQueue,
        success: true,
    }));
    const res = createMockResponse();

    await handler.processOpenAISpeechRequest(
        createRequest({
            input: "Hello",
            model: "gemini-3.1-flash-tts-preview",
            response_format: "wav",
            voice: "Kore",
        }),
        res
    );

    assert.equal(res.statusCode, 502);
    const errorPayload = JSON.parse(res.body);
    assert.match(errorPayload.error.message, /not valid JSON/);
    assert.doesNotMatch(errorPayload.error.message, /private-upstream-content/);
});

test("preserves upstream failure status through the shared retry pipeline", async () => {
    let accountFailureCalls = 0;
    const handler = createHandler(async () => ({
        error: { message: "Upstream quota exhausted", status: 429 },
        success: false,
    }));
    handler.authSwitcher.handleRequestFailureAndSwitch = async () => {
        accountFailureCalls += 1;
    };
    const res = createMockResponse();

    await handler.processOpenAISpeechRequest(
        createRequest({
            input: "Hello",
            model: "gemini-3.1-flash-tts-preview",
            response_format: "wav",
            voice: "Kore",
        }),
        res
    );

    assert.equal(res.statusCode, 429);
    assert.equal(accountFailureCalls, 1);
    const errorPayload = JSON.parse(res.body);
    assert.equal(errorPayload.error.message, "Upstream quota exhausted");
});

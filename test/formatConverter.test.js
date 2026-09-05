"use strict";
const { test } = require("node:test");
const assert = require("node:assert");
const path = require("path");

const FormatConverter = require(path.join(__dirname, "..", "src/core/FormatConverter.js"));

const stubLogger = { debug: () => {}, error: () => {}, info: () => {}, warn: () => {} };

function makeConverter() {
    return new FormatConverter(stubLogger, {
        get config() {
            return { forceThinking: false, thinkingLevel: null, webSearch: false };
        },
    });
}

// ---- toolCallId -> name mapping (OpenAI Chat -> Google, translateOpenAIToGoogle) ----
test("translateOpenAIToGoogle maps tool_call_id via assistant tool_calls; missing -> unknown_function", async () => {
    const fc = makeConverter();
    const body = {
        messages: [
            { content: "weather?", role: "user" },
            {
                content: null,
                role: "assistant",
                tool_calls: [{ function: { arguments: "{}", name: "get_weather" }, id: "call_1", type: "function" }],
            },
            { content: "70", role: "tool", tool_call_id: "call_1" },
            { content: "x", role: "tool", tool_call_id: "missing_id" },
            { content: "y", name: "explicit_now", role: "tool", tool_call_id: "call_2" },
        ],
        model: "gpt-4o",
    };
    const { googleRequest } = await fc.translateOpenAIToGoogle(body);
    const fnParts = googleRequest.contents
        .filter(c => c.parts && c.parts.some(p => p.functionResponse))
        .flatMap(c => c.parts.filter(p => p.functionResponse));
    const names = fnParts.map(p => p.functionResponse.name);
    assert.deepStrictEqual(names, ["get_weather", "unknown_function", "explicit_now"]);
});

// ---- toolCallId -> name mapping (OpenAI Responses -> Google, translateOpenAIResponseToGoogle) ----
test("translateOpenAIResponseToGoogle maps call_id via function_call; missing -> unknown_function; adds thoughtSignature", async () => {
    const fc = makeConverter();
    const body = {
        input: [
            { content: [{ text: "weather?", type: "input_text" }], role: "user", type: "message" },
            { arguments: "{}", call_id: "fc_1", name: "get_weather", type: "function_call" },
            { call_id: "fc_1", output: "70", type: "function_call_output" },
            { call_id: "missing", output: "x", type: "function_call_output" },
            { call_id: "fc_2", name: "explicit_now", output: "y", type: "function_call_output" },
        ],
        model: "gpt-5",
    };
    const { googleRequest } = await fc.translateOpenAIResponseToGoogle(body);
    const modelParts = googleRequest.contents
        .filter(c => c.parts && c.parts.some(p => p.functionCall))
        .flatMap(c => c.parts.filter(p => p.functionCall));
    const fnCall = modelParts[0].functionCall;
    assert.strictEqual(fnCall.name, "get_weather");
    assert.strictEqual(modelParts[0].thoughtSignature, FormatConverter.DUMMY_THOUGHT_SIGNATURE);
    const fnParts = googleRequest.contents
        .filter(c => c.parts && c.parts.some(p => p.functionResponse))
        .flatMap(c => c.parts.filter(p => p.functionResponse));
    const names = fnParts.map(p => p.functionResponse.name);
    assert.deepStrictEqual(names, ["get_weather", "unknown_function", "explicit_now"]);
});

// ---- consecutive same-role merge (OpenAI Chat -> Google) ----
test("translateOpenAIToGoogle merges consecutive tool messages into one user message", async () => {
    const fc = makeConverter();
    const body = {
        messages: [
            {
                content: null,
                role: "assistant",
                tool_calls: [{ function: { arguments: "{}", name: "a" }, id: "c1", type: "function" }],
            },
            { content: "1", role: "tool", tool_call_id: "c1" },
            { content: "2", role: "tool", tool_call_id: "c1" },
        ],
        model: "gpt-4o",
    };
    const { googleRequest } = await fc.translateOpenAIToGoogle(body);
    const userContents = googleRequest.contents.filter(c => c.role === "user");
    assert.strictEqual(userContents.length, 1, "consecutive tool messages should merge into a single user content");
    const partCount = userContents[0].parts.filter(p => p.functionResponse).length;
    assert.strictEqual(partCount, 2);
});

test("translateOpenAIResponseToGoogle merges consecutive function_call_output into one user message", async () => {
    const fc = makeConverter();
    const body = {
        input: [
            { arguments: "{}", call_id: "fc_1", name: "get_weather", type: "function_call" },
            { call_id: "fc_1", output: "1", type: "function_call_output" },
            { call_id: "fc_1", output: "2", type: "function_call_output" },
        ],
        model: "gpt-5",
    };
    const { googleRequest } = await fc.translateOpenAIResponseToGoogle(body);
    const userContents = googleRequest.contents.filter(c => c.role === "user");
    assert.strictEqual(
        userContents.length,
        1,
        "consecutive function_call_output should merge into a single user content"
    );
    const partCount = userContents[0].parts.filter(p => p.functionResponse).length;
    assert.strictEqual(partCount, 2);
});

// ---- functionCall-with-thoughtSignature preserved (OpenAI Chat stream translator) ----
test("translateGoogleToOpenAIStream preserves a functionCall part that carries thoughtSignature", () => {
    const fc = makeConverter();
    const chunk = JSON.stringify({
        candidates: [
            {
                content: {
                    parts: [{ functionCall: { args: { city: "SF" }, name: "get_weather" }, thoughtSignature: "sig" }],
                },
                finishReason: "STOP",
            },
        ],
    });
    const out = fc.translateGoogleToOpenAIStream(chunk, "gemini-2.5-flash-lite", {});
    assert.ok(typeof out === "string", `expected string, got ${String(out)}`);
    assert.ok(out.includes("tool_calls"), out.slice(0, 200));
    assert.ok(out.includes("get_weather"), out.slice(0, 200));
});

// ---- functionCall-with-thoughtSignature preserved (OpenAI Chat non-stream converter) ----
test("convertGoogleToOpenAINonStream preserves a functionCall part that carries thoughtSignature", () => {
    const fc = makeConverter();
    const resp = {
        candidates: [
            {
                content: {
                    parts: [{ functionCall: { args: { city: "SF" }, name: "get_weather" }, thoughtSignature: "sig" }],
                },
                finishReason: "STOP",
            },
        ],
    };
    const out = fc.convertGoogleToOpenAINonStream(resp, "gemini-2.5-flash-lite");
    const toolCalls = out.choices[0].message.tool_calls;
    assert.ok(Array.isArray(toolCalls) && toolCalls.length === 1, JSON.stringify(out.choices[0].message));
    assert.strictEqual(toolCalls[0].function.name, "get_weather");
});

// ---- OpenAI reasoning_effort fidelity and precedence ----
test("translateOpenAIToGoogle maps reasoning_effort to thinkingLevel via THINKING_LEVEL_MAP", async () => {
    const fc = makeConverter();
    const cases = [
        { effort: "minimal", expected: "MINIMAL" },
        { effort: "low", expected: "LOW" },
        { effort: "medium", expected: "MEDIUM" },
        { effort: "high", expected: "HIGH" },
        { effort: "MEDIUM", expected: "MEDIUM" },
        { effort: "  LoW  ", expected: "LOW" },
    ];

    for (const { effort, expected } of cases) {
        const body = {
            messages: [{ content: "hi", role: "user" }],
            model: "gemini-2.5-flash",
            reasoning_effort: effort,
        };
        const { googleRequest } = await fc.translateOpenAIToGoogle(body);
        assert.deepStrictEqual(googleRequest.generationConfig.thinkingConfig, {
            includeThoughts: true,
            thinkingLevel: expected,
        });
    }
});

test("translateOpenAIToGoogle preserves model suffix precedence over body reasoning_effort", async () => {
    const fc = makeConverter();
    const body = {
        messages: [{ content: "hi", role: "user" }],
        model: "gemini-2.5-pro:thinking-high",
        reasoning_effort: "low",
    };
    const { googleRequest } = await fc.translateOpenAIToGoogle(body);
    assert.deepStrictEqual(googleRequest.generationConfig.thinkingConfig, {
        includeThoughts: true,
        thinkingLevel: "HIGH",
    });
});

test("translateOpenAIToGoogle preserves native extra_body.google thinking_config precedence over reasoning_effort", async () => {
    const fc = makeConverter();
    const body = {
        extra_body: {
            google: {
                thinking_config: {
                    include_thoughts: true,
                    thinking_level: "HIGH",
                },
            },
        },
        messages: [{ content: "hi", role: "user" }],
        model: "gemini-2.5-flash",
        reasoning_effort: "low",
    };
    const { googleRequest } = await fc.translateOpenAIToGoogle(body);
    assert.deepStrictEqual(googleRequest.generationConfig.thinkingConfig, {
        includeThoughts: true,
        thinkingLevel: "HIGH",
    });
});

test("translateOpenAIToGoogle supports camelCase native thinkingConfig and thinkingBudget", async () => {
    const fc = makeConverter();
    const body = {
        extra_body: {
            google: {
                thinkingConfig: {
                    includeThoughts: true,
                    thinkingBudget: 1024,
                    thinkingLevel: "LOW",
                },
            },
        },
        messages: [{ content: "hi", role: "user" }],
        model: "gemini-2.5-flash",
    };
    const { googleRequest } = await fc.translateOpenAIToGoogle(body);
    assert.deepStrictEqual(googleRequest.generationConfig.thinkingConfig, {
        includeThoughts: true,
        thinkingBudget: 1024,
        thinkingLevel: "LOW",
    });
});

test("translateOpenAIToGoogle body reasoning_effort fills missing native level without overwriting explicit level", async () => {
    const fc = makeConverter();

    // Missing native level -> body reasoning_effort fills it
    const bodyFill = {
        extra_body: {
            google: {
                thinking_config: {
                    include_thoughts: true,
                },
            },
        },
        messages: [{ content: "hi", role: "user" }],
        model: "gemini-2.5-flash",
        reasoning_effort: "high",
    };
    const { googleRequest: reqFill } = await fc.translateOpenAIToGoogle(bodyFill);
    assert.deepStrictEqual(reqFill.generationConfig.thinkingConfig, {
        includeThoughts: true,
        thinkingLevel: "HIGH",
    });

    // Explicit native level -> body reasoning_effort ignored
    const bodyNoOverwrite = {
        extra_body: {
            google: {
                thinking_config: {
                    include_thoughts: true,
                    thinking_level: "HIGH",
                },
            },
        },
        messages: [{ content: "hi", role: "user" }],
        model: "gemini-2.5-flash",
        reasoning_effort: "low",
    };
    const { googleRequest: reqNoOverwrite } = await fc.translateOpenAIToGoogle(bodyNoOverwrite);
    assert.deepStrictEqual(reqNoOverwrite.generationConfig.thinkingConfig, {
        includeThoughts: true,
        thinkingLevel: "HIGH",
    });
});

test("translateOpenAIToGoogle preserves explicit include_thoughts:false and native thinking_level over reasoning_effort", async () => {
    const fc = makeConverter();
    const body = {
        extra_body: {
            google: {
                thinking_config: {
                    include_thoughts: false,
                    thinking_level: "LOW",
                },
            },
        },
        messages: [{ content: "hi", role: "user" }],
        model: "gemini-2.5-flash",
        reasoning_effort: "high",
    };
    const { googleRequest } = await fc.translateOpenAIToGoogle(body);
    assert.deepStrictEqual(googleRequest.generationConfig.thinkingConfig, {
        includeThoughts: false,
        thinkingLevel: "LOW",
    });
});

test("translateOpenAIToGoogle fallback for unknown reasoning_effort or missing reasoning_effort", async () => {
    const fc = makeConverter();

    // Unknown effort -> includeThoughts: true, no invalid thinkingLevel
    const unknownBody = {
        messages: [{ content: "hi", role: "user" }],
        model: "gemini-2.5-flash",
        reasoning_effort: "custom_unknown",
    };
    const { googleRequest: reqUnknown } = await fc.translateOpenAIToGoogle(unknownBody);
    assert.deepStrictEqual(reqUnknown.generationConfig.thinkingConfig, {
        includeThoughts: true,
    });

    // No effort -> no thinkingConfig set
    const noEffortBody = {
        messages: [{ content: "hi", role: "user" }],
        model: "gemini-2.5-flash",
    };
    const { googleRequest: reqNoEffort } = await fc.translateOpenAIToGoogle(noEffortBody);
    assert.strictEqual(reqNoEffort.generationConfig.thinkingConfig, undefined);
});

test("FormatConverter._parseUsage handles cachedContentTokenCount and coexistence with reasoning tokens", () => {
    const fc = makeConverter();
    const cases = [
        {
            expected: {
                completion_tokens: 50,
                completion_tokens_details: { image_tokens: 0, output_text_tokens: 50, reasoning_tokens: 0 },
                prompt_tokens: 100,
                prompt_tokens_details: { cached_tokens: 40, text_tokens: 100, tool_tokens: 0 },
                total_tokens: 150,
            },
            input: {
                cachedContentTokenCount: 40,
                candidatesTokenCount: 50,
                promptTokenCount: 100,
                totalTokenCount: 150,
            },
            name: "1. nonzero cachedContentTokenCount",
        },
        {
            expected: {
                completion_tokens: 50,
                completion_tokens_details: { image_tokens: 0, output_text_tokens: 50, reasoning_tokens: 0 },
                prompt_tokens: 100,
                prompt_tokens_details: { cached_tokens: 0, text_tokens: 100, tool_tokens: 0 },
                total_tokens: 150,
            },
            input: {
                cachedContentTokenCount: 0,
                candidatesTokenCount: 50,
                promptTokenCount: 100,
                totalTokenCount: 150,
            },
            name: "2. zero cachedContentTokenCount",
        },
        {
            expected: {
                completion_tokens: 50,
                completion_tokens_details: { image_tokens: 0, output_text_tokens: 50, reasoning_tokens: 0 },
                prompt_tokens: 100,
                prompt_tokens_details: { cached_tokens: 0, text_tokens: 100, tool_tokens: 0 },
                total_tokens: 150,
            },
            input: { candidatesTokenCount: 50, promptTokenCount: 100, totalTokenCount: 150 },
            name: "3. absent cachedContentTokenCount",
        },
        {
            expectedCached: 40,
            input: {
                cachedContentTokenCount: "40",
                candidatesTokenCount: 50,
                promptTokenCount: 100,
                totalTokenCount: 150,
            },
            name: "4a. string numeric cachedContentTokenCount",
        },
        {
            expectedCached: 0,
            input: {
                cachedContentTokenCount: "invalid",
                candidatesTokenCount: 50,
                promptTokenCount: 100,
                totalTokenCount: 150,
            },
            name: "4b. malformed string cachedContentTokenCount",
        },
        {
            expectedCached: 0,
            input: {
                cachedContentTokenCount: -10,
                candidatesTokenCount: 50,
                promptTokenCount: 100,
                totalTokenCount: 150,
            },
            name: "4c. negative cachedContentTokenCount",
        },
        {
            expectedCached: 0,
            input: {
                cachedContentTokenCount: NaN,
                candidatesTokenCount: 50,
                promptTokenCount: 100,
                totalTokenCount: 150,
            },
            name: "4d. NaN / Infinity cachedContentTokenCount",
        },
        {
            expectedCached: 0,
            input: {
                cachedContentTokenCount: true,
                candidatesTokenCount: 50,
                promptTokenCount: 100,
                totalTokenCount: 150,
            },
            name: "4e. boolean / object cachedContentTokenCount",
        },
        {
            expected: {
                completion_tokens: 110,
                completion_tokens_details: { image_tokens: 0, output_text_tokens: 80, reasoning_tokens: 30 },
                prompt_tokens: 200,
                prompt_tokens_details: { cached_tokens: 50, text_tokens: 200, tool_tokens: 0 },
                total_tokens: 310,
            },
            input: {
                cachedContentTokenCount: 50,
                candidatesTokenCount: 80,
                promptTokenCount: 200,
                thoughtsTokenCount: 30,
                totalTokenCount: 310,
            },
            name: "5 & 6. cached tokens coexisting with reasoning tokens without affecting totals",
        },
    ];

    for (const c of cases) {
        const result = fc._parseUsage({ usageMetadata: c.input });
        if (c.expected) {
            assert.deepStrictEqual(result, c.expected, `failed on ${c.name}`);
        } else if (c.expectedCached !== undefined) {
            assert.strictEqual(result.prompt_tokens_details.cached_tokens, c.expectedCached, `failed on ${c.name}`);
            assert.strictEqual(result.prompt_tokens, 100, `prompt_tokens changed on ${c.name}`);
            assert.strictEqual(result.total_tokens, 150, `total_tokens changed on ${c.name}`);
        }
    }
});

test("convertGoogleToOpenAINonStream includes cached_tokens in usage.prompt_tokens_details", () => {
    const fc = makeConverter();
    const googleResponse = {
        candidates: [{ content: { parts: [{ text: "Hello" }] }, finishReason: "STOP" }],
        usageMetadata: {
            cachedContentTokenCount: 8,
            candidatesTokenCount: 5,
            promptTokenCount: 10,
            totalTokenCount: 15,
        },
    };
    const res = fc.convertGoogleToOpenAINonStream(googleResponse, "gemini-2.5-flash");
    assert.deepStrictEqual(res.usage, {
        completion_tokens: 5,
        completion_tokens_details: { image_tokens: 0, output_text_tokens: 5, reasoning_tokens: 0 },
        prompt_tokens: 10,
        prompt_tokens_details: { cached_tokens: 8, text_tokens: 10, tool_tokens: 0 },
        total_tokens: 15,
    });
});

test("translateGoogleToOpenAIStream includes cached_tokens in usage chunk", () => {
    const fc = makeConverter();
    const chunk = JSON.stringify({
        candidates: [{ content: { parts: [{ text: "Hi" }] }, finishReason: "STOP" }],
        usageMetadata: {
            cachedContentTokenCount: 6,
            candidatesTokenCount: 4,
            promptTokenCount: 12,
            totalTokenCount: 16,
        },
    });
    const streamState = {};
    const out = fc.translateGoogleToOpenAIStream(chunk, "gemini-2.5-flash", streamState);
    assert.strictEqual(streamState.usage.prompt_tokens_details.cached_tokens, 6);
    assert.strictEqual(streamState.usage.prompt_tokens, 12);
    assert.ok(out.includes('"cached_tokens":6'), "stream chunk string should include cached_tokens:6");
});

test("convertGoogleToResponseAPINonStream includes cached_tokens under input_tokens_details", () => {
    const fc = makeConverter();
    const googleResponse = {
        candidates: [{ content: { parts: [{ text: "Resp" }] }, finishReason: "STOP" }],
        usageMetadata: {
            cachedContentTokenCount: 15,
            candidatesTokenCount: 10,
            promptTokenCount: 20,
            totalTokenCount: 30,
        },
    };
    const res = fc.convertGoogleToResponseAPINonStream(googleResponse, "gemini-2.5-flash");
    assert.deepStrictEqual(res.usage, {
        input_tokens: 20,
        input_tokens_details: { cached_tokens: 15 },
        output_tokens: 10,
        output_tokens_details: { reasoning_tokens: 0 },
        total_tokens: 30,
    });
});

test("translateGoogleToResponseAPIStream includes cached_tokens under input_tokens_details", () => {
    const fc = makeConverter();
    const streamState = {};
    const googleChunk = JSON.stringify({
        candidates: [{ content: { parts: [{ text: "Resp" }] }, finishReason: "STOP" }],
        usageMetadata: {
            cachedContentTokenCount: 18,
            candidatesTokenCount: 12,
            promptTokenCount: 25,
            totalTokenCount: 37,
        },
    });
    const result = fc.translateGoogleToResponseAPIStream(googleChunk, "gemini-2.5-flash", streamState);
    assert.ok(result, "should return stream data");
    assert.strictEqual(streamState.usage.prompt_tokens_details.cached_tokens, 18);
    assert.ok(result.includes('"cached_tokens":18'), "stream output string should include cached_tokens:18");
});

test("usage outputs do not include invented Claude or prompt-cache resource fields", () => {
    const fc = makeConverter();
    const googleResponse = {
        candidates: [{ content: { parts: [{ text: "Test" }] }, finishReason: "STOP" }],
        usageMetadata: {
            cachedContentTokenCount: 7,
            candidatesTokenCount: 5,
            promptTokenCount: 10,
            totalTokenCount: 15,
        },
    };
    const chatRes = fc.convertGoogleToOpenAINonStream(googleResponse, "gemini-2.5-flash");
    const respRes = fc.convertGoogleToResponseAPINonStream(googleResponse, "gemini-2.5-flash");

    const forbiddenFields = [
        "cache_read_input_tokens",
        "cache_creation_input_tokens",
        "prompt_cache_key",
        "cache_key",
        "cache_creation_tokens",
    ];
    for (const field of forbiddenFields) {
        assert.strictEqual(chatRes.usage[field], undefined);
        assert.strictEqual(chatRes.usage.prompt_tokens_details[field], undefined);
        assert.strictEqual(respRes.usage[field], undefined);
        assert.strictEqual(respRes.usage.input_tokens_details[field], undefined);
    }
});

// ---- Studio PR #228: Responses reasoning.effort mapping through THINKING_LEVEL_MAP ----
test("translateOpenAIResponseToGoogle maps reasoning.effort to thinkingLevel via THINKING_LEVEL_MAP", async () => {
    const fc = makeConverter();
    const cases = [
        { effort: "minimal", expected: "MINIMAL" },
        { effort: "low", expected: "LOW" },
        { effort: "medium", expected: "MEDIUM" },
        { effort: "high", expected: "HIGH" },
        { effort: "  HIGH  ", expected: "HIGH" },
    ];

    for (const { effort, expected } of cases) {
        const body = {
            input: "hi",
            model: "gemini-2.5-flash",
            reasoning: { effort },
        };
        const { googleRequest } = await fc.translateOpenAIResponseToGoogle(body);
        assert.deepStrictEqual(
            googleRequest.generationConfig.thinkingConfig,
            { includeThoughts: true, thinkingLevel: expected },
            `reasoning.effort=${effort}`
        );
    }
});

test("translateOpenAIResponseToGoogle supports top-level reasoning_effort alias", async () => {
    const fc = makeConverter();
    const body = {
        input: "hi",
        model: "gemini-2.5-flash",
        reasoning_effort: "low",
    };
    const { googleRequest } = await fc.translateOpenAIResponseToGoogle(body);
    assert.deepStrictEqual(googleRequest.generationConfig.thinkingConfig, {
        includeThoughts: true,
        thinkingLevel: "LOW",
    });
});

test("translateOpenAIResponseToGoogle preserves model suffix precedence over reasoning.effort", async () => {
    const fc = makeConverter();
    const body = {
        input: "hi",
        model: "gemini-2.5-pro:thinking-high",
        reasoning: { effort: "low" },
    };
    const { googleRequest } = await fc.translateOpenAIResponseToGoogle(body);
    assert.deepStrictEqual(googleRequest.generationConfig.thinkingConfig, {
        includeThoughts: true,
        thinkingLevel: "HIGH",
    });
});

test("translateOpenAIResponseToGoogle fallback for unknown reasoning.effort keeps includeThoughts only", async () => {
    const fc = makeConverter();
    const body = {
        input: "hi",
        model: "gemini-2.5-flash",
        reasoning: { effort: "custom_unknown" },
    };
    const { googleRequest } = await fc.translateOpenAIResponseToGoogle(body);
    assert.deepStrictEqual(googleRequest.generationConfig.thinkingConfig, {
        includeThoughts: true,
    });
});

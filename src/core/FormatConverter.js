/**
 * File: src/core/FormatConverter.js
 * Description: Format converter that translates between OpenAI and Google Gemini API request/response formats
 *
 * Maintainers: iBenzene, bbbugg
 * Original Author: Ellinav
 */

const axios = require("axios");
const mime = require("mime-types");

/**
 * Format Converter Module
 * Handles conversion between OpenAI and Google Gemini API formats
 */
class FormatConverter {
    constructor(logger, serverSystem) {
        this.logger = logger;
        this.serverSystem = serverSystem;
        // Cache for storing thoughtSignature from Gemini responses
        // This allows multi-turn tool calling without client-side support
        // Key: tool_call_id, Value: thoughtSignature
        this.thoughtSignatureCache = new Map();
        // Max cache size to prevent memory leak
        this.maxCacheSize = 1000;
    }

    /**
     * Convert OpenAI request format to Google Gemini format
     */
    async translateOpenAIToGoogle(openaiBody) {
        // eslint-disable-line no-unused-vars
        this.logger.info("[Adapter] Starting translation of OpenAI request format to Google format...");

        let systemInstruction = null;
        const googleContents = [];

        // Extract system messages
        const systemMessages = openaiBody.messages.filter(msg => msg.role === "system");
        if (systemMessages.length > 0) {
            const systemContent = systemMessages.map(msg => msg.content).join("\n");
            systemInstruction = {
                parts: [{ text: systemContent }],
                role: "system",
            };
        }

        // Convert conversation messages
        const conversationMessages = openaiBody.messages.filter(msg => msg.role !== "system");

        // Build toolIdToInfoMap from assistant messages with tool_calls
        // This maps tool_call_id to {name, thoughtSignature} for later use when processing tool responses
        const toolIdToInfoMap = new Map();
        for (const message of conversationMessages) {
            if (message.role === "assistant" && message.tool_calls && Array.isArray(message.tool_calls)) {
                for (const toolCall of message.tool_calls) {
                    if (toolCall.id && toolCall.function?.name) {
                        // Extract thoughtSignature from tool_call_id if encoded (format: call_xxx::sig::base64)
                        let signature = toolCall.thoughtSignature || null;
                        let cleanId = toolCall.id;

                        if (toolCall.id.includes("::sig::")) {
                            const parts = toolCall.id.split("::sig::");
                            cleanId = parts[0];
                            try {
                                signature = Buffer.from(parts[1], "base64").toString("utf-8");
                                this.logger.info(`[Adapter] Extracted thoughtSignature from tool_call_id: ${cleanId}`);
                            } catch (e) {
                                this.logger.warn(`[Adapter] Failed to decode thoughtSignature from tool_call_id`);
                            }
                        }

                        // Fallback: try server cache
                        if (!signature) {
                            const cachedSignature = this.thoughtSignatureCache.get(toolCall.id);
                            if (cachedSignature) {
                                signature = cachedSignature;
                                this.logger.info(
                                    `[Adapter] Retrieved thoughtSignature from server cache for: ${toolCall.id}`
                                );
                            }
                        }

                        toolIdToInfoMap.set(toolCall.id, {
                            name: toolCall.function.name,
                            thoughtSignature: signature,
                        });
                    }
                }
            }
        }

        // Buffer for accumulating consecutive tool message parts
        // Gemini requires alternating roles, so consecutive tool messages must be merged
        let pendingToolParts = [];

        // Helper function to flush pending tool parts as a single user message
        // For Gemini 3: thoughtSignature should only be on the FIRST functionResponse part
        const flushToolParts = () => {
            if (pendingToolParts.length > 0) {
                // Ensure only the first part has thoughtSignature
                let signatureAttached = false;
                for (const part of pendingToolParts) {
                    if (part.thoughtSignature) {
                        if (signatureAttached) {
                            // Remove signature from subsequent parts
                            delete part.thoughtSignature;
                        } else {
                            signatureAttached = true;
                        }
                    }
                }
                googleContents.push({
                    parts: pendingToolParts,
                    role: "user", // Gemini expects function responses as "user" role
                });
                pendingToolParts = [];
            }
        };

        for (let msgIndex = 0; msgIndex < conversationMessages.length; msgIndex++) {
            const message = conversationMessages[msgIndex];
            const googleParts = [];

            // Handle tool role (function execution result)
            if (message.role === "tool") {
                // Convert OpenAI tool response to Gemini functionResponse
                let responseContent;
                try {
                    responseContent =
                        typeof message.content === "string" ? JSON.parse(message.content) : message.content;
                } catch (e) {
                    // If content is not valid JSON, wrap it
                    responseContent = { result: message.content };
                }

                // Resolve function name and thoughtSignature from toolIdToInfoMap
                const toolInfo = message.tool_call_id && toolIdToInfoMap.get(message.tool_call_id);
                const functionName = message.name || toolInfo?.name || "unknown_function";

                // Add to buffer instead of pushing directly
                // This allows merging consecutive tool messages into one user message
                const functionResponsePart = {
                    functionResponse: {
                        name: functionName,
                        response: responseContent,
                    },
                };
                // Pass back thoughtSignature from the corresponding tool_call for Gemini 3
                if (toolInfo?.thoughtSignature) {
                    functionResponsePart.thoughtSignature = toolInfo.thoughtSignature;
                    this.logger.info(`[Adapter] Attached thoughtSignature to functionResponse: ${functionName}`);
                }
                pendingToolParts.push(functionResponsePart);
                continue;
            }

            // Before processing non-tool messages, flush any pending tool parts
            flushToolParts();

            // Handle assistant messages with tool_calls
            if (message.role === "assistant" && message.tool_calls && Array.isArray(message.tool_calls)) {
                // Convert OpenAI tool_calls to Gemini functionCall
                // For Gemini 3: thoughtSignature should only be on the FIRST functionCall part
                let signatureAttachedToCall = false;
                for (const toolCall of message.tool_calls) {
                    if (toolCall.type === "function" && toolCall.function) {
                        let args;
                        try {
                            args =
                                typeof toolCall.function.arguments === "string"
                                    ? JSON.parse(toolCall.function.arguments)
                                    : toolCall.function.arguments;
                        } catch (e) {
                            args = {};
                        }

                        const functionCallPart = {
                            functionCall: {
                                args,
                                name: toolCall.function.name,
                            },
                        };
                        // Pass back thoughtSignature only on the FIRST functionCall
                        if (toolCall.thoughtSignature && !signatureAttachedToCall) {
                            functionCallPart.thoughtSignature = toolCall.thoughtSignature;
                            signatureAttachedToCall = true;
                            this.logger.info(
                                `[Adapter] Attached thoughtSignature to first functionCall: ${toolCall.function.name}`
                            );
                        }
                        googleParts.push(functionCallPart);
                    }
                }
                // Do not continue here; allow falling through to handle potential text content (e.g. thoughts)
            }

            // Handle regular text content
            if (typeof message.content === "string" && message.content.length > 0) {
                const textPart = { text: message.content };
                googleParts.push(textPart);
            } else if (Array.isArray(message.content)) {
                for (const part of message.content) {
                    if (part.type === "text") {
                        const textPart = { text: part.text };
                        googleParts.push(textPart);
                    } else if (part.type === "image_url" && part.image_url) {
                        const dataUrl = part.image_url.url;
                        const match = dataUrl.match(/^data:(image\/.*?);base64,(.*)$/);
                        if (match) {
                            googleParts.push({
                                inlineData: {
                                    data: match[2],
                                    mimeType: match[1],
                                },
                            });
                        } else if (dataUrl.match(/^https?:\/\//)) {
                            try {
                                this.logger.info(`[Adapter] Downloading image from URL: ${dataUrl}`);
                                const response = await axios.get(dataUrl, {
                                    responseType: "arraybuffer",
                                });
                                const imageBuffer = Buffer.from(response.data, "binary");
                                const base64Data = imageBuffer.toString("base64");
                                let mimeType = response.headers["content-type"];
                                if (!mimeType || mimeType === "application/octet-stream") {
                                    mimeType = mime.lookup(dataUrl) || "image/jpeg"; // Fallback
                                }
                                googleParts.push({
                                    inlineData: {
                                        data: base64Data,
                                        mimeType,
                                    },
                                });
                                this.logger.info(`[Adapter] Successfully downloaded and converted image to base64.`);
                            } catch (error) {
                                this.logger.error(
                                    `[Adapter] Failed to download or process image from URL: ${dataUrl}`,
                                    error
                                );
                                // Optionally, push an error message as text
                                googleParts.push({ text: `[System Note: Failed to load image from ${dataUrl}]` });
                            }
                        }
                    }
                }
            }

            if (googleParts.length > 0) {
                googleContents.push({
                    parts: googleParts,
                    role: message.role === "assistant" ? "model" : "user",
                });
            }
        }

        // Flush any remaining tool parts after the loop
        flushToolParts();

        // Build Google request
        this.logger.info(`[Adapter] Debug: googleContents length = ${googleContents.length}`);
        const googleRequest = {
            contents: googleContents,
            ...(systemInstruction && {
                systemInstruction: { parts: systemInstruction.parts, role: "user" },
            }),
        };

        // Generation config
        const generationConfig = {
            maxOutputTokens: openaiBody.max_tokens,
            stopSequences: openaiBody.stop,
            temperature: openaiBody.temperature,
            topK: openaiBody.top_k,
            topP: openaiBody.top_p,
        };

        // Handle thinking config
        const extraBody = openaiBody.extra_body || {};
        const rawThinkingConfig =
            extraBody.google?.thinking_config ||
            extraBody.google?.thinkingConfig ||
            extraBody.thinkingConfig ||
            extraBody.thinking_config ||
            openaiBody.thinkingConfig ||
            openaiBody.thinking_config;

        let thinkingConfig = null;

        if (rawThinkingConfig) {
            thinkingConfig = {};

            if (rawThinkingConfig.include_thoughts !== undefined) {
                thinkingConfig.includeThoughts = rawThinkingConfig.include_thoughts;
            } else if (rawThinkingConfig.includeThoughts !== undefined) {
                thinkingConfig.includeThoughts = rawThinkingConfig.includeThoughts;
            }

            this.logger.info(
                `[Adapter] Successfully extracted and converted thinking config: ${JSON.stringify(thinkingConfig)}`
            );
        }

        // Handle OpenAI reasoning_effort parameter
        if (!thinkingConfig) {
            const effort = openaiBody.reasoning_effort || extraBody.reasoning_effort;
            if (effort) {
                this.logger.info(
                    `[Adapter] Detected OpenAI standard reasoning parameter (reasoning_effort: ${effort}), auto-converting to Google format.`
                );
                thinkingConfig = { includeThoughts: true };
            }
        }

        // Force thinking mode
        if (this.serverSystem.forceThinking && !thinkingConfig) {
            this.logger.info(
                "[Adapter] ⚠️ Force thinking enabled and client did not provide config, injecting thinkingConfig."
            );
            thinkingConfig = { includeThoughts: true };
        }

        if (thinkingConfig) {
            generationConfig.thinkingConfig = thinkingConfig;
        }

        googleRequest.generationConfig = generationConfig;

        // Convert OpenAI tools to Gemini functionDeclarations
        const openaiTools = openaiBody.tools || openaiBody.functions;
        if (openaiTools && Array.isArray(openaiTools) && openaiTools.length > 0) {
            const functionDeclarations = [];

            // Helper function to convert OpenAI parameter types to Gemini format (uppercase)
            // Also handles nullable types like ["string", "null"] -> type: "STRING", nullable: true
            const convertParameterTypes = obj => {
                if (!obj || typeof obj !== "object") return obj;

                const result = Array.isArray(obj) ? [] : {};

                for (const key of Object.keys(obj)) {
                    if (key === "type") {
                        if (Array.isArray(obj[key])) {
                            // Handle nullable types like ["string", "null"]
                            const types = obj[key];
                            const nonNullTypes = types.filter(t => t !== "null");
                            const hasNull = types.includes("null");

                            if (hasNull) {
                                result.nullable = true;
                            }

                            if (nonNullTypes.length === 1) {
                                // Single non-null type: use it directly
                                result[key] = nonNullTypes[0].toUpperCase();
                            } else if (nonNullTypes.length > 1) {
                                // Multiple non-null types: keep as array (uppercase)
                                result[key] = nonNullTypes.map(t => t.toUpperCase());
                            } else {
                                // Only null type, default to STRING
                                result[key] = "STRING";
                            }
                        } else if (typeof obj[key] === "string") {
                            // Convert lowercase type to uppercase for Gemini
                            result[key] = obj[key].toUpperCase();
                        } else {
                            result[key] = obj[key];
                        }
                    } else if (key === "additionalProperties") {
                        // Handle additionalProperties: can be boolean or schema object
                        if (typeof obj[key] === "object" && obj[key] !== null) {
                            result[key] = convertParameterTypes(obj[key]);
                        } else {
                            result[key] = obj[key];
                        }
                    } else if (typeof obj[key] === "object" && obj[key] !== null) {
                        result[key] = convertParameterTypes(obj[key]);
                    } else {
                        result[key] = obj[key];
                    }
                }

                return result;
            };

            for (const tool of openaiTools) {
                // Handle OpenAI tools format: { type: "function", function: {...} }
                // Also handle legacy functions format: { name, description, parameters }
                const funcDef = tool.function || tool;

                if (funcDef && funcDef.name) {
                    const declaration = {
                        name: funcDef.name,
                    };

                    if (funcDef.description) {
                        declaration.description = funcDef.description;
                    }

                    if (funcDef.parameters) {
                        // Convert parameter types from lowercase to uppercase
                        declaration.parameters = convertParameterTypes(funcDef.parameters);
                    }

                    functionDeclarations.push(declaration);
                }
            }

            if (functionDeclarations.length > 0) {
                if (!googleRequest.tools) {
                    googleRequest.tools = [];
                }
                googleRequest.tools.push({ functionDeclarations });
                this.logger.info(
                    `[Adapter] Converted ${functionDeclarations.length} OpenAI tool(s) to Gemini functionDeclarations`
                );
            }
        }

        // Convert OpenAI tool_choice to Gemini toolConfig.functionCallingConfig
        const toolChoice = openaiBody.tool_choice || openaiBody.function_call;
        if (toolChoice) {
            const functionCallingConfig = {};

            if (toolChoice === "auto") {
                functionCallingConfig.mode = "AUTO";
            } else if (toolChoice === "none") {
                functionCallingConfig.mode = "NONE";
            } else if (toolChoice === "required") {
                functionCallingConfig.mode = "ANY";
            } else if (typeof toolChoice === "object") {
                // Handle { type: "function", function: { name: "xxx" } }
                // or legacy { name: "xxx" }
                const funcName = toolChoice.function?.name || toolChoice.name;
                if (funcName) {
                    functionCallingConfig.mode = "ANY";
                    functionCallingConfig.allowedFunctionNames = [funcName];
                }
            }

            if (Object.keys(functionCallingConfig).length > 0) {
                googleRequest.toolConfig = { functionCallingConfig };
                this.logger.info(
                    `[Adapter] Converted tool_choice to Gemini toolConfig: ${JSON.stringify(functionCallingConfig)}`
                );
            }
        }

        // Force web search and URL context
        if (this.serverSystem.forceWebSearch || this.serverSystem.forceUrlContext) {
            if (!googleRequest.tools) {
                googleRequest.tools = [];
            }

            const toolsToAdd = [];

            // Handle Google Search
            if (this.serverSystem.forceWebSearch) {
                const hasSearch = googleRequest.tools.some(t => t.googleSearch);
                if (!hasSearch) {
                    googleRequest.tools.push({ googleSearch: {} });
                    toolsToAdd.push("googleSearch");
                }
            }

            // Handle URL Context
            if (this.serverSystem.forceUrlContext) {
                const hasUrlContext = googleRequest.tools.some(t => t.urlContext);
                if (!hasUrlContext) {
                    googleRequest.tools.push({ urlContext: {} });
                    toolsToAdd.push("urlContext");
                }
            }

            if (toolsToAdd.length > 0) {
                this.logger.info(`[Adapter] ⚠️ Force features enabled, injecting tools: [${toolsToAdd.join(", ")}]`);
            }
        }

        // Safety settings
        googleRequest.safetySettings = [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ];

        this.logger.info("[Adapter] Translation complete.");
        return googleRequest;
    }

    /**
     * Convert Google streaming response chunk to OpenAI format
     * @param {string} googleChunk - The Google response chunk
     * @param {string} modelName - The model name
     * @param {object} streamState - Optional state object to track thought mode
     */
    translateGoogleToOpenAIStream(googleChunk, modelName = "gemini-2.5-flash-lite", streamState = null) {
        console.log(`[Adapter] Received Google chunk: ${googleChunk}`);

        // Ensure streamState exists to properly track tool call indices
        if (!streamState) {
            streamState = {}; // Create default state to avoid index conflicts
        }
        if (!googleChunk || googleChunk.trim() === "") {
            return null;
        }

        let jsonString = googleChunk;
        if (jsonString.startsWith("data: ")) {
            jsonString = jsonString.substring(6).trim();
        }

        if (jsonString === "[DONE]") {
            return "data: [DONE]\n\n";
        }

        let googleResponse;
        try {
            googleResponse = JSON.parse(jsonString);
        } catch (e) {
            this.logger.warn(`[Adapter] Unable to parse Google JSON chunk: ${jsonString}`);
            return null;
        }

        if (streamState && !streamState.id) {
            streamState.id = `chatcmpl-${this._generateRequestId()}`;
            streamState.created = Math.floor(Date.now() / 1000);
        }
        const streamId = streamState ? streamState.id : `chatcmpl-${this._generateRequestId()}`;
        const created = streamState ? streamState.created : Math.floor(Date.now() / 1000);

        // Cache usage data whenever it arrives.
        // Store in streamState to prevent concurrency issues between requests
        if (googleResponse.usageMetadata && streamState) {
            streamState.usage = this._parseUsage(googleResponse);
        }

        const candidate = googleResponse.candidates?.[0];

        if (!candidate) {
            if (googleResponse.promptFeedback) {
                this.logger.warn(
                    `[Adapter] Google returned promptFeedback, may have been blocked: ${JSON.stringify(
                        googleResponse.promptFeedback
                    )}`
                );
                const errorText = `[ProxySystem Error] Request blocked due to safety settings. Finish Reason: ${googleResponse.promptFeedback.blockReason}`;
                return `data: ${JSON.stringify({
                    choices: [{ delta: { content: errorText }, finish_reason: "stop", index: 0 }],
                    created,
                    id: streamId,
                    model: modelName,
                    object: "chat.completion.chunk",
                })}\n\n`;
            }
            return null;
        }

        const chunksToSend = [];

        // Iterate over each part in the Gemini chunk and send it as a separate OpenAI chunk
        if (candidate.content && Array.isArray(candidate.content.parts)) {
            for (const part of candidate.content.parts) {
                const delta = {};
                let hasContent = false;

                if (part.thought === true) {
                    if (part.text) {
                        delta.reasoning_content = part.text;
                        if (streamState) streamState.inThought = true;
                        hasContent = true;
                    }
                } else if (part.text) {
                    delta.content = part.text;
                    hasContent = true;
                } else if (part.inlineData) {
                    const image = part.inlineData;
                    delta.content = `![Generated Image](data:${image.mimeType};base64,${image.data})`;
                    this.logger.info("[Adapter] Successfully parsed image from streaming response chunk.");
                    hasContent = true;
                } else if (part.functionCall) {
                    // Convert Gemini functionCall to OpenAI tool_calls format
                    const funcCall = part.functionCall;
                    let toolCallId = `call_${this._generateRequestId()}`;

                    // Encode thoughtSignature into tool_call_id for reliable pass-through
                    // Format: call_xxx::sig::base64(signature)
                    if (part.thoughtSignature) {
                        const encodedSig = Buffer.from(part.thoughtSignature).toString("base64");
                        toolCallId = `${toolCallId}::sig::${encodedSig}`;
                        this.logger.info(`[Adapter] Encoded thoughtSignature into tool_call_id for: ${funcCall.name}`);
                        // Also cache for backward compatibility
                        this._cacheThoughtSignature(toolCallId, part.thoughtSignature);
                    }

                    // Track tool call index for multiple function calls
                    const toolCallIndex = streamState?.toolCallIndex ?? 0;
                    if (streamState) {
                        streamState.toolCallIndex = toolCallIndex + 1;
                    }

                    const toolCallObj = {
                        function: {
                            arguments: JSON.stringify(funcCall.args || {}),
                            name: funcCall.name,
                        },
                        id: toolCallId,
                        index: toolCallIndex,
                        type: "function",
                    };

                    delta.tool_calls = [toolCallObj];

                    // Mark that we have a function call for finish_reason
                    if (streamState) {
                        streamState.hasFunctionCall = true;
                    }

                    this.logger.info(
                        `[Adapter] Converted Gemini functionCall to OpenAI tool_calls: ${funcCall.name} (index: ${toolCallIndex})`
                    );
                    hasContent = true;
                }

                if (hasContent) {
                    // The 'role' should only be sent in the first chunk with content.
                    if (streamState && !streamState.roleSent) {
                        delta.role = "assistant";
                        streamState.roleSent = true;
                    }

                    const openaiResponse = {
                        choices: [
                            {
                                delta,
                                finish_reason: null,
                                index: 0,
                            },
                        ],
                        created,
                        id: streamId,
                        model: modelName,
                        object: "chat.completion.chunk",
                    };
                    chunksToSend.push(`data: ${JSON.stringify(openaiResponse)}\n\n`);
                }
            }
        }

        // Handle the final chunk with finish_reason and usage
        if (candidate.finishReason) {
            // Determine the correct finish_reason for OpenAI format
            let finishReason;
            if (streamState?.hasFunctionCall) {
                finishReason = "tool_calls";
            } else {
                // Map Gemini finishReason to OpenAI format
                const reasonMap = {
                    max_tokens: "length",
                    other: "stop",
                    recitation: "stop",
                    safety: "content_filter",
                    stop: "stop",
                };
                const lowerReason = candidate.finishReason.toLowerCase();
                finishReason = reasonMap[lowerReason] || "stop";
            }

            const finalResponse = {
                choices: [
                    {
                        delta: {},
                        finish_reason: finishReason,
                        index: 0,
                    },
                ],
                created,
                id: streamId,
                model: modelName,
                object: "chat.completion.chunk",
                usage: null,
            };

            // Attach cached usage data to the very last message
            if (streamState && streamState.usage) {
                finalResponse.usage = streamState.usage;
            }
            chunksToSend.push(`data: ${JSON.stringify(finalResponse)}\n\n`);
        }

        return chunksToSend.length > 0 ? chunksToSend.join("") : null;
    }

    /**
     * Convert Google non-stream response to OpenAI format
     */
    convertGoogleToOpenAINonStream(googleResponse, modelName = "gemini-2.5-flash-lite") {
        const candidate = googleResponse.candidates?.[0];

        if (!candidate) {
            this.logger.warn("[Adapter] No candidate found in Google response");
            return {
                choices: [
                    {
                        finish_reason: "stop",
                        index: 0,
                        message: { content: "", role: "assistant" },
                    },
                ],
                created: Math.floor(Date.now() / 1000),
                id: `chatcmpl-${this._generateRequestId()}`,
                model: modelName,
                object: "chat.completion",
                usage: {
                    completion_tokens: 0,
                    prompt_tokens: 0,
                    total_tokens: 0,
                },
            };
        }

        let content = "";
        let reasoning_content = "";
        const tool_calls = [];

        if (candidate.content && Array.isArray(candidate.content.parts)) {
            for (const part of candidate.content.parts) {
                if (part.thought === true) {
                    reasoning_content += part.text || "";
                } else if (part.text) {
                    content += part.text;
                } else if (part.inlineData) {
                    const image = part.inlineData;
                    content += `![Generated Image](data:${image.mimeType};base64,${image.data})`;
                } else if (part.functionCall) {
                    // Convert Gemini functionCall to OpenAI tool_calls format
                    const funcCall = part.functionCall;
                    let toolCallId = `call_${this._generateRequestId()}`;

                    // Encode thoughtSignature into tool_call_id for reliable pass-through
                    // Format: call_xxx::sig::base64(signature)
                    if (part.thoughtSignature) {
                        const encodedSig = Buffer.from(part.thoughtSignature).toString("base64");
                        toolCallId = `${toolCallId}::sig::${encodedSig}`;
                        this.logger.info(`[Adapter] Encoded thoughtSignature into tool_call_id for: ${funcCall.name}`);
                        // Also cache for backward compatibility
                        this._cacheThoughtSignature(toolCallId, part.thoughtSignature);
                    }

                    const toolCallObj = {
                        function: {
                            arguments: JSON.stringify(funcCall.args || {}),
                            name: funcCall.name,
                        },
                        id: toolCallId,
                        index: tool_calls.length,
                        type: "function",
                    };
                    tool_calls.push(toolCallObj);
                    this.logger.info(`[Adapter] Converted Gemini functionCall to OpenAI tool_calls: ${funcCall.name}`);
                }
            }
        }

        const message = { content, role: "assistant" };
        if (reasoning_content) {
            message.reasoning_content = reasoning_content;
        }
        if (tool_calls.length > 0) {
            message.tool_calls = tool_calls;
        }

        // Determine finish_reason
        let finishReason;
        if (tool_calls.length > 0) {
            finishReason = "tool_calls";
        } else {
            // Map Gemini finishReason to OpenAI format
            const reasonMap = {
                max_tokens: "length",
                other: "stop",
                recitation: "stop",
                safety: "content_filter",
                stop: "stop",
            };
            const lowerReason = (candidate.finishReason || "stop").toLowerCase();
            finishReason = reasonMap[lowerReason] || "stop";
        }

        return {
            choices: [
                {
                    finish_reason: finishReason,
                    index: 0,
                    message,
                },
            ],
            created: Math.floor(Date.now() / 1000),
            id: `chatcmpl-${this._generateRequestId()}`,
            model: modelName,
            object: "chat.completion",
            usage: this._parseUsage(googleResponse),
        };
    }

    /**
     * Cache thoughtSignature for server-side storage
     * This allows multi-turn tool calling without client-side support
     */
    _cacheThoughtSignature(toolCallId, signature) {
        // Clean up old entries if cache is too large
        if (this.thoughtSignatureCache.size >= this.maxCacheSize) {
            // Remove oldest entries (first 100)
            const keysToDelete = Array.from(this.thoughtSignatureCache.keys()).slice(0, 100);
            keysToDelete.forEach(key => this.thoughtSignatureCache.delete(key));
            this.logger.info(`[Adapter] Cleaned up ${keysToDelete.length} old entries from thoughtSignature cache`);
        }
        this.thoughtSignatureCache.set(toolCallId, signature);
    }

    _generateRequestId() {
        return `${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    }

    _parseUsage(googleResponse) {
        const usage = googleResponse.usageMetadata || {};

        const inputTokens = usage.promptTokenCount || 0;
        const toolPromptTokens = usage.toolUsePromptTokenCount || 0;

        const completionTextTokens = usage.candidatesTokenCount || 0;
        const reasoningTokens = usage.thoughtsTokenCount || 0;
        let completionImageTokens = 0;

        if (Array.isArray(usage.candidatesTokensDetails)) {
            for (const d of usage.candidatesTokensDetails) {
                if (d?.modality === "IMAGE") {
                    completionImageTokens += d.tokenCount || 0;
                }
            }
        }

        const promptTokens = inputTokens + toolPromptTokens;
        const totalCompletionTokens = completionTextTokens + reasoningTokens;
        const totalTokens = googleResponse.usageMetadata?.totalTokenCount || 0;

        return {
            completion_tokens: totalCompletionTokens,
            completion_tokens_details: {
                image_tokens: completionImageTokens,
                output_text_tokens: completionTextTokens,
                reasoning_tokens: reasoningTokens,
            },
            prompt_tokens: promptTokens,
            prompt_tokens_details: {
                text_tokens: inputTokens,
                tool_tokens: toolPromptTokens,
            },
            total_tokens: totalTokens,
        };
    }
}

module.exports = FormatConverter;

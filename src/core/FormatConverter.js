/**
 * File: src/core/FormatConverter.js
 * Description: Format converter that translates between OpenAI and Google Gemini API request/response formats
 *
 * Author: Ellinav, iBenzene, bbbugg
 */

const axios = require("axios");
const mime = require("mime-types");

/**
 * Format Converter Module
 * Handles conversion between OpenAI and Google Gemini API formats
 */
class FormatConverter {
    // Placeholder signature for Gemini 3 functionCall validation
    static DUMMY_THOUGHT_SIGNATURE = "context_engineering_is_the_way_to_go";

    // ThinkingLevel suffix mapping (lowercase -> uppercase API value)
    static THINKING_LEVEL_MAP = {
        high: "HIGH",
        low: "LOW",
        medium: "MEDIUM",
        minimal: "MINIMAL",
    };

    /**
     * Parse thinkingLevel suffix from model name
     * Supports two formats:
     *   - Parenthesis format: gemini-3-flash-preview(minimal), gemini-3-pro-preview(high)
     *   - Hyphen format: gemini-3-flash-preview-minimal, gemini-3-pro-preview-high
     *
     * @param {string} modelName - Original model name
     * @returns {{ cleanModelName: string, thinkingLevel: string|null }}
     *          - cleanModelName: Model name with suffix removed
     *          - thinkingLevel: Uppercase thinkingLevel value, or null if no suffix
     */
    static parseModelThinkingLevel(modelName) {
        if (!modelName || typeof modelName !== "string") {
            return { cleanModelName: modelName, thinkingLevel: null };
        }

        const levels = Object.keys(FormatConverter.THINKING_LEVEL_MAP);

        // Check parenthesis format: model(level)
        const parenMatch = modelName.match(new RegExp(`^(.+)\\((${levels.join("|")})\\)$`, "i"));
        if (parenMatch) {
            const baseModel = parenMatch[1];
            const levelKey = parenMatch[2].toLowerCase();
            return {
                cleanModelName: baseModel,
                thinkingLevel: FormatConverter.THINKING_LEVEL_MAP[levelKey],
            };
        }

        // Check hyphen format: model-level
        const hyphenMatch = modelName.match(new RegExp(`^(.+)-(${levels.join("|")})$`, "i"));
        if (hyphenMatch) {
            const baseModel = hyphenMatch[1];
            const levelKey = hyphenMatch[2].toLowerCase();
            return {
                cleanModelName: baseModel,
                thinkingLevel: FormatConverter.THINKING_LEVEL_MAP[levelKey],
            };
        }

        // No matching suffix
        return { cleanModelName: modelName, thinkingLevel: null };
    }

    constructor(logger, serverSystem) {
        this.logger = logger;
        this.serverSystem = serverSystem;
    }

    /**
     * Ensure thoughtSignature is present in Gemini native format requests
     * This handles direct Gemini API calls where functionCall may lack thoughtSignature
     * Note: Only functionCall needs thoughtSignature, functionResponse does NOT need it
     * @param {object} geminiBody - Gemini API request body
     * @returns {object} - Modified request body with thoughtSignature placeholders
     */
    ensureThoughtSignature(geminiBody) {
        if (!geminiBody || !geminiBody.contents || !Array.isArray(geminiBody.contents)) {
            return geminiBody;
        }

        const DUMMY_SIGNATURE = FormatConverter.DUMMY_THOUGHT_SIGNATURE;

        for (const content of geminiBody.contents) {
            if (!content.parts || !Array.isArray(content.parts)) continue;

            // Only add signature to functionCall, not functionResponse
            let signatureAdded = false;
            for (const part of content.parts) {
                // Check for functionCall without thoughtSignature
                if (part.functionCall && !part.thoughtSignature) {
                    if (!signatureAdded) {
                        part.thoughtSignature = DUMMY_SIGNATURE;
                        signatureAdded = true;
                        this.logger.info(
                            `[Adapter] Added dummy thoughtSignature for functionCall: ${part.functionCall.name}`
                        );
                    }
                }
                // Note: functionResponse does NOT need thoughtSignature per official docs
            }
        }

        return geminiBody;
    }

    /**
     * Sanitize tools in native Gemini requests by removing unsupported JSON Schema fields
     * like $schema and additionalProperties
     * @param {object} geminiBody - Gemini format request body
     * @returns {object} - Modified request body with sanitized tools
     */
    sanitizeGeminiTools(geminiBody) {
        if (!geminiBody || !geminiBody.tools || !Array.isArray(geminiBody.tools)) {
            return geminiBody;
        }

        // [DEBUG] Log original Gemini tools before sanitization
        this.logger.debug(`[Adapter] Debug: original Gemini tools = ${JSON.stringify(geminiBody.tools, null, 2)}`);

        // Helper function to recursively sanitize schema:
        // 1. Remove unsupported fields ($schema, additionalProperties)
        // 2. Convert lowercase type to uppercase (object -> OBJECT, string -> STRING, etc.)
        const sanitizeSchema = obj => {
            if (!obj || typeof obj !== "object") return obj;

            const result = Array.isArray(obj) ? [] : {};

            for (const key of Object.keys(obj)) {
                // Skip fields not supported by Gemini API
                if (key === "$schema" || key === "additionalProperties") {
                    continue;
                }

                if (key === "type" && typeof obj[key] === "string") {
                    // Convert lowercase type to uppercase for Gemini
                    result[key] = obj[key].toUpperCase();
                } else if (typeof obj[key] === "object" && obj[key] !== null) {
                    result[key] = sanitizeSchema(obj[key]);
                } else {
                    result[key] = obj[key];
                }
            }

            return result;
        };

        // Process each tool
        for (const tool of geminiBody.tools) {
            if (tool.functionDeclarations && Array.isArray(tool.functionDeclarations)) {
                for (const funcDecl of tool.functionDeclarations) {
                    if (funcDecl.parameters) {
                        funcDecl.parameters = sanitizeSchema(funcDecl.parameters);
                    }
                }
            }
        }

        // [DEBUG] Log sanitized Gemini tools after processing
        this.logger.debug(`[Adapter] Debug: sanitized Gemini tools = ${JSON.stringify(geminiBody.tools, null, 2)}`);

        this.logger.info("[Adapter] Sanitized Gemini tools (removed unsupported fields, converted type to uppercase)");
        return geminiBody;
    }

    /**
     * Convert OpenAI request format to Google Gemini format
     * @param {object} openaiBody - OpenAI format request body
     * @returns {Promise<{ googleRequest: object, cleanModelName: string }>} - Converted request and cleaned model name
     */
    async translateOpenAIToGoogle(openaiBody) {
        // eslint-disable-line no-unused-vars
        this.logger.info("[Adapter] Starting translation of OpenAI request format to Google format...");

        // Parse thinkingLevel suffix from model name (e.g., gemini-3-flash-preview-minimal or gemini-3-flash-preview(low))
        const rawModel = openaiBody.model || "gemini-2.5-flash-lite";
        const { cleanModelName, thinkingLevel: modelThinkingLevel } = FormatConverter.parseModelThinkingLevel(rawModel);

        if (modelThinkingLevel) {
            this.logger.info(
                `[Adapter] Detected thinkingLevel suffix in model name: "${rawModel}" -> model="${cleanModelName}", thinkingLevel="${modelThinkingLevel}"`
            );
        }

        // [DEBUG] Log incoming messages for troubleshooting
        this.logger.debug(`[Adapter] Debug: incoming messages = ${JSON.stringify(openaiBody.messages, null, 2)}`);
        // [DEBUG] Log original OpenAI tools
        if (openaiBody.tools && openaiBody.tools.length > 0) {
            this.logger.debug(`[Adapter] Debug: original OpenAI tools = ${JSON.stringify(openaiBody.tools, null, 2)}`);
        }

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

        // Buffer for accumulating consecutive tool message parts
        // Gemini requires alternating roles, so consecutive tool messages must be merged
        let pendingToolParts = [];

        // Helper function to flush pending tool parts as a single user message
        // Note: functionResponse does NOT need thoughtSignature per official docs
        const flushToolParts = () => {
            if (pendingToolParts.length > 0) {
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

                    // Handle array format (common in MCP, e.g., [{ type: "text", text: "..." }])
                    // Gemini requires 'response' to be an object (Struct), not an array.
                    if (Array.isArray(responseContent)) {
                        // 1. Process ALL items (text, image, etc.)
                        const processedItems = responseContent.map(item => {
                            if (item.type === "text" && typeof item.text === "string") {
                                try {
                                    const parsed = JSON.parse(item.text);
                                    // Robustness Check: Only unwrap if it's a bare object (not null, not array, not primitive)
                                    // This prevents "123" or "true" or "[]" from becoming inconsistent types in the list
                                    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
                                        return parsed;
                                    }
                                    // If it's a primitive or array, keep it wrapped as text to avoid structure confusion
                                    return { content: item.text, type: "text" };
                                } catch {
                                    return { content: item.text, type: "text" }; // Wrap raw text
                                }
                            }
                            return item; // Keep other types (e.g. image) as is
                        });

                        if (processedItems.length > 0) {
                            // 2. Determine structure
                            if (
                                processedItems.length === 1 &&
                                typeof processedItems[0] === "object" &&
                                !Array.isArray(processedItems[0]) &&
                                processedItems[0] !== null
                            ) {
                                // Single object: use it directly as the root response (Best for standard MCP)
                                responseContent = processedItems[0];
                            } else {
                                // Multiple/Mixed items configuration
                                responseContent = { result: JSON.stringify(processedItems) };
                                this.logger.info(
                                    `[Adapter] Multiple tool response items found (${processedItems.length}). Wrapping in JSON string to preserve all data.`
                                );
                            }
                        } else {
                            // Empty array or unforeseen structure
                            // To keep behavior consistent with the multiple-items case, stringify the array
                            // (e.g. returns { result: "[]" })
                            responseContent = { result: JSON.stringify(responseContent) };
                            this.logger.info(
                                `[Adapter] Empty/Unforeseen tool response structure. Wrapping in JSON string: ${JSON.stringify(responseContent)}`
                            );
                        }
                    }
                } catch (e) {
                    // If content is not valid JSON, wrap it
                    responseContent = { result: message.content };
                }

                // Use function name from tool message (OpenAI format always includes name)
                const functionName = message.name || "unknown_function";

                // Add to buffer instead of pushing directly
                // This allows merging consecutive tool messages into one user message
                // Note: functionResponse does NOT need thoughtSignature per official docs
                const functionResponsePart = {
                    functionResponse: {
                        name: functionName,
                        response: responseContent,
                    },
                };
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
                            this.logger.warn(
                                `[Adapter] Failed to parse tool function arguments for "${toolCall.function.name}": ${e.message}`
                            );
                            args = {};
                        }

                        const functionCallPart = {
                            functionCall: {
                                args,
                                name: toolCall.function.name,
                            },
                        };
                        // Pass back thoughtSignature only on the FIRST functionCall
                        // [PLACEHOLDER MODE] - Use dummy signature to skip validation for official Gemini API testing
                        if (!signatureAttachedToCall) {
                            functionCallPart.thoughtSignature = FormatConverter.DUMMY_THOUGHT_SIGNATURE;
                            signatureAttachedToCall = true;
                            this.logger.info(
                                `[Adapter] Using dummy thoughtSignature for first functionCall: ${toolCall.function.name}`
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
        this.logger.debug(`[Adapter] Debug: googleContents length = ${googleContents.length}`);
        // [DEBUG] Log full googleContents for troubleshooting thoughtSignature issue
        this.logger.debug(`[Adapter] Debug: googleContents = ${JSON.stringify(googleContents, null, 2)}`);
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

        // If model name suffix specifies thinkingLevel, override directly (highest priority)
        if (modelThinkingLevel) {
            if (!thinkingConfig) {
                thinkingConfig = {};
            }
            thinkingConfig.thinkingLevel = modelThinkingLevel;
            this.logger.info(
                `[Adapter] Applied thinkingLevel from model name suffix: ${modelThinkingLevel} (overriding any existing value)`
            );
        }

        if (thinkingConfig) {
            generationConfig.thinkingConfig = thinkingConfig;
        }

        googleRequest.generationConfig = generationConfig;

        /**
         * Helper function to convert OpenAI parameter types to Gemini format (uppercase).
         * Also handles nullable types like ["string", "null"] -> type: "STRING", nullable: true.
         * This function is used for both tools and response_format schema conversion.
         *
         * @param {Object} obj - The schema object to convert
         * @param {boolean} [isResponseSchema=false] - If true, applies stricter rules (e.g. anyOf for unions) for Structured Outputs
         * @returns {Object} The converted schema
         */
        const convertParameterTypes = (obj, isResponseSchema = false) => {
            if (!obj || typeof obj !== "object") return obj;

            const result = Array.isArray(obj) ? [] : {};

            for (const key of Object.keys(obj)) {
                // 1. Filter out unsupported fields using a blacklist approach
                // This allows potentially valid fields to pass through while blocking known problematic ones
                const unsupportedKeys = [
                    "$schema",
                    "additionalProperties",
                    "ref",
                    "$ref",
                    "propertyNames",
                    "patternProperties",
                    "unevaluatedProperties",
                ];

                if (isResponseSchema) {
                    // For Structured Outputs: stricter filtering of metadata that causes 400 errors
                    unsupportedKeys.push("title", "default", "examples", "$defs", "id");
                }

                if (unsupportedKeys.includes(key)) {
                    continue;
                }

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
                            // Multiple non-null types: e.g. ["string", "integer"]
                            if (isResponseSchema) {
                                // For Response Schema: Gemini doesn't support array types, use anyOf
                                result.anyOf = nonNullTypes.map(t => ({
                                    type: t.toUpperCase(),
                                }));
                            } else {
                                result[key] = nonNullTypes.map(t => t.toUpperCase());
                            }
                        } else {
                            // Only null type, default to STRING
                            result[key] = "STRING";
                        }
                    } else if (typeof obj[key] === "string") {
                        // Convert lowercase type to uppercase for Gemini
                        result[key] = obj[key].toUpperCase();
                    } else if (typeof obj[key] === "object" && obj[key] !== null) {
                        result[key] = convertParameterTypes(obj[key], isResponseSchema);
                    } else {
                        result[key] = obj[key];
                    }
                } else if (key === "enum") {
                    // 2. Ensure all enum values are strings (Only for Response Schema)
                    if (isResponseSchema) {
                        if (Array.isArray(obj[key])) {
                            result[key] = obj[key].map(String);
                        } else if (obj[key] !== undefined && obj[key] !== null) {
                            result[key] = [String(obj[key])];
                        }
                        result["type"] = "STRING";
                    } else {
                        // For Tools: Allow original enum values
                        result[key] = obj[key];
                    }
                } else if (typeof obj[key] === "object" && obj[key] !== null) {
                    result[key] = convertParameterTypes(obj[key], isResponseSchema);
                } else {
                    result[key] = obj[key];
                }
            }

            return result;
        };

        // Convert OpenAI tools to Gemini functionDeclarations
        const openaiTools = openaiBody.tools || openaiBody.functions;
        if (openaiTools && Array.isArray(openaiTools) && openaiTools.length > 0) {
            const functionDeclarations = [];

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
                        // isResponseSchema = false for Tools
                        declaration.parameters = convertParameterTypes(funcDef.parameters, false);
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

        // Handle response_format for structured output
        // Convert OpenAI response_format to Gemini responseSchema
        const responseFormat = openaiBody.response_format;
        if (responseFormat) {
            if (responseFormat.type === "json_schema" && responseFormat.json_schema) {
                // Extract schema from OpenAI format
                const jsonSchema = responseFormat.json_schema;
                const schema = jsonSchema.schema;

                if (schema) {
                    try {
                        this.logger.debug(`[Adapter] Debug: Converting OpenAI JSON Schema: ${JSON.stringify(schema)}`);

                        // Convert schema to Gemini format (reuse convertParameterTypes helper defined above)
                        // isResponseSchema = true for Structured Output
                        const convertedSchema = convertParameterTypes(schema, true);

                        this.logger.debug(
                            `[Adapter] Debug: Converted Gemini JSON Schema: ${JSON.stringify(convertedSchema)}`
                        );

                        // Set Gemini config for structured output
                        generationConfig.responseMimeType = "application/json";
                        generationConfig.responseSchema = convertedSchema;

                        this.logger.info(
                            `[Adapter] Converted OpenAI response_format to Gemini responseSchema: ${jsonSchema.name || "unnamed"}`
                        );

                        // Log warning if tools are also present (may cause conflicts)
                        if (googleRequest.tools && googleRequest.tools.length > 0) {
                            this.logger.warn(
                                "[Adapter] ⚠️ Both response_format and tools are present. This may cause unexpected behavior."
                            );
                        }
                    } catch (error) {
                        this.logger.error(
                            `[Adapter] Failed to convert response_format schema: ${error.message}`,
                            error
                        );
                    }
                }
            } else if (responseFormat.type === "json_object") {
                // Simple JSON mode without schema validation
                generationConfig.responseMimeType = "application/json";
                this.logger.info("[Adapter] Enabled JSON mode (no schema validation)");
            } else if (responseFormat.type === "text") {
                // Explicit text mode (default behavior, no action needed)
                this.logger.debug("[Adapter] Response format set to text (default)");
            } else {
                this.logger.warn(`[Adapter] Unsupported response_format type: ${responseFormat.type}. Ignoring.`);
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

        // [DEBUG] Log full request body for troubleshooting 400 errors
        if (googleRequest.tools && googleRequest.tools.length > 0) {
            this.logger.debug(
                `[Adapter] Debug: Sanitized Openai tools = ${JSON.stringify(googleRequest.tools, null, 2)}`
            );
        }

        this.logger.info("[Adapter] Translation complete.");
        return { cleanModelName, googleRequest };
    }

    /**
     * Convert Google streaming response chunk to OpenAI format
     * @param {string} googleChunk - The Google response chunk
     * @param {string} modelName - The model name
     * @param {object} streamState - Optional state object to track thought mode
     */
    translateGoogleToOpenAIStream(googleChunk, modelName = "gemini-2.5-flash-lite", streamState = null) {
        this.logger.debug(`[Adapter] Debug: Received Google chunk: ${googleChunk}`);

        // Ensure streamState exists to properly track tool call indices
        if (!streamState) {
            this.logger.warn(
                "[Adapter] streamState not provided, creating default state. This may cause issues with tool call tracking."
            );
            streamState = {};
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

        if (!streamState.id) {
            streamState.id = `chatcmpl-${this._generateRequestId()}`;
            streamState.created = Math.floor(Date.now() / 1000);
        }
        const streamId = streamState.id;
        const created = streamState.created;

        // Cache usage data whenever it arrives.
        // Store in streamState to prevent concurrency issues between requests
        if (googleResponse.usageMetadata) {
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
                    const toolCallId = `call_${this._generateRequestId()}`;

                    // Track tool call index for multiple function calls
                    const toolCallIndex = streamState.toolCallIndex ?? 0;
                    streamState.toolCallIndex = toolCallIndex + 1;

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
                    streamState.hasFunctionCall = true;

                    this.logger.info(
                        `[Adapter] Converted Gemini functionCall to OpenAI tool_calls: ${funcCall.name} (index: ${toolCallIndex})`
                    );
                    hasContent = true;
                }

                if (hasContent) {
                    // The 'role' should only be sent in the first chunk with content.
                    if (!streamState.roleSent) {
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
            if (streamState.hasFunctionCall) {
                finishReason = "tool_calls";
            } else {
                finishReason = this._mapFinishReason(candidate.finishReason);
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
            };

            // Attach cached usage data to the very last message (if available)
            if (streamState.usage) {
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
                    const toolCallId = `call_${this._generateRequestId()}`;

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
            finishReason = this._mapFinishReason(candidate.finishReason);
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
     * Map Gemini finishReason to OpenAI format
     * @param {string} geminiReason - Gemini finish reason
     * @returns {string} - OpenAI finish reason
     */
    _mapFinishReason(geminiReason) {
        const reasonMap = {
            max_tokens: "length",
            other: "stop",
            recitation: "stop",
            safety: "content_filter",
            stop: "stop",
        };
        return reasonMap[(geminiReason || "stop").toLowerCase()] || "stop";
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

    // ==================== Claude API Format Conversion ====================

    /**
     * Convert Claude API request format to Google Gemini format
     * @param {object} claudeBody - Claude API format request body
     * @returns {Promise<{ googleRequest: object, cleanModelName: string }>} - Converted request and cleaned model name
     */
    async translateClaudeToGoogle(claudeBody) {
        this.logger.info("[Adapter] Starting translation of Claude request format to Google format...");

        // Parse thinkingLevel suffix from model name
        const rawModel = claudeBody.model || "gemini-2.5-flash-lite";
        const { cleanModelName, thinkingLevel: modelThinkingLevel } = FormatConverter.parseModelThinkingLevel(rawModel);

        if (modelThinkingLevel) {
            this.logger.info(
                `[Adapter] Detected thinkingLevel suffix in model name: "${rawModel}" -> model="${cleanModelName}", thinkingLevel="${modelThinkingLevel}"`
            );
        }

        // [DEBUG] Log incoming messages
        this.logger.debug(`[Adapter] Debug: incoming Claude messages = ${JSON.stringify(claudeBody.messages, null, 2)}`);

        let systemInstruction = null;
        const googleContents = [];

        // Extract system message (Claude uses a separate 'system' field)
        if (claudeBody.system) {
            const systemContent = Array.isArray(claudeBody.system)
                ? claudeBody.system.map(block => (typeof block === "string" ? block : block.text || "")).join("\n")
                : claudeBody.system;
            systemInstruction = {
                parts: [{ text: systemContent }],
                role: "system",
            };
        }

        // Buffer for accumulating consecutive tool result parts
        let pendingToolParts = [];

        const flushToolParts = () => {
            if (pendingToolParts.length > 0) {
                googleContents.push({
                    parts: pendingToolParts,
                    role: "user",
                });
                pendingToolParts = [];
            }
        };

        // Convert Claude messages to Google format
        for (const message of claudeBody.messages) {
            const googleParts = [];

            // Handle tool_result role (Claude's function response)
            if (message.role === "user" && Array.isArray(message.content)) {
                const toolResults = message.content.filter(block => block.type === "tool_result");
                if (toolResults.length > 0) {
                    for (const toolResult of toolResults) {
                        let responseContent;
                        if (typeof toolResult.content === "string") {
                            try {
                                responseContent = JSON.parse(toolResult.content);
                            } catch {
                                responseContent = { result: toolResult.content };
                            }
                        } else if (Array.isArray(toolResult.content)) {
                            // Handle array content (text blocks, etc.)
                            const textParts = toolResult.content
                                .filter(c => c.type === "text")
                                .map(c => c.text)
                                .join("\n");
                            try {
                                responseContent = JSON.parse(textParts);
                            } catch {
                                responseContent = { result: textParts };
                            }
                        } else {
                            responseContent = toolResult.content || { result: "" };
                        }

                        pendingToolParts.push({
                            functionResponse: {
                                name: toolResult.tool_use_id || "unknown_function",
                                response: responseContent,
                            },
                        });
                    }

                    // Process non-tool_result content in the same message
                    const otherContent = message.content.filter(block => block.type !== "tool_result");
                    if (otherContent.length > 0) {
                        flushToolParts();
                        for (const block of otherContent) {
                            if (block.type === "text") {
                                googleParts.push({ text: block.text });
                            } else if (block.type === "image") {
                                googleParts.push({
                                    inlineData: {
                                        data: block.source.data,
                                        mimeType: block.source.media_type,
                                    },
                                });
                            }
                        }
                    }
                    if (googleParts.length === 0) continue;
                }
            }

            // Flush pending tool parts before non-tool messages
            if (message.role !== "user" || !Array.isArray(message.content) ||
                !message.content.some(block => block.type === "tool_result")) {
                flushToolParts();
            }

            // Handle assistant messages with tool_use
            if (message.role === "assistant" && Array.isArray(message.content)) {
                let signatureAttachedToCall = false;
                for (const block of message.content) {
                    if (block.type === "tool_use") {
                        const functionCallPart = {
                            functionCall: {
                                args: block.input || {},
                                name: block.name,
                            },
                        };
                        if (!signatureAttachedToCall) {
                            functionCallPart.thoughtSignature = FormatConverter.DUMMY_THOUGHT_SIGNATURE;
                            signatureAttachedToCall = true;
                        }
                        googleParts.push(functionCallPart);
                    } else if (block.type === "thinking") {
                        // Claude thinking block -> Gemini thought
                        googleParts.push({ text: block.thinking, thought: true });
                    } else if (block.type === "text") {
                        googleParts.push({ text: block.text });
                    }
                }
            }

            // Handle regular content
            if (googleParts.length === 0) {
                if (typeof message.content === "string" && message.content.length > 0) {
                    googleParts.push({ text: message.content });
                } else if (Array.isArray(message.content)) {
                    for (const block of message.content) {
                        if (block.type === "text") {
                            googleParts.push({ text: block.text });
                        } else if (block.type === "image") {
                            const source = block.source;
                            if (source.type === "base64") {
                                googleParts.push({
                                    inlineData: {
                                        data: source.data,
                                        mimeType: source.media_type,
                                    },
                                });
                            } else if (source.type === "url") {
                                try {
                                    this.logger.info(`[Adapter] Downloading image from URL: ${source.url}`);
                                    const response = await axios.get(source.url, { responseType: "arraybuffer" });
                                    const imageBuffer = Buffer.from(response.data, "binary");
                                    const base64Data = imageBuffer.toString("base64");
                                    let mimeType = response.headers["content-type"];
                                    if (!mimeType || mimeType === "application/octet-stream") {
                                        mimeType = mime.lookup(source.url) || "image/jpeg";
                                    }
                                    googleParts.push({
                                        inlineData: {
                                            data: base64Data,
                                            mimeType,
                                        },
                                    });
                                } catch (error) {
                                    this.logger.error(`[Adapter] Failed to download image: ${error.message}`);
                                    googleParts.push({ text: `[System Note: Failed to load image from ${source.url}]` });
                                }
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

        // Flush remaining tool parts
        flushToolParts();

        // Build Google request
        const googleRequest = {
            contents: googleContents,
            ...(systemInstruction && {
                systemInstruction: { parts: systemInstruction.parts, role: "user" },
            }),
        };

        // Generation config
        const generationConfig = {
            maxOutputTokens: claudeBody.max_tokens,
            stopSequences: claudeBody.stop_sequences,
            temperature: claudeBody.temperature,
            topK: claudeBody.top_k,
            topP: claudeBody.top_p,
        };

        // Handle thinking config from Claude's metadata
        let thinkingConfig = null;
        if (claudeBody.metadata?.thinking?.enabled) {
            thinkingConfig = { includeThoughts: true };
            if (claudeBody.metadata.thinking.budget_tokens) {
                // Gemini doesn't have budget_tokens, but we can log it
                this.logger.info(`[Adapter] Claude thinking budget_tokens: ${claudeBody.metadata.thinking.budget_tokens}`);
            }
        }

        // Force thinking mode
        if (this.serverSystem.forceThinking && !thinkingConfig) {
            this.logger.info("[Adapter] Force thinking enabled, injecting thinkingConfig for Claude request.");
            thinkingConfig = { includeThoughts: true };
        }

        // Apply model name suffix thinkingLevel
        if (modelThinkingLevel) {
            if (!thinkingConfig) thinkingConfig = {};
            thinkingConfig.thinkingLevel = modelThinkingLevel;
        }

        if (thinkingConfig) {
            generationConfig.thinkingConfig = thinkingConfig;
        }

        googleRequest.generationConfig = generationConfig;

        // Convert Claude tools to Gemini functionDeclarations
        if (claudeBody.tools && Array.isArray(claudeBody.tools) && claudeBody.tools.length > 0) {
            const functionDeclarations = [];

            for (const tool of claudeBody.tools) {
                if (tool.name) {
                    const declaration = { name: tool.name };
                    if (tool.description) declaration.description = tool.description;
                    if (tool.input_schema) {
                        declaration.parameters = this._convertClaudeSchemaToGemini(tool.input_schema);
                    }
                    functionDeclarations.push(declaration);
                }
            }

            if (functionDeclarations.length > 0) {
                googleRequest.tools = [{ functionDeclarations }];
                this.logger.info(`[Adapter] Converted ${functionDeclarations.length} Claude tool(s) to Gemini format`);
            }
        }

        // Convert Claude tool_choice to Gemini toolConfig
        if (claudeBody.tool_choice) {
            const functionCallingConfig = {};
            if (claudeBody.tool_choice.type === "auto") {
                functionCallingConfig.mode = "AUTO";
            } else if (claudeBody.tool_choice.type === "none") {
                functionCallingConfig.mode = "NONE";
            } else if (claudeBody.tool_choice.type === "any") {
                functionCallingConfig.mode = "ANY";
            } else if (claudeBody.tool_choice.type === "tool" && claudeBody.tool_choice.name) {
                functionCallingConfig.mode = "ANY";
                functionCallingConfig.allowedFunctionNames = [claudeBody.tool_choice.name];
            }
            if (Object.keys(functionCallingConfig).length > 0) {
                googleRequest.toolConfig = { functionCallingConfig };
            }
        }

        // Force web search and URL context
        if (this.serverSystem.forceWebSearch || this.serverSystem.forceUrlContext) {
            if (!googleRequest.tools) googleRequest.tools = [];
            if (this.serverSystem.forceWebSearch && !googleRequest.tools.some(t => t.googleSearch)) {
                googleRequest.tools.push({ googleSearch: {} });
            }
            if (this.serverSystem.forceUrlContext && !googleRequest.tools.some(t => t.urlContext)) {
                googleRequest.tools.push({ urlContext: {} });
            }
        }

        // Safety settings
        googleRequest.safetySettings = [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ];

        this.logger.info("[Adapter] Claude to Google translation complete.");
        return { cleanModelName, googleRequest };
    }

    /**
     * Convert Claude input_schema to Gemini parameters format
     */
    _convertClaudeSchemaToGemini(schema) {
        if (!schema || typeof schema !== "object") return schema;

        const result = Array.isArray(schema) ? [] : {};
        const unsupportedKeys = ["$schema", "additionalProperties", "$ref", "patternProperties"];

        for (const key of Object.keys(schema)) {
            if (unsupportedKeys.includes(key)) continue;

            if (key === "type" && typeof schema[key] === "string") {
                result[key] = schema[key].toUpperCase();
            } else if (typeof schema[key] === "object" && schema[key] !== null) {
                result[key] = this._convertClaudeSchemaToGemini(schema[key]);
            } else {
                result[key] = schema[key];
            }
        }
        return result;
    }

    /**
     * Convert Google streaming response chunk to Claude format
     * @param {string} googleChunk - The Google response chunk
     * @param {string} modelName - The model name
     * @param {object} streamState - State object to track streaming progress
     */
    translateGoogleToClaudeStream(googleChunk, modelName = "gemini-2.5-flash-lite", streamState = null) {
        if (!streamState) {
            streamState = {};
        }
        if (!googleChunk || googleChunk.trim() === "") {
            return null;
        }

        let jsonString = googleChunk;
        if (jsonString.startsWith("data: ")) {
            jsonString = jsonString.substring(6).trim();
        }
        if (jsonString === "[DONE]") {
            return null;
        }

        let googleResponse;
        try {
            googleResponse = JSON.parse(jsonString);
        } catch (e) {
            this.logger.warn(`[Adapter] Unable to parse Google JSON chunk for Claude: ${jsonString}`);
            return null;
        }

        // Initialize stream state
        if (!streamState.messageId) {
            streamState.messageId = `msg_${this._generateRequestId()}`;
            streamState.contentBlockIndex = 0;
            streamState.inputTokens = 0;
            streamState.outputTokens = 0;
        }

        // Cache usage data
        if (googleResponse.usageMetadata) {
            streamState.inputTokens = googleResponse.usageMetadata.promptTokenCount || 0;
            streamState.outputTokens = googleResponse.usageMetadata.candidatesTokenCount || 0;
        }

        const candidate = googleResponse.candidates?.[0];
        if (!candidate) {
            if (googleResponse.promptFeedback) {
                this.logger.warn(`[Adapter] Google returned promptFeedback for Claude stream`);
            }
            return null;
        }

        const events = [];

        // Send message_start event once
        if (!streamState.messageStartSent) {
            events.push({
                type: "message_start",
                message: {
                    id: streamState.messageId,
                    type: "message",
                    role: "assistant",
                    content: [],
                    model: modelName,
                    stop_reason: null,
                    stop_sequence: null,
                    usage: {
                        input_tokens: streamState.inputTokens,
                        output_tokens: 0,
                    },
                },
            });
            streamState.messageStartSent = true;
        }

        // Process content parts
        if (candidate.content && Array.isArray(candidate.content.parts)) {
            for (const part of candidate.content.parts) {
                if (part.thought === true && part.text) {
                    // Thinking content
                    if (!streamState.thinkingBlockStarted) {
                        events.push({
                            type: "content_block_start",
                            index: streamState.contentBlockIndex,
                            content_block: { type: "thinking", thinking: "" },
                        });
                        streamState.thinkingBlockStarted = true;
                        streamState.thinkingBlockIndex = streamState.contentBlockIndex;
                        streamState.contentBlockIndex++;
                    }
                    events.push({
                        type: "content_block_delta",
                        index: streamState.thinkingBlockIndex,
                        delta: { type: "thinking_delta", thinking: part.text },
                    });
                } else if (part.text) {
                    // Regular text content
                    if (streamState.thinkingBlockStarted && !streamState.thinkingBlockStopped) {
                        events.push({
                            type: "content_block_stop",
                            index: streamState.thinkingBlockIndex,
                        });
                        streamState.thinkingBlockStopped = true;
                    }
                    if (!streamState.textBlockStarted) {
                        events.push({
                            type: "content_block_start",
                            index: streamState.contentBlockIndex,
                            content_block: { type: "text", text: "" },
                        });
                        streamState.textBlockStarted = true;
                        streamState.textBlockIndex = streamState.contentBlockIndex;
                        streamState.contentBlockIndex++;
                    }
                    events.push({
                        type: "content_block_delta",
                        index: streamState.textBlockIndex,
                        delta: { type: "text_delta", text: part.text },
                    });
                } else if (part.functionCall) {
                    // Tool use
                    const toolUseId = `toolu_${this._generateRequestId()}`;
                    events.push({
                        type: "content_block_start",
                        index: streamState.contentBlockIndex,
                        content_block: {
                            type: "tool_use",
                            id: toolUseId,
                            name: part.functionCall.name,
                            input: {},
                        },
                    });
                    events.push({
                        type: "content_block_delta",
                        index: streamState.contentBlockIndex,
                        delta: {
                            type: "input_json_delta",
                            partial_json: JSON.stringify(part.functionCall.args || {}),
                        },
                    });
                    events.push({
                        type: "content_block_stop",
                        index: streamState.contentBlockIndex,
                    });
                    streamState.contentBlockIndex++;
                    streamState.hasToolUse = true;
                }
            }
        }

        // Handle finish
        if (candidate.finishReason) {
            // Close any open blocks
            if (streamState.textBlockStarted && !streamState.textBlockStopped) {
                events.push({
                    type: "content_block_stop",
                    index: streamState.textBlockIndex,
                });
                streamState.textBlockStopped = true;
            }
            if (streamState.thinkingBlockStarted && !streamState.thinkingBlockStopped) {
                events.push({
                    type: "content_block_stop",
                    index: streamState.thinkingBlockIndex,
                });
                streamState.thinkingBlockStopped = true;
            }

            // Determine stop reason
            let stopReason = "end_turn";
            if (streamState.hasToolUse) {
                stopReason = "tool_use";
            } else if (candidate.finishReason === "MAX_TOKENS") {
                stopReason = "max_tokens";
            } else if (candidate.finishReason === "STOP") {
                stopReason = "end_turn";
            }

            events.push({
                type: "message_delta",
                delta: {
                    stop_reason: stopReason,
                    stop_sequence: null,
                },
                usage: {
                    output_tokens: streamState.outputTokens,
                },
            });

            events.push({ type: "message_stop" });
        }

        if (events.length === 0) return null;

        return events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("");
    }

    /**
     * Convert Google non-stream response to Claude format
     */
    convertGoogleToClaudeNonStream(googleResponse, modelName = "gemini-2.5-flash-lite") {
        const candidate = googleResponse.candidates?.[0];
        const usage = googleResponse.usageMetadata || {};

        const messageId = `msg_${this._generateRequestId()}`;
        const content = [];

        if (!candidate) {
            return {
                id: messageId,
                type: "message",
                role: "assistant",
                content: [{ type: "text", text: "" }],
                model: modelName,
                stop_reason: "end_turn",
                stop_sequence: null,
                usage: {
                    input_tokens: usage.promptTokenCount || 0,
                    output_tokens: usage.candidatesTokenCount || 0,
                },
            };
        }

        let hasToolUse = false;

        if (candidate.content && Array.isArray(candidate.content.parts)) {
            for (const part of candidate.content.parts) {
                if (part.thought === true && part.text) {
                    content.push({
                        type: "thinking",
                        thinking: part.text,
                    });
                } else if (part.text) {
                    content.push({
                        type: "text",
                        text: part.text,
                    });
                } else if (part.inlineData) {
                    // Image output - convert to base64 format
                    content.push({
                        type: "text",
                        text: `![Generated Image](data:${part.inlineData.mimeType};base64,${part.inlineData.data})`,
                    });
                } else if (part.functionCall) {
                    hasToolUse = true;
                    content.push({
                        type: "tool_use",
                        id: `toolu_${this._generateRequestId()}`,
                        name: part.functionCall.name,
                        input: part.functionCall.args || {},
                    });
                }
            }
        }

        // Determine stop reason
        let stopReason = "end_turn";
        if (hasToolUse) {
            stopReason = "tool_use";
        } else if (candidate.finishReason === "MAX_TOKENS") {
            stopReason = "max_tokens";
        } else if (candidate.finishReason === "SAFETY") {
            stopReason = "end_turn"; // Claude doesn't have a direct equivalent
        }

        return {
            id: messageId,
            type: "message",
            role: "assistant",
            content: content.length > 0 ? content : [{ type: "text", text: "" }],
            model: modelName,
            stop_reason: stopReason,
            stop_sequence: null,
            usage: {
                input_tokens: usage.promptTokenCount || 0,
                output_tokens: usage.candidatesTokenCount || 0,
            },
        };
    }
}

module.exports = FormatConverter;

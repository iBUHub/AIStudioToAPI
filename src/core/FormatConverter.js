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
    static GEMINI_BUILT_IN_TOOL_KEYS = [
        "codeExecution",
        "code_execution",
        "googleMaps",
        "google_maps",
        "googleSearch",
        "google_search",
        "googleSearchRetrieval",
        "google_search_retrieval",
        "urlContext",
        "url_context",
    ];

    // ThinkingLevel suffix mapping (lowercase -> uppercase API value)
    static THINKING_LEVEL_MAP = {
        high: "HIGH",
        low: "LOW",
        medium: "MEDIUM",
        minimal: "MINIMAL",
    };

    /**
     * Parse web search suffix from model name.
     * Only supports the LAST hyphen token: `-search` (case-insensitive).
     *
     * Examples:
     * - gemini-3-flash-preview-minimal-search -> { cleanModelName: "gemini-3-flash-preview-minimal", forceWebSearch: true }
     * - gemini-3-flash-preview-search-minimal -> no match (search suffix must be last)
     *
     * @param {string} modelName - Original model name
     * @returns {{ cleanModelName: string, forceWebSearch: boolean }}
     */
    static parseModelWebSearchSuffix(modelName) {
        if (!modelName || typeof modelName !== "string") {
            return { cleanModelName: modelName, forceWebSearch: false };
        }

        const match = modelName.match(/^(.+)-search$/i);
        if (!match) {
            return { cleanModelName: modelName, forceWebSearch: false };
        }

        return { cleanModelName: match[1], forceWebSearch: true };
    }

    /**
     * Parse streaming mode suffix from model name.
     * Only matches a trailing `-real` or `-fake` (case-insensitive).
     * Callers should strip any trailing `-search` suffix before invoking this helper, so the
     * combined suffix order remains: thinking -> streaming -> search.
     *
     * Examples:
     * - gemini-3-flash-preview-minimal-fake -> { cleanModelName: "gemini-3-flash-preview-minimal", streamingMode: "fake" }
     * - gemini-3-flash-preview(minimal)-fake -> { cleanModelName: "gemini-3-flash-preview(minimal)", streamingMode: "fake" }
     * - gemini-3-flash-preview-fake-minimal -> no match (thinking must come before streaming)
     * - gemini-3-flash-preview(minimal)-fake-search -> no direct match here; callers strip `-search` first
     *
     * @param {string} modelName - Original model name
     * @returns {{ cleanModelName: string, streamingMode: ("real"|"fake"|null) }}
     */
    static parseModelStreamingModeSuffix(modelName) {
        if (!modelName || typeof modelName !== "string") {
            return { cleanModelName: modelName, streamingMode: null };
        }

        const match = modelName.match(/^(.+)-(real|fake)$/i);
        if (!match) {
            return { cleanModelName: modelName, streamingMode: null };
        }

        return { cleanModelName: match[1], streamingMode: match[2].toLowerCase() };
    }

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

    normalizeImageUrl(imageSource) {
        if (typeof imageSource === "string") {
            return imageSource;
        }

        if (imageSource && typeof imageSource.url === "string") {
            return imageSource.url;
        }

        return null;
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
                        this.logger.debug(
                            `[Adapter] Added dummy thoughtSignature for functionCall: ${part.functionCall.name}`
                        );
                    }
                }
                // Note: functionResponse does NOT need thoughtSignature per official docs
            }
        }

        return geminiBody;
    }

    hasGeminiBuiltInTools(geminiBody) {
        return !!(
            geminiBody &&
            Array.isArray(geminiBody.tools) &&
            geminiBody.tools.some(
                tool =>
                    tool &&
                    typeof tool === "object" &&
                    FormatConverter.GEMINI_BUILT_IN_TOOL_KEYS.some(toolKey =>
                        Object.prototype.hasOwnProperty.call(tool, toolKey)
                    )
            )
        );
    }

    static hasGeminiToolKey(tool, keys) {
        return !!(
            tool &&
            typeof tool === "object" &&
            keys.some(toolKey => Object.prototype.hasOwnProperty.call(tool, toolKey))
        );
    }

    static hasGeminiGoogleSearchTool(tools) {
        return (
            Array.isArray(tools) &&
            tools.some(tool => FormatConverter.hasGeminiToolKey(tool, ["googleSearch", "google_search"]))
        );
    }

    static hasGeminiUrlContextTool(tools) {
        return (
            Array.isArray(tools) &&
            tools.some(tool => FormatConverter.hasGeminiToolKey(tool, ["urlContext", "url_context"]))
        );
    }

    hasGeminiFunctionDeclarations(geminiBody) {
        return !!(
            geminiBody &&
            Array.isArray(geminiBody.tools) &&
            geminiBody.tools.some(
                tool =>
                    tool &&
                    typeof tool === "object" &&
                    ((Array.isArray(tool.functionDeclarations) && tool.functionDeclarations.length > 0) ||
                        (Array.isArray(tool.function_declarations) && tool.function_declarations.length > 0))
            )
        );
    }

    ensureServerSideToolInvocations(geminiBody, logPrefix = "[Adapter]") {
        if (!this.hasGeminiBuiltInTools(geminiBody) || !this.hasGeminiFunctionDeclarations(geminiBody)) {
            return geminiBody;
        }

        if (
            !geminiBody.toolConfig ||
            typeof geminiBody.toolConfig !== "object" ||
            Array.isArray(geminiBody.toolConfig)
        ) {
            geminiBody.toolConfig = {};
        }

        if (geminiBody.toolConfig.includeServerSideToolInvocations === true) {
            return geminiBody;
        }

        geminiBody.toolConfig.includeServerSideToolInvocations = true;
        this.logger.debug(
            `${logPrefix} Enabled toolConfig.includeServerSideToolInvocations for built-in tools with functionDeclarations.`
        );

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

        // Helper function to recursively sanitize schema:
        // 1. Remove unsupported fields ($schema, additionalProperties)
        // 2. Convert lowercase type to uppercase (object -> OBJECT, string -> STRING, etc.)
        const sanitizeSchema = obj => {
            if (!obj || typeof obj !== "object") return obj;

            const result = Array.isArray(obj) ? [] : {};

            for (const key of Object.keys(obj)) {
                // Skip fields not supported by Gemini API
                const unsupportedKeys = [
                    "$schema",
                    "additionalProperties",
                    "ref",
                    "$ref",
                    "propertyNames",
                    "patternProperties",
                    "unevaluatedProperties",
                ];
                if (unsupportedKeys.includes(key)) {
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
            const declarations =
                Array.isArray(tool.functionDeclarations) && tool.functionDeclarations.length > 0
                    ? tool.functionDeclarations
                    : tool.function_declarations;
            if (declarations && Array.isArray(declarations)) {
                for (const funcDecl of declarations) {
                    if (funcDecl.parameters) {
                        funcDecl.parameters = sanitizeSchema(funcDecl.parameters);
                    }
                }
            }
        }

        return geminiBody;
    }

    /**
     * Convert JSON Schema to Gemini parameters format.
     * Handles nullable types, enums, and ensures uppercase types.
     *
     * @param {Object} obj - The schema object to convert
     * @param {boolean} [isResponseSchema=false] - If true, applies stricter rules (e.g. anyOf for unions) for Structured Outputs
     * @param {boolean} [isProperties=false] - If true, the current object is a map of property definitions, so keys should not be filtered
     * @returns {Object} The converted schema
     */
    _convertSchemaToGemini(obj, isResponseSchema = false, isProperties = false) {
        if (!obj || typeof obj !== "object") return obj;

        const result = Array.isArray(obj) ? [] : {};

        for (const key of Object.keys(obj)) {
            // 1. Filter out unsupported fields using a blacklist approach
            const unsupportedKeys = [
                "$schema",
                "additionalProperties",
                "ref",
                "$ref",
                "propertyNames",
                "patternProperties",
                "unevaluatedProperties",
                "exclusiveMinimum",
                "exclusiveMaximum",
                "const",
            ];

            if (isResponseSchema) {
                // For Structured Outputs: stricter filtering of metadata that causes 400 errors
                unsupportedKeys.push("default", "examples", "$defs", "id");
            }

            // ONLY Filter metadata keywords if NOT a property name (isProperties is false)
            if (!isProperties && unsupportedKeys.includes(key)) {
                continue;
            }

            // Handle anyOf specially (only when it is a schema keyword),
            // but `{"type":"OBJECT","properties":{"isNewTopic":{"type":"BOOLEAN"},"title":{"anyOf":[{"type":"STRING"},{"type":"NULL"}]}},"required":["isNewTopic","title"]}` is right, need to confirm
            if (key === "anyOf" && !isProperties) {
                if (Array.isArray(obj[key])) {
                    const variants = obj[key];
                    const hasNull = variants.some(v => v.type === "null");
                    const nonNullVariants = variants.filter(v => v.type !== "null");

                    if (hasNull) {
                        result.nullable = true;
                    }

                    if (nonNullVariants.length === 1) {
                        // Collapse single variant. Reset isProperties to false for the variant's schema.
                        const converted = this._convertSchemaToGemini(nonNullVariants[0], isResponseSchema, false);
                        // Merge converted properties into result
                        Object.assign(result, converted);
                        if (hasNull) result.nullable = true;
                        continue; // Skip setting 'anyOf' explicitly
                    } else if (nonNullVariants.length > 0) {
                        // Keep anyOf for multiple variants. Reset isProperties for sub-schemas.
                        result.anyOf = nonNullVariants.map(v =>
                            this._convertSchemaToGemini(v, isResponseSchema, false)
                        );
                        continue;
                    } else if (hasNull) {
                        // Only null type? Keep it as nullable without forcing a specific type.
                        continue;
                    }
                }
            }

            // Handle type specially (only when it is a schema keyword)
            if (key === "type" && !isProperties) {
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
                    // Type being an object is a sub-schema definition, not property name mapping
                    result[key] = this._convertSchemaToGemini(obj[key], isResponseSchema, false);
                } else {
                    result[key] = obj[key];
                }
            } else if (key === "enum" && !isProperties) {
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
                // Recursion logic:
                // - If key is 'properties', next level is a map of property NAMES. Set isProperties = true.
                // - Otherwise, if we were currently in a properties map (isProperties is true),
                //   the value is a schema definition. For its keys, isProperties MUST be false.
                const nextIsProperties = key === "properties";
                const recursionFlag = isProperties ? false : nextIsProperties;

                result[key] = this._convertSchemaToGemini(obj[key], isResponseSchema, recursionFlag);
            } else {
                result[key] = obj[key];
            }
        }

        return result;
    }

    /**
     * Convert OpenAI request format to Google Gemini format
     * @param {object} openaiBody - OpenAI format request body
     * @returns {Promise<{ googleRequest: object, cleanModelName: string, modelStreamingMode: ("real"|"fake"|null) }>}
     *          - modelStreamingMode: Streaming mode override parsed from model name suffix, or null
     */
    async translateOpenAIToGoogle(openaiBody) {
        this.logger.info("[Adapter] Starting translation of OpenAI request format to Google format...");

        // [DEBUG] Log incoming messages for troubleshooting
        this.logger.debug(`[Adapter] Debug: incoming OpenAI Body = ${JSON.stringify(openaiBody, null, 2)}`);

        // Parse model suffixes in reverse stripping order:
        // 1) web search override: only trailing `-search`
        // 2) streaming override: trailing `-real` / `-fake` after any thinking suffix
        // 3) thinkingLevel override: trailing `-minimal` / `(minimal)` etc.
        // Combined user-facing suffix order: thinking -> streaming -> search
        const rawModel = openaiBody.model || "gemini-2.5-flash-lite";
        const { cleanModelName: searchStrippedModel, forceWebSearch: modelForceWebSearch } =
            FormatConverter.parseModelWebSearchSuffix(rawModel);
        const { cleanModelName: streamStrippedModel, streamingMode: modelStreamingMode } =
            FormatConverter.parseModelStreamingModeSuffix(searchStrippedModel);
        const { cleanModelName, thinkingLevel: modelThinkingLevel } =
            FormatConverter.parseModelThinkingLevel(streamStrippedModel);

        if (modelForceWebSearch) {
            this.logger.info(
                `[Adapter] Detected webSearch suffix in model name: "${rawModel}" -> model="${searchStrippedModel}", forceWebSearch=true`
            );
        }
        if (modelStreamingMode) {
            this.logger.info(
                `[Adapter] Detected streamingMode suffix in model name: "${searchStrippedModel}" -> model="${streamStrippedModel}", streamingMode="${modelStreamingMode}"`
            );
        }
        if (modelThinkingLevel) {
            this.logger.info(
                `[Adapter] Detected thinkingLevel suffix in model name: "${streamStrippedModel}" -> model="${cleanModelName}", thinkingLevel="${modelThinkingLevel}"`
            );
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
                    // Avoid accessing Function.prototype.arguments in strict mode (will throw)
                    if (
                        toolCall.type === "function" &&
                        toolCall.function &&
                        typeof toolCall.function === "object" &&
                        !Array.isArray(toolCall.function)
                    ) {
                        let args;
                        try {
                            const rawArgs = Object.prototype.hasOwnProperty.call(toolCall.function, "arguments")
                                ? toolCall.function["arguments"]
                                : undefined;
                            args = typeof rawArgs === "string" ? JSON.parse(rawArgs) : rawArgs;
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
                            this.logger.debug(
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
                        const dataUrl = this.normalizeImageUrl(part.image_url);
                        if (!dataUrl) {
                            this.logger.warn("[Adapter] Skipping image_url part because no string URL was provided.");
                            googleParts.push({
                                text: "[System Note: Skipped an image input because image_url was not a string URL]",
                            });
                            continue;
                        }
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
                        } else {
                            this.logger.warn(
                                `[Adapter] Skipping image_url part because URL format is unsupported: ${dataUrl}`
                            );
                            googleParts.push({
                                text: "[System Note: Skipped an image input because image_url format was unsupported]",
                            });
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
                this.logger.debug(
                    `[Adapter] Detected OpenAI standard reasoning parameter (reasoning_effort: ${effort}), auto-converting to Google format.`
                );
                thinkingConfig = { includeThoughts: true };
            }
        }

        // Force thinking mode (only set includeThoughts=true when missing)
        if (this.serverSystem.forceThinking && (!thinkingConfig || thinkingConfig.includeThoughts === undefined)) {
            this.logger.info("[Adapter] ⚠️ Force thinking enabled, setting includeThoughts=true for OpenAI request.");
            thinkingConfig = { ...(thinkingConfig || {}), includeThoughts: true };
        }

        // If model name suffix specifies thinkingLevel, override directly (highest priority)
        if (modelThinkingLevel) {
            if (!thinkingConfig) {
                thinkingConfig = {};
            }
            thinkingConfig.thinkingLevel = modelThinkingLevel;
            this.logger.info(`[Adapter] Applied thinkingLevel from model name suffix: ${modelThinkingLevel}`);
        }

        if (thinkingConfig) {
            generationConfig.thinkingConfig = thinkingConfig;
        }

        googleRequest.generationConfig = generationConfig;

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
                        // Use shared _convertSchemaToGemini
                        declaration.parameters = this._convertSchemaToGemini(funcDef.parameters);
                    }
                    functionDeclarations.push(declaration);
                }
            }

            if (functionDeclarations.length > 0) {
                googleRequest.tools = [{ functionDeclarations }];
                this.logger.info(`[Adapter] Converted ${functionDeclarations.length} OpenAI tool(s) to Gemini format`);
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
                this.logger.debug(
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

                        // Convert schema to Gemini format (reuse shared method)
                        // isResponseSchema = true for Structured Output
                        const convertedSchema = this._convertSchemaToGemini(schema, true);

                        this.logger.debug(
                            `[Adapter] Debug: Converted Gemini JSON Schema: ${JSON.stringify(convertedSchema)}`
                        );

                        // Set Gemini config for structured output
                        generationConfig.responseMimeType = "application/json";
                        generationConfig.responseSchema = convertedSchema;

                        this.logger.info(
                            `[Adapter] Converted OpenAI response_format to Gemini responseSchema: ${jsonSchema.name || "unnamed"}`
                        );
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

        this._finalizeGoogleRequest(googleRequest, { forceWebSearch: modelForceWebSearch });
        this.logger.info("[Adapter] OpenAI to Google translation complete.");
        return { cleanModelName, googleRequest, modelStreamingMode };
    }

    /**
     * Common final processing for Gemini requests:
     * 1. Inject force features (Search, URL Context)
     * 2. Apply safety settings
     * 3. Log final request body
     * @param {object} googleRequest - The Gemini request object to finalize
     * @param {object} [options={}] - Per-request tool injection overrides.
     * @param {boolean} [options.forceWebSearch] - When truthy, force-enable `googleSearch` for this request even
     * if `serverSystem.forceWebSearch` is disabled. Falsy values fall back to the global setting. Current callers
     * use this for model-name-driven overrides such as the `-search` suffix.
     * @param {boolean} [options.forceUrlContext] - When truthy, force-enable `urlContext` for this request even if
     * `serverSystem.forceUrlContext` is disabled. Falsy values fall back to the global setting.
     * @private
     */
    _finalizeGoogleRequest(googleRequest, options = {}) {
        const forceWebSearch = options.forceWebSearch || this.serverSystem.forceWebSearch;
        const forceUrlContext = options.forceUrlContext || this.serverSystem.forceUrlContext;

        // Force web search and URL context
        if (forceWebSearch || forceUrlContext) {
            if (!googleRequest.tools) {
                googleRequest.tools = [];
            }

            const toolsToAdd = [];

            // Handle Google Search
            if (forceWebSearch) {
                const hasSearch = FormatConverter.hasGeminiGoogleSearchTool(googleRequest.tools);
                if (!hasSearch) {
                    googleRequest.tools.push({ googleSearch: {} });
                    toolsToAdd.push("googleSearch");
                }
            }

            // Handle URL Context
            if (forceUrlContext) {
                const hasUrlContext = FormatConverter.hasGeminiUrlContextTool(googleRequest.tools);
                if (!hasUrlContext) {
                    googleRequest.tools.push({ urlContext: {} });
                    toolsToAdd.push("urlContext");
                }
            }

            if (toolsToAdd.length > 0) {
                this.logger.info(`[Adapter] ⚠️ Force features enabled, injecting tools: [${toolsToAdd.join(", ")}]`);
            }
        }

        this.ensureServerSideToolInvocations(googleRequest);

        // Safety settings
        googleRequest.safetySettings = [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
        ];

        this.logger.debug(`[Adapter] Debug: Final Gemini Request = ${JSON.stringify(googleRequest, null, 2)}`);
    }

    /**
     * Convert Google streaming response chunk to OpenAI format
     * @param {string} googleChunk - The Google response chunk
     * @param {string} modelName - The model name
     * @param {object} streamState - Optional state object to track thought mode
     */
    translateGoogleToOpenAIStream(googleChunk, modelName = "gemini-2.5-flash-lite", streamState = null) {
        this.logger.debug(`[Adapter] Debug: Received Google chunk for OpenAI: ${googleChunk}`);

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
            this.logger.warn(`[Adapter] Unable to parse Google JSON chunk for OpenAI: ${jsonString}`);
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
                    `[Adapter] Google returned promptFeedback for OpenAI stream, may have been blocked: ${JSON.stringify(
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
     * Convert Google streaming chunk to OpenAI Response API format
     * @param {string} googleChunk - Google API streaming chunk
     * @param {string} modelName - Model name
     * @param {object} streamState - State object to track stream progress
     * @returns {string|null} - SSE formatted events for Response API
     */
    translateGoogleToResponseAPIStream(googleChunk, modelName = "gemini-2.5-flash-lite", streamState = null) {
        this.logger.debug(`[Adapter] Debug: Received Google chunk for Response API: ${googleChunk}`);

        // Ensure streamState exists
        if (!streamState) {
            this.logger.warn("[Adapter] streamState not provided, creating default state.");
            streamState = {};
        }

        if (!googleChunk || googleChunk.trim() === "") {
            return null;
        }

        const eventsToSend = [];

        const pushEvent = (eventType, payload) => {
            if (!streamState.sequenceNumber) streamState.sequenceNumber = 0;
            streamState.sequenceNumber++;

            const eventPayload = {
                ...payload,
                sequence_number: streamState.sequenceNumber,
                type: eventType,
            };

            eventsToSend.push(`event: ${eventType}\ndata: ${JSON.stringify(eventPayload)}\n\n`);
        };

        const ensureInitialized = () => {
            if (streamState.initialized) return;

            streamState.initialized = true;
            streamState.id = streamState.id || `resp_${this._generateRequestId()}`;
            streamState.created_at = streamState.created_at || Math.floor(Date.now() / 1000);

            streamState.outputItemsByIndex = [];
            streamState.nextOutputIndex = 0;
            streamState.messageItem = null;
            streamState.messageText = "";
            streamState.reasoningItem = null;
            streamState.reasoningSummaryText = "";
            streamState.reasoningSummaryPartAdded = false;
            streamState.completed = false;
        };

        const buildResponseObject = (overrides = {}) => ({
            completed_at: null,
            created_at: streamState.created_at,
            error: null,
            id: streamState.id,
            incomplete_details: null,
            instructions: null,
            max_output_tokens: null,
            metadata: {},
            model: modelName,
            object: "response",
            output: [],
            parallel_tool_calls: true,
            previous_response_id: null,
            reasoning: {
                effort: null,
                summary: null,
            },
            service_tier: "default",
            status: "in_progress",
            temperature: 1.0,
            text: {
                format: {
                    type: "text",
                },
            },
            tool_choice: "auto",
            tools: [],
            top_p: 1.0,
            truncation: "disabled",
            usage: null,
            user: null,
            ...(streamState.responseDefaults || {}),
            ...overrides,
            // This proxy does not support OpenAI-side persistence.
            ...{ store: false },
        });

        const ensureMessageItem = () => {
            if (streamState.messageItem) return streamState.messageItem;

            const itemId = `msg_${this._generateRequestId()}`;
            const outputIndex = streamState.nextOutputIndex++;

            streamState.messageItem = {
                content: [],
                content_index: 0,
                id: itemId,
                output_index: outputIndex,
                role: "assistant",
                status: "in_progress",
                type: "message",
            };

            // Reserve the output slot so subsequent items get unique output_index values.
            streamState.outputItemsByIndex[outputIndex] = {
                content: [],
                id: itemId,
                role: "assistant",
                status: "in_progress",
                type: "message",
            };

            pushEvent("response.output_item.added", {
                item: {
                    content: [],
                    id: itemId,
                    role: "assistant",
                    status: "in_progress",
                    type: "message",
                },
                output_index: outputIndex,
            });

            pushEvent("response.content_part.added", {
                content_index: 0,
                item_id: itemId,
                output_index: outputIndex,
                part: {
                    annotations: [],
                    text: "",
                    type: "output_text",
                },
            });

            return streamState.messageItem;
        };

        const ensureReasoningItem = () => {
            if (streamState.reasoningItem) return streamState.reasoningItem;

            const itemId = `rsn_${this._generateRequestId()}`;
            const outputIndex = streamState.nextOutputIndex++;

            streamState.reasoningItem = {
                id: itemId,
                output_index: outputIndex,
                status: "in_progress",
                summary_index: 0,
                type: "reasoning",
            };

            streamState.outputItemsByIndex[outputIndex] = {
                id: itemId,
                status: "in_progress",
                summary: [],
                type: "reasoning",
            };

            pushEvent("response.output_item.added", {
                item: {
                    id: itemId,
                    status: "in_progress",
                    summary: [],
                    type: "reasoning",
                },
                output_index: outputIndex,
            });

            return streamState.reasoningItem;
        };

        const finalizeReasoningItem = () => {
            if (!streamState.reasoningItem) return;
            if (streamState.reasoningItem.status === "completed") return;

            const itemId = streamState.reasoningItem.id;
            const outputIndex = streamState.reasoningItem.output_index;
            const summaryIndex = streamState.reasoningItem.summary_index ?? 0;
            const finalText = streamState.reasoningSummaryText || "";

            pushEvent("response.reasoning_summary_text.done", {
                item_id: itemId,
                output_index: outputIndex,
                summary_index: summaryIndex,
                text: finalText,
            });

            pushEvent("response.reasoning_summary_part.done", {
                item_id: itemId,
                output_index: outputIndex,
                part: {
                    text: finalText,
                    type: "summary_text",
                },
                summary_index: summaryIndex,
            });

            const completedItem = {
                id: itemId,
                status: "completed",
                summary: [
                    {
                        text: finalText,
                        type: "summary_text",
                    },
                ],
                type: "reasoning",
            };

            streamState.reasoningItem.status = "completed";
            streamState.outputItemsByIndex[outputIndex] = completedItem;

            pushEvent("response.output_item.done", {
                item: completedItem,
                output_index: outputIndex,
            });
        };

        const finalizeMessageItem = () => {
            if (!streamState.messageItem) return;
            if (streamState.messageItem.status === "completed") return;

            const itemId = streamState.messageItem.id;
            const outputIndex = streamState.messageItem.output_index;
            const contentIndex = streamState.messageItem.content_index;
            const finalText = streamState.messageText || "";

            pushEvent("response.output_text.done", {
                content_index: contentIndex,
                item_id: itemId,
                output_index: outputIndex,
                text: finalText,
            });

            pushEvent("response.content_part.done", {
                content_index: contentIndex,
                item_id: itemId,
                output_index: outputIndex,
                part: {
                    annotations: [],
                    text: finalText,
                    type: "output_text",
                },
            });

            const completedItem = {
                content: [
                    {
                        annotations: [],
                        text: finalText,
                        type: "output_text",
                    },
                ],
                id: itemId,
                role: "assistant",
                status: "completed",
                type: "message",
            };

            streamState.messageItem.status = "completed";
            streamState.messageItem.content = completedItem.content;

            streamState.outputItemsByIndex[outputIndex] = completedItem;

            pushEvent("response.output_item.done", {
                item: completedItem,
                output_index: outputIndex,
            });
        };

        const handleGoogleResponseObject = googleResponse => {
            ensureInitialized();

            // Cache usage data if present
            if (googleResponse?.usageMetadata) {
                streamState.usage = this._parseUsage(googleResponse);
            }

            const candidate = googleResponse?.candidates?.[0];
            if (!candidate) {
                if (googleResponse?.promptFeedback) {
                    this.logger.warn(
                        `[Adapter] Google returned promptFeedback for Response API stream: ${JSON.stringify(
                            googleResponse.promptFeedback
                        )}`
                    );
                }
                return;
            }

            // Emit the initial response state events once
            if (!streamState.responseSent) {
                pushEvent("response.created", {
                    response: buildResponseObject({
                        output: [],
                        status: "in_progress",
                        usage: null,
                    }),
                });
                pushEvent("response.in_progress", {
                    response: buildResponseObject({
                        output: [],
                        status: "in_progress",
                        usage: null,
                    }),
                });
                streamState.responseSent = true;
            }

            // Parts -> SSE events
            if (candidate.content && Array.isArray(candidate.content.parts)) {
                for (const part of candidate.content.parts) {
                    // The Responses API exposes reasoning summaries via `summary` + `response.reasoning_summary_text.*`.
                    // Map Gemini "thought" parts to reasoning *summary* to match official expectations.
                    if (part?.thought === true) {
                        if (part?.text) {
                            const reasoningItem = ensureReasoningItem();
                            streamState.reasoningSummaryText += part.text;

                            if (!streamState.reasoningSummaryPartAdded) {
                                streamState.reasoningSummaryPartAdded = true;
                                pushEvent("response.reasoning_summary_part.added", {
                                    item_id: reasoningItem.id,
                                    output_index: reasoningItem.output_index,
                                    part: {
                                        text: "",
                                        type: "summary_text",
                                    },
                                    summary_index: reasoningItem.summary_index ?? 0,
                                });
                            }

                            pushEvent("response.reasoning_summary_text.delta", {
                                delta: part.text,
                                item_id: reasoningItem.id,
                                output_index: reasoningItem.output_index,
                                summary_index: reasoningItem.summary_index ?? 0,
                            });
                        }
                        continue;
                    }

                    if (part?.text) {
                        const messageItem = ensureMessageItem();
                        streamState.messageText += part.text;

                        pushEvent("response.output_text.delta", {
                            content_index: messageItem.content_index,
                            delta: part.text,
                            item_id: messageItem.id,
                            output_index: messageItem.output_index,
                        });
                    } else if (part?.inlineData) {
                        // This proxy intentionally does not expose image outputs in Responses API because many
                        // clients treat `image_generation_call` as a hosted tool call and may initiate a second
                        // tool-execution roundtrip that Gemini image models cannot support (function calling).
                        // Emit a one-time text note so clients don't get an empty response.
                        if (!streamState.imageOutputSuppressedNoticeSent) {
                            streamState.imageOutputSuppressedNoticeSent = true;
                            const messageItem = ensureMessageItem();
                            const note =
                                "[Image output omitted: Responses API image outputs are disabled by this proxy.]";
                            streamState.messageText += note;
                            pushEvent("response.output_text.delta", {
                                content_index: messageItem.content_index,
                                delta: note,
                                item_id: messageItem.id,
                                output_index: messageItem.output_index,
                            });
                        }
                    } else if (part?.functionCall) {
                        const funcCall = part.functionCall;
                        const itemId = `fc_${this._generateRequestId()}`;
                        const callId = `call_${this._generateRequestId()}`;
                        const outputIndex = streamState.nextOutputIndex++;
                        const args = JSON.stringify(funcCall.args || {});

                        pushEvent("response.output_item.added", {
                            item: {
                                arguments: "",
                                call_id: callId,
                                id: itemId,
                                name: funcCall.name,
                                status: "in_progress",
                                type: "function_call",
                            },
                            output_index: outputIndex,
                        });

                        pushEvent("response.function_call_arguments.done", {
                            arguments: args,
                            item_id: itemId,
                            name: funcCall.name,
                            output_index: outputIndex,
                        });

                        const completedToolItem = {
                            arguments: args,
                            call_id: callId,
                            id: itemId,
                            name: funcCall.name,
                            status: "completed",
                            type: "function_call",
                        };
                        streamState.outputItemsByIndex[outputIndex] = completedToolItem;

                        pushEvent("response.output_item.done", {
                            item: completedToolItem,
                            output_index: outputIndex,
                        });

                        this.logger.info(
                            `[Adapter] Converted Gemini functionCall to Response API function_call: ${funcCall.name}`
                        );
                    }
                }
            }

            // Completion
            if (candidate.finishReason && !streamState.completed) {
                finalizeReasoningItem();
                finalizeMessageItem();

                const usage = streamState.usage || {
                    completion_tokens: 0,
                    prompt_tokens: 0,
                    total_tokens: 0,
                };

                const responseUsage = {
                    input_tokens: usage.prompt_tokens,
                    input_tokens_details: {
                        cached_tokens: 0,
                    },
                    output_tokens: usage.completion_tokens,
                    output_tokens_details: {
                        reasoning_tokens: usage.completion_tokens_details?.reasoning_tokens || 0,
                    },
                    total_tokens: usage.total_tokens,
                };

                const completedAt = Math.floor(Date.now() / 1000);
                const finalOutput = (streamState.outputItemsByIndex || []).filter(Boolean);

                pushEvent("response.completed", {
                    response: buildResponseObject({
                        completed_at: completedAt,
                        output: finalOutput,
                        status: "completed",
                        usage: responseUsage,
                    }),
                });

                streamState.completed = true;
            }
        };

        // Google streaming might concatenate multiple SSE frames; handle them safely.
        const frames = String(googleChunk)
            .split(/\n\n+/)
            .map(s => s.trim())
            .filter(Boolean);

        for (const frame of frames) {
            let jsonString = frame;
            if (jsonString.startsWith("data:")) {
                jsonString = jsonString.replace(/^data:\s*/i, "").trim();
            }

            if (jsonString === "[DONE]") {
                continue; // Responses streaming does not use [DONE]
            }

            try {
                const googleResponse = JSON.parse(jsonString);
                handleGoogleResponseObject(googleResponse);
            } catch (e) {
                this.logger.warn(`[Adapter] Unable to parse Google JSON chunk for Response API: ${jsonString}`);
            }
        }

        return eventsToSend.length > 0 ? eventsToSend.join("") : null;
    }

    /**
     * Convert Google non-stream response to OpenAI format
     */
    convertGoogleToOpenAINonStream(googleResponse, modelName = "gemini-2.5-flash-lite") {
        try {
            this.logger.debug(
                `[Adapter] Debug: Received Google response for OpenAI non-stream: ${JSON.stringify(googleResponse)}`
            );
        } catch (e) {
            this.logger.debug(
                `[Adapter] Debug: Received Google response for OpenAI non-stream (non-serializable): ${String(
                    googleResponse
                )}`
            );
        }

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
     * Convert Google response to OpenAI Response API format (non-streaming)
     * @param {object} googleResponse - Google API response
     * @param {string} modelName - Model name
     * @returns {object} - OpenAI Response API format response
     */
    convertGoogleToResponseAPINonStream(googleResponse, modelName = "gemini-2.5-flash-lite", responseDefaults = {}) {
        try {
            this.logger.debug(
                `[Adapter] Debug: Received Google response for Response API non-stream: ${JSON.stringify(googleResponse)}`
            );
        } catch (e) {
            this.logger.debug(
                `[Adapter] Debug: Received Google response for Response API non-stream (non-serializable): ${String(
                    googleResponse
                )}`
            );
        }

        const candidate = googleResponse.candidates?.[0];

        if (!candidate) {
            this.logger.warn("[Adapter] No candidate found in Google response");
            return {
                completed_at: Math.floor(Date.now() / 1000),
                created_at: Math.floor(Date.now() / 1000),
                error: null,
                id: `resp_${this._generateRequestId()}`,
                incomplete_details: null,
                instructions: null,
                max_output_tokens: null,
                metadata: {},
                model: modelName,
                object: "response",
                output: [],
                parallel_tool_calls: true,
                reasoning: {
                    effort: null,
                    summary: null,
                },
                service_tier: "default",
                status: "completed",
                temperature: 1.0,
                text: {
                    format: {
                        type: "text",
                    },
                },
                tool_choice: "auto",
                tools: [],
                top_p: 1.0,
                truncation: "disabled",
                usage: {
                    input_tokens: 0,
                    input_tokens_details: {
                        cached_tokens: 0,
                    },
                    output_tokens: 0,
                    output_tokens_details: {
                        reasoning_tokens: 0,
                    },
                    total_tokens: 0,
                },
                ...(responseDefaults || {}),
                // This proxy does not support OpenAI-side persistence.
                ...{ store: false },
            };
        }

        const output = [];
        let messageContent = "";
        let reasoningContent = "";
        if (candidate.content && Array.isArray(candidate.content.parts)) {
            for (const part of candidate.content.parts) {
                // Responses API supports reasoning output items; map Gemini "thought" parts into a reasoning *summary*.
                if (part?.thought === true) {
                    if (part?.text) reasoningContent += part.text;
                    continue;
                } else if (part.text) {
                    // Regular text content
                    messageContent += part.text;
                } else if (part.inlineData) {
                    // Responses API image outputs are intentionally suppressed by this proxy; preserve a text note.
                    if (!messageContent) {
                        messageContent =
                            "[Image output omitted: Responses API image outputs are disabled by this proxy.]";
                    }
                } else if (part.functionCall) {
                    // Function call
                    const funcCall = part.functionCall;
                    const callId = `call_${this._generateRequestId()}`;
                    output.push({
                        arguments: JSON.stringify(funcCall.args || {}),
                        call_id: callId,
                        id: `fc-${this._generateRequestId()}`,
                        name: funcCall.name,
                        status: "completed",
                        type: "function_call",
                    });
                    this.logger.info(
                        `[Adapter] Converted Gemini functionCall to Response API function_call: ${funcCall.name}`
                    );
                }
            }
        }

        if (reasoningContent) {
            output.unshift({
                id: `rsn_${this._generateRequestId()}`,
                status: "completed",
                summary: [
                    {
                        text: reasoningContent,
                        type: "summary_text",
                    },
                ],
                type: "reasoning",
            });
        }

        // Add message output if present
        if (messageContent) {
            output.push({
                content: [
                    {
                        annotations: [],
                        logprobs: null,
                        text: messageContent,
                        type: "output_text",
                    },
                ],
                id: `msg_${this._generateRequestId()}`,
                role: "assistant",
                status: "completed",
                type: "message",
            });
        }

        // Parse usage
        const usage = this._parseUsage(googleResponse);

        return {
            completed_at: Math.floor(Date.now() / 1000),
            created_at: Math.floor(Date.now() / 1000),
            error: null,
            id: `resp_${this._generateRequestId()}`,
            incomplete_details: null,
            instructions: null,
            max_output_tokens: null,
            metadata: {},
            model: modelName,
            object: "response",
            output,
            parallel_tool_calls: true,
            reasoning: {
                effort: null,
                summary: null,
            },
            service_tier: "default",
            status: "completed",
            temperature: 1.0,
            text: {
                format: {
                    type: "text",
                },
            },
            tool_choice: "auto",
            tools: [],
            top_p: 1.0,
            truncation: "disabled",
            usage: {
                input_tokens: usage.prompt_tokens,
                input_tokens_details: {
                    cached_tokens: 0,
                },
                output_tokens: usage.completion_tokens,
                output_tokens_details: {
                    reasoning_tokens: usage.completion_tokens_details?.reasoning_tokens || 0,
                },
                total_tokens: usage.total_tokens,
            },
            ...(responseDefaults || {}),
            // This proxy does not support OpenAI-side persistence.
            ...{ store: false },
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
     * @returns {Promise<{ googleRequest: object, cleanModelName: string, modelStreamingMode: ("real"|"fake"|null) }>}
     *          - modelStreamingMode: Streaming mode override parsed from model name suffix, or null
     */
    async translateClaudeToGoogle(claudeBody) {
        this.logger.info("[Adapter] Starting translation of Claude request format to Google format...");

        // [DEBUG] Log incoming messages
        this.logger.debug(`[Adapter] Debug: incoming Claude Body = ${JSON.stringify(claudeBody, null, 2)}`);

        // Parse model suffixes in reverse stripping order:
        // 1) web search override: only trailing `-search`
        // 2) streaming override: trailing `-real` / `-fake` after any thinking suffix
        // 3) thinkingLevel override: trailing `-minimal` / `(minimal)` etc.
        // Combined user-facing suffix order: thinking -> streaming -> search
        const rawModel = claudeBody.model || "gemini-2.5-flash-lite";
        const { cleanModelName: searchStrippedModel, forceWebSearch: modelForceWebSearch } =
            FormatConverter.parseModelWebSearchSuffix(rawModel);
        const { cleanModelName: streamStrippedModel, streamingMode: modelStreamingMode } =
            FormatConverter.parseModelStreamingModeSuffix(searchStrippedModel);
        const { cleanModelName, thinkingLevel: modelThinkingLevel } =
            FormatConverter.parseModelThinkingLevel(streamStrippedModel);

        if (modelForceWebSearch) {
            this.logger.info(
                `[Adapter] Detected webSearch suffix in model name: "${rawModel}" -> model="${searchStrippedModel}", forceWebSearch=true`
            );
        }
        if (modelStreamingMode) {
            this.logger.info(
                `[Adapter] Detected streamingMode suffix in model name: "${searchStrippedModel}" -> model="${streamStrippedModel}", streamingMode="${modelStreamingMode}"`
            );
        }
        if (modelThinkingLevel) {
            this.logger.info(
                `[Adapter] Detected thinkingLevel suffix in model name: "${streamStrippedModel}" -> model="${cleanModelName}", thinkingLevel="${modelThinkingLevel}"`
            );
        }

        let systemInstruction = null;
        const googleContents = [];

        // Pre-scan messages to build a map of tool_use_id -> function_name
        // This is required because Gemini's functionResponse needs the original function name,
        // but Claude's tool_result only provides the tool_use_id.
        const toolIdToNameMap = new Map();
        if (claudeBody.messages && Array.isArray(claudeBody.messages)) {
            for (const message of claudeBody.messages) {
                if (message.role === "assistant" && Array.isArray(message.content)) {
                    for (const block of message.content) {
                        if (block.type === "tool_use" && block.id && block.name) {
                            toolIdToNameMap.set(block.id, block.name);
                        }
                    }
                }
            }
        }

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
                            } catch (e) {
                                /* eslint-disable-line no-unused-vars */
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

                        // Resolve function name using the map
                        const toolUseId = toolResult.tool_use_id;
                        let functionName = toolIdToNameMap.get(toolUseId);

                        if (!functionName) {
                            this.logger.warn(
                                `[Adapter] Warning: Tool name resolution failed for ID: ${toolUseId}. outputting as unknown_function`
                            );
                            functionName = "unknown_function";
                        }

                        pendingToolParts.push({
                            functionResponse: {
                                name: functionName,
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
            if (
                message.role !== "user" ||
                !Array.isArray(message.content) ||
                !message.content.some(block => block.type === "tool_result")
            ) {
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
                                    this.logger.info(
                                        `[Adapter] Successfully downloaded and converted image to base64.`
                                    );
                                } catch (error) {
                                    this.logger.error(`[Adapter] Failed to download image: ${error.message}`);
                                    googleParts.push({
                                        text: `[System Note: Failed to load image from ${source.url}]`,
                                    });
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

        // Handle thinking config from Claude's metadata or top-level thinking
        let thinkingConfig = null;

        const thinkingParam = claudeBody.thinking || claudeBody.metadata?.thinking;

        // Check if thinking is enabled:
        // 1. metadata style: { enabled: true }
        // 2. top-level style: { type: "enabled" }
        const isThinkingEnabled = thinkingParam && (thinkingParam.enabled === true || thinkingParam.type === "enabled");

        if (isThinkingEnabled) {
            thinkingConfig = { includeThoughts: true };
            if (thinkingParam.budget_tokens) {
                // Gemini doesn't have budget_tokens, but we can log it
                this.logger.debug(`[Adapter] Claude thinking budget_tokens: ${thinkingParam.budget_tokens}`);
            }
        }

        // Force thinking mode (only set includeThoughts=true when missing)
        if (this.serverSystem.forceThinking && (!thinkingConfig || thinkingConfig.includeThoughts === undefined)) {
            this.logger.info("[Adapter] ⚠️ Force thinking enabled, setting includeThoughts=true for Claude request.");
            thinkingConfig = { ...(thinkingConfig || {}), includeThoughts: true };
        }

        // Apply model name suffix thinkingLevel
        if (modelThinkingLevel) {
            if (!thinkingConfig) thinkingConfig = {};
            thinkingConfig.thinkingLevel = modelThinkingLevel;
        }

        if (thinkingConfig) {
            generationConfig.thinkingConfig = thinkingConfig;
            this.logger.info(
                `[Adapter] Successfully extracted and converted thinking config: ${JSON.stringify(thinkingConfig)}`
            );
        }

        // Handle Claude's structured output (output_format)
        // Ref: https://docs.anthropic.com/en/docs/build-with-claude/structured-outputs
        if (claudeBody.output_format) {
            if (claudeBody.output_format.type === "json_schema") {
                // Support both direct 'schema' (user example) and 'json_schema' wrapper (OpenAI style)
                let schema = claudeBody.output_format.schema;
                let schemaName = "structured_output";

                if (!schema && claudeBody.output_format.json_schema) {
                    schema = claudeBody.output_format.json_schema.schema;
                    schemaName = claudeBody.output_format.json_schema.name || schemaName;
                }

                if (schema) {
                    this.logger.debug(`[Adapter] Debug: Converting Claude JSON Schema: ${JSON.stringify(schema)}`);
                    generationConfig.responseMimeType = "application/json";
                    generationConfig.responseSchema = this._convertSchemaToGemini(schema, true);
                    this.logger.debug(
                        `[Adapter] Debug: Converted Gemini JSON Schema: ${JSON.stringify(generationConfig.responseSchema)}`
                    );
                    this.logger.info(
                        `[Adapter] Converted Claude output_format to Gemini responseSchema. Name: ${schemaName}`
                    );
                }
            } else if (claudeBody.output_format.type === "json_object") {
                generationConfig.responseMimeType = "application/json";
                this.logger.info(`[Adapter] Converted Claude output_format (json_object) to Gemini responseMimeType.`);
            } else if (claudeBody.output_format.type === "text") {
                generationConfig.responseMimeType = "text/plain";
            }
        }

        // Handle Claude's output_config (new format)
        if (claudeBody.output_config && claudeBody.output_config.format) {
            const format = claudeBody.output_config.format;
            if (format.type === "json_schema" && format.schema) {
                this.logger.debug(`[Adapter] Debug: Converting Claude JSON Schema: ${JSON.stringify(format.schema)}`);
                generationConfig.responseMimeType = "application/json";
                generationConfig.responseSchema = this._convertSchemaToGemini(format.schema, true);
                this.logger.debug(
                    `[Adapter] Debug: Converted Gemini JSON Schema: ${JSON.stringify(generationConfig.responseSchema)}`
                );
                this.logger.info(
                    `[Adapter] Converted Claude output_config to Gemini responseSchema. Title: ${format.schema.title || "untitled"}`
                );
            }
        }

        googleRequest.generationConfig = generationConfig;

        // Convert Claude tools to Gemini functionDeclarations
        if (claudeBody.tools && Array.isArray(claudeBody.tools) && claudeBody.tools.length > 0) {
            let hasWebSearchTool = false;
            let hasUrlContextTool = false;
            const functionDeclarations = [];

            for (const tool of claudeBody.tools) {
                // Handle specialized web search tool type (e.g. from Claude's search integration)
                if (tool.type === "web_search_20250305" && tool.name === "web_search") {
                    hasWebSearchTool = true;
                    this.logger.info(
                        `[Adapter] Detected web search tool in Claude request (name: ${tool.name}, type: ${tool.type}), mapping to Gemini googleSearch.`
                    );
                    continue; // Skip adding to functionDeclarations
                }

                // Handle specialized web fetch tool type, mapped to urlContext (Gemini 2.0 Feature)
                if (tool.type === "web_fetch_20250910" && tool.name === "web_fetch") {
                    hasUrlContextTool = true;
                    this.logger.info(
                        `[Adapter] Detected web fetch tool in Claude request (name: ${tool.name}, type: ${tool.type}), mapping to Gemini urlContext.`
                    );
                    continue; // Skip adding to functionDeclarations
                }

                if (tool.name) {
                    const declaration = { name: tool.name };
                    if (tool.description) declaration.description = tool.description;
                    if (tool.input_schema) {
                        declaration.parameters = this._convertSchemaToGemini(tool.input_schema);
                    }
                    functionDeclarations.push(declaration);
                }
            }

            if (functionDeclarations.length > 0) {
                googleRequest.tools = [{ functionDeclarations }];
                this.logger.info(`[Adapter] Converted ${functionDeclarations.length} Claude tool(s) to Gemini format`);
            }

            // If web search tool was found, ensure googleSearch is added to tools
            if (hasWebSearchTool) {
                if (!googleRequest.tools) googleRequest.tools = [];
                if (!FormatConverter.hasGeminiGoogleSearchTool(googleRequest.tools)) {
                    googleRequest.tools.push({ googleSearch: {} });
                }
            }

            // If web fetch tool was found, ensure urlContext is added to tools
            if (hasUrlContextTool) {
                if (!googleRequest.tools) googleRequest.tools = [];
                if (!FormatConverter.hasGeminiUrlContextTool(googleRequest.tools)) {
                    googleRequest.tools.push({ urlContext: {} });
                }
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

        // Handle Claude's disable_parallel_tool_use
        // Note: Gemini doesn't have a direct equivalent for this at the toolConfig level,
        // but we can log it for debug purposes. Future improvements might involve
        // filtering outputs if the model ignores the implied constraint.
        if (claudeBody.tool_choice && claudeBody.tool_choice.disable_parallel_tool_use === true) {
            this.logger.info(
                "[Adapter] Claude request specifies disable_parallel_tool_use=true (Note: Applied as best-effort in Gemini)."
            );
        }

        this._finalizeGoogleRequest(googleRequest, { forceWebSearch: modelForceWebSearch });
        this.logger.info("[Adapter] Claude to Google translation complete.");
        return { cleanModelName, googleRequest, modelStreamingMode };
    }

    /**
     * Convert Google streaming response chunk to Claude format
     * @param {string} googleChunk - The Google response chunk
     * @param {string} modelName - The model name
     * @param {object} streamState - State object to track streaming progress
     */
    translateGoogleToClaudeStream(googleChunk, modelName = "gemini-2.5-flash-lite", streamState = null) {
        this.logger.debug(`[Adapter] Debug: Received Google chunk for Claude: ${googleChunk}`);

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
            return null;
        }

        let googleResponse;
        try {
            googleResponse = JSON.parse(jsonString);
        } catch (e) {
            this.logger.warn(`[Adapter] Unable to parse Google JSON chunk for Claude: ${jsonString}`);
            return null;
        }

        const candidate = googleResponse.candidates?.[0];
        const usage = googleResponse.usageMetadata;

        // Update stream state with usage if available
        if (usage) {
            const inputTokens = (usage.promptTokenCount || 0) + (usage.toolUsePromptTokenCount || 0);
            const outputTokens = (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0);

            if (inputTokens > 0) streamState.inputTokens = inputTokens;
            streamState.outputTokens = outputTokens;
        }

        // Initialize stream state
        if (!streamState.messageId) {
            streamState.messageId = `msg_${this._generateRequestId()}`;
            streamState.contentBlockIndex = 0;
            if (!streamState.inputTokens) streamState.inputTokens = 0;
            if (!streamState.outputTokens) streamState.outputTokens = 0;
        }

        if (!candidate) {
            if (googleResponse.promptFeedback) {
                this.logger.warn(
                    `[Adapter] Google returned promptFeedback for Claude stream, may have been blocked: ${JSON.stringify(
                        googleResponse.promptFeedback
                    )}`
                );
            }
            return null;
        }

        const events = [];

        // Send message_start event once
        if (!streamState.messageStartSent) {
            events.push({
                message: {
                    content: [],
                    id: streamState.messageId,
                    model: modelName,
                    role: "assistant",
                    stop_reason: null,
                    stop_sequence: null,
                    type: "message",
                    usage: {
                        input_tokens: streamState.inputTokens || 0,
                        output_tokens: 0,
                    },
                },
                type: "message_start",
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
                            content_block: { thinking: "", type: "thinking" },
                            index: streamState.contentBlockIndex,
                            type: "content_block_start",
                        });
                        streamState.thinkingBlockStarted = true;
                        streamState.thinkingBlockIndex = streamState.contentBlockIndex;
                        streamState.contentBlockIndex++;
                    }
                    events.push({
                        delta: { thinking: part.text, type: "thinking_delta" },
                        index: streamState.thinkingBlockIndex,
                        type: "content_block_delta",
                    });
                } else if (part.text) {
                    // Regular text content
                    if (streamState.thinkingBlockStarted && !streamState.thinkingBlockStopped) {
                        events.push({
                            index: streamState.thinkingBlockIndex,
                            type: "content_block_stop",
                        });
                        streamState.thinkingBlockStopped = true;
                    }
                    if (!streamState.textBlockStarted) {
                        events.push({
                            content_block: { text: "", type: "text" },
                            index: streamState.contentBlockIndex,
                            type: "content_block_start",
                        });
                        streamState.textBlockStarted = true;
                        streamState.textBlockIndex = streamState.contentBlockIndex;
                        streamState.contentBlockIndex++;
                    }
                    events.push({
                        delta: { text: part.text, type: "text_delta" },
                        index: streamState.textBlockIndex,
                        type: "content_block_delta",
                    });
                } else if (part.inlineData) {
                    // Image output - convert to markdown image format for streaming
                    // Close thinking block if open
                    if (streamState.thinkingBlockStarted && !streamState.thinkingBlockStopped) {
                        events.push({
                            index: streamState.thinkingBlockIndex,
                            type: "content_block_stop",
                        });
                        streamState.thinkingBlockStopped = true;
                    }
                    // Start text block if not started
                    if (!streamState.textBlockStarted) {
                        events.push({
                            content_block: { text: "", type: "text" },
                            index: streamState.contentBlockIndex,
                            type: "content_block_start",
                        });
                        streamState.textBlockStarted = true;
                        streamState.textBlockIndex = streamState.contentBlockIndex;
                        streamState.contentBlockIndex++;
                    }
                    // Send image as markdown text delta
                    const imageMarkdown = `![Generated Image](data:${part.inlineData.mimeType};base64,${part.inlineData.data})`;
                    events.push({
                        delta: { text: imageMarkdown, type: "text_delta" },
                        index: streamState.textBlockIndex,
                        type: "content_block_delta",
                    });
                    this.logger.info("[Adapter] Successfully parsed image from streaming response chunk.");
                } else if (part.functionCall) {
                    // Tool use
                    const toolUseId = `toolu_${this._generateRequestId()}`;
                    events.push({
                        content_block: {
                            id: toolUseId,
                            input: {},
                            name: part.functionCall.name,
                            type: "tool_use",
                        },
                        index: streamState.contentBlockIndex,
                        type: "content_block_start",
                    });
                    events.push({
                        delta: {
                            partial_json: JSON.stringify(part.functionCall.args || {}),
                            type: "input_json_delta",
                        },
                        index: streamState.contentBlockIndex,
                        type: "content_block_delta",
                    });
                    events.push({
                        index: streamState.contentBlockIndex,
                        type: "content_block_stop",
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
                    index: streamState.textBlockIndex,
                    type: "content_block_stop",
                });
                streamState.textBlockStopped = true;
            }
            if (streamState.thinkingBlockStarted && !streamState.thinkingBlockStopped) {
                events.push({
                    index: streamState.thinkingBlockIndex,
                    type: "content_block_stop",
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
                delta: {
                    stop_reason: stopReason,
                    stop_sequence: null,
                },
                type: "message_delta",
                usage: {
                    output_tokens: streamState.outputTokens || 0,
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
        try {
            this.logger.debug(
                `[Adapter] Debug: Received Google response for Claude non-stream: ${JSON.stringify(googleResponse)}`
            );
        } catch (e) {
            this.logger.debug(
                `[Adapter] Debug: Received Google response for Claude non-stream (non-serializable): ${String(
                    googleResponse
                )}`
            );
        }

        const candidate = googleResponse.candidates?.[0];
        const usage = googleResponse.usageMetadata || {};

        const messageId = `msg_${this._generateRequestId()}`;
        const content = [];

        if (!candidate) {
            return {
                content: [{ text: "", type: "text" }],
                id: messageId,
                model: modelName,
                role: "assistant",
                stop_reason: "end_turn",
                stop_sequence: null,
                type: "message",
                usage: {
                    input_tokens: (usage.promptTokenCount || 0) + (usage.toolUsePromptTokenCount || 0),
                    // Match OpenAI logic: sum candidates tokens + thoughts tokens
                    output_tokens: (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0),
                },
            };
        }

        let hasToolUse = false;

        if (candidate.content && Array.isArray(candidate.content.parts)) {
            for (const part of candidate.content.parts) {
                if (part.thought === true && part.text) {
                    content.push({
                        thinking: part.text,
                        type: "thinking",
                    });
                } else if (part.text) {
                    content.push({
                        text: part.text,
                        type: "text",
                    });
                } else if (part.inlineData) {
                    // Image output - convert to base64 format
                    content.push({
                        text: `![Generated Image](data:${part.inlineData.mimeType};base64,${part.inlineData.data})`,
                        type: "text",
                    });
                } else if (part.functionCall) {
                    hasToolUse = true;
                    content.push({
                        id: `toolu_${this._generateRequestId()}`,
                        input: part.functionCall.args || {},
                        name: part.functionCall.name,
                        type: "tool_use",
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
            content: content.length > 0 ? content : [{ text: "", type: "text" }],
            id: messageId,
            model: modelName,
            role: "assistant",
            stop_reason: stopReason,
            stop_sequence: null,
            type: "message",
            usage: {
                input_tokens: (usage.promptTokenCount || 0) + (usage.toolUsePromptTokenCount || 0),
                // Match OpenAI logic: sum candidates tokens + thoughts tokens
                output_tokens: (usage.candidatesTokenCount || 0) + (usage.thoughtsTokenCount || 0),
            },
        };
    }

    // ==================== OpenAI Response API Format Conversion ====================

    /**
     * Convert OpenAI Response API request format to Google Gemini format
     * Response API uses different structure: input instead of messages, instructions instead of system message
     * @param {object} responseBody - OpenAI Response API format request body
     * @returns {Promise<{ googleRequest: object, cleanModelName: string, modelStreamingMode: ("real"|"fake"|null) }>}
     *          - modelStreamingMode: Streaming mode override parsed from model name suffix, or null
     */
    async translateOpenAIResponseToGoogle(responseBody) {
        this.logger.info("[Adapter] Starting translation of OpenAI Response API request format to Google format...");

        this.logger.debug(
            `[Adapter] Debug: incoming OpenAI Response API Body = ${JSON.stringify(responseBody, null, 2)}`
        );

        // Parse model suffixes in reverse stripping order:
        // 1) web search override: only trailing `-search`
        // 2) streaming override: trailing `-real` / `-fake` after any thinking suffix
        // 3) thinkingLevel override: trailing `-minimal` / `(minimal)` etc.
        // Combined user-facing suffix order: thinking -> streaming -> search
        const rawModel = responseBody.model || "gemini-2.5-flash-lite";
        const { cleanModelName: searchStrippedModel, forceWebSearch: modelForceWebSearch } =
            FormatConverter.parseModelWebSearchSuffix(rawModel);
        const { cleanModelName: streamStrippedModel, streamingMode: modelStreamingMode } =
            FormatConverter.parseModelStreamingModeSuffix(searchStrippedModel);
        const { cleanModelName, thinkingLevel: modelThinkingLevel } =
            FormatConverter.parseModelThinkingLevel(streamStrippedModel);

        if (modelForceWebSearch) {
            this.logger.info(
                `[Adapter] Detected webSearch suffix in model name: "${rawModel}" -> model="${searchStrippedModel}", forceWebSearch=true`
            );
        }
        if (modelStreamingMode) {
            this.logger.info(
                `[Adapter] Detected streamingMode suffix in model name: "${searchStrippedModel}" -> model="${streamStrippedModel}", streamingMode="${modelStreamingMode}"`
            );
        }
        if (modelThinkingLevel) {
            this.logger.info(
                `[Adapter] Detected thinkingLevel suffix in model name: "${streamStrippedModel}" -> model="${cleanModelName}", thinkingLevel="${modelThinkingLevel}"`
            );
        }

        const googleContents = [];
        let systemInstructionText = "";

        const safeParseJSON = (value, fallbackKey) => {
            if (value && typeof value === "object") {
                return value;
            }

            if (typeof value !== "string") {
                return { [fallbackKey]: value };
            }

            try {
                return JSON.parse(value || "{}");
            } catch (e) {
                this.logger.warn(`[Adapter] Failed to parse JSON for ${fallbackKey}: ${e.message}`);
                return { [fallbackKey]: value };
            }
        };

        const extractTextContent = content => {
            if (typeof content === "string") return content;
            if (!Array.isArray(content)) return "";
            return content
                .filter(c => c && typeof c === "object" && (c.type === "text" || c.type === "input_text"))
                .map(c => c.text)
                .filter(Boolean)
                .join("\n");
        };

        const instructions = responseBody.instructions;
        if (typeof instructions === "string") {
            systemInstructionText = instructions;
        } else if (Array.isArray(instructions)) {
            const systemItems = instructions.filter(
                item => item && typeof item === "object" && (item.role === "system" || item.role === "developer")
            );
            if (systemItems.length > 0) {
                const extraContent = systemItems
                    .map(item => extractTextContent(item.content))
                    .filter(Boolean)
                    .join("\n");
                if (extraContent) systemInstructionText = extraContent;
            }
        }

        const input = responseBody.input;

        if (Array.isArray(input)) {
            const systemItems = input.filter(
                item => item && typeof item === "object" && (item.role === "system" || item.role === "developer")
            );
            if (systemItems.length > 0) {
                const extraContent = systemItems
                    .map(item => extractTextContent(item.content))
                    .filter(t => t.length > 0)
                    .join("\n");

                if (extraContent) {
                    systemInstructionText = systemInstructionText
                        ? `${systemInstructionText}\n${extraContent}`
                        : extraContent;
                }
            }
        }

        let systemInstruction = null;
        if (systemInstructionText) {
            systemInstruction = {
                parts: [{ text: systemInstructionText }],
                // Keep consistent with other adapters: systemInstruction is sent as a separate instruction channel,
                // and Gemini API expects it to be encoded as a "user" role here.
                role: "user",
            };
        }

        if (typeof input === "string") {
            // Simple string input
            googleContents.push({
                parts: [{ text: input }],
                role: "user",
            });
        } else if (Array.isArray(input)) {
            // Array input - could be strings or message objects
            const callIdToName = {};
            for (const item of input) {
                if (
                    item &&
                    typeof item === "object" &&
                    item.type === "function_call" &&
                    typeof item.call_id === "string" &&
                    typeof item.name === "string"
                ) {
                    callIdToName[item.call_id] = item.name;
                }
            }

            for (const item of input) {
                if (typeof item === "string") {
                    // Array of strings
                    googleContents.push({
                        parts: [{ text: item }],
                        role: "user",
                    });
                } else if (item && typeof item === "object") {
                    if (item.role === "system" || item.role === "developer") {
                        continue;
                    }
                    // Handle different message types in Response API
                    if (item.type === "function_call") {
                        // Function call from model (assistant message with tool call)
                        const rawArgs =
                            item && typeof item === "object" && Object.prototype.hasOwnProperty.call(item, "arguments")
                                ? item["arguments"]
                                : undefined;
                        const functionCallPart = {
                            functionCall: {
                                args: safeParseJSON(rawArgs, "unparsed_arguments"),
                                name: item.name,
                            },
                            thoughtSignature: FormatConverter.DUMMY_THOUGHT_SIGNATURE,
                        };
                        googleContents.push({
                            parts: [functionCallPart],
                            role: "model",
                        });
                        this.logger.debug(
                            `[Adapter] Converted Response API function_call to Gemini functionCall: ${item.name}`
                        );
                    } else if (item.type === "function_call_output") {
                        // Function output (tool result from user)
                        const functionName =
                            item.name ||
                            (typeof item.call_id === "string" ? callIdToName[item.call_id] : undefined) ||
                            "unknown_function";
                        const functionResponsePart = {
                            functionResponse: {
                                name: functionName,
                                response: safeParseJSON(item.output, "unparsed_output"),
                            },
                        };
                        googleContents.push({
                            parts: [functionResponsePart],
                            role: "user",
                        });
                        this.logger.debug(
                            `[Adapter] Converted Response API function_call_output to Gemini functionResponse: ${item.name || "unknown"}`
                        );
                    } else {
                        // Regular message object with role and content
                        const googleParts = [];

                        if (typeof item.content === "string") {
                            googleParts.push({ text: item.content });
                        } else if (Array.isArray(item.content)) {
                            // Multi-modal content
                            for (const contentPart of item.content) {
                                if (contentPart.type === "text" || contentPart.type === "input_text") {
                                    googleParts.push({ text: contentPart.text });
                                } else if (contentPart.type === "image_url" || contentPart.type === "input_image") {
                                    const imageUrl = this.normalizeImageUrl(contentPart.image_url);
                                    if (!imageUrl) {
                                        this.logger.warn(
                                            "[Adapter] Skipping Response API image part because no string URL was provided."
                                        );
                                        googleParts.push({
                                            text: "[System Note: Skipped an image input because image_url was not a string URL]",
                                        });
                                        continue;
                                    }
                                    if (imageUrl.startsWith("data:")) {
                                        const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
                                        if (match) {
                                            googleParts.push({
                                                inlineData: {
                                                    data: match[2],
                                                    mimeType: match[1],
                                                },
                                            });
                                        }
                                    } else if (imageUrl.match(/^https?:\/\//)) {
                                        try {
                                            this.logger.info(`[Adapter] Downloading image from URL: ${imageUrl}`);
                                            const response = await axios.get(imageUrl, {
                                                responseType: "arraybuffer",
                                            });
                                            const imageBuffer = Buffer.from(response.data, "binary");
                                            const base64Data = imageBuffer.toString("base64");
                                            let mimeType = response.headers["content-type"];
                                            if (!mimeType || mimeType === "application/octet-stream") {
                                                mimeType = mime.lookup(imageUrl) || "image/jpeg";
                                            }
                                            googleParts.push({
                                                inlineData: {
                                                    data: base64Data,
                                                    mimeType,
                                                },
                                            });
                                        } catch (error) {
                                            this.logger.error(
                                                `[Adapter] Failed to download image from URL: ${imageUrl}`,
                                                error
                                            );
                                            googleParts.push({
                                                text: `[System Note: Failed to load image from ${imageUrl}]`,
                                            });
                                        }
                                    } else {
                                        this.logger.warn(
                                            `[Adapter] Skipping Response API image part because URL format is unsupported: ${imageUrl}`
                                        );
                                        googleParts.push({
                                            text: "[System Note: Skipped an image input because image_url format was unsupported]",
                                        });
                                    }
                                } else if (contentPart.type === "input_file") {
                                    this.logger.debug(
                                        "[Adapter] input_file content detected but not supported by Gemini, skipping..."
                                    );
                                }
                            }
                        }

                        if (googleParts.length > 0) {
                            googleContents.push({
                                parts: googleParts,
                                role: item.role === "assistant" ? "model" : "user",
                            });
                        }
                    }
                }
            }
        }

        // Build Google request
        const googleRequest = {
            contents: googleContents,
            ...(systemInstruction && {
                systemInstruction,
            }),
        };

        // Generation config
        const generationConfig = {
            maxOutputTokens: responseBody.max_output_tokens,
            temperature: responseBody.temperature,
            topP: responseBody.top_p,
        };

        // Handle reasoning config (for o-series models)
        const reasoning = responseBody.reasoning;
        let thinkingConfig = null;

        if (reasoning) {
            thinkingConfig = { includeThoughts: true };
        }

        // Force thinking mode (only set includeThoughts=true when missing)
        if (this.serverSystem.forceThinking && (!thinkingConfig || thinkingConfig.includeThoughts === undefined)) {
            this.logger.info(
                "[Adapter] ⚠️ Force thinking enabled, setting includeThoughts=true for OpenAI Response API request."
            );
            thinkingConfig = { ...(thinkingConfig || {}), includeThoughts: true };
        }

        // If model name suffix specifies thinkingLevel, override directly (highest priority)
        if (modelThinkingLevel) {
            if (!thinkingConfig) {
                thinkingConfig = {};
            }
            thinkingConfig.thinkingLevel = modelThinkingLevel;
            this.logger.info(`[Adapter] Applied thinkingLevel from model name suffix: ${modelThinkingLevel}`);
        }

        if (thinkingConfig) {
            generationConfig.thinkingConfig = thinkingConfig;
        }

        googleRequest.generationConfig = generationConfig;

        const toolChoice = responseBody.tool_choice;

        // Convert tools
        // `tool_choice: {type:"allowed_tools", tools:[...]}` can provide the effective tool set.
        let effectiveTools = responseBody.tools;
        if (
            toolChoice &&
            typeof toolChoice === "object" &&
            toolChoice.type === "allowed_tools" &&
            Array.isArray(toolChoice.tools) &&
            toolChoice.tools.length > 0
        ) {
            effectiveTools = toolChoice.tools;
        }

        const tools = effectiveTools;
        if (tools && Array.isArray(tools) && tools.length > 0) {
            const functionDeclarations = [];
            let hasWebSearch = false;

            for (const tool of tools) {
                if (tool.type === "web_search_preview" || tool.type === "web_search") {
                    hasWebSearch = true;
                } else if (tool.type === "file_search") {
                    this.logger.debug("[Adapter] file_search tool detected but not supported by Gemini, skipping...");
                } else if (tool.type === "computer_use_preview") {
                    this.logger.debug(
                        "[Adapter] computer_use_preview tool detected but not supported by Gemini, skipping..."
                    );
                } else if (tool.type === "function") {
                    // Custom function tool (Responses API: {type:"function", name, description, parameters})
                    // Also accept Chat Completions style: {type:"function", function:{name, description, parameters}}
                    const funcDef = tool.function && typeof tool.function === "object" ? tool.function : tool;
                    if (!funcDef || !funcDef.name) continue;
                    const declaration = {
                        name: funcDef.name,
                    };

                    if (funcDef.description) {
                        declaration.description = funcDef.description;
                    }

                    if (funcDef.parameters) {
                        declaration.parameters = this._convertSchemaToGemini(funcDef.parameters);
                    }
                    functionDeclarations.push(declaration);
                }
            }

            // Build tools array
            if (functionDeclarations.length > 0) {
                googleRequest.tools = [{ functionDeclarations }];
                this.logger.info(
                    `[Adapter] Converted ${functionDeclarations.length} OpenAI Response API tool(s) to Gemini format`
                );
            }

            if (hasWebSearch) {
                if (!googleRequest.tools) {
                    googleRequest.tools = [];
                }
                if (!FormatConverter.hasGeminiGoogleSearchTool(googleRequest.tools)) {
                    googleRequest.tools.push({ googleSearch: {} });
                    this.logger.info("[Adapter] Added googleSearch tool for OpenAI Response API web_search_preview");
                }
            }
        }

        // Handle tool_choice
        if (toolChoice) {
            const functionCallingConfig = {};

            const ensureGoogleSearchTool = () => {
                if (!googleRequest.tools) googleRequest.tools = [];
                if (!FormatConverter.hasGeminiGoogleSearchTool(googleRequest.tools)) {
                    googleRequest.tools.push({ googleSearch: {} });
                }
            };

            // tool_choice can be a mode string ("none"|"auto"|"required"),
            // or a tool selector (e.g. "web_search_preview") or an object (allowed_tools/custom/etc).
            if (typeof toolChoice === "string") {
                if (toolChoice === "auto") {
                    functionCallingConfig.mode = "AUTO";
                } else if (toolChoice === "none") {
                    functionCallingConfig.mode = "NONE";
                } else if (toolChoice === "required") {
                    functionCallingConfig.mode = "ANY";
                } else if (toolChoice === "web_search_preview" || toolChoice === "web_search") {
                    ensureGoogleSearchTool();
                } else if (toolChoice === "file_search" || toolChoice === "computer_use_preview") {
                    this.logger.debug(
                        `[Adapter] tool_choice forces unsupported hosted tool (${toolChoice}); ignoring.`
                    );
                } else {
                    this.logger.debug(
                        `[Adapter] Unsupported tool_choice for Responses API, ignoring: ${JSON.stringify(toolChoice)}`
                    );
                }
            } else if (typeof toolChoice === "object") {
                if (toolChoice.type === "allowed_tools") {
                    // Constrain available tools. We already used toolChoice.tools as effectiveTools above.
                    if (toolChoice.mode === "auto") {
                        functionCallingConfig.mode = "AUTO";
                    } else if (toolChoice.mode === "required") {
                        functionCallingConfig.mode = "ANY";
                    }

                    // If the allowed tool set includes functions, restrict to those names.
                    if (Array.isArray(tools)) {
                        const names = tools
                            .filter(
                                t => t && typeof t === "object" && t.type === "function" && typeof t.name === "string"
                            )
                            .map(t => t.name)
                            .filter(Boolean);
                        if (names.length > 0) {
                            functionCallingConfig.allowedFunctionNames = names;
                        }
                    }
                } else if (toolChoice.type === "custom") {
                    // Force a specific custom tool; map to Gemini "ANY" with allowed function name.
                    if (typeof toolChoice.name === "string" && toolChoice.name) {
                        functionCallingConfig.mode = "ANY";
                        functionCallingConfig.allowedFunctionNames = [toolChoice.name];
                    }
                } else if (toolChoice.type === "function") {
                    // Back-compat with Chat Completions style: { type:"function", name:"..." }
                    const funcName = toolChoice.name;
                    if (typeof funcName === "string" && funcName) {
                        functionCallingConfig.mode = "ANY";
                        functionCallingConfig.allowedFunctionNames = [funcName];
                    }
                } else if (toolChoice.type === "web_search_preview" || toolChoice.type === "web_search") {
                    ensureGoogleSearchTool();
                } else if (toolChoice.type === "file_search" || toolChoice.type === "computer_use_preview") {
                    this.logger.debug(
                        `[Adapter] tool_choice forces unsupported hosted tool (${toolChoice.type}); ignoring.`
                    );
                } else {
                    this.logger.debug(
                        `[Adapter] Unsupported tool_choice for Responses API, ignoring: ${JSON.stringify(toolChoice)}`
                    );
                }
            }

            if (Object.keys(functionCallingConfig).length > 0) {
                googleRequest.toolConfig = { functionCallingConfig };
                this.logger.debug(
                    `[Adapter] Converted tool_choice to Gemini toolConfig: ${JSON.stringify(functionCallingConfig)}`
                );
            }
        }

        // Handle text format (structured output)
        const textFormat = responseBody.text;
        if (textFormat && textFormat.format) {
            const formatType =
                typeof textFormat.format === "string" ? textFormat.format : textFormat.format?.type || null;

            if (formatType === "json_schema" && typeof textFormat.format === "object") {
                // Follow the official Response API shape:
                // text.format = { type: "json_schema", name, schema, strict }
                const jsonSchemaConfig = textFormat.format;
                const schema = jsonSchemaConfig.schema;
                if (schema) {
                    try {
                        const convertedSchema = this._convertSchemaToGemini(schema, true);
                        generationConfig.responseMimeType = "application/json";
                        generationConfig.responseSchema = convertedSchema;
                        this.logger.info(
                            `[Adapter] Converted OpenAI Response API text.format to Gemini responseSchema: ${jsonSchemaConfig.name || "unnamed"}`
                        );
                    } catch (error) {
                        this.logger.error(
                            `[Adapter] Failed to convert OpenAI Response API text.format schema: ${error.message}`,
                            error
                        );
                    }
                }
            } else if (formatType === "json_object") {
                generationConfig.responseMimeType = "application/json";
                this.logger.info(
                    "[Adapter] Set responseMimeType to application/json for OpenAI Response API json_object format"
                );
            }
        }

        this._finalizeGoogleRequest(googleRequest, { forceWebSearch: modelForceWebSearch });
        this.logger.info("[Adapter] OpenAI Response API to Google translation complete.");
        return { cleanModelName, googleRequest, modelStreamingMode };
    }
}

module.exports = FormatConverter;

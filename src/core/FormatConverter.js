/**
 * File: src/core/FormatConverter.js
 * Description: Format converter that translates between OpenAI and Google Gemini API request/response formats
 *
 * Author: Ellinav, iBenzene, bbbugg
 */

const axios = require("axios");
const mime = require("mime-types");
const { convertGeminiAudioResponse } = require("../utils/AudioUtils");

/**
 * Format Converter Module
 * Handles conversion between OpenAI and Google Gemini API formats
 */
class FormatConverter {
    static CLAUDE_CODE_EXECUTION_TOOL_TYPES = new Set([
        "code_execution_20250825",
        "code_execution_20260120",
        "code_execution_20260521",
    ]);

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
     * Parse trailing built-in tool suffixes from model name.
     * Tool suffixes may be chained at the end of the model name, for example:
     * `gemini-3-flash-preview-minimal-search-code`.
     *
     * @param {string} modelName - Original model name
     * @returns {{ cleanModelName: string, forceWebSearch: boolean, forceCodeExecution: boolean }}
     */
    static parseModelBuiltInToolSuffixes(modelName) {
        if (!modelName || typeof modelName !== "string") {
            return {
                cleanModelName: modelName,
                forceCodeExecution: false,
                forceWebSearch: false,
            };
        }

        let cleanModelName = modelName;
        let forceCodeExecution = false;
        let forceWebSearch = false;

        let match = cleanModelName.match(/^(.+)-(search|code)$/i);
        while (match) {
            cleanModelName = match[1];
            const suffix = match[2].toLowerCase();
            if (suffix === "code") {
                forceCodeExecution = true;
            } else {
                forceWebSearch = true;
            }
            match = cleanModelName.match(/^(.+)-(search|code)$/i);
        }

        return { cleanModelName, forceCodeExecution, forceWebSearch };
    }

    /**
     * Parse streaming mode suffix from model name.
     * Only matches a trailing `-real` or `-fake` (case-insensitive).
     * Callers should strip trailing built-in tool suffixes before invoking this helper, so the
     * combined suffix order remains: thinking -> streaming -> built-in tools.
     *
     * Examples:
     * - gemini-3-flash-preview-minimal-fake -> { cleanModelName: "gemini-3-flash-preview-minimal", streamingMode: "fake" }
     * - gemini-3-flash-preview(minimal)-fake -> { cleanModelName: "gemini-3-flash-preview(minimal)", streamingMode: "fake" }
     * - gemini-3-flash-preview-fake-minimal -> no match (thinking must come before streaming)
     * - gemini-3-flash-preview(minimal)-fake-search-code -> no direct match here; callers strip tool suffixes first
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

    getDefaultSafetySettings() {
        const threshold = this.serverSystem.config.safetySettingsThreshold || "OFF";
        return [
            { category: "HARM_CATEGORY_HARASSMENT", threshold },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold },
        ];
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

    _getGeminiPromptBlockMessage(promptFeedback) {
        const reason = promptFeedback?.blockReason;
        if (typeof reason !== "string" || !reason || reason === "BLOCK_REASON_UNSPECIFIED") return null;
        const detail = promptFeedback.blockReasonMessage;
        return `Gemini blocked the request (${reason}).${typeof detail === "string" && detail ? ` ${detail}` : ""}`;
    }

    // Shared media loading for Responses outputs and Claude images/documents.
    async _loadFunctionResponseMedia(contentPart, itemIndex, { functionResponse = true } = {}) {
        const supportedMimeTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain"]);
        const isImage = contentPart?.type === "input_image" || contentPart?.type === "image";
        const claudeSource = ["image", "document"].includes(contentPart?.type) ? contentPart.source : null;
        const source = claudeSource
            ? claudeSource.url
            : isImage
              ? this.normalizeImageUrl(contentPart.image_url)
              : contentPart?.file_data || contentPart?.file_url;

        let data;
        let mimeType;
        if (claudeSource?.type === "base64" || claudeSource?.type === "text") {
            if (typeof claudeSource.data !== "string" || !claudeSource.data) {
                this.logger.warn("[Adapter] Skipping Claude media with no data.");
                return null;
            }
            data =
                claudeSource.type === "text"
                    ? Buffer.from(claudeSource.data, "utf8").toString("base64")
                    : claudeSource.data;
            mimeType = claudeSource.media_type;
        } else if (typeof source !== "string" || !source) {
            this.logger.warn(
                `[Adapter] Skipping ${contentPart?.type || "unknown"} media because it has no supported data source.`
            );
            return null;
        } else if (source.startsWith("data:")) {
            const match = source.match(/^data:([^;,]+);base64,(.+)$/s);
            if (!match) {
                this.logger.warn("[Adapter] Skipping malformed media data URL.");
                return null;
            }
            [, mimeType, data] = match;
        } else if (/^https?:\/\//.test(source)) {
            try {
                const response = await axios.get(source, { responseType: "arraybuffer" });
                data = Buffer.from(response.data, "binary").toString("base64");
                mimeType = response.headers["content-type"]?.split(";", 1)[0];
                if (!mimeType || mimeType === "application/octet-stream") {
                    mimeType = mime.lookup(contentPart.filename || source) || undefined;
                }
            } catch (error) {
                this.logger.warn(`[Adapter] Failed to download media from ${source}: ${error.message}`);
                return null;
            }
        } else if (!claudeSource && !isImage && contentPart.file_data) {
            data = contentPart.file_data;
            mimeType = mime.lookup(contentPart.filename || "") || "application/octet-stream";
        } else {
            this.logger.warn("[Adapter] Skipping unsupported media URL.");
            return null;
        }

        if (!data) {
            this.logger.warn("[Adapter] Skipping empty media data.");
            return null;
        }
        if (!mimeType || (functionResponse && !supportedMimeTypes.has(mimeType))) {
            this.logger.warn(`[Adapter] Skipping media with unsupported MIME type: ${mimeType || "unknown"}`);
            return null;
        }

        const extension = mime.extension(mimeType);
        // Reference names are unique by output position; callers preserve original filenames/metadata.
        const displayName = `function-output-${itemIndex + 1}${extension ? `.${extension}` : ""}`;
        return { displayName, part: { inlineData: { data, displayName, mimeType } } };
    }

    async _convertClaudeToolResultMedia(content) {
        const parts = [];
        const convertBlocks = async blocks => {
            const converted = [];
            for (const block of blocks) {
                if (block?.type === "document" && block.source?.type === "content") {
                    const nestedContent = block.source.content;
                    converted.push({
                        ...block,
                        source: {
                            ...block.source,
                            content: Array.isArray(nestedContent) ? await convertBlocks(nestedContent) : nestedContent,
                        },
                    });
                } else if (block?.type === "image" || block?.type === "document") {
                    const media = await this._loadFunctionResponseMedia(block, parts.length);
                    if (media) {
                        const metadata = { ...block };
                        delete metadata.source;
                        converted.push({ ...metadata, content: { $ref: media.displayName } });
                        parts.push(media.part);
                    } else {
                        converted.push(block);
                    }
                } else {
                    converted.push(block);
                }
            }
            return converted;
        };
        return { content: await convertBlocks(content), parts };
    }

    /**
     * Gemini exposes a flat function namespace, while the Responses API can group
     * functions under a `namespace` tool. Build a stable Gemini-safe alias for a
     * namespaced function and keep enough metadata to restore the official
     * Responses `name` + `namespace` shape on the way back.
     *
     * Gemini function names are kept to ASCII letters, digits, and underscores
     * and capped at 64 characters. The hash makes aliases stable and prevents
     * equal inner function names in different namespaces from colliding.
     *
     * @param {string} namespace - Responses API namespace name
     * @param {string} functionName - Function name inside the namespace
     * @returns {string} Gemini-safe function name
     * @private
     */
    _encodeResponseNamespaceFunctionName(namespace, functionName) {
        const source = `${namespace}\u0000${functionName}`;
        let hash = 2166136261;
        for (let i = 0; i < source.length; i++) {
            hash ^= source.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        const hashText = (hash >>> 0).toString(36).padStart(7, "0").slice(-7);
        let readable = `ns_${namespace}__${functionName}`.replace(/[^A-Za-z0-9_]/g, "_");
        if (!/^[A-Za-z_]/.test(readable)) readable = `ns_${readable}`;
        const suffix = `_${hashText}`;
        return `${readable.slice(0, 64 - suffix.length)}${suffix}`;
    }

    /**
     * Collect Responses API function tools, including functions nested in
     * namespace tools, into Gemini's flat functionDeclarations representation.
     *
     * @param {Array<object>} tools - Responses API tools
     * @returns {{
     *   functionDeclarations: Array<object>,
     *   functionNameMap: Record<string, {name: string, namespace: string}>,
     *   namespaceAliasMap: Record<string, string>,
     *   namespaceFunctionCount: number
     * }} Flattened declarations and reversible name mappings
     * @private
     */
    _flattenResponseFunctionTools(tools) {
        const functionDeclarations = [];
        const functionNameMap = Object.create(null);
        const namespaceAliasMap = Object.create(null);
        const usedNames = new Set();
        let namespaceFunctionCount = 0;

        const addDeclaration = (funcDef, namespace = null, namespaceDescription = null) => {
            if (!funcDef || typeof funcDef.name !== "string" || !funcDef.name) return;

            let geminiName = funcDef.name;
            if (namespace) {
                geminiName = this._encodeResponseNamespaceFunctionName(namespace, funcDef.name);
            }

            if (usedNames.has(geminiName)) {
                this.logger.warn(
                    `[Adapter] Duplicate Responses API function name after namespace flattening, skipping: ${geminiName}`
                );
                return;
            }
            usedNames.add(geminiName);

            if (namespace || funcDef.type === "custom") {
                const mapKey = `${namespace}\u0000${funcDef.name}`;
                if (namespace) {
                    namespaceAliasMap[mapKey] = geminiName;
                    namespaceFunctionCount++;
                }
                functionNameMap[geminiName] = {
                    name: funcDef.name,
                    ...(namespace ? { namespace } : {}),
                    ...(funcDef.type === "custom" ? { type: "custom" } : {}),
                };
            }

            const declaration = { name: geminiName };
            const descriptionParts = [];
            if (namespace) descriptionParts.push(`Responses API namespace: ${namespace}.`);
            if (namespaceDescription) descriptionParts.push(namespaceDescription);
            if (funcDef.description) descriptionParts.push(funcDef.description);
            if (funcDef.type === "custom") {
                descriptionParts.push(
                    "Put the exact raw tool input in the input string. Do not add wrappers or Markdown fences to that string."
                );
                const format = funcDef.format;
                if (format?.type === "grammar") {
                    if (!["lark", "regex"].includes(format.syntax) || typeof format.definition !== "string") {
                        throw new Error(`Invalid custom tool grammar: ${funcDef.name}`);
                    }
                    descriptionParts.push(
                        `The input must conform to this ${format.syntax} grammar:\n${format.definition}`
                    );
                    this.logger.debug(
                        `[Adapter] Custom tool ${funcDef.name}: Gemini can only follow the grammar as instructions; constrained grammar decoding is unavailable.`
                    );
                } else if (format && format.type !== "text") {
                    throw new Error(`Unsupported custom tool format: ${format.type}`);
                }
                declaration.parametersJsonSchema = {
                    additionalProperties: false,
                    properties: { input: { type: "string" } },
                    required: ["input"],
                    type: "object",
                };
            }
            if (descriptionParts.length > 0) declaration.description = descriptionParts.join(" ");
            if (funcDef.type !== "custom" && funcDef.parameters) declaration.parametersJsonSchema = funcDef.parameters;
            functionDeclarations.push(declaration);
        };

        for (const tool of Array.isArray(tools) ? tools : []) {
            if (!tool || typeof tool !== "object") continue;
            if (tool.type === "function" || tool.type === "custom") {
                const funcDef = tool.function && typeof tool.function === "object" ? tool.function : tool;
                addDeclaration(funcDef);
            } else if (tool.type === "namespace" && typeof tool.name === "string" && Array.isArray(tool.tools)) {
                for (const nestedTool of tool.tools) {
                    if (!nestedTool || !["function", "custom"].includes(nestedTool.type)) continue;
                    const funcDef =
                        nestedTool.function && typeof nestedTool.function === "object"
                            ? nestedTool.function
                            : nestedTool;
                    addDeclaration(funcDef, tool.name, tool.description);
                }
            }
        }

        return { functionDeclarations, functionNameMap, namespaceAliasMap, namespaceFunctionCount };
    }

    _resolveResponseFunctionIdentity(name, functionNameMap) {
        if (functionNameMap && Object.prototype.hasOwnProperty.call(functionNameMap, name)) {
            return functionNameMap[name] || { name };
        }
        return { name };
    }

    /**
     * Resolve Responses API allowed_tools selectors against the full tool
     * definitions. Selectors only identify tools and do not carry schemas or
     * descriptions, so they must not be forwarded as declarations themselves.
     *
     * @param {Array<object>} tools - Full Responses API tool definitions
     * @param {Array<object>} selectors - tool_choice.tools selectors for allowed_tools
     * @returns {Array<object>} Selected full tool definitions
     * @private
     */
    _filterResponseToolsBySelectors(tools, selectors) {
        const definitions = Array.isArray(tools) ? tools : [];
        const allowedSelectors = Array.isArray(selectors)
            ? selectors.filter(selector => selector && typeof selector === "object")
            : [];

        const matchesSelector = (tool, selector, namespace = null) => {
            if (!tool || !selector || tool.type !== selector.type) return false;
            const toolName = tool.name ?? tool.function?.name;
            const selectorName = selector.name ?? selector.function?.name;
            if (toolName !== undefined && toolName !== selectorName) return false;
            if (toolName === undefined && selectorName !== undefined) return false;
            if (namespace !== null && selector.namespace !== namespace) return false;
            if (namespace === null && selector.namespace !== undefined) return false;
            if (selector.server_label !== undefined && tool.server_label !== selector.server_label) return false;
            return true;
        };

        const selectedTools = [];
        for (const tool of definitions) {
            if (!tool || typeof tool !== "object") continue;

            if (tool.type !== "namespace") {
                if (allowedSelectors.some(selector => matchesSelector(tool, selector))) {
                    selectedTools.push(tool);
                }
                continue;
            }

            if (allowedSelectors.some(selector => matchesSelector(tool, selector))) {
                selectedTools.push(tool);
                continue;
            }

            const nestedTools = Array.isArray(tool.tools)
                ? tool.tools.filter(nestedTool =>
                      allowedSelectors.some(selector => matchesSelector(nestedTool, selector, tool.name))
                  )
                : [];
            if (nestedTools.length > 0) {
                selectedTools.push({ ...tool, tools: nestedTools });
            }
        }

        return selectedTools;
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

    static hasGeminiCodeExecutionTool(tools) {
        return (
            Array.isArray(tools) &&
            tools.some(tool => FormatConverter.hasGeminiToolKey(tool, ["codeExecution", "code_execution"]))
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

    ensureServerSideToolInvocations(geminiBody) {
        const hasMixedTools = this.hasGeminiBuiltInTools(geminiBody) && this.hasGeminiFunctionDeclarations(geminiBody);
        if (!hasMixedTools && geminiBody?.toolConfig?.includeServerSideToolInvocations !== true) {
            return geminiBody;
        }

        if (
            !geminiBody.toolConfig ||
            typeof geminiBody.toolConfig !== "object" ||
            Array.isArray(geminiBody.toolConfig)
        ) {
            geminiBody.toolConfig = {};
        }

        if (geminiBody.toolConfig.includeServerSideToolInvocations !== true) {
            geminiBody.toolConfig.includeServerSideToolInvocations = true;
        }

        // Tool context circulation does not support AUTO. VALIDATED still allows
        // both natural language and tool calls; keep explicit NONE/ANY unchanged.
        const functionCallingConfig = geminiBody.toolConfig.functionCallingConfig;
        if (functionCallingConfig?.mode === "AUTO") {
            functionCallingConfig.mode = "VALIDATED";
        }

        return geminiBody;
    }

    /**
     * Copy a legacy Google Schema and normalize only schema-node Type enums.
     * Instance values (default/example/enum) and JSON Schema extensions remain untouched.
     */
    _normalizeGeminiSchemaTypes(schema) {
        if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
            return schema;
        }

        const normalized = { ...schema };
        if (typeof schema.type === "string") {
            normalized.type = schema.type.toUpperCase();
        }

        // Schema.properties is a map of names to schemas, not a schema itself.
        if (schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)) {
            normalized.properties = Object.fromEntries(
                Object.entries(schema.properties).map(([name, child]) => [
                    name,
                    this._normalizeGeminiSchemaTypes(child),
                ])
            );
        }
        if (schema.items) {
            normalized.items = this._normalizeGeminiSchemaTypes(schema.items);
        }
        for (const key of ["anyOf", "any_of"]) {
            if (Array.isArray(schema[key])) {
                normalized[key] = schema[key].map(child => this._normalizeGeminiSchemaTypes(child));
            }
        }

        return normalized;
    }

    /**
     * Normalize legacy parameter and response schemas in native Gemini tool declarations.
     * @param {object} geminiBody - Gemini format request body
     * @returns {object} - Modified request body with normalized tool schema types
     */
    sanitizeGeminiTools(geminiBody) {
        if (!geminiBody || !geminiBody.tools || !Array.isArray(geminiBody.tools)) {
            return geminiBody;
        }

        // Process each tool
        for (const tool of geminiBody.tools) {
            const declarations =
                Array.isArray(tool.functionDeclarations) && tool.functionDeclarations.length > 0
                    ? tool.functionDeclarations
                    : tool.function_declarations;
            if (declarations && Array.isArray(declarations)) {
                for (const funcDecl of declarations) {
                    if (!funcDecl || typeof funcDecl !== "object") continue;
                    for (const key of ["parameters", "response"]) {
                        if (funcDecl[key]) {
                            funcDecl[key] = this._normalizeGeminiSchemaTypes(funcDecl[key]);
                        }
                    }
                }
            }
        }

        return geminiBody;
    }

    /**
     * Normalize type values in a native Gemini responseSchema to Google's Type enum values.
     * @param {object} geminiBody - Gemini format request body
     * @returns {object} - Modified request body with normalized responseSchema types
     */
    normalizeGeminiResponseSchema(geminiBody) {
        const responseSchema = geminiBody?.generationConfig?.responseSchema;
        if (!responseSchema || typeof responseSchema !== "object") {
            return geminiBody;
        }

        geminiBody.generationConfig.responseSchema = this._normalizeGeminiSchemaTypes(responseSchema);
        return geminiBody;
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
        // 1) built-in tool overrides: trailing `-search` / `-code`
        // 2) streaming override: trailing `-real` / `-fake` after any thinking suffix
        // 3) thinkingLevel override: trailing `-minimal` / `(minimal)` etc.
        // Combined user-facing suffix order: thinking -> streaming -> built-in tools
        const rawModel = openaiBody.model || "gemini-flash-lite-latest";
        const {
            cleanModelName: toolStrippedModel,
            forceCodeExecution: modelForceCodeExecution,
            forceWebSearch: modelForceWebSearch,
        } = FormatConverter.parseModelBuiltInToolSuffixes(rawModel);
        const { cleanModelName: streamStrippedModel, streamingMode: modelStreamingMode } =
            FormatConverter.parseModelStreamingModeSuffix(toolStrippedModel);
        const { cleanModelName, thinkingLevel: modelThinkingLevel } =
            FormatConverter.parseModelThinkingLevel(streamStrippedModel);

        const modelForceToolFlags = [];
        if (modelForceWebSearch) modelForceToolFlags.push("forceWebSearch=true");
        if (modelForceCodeExecution) modelForceToolFlags.push("forceCodeExecution=true");
        if (modelForceToolFlags.length > 0) {
            this.logger.info(
                `[Adapter] Detected built-in tool suffixes in model name: "${rawModel}" -> model="${toolStrippedModel}", ${modelForceToolFlags.join(", ")}`
            );
        }
        if (modelStreamingMode) {
            this.logger.info(
                `[Adapter] Detected streamingMode suffix in model name: "${toolStrippedModel}" -> model="${streamStrippedModel}", streamingMode="${modelStreamingMode}"`
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

        // OpenAI tool-result messages identify the function call by `tool_call_id`;
        // they do not carry the function name. Resolve that name from the preceding
        // assistant tool call so the Gemini functionCall/functionResponse pair keeps
        // the same name and id, including for parallel calls.
        const toolCallIdToName = new Map();
        for (const message of conversationMessages) {
            if (message.role !== "assistant" || !Array.isArray(message.tool_calls)) continue;
            for (const toolCall of message.tool_calls) {
                const toolCallId = toolCall?.id;
                const functionName = toolCall?.function?.name;
                if (typeof toolCallId === "string" && toolCallId && typeof functionName === "string" && functionName) {
                    toolCallIdToName.set(toolCallId, functionName);
                }
            }
        }

        // Buffer for accumulating consecutive tool message parts
        // Gemini requires alternating roles, so consecutive tool messages must be merged
        let pendingToolParts = [];

        let pendingModelParts = [];
        const flushModelParts = () => {
            if (pendingModelParts.length > 0) {
                googleContents.push({ parts: pendingModelParts, role: "model" });
                pendingModelParts = [];
            }
        };

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
            if (message.role !== "assistant") flushModelParts();

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

                // Gemini requires an object even when valid JSON parses to a primitive or null.
                if (responseContent === null || typeof responseContent !== "object" || Array.isArray(responseContent)) {
                    responseContent = { result: responseContent };
                }

                const toolCallId =
                    typeof message.tool_call_id === "string" && message.tool_call_id ? message.tool_call_id : null;
                const functionName = message.name || (toolCallId ? toolCallIdToName.get(toolCallId) : null);
                if (!functionName) {
                    this.logger.warn(
                        `[Adapter] Unable to resolve function name for OpenAI tool result (tool_call_id: ${toolCallId || "missing"}), using unknown_function`
                    );
                }

                // Add to buffer instead of pushing directly
                // This allows merging consecutive tool messages into one user message
                // Note: functionResponse does NOT need thoughtSignature per official docs
                const functionResponsePart = {
                    functionResponse: {
                        ...(toolCallId ? { id: toolCallId } : {}),
                        name: functionName || "unknown_function",
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
                                ...(typeof toolCall.id === "string" && toolCall.id ? { id: toolCall.id } : {}),
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
                if (message.role === "assistant") {
                    pendingModelParts.push(...googleParts);
                } else {
                    googleContents.push({ parts: googleParts, role: "user" });
                }
            }
        }

        // Flush any remaining tool parts after the loop
        flushModelParts();
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
        if (
            this.serverSystem.config.forceThinking &&
            (!thinkingConfig || thinkingConfig.includeThoughts === undefined)
        ) {
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
                        declaration.parametersJsonSchema = funcDef.parameters;
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
            const hasFunctionDeclarations = this.hasGeminiFunctionDeclarations(googleRequest);

            if (toolChoice === "auto" && hasFunctionDeclarations) {
                functionCallingConfig.mode = "AUTO";
            } else if (toolChoice === "none" && hasFunctionDeclarations) {
                functionCallingConfig.mode = "NONE";
            } else if (toolChoice === "required" && hasFunctionDeclarations) {
                functionCallingConfig.mode = "ANY";
            } else if (typeof toolChoice === "object" && toolChoice.type === "allowed_tools") {
                // Chat nests the mode/selectors under allowed_tools; Responses uses a flat shape.
                const allowedTools = toolChoice.allowed_tools;
                if (!allowedTools || !["auto", "required"].includes(allowedTools.mode)) {
                    throw new Error("Chat allowed_tools requires an auto or required mode.");
                }
                if (!Array.isArray(allowedTools.tools)) {
                    throw new Error("Chat allowed_tools requires a tools array.");
                }
                const declaredNames = new Set(
                    (googleRequest.tools || []).flatMap(tool =>
                        (tool.functionDeclarations || []).map(declaration => declaration.name)
                    )
                );
                const allowedNames = [];
                for (const selector of allowedTools.tools) {
                    const name = selector?.type === "function" ? selector.function?.name : undefined;
                    if (typeof name !== "string" || !declaredNames.has(name)) {
                        throw new Error("Chat allowed_tools must select declared function tools.");
                    }
                    if (!allowedNames.includes(name)) allowedNames.push(name);
                }
                if (allowedNames.length === 0) {
                    if (allowedTools.mode === "required") {
                        throw new Error("Chat allowed_tools required mode needs at least one function.");
                    }
                    functionCallingConfig.mode = "NONE";
                } else {
                    functionCallingConfig.mode = allowedTools.mode === "required" ? "ANY" : "VALIDATED";
                    functionCallingConfig.allowedFunctionNames = allowedNames;
                }
            } else if (typeof toolChoice === "object" && hasFunctionDeclarations) {
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
        // Pass the JSON Schema through without converting its types or constraints.
        const responseFormat = openaiBody.response_format;
        if (responseFormat) {
            if (responseFormat.type === "json_schema" && responseFormat.json_schema) {
                // Extract schema from OpenAI format
                const jsonSchema = responseFormat.json_schema;
                const schema = jsonSchema.schema;

                if (schema !== undefined && schema !== null) {
                    generationConfig.responseFormat = { text: { mimeType: "APPLICATION_JSON", schema } };
                    this.logger.info(
                        `[Adapter] Forwarded OpenAI response_format as Gemini responseFormat.text.schema: ${jsonSchema.name || "unnamed"}`
                    );
                }
            } else if (responseFormat.type === "json_object") {
                // MIME alone may not constrain output on the AI Studio path; allow arbitrary object properties.
                generationConfig.responseFormat = {
                    text: { mimeType: "APPLICATION_JSON", schema: { additionalProperties: true, type: "object" } },
                };
                this.logger.info("[Adapter] Enabled JSON object mode with an open object schema");
            } else if (responseFormat.type === "text") {
                // Explicit text mode (default behavior, no action needed)
                this.logger.debug("[Adapter] Response format set to text (default)");
            } else {
                this.logger.warn(`[Adapter] Unsupported response_format type: ${responseFormat.type}. Ignoring.`);
            }
        }

        this._finalizeGoogleRequest(googleRequest, {
            forceCodeExecution: modelForceCodeExecution,
            forceWebSearch: modelForceWebSearch,
        });
        this.logger.info("[Adapter] OpenAI to Google translation complete.");
        return { cleanModelName, googleRequest, modelStreamingMode };
    }

    /**
     * Convert OpenAI embeddings request format to Google's OpenAI-compatible embeddings endpoint.
     * @param {object} openaiBody - OpenAI embeddings request body
     * @returns {{ googleRequest: object, cleanModelName: string|null, path: string }}
     */
    translateOpenAIEmbeddingsToGoogle(openaiBody) {
        this.logger.debug(
            "[Adapter] Starting translation of OpenAI embeddings request format to Google OpenAI-compatible format..."
        );

        const googleRequest = openaiBody && typeof openaiBody === "object" ? openaiBody : {};
        const rawModelName = typeof googleRequest.model === "string" ? googleRequest.model : null;
        const cleanModelName = rawModelName ? rawModelName.replace(/^models\//, "") : null;
        const path = "/v1beta/openai/embeddings";

        this.logger.debug(
            `[Adapter] Debug: incoming OpenAI Embeddings Body = ${JSON.stringify(googleRequest, null, 2)}`
        );
        this.logger.debug(`[Adapter] Debug: Final Google OpenAI-compatible Embeddings Path = ${path}`);
        this.logger.debug("[Adapter] OpenAI embeddings to Google OpenAI-compatible translation complete.");

        return { cleanModelName, googleRequest, path };
    }

    /**
     * Convert an OpenAI speech request into Gemini native TTS format.
     * Only WAV and raw PCM responses are supported because Gemini returns PCM and this
     * project does not include a lossy audio encoder.
     *
     * @param {object} openaiBody - OpenAI speech request body
     * @returns {{ cleanModelName: string, googleRequest: object, responseFormat: "wav"|"pcm" }}
     */
    translateOpenAISpeechToGoogle(openaiBody) {
        if (!openaiBody || typeof openaiBody !== "object" || Array.isArray(openaiBody)) {
            throw new Error("Request body must be a JSON object.");
        }

        const requiredStringFields = ["model", "input", "voice"];
        for (const field of requiredStringFields) {
            if (typeof openaiBody[field] !== "string" || openaiBody[field].trim().length === 0) {
                throw new Error(`Missing required parameter: '${field}'.`);
            }
        }

        const supportedFields = new Set(["input", "model", "response_format", "voice"]);
        const unsupportedFields = Object.keys(openaiBody).filter(field => !supportedFields.has(field));
        if (unsupportedFields.length > 0) {
            const fieldList = unsupportedFields.map(field => `'${field}'`).join(", ");
            throw new Error(`Unsupported parameter${unsupportedFields.length === 1 ? "" : "s"}: ${fieldList}.`);
        }

        const responseFormat = openaiBody.response_format === undefined ? "wav" : openaiBody.response_format;
        if (typeof responseFormat !== "string" || !["pcm", "wav"].includes(responseFormat.toLowerCase())) {
            const requestedFormat = typeof responseFormat === "string" ? responseFormat : typeof responseFormat;
            throw new Error(
                `Unsupported response_format '${requestedFormat}'. Supported response formats are 'wav' and 'pcm'.`
            );
        }

        const cleanModelName = openaiBody.model.trim().replace(/^models\//, "");
        if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(cleanModelName)) {
            throw new Error("Invalid 'model': expected a Gemini model name without path or query parameters.");
        }

        const googleRequest = {
            contents: [
                {
                    parts: [{ text: openaiBody.input }],
                    role: "user",
                },
            ],
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: {
                            voiceName: openaiBody.voice.trim(),
                        },
                    },
                },
            },
        };

        this.logger.info(`[Adapter] OpenAI speech request translated for model "${cleanModelName}".`);
        return {
            cleanModelName,
            googleRequest,
            responseFormat: responseFormat.toLowerCase(),
        };
    }

    /**
     * Decode Gemini inline audio and convert it to the requested OpenAI speech format.
     *
     * @param {object} googleResponse - Gemini generateContent response
     * @param {"wav"|"pcm"} responseFormat - Validated output format
     * @returns {{ audioBuffer: Buffer, contentType: string }}
     */
    convertGoogleToOpenAISpeech(googleResponse, responseFormat) {
        return convertGeminiAudioResponse(googleResponse, responseFormat);
    }

    /**
     * Common final processing for Gemini requests:
     * 1. Inject force features (Search, URL Context)
     * 2. Apply safety settings
     * 3. Log final request body
     * @param {object} googleRequest - The Gemini request object to finalize
     * @param {object} [options={}] - Per-request tool injection overrides.
     * @param {boolean} [options.forceCodeExecution] - When truthy, force-enable `codeExecution` for this request
     * even if `config.forceCodeExecution` is disabled.
     * @param {boolean} [options.forceWebSearch] - When truthy, force-enable `googleSearch` for this request even
     * if `config.forceWebSearch` is disabled. Falsy values fall back to the global setting. Current callers
     * use this for model-name-driven overrides such as the `-search` suffix.
     * @param {boolean} [options.forceUrlContext] - When truthy, force-enable `urlContext` for this request even if
     * `config.forceUrlContext` is disabled. Falsy values fall back to the global setting.
     * @private
     */
    _finalizeGoogleRequest(googleRequest, options = {}) {
        const forceCodeExecution = options.forceCodeExecution || this.serverSystem.config.forceCodeExecution;
        const forceWebSearch = options.forceWebSearch || this.serverSystem.config.forceWebSearch;
        const forceUrlContext = options.forceUrlContext || this.serverSystem.config.forceUrlContext;

        // Force built-in tools
        if (forceWebSearch || forceUrlContext || forceCodeExecution) {
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

            // Handle Code Execution
            if (forceCodeExecution) {
                const hasCodeExecution = FormatConverter.hasGeminiCodeExecutionTool(googleRequest.tools);
                if (!hasCodeExecution) {
                    googleRequest.tools.push({ codeExecution: {} });
                    toolsToAdd.push("codeExecution");
                }
            }

            if (toolsToAdd.length > 0) {
                this.logger.info(`[Adapter] ⚠️ Force features enabled, injecting tools: [${toolsToAdd.join(", ")}]`);
            }
        }

        this.ensureServerSideToolInvocations(googleRequest);

        // Safety settings
        googleRequest.safetySettings = this.getDefaultSafetySettings();

        this.logger.debug(`[Adapter] Debug: Final Gemini Request = ${JSON.stringify(googleRequest, null, 2)}`);
    }

    /**
     * Convert Google streaming response chunk to OpenAI format
     * @param {string} googleChunk - The Google response chunk
     * @param {string} modelName - The model name
     * @param {object} streamState - Optional state object to track thought mode
     */
    translateGoogleToOpenAIStream(googleChunk, modelName = "gemini-flash-lite-latest", streamState = null) {
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
                    const toolCallId =
                        typeof funcCall.id === "string" && funcCall.id
                            ? funcCall.id
                            : `call_${this._generateRequestId()}`;

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
    translateGoogleToResponseAPIStream(googleChunk, modelName = "gemini-flash-lite-latest", streamState = null) {
        this.logger.debug(`[Adapter] Debug: Received Google chunk for Response API: ${googleChunk}`);

        // Ensure streamState exists
        if (!streamState) {
            this.logger.warn("[Adapter] streamState not provided, creating default state.");
            streamState = {};
        }

        if (streamState.completed || !googleChunk || googleChunk.trim() === "") {
            return null;
        }

        const eventsToSend = [];

        const pushEvent = (eventType, payload) => {
            // sequence_number is zero-based and increases once per emitted event.
            if (!Number.isInteger(streamState.sequenceNumber)) streamState.sequenceNumber = -1;
            streamState.sequenceNumber++;

            // The Responses function-calling stream documents response_id on argument
            // events and on output-item events whose item is a function_call. Generic
            // text/reasoning output events do not carry this top-level field.
            const isFunctionCallEvent =
                eventType === "response.function_call_arguments.delta" ||
                eventType === "response.function_call_arguments.done" ||
                ((eventType === "response.output_item.added" || eventType === "response.output_item.done") &&
                    payload?.item?.type === "function_call");

            const eventPayload = {
                ...payload,
                ...(isFunctionCallEvent ? { response_id: streamState.id } : {}),
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
            streamState.webSearchCallsByGoogleId = Object.create(null);
            streamState.webSearchCallOrder = [];
            streamState.hasNativeUrlContext = false;
            streamState.openPageCallsByGoogleId = Object.create(null);
            streamState.urlContextUrls = [];
            streamState.messageAnnotations = [];
            streamState.messageAnnotationKeys = Object.create(null);
            streamState.messagePartRanges = new Map();
            streamState.groundingChunks = [];
            streamState.groundingSupports = [];
            streamState.webSearchQueries = [];
            streamState.codeInterpreterCalls = [];
            streamState.codeInterpreterContainerId = null;
            streamState.completed = false;
        };

        // include controls conversion but is a request field, not a Response field.
        const { include: responseInclude, ...responseFields } = streamState.responseDefaults || {};
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
            ...responseFields,
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
                    logprobs: [],
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

        const includeWebSearchSources =
            Array.isArray(responseInclude) && responseInclude.includes("web_search_call.action.sources");
        const includeCodeInterpreterOutputs =
            Array.isArray(responseInclude) && responseInclude.includes("code_interpreter_call.outputs");

        const getCodeInterpreterContainerId = () => {
            if (streamState.codeInterpreterContainerId) return streamState.codeInterpreterContainerId;
            const requestedContainer = responseFields.tools?.find(tool => tool?.type === "code_interpreter")?.container;
            streamState.codeInterpreterContainerId =
                typeof requestedContainer === "string" && requestedContainer
                    ? requestedContainer
                    : `cntr_${this._generateRequestId()}`;
            return streamState.codeInterpreterContainerId;
        };

        const ensureCodeInterpreterCall = (googleCallId, code = "") => {
            const existing =
                typeof googleCallId === "string" && googleCallId
                    ? streamState.codeInterpreterCalls.find(call => call.google_call_id === googleCallId)
                    : null;
            if (existing) {
                if (!existing.code && typeof code === "string") existing.code = code;
                return existing;
            }

            const call = {
                code: typeof code === "string" ? code : "",
                google_call_id: typeof googleCallId === "string" ? googleCallId : null,
                id: `ci_${this._generateRequestId()}`,
                output_index: streamState.nextOutputIndex++,
                status: "in_progress",
            };
            streamState.codeInterpreterCalls.push(call);
            return call;
        };

        const findCodeInterpreterCall = googleCallId => {
            if (typeof googleCallId === "string" && googleCallId) {
                const matched = streamState.codeInterpreterCalls.find(call => call.google_call_id === googleCallId);
                if (matched) return matched;
            }
            return streamState.codeInterpreterCalls.find(call => call.status === "in_progress") || null;
        };

        const completeCodeInterpreterCall = (call, executionResult = null, forcedStatus = null) => {
            if (!call || call.status !== "in_progress") return;
            const outcome = String(executionResult?.outcome || "");
            const output = typeof executionResult?.output === "string" ? executionResult.output : "";
            const outputs = output ? [{ logs: output, type: "logs" }] : [];
            const status = forcedStatus || (outcome && outcome !== "OUTCOME_OK" ? "failed" : "completed");
            const completedItem = {
                code: call.code || null,
                container_id: getCodeInterpreterContainerId(),
                id: call.id,
                outputs: includeCodeInterpreterOutputs ? outputs : null,
                status,
                type: "code_interpreter_call",
            };
            call.status = status;
            streamState.outputItemsByIndex[call.output_index] = completedItem;
            pushEvent("response.output_item.added", {
                item: completedItem,
                output_index: call.output_index,
            });
            pushEvent("response.output_item.done", {
                item: completedItem,
                output_index: call.output_index,
            });
        };

        const ensureWebSearchCall = (googleCallId, queries = []) => {
            const normalizedQueries = this._normalizeWebSearchQueries(queries);
            const lookupKey =
                typeof googleCallId === "string" && googleCallId
                    ? googleCallId
                    : streamState.webSearchCallOrder[0] || `grounding_${this._generateRequestId()}`;
            const existing = streamState.webSearchCallsByGoogleId[lookupKey];

            if (existing) {
                if (
                    existing.status !== "completed" &&
                    normalizedQueries.length > 0 &&
                    (existing.action.queries || []).length === 0
                ) {
                    existing.action.queries = normalizedQueries;
                }
                return existing;
            }

            const outputIndex = streamState.nextOutputIndex++;
            const searchCall = {
                action: {
                    ...(normalizedQueries.length > 0 ? { queries: normalizedQueries } : {}),
                    type: "search",
                },
                google_call_id: lookupKey,
                id: `ws_${this._generateRequestId()}`,
                output_index: outputIndex,
                status: "in_progress",
            };

            streamState.webSearchCallsByGoogleId[lookupKey] = searchCall;
            streamState.webSearchCallOrder.push(lookupKey);

            const item = {
                action: searchCall.action,
                id: searchCall.id,
                status: "in_progress",
                type: "web_search_call",
            };
            streamState.outputItemsByIndex[outputIndex] = item;

            pushEvent("response.output_item.added", {
                item,
                output_index: outputIndex,
            });
            pushEvent("response.web_search_call.in_progress", {
                item_id: searchCall.id,
                output_index: outputIndex,
            });
            pushEvent("response.web_search_call.searching", {
                item_id: searchCall.id,
                output_index: outputIndex,
            });

            return searchCall;
        };

        const completeWebSearchCall = searchCall => {
            if (!searchCall || searchCall.status === "completed") return;

            if (includeWebSearchSources && searchCall.action.type === "search") {
                // Gemini reports sources in response-level grounding metadata, which
                // can arrive after the native tool response. Finalize only once all
                // chunks have arrived so output_item.done matches response.completed.
                searchCall.action.sources = this._extractResponseWebSearchSources(streamState.groundingChunks);
            }
            searchCall.status = "completed";
            const completedItem = {
                action: searchCall.action,
                id: searchCall.id,
                status: "completed",
                type: "web_search_call",
            };
            streamState.outputItemsByIndex[searchCall.output_index] = completedItem;

            pushEvent("response.web_search_call.completed", {
                item_id: searchCall.id,
                output_index: searchCall.output_index,
            });
            pushEvent("response.output_item.done", {
                item: completedItem,
                output_index: searchCall.output_index,
            });
        };

        const findWebSearchCall = googleCallId => {
            if (typeof googleCallId === "string" && googleCallId) {
                return streamState.webSearchCallsByGoogleId[googleCallId] || null;
            }

            const lastKey = streamState.webSearchCallOrder[streamState.webSearchCallOrder.length - 1];
            return lastKey ? streamState.webSearchCallsByGoogleId[lastKey] : null;
        };

        const addOpenPageCall = url => {
            const call = {
                action: { type: "open_page", url },
                id: `ws_${this._generateRequestId()}`,
                output_index: streamState.nextOutputIndex++,
                status: "in_progress",
            };
            const item = {
                action: call.action,
                id: call.id,
                status: call.status,
                type: "web_search_call",
            };
            streamState.outputItemsByIndex[call.output_index] = item;
            pushEvent("response.output_item.added", { item, output_index: call.output_index });
            pushEvent("response.web_search_call.in_progress", {
                item_id: call.id,
                output_index: call.output_index,
            });
            return call;
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
            const annotations = streamState.messageAnnotations || [];

            pushEvent("response.output_text.done", {
                content_index: contentIndex,
                item_id: itemId,
                logprobs: [],
                output_index: outputIndex,
                text: finalText,
            });

            pushEvent("response.content_part.done", {
                content_index: contentIndex,
                item_id: itemId,
                output_index: outputIndex,
                part: {
                    annotations,
                    logprobs: [],
                    text: finalText,
                    type: "output_text",
                },
            });

            const completedItem = {
                content: [
                    {
                        annotations,
                        logprobs: [],
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
            if (streamState.completed) return;
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
                const message = this._getGeminiPromptBlockMessage(googleResponse?.promptFeedback);
                if (message) {
                    streamState.error = { code: "invalid_prompt", message };
                    pushEvent("error", { ...streamState.error, param: null });
                    streamState.completed = true;
                }
                return;
            }

            const candidateParts = Array.isArray(candidate.content?.parts) ? candidate.content.parts : [];
            const candidatePartRanges = new Map();
            let candidateTextOffset = streamState.messageText.length;
            let imageNoticePending = !streamState.imageOutputSuppressedNoticeSent;
            for (let partIndex = 0; partIndex < candidateParts.length; partIndex++) {
                const part = candidateParts[partIndex];
                if (part?.thought === true) continue;
                if (typeof part?.text === "string" && part.text) {
                    const currentPartRange = {
                        startIndex: candidateTextOffset,
                        text: part.text,
                    };
                    candidatePartRanges.set(partIndex, currentPartRange);
                    const accumulatedPartRange = streamState.messagePartRanges.get(partIndex);
                    if (
                        accumulatedPartRange &&
                        accumulatedPartRange.startIndex + accumulatedPartRange.text.length === candidateTextOffset
                    ) {
                        accumulatedPartRange.text += part.text;
                    } else {
                        streamState.messagePartRanges.set(partIndex, { ...currentPartRange });
                    }
                    candidateTextOffset += part.text.length;
                } else if (part?.inlineData && imageNoticePending) {
                    candidateTextOffset +=
                        "[Image output omitted: Responses API image outputs are disabled by this proxy.]".length;
                    imageNoticePending = false;
                }
            }

            const candidateGrounding = candidate.groundingMetadata;
            if (candidateGrounding) {
                if (Array.isArray(candidateGrounding.groundingChunks)) {
                    streamState.groundingChunks.push(...candidateGrounding.groundingChunks);
                }
                if (Array.isArray(candidateGrounding.groundingSupports)) {
                    streamState.groundingSupports.push(
                        ...candidateGrounding.groundingSupports.map(support => ({
                            ...support,

                            _responseTextChunkRange: candidatePartRanges.get(support?.segment?.partIndex),
                            // Snapshot both interpretations: Gemini metadata may
                            // describe the accumulated Part or this chunk's delta.
                            _responseTextPartRange: streamState.messagePartRanges.has(support?.segment?.partIndex)
                                ? { ...streamState.messagePartRanges.get(support.segment.partIndex) }
                                : candidatePartRanges.get(support?.segment?.partIndex),
                        }))
                    );
                }
                streamState.webSearchQueries = this._normalizeWebSearchQueries([
                    ...streamState.webSearchQueries,
                    ...this._normalizeWebSearchQueries(candidateGrounding.webSearchQueries),
                ]);
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
            if (candidateParts.length > 0) {
                for (const part of candidateParts) {
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

                    if (part?.toolCall?.toolType === "GOOGLE_SEARCH_WEB") {
                        const toolCall = part.toolCall;
                        ensureWebSearchCall(toolCall.id, toolCall.args?.queries || toolCall.args?.query);
                        continue;
                    }

                    if (part?.toolResponse?.toolType === "GOOGLE_SEARCH_WEB") {
                        const toolResponse = part.toolResponse;
                        findWebSearchCall(toolResponse.id) || ensureWebSearchCall(toolResponse.id);
                        continue;
                    }

                    if (part?.toolCall?.toolType === "URL_CONTEXT") {
                        streamState.hasNativeUrlContext = true;
                        const toolCall = part.toolCall;
                        const calls = (streamState.openPageCallsByGoogleId[toolCall.id] ||= []);
                        for (const url of toolCall.args?.urls || []) {
                            if (typeof url === "string" && url) calls.push(addOpenPageCall(url));
                        }
                        continue;
                    }

                    if (part?.toolResponse?.toolType === "URL_CONTEXT") {
                        streamState.hasNativeUrlContext = true;
                        const toolResponse = part.toolResponse;
                        const calls =
                            streamState.openPageCallsByGoogleId[toolResponse.id] ||
                            this._extractResponseUrlContextUrls(toolResponse.response).map(addOpenPageCall);
                        calls.forEach(completeWebSearchCall);
                        continue;
                    }

                    if (part?.executableCode) {
                        ensureCodeInterpreterCall(part.executableCode.id, part.executableCode.code);
                        continue;
                    }

                    if (part?.codeExecutionResult) {
                        const call =
                            findCodeInterpreterCall(part.codeExecutionResult.id) ||
                            ensureCodeInterpreterCall(part.codeExecutionResult.id);
                        completeCodeInterpreterCall(call, part.codeExecutionResult);
                        continue;
                    }

                    if (part?.text) {
                        const messageItem = ensureMessageItem();
                        streamState.messageText += part.text;

                        pushEvent("response.output_text.delta", {
                            content_index: messageItem.content_index,
                            delta: part.text,
                            item_id: messageItem.id,
                            logprobs: [],
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
                                logprobs: [],
                                output_index: messageItem.output_index,
                            });
                        }
                    } else if (part?.functionCall) {
                        const funcCall = part.functionCall;
                        const responseFunctionIdentity = this._resolveResponseFunctionIdentity(
                            funcCall.name,
                            streamState.responseFunctionNameMap
                        );
                        const isCustom = responseFunctionIdentity.type === "custom";
                        const itemId = `${isCustom ? "ctc" : "fc"}_${this._generateRequestId()}`;
                        // Pass the Gemini-issued function call id through as the Responses API
                        // `call_id` so it round-trips back into `functionCall.id` /
                        // `functionResponse.id` on the next request (needed to pair parallel
                        // calls). Fall back to a generated id when the backend omits it.
                        const callId =
                            typeof funcCall.id === "string" && funcCall.id
                                ? funcCall.id
                                : `call_${this._generateRequestId()}`;
                        const args = isCustom ? funcCall.args?.input : JSON.stringify(funcCall.args || {});
                        if (typeof args !== "string") {
                            this.logger.warn(
                                `[Adapter] Skipping custom tool ${responseFunctionIdentity.name}: returned a non-string input`
                            );
                            continue;
                        }
                        const outputIndex = streamState.nextOutputIndex++;
                        const inputField = isCustom ? "input" : "arguments";
                        const callType = isCustom ? "custom_tool_call" : "function_call";
                        const inputEvent = isCustom
                            ? "response.custom_tool_call_input"
                            : "response.function_call_arguments";

                        pushEvent("response.output_item.added", {
                            item: {
                                call_id: callId,
                                id: itemId,
                                [inputField]: "",
                                name: responseFunctionIdentity.name,
                                ...(responseFunctionIdentity.namespace
                                    ? { namespace: responseFunctionIdentity.namespace }
                                    : {}),
                                status: "in_progress",
                                type: callType,
                            },
                            output_index: outputIndex,
                        });

                        pushEvent(`${inputEvent}.delta`, {
                            delta: args,
                            item_id: itemId,
                            output_index: outputIndex,
                        });

                        pushEvent(`${inputEvent}.done`, {
                            [inputField]: args,
                            item_id: itemId,
                            output_index: outputIndex,
                        });

                        const completedToolItem = {
                            call_id: callId,
                            id: itemId,
                            [inputField]: args,
                            name: responseFunctionIdentity.name,
                            ...(responseFunctionIdentity.namespace
                                ? { namespace: responseFunctionIdentity.namespace }
                                : {}),
                            status: "completed",
                            type: callType,
                        };
                        streamState.outputItemsByIndex[outputIndex] = completedToolItem;

                        pushEvent("response.output_item.done", {
                            item: completedToolItem,
                            output_index: outputIndex,
                        });

                        this.logger.debug(
                            `[Adapter] Converted Gemini functionCall to Response API ${callType}: ${responseFunctionIdentity.namespace ? `${responseFunctionIdentity.namespace}.` : ""}${responseFunctionIdentity.name} (call_id: ${callId})`
                        );
                    }
                }
            }

            const urlContextUrls = this._extractResponseUrlContextUrls(
                candidate.urlContextMetadata || candidate.url_context_metadata
            );
            if (urlContextUrls.length > 0) streamState.urlContextUrls = urlContextUrls;

            // Completion
            if (candidate.finishReason && !streamState.completed) {
                for (const call of streamState.codeInterpreterCalls) {
                    completeCodeInterpreterCall(call, null, "incomplete");
                }
                // Metadata is a fallback for responses without native tool invocations.
                if (!streamState.hasNativeUrlContext) {
                    streamState.urlContextUrls.map(addOpenPageCall).forEach(completeWebSearchCall);
                }
                for (const calls of Object.values(streamState.openPageCallsByGoogleId)) {
                    calls.forEach(completeWebSearchCall);
                }
                const grounding = this._extractResponseWebSearchGrounding(
                    {
                        groundingMetadata: {
                            groundingChunks: streamState.groundingChunks,
                            groundingSupports: streamState.groundingSupports,
                            webSearchQueries: streamState.webSearchQueries,
                        },
                    },
                    streamState.messageText || ""
                );
                if (
                    grounding.queries.length > 0 ||
                    (grounding.annotations.length > 0 &&
                        !streamState.hasNativeUrlContext &&
                        streamState.urlContextUrls.length === 0) ||
                    (streamState.groundingChunks.length > 0 &&
                        !streamState.hasNativeUrlContext &&
                        streamState.urlContextUrls.length === 0) ||
                    streamState.webSearchCallOrder.length > 0
                ) {
                    let searchCall = findWebSearchCall();
                    if (!searchCall) {
                        searchCall = ensureWebSearchCall(null, grounding.queries);
                    } else if (
                        searchCall.status !== "completed" &&
                        (searchCall.action.queries || []).length === 0 &&
                        grounding.queries.length > 0
                    ) {
                        searchCall.action.queries = grounding.queries;
                    }
                    for (const lookupKey of streamState.webSearchCallOrder) {
                        completeWebSearchCall(streamState.webSearchCallsByGoogleId[lookupKey]);
                    }
                }

                streamState.messageAnnotations = grounding.annotations;
                if (streamState.messageItem) {
                    grounding.annotations.forEach((annotation, annotationIndex) => {
                        const annotationKey = `${annotation.start_index}:${annotation.end_index}:${annotation.url}`;
                        if (streamState.messageAnnotationKeys[annotationKey]) return;
                        streamState.messageAnnotationKeys[annotationKey] = true;
                        pushEvent("response.output_text.annotation.added", {
                            annotation,
                            annotation_index: annotationIndex,
                            content_index: streamState.messageItem.content_index,
                            item_id: streamState.messageItem.id,
                            output_index: streamState.messageItem.output_index,
                        });
                    });
                }

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
                        cache_write_tokens: 0,
                        cached_tokens: usage.prompt_tokens_details?.cached_tokens || 0,
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
    convertGoogleToOpenAINonStream(googleResponse, modelName = "gemini-flash-lite-latest") {
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
                    const toolCallId =
                        typeof funcCall.id === "string" && funcCall.id
                            ? funcCall.id
                            : `call_${this._generateRequestId()}`;

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
    convertGoogleToResponseAPINonStream(
        googleResponse,
        modelName = "gemini-flash-lite-latest",
        responseDefaults = {},
        responseFunctionNameMap = {}
    ) {
        const { include: responseInclude, ...responseFields } = responseDefaults || {};
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
                        cache_write_tokens: 0,
                        cached_tokens: 0,
                    },
                    output_tokens: 0,
                    output_tokens_details: {
                        reasoning_tokens: 0,
                    },
                    total_tokens: 0,
                },
                ...responseFields,
                // This proxy does not support OpenAI-side persistence.
                ...{ store: false },
            };
        }

        const output = [];
        let messageContent = "";
        const messagePartRanges = new Map();
        let reasoningContent = "";
        let webSearchQueries = [];
        const nativeSearchItems = [];
        const nativeSearchItemsByGoogleId = new Map();
        const includeCodeInterpreterOutputs =
            Array.isArray(responseInclude) && responseInclude.includes("code_interpreter_call.outputs");
        const requestedCodeInterpreterContainer = responseFields.tools?.find(
            tool => tool?.type === "code_interpreter"
        )?.container;
        const codeInterpreterContainerId =
            typeof requestedCodeInterpreterContainer === "string" && requestedCodeInterpreterContainer
                ? requestedCodeInterpreterContainer
                : `cntr_${this._generateRequestId()}`;
        const codeInterpreterItems = [];
        const codeInterpreterItemsByGoogleId = new Map();
        const createCodeInterpreterItem = (googleCallId, code = "") => {
            const item = {
                code: typeof code === "string" && code ? code : null,
                container_id: codeInterpreterContainerId,
                id: `ci_${this._generateRequestId()}`,
                outputs: includeCodeInterpreterOutputs ? [] : null,
                status: "in_progress",
                type: "code_interpreter_call",
            };
            codeInterpreterItems.push(item);
            output.push(item);
            if (typeof googleCallId === "string" && googleCallId) {
                codeInterpreterItemsByGoogleId.set(googleCallId, item);
            }
            return item;
        };
        const findCodeInterpreterItem = googleCallId => {
            if (typeof googleCallId === "string" && googleCallId) {
                const matched = codeInterpreterItemsByGoogleId.get(googleCallId);
                if (matched) return matched;
            }
            return codeInterpreterItems.find(item => item.status === "in_progress") || null;
        };
        const completeCodeInterpreterItem = (item, executionResult) => {
            const outcome = String(executionResult?.outcome || "");
            const executionOutput = typeof executionResult?.output === "string" ? executionResult.output : "";
            item.status = outcome && outcome !== "OUTCOME_OK" ? "failed" : "completed";
            if (includeCodeInterpreterOutputs) {
                item.outputs = executionOutput ? [{ logs: executionOutput, type: "logs" }] : [];
            }
        };
        const createNativeSearchItem = queries => {
            const normalizedQueries = this._normalizeWebSearchQueries(queries);
            const item = {
                action: {
                    ...(normalizedQueries.length > 0 ? { queries: normalizedQueries } : {}),
                    type: "search",
                },
                id: `ws_${this._generateRequestId()}`,
                status: "completed",
                type: "web_search_call",
            };
            nativeSearchItems.push(item);
            output.push(item);
            return item;
        };
        const ensureNativeSearchItem = (googleCallId, queries) => {
            const hasId = typeof googleCallId === "string" && googleCallId;
            let item = hasId ? nativeSearchItemsByGoogleId.get(googleCallId) : nativeSearchItems.at(-1);
            const normalizedQueries = this._normalizeWebSearchQueries(queries);
            if (!item) {
                item = createNativeSearchItem(normalizedQueries);
                if (hasId) nativeSearchItemsByGoogleId.set(googleCallId, item);
            } else if (normalizedQueries.length > 0 && (item.action.queries || []).length === 0) {
                item.action.queries = normalizedQueries;
            }
            return item;
        };
        const hasNativeWebSearch =
            Array.isArray(candidate.content?.parts) &&
            candidate.content.parts.some(
                part =>
                    part?.toolCall?.toolType === "GOOGLE_SEARCH_WEB" ||
                    part?.toolResponse?.toolType === "GOOGLE_SEARCH_WEB"
            );
        if (candidate.content && Array.isArray(candidate.content.parts)) {
            for (let partIndex = 0; partIndex < candidate.content.parts.length; partIndex++) {
                const part = candidate.content.parts[partIndex];
                // Responses API supports reasoning output items; map Gemini "thought" parts into a reasoning *summary*.
                if (part?.thought === true) {
                    if (part?.text) reasoningContent += part.text;
                    continue;
                } else if (part.text) {
                    // Regular text content
                    messagePartRanges.set(partIndex, {
                        startIndex: messageContent.length,
                        text: part.text,
                    });
                    messageContent += part.text;
                } else if (part.inlineData) {
                    // Responses API image outputs are intentionally suppressed by this proxy; preserve a text note.
                    if (!messageContent) {
                        messageContent =
                            "[Image output omitted: Responses API image outputs are disabled by this proxy.]";
                    }
                } else if (part?.toolCall?.toolType === "GOOGLE_SEARCH_WEB") {
                    const queries = part.toolCall.args?.queries || part.toolCall.args?.query;
                    webSearchQueries = this._normalizeWebSearchQueries([
                        ...webSearchQueries,
                        ...this._normalizeWebSearchQueries(queries),
                    ]);
                    ensureNativeSearchItem(part.toolCall.id, queries);
                } else if (part?.toolResponse?.toolType === "GOOGLE_SEARCH_WEB") {
                    ensureNativeSearchItem(part.toolResponse.id);
                } else if (part?.executableCode) {
                    const existing =
                        typeof part.executableCode.id === "string" && part.executableCode.id
                            ? codeInterpreterItemsByGoogleId.get(part.executableCode.id)
                            : null;
                    if (existing) {
                        if (!existing.code && typeof part.executableCode.code === "string") {
                            existing.code = part.executableCode.code;
                        }
                    } else {
                        createCodeInterpreterItem(part.executableCode.id, part.executableCode.code);
                    }
                } else if (part?.codeExecutionResult) {
                    const item =
                        findCodeInterpreterItem(part.codeExecutionResult.id) ||
                        createCodeInterpreterItem(part.codeExecutionResult.id);
                    completeCodeInterpreterItem(item, part.codeExecutionResult);
                } else if (part.functionCall) {
                    // Function call
                    const funcCall = part.functionCall;
                    const responseFunctionIdentity = this._resolveResponseFunctionIdentity(
                        funcCall.name,
                        responseFunctionNameMap
                    );
                    const isCustom = responseFunctionIdentity.type === "custom";
                    const toolInput = isCustom ? funcCall.args?.input : JSON.stringify(funcCall.args || {});
                    if (typeof toolInput !== "string") {
                        this.logger.warn(
                            `[Adapter] Skipping custom tool ${responseFunctionIdentity.name}: returned a non-string input`
                        );
                        continue;
                    }
                    // Pass through the Gemini-issued call id so it round-trips into
                    // `functionCall.id`/`functionResponse.id` on the next request.
                    const callId =
                        typeof funcCall.id === "string" && funcCall.id
                            ? funcCall.id
                            : `call_${this._generateRequestId()}`;
                    output.push({
                        [isCustom ? "input" : "arguments"]: toolInput,
                        call_id: callId,
                        id: `${isCustom ? "ctc" : "fc"}-${this._generateRequestId()}`,
                        name: responseFunctionIdentity.name,
                        ...(responseFunctionIdentity.namespace
                            ? { namespace: responseFunctionIdentity.namespace }
                            : {}),
                        status: "completed",
                        type: isCustom ? "custom_tool_call" : "function_call",
                    });
                    this.logger.debug(
                        `[Adapter] Converted Gemini functionCall to Response API ${isCustom ? "custom_tool_call" : "function_call"}: ${responseFunctionIdentity.namespace ? `${responseFunctionIdentity.namespace}.` : ""}${responseFunctionIdentity.name} (call_id: ${callId})`
                    );
                }
            }
        }

        for (const item of codeInterpreterItems) {
            if (item.status === "in_progress") item.status = "incomplete";
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

        const grounding = this._extractResponseWebSearchGrounding(candidate, messageContent, messagePartRanges);
        const parts = Array.isArray(candidate.content?.parts) ? candidate.content.parts : [];
        const urlCalls = parts.filter(part => part?.toolCall?.toolType === "URL_CONTEXT");
        const urlResults = parts.filter(part => part?.toolResponse?.toolType === "URL_CONTEXT");
        const urlContextUrls =
            urlCalls.length > 0
                ? urlCalls.flatMap(part => part.toolCall.args?.urls || []).filter(url => typeof url === "string" && url)
                : urlResults.length > 0
                  ? urlResults.flatMap(part => this._extractResponseUrlContextUrls(part.toolResponse.response))
                  : this._extractResponseUrlContextUrls(candidate.urlContextMetadata || candidate.url_context_metadata);
        const hasUrlContext = urlCalls.length > 0 || urlResults.length > 0 || urlContextUrls.length > 0;
        if (webSearchQueries.length === 0) webSearchQueries = grounding.queries;
        const requestedSearchSources =
            Array.isArray(responseInclude) && responseInclude.includes("web_search_call.action.sources");
        const sources = requestedSearchSources
            ? this._extractResponseWebSearchSources(candidate.groundingMetadata?.groundingChunks)
            : null;
        if (hasNativeWebSearch) {
            const lastSearchItem = nativeSearchItems.at(-1);
            if (lastSearchItem && webSearchQueries.length > 0 && (lastSearchItem.action.queries || []).length === 0) {
                lastSearchItem.action.queries = webSearchQueries;
            }
            if (requestedSearchSources) {
                nativeSearchItems.forEach(item => {
                    item.action.sources = sources;
                });
            }
        } else if (
            webSearchQueries.length > 0 ||
            (!hasUrlContext &&
                (grounding.annotations.length > 0 || candidate.groundingMetadata?.groundingChunks?.length > 0))
        ) {
            const searchItem = {
                action: {
                    ...(webSearchQueries.length > 0 ? { queries: webSearchQueries } : {}),
                    ...(requestedSearchSources ? { sources } : {}),
                    type: "search",
                },
                id: `ws_${this._generateRequestId()}`,
                status: "completed",
                type: "web_search_call",
            };
            // Grounding-only search metadata arrives after the model content but
            // represents work performed before the resulting message.
            const firstMessageLikeIndex = output.findIndex(item =>
                ["function_call", "custom_tool_call"].includes(item.type)
            );
            if (firstMessageLikeIndex < 0) output.push(searchItem);
            else output.splice(firstMessageLikeIndex, 0, searchItem);
        }

        for (const url of urlContextUrls) {
            output.push({
                action: { type: "open_page", url },
                id: `ws_${this._generateRequestId()}`,
                status: "completed",
                type: "web_search_call",
            });
        }

        // Add message output if present
        if (messageContent) {
            output.push({
                content: [
                    {
                        annotations: grounding.annotations,
                        logprobs: [],
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
                    cache_write_tokens: 0,
                    cached_tokens: usage.prompt_tokens_details?.cached_tokens || 0,
                },
                output_tokens: usage.completion_tokens,
                output_tokens_details: {
                    reasoning_tokens: usage.completion_tokens_details?.reasoning_tokens || 0,
                },
                total_tokens: usage.total_tokens,
            },
            ...responseFields,
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

    _normalizeWebSearchQueries(value) {
        const queries = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
        return [
            ...new Set(queries.filter(query => typeof query === "string" && query.trim()).map(query => query.trim())),
        ];
    }

    _extractUrlContextMetadataEntries(metadata) {
        const entries =
            metadata?.urlMetadata || metadata?.url_metadata || metadata?.urlsMetadata || metadata?.urls_metadata || [];
        return Array.isArray(entries) ? entries : [];
    }

    _extractResponseUrlContextUrls(metadata) {
        return this._extractUrlContextMetadataEntries(metadata)
            .map(entry => entry?.retrievedUrl || entry?.retrieved_url)
            .filter(url => typeof url === "string" && url);
    }

    _extractResponseWebSearchSources(chunks) {
        // Use every web grounding chunk, including sources without an inline
        // citation. URL Context remains open_page; its schema has no sources field.
        const urls = (Array.isArray(chunks) ? chunks : [])
            .map(chunk => chunk?.web?.uri)
            .filter(url => typeof url === "string" && url.trim());
        return [...new Set(urls)].map(url => ({ type: "url", url }));
    }

    _utf8ByteOffsetToStringIndex(value, byteOffset) {
        const targetOffset = Number.isFinite(byteOffset) ? Math.max(0, byteOffset) : 0;
        let currentByteOffset = 0;
        let stringIndex = 0;

        for (const character of value) {
            const characterBytes = Buffer.byteLength(character, "utf8");
            if (currentByteOffset + characterBytes > targetOffset) break;
            currentByteOffset += characterBytes;
            stringIndex += character.length;
            if (currentByteOffset === targetOffset) break;
        }

        return stringIndex;
    }

    _extractResponseWebSearchGrounding(candidate, messageText = "", messagePartRanges = null) {
        const metadata = candidate?.groundingMetadata || {};
        const queries = this._normalizeWebSearchQueries(metadata.webSearchQueries);
        const chunks = Array.isArray(metadata.groundingChunks) ? metadata.groundingChunks : [];
        const supports = Array.isArray(metadata.groundingSupports) ? metadata.groundingSupports : [];
        const annotations = [];
        const annotationKeys = new Set();

        for (const support of supports) {
            const segment = support?.segment || {};
            const segmentText = typeof segment.text === "string" ? segment.text : "";
            let partRange =
                support?._responseTextPartRange ||
                (Number.isInteger(segment.partIndex) && messagePartRanges instanceof Map
                    ? messagePartRanges.get(segment.partIndex)
                    : null);
            const segmentStartByte = Number.isFinite(segment.startIndex) ? Math.max(0, segment.startIndex) : 0;
            const segmentEndByte = Number.isFinite(segment.endIndex)
                ? Math.max(segmentStartByte, segment.endIndex)
                : segmentStartByte + Buffer.byteLength(segmentText, "utf8");
            if (segmentText && support?._responseTextChunkRange) {
                const matchingRange = [partRange, support._responseTextChunkRange].find(range => {
                    if (!range || segmentEndByte > Buffer.byteLength(range.text, "utf8")) return false;
                    const start = this._utf8ByteOffsetToStringIndex(range.text, segmentStartByte);
                    const end = this._utf8ByteOffsetToStringIndex(range.text, segmentEndByte);
                    return range.text.slice(start, end) === segmentText;
                });
                // Prefer cumulative offsets when both match; use delta-local
                // offsets only when the segment text confirms that interpretation.
                if (matchingRange) partRange = matchingRange;
            }
            const partText = partRange?.text || messageText;
            const partBaseIndex = Number.isInteger(partRange?.startIndex) ? partRange.startIndex : 0;
            let localStartIndex = this._utf8ByteOffsetToStringIndex(partText, segmentStartByte);
            let localEndIndex = this._utf8ByteOffsetToStringIndex(partText, segmentEndByte);

            // Gemini grounding offsets are UTF-8 byte offsets. Resolve the exact segment text as
            // an additional safeguard, scoped to the selected Part so repeated text in an earlier
            // Part cannot steal the citation.
            if (segmentText && partText.slice(localStartIndex, localEndIndex) !== segmentText) {
                let matchedIndex = partText.indexOf(segmentText, Math.max(0, localStartIndex - 128));
                if (matchedIndex < 0) matchedIndex = partText.indexOf(segmentText);
                if (matchedIndex >= 0) {
                    localStartIndex = matchedIndex;
                    localEndIndex = matchedIndex + segmentText.length;
                }
            }

            let startIndex = partBaseIndex + localStartIndex;
            let endIndex = partBaseIndex + localEndIndex;
            startIndex = Math.min(startIndex, messageText.length);
            endIndex = Math.min(Math.max(startIndex, endIndex), messageText.length);
            const openAIStartIndex = Array.from(messageText.slice(0, startIndex)).length;
            const openAIEndIndex = openAIStartIndex + Array.from(messageText.slice(startIndex, endIndex)).length;

            const chunkIndices = Array.isArray(support?.groundingChunkIndices) ? support.groundingChunkIndices : [];
            for (const chunkIndex of chunkIndices) {
                const web = chunks[chunkIndex]?.web;
                if (!web || typeof web.uri !== "string" || !web.uri) continue;

                const annotation = {
                    end_index: openAIEndIndex,
                    start_index: openAIStartIndex,
                    title: web.siteName || web.title || web.domain || web.uri,
                    type: "url_citation",
                    url: web.uri,
                };
                const key = `${annotation.start_index}:${annotation.end_index}:${annotation.url}`;
                if (annotationKeys.has(key)) continue;
                annotationKeys.add(key);
                annotations.push(annotation);
            }
        }

        return { annotations, queries };
    }

    _parseUsage(googleResponse) {
        const usage = googleResponse.usageMetadata || {};

        const inputTokens = usage.promptTokenCount || 0;
        const toolPromptTokens = usage.toolUsePromptTokenCount || 0;
        let cachedTokens = Number.isFinite(usage.cachedContentTokenCount)
            ? Math.max(0, usage.cachedContentTokenCount)
            : 0;

        if (!Number.isFinite(usage.cachedContentTokenCount) && Array.isArray(usage.cacheTokensDetails)) {
            cachedTokens = usage.cacheTokensDetails.reduce(
                (sum, detail) => sum + (Number.isFinite(detail?.tokenCount) ? Math.max(0, detail.tokenCount) : 0),
                0
            );
        }

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
        cachedTokens = Math.min(cachedTokens, promptTokens);
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
                cached_tokens: cachedTokens,
                text_tokens: inputTokens,
                tool_tokens: toolPromptTokens,
            },
            total_tokens: totalTokens,
        };
    }

    _parseClaudeUsage(usageMetadata = {}) {
        const parsedUsage = this._parseUsage({ usageMetadata });
        const cacheReadInputTokens = parsedUsage.prompt_tokens_details.cached_tokens || 0;

        return {
            // Anthropic reports uncached input separately from cache reads/writes.
            // Gemini exposes cache reads but does not expose an equivalent cache-write count.
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: cacheReadInputTokens,
            input_tokens: Math.max(0, parsedUsage.prompt_tokens - cacheReadInputTokens),
            output_tokens: parsedUsage.completion_tokens,
        };
    }

    _formatGeminiExecutableCodeAsBashCommand(executableCode = {}) {
        const code = typeof executableCode.code === "string" ? executableCode.code : "";
        const language = String(executableCode.language || "python").toLowerCase();
        if (language !== "python" && language !== "py") return code;

        const codeLines = new Set(code.split(/\r?\n/));
        let delimiter = "PYTHON_CODE";
        while (codeLines.has(delimiter)) delimiter += "_";
        return `python - <<'${delimiter}'\n${code}${code.endsWith("\n") ? "" : "\n"}${delimiter}`;
    }

    _serializeClaudeServerToolData(value) {
        return JSON.stringify(value, (key, item) =>
            ["signature", "thoughtSignature", "thought_signature", "encrypted_content", "encrypted_index"].includes(key)
                ? undefined
                : item
        );
    }

    _buildClaudeWebToolBlocks(candidate, state, options) {
        const blocks = [];
        if (!state.claudeWebToolCalls) state.claudeWebToolCalls = new Map();
        if (!state.claudeUrlCalls) state.claudeUrlCalls = new Map();
        if (!state.claudeGroundingSourceKeys) state.claudeGroundingSourceKeys = new Set();
        if (!state.claudeUrlMetadataKeys) state.claudeUrlMetadataKeys = new Set();

        const createCall = (name, input) => {
            const call = { id: `srvtoolu_${this._generateRequestId()}`, resultSent: false, seenResults: new Set() };
            blocks.push({ caller: { type: "direct" }, id: call.id, input, name, type: "server_tool_use" });
            state.serverToolUsage[name === "web_search" ? "web_search_requests" : "web_fetch_requests"]++;
            return call;
        };
        const ensureSearchCall = (key, queries = []) => {
            let call = key ? state.claudeWebToolCalls.get(key) : state.claudeLastSearchCall;
            if (!call) {
                call = createCall("web_search", { query: queries.join("\n") || "Google Search" });
                if (key) state.claudeWebToolCalls.set(key, call);
            }
            state.claudeLastSearchCall = call;
            if (!call.queries) call.queries = new Set(queries);
            else {
                const fresh = queries.filter(query => !call.queries.has(query));
                for (const query of fresh) call.queries.add(query);
            }
            return call;
        };
        const ensureFetchCall = (url, key) => {
            let calls = key ? state.claudeWebToolCalls.get(key) : null;
            if (key && !calls) {
                calls = new Map();
                state.claudeWebToolCalls.set(key, calls);
            }
            let call = calls?.get(url);
            const existing = state.claudeUrlCalls.get(url);
            if (!call && existing && !key) call = existing;
            if (!call) call = createCall("web_fetch", { url });
            if (key) {
                calls.set(url, call);
            }
            state.claudeUrlCalls.set(url, call);
            return call;
        };
        const searchResults = () => {
            const chunks = candidate?.groundingMetadata?.groundingChunks;
            return (Array.isArray(chunks) ? chunks : []).flatMap(chunk => {
                const web = chunk?.web;
                if (typeof web?.uri !== "string" || !web.uri) return [];
                return [
                    {
                        encrypted_content: "",
                        page_age: null,
                        title: web.title || web.siteName || web.uri,
                        type: "web_search_result",
                        url: web.uri,
                    },
                ];
            });
        };
        const emitSearchResults = (call, results) => {
            // Native search responses can precede the grounding sources in the final chunk.
            if (results.length === 0 && options.includeMetadata === false) return;
            const fresh = results.filter(result => {
                const key = `${result.url}\u0000${result.title}`;
                if (call.seenResults.has(key)) return false;
                call.seenResults.add(key);
                state.claudeGroundingSourceKeys.add(key);
                return true;
            });
            if (!call.resultSent) {
                blocks.push({ content: fresh, tool_use_id: call.id, type: "web_search_tool_result" });
                call.resultSent = true;
            }
        };
        const emitFetchResult = (metadata, key) => {
            const url = metadata?.retrievedUrl || metadata?.retrieved_url;
            if (typeof url !== "string" || !url) return;
            const status = String(metadata.urlRetrievalStatus || metadata.url_retrieval_status || "");
            const resultKey = `${url}:${status}`;
            // Candidate metadata has no call ID and can repeat a previous result
            // while a new call is outstanding. Do not complete that new call twice.
            if (!key && state.claudeUrlMetadataKeys.has(resultKey)) return;
            let call = key ? state.claudeWebToolCalls.get(key)?.get(url) : null;
            // A redirected URL still belongs to the outstanding call in this response.
            if (!call && key) {
                call = [...(state.claudeWebToolCalls.get(key)?.values() || [])].find(item => !item.resultSent);
            }
            if (!call) call = ensureFetchCall(url, key);
            state.claudeUrlCalls.set(url, call);
            if (key) state.claudeWebToolCalls.get(key)?.set(url, call);
            if (call.seenResults.has(resultKey)) return;
            call.seenResults.add(resultKey);
            state.claudeUrlMetadataKeys.add(resultKey);
            if (!status || call.resultSent) return;
            const content = status.includes("SUCCESS")
                ? {
                      content: {
                          citations: null,
                          source: { data: "", media_type: "text/plain", type: "text" },
                          title: null,
                          type: "document",
                      },
                      retrieved_at: new Date().toISOString(),
                      type: "web_fetch_result",
                      url,
                  }
                : {
                      error_code: status.includes("UNSAFE") ? "url_not_allowed" : "url_not_accessible",
                      type: "web_fetch_tool_result_error",
                  };
            blocks.push({ caller: { type: "direct" }, content, tool_use_id: call.id, type: "web_fetch_tool_result" });
            call.resultSent = true;
        };

        if (options.includeNative !== false) {
            const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
            for (const part of parts) {
                const invocation = part?.toolCall || part?.toolResponse;
                if (!invocation?.id) continue;
                const type = invocation.toolType;
                const key = `${type}:${invocation.id}`;
                if (type === "GOOGLE_SEARCH_WEB") {
                    const queries = this._normalizeWebSearchQueries(invocation.args?.queries || invocation.args?.query);
                    const call = ensureSearchCall(key, queries);
                    if (part.toolResponse) {
                        call.responseReceived = true;
                        state.claudeLastSearchResultCall = call;
                        emitSearchResults(call, searchResults());
                    }
                } else if (type === "URL_CONTEXT") {
                    if (part.toolCall) {
                        const urls = invocation.args?.urls;
                        const validUrls = (Array.isArray(urls) ? urls : typeof urls === "string" ? [urls] : []).filter(
                            url => typeof url === "string" && url
                        );
                        for (const url of validUrls) ensureFetchCall(url, key);
                    } else {
                        const response = invocation.response || {};
                        for (const entry of this._extractUrlContextMetadataEntries(response)) {
                            emitFetchResult(entry, key);
                        }
                    }
                }
            }
        }

        if (options.includeMetadata !== false) {
            const grounding = candidate?.groundingMetadata;
            const context = candidate?.urlContextMetadata || candidate?.url_context_metadata;
            const knownQueries = new Set([
                ...[...state.claudeWebToolCalls.values()].flatMap(call => [...(call.queries || [])]),
            ]);
            const searchQueries = this._normalizeWebSearchQueries(grounding?.webSearchQueries);
            const queries = searchQueries.filter(query => !knownQueries.has(query));
            const results = searchResults().filter(
                result => !state.claudeGroundingSourceKeys.has(`${result.url}\u0000${result.title}`)
            );
            // URL Context also emits grounding sources. Those sources alone
            // do not represent an additional Google Search invocation.
            const hasSearch = searchQueries.length > 0 || state.claudeLastSearchCall;
            const metadata = this._extractUrlContextMetadataEntries(context);
            // Streaming accumulation includes an empty URL Context object even
            // when no fetch occurred. Only actual retrievals indicate a fetch.
            const hasFetch = (Array.isArray(metadata) && metadata.length > 0) || state.claudeUrlCalls.size > 0;
            if ((queries.length > 0 || results.length > 0) && (hasSearch || !hasFetch)) {
                const call = state.claudeLastSearchResultCall || ensureSearchCall(null, queries);
                emitSearchResults(call, results);
            }
            for (const call of state.claudeWebToolCalls.values()) {
                if (call.responseReceived && !call.resultSent) emitSearchResults(call, []);
            }
            for (const entry of Array.isArray(metadata) ? metadata : []) emitFetchResult(entry);
        }

        return blocks;
    }

    _formatClaudeServerToolUsage(usage = {}) {
        const counts = Object.fromEntries(Object.entries(usage).filter(([, count]) => count > 0));
        if (Object.keys(counts).length === 0) return {};

        // Both web counters are required whenever server_tool_use is present.
        return { web_fetch_requests: 0, web_search_requests: 0, ...counts };
    }

    _buildClaudeServerToolBlocks(candidate, state = {}, options = {}) {
        const includeCodeExecution = options.includeCodeExecution !== false;
        const includeMetadata = options.includeMetadata !== false;
        const blocks = [];

        if (!state.serverToolSeenKeys) state.serverToolSeenKeys = new Set();
        if (!state.codeExecutionToolUseIds) state.codeExecutionToolUseIds = new Map();
        if (!state.serverToolUsage) {
            state.serverToolUsage = {
                code_execution_requests: 0,
                web_fetch_requests: 0,
                web_search_requests: 0,
            };
        }

        const createToolUseId = () => `srvtoolu_${this._generateRequestId()}`;

        blocks.push(
            ...this._buildClaudeWebToolBlocks(candidate, state, {
                includeMetadata,
                includeNative: options.includeNative,
            })
        );

        if (includeCodeExecution) {
            const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
            for (const part of parts) {
                if (part?.executableCode) {
                    const executableCode = part.executableCode;
                    const geminiId = executableCode.id || null;
                    const seenKey = geminiId ? `code_call:${geminiId}` : null;
                    if (seenKey && state.serverToolSeenKeys.has(seenKey)) continue;

                    const toolUseId = createToolUseId();
                    if (seenKey) state.serverToolSeenKeys.add(seenKey);
                    blocks.push({
                        caller: { type: "direct" },
                        id: toolUseId,
                        input: { command: this._formatGeminiExecutableCodeAsBashCommand(executableCode) },
                        name: "bash_code_execution",
                        type: "server_tool_use",
                    });
                    if (geminiId) state.codeExecutionToolUseIds.set(geminiId, toolUseId);
                    state.lastCodeExecutionToolUseId = toolUseId;
                    state.serverToolUsage.code_execution_requests++;
                } else if (part?.codeExecutionResult) {
                    const executionResult = part.codeExecutionResult;
                    const geminiId = executionResult.id || null;
                    const seenKey = geminiId ? `code_result:${geminiId}` : null;
                    if (seenKey && state.serverToolSeenKeys.has(seenKey)) continue;

                    let toolUseId = geminiId ? state.codeExecutionToolUseIds.get(geminiId) : null;
                    if (!toolUseId) toolUseId = state.lastCodeExecutionToolUseId;
                    if (!toolUseId) {
                        toolUseId = createToolUseId();
                        blocks.push({
                            caller: { type: "direct" },
                            id: toolUseId,
                            input: { command: "" },
                            name: "bash_code_execution",
                            type: "server_tool_use",
                        });
                        state.serverToolUsage.code_execution_requests++;
                    }

                    if (seenKey) state.serverToolSeenKeys.add(seenKey);
                    const outcome = String(executionResult.outcome || "");
                    const succeeded = outcome === "OUTCOME_OK";
                    blocks.push({
                        content: {
                            content: [],
                            return_code: succeeded ? 0 : outcome === "OUTCOME_DEADLINE_EXCEEDED" ? 124 : 1,
                            stderr: succeeded ? "" : executionResult.output || "",
                            stdout: succeeded ? executionResult.output || "" : "",
                            type: "bash_code_execution_result",
                        },
                        tool_use_id: toolUseId,
                        type: "bash_code_execution_tool_result",
                    });
                }
            }
        }

        return { blocks, usage: state.serverToolUsage };
    }

    _buildClaudeWebSearchCitations(candidate) {
        const groundingMetadata = candidate?.groundingMetadata;
        const groundingChunks = Array.isArray(groundingMetadata?.groundingChunks)
            ? groundingMetadata.groundingChunks
            : [];
        const groundingSupports = Array.isArray(groundingMetadata?.groundingSupports)
            ? groundingMetadata.groundingSupports
            : [];
        const citations = [];
        const seenCitationKeys = new Set();

        for (let supportIndex = 0; supportIndex < groundingSupports.length; supportIndex++) {
            const support = groundingSupports[supportIndex];
            const chunkIndices = Array.isArray(support?.groundingChunkIndices) ? support.groundingChunkIndices : [];
            const segmentText =
                typeof support?.segment?.text === "string" && support.segment.text
                    ? [...support.segment.text].slice(0, 150).join("")
                    : "";

            for (const chunkIndex of chunkIndices) {
                const web = groundingChunks[chunkIndex]?.web;
                if (!web || typeof web.uri !== "string" || !web.uri) continue;

                const title = web.title || web.siteName || null;
                const citationKey = `${chunkIndex}\u0000${segmentText}`;
                if (seenCitationKeys.has(citationKey)) continue;
                seenCitationKeys.add(citationKey);

                citations.push({
                    cited_text: segmentText || title || web.uri,
                    // Gemini exposes the source mapping but not Anthropic's opaque
                    // encrypted index. Keep a stable, non-empty proxy-local value so
                    // Claude clients can retain the citation object across the stream.
                    encrypted_index: `google_grounding_${chunkIndex}_${supportIndex}`,
                    title,
                    type: "web_search_result_location",
                    url: web.uri,
                });
            }
        }

        return citations;
    }

    _accumulateClaudeServerToolMetadata(candidate, state) {
        if (!state.claudeServerToolMetadata) {
            state.claudeServerToolMetadata = {
                groundingChunks: [],
                groundingSupportKeys: new Set(),
                groundingSupports: [],
                urlMetadata: new Map(),
                webSearchQueries: new Set(),
            };
        }

        const accumulated = state.claudeServerToolMetadata;
        const groundingMetadata = candidate?.groundingMetadata;
        for (const query of this._normalizeWebSearchQueries(groundingMetadata?.webSearchQueries)) {
            accumulated.webSearchQueries.add(query);
        }
        if (Array.isArray(groundingMetadata?.groundingChunks)) {
            // In streaming responses, groundingChunkIndices address the ordered
            // concatenation of every groundingChunks array received so far. Equal
            // chunk values can still occupy different global slots, so deduplicating
            // them would shift every later index and corrupt citation attribution.
            accumulated.groundingChunks.push(...groundingMetadata.groundingChunks);
        }
        if (Array.isArray(groundingMetadata?.groundingSupports)) {
            for (const support of groundingMetadata.groundingSupports) {
                const key = JSON.stringify(support);
                if (accumulated.groundingSupportKeys.has(key)) continue;
                accumulated.groundingSupportKeys.add(key);
                accumulated.groundingSupports.push(support);
            }
        }

        const urlContextMetadata = candidate?.urlContextMetadata || candidate?.url_context_metadata;
        const urlMetadata = this._extractUrlContextMetadataEntries(urlContextMetadata);
        for (const metadata of urlMetadata) {
            const url = metadata?.retrievedUrl || metadata?.retrieved_url;
            if (typeof url === "string" && url) accumulated.urlMetadata.set(url, metadata);
        }

        return {
            groundingMetadata: {
                groundingChunks: accumulated.groundingChunks,
                groundingSupports: accumulated.groundingSupports,
                webSearchQueries: [...accumulated.webSearchQueries],
            },
            urlContextMetadata: {
                urlMetadata: [...accumulated.urlMetadata.values()],
            },
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
        // 1) built-in tool overrides: trailing `-search` / `-code`
        // 2) streaming override: trailing `-real` / `-fake` after any thinking suffix
        // 3) thinkingLevel override: trailing `-minimal` / `(minimal)` etc.
        // Combined user-facing suffix order: thinking -> streaming -> built-in tools
        const rawModel = claudeBody.model || "gemini-flash-lite-latest";
        const {
            cleanModelName: toolStrippedModel,
            forceCodeExecution: modelForceCodeExecution,
            forceWebSearch: modelForceWebSearch,
        } = FormatConverter.parseModelBuiltInToolSuffixes(rawModel);
        const { cleanModelName: streamStrippedModel, streamingMode: modelStreamingMode } =
            FormatConverter.parseModelStreamingModeSuffix(toolStrippedModel);
        const { cleanModelName, thinkingLevel: modelThinkingLevel } =
            FormatConverter.parseModelThinkingLevel(streamStrippedModel);

        const modelForceToolFlags = [];
        if (modelForceWebSearch) modelForceToolFlags.push("forceWebSearch=true");
        if (modelForceCodeExecution) modelForceToolFlags.push("forceCodeExecution=true");
        if (modelForceToolFlags.length > 0) {
            this.logger.info(
                `[Adapter] Detected built-in tool suffixes in model name: "${rawModel}" -> model="${toolStrippedModel}", ${modelForceToolFlags.join(", ")}`
            );
        }
        if (modelStreamingMode) {
            this.logger.info(
                `[Adapter] Detected streamingMode suffix in model name: "${toolStrippedModel}" -> model="${streamStrippedModel}", streamingMode="${modelStreamingMode}"`
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

        const appendSystemContent = content => {
            let text = "";
            if (typeof content === "string") {
                text = content;
            } else if (Array.isArray(content)) {
                text = content
                    .map(block => {
                        if (typeof block === "string") return block;
                        if (block && block.type === "text") return block.text || "";
                        return block?.text || "";
                    })
                    .filter(Boolean)
                    .join("\n");
            } else if (content && typeof content === "object") {
                text = content.text || "";
            }

            if (!text) return;

            if (systemInstruction) {
                systemInstruction.parts[0].text = `${systemInstruction.parts[0].text}\n${text}`;
            } else {
                systemInstruction = {
                    parts: [{ text }],
                    role: "system",
                };
            }
        };

        // Extract system messages into Gemini systemInstruction.
        if (claudeBody.system) {
            appendSystemContent(claudeBody.system);
        }

        if (Array.isArray(claudeBody.messages)) {
            for (const message of claudeBody.messages) {
                if (message.role === "system") {
                    appendSystemContent(message.content);
                }
            }
        }

        // Buffer for accumulating consecutive tool result parts
        let pendingToolParts = [];

        let pendingModelParts = [];
        const flushModelParts = () => {
            if (pendingModelParts.length > 0) {
                googleContents.push({ parts: pendingModelParts, role: "model" });
                pendingModelParts = [];
            }
        };

        const flushToolParts = () => {
            if (pendingToolParts.length > 0) {
                googleContents.push({
                    parts: pendingToolParts,
                    role: "user",
                });
                pendingToolParts = [];
            }
        };

        const ensureGeminiFunctionResponseObject = value => {
            if (typeof value === "object" && value !== null && !Array.isArray(value)) {
                return value;
            }
            return { result: value };
        };

        const normalizeClaudeToolResultContent = content => {
            if (typeof content === "string") {
                try {
                    return ensureGeminiFunctionResponseObject(JSON.parse(content));
                } catch {
                    return { result: content };
                }
            }

            if (Array.isArray(content)) {
                const textParts = content
                    .filter(c => c && c.type === "text")
                    .map(c => c.text || "")
                    .join("\n");

                if (textParts.length > 0) {
                    try {
                        return ensureGeminiFunctionResponseObject(JSON.parse(textParts));
                    } catch {
                        return { result: textParts };
                    }
                }

                return { result: content };
            }

            return ensureGeminiFunctionResponseObject(content ?? { result: "" });
        };

        const normalizeClaudeToolResultResponse = async toolResult => {
            let responseContent;
            let parts = [];
            if (Array.isArray(toolResult.content) && toolResult.content.some(block => block?.type !== "text")) {
                const converted = await this._convertClaudeToolResultMedia(toolResult.content);
                responseContent = { result: converted.content };
                parts = converted.parts;
            } else {
                responseContent = normalizeClaudeToolResultContent(toolResult.content);
            }
            if (toolResult.is_error === true && !Object.prototype.hasOwnProperty.call(responseContent, "error")) {
                responseContent = {
                    error:
                        Object.keys(responseContent).length === 1 &&
                        Object.prototype.hasOwnProperty.call(responseContent, "result")
                            ? responseContent.result
                            : responseContent,
                };
            }
            return { ...(parts.length > 0 ? { parts } : {}), response: responseContent };
        };

        const claudeServerToolBlockTypes = new Set([
            "bash_code_execution_tool_result",
            "server_tool_use",
            "text_editor_code_execution_tool_result",
            "web_search_tool_result",
            "web_fetch_tool_result",
        ]);

        const convertClaudeServerToolBlock = block => ({
            text: `[Claude server tool history: ${block.type}]\n${this._serializeClaudeServerToolData(block)}`,
        });

        // Convert Claude messages to Google format
        for (const message of claudeBody.messages) {
            if (message.role === "system") continue;
            if (message.role !== "assistant") flushModelParts();

            const googleParts = [];

            // Handle tool_result role (Claude's function response)
            if (message.role === "user" && Array.isArray(message.content)) {
                const toolResults = message.content.filter(block => block.type === "tool_result");
                if (toolResults.length > 0) {
                    for (const toolResult of toolResults) {
                        const convertedResult = await normalizeClaudeToolResultResponse(toolResult);

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
                                ...(toolUseId ? { id: toolUseId } : {}),
                                name: functionName,
                                ...convertedResult,
                            },
                        });
                    }

                    // Process non-tool_result content in the same message
                    const otherContent = message.content.filter(block => block.type !== "tool_result");
                    if (otherContent.length > 0) {
                        for (const block of otherContent) {
                            if (block.type === "text") {
                                pendingToolParts.push({ text: block.text });
                            } else if (block.type === "image") {
                                const media = await this._loadFunctionResponseMedia(block, pendingToolParts.length, {
                                    functionResponse: false,
                                });
                                pendingToolParts.push(
                                    media?.part || { text: `[Claude media unavailable]\n${JSON.stringify(block)}` }
                                );
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
                                ...(block.id ? { id: block.id } : {}),
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
                        // Compatibility APIs intentionally do not accept external
                        // signatures because their provenance cannot be verified.
                        googleParts.push({ text: block.thinking || "", thought: true });
                    } else if (block.type === "text") {
                        googleParts.push({ text: block.text });
                    } else if (claudeServerToolBlockTypes.has(block.type)) {
                        // Server tools have already executed. Preserve their assistant-turn
                        // history as model context without asking Gemini to execute them again.
                        googleParts.push(convertClaudeServerToolBlock(block));
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
                if (message.role === "assistant") {
                    pendingModelParts.push(...googleParts);
                } else {
                    googleContents.push({ parts: googleParts, role: "user" });
                }
            }
        }

        // Flush remaining tool parts
        flushModelParts();
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

        // Claude supports legacy/manual thinking plus the newer adaptive and
        // between-tools modes. Gemini cannot reproduce every scheduling detail,
        // so this adapter only preserves whether thinking is enabled.
        const thinkingType = thinkingParam?.type;
        const isThinkingEnabled =
            thinkingParam &&
            (thinkingParam.enabled === true ||
                thinkingType === "enabled" ||
                thinkingType === "adaptive" ||
                thinkingType === "between_tools");
        const isThinkingDisabled = thinkingType === "disabled" || thinkingParam?.enabled === false;

        if (isThinkingEnabled) {
            thinkingConfig = { includeThoughts: thinkingParam.display !== "omitted" };
            if (thinkingParam.budget_tokens) {
                // Gemini doesn't have budget_tokens, but we can log it
                this.logger.debug(`[Adapter] Claude thinking budget_tokens: ${thinkingParam.budget_tokens}`);
            }
        } else if (isThinkingDisabled) {
            thinkingConfig = { includeThoughts: false };
        }

        // Anthropic effort values do not have exact Gemini equivalents. When no
        // recognized thinking mode has already made the decision, treat effort as
        // an enable signal without mapping its strength. Explicit disabled and
        // display:"omitted" settings therefore keep their precedence.
        const claudeEffort = claudeBody.output_config?.effort;
        if (!thinkingConfig && typeof claudeEffort === "string" && claudeEffort.length > 0) {
            thinkingConfig = { includeThoughts: true };
            this.logger.debug(`[Adapter] Claude output_config.effort enables thinking: ${claudeEffort}`);
        }

        // Force thinking mode (only set includeThoughts=true when missing)
        if (
            this.serverSystem.config.forceThinking &&
            (!thinkingConfig || thinkingConfig.includeThoughts === undefined)
        ) {
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

                if ((schema === undefined || schema === null) && claudeBody.output_format.json_schema) {
                    schema = claudeBody.output_format.json_schema.schema;
                    schemaName = claudeBody.output_format.json_schema.name || schemaName;
                }

                if (schema !== undefined && schema !== null) {
                    generationConfig.responseFormat = { text: { mimeType: "APPLICATION_JSON", schema } };
                    this.logger.info(
                        `[Adapter] Forwarded Claude output_format as Gemini responseFormat.text.schema. Name: ${schemaName}`
                    );
                }
            } else if (claudeBody.output_format.type === "json_object") {
                generationConfig.responseFormat = {
                    text: { mimeType: "APPLICATION_JSON", schema: { additionalProperties: true, type: "object" } },
                };
                this.logger.info(
                    `[Adapter] Converted Claude output_format (json_object) to Gemini responseFormat.text.`
                );
            } else if (claudeBody.output_format.type === "text") {
                generationConfig.responseFormat = { text: { mimeType: "TEXT_PLAIN" } };
            }
        }

        // Handle Claude's output_config (new format)
        if (claudeBody.output_config && claudeBody.output_config.format) {
            const format = claudeBody.output_config.format;
            if (format.type === "json_schema" && format.schema !== undefined && format.schema !== null) {
                generationConfig.responseFormat = { text: { mimeType: "APPLICATION_JSON", schema: format.schema } };
                this.logger.info(
                    `[Adapter] Forwarded Claude output_config as Gemini responseFormat.text.schema. Title: ${format.schema.title || "untitled"}`
                );
            }
        }

        googleRequest.generationConfig = generationConfig;

        // Convert Claude tools to Gemini functionDeclarations
        const builtInToolChoiceNames = new Set();
        if (claudeBody.tools && Array.isArray(claudeBody.tools) && claudeBody.tools.length > 0) {
            let hasCodeExecutionTool = false;
            let hasWebSearchTool = false;
            let hasUrlContextTool = false;
            const functionDeclarations = [];

            for (const tool of claudeBody.tools) {
                // Handle specialized web search tool type (e.g. from Claude's search integration)
                if (
                    typeof tool.type === "string" &&
                    tool.type.startsWith("web_search_") &&
                    tool.name === "web_search"
                ) {
                    hasWebSearchTool = true;
                    if (tool.name) builtInToolChoiceNames.add(tool.name);
                    this.logger.info(
                        `[Adapter] Detected web search tool in Claude request (name: ${tool.name}, type: ${tool.type}), mapping to Gemini googleSearch.`
                    );
                    continue; // Skip adding to functionDeclarations
                }

                // Handle specialized web fetch tool type, mapped to urlContext (Gemini 2.0 Feature)
                if (typeof tool.type === "string" && tool.type.startsWith("web_fetch_") && tool.name === "web_fetch") {
                    hasUrlContextTool = true;
                    if (tool.name) builtInToolChoiceNames.add(tool.name);
                    this.logger.info(
                        `[Adapter] Detected web fetch tool in Claude request (name: ${tool.name}, type: ${tool.type}), mapping to Gemini urlContext.`
                    );
                    continue; // Skip adding to functionDeclarations
                }

                // Handle specialized code execution tool, mapped to Gemini codeExecution.
                if (typeof tool.type === "string" && tool.type.startsWith("code_execution_")) {
                    if (
                        tool.name !== "code_execution" ||
                        !FormatConverter.CLAUDE_CODE_EXECUTION_TOOL_TYPES.has(tool.type)
                    ) {
                        throw new Error(`Unsupported Claude code execution tool: ${tool.type}`);
                    }
                    hasCodeExecutionTool = true;
                    if (tool.name) builtInToolChoiceNames.add(tool.name);
                    this.logger.info(
                        `[Adapter] Detected code execution tool in Claude request (name: ${tool.name}, type: ${tool.type}), mapping to Gemini codeExecution.`
                    );
                    continue; // Skip adding to functionDeclarations
                }

                if (tool.name) {
                    const declaration = { name: tool.name };
                    if (tool.description) declaration.description = tool.description;
                    if (tool.input_schema) {
                        declaration.parametersJsonSchema = tool.input_schema;
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

            // If code execution tool was found, ensure codeExecution is added to tools
            if (hasCodeExecutionTool) {
                if (!googleRequest.tools) googleRequest.tools = [];
                if (!FormatConverter.hasGeminiCodeExecutionTool(googleRequest.tools)) {
                    googleRequest.tools.push({ codeExecution: {} });
                }
            }
        }

        // Convert Claude tool_choice to Gemini toolConfig
        if (claudeBody.tool_choice) {
            const functionCallingConfig = {};
            const hasClaudeFunctionDeclarations = this.hasGeminiFunctionDeclarations(googleRequest);
            const isBuiltInToolChoice =
                claudeBody.tool_choice.type === "tool" && builtInToolChoiceNames.has(claudeBody.tool_choice.name);
            if (claudeBody.tool_choice.type === "auto" && hasClaudeFunctionDeclarations) {
                functionCallingConfig.mode = "AUTO";
            } else if (claudeBody.tool_choice.type === "none" && hasClaudeFunctionDeclarations) {
                functionCallingConfig.mode = "NONE";
            } else if (claudeBody.tool_choice.type === "any" && hasClaudeFunctionDeclarations) {
                functionCallingConfig.mode = "ANY";
            } else if (
                claudeBody.tool_choice.type === "tool" &&
                claudeBody.tool_choice.name &&
                !isBuiltInToolChoice &&
                hasClaudeFunctionDeclarations
            ) {
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

        this._finalizeGoogleRequest(googleRequest, {
            forceCodeExecution: modelForceCodeExecution,
            forceWebSearch: modelForceWebSearch,
        });
        this.logger.info("[Adapter] Claude to Google translation complete.");
        return { cleanModelName, googleRequest, modelStreamingMode };
    }

    /**
     * Convert Google streaming response chunk to Claude format
     * @param {string} googleChunk - The Google response chunk
     * @param {string} modelName - The model name
     * @param {object} streamState - State object to track streaming progress
     */
    translateGoogleToClaudeStream(googleChunk, modelName = "gemini-flash-lite-latest", streamState = null) {
        this.logger.debug(`[Adapter] Debug: Received Google chunk for Claude: ${googleChunk}`);

        if (!streamState) {
            this.logger.warn(
                "[Adapter] streamState not provided, creating default state. This may cause issues with tool call tracking."
            );
            streamState = {};
        }
        if (streamState.completed || !googleChunk || googleChunk.trim() === "") {
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
            const claudeUsage = this._parseClaudeUsage(usage);
            const totalInputTokens = (usage.promptTokenCount || 0) + (usage.toolUsePromptTokenCount || 0);

            if (totalInputTokens > 0) {
                streamState.inputTokens = claudeUsage.input_tokens;
                streamState.cacheReadInputTokens = claudeUsage.cache_read_input_tokens;
                streamState.cacheCreationInputTokens = claudeUsage.cache_creation_input_tokens;
            }
            streamState.outputTokens = claudeUsage.output_tokens;
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
            const message = this._getGeminiPromptBlockMessage(googleResponse.promptFeedback);
            if (message) {
                streamState.error = { message, type: "invalid_request_error" };
                streamState.completed = true;
                return `event: error\ndata: ${JSON.stringify({ error: streamState.error, type: "error" })}\n\n`;
            }
            return null;
        }

        const events = [];

        const closeThinkingBlock = () => {
            if (!streamState.thinkingBlockStarted || streamState.thinkingBlockStopped) return;

            events.push({
                delta: {
                    signature: streamState.thinkingSignature || `proxy_thinking_${this._generateRequestId()}`,
                    type: "signature_delta",
                },
                index: streamState.thinkingBlockIndex,
                type: "content_block_delta",
            });
            events.push({
                index: streamState.thinkingBlockIndex,
                type: "content_block_stop",
            });
            streamState.thinkingBlockStopped = true;
            streamState.thinkingSignature = null;
        };

        const closeTextBlock = () => {
            if (!streamState.textBlockStarted || streamState.textBlockStopped) return;

            events.push({
                index: streamState.textBlockIndex,
                type: "content_block_stop",
            });
            streamState.textBlockStopped = true;
        };

        const emitServerToolBlocks = blocks => {
            for (const block of blocks) {
                closeThinkingBlock();
                closeTextBlock();

                const index = streamState.contentBlockIndex;
                if (block.type === "server_tool_use") {
                    events.push({
                        content_block: {
                            caller: block.caller || { type: "direct" },
                            id: block.id,
                            input: {},
                            name: block.name,
                            type: block.type,
                        },
                        index,
                        type: "content_block_start",
                    });
                    events.push({
                        delta: {
                            partial_json: JSON.stringify(block.input || {}),
                            type: "input_json_delta",
                        },
                        index,
                        type: "content_block_delta",
                    });
                } else {
                    events.push({
                        content_block: block,
                        index,
                        type: "content_block_start",
                    });
                }
                events.push({ index, type: "content_block_stop" });
                streamState.contentBlockIndex++;
            }
        };

        const emitTextContent = (text, citations = []) => {
            if (!text && citations.length === 0) return;

            closeThinkingBlock();
            if (!streamState.textBlockStarted || streamState.textBlockStopped) {
                events.push({
                    content_block: { text: "", type: "text" },
                    index: streamState.contentBlockIndex,
                    type: "content_block_start",
                });
                streamState.textBlockStarted = true;
                streamState.textBlockStopped = false;
                streamState.textBlockIndex = streamState.contentBlockIndex;
                streamState.contentBlockIndex++;
            }

            if (text) {
                events.push({
                    delta: { text, type: "text_delta" },
                    index: streamState.textBlockIndex,
                    type: "content_block_delta",
                });
            }
            for (const citation of citations) {
                events.push({
                    delta: { citation, type: "citations_delta" },
                    index: streamState.textBlockIndex,
                    type: "content_block_delta",
                });
            }
        };

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
                        cache_creation_input_tokens: streamState.cacheCreationInputTokens || 0,
                        cache_read_input_tokens: streamState.cacheReadInputTokens || 0,
                        input_tokens: streamState.inputTokens || 0,
                        output_tokens: 0,
                    },
                },
                type: "message_start",
            });
            streamState.messageStartSent = true;
        }

        // Preserve the existing metadata aggregation; only native tool parts
        // are converted as they arrive.
        const accumulatedServerToolMetadata = this._accumulateClaudeServerToolMetadata(candidate, streamState);
        const candidateParts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
        // Grounding metadata describes the candidate as a whole, without call IDs.
        // Attach it only to the last search response, as with the metadata fallback.
        const lastSearchResponsePart = [...candidateParts]
            .reverse()
            .find(part => part?.toolResponse?.toolType === "GOOGLE_SEARCH_WEB");

        // Process content parts
        if (candidateParts.length > 0) {
            for (const part of candidateParts) {
                if (part.thought === true && part.text) {
                    // Preserve Gemini thoughts as Claude thinking blocks. The proxy-issued
                    // opaque signature makes the block replayable through this adapter.
                    closeTextBlock();
                    if (!streamState.thinkingBlockStarted || streamState.thinkingBlockStopped) {
                        events.push({
                            content_block: { signature: "", thinking: "", type: "thinking" },
                            index: streamState.contentBlockIndex,
                            type: "content_block_start",
                        });
                        streamState.thinkingBlockStarted = true;
                        streamState.thinkingBlockStopped = false;
                        streamState.thinkingBlockIndex = streamState.contentBlockIndex;
                        streamState.thinkingSignature = `proxy_thinking_${this._generateRequestId()}`;
                        streamState.contentBlockIndex++;
                    }
                    events.push({
                        delta: { thinking: part.text, type: "thinking_delta" },
                        index: streamState.thinkingBlockIndex,
                        type: "content_block_delta",
                    });
                } else if (part.text) {
                    // Regular text content
                    emitTextContent(part.text);
                } else if (part.inlineData) {
                    // Image output - convert to markdown image format for streaming
                    // Close thinking block if open
                    closeThinkingBlock();
                    // Start text block if not started
                    if (!streamState.textBlockStarted || streamState.textBlockStopped) {
                        events.push({
                            content_block: { text: "", type: "text" },
                            index: streamState.contentBlockIndex,
                            type: "content_block_start",
                        });
                        streamState.textBlockStarted = true;
                        streamState.textBlockStopped = false;
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
                } else if (part.toolCall || part.toolResponse || part.executableCode || part.codeExecutionResult) {
                    const serverTools = this._buildClaudeServerToolBlocks(
                        {
                            content: { parts: [part] },
                            groundingMetadata:
                                candidate.finishReason && part === lastSearchResponsePart
                                    ? accumulatedServerToolMetadata.groundingMetadata
                                    : undefined,
                        },
                        streamState,
                        { includeMetadata: false }
                    );
                    emitServerToolBlocks(serverTools.blocks);
                } else if (part.functionCall) {
                    // Tool use
                    closeThinkingBlock();
                    closeTextBlock();
                    const toolUseId = `toolu_${this._generateRequestId()}`;
                    events.push({
                        content_block: {
                            caller: { type: "direct" },
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

        if (candidate.finishReason) {
            const citations = this._buildClaudeWebSearchCitations(accumulatedServerToolMetadata);
            emitTextContent("", citations);

            const metadataServerTools = this._buildClaudeServerToolBlocks(accumulatedServerToolMetadata, streamState, {
                includeCodeExecution: false,
                includeNative: false,
            });
            emitServerToolBlocks(metadataServerTools.blocks);
        }

        // Handle finish
        if (candidate.finishReason) {
            // Close any open blocks
            closeTextBlock();
            closeThinkingBlock();

            // Determine stop reason
            let stopReason = "end_turn";
            if (streamState.hasToolUse) {
                stopReason = "tool_use";
            } else if (candidate.finishReason === "MAX_TOKENS") {
                stopReason = "max_tokens";
            } else if (candidate.finishReason === "STOP") {
                stopReason = "end_turn";
            }

            const serverToolUse = this._formatClaudeServerToolUsage(streamState.serverToolUsage);
            events.push({
                delta: {
                    stop_reason: stopReason,
                    stop_sequence: null,
                },
                type: "message_delta",
                usage: {
                    cache_creation_input_tokens: streamState.cacheCreationInputTokens || 0,
                    cache_read_input_tokens: streamState.cacheReadInputTokens || 0,
                    input_tokens: streamState.inputTokens || 0,
                    output_tokens: streamState.outputTokens || 0,
                    ...(Object.keys(serverToolUse).length > 0 ? { server_tool_use: serverToolUse } : {}),
                },
            });

            events.push({ type: "message_stop" });
            streamState.completed = true;
        }

        if (events.length === 0) return null;

        return events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("");
    }

    /**
     * Convert Google non-stream response to Claude format
     */
    convertGoogleToClaudeNonStream(googleResponse, modelName = "gemini-flash-lite-latest") {
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
        const claudeUsage = this._parseClaudeUsage(usage);

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
                usage: claudeUsage,
            };
        }

        let hasToolUse = false;
        const serverToolState = {};

        if (candidate.content && Array.isArray(candidate.content.parts)) {
            const lastSearchResponsePart = [...candidate.content.parts]
                .reverse()
                .find(part => part?.toolResponse?.toolType === "GOOGLE_SEARCH_WEB");
            for (const part of candidate.content.parts) {
                if (part.thought === true && part.text) {
                    content.push({
                        signature: `proxy_thinking_${this._generateRequestId()}`,
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
                } else if (part.toolCall || part.toolResponse || part.executableCode || part.codeExecutionResult) {
                    const serverTools = this._buildClaudeServerToolBlocks(
                        {
                            content: { parts: [part] },
                            groundingMetadata:
                                part === lastSearchResponsePart ? candidate.groundingMetadata : undefined,
                        },
                        serverToolState,
                        { includeMetadata: false }
                    );
                    content.push(...serverTools.blocks);
                } else if (part.functionCall) {
                    hasToolUse = true;
                    content.push({
                        caller: { type: "direct" },
                        id: `toolu_${this._generateRequestId()}`,
                        input: part.functionCall.args || {},
                        name: part.functionCall.name,
                        type: "tool_use",
                    });
                }
            }
        }

        const metadataServerTools = this._buildClaudeServerToolBlocks(candidate, serverToolState, {
            includeCodeExecution: false,
            includeNative: false,
        });
        content.push(...metadataServerTools.blocks);

        const webSearchCitations = this._buildClaudeWebSearchCitations(candidate);
        if (webSearchCitations.length > 0) {
            const citedTextBlock = [...content].reverse().find(block => block.type === "text");
            if (citedTextBlock) citedTextBlock.citations = webSearchCitations;
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

        const serverToolUse = this._formatClaudeServerToolUsage(serverToolState.serverToolUsage);

        return {
            content: content.length > 0 ? content : [{ text: "", type: "text" }],
            id: messageId,
            model: modelName,
            role: "assistant",
            stop_reason: stopReason,
            stop_sequence: null,
            type: "message",
            usage: {
                ...claudeUsage,
                ...(Object.keys(serverToolUse).length > 0 ? { server_tool_use: serverToolUse } : {}),
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
        // 1) built-in tool overrides: trailing `-search` / `-code`
        // 2) streaming override: trailing `-real` / `-fake` after any thinking suffix
        // 3) thinkingLevel override: trailing `-minimal` / `(minimal)` etc.
        // Combined user-facing suffix order: thinking -> streaming -> built-in tools
        const rawModel = responseBody.model || "gemini-flash-lite-latest";
        const {
            cleanModelName: toolStrippedModel,
            forceCodeExecution: modelForceCodeExecution,
            forceWebSearch: modelForceWebSearch,
        } = FormatConverter.parseModelBuiltInToolSuffixes(rawModel);
        const { cleanModelName: streamStrippedModel, streamingMode: modelStreamingMode } =
            FormatConverter.parseModelStreamingModeSuffix(toolStrippedModel);
        const { cleanModelName, thinkingLevel: modelThinkingLevel } =
            FormatConverter.parseModelThinkingLevel(streamStrippedModel);

        const modelForceToolFlags = [];
        if (modelForceWebSearch) modelForceToolFlags.push("forceWebSearch=true");
        if (modelForceCodeExecution) modelForceToolFlags.push("forceCodeExecution=true");
        if (modelForceToolFlags.length > 0) {
            this.logger.info(
                `[Adapter] Detected built-in tool suffixes in model name: "${rawModel}" -> model="${toolStrippedModel}", ${modelForceToolFlags.join(", ")}`
            );
        }
        if (modelStreamingMode) {
            this.logger.info(
                `[Adapter] Detected streamingMode suffix in model name: "${toolStrippedModel}" -> model="${streamStrippedModel}", streamingMode="${modelStreamingMode}"`
            );
        }
        if (modelThinkingLevel) {
            this.logger.info(
                `[Adapter] Detected thinkingLevel suffix in model name: "${streamStrippedModel}" -> model="${cleanModelName}", thinkingLevel="${modelThinkingLevel}"`
            );
        }

        const toolChoice = responseBody.tool_choice;

        // `tool_choice: {type:"allowed_tools", tools:[...]}` contains selectors,
        // not full tool definitions. Resolve those selectors against responseBody.tools
        // before flattening namespace tools so schemas and descriptions are preserved.
        const availableTools = [
            ...(Array.isArray(responseBody.tools) ? responseBody.tools : []),
            ...(Array.isArray(responseBody.input)
                ? responseBody.input.flatMap(item =>
                      item?.type === "additional_tools" && Array.isArray(item.tools) ? item.tools : []
                  )
                : []),
        ];
        let effectiveTools = availableTools;
        if (
            toolChoice &&
            typeof toolChoice === "object" &&
            toolChoice.type === "allowed_tools" &&
            Array.isArray(toolChoice.tools)
        ) {
            effectiveTools = this._filterResponseToolsBySelectors(availableTools, toolChoice.tools);
        }
        const responseFunctionTools = this._flattenResponseFunctionTools(effectiveTools);
        const toGeminiFunctionName = (name, namespace) => {
            if (typeof namespace !== "string" || !namespace || typeof name !== "string" || !name) return name;
            return (
                responseFunctionTools.namespaceAliasMap[`${namespace}\u0000${name}`] ||
                this._encodeResponseNamespaceFunctionName(namespace, name)
            );
        };

        const googleContents = [];
        let systemInstructionText = "";

        const isPlainObject = value => value !== null && typeof value === "object" && !Array.isArray(value);
        const ensureJSONObject = (value, fallbackKey) => (isPlainObject(value) ? value : { [fallbackKey]: value });
        const safeParseJSON = (value, fallbackKey) => {
            if (typeof value !== "string") {
                return ensureJSONObject(value, fallbackKey);
            }

            try {
                return ensureJSONObject(JSON.parse(value || "{}"), fallbackKey);
            } catch (e) {
                this.logger.warn(`[Adapter] Failed to parse JSON for ${fallbackKey}: ${e.message}`);
                return { [fallbackKey]: value };
            }
        };

        const convertFunctionCallOutput = async output => {
            if (!Array.isArray(output)) {
                return { response: safeParseJSON(output, "unparsed_output") };
            }

            const normalizedOutput = [];
            const parts = [];
            for (let itemIndex = 0; itemIndex < output.length; itemIndex++) {
                const contentPart = output[itemIndex];
                if (contentPart?.type === "input_text") {
                    normalizedOutput.push({ text: contentPart.text || "", type: "input_text" });
                    continue;
                }

                if (contentPart?.type === "input_image" || contentPart?.type === "input_file") {
                    const media = await this._loadFunctionResponseMedia(contentPart, itemIndex);
                    if (media) {
                        normalizedOutput.push({
                            content: { $ref: media.displayName },
                            ...(contentPart.filename ? { filename: contentPart.filename } : {}),
                            type: contentPart.type,
                        });
                        parts.push(media.part);
                    } else {
                        normalizedOutput.push(contentPart);
                    }
                    continue;
                }

                normalizedOutput.push(contentPart);
            }

            return {
                response: { output: normalizedOutput },
                ...(parts.length > 0 ? { parts } : {}),
            };
        };

        const serializeResponseTextPart = contentPart => {
            const text = typeof contentPart?.text === "string" ? contentPart.text : "";
            if (contentPart?.type !== "output_text" || !Array.isArray(contentPart.annotations)) {
                return text;
            }

            // Gemini request content has no equivalent to Responses API output_text
            // annotations. Preserve URL citations in the replayed assistant history as
            // text so stateless follow-up requests can still reason about their sources.
            const seenCitationUrls = new Set();
            const citations = [];
            for (const annotation of contentPart.annotations) {
                if (
                    annotation?.type !== "url_citation" ||
                    typeof annotation.url !== "string" ||
                    !annotation.url ||
                    seenCitationUrls.has(annotation.url)
                ) {
                    continue;
                }
                seenCitationUrls.add(annotation.url);
                citations.push({
                    ...(typeof annotation.title === "string" && annotation.title ? { title: annotation.title } : {}),
                    url: annotation.url,
                });
            }

            if (citations.length === 0) return text;
            return `${text}\n\n[Source citations from the prior assistant response]\n${citations
                .map(citation => `- ${citation.title ? `${citation.title}: ` : ""}${citation.url}`)
                .join("\n")}`;
        };

        const extractTextContent = content => {
            if (typeof content === "string") return content;
            if (!Array.isArray(content)) return "";
            return content
                .filter(
                    c =>
                        c &&
                        typeof c === "object" &&
                        (c.type === "text" || c.type === "input_text" || c.type === "output_text")
                )
                .map(serializeResponseTextPart)
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
            //
            // Tool-call translation notes (Responses API <-> Gemini function calling):
            // - The Responses API `call_id` is written back into BOTH the Gemini
            //   `functionCall.id` and the paired `functionResponse.id`, so parallel calls
            //   can be paired without ambiguity. On the way out (Gemini -> Responses), the
            //   Gemini-issued `functionCall.id` is passed through as `call_id`.
            // - Adjacent function_call items are merged into ONE model turn, and the
            //   function_call_output items answering them are merged into ONE user turn,
            //   matching Gemini's convention for parallel function calling.
            const callIdToName = Object.create(null);
            const toolCallsInOrder = [];
            const toolCallsAnsweredByCallId = new Set();
            const functionResponseMetaByItem = new Map();
            for (let itemIndex = 0; itemIndex < input.length; itemIndex++) {
                const scannedItem = input[itemIndex];
                if (!scannedItem || typeof scannedItem !== "object") {
                    continue;
                }
                if (
                    ["function_call", "custom_tool_call"].includes(scannedItem.type) &&
                    typeof scannedItem.name === "string"
                ) {
                    const geminiFunctionName = toGeminiFunctionName(scannedItem.name, scannedItem.namespace);
                    toolCallsInOrder.push({
                        callId:
                            typeof scannedItem.call_id === "string" && scannedItem.call_id ? scannedItem.call_id : null,
                        index: itemIndex,
                        matched: false,
                        name: geminiFunctionName,
                    });
                    if (typeof scannedItem.call_id === "string" && scannedItem.call_id) {
                        callIdToName[scannedItem.call_id] = geminiFunctionName;
                    }
                } else if (["function_call_output", "custom_tool_call_output"].includes(scannedItem.type)) {
                    const outputCallId =
                        typeof scannedItem.call_id === "string" && scannedItem.call_id ? scannedItem.call_id : null;
                    if (outputCallId) {
                        toolCallsAnsweredByCallId.add(outputCallId);
                    }
                    // Prefer the name already resolved from the paired call. Namespaced
                    // Responses tools use a flattened Gemini alias, so the raw output
                    // name (for example, `lookup`) must not replace the alias associated
                    // with its call_id. If the call is not present in this input history,
                    // rebuild the same deterministic alias from the explicit namespace.
                    let functionName =
                        (outputCallId ? callIdToName[outputCallId] : undefined) ||
                        (typeof scannedItem.name === "string" && scannedItem.name
                            ? toGeminiFunctionName(scannedItem.name, scannedItem.namespace)
                            : undefined);
                    if (!functionName) {
                        // No usable call_id/name on the output item. When the history holds
                        // exactly one call issued before this output that is still unmatched,
                        // pair by elimination; otherwise use a clearly-labeled placeholder
                        // (and log loudly) instead of silently feeding the model a wrong name.
                        let eliminationCandidate = null;
                        for (const toolCall of toolCallsInOrder) {
                            if (toolCall.index >= itemIndex) {
                                break;
                            }
                            if (
                                toolCall.matched ||
                                (toolCall.callId && toolCallsAnsweredByCallId.has(toolCall.callId))
                            ) {
                                continue;
                            }
                            if (eliminationCandidate) {
                                eliminationCandidate = null;
                                break;
                            }
                            eliminationCandidate = toolCall;
                        }
                        if (eliminationCandidate) {
                            eliminationCandidate.matched = true;
                            functionName = eliminationCandidate.name;
                            this.logger.debug(
                                `[Adapter] Paired function_call_output with single unmatched function_call by elimination: ${eliminationCandidate.name}`
                            );
                        } else {
                            functionName = "unknown_function";
                            this.logger.warn(
                                `[Adapter] function_call_output has no resolvable function name (call_id: ${outputCallId || "missing"}), using placeholder "unknown_function"`
                            );
                        }
                    }
                    functionResponseMetaByItem.set(scannedItem, {
                        id: outputCallId || undefined,
                        name: functionName,
                    });
                }
            }

            // Keep assistant messages, reasoning and tool calls in the same model turn.
            // The function_call_output items answering them form the following user turn.
            let pendingModelParts = [];
            let pendingFunctionResponseParts = [];
            const flushToolTurns = () => {
                if (pendingModelParts.length > 0) {
                    googleContents.push({
                        parts: pendingModelParts,
                        role: "model",
                    });
                    pendingModelParts = [];
                }
                if (pendingFunctionResponseParts.length > 0) {
                    googleContents.push({
                        parts: pendingFunctionResponseParts,
                        role: "user",
                    });
                    pendingFunctionResponseParts = [];
                }
            };

            for (const item of input) {
                if (typeof item === "string") {
                    // Array of strings (plain content separates tool rounds)
                    flushToolTurns();
                    googleContents.push({
                        parts: [{ text: item }],
                        role: "user",
                    });
                } else if (item && typeof item === "object") {
                    if (item.type === "additional_tools" || item.role === "system" || item.role === "developer") {
                        continue;
                    }
                    if (item.type === "code_interpreter_call") {
                        if (pendingFunctionResponseParts.length > 0) {
                            flushToolTurns();
                        }
                        // Replay executed code in the model turn alongside any function calls.
                        // Responses container/item IDs do not identify native Gemini executions.
                        if (typeof item.code === "string" && item.code) {
                            pendingModelParts.push({
                                executableCode: { code: item.code, language: "PYTHON" },
                            });
                        }
                        if (item.status === "completed" || item.status === "failed") {
                            const logs = Array.isArray(item.outputs)
                                ? item.outputs
                                      .filter(output => output?.type === "logs" && typeof output.logs === "string")
                                      .map(output => output.logs)
                                      .join("")
                                : "";
                            pendingModelParts.push({
                                codeExecutionResult: {
                                    outcome: item.status === "completed" ? "OUTCOME_OK" : "OUTCOME_FAILED",
                                    output: logs,
                                },
                            });
                        }
                        continue;
                    }
                    if (item.type === "reasoning") {
                        const summary = Array.isArray(item.summary)
                            ? item.summary
                                  .filter(
                                      part =>
                                          part?.type === "summary_text" &&
                                          typeof part.text === "string" &&
                                          part.text.length > 0
                                  )
                                  .map(part => part.text)
                                  .join("\n")
                            : "";
                        if (summary) {
                            if (pendingFunctionResponseParts.length > 0) {
                                flushToolTurns();
                            }
                            pendingModelParts.push({
                                text: `[Previous assistant reasoning summary]\n${summary}`,
                            });
                        }
                        continue;
                    }
                    // Handle different message types in Response API
                    if (item.type === "function_call" || item.type === "custom_tool_call") {
                        // Function call from model (assistant message with tool call).
                        // A tool round closes as soon as its outputs begin, so starting a new
                        // functionCall turn after pending responses flushes that round first.
                        if (pendingFunctionResponseParts.length > 0) {
                            flushToolTurns();
                        }
                        const rawArgs =
                            item && typeof item === "object" && Object.prototype.hasOwnProperty.call(item, "arguments")
                                ? item["arguments"]
                                : undefined;
                        const functionCallPart = {
                            functionCall: {
                                args:
                                    item.type === "custom_tool_call"
                                        ? { input: item.input }
                                        : safeParseJSON(rawArgs, "unparsed_arguments"),
                                name: toGeminiFunctionName(item.name, item.namespace),
                            },
                        };
                        if (!pendingModelParts.some(part => part.functionCall)) {
                            functionCallPart.thoughtSignature = FormatConverter.DUMMY_THOUGHT_SIGNATURE;
                        }
                        if (typeof item.call_id === "string" && item.call_id) {
                            functionCallPart.functionCall.id = item.call_id;
                        }
                        pendingModelParts.push(functionCallPart);
                        this.logger.debug(
                            `[Adapter] Converted Response API function_call to Gemini functionCall: ${item.name}`
                        );
                    } else if (item.type === "function_call_output" || item.type === "custom_tool_call_output") {
                        // Function output (tool result from user). Responses must live in the
                        // user turn directly following the model turn with the calls, so close
                        // the pending model turn first and keep accumulating outputs.
                        if (pendingModelParts.length > 0) {
                            googleContents.push({
                                parts: pendingModelParts,
                                role: "model",
                            });
                            pendingModelParts = [];
                        }
                        const responseMeta = functionResponseMetaByItem.get(item) || {
                            id: undefined,
                            name: "unknown_function",
                        };
                        const convertedOutput = await convertFunctionCallOutput(item.output);
                        const functionResponseBody = {
                            name: responseMeta.name,
                            ...convertedOutput,
                        };
                        if (responseMeta.id) {
                            functionResponseBody.id = responseMeta.id;
                        }
                        pendingFunctionResponseParts.push({
                            functionResponse: functionResponseBody,
                        });
                        this.logger.debug(
                            `[Adapter] Converted Response API function_call_output to Gemini functionResponse: ${responseMeta.name}`
                        );
                    } else {
                        // Regular assistant messages belong to the same model turn as
                        // adjacent calls. User messages end the pending tool round.
                        const googleParts = [];

                        if (typeof item.content === "string") {
                            googleParts.push({ text: item.content });
                        } else if (Array.isArray(item.content)) {
                            // Multi-modal content
                            for (const contentPart of item.content) {
                                if (
                                    contentPart.type === "text" ||
                                    contentPart.type === "input_text" ||
                                    contentPart.type === "output_text"
                                ) {
                                    googleParts.push({ text: serializeResponseTextPart(contentPart) });
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
                            if (item.role === "assistant") {
                                if (pendingFunctionResponseParts.length > 0) {
                                    flushToolTurns();
                                }
                                pendingModelParts.push(...googleParts);
                            } else {
                                flushToolTurns();
                                googleContents.push({
                                    parts: googleParts,
                                    role: "user",
                                });
                            }
                        }
                    }
                }
            }
            // Flush any tool turns still open at the end of the input array.
            flushToolTurns();
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
        if (
            this.serverSystem.config.forceThinking &&
            (!thinkingConfig || thinkingConfig.includeThoughts === undefined)
        ) {
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

        const responseHostedToolTypes = new Set([
            "code_interpreter",
            "computer_use_preview",
            "file_search",
            "web_search",
            "web_search_preview",
        ]);

        // Convert tools
        const tools = effectiveTools;
        if (tools && Array.isArray(tools) && tools.length > 0) {
            const functionDeclarations = responseFunctionTools.functionDeclarations;
            let hasCodeExecution = false;
            let hasWebSearch = false;

            for (const tool of tools) {
                if (tool.type === "web_search_preview" || tool.type === "web_search") {
                    hasWebSearch = true;
                    if (tool.type === "web_search" && tool.external_web_access === false) {
                        // Gemini cannot preserve OpenAI's cache-only mode. Keep search available as a
                        // compatibility fallback and make the live-search behavior explicit in logs.
                        this.logger.warn(
                            "[Adapter] OpenAI web_search requested external_web_access=false, but Gemini " +
                                "googleSearch has no cache-only mode; enabling live search for compatibility."
                        );
                    }
                } else if (tool.type === "code_interpreter") {
                    hasCodeExecution = true;
                } else if (tool.type === "file_search") {
                    this.logger.debug("[Adapter] file_search tool detected but not supported by Gemini, skipping...");
                } else if (tool.type === "computer_use_preview") {
                    this.logger.debug(
                        "[Adapter] computer_use_preview tool detected but not supported by Gemini, skipping..."
                    );
                }
            }

            // Build tools array
            if (functionDeclarations.length > 0) {
                googleRequest.tools = [{ functionDeclarations }];
                this.logger.info(
                    `[Adapter] Converted ${functionDeclarations.length} OpenAI Response API tool(s) to Gemini format`
                );
                if (responseFunctionTools.namespaceFunctionCount > 0) {
                    this.logger.debug(
                        `[Adapter] Flattened ${responseFunctionTools.namespaceFunctionCount} namespaced Responses API function(s) for Gemini and enabled reversible name mapping`
                    );
                }
            }

            if (hasWebSearch) {
                if (!googleRequest.tools) {
                    googleRequest.tools = [];
                }
                if (!FormatConverter.hasGeminiGoogleSearchTool(googleRequest.tools)) {
                    googleRequest.tools.push({ googleSearch: {} });
                    this.logger.info("[Adapter] Added googleSearch tool for OpenAI Response API web_search");
                }
            }

            if (hasCodeExecution) {
                if (!googleRequest.tools) {
                    googleRequest.tools = [];
                }
                if (!FormatConverter.hasGeminiCodeExecutionTool(googleRequest.tools)) {
                    googleRequest.tools.push({ codeExecution: {} });
                    this.logger.info("[Adapter] Added codeExecution tool for OpenAI Response API code execution");
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

            const ensureCodeExecutionTool = () => {
                if (!googleRequest.tools) googleRequest.tools = [];
                if (!FormatConverter.hasGeminiCodeExecutionTool(googleRequest.tools)) {
                    googleRequest.tools.push({ codeExecution: {} });
                }
            };

            const hasFunctionDeclarations = () => this.hasGeminiFunctionDeclarations(googleRequest);

            // tool_choice can be a mode string ("none"|"auto"|"required"),
            // or an object selector (allowed_tools/custom/function/hosted tools).
            if (typeof toolChoice === "string") {
                if (toolChoice === "auto" && hasFunctionDeclarations()) {
                    functionCallingConfig.mode = "AUTO";
                } else if (toolChoice === "none" && hasFunctionDeclarations()) {
                    functionCallingConfig.mode = "NONE";
                } else if (toolChoice === "required" && hasFunctionDeclarations()) {
                    functionCallingConfig.mode = "ANY";
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
                    // Constrain available tools. effectiveTools contains the full definitions selected above.
                    // Gemini functionCallingConfig only applies to function declarations, not hosted/built-in tools.
                    const allowedToolsHaveHostedTool =
                        Array.isArray(tools) && tools.some(t => t && responseHostedToolTypes.has(t.type));
                    if (hasFunctionDeclarations() && !allowedToolsHaveHostedTool) {
                        if (toolChoice.mode === "auto") {
                            // Gemini only accepts allowedFunctionNames with ANY or VALIDATED.
                            // VALIDATED still permits both natural language and tool calls.
                            functionCallingConfig.mode = "VALIDATED";
                        } else if (toolChoice.mode === "required") {
                            functionCallingConfig.mode = "ANY";
                        }

                        const names = responseFunctionTools.functionDeclarations.map(declaration => declaration.name);
                        if (names.length > 0) {
                            functionCallingConfig.allowedFunctionNames = names;
                        }
                    }
                } else if (toolChoice.type === "custom") {
                    // Force a specific custom tool; map to Gemini "ANY" with allowed function name.
                    if (typeof toolChoice.name === "string" && toolChoice.name) {
                        functionCallingConfig.mode = "ANY";
                        const geminiName = toGeminiFunctionName(toolChoice.name, toolChoice.namespace);
                        if (
                            !responseFunctionTools.functionDeclarations.some(
                                declaration => declaration.name === geminiName
                            ) ||
                            responseFunctionTools.functionNameMap[geminiName]?.type !== "custom"
                        ) {
                            throw new Error(
                                `Custom tool_choice refers to an undeclared custom tool: ${toolChoice.name}`
                            );
                        }
                        functionCallingConfig.allowedFunctionNames = [geminiName];
                    }
                } else if (toolChoice.type === "function") {
                    // Back-compat with Chat Completions style: { type:"function", name:"..." }
                    const funcName = toolChoice.name;
                    if (typeof funcName === "string" && funcName) {
                        functionCallingConfig.mode = "ANY";
                        functionCallingConfig.allowedFunctionNames = [
                            toGeminiFunctionName(funcName, toolChoice.namespace),
                        ];
                    }
                } else if (toolChoice.type === "web_search_preview" || toolChoice.type === "web_search") {
                    ensureGoogleSearchTool();
                } else if (toolChoice.type === "code_interpreter") {
                    ensureCodeExecutionTool();
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
                if (schema !== undefined && schema !== null) {
                    generationConfig.responseFormat = { text: { mimeType: "APPLICATION_JSON", schema } };
                    this.logger.info(
                        `[Adapter] Forwarded OpenAI Response API text.format as Gemini responseFormat.text.schema: ${jsonSchemaConfig.name || "unnamed"}`
                    );
                }
            } else if (formatType === "json_object") {
                generationConfig.responseFormat = {
                    text: { mimeType: "APPLICATION_JSON", schema: { additionalProperties: true, type: "object" } },
                };
                this.logger.info(
                    "[Adapter] Set responseFormat.text.mimeType to APPLICATION_JSON for OpenAI Response API json_object format"
                );
            }
        }

        this._finalizeGoogleRequest(googleRequest, {
            forceCodeExecution: modelForceCodeExecution,
            forceWebSearch: modelForceWebSearch,
        });
        this.logger.info("[Adapter] OpenAI Response API to Google translation complete.");
        return {
            cleanModelName,
            googleRequest,
            modelStreamingMode,
            responseFunctionNameMap: responseFunctionTools.functionNameMap,
        };
    }
}

module.exports = FormatConverter;

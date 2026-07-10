const fs = require("fs");
const path = require("path");

const bundle = path.join(__dirname, "..", "node_modules", "playwright-core", "lib", "coreBundle.js");
let source = fs.readFileSync(bundle, "utf8");
const replacements = [
    [
        "url: pageError.location.url,\n              line: pageError.location.lineNumber,\n              column: pageError.location.columnNumber",
        'url: pageError.location?.url ?? "",\n              line: pageError.location?.lineNumber ?? 0,\n              column: pageError.location?.columnNumber ?? 0',
    ],
    [
        "const request2 = this._webSocketRequests.get(event.requestId);\n        assert(request2);\n        const response2 = this._webSocketResponses.get(event.requestId);\n        assert(response2);",
        "const request2 = this._webSocketRequests.get(event.requestId);\n        const response2 = this._webSocketResponses.get(event.requestId);\n        if (!request2 || !response2) return;",
    ],
];
for (const [before, after] of replacements) {
    if (source.includes(before)) source = source.split(before).join(after);
    if (!source.includes(after)) {
        throw new Error("The installed Playwright bundle does not match the required Camoufox patch contract.");
    }
}
fs.writeFileSync(bundle, source);

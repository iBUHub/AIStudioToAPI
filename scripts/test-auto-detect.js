/**
 * Detection tests against the REAL captured ListModels payload.
 * Run: node scripts/test-auto-detect.js
 */
const fs = require("fs");
const path = require("path");
process.env.DYNAMIC_MODELS_STRICT = "true";
delete process.env.DYNAMIC_MODELS_EXTRA_BLOCKLIST;

const BrowserManager = require("../src/core/BrowserManager");
const bm = Object.create(BrowserManager.prototype);
bm.logger = { debug: () => {}, info: () => {}, warn: () => {} };
bm._incompatibleModels = new Map();

// ---- Batch 1: REAL captured payload (subset saved from a live session) ----
const realText = fs.readFileSync(path.join(__dirname, "..", "debug_listmodels_real_capture.json"), "utf8");

function run(text) {
    bm._incompatibleModels = new Map();
    const models = bm._parseListModelsResponse(text) || [];
    return {
        filtered: [...new Set([...bm._incompatibleModels.values()].map(r => `${r.name} [${r.basis}]`))],
        kept: models.map(m => m.name),
        models,
    };
}

const r1 = run(realText);
const AGENTS = [
    "models/antigravity-preview-05-2026",
    "models/deep-research-preview-04-2026",
    "models/deep-research-max-preview-04-2026",
];

const assert = (cond, msg) => {
    if (!cond) {
        console.error("❌ FAIL:", msg);
        process.exit(1);
    }
    console.log("✅", msg);
};

console.log("KEPT:", r1.kept);
console.log("FILTERED:", r1.filtered);

for (const a of AGENTS) assert(!r1.kept.includes(a), `agent ${a} filtered`);
assert(r1.filtered.filter(f => f.includes("[type]")).length === 3, "all 3 agents detected via model-class enum [type]");
assert(r1.kept.includes("models/gemini-3.7-flash"), "regular text model kept");
assert(r1.kept.includes("models/gemma-4-31b-it"), "gemma kept");
const flash = r1.models.find(m => m.name === "models/gemini-3.7-flash");
assert(
    flash && flash.inputTokenLimit === 1048576 && flash.outputTokenLimit === 65536,
    "token limits read from verified indices [5]/[6]"
);
assert(flash && Array.isArray(flash.supportedGenerationMethods), "methods exposed on kept models");
assert(
    !r1.kept.includes("models/gemini-3.5-live-translate-preview"),
    "bidi-only live model filtered (no routable method)"
);
assert(
    !r1.kept.includes("models/veo-3.1-generate-preview"),
    "predictLongRunning video model filtered (no routable method)"
);

// ---- Batch 2: simulated Google schema shift (extra field inserted at index 1) ----
// Anchors no longer line up -> code must fall back to constrained structural scanning
// instead of misreading fields or crashing.
const orig = JSON.parse(realText)[0];
const agentEntry = orig.find(e => e[0] === AGENTS[0]);
const normalEntry = orig.find(e => e[0] === "models/gemma-4-31b-it");
const shifted = JSON.stringify([
    [
        [...agentEntry.slice(0, 1), "SHIFT", ...agentEntry.slice(1)],
        [...normalEntry.slice(0, 1), "SHIFT", ...normalEntry.slice(1)],
    ],
]);
const r2 = run(shifted);
console.log("\nSHIFTED-LAYOUT KEPT:", r2.kept, "| FILTERED:", r2.filtered);
assert(!r2.kept.includes(AGENTS[0]), "shifted layout: agent still auto-filtered via fallback scan");
assert(r2.kept.includes(normalEntry[0]), "shifted layout: regular model survives fallback scan");

// ---- Batch 3: operator blocklist (optional, env-driven) ----
process.env.DYNAMIC_MODELS_EXTRA_BLOCKLIST = "gemma";
const r3 = run(realText);
delete process.env.DYNAMIC_MODELS_EXTRA_BLOCKLIST;
console.log("\nBLOCKLIST FILTERED:", r3.filtered);
assert(
    !r3.kept.includes("models/gemma-4-31b-it") &&
        r3.filtered.some(f => f.startsWith("models/gemma-4-31b-it [blocklist]")),
    "env blocklist filters configured pattern only"
);

// ---- Batch 4: strict=false exposes everything ----
process.env.DYNAMIC_MODELS_STRICT = "false";
const r4 = run(realText);
process.env.DYNAMIC_MODELS_STRICT = "true";
const realEntryCount = orig.filter(
    e => Array.isArray(e) && e.length > 3 && typeof e[0] === "string" && String(e[0]).startsWith("models/")
).length;
assert(
    r4.kept.length === realEntryCount && !r4.filtered.length,
    `strict=false exposes all ${realEntryCount} entries unfiltered`
);

console.log("\nALL TESTS PASSED ✅");

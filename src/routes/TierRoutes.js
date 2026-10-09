/**
 * File: src/routes/TierRoutes.js
 * Description: Account tier probing (Pro/Free via gated image model) and model plaza data
 */

const fs = require("fs");
const path = require("path");
const { getTierStore } = require("../auth/TierStore");

const PROBE_MODEL = process.env.TIER_PROBE_MODEL || "gemini-3-pro-image";

class TierRoutes {
    constructor(serverSystem) {
        this.serverSystem = serverSystem;
        this.logger = serverSystem.logger;
        this.tierStore = getTierStore(this.logger);
        this.job = null;
    }

    setupRoutes(app, isAuthenticated) {
        app.get("/api/tiers", isAuthenticated, (req, res) => {
            res.json({
                job: this.job,
                tiers: this.tierStore.getAll(),
            });
        });

        app.post("/api/tiers/probe", isAuthenticated, async (req, res) => {
            if (this.job) {
                return res.status(409).json({ message: "tierProbeBusy" });
            }
            const { targetIndex } = req.body || {};
            if (typeof targetIndex !== "number") {
                return res.status(400).json({ message: "tierProbeInvalidIndex" });
            }
            const rotation = this.serverSystem.authSource.getRotationIndices();
            if (!rotation.includes(targetIndex)) {
                return res.status(400).json({ message: "tierProbeIndexNotFound" });
            }
            const previous = this.serverSystem.requestHandler.currentAuthIndex;
            this.job = { current: 0, done: 0, target: targetIndex, total: 1, type: "single" };
            try {
                const record = await this._probeOne(targetIndex);
                if (previous !== targetIndex) {
                    await this._restoreActive(previous);
                }
                record.restoredTo = previous;
                res.json({ message: "tierProbeSuccess", record });
            } catch (error) {
                this.logger.error(`[Tier] Probe of #${targetIndex} failed: ${error.message}`);
                res.status(500).json({ message: "tierProbeFailed", reason: error.message });
            } finally {
                this.job = null;
            }
        });

        app.post("/api/tiers/probe-all", isAuthenticated, (req, res) => {
            if (this.job) {
                return res.status(409).json({ message: "tierProbeBusy" });
            }
            const rotation = this.serverSystem.authSource.getRotationIndices();
            if (rotation.length === 0) {
                return res.status(400).json({ message: "tierProbeNoAccounts" });
            }
            const restoreTo = this.serverSystem.requestHandler.currentAuthIndex;
            this.job = {
                current: null,
                done: 0,
                restoreTo,
                startedAt: new Date().toISOString(),
                total: rotation.length,
                type: "all",
            };
            res.json({ message: "tierProbeStarted", total: rotation.length });
            this._runProbeAll(rotation, restoreTo).catch(error => {
                this.logger.error(`[Tier] Probe-all job failed: ${error.message}`);
            });
        });

        app.get("/api/plaza", isAuthenticated, (req, res) => {
            try {
                res.json(this._buildPlaza());
            } catch (error) {
                this.logger.error(`[Plaza] Failed to build plaza data: ${error.message}`);
                res.status(500).json({ message: "plazaFailed", reason: error.message });
            }
        });
    }

    async _runProbeAll(indices, restoreTo) {
        try {
            for (const index of indices) {
                if (this.job) this.job.current = index;
                try {
                    await this._probeOne(index);
                } catch (error) {
                    this.logger.error(`[Tier] Probe of #${index} failed: ${error.message}`);
                    this.tierStore.set(index, { detail: error.message, model: PROBE_MODEL, tier: "unknown" });
                }
                if (this.job) this.job.done += 1;
            }
        } finally {
            await this._restoreActive(restoreTo);
            this.job = null;
        }
    }

    async _restoreActive(index) {
        if (typeof index !== "number") return;
        try {
            await this.serverSystem.requestHandler._switchToSpecificAuth(index);
        } catch (error) {
            this.logger.warn(`[Tier] Failed to restore active account #${index}: ${error.message}`);
        }
    }

    async _probeOne(targetIndex) {
        const { requestHandler } = this.serverSystem;
        if (requestHandler.currentAuthIndex !== targetIndex) {
            this.logger.info(`[Tier] Switching to #${targetIndex} for probing...`);
            const result = await requestHandler._switchToSpecificAuth(targetIndex);
            if (!result.success) {
                throw new Error(result.reason || "switch failed");
            }
        }

        this.logger.info(`[Tier] Probing account #${targetIndex} with ${PROBE_MODEL}...`);
        const outcome = await this._fireProbeRequest();
        const record = {
            detail: outcome.detail,
            latencyMs: outcome.latencyMs,
            model: PROBE_MODEL,
            tier: outcome.tier,
        };
        this.tierStore.set(targetIndex, record);
        this.logger.info(`[Tier] Account #${targetIndex} => ${record.tier} (${outcome.latencyMs}ms)`);
        return record;
    }

    async _fireProbeRequest() {
        const { config } = this.serverSystem;
        const started = Date.now();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 240000);
        try {
            const resp = await fetch(`http://127.0.0.1:${config.httpPort}/v1/chat/completions`, {
                body: JSON.stringify({
                    max_tokens: 4096,
                    messages: [{ content: "Generate a 16x16 image: a single red dot on white background.", role: "user" }],
                    model: PROBE_MODEL,
                    stream: false,
                }),
                headers: {
                    Authorization: `Bearer ${config.apiKeys[0]}`,
                    "Content-Type": "application/json",
                },
                method: "POST",
                signal: controller.signal,
            });
            const latencyMs = Date.now() - started;
            const text = await resp.text();
            if (resp.ok) {
                return { detail: "image generation succeeded", latencyMs, tier: "Pro" };
            }
            let detail = text.slice(0, 200);
            try {
                const parsed = JSON.parse(text);
                detail = (parsed.error && parsed.error.message ? String(parsed.error.message) : detail).slice(0, 200);
            } catch (_) {}
            if (resp.status === 403 || /PERMISSION_DENIED/i.test(text)) {
                return { detail, latencyMs, tier: "Free" };
            }
            return { detail: `HTTP ${resp.status}: ${detail}`, latencyMs, tier: "unknown" };
        } catch (error) {
            return { detail: error.message, latencyMs: Date.now() - started, tier: "unknown" };
        } finally {
            clearTimeout(timer);
        }
    }

    _buildPlaza() {
        const modelsPath = path.join(process.cwd(), "configs", "models.json");
        const raw = JSON.parse(fs.readFileSync(modelsPath, "utf8"));
        const models = (raw.models || []).map(m => {
            const id = (m.name || "").replace(/^models\//, "");
            return {
                category: this._categorize(id),
                description: m.description || "",
                displayName: m.displayName || id,
                id,
                inputTokenLimit: m.inputTokenLimit || null,
                methods: m.supportedGenerationMethods || [],
                outputTokenLimit: m.outputTokenLimit || null,
            };
        });

        const tiers = this.tierStore.getAll();
        const summary = { Free: 0, Pro: 0, unknown: 0, untested: 0 };
        const rotation = this.serverSystem.authSource.getRotationIndices();
        for (const index of rotation) {
            const record = tiers[String(index)];
            if (!record) summary.untested += 1;
            else if (record.tier === "Pro") summary.Pro += 1;
            else if (record.tier === "Free") summary.Free += 1;
            else summary.unknown += 1;
        }

        return { job: this.job, models, probeModel: PROBE_MODEL, summary };
    }

    _categorize(id) {
        const lower = id.toLowerCase();
        if (lower.includes("tts")) return "audio";
        if (lower.includes("transcribe")) return "audio";
        if (lower.includes("image")) return "image";
        if (lower.includes("embedding")) return "embedding";
        if (lower.includes("lyria")) return "music";
        return "text";
    }
}

module.exports = TierRoutes;

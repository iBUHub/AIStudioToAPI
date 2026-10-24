/**
 * File: src/auth/TierStore.js
 * Description: Persistence for per-account AI Studio tier (Pro/Free) probe results
 */

const fs = require("fs");
const path = require("path");

const STORE_FILENAME = ".tiers.json";

class TierStore {
    constructor(logger) {
        this.logger = logger;
        this.filePath = path.join(process.cwd(), "configs", "auth", STORE_FILENAME);
        this.records = {};
        this._load();
    }

    _load() {
        try {
            if (fs.existsSync(this.filePath)) {
                this.records = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
            }
        } catch (error) {
            this.logger?.warn(`[TierStore] Failed to load tier store, starting empty: ${error.message}`);
            this.records = {};
        }
    }

    _save() {
        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.filePath, JSON.stringify(this.records, null, 2));
        } catch (error) {
            this.logger?.error(`[TierStore] Failed to persist tier store: ${error.message}`);
        }
    }

    getAll() {
        return this.records;
    }

    get(index) {
        return this.records[String(index)] || null;
    }

    set(index, record) {
        this.records[String(index)] = {
            ...record,
            checkedAt: new Date().toISOString(),
        };
        this._save();
    }

    remove(index) {
        if (this.records[String(index)]) {
            delete this.records[String(index)];
            this._save();
        }
    }
}

let instance = null;

function getTierStore(logger) {
    if (!instance) {
        instance = new TierStore(logger);
    }
    return instance;
}

module.exports = { getTierStore };

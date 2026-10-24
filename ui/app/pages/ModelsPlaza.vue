<!--
  File: ui/app/pages/ModelsPlaza.vue
  Description: Model plaza — browsable catalog of available models with tier availability summary
-->
<template>
    <div class="plaza-page">
        <header class="plaza-header">
            <div class="plaza-header-left">
                <button class="plaza-back" @click="goBack">← {{ t("back") }}</button>
                <h1>{{ t("modelPlaza") }}</h1>
            </div>
            <div class="plaza-header-right">
                <span class="summary-chip chip-pro">{{ t("tierProCount", { count: summary.Pro }) }}</span>
                <span class="summary-chip chip-free">{{ t("tierFreeCount", { count: summary.Free }) }}</span>
                <span class="summary-chip chip-untested">{{ t("tierUntestedCount", { count: summary.untested + summary.unknown }) }}</span>
                <el-button :disabled="!!job" size="small" type="primary" @click="probeAll">
                    {{ job ? t("tierJobRunning") : t("btnProbeAllTiers") }}
                </el-button>
            </div>
        </header>

        <div v-if="job" class="job-banner">
            {{ t("tierJobRunning") }} · {{ job.done }}/{{ job.total }}
            <span v-if="job.current !== null && job.current !== undefined">· #{{ job.current }}</span>
        </div>

        <div class="plaza-search">
            <el-input v-model="keyword" :placeholder="t('plazaSearch')" clearable />
        </div>

        <div v-if="loading" class="plaza-empty">{{ t("loading") }}</div>
        <div v-else-if="grouped.length === 0" class="plaza-empty">{{ t("plazaEmpty") }}</div>

        <div v-for="group in grouped" :key="group.category" class="plaza-group">
            <h2>{{ t(`plazaCat_${group.category}`) }} <span class="group-count">{{ group.models.length }}</span></h2>
            <div class="plaza-grid">
                <div v-for="m in group.models" :key="m.id" class="model-card">
                    <div class="model-card-head">
                        <span class="model-name">{{ m.displayName }}</span>
                        <el-tag v-if="m.category === 'image'" size="small" type="danger" effect="plain">
                            {{ t("plazaNeedPro") }}
                        </el-tag>
                        <el-tag v-if="m.id === probeModel" size="small" type="warning" effect="plain">
                            {{ t("plazaProbeModel") }}
                        </el-tag>
                    </div>
                    <div class="model-id">{{ m.id }}</div>
                    <div v-if="m.description" class="model-desc">{{ m.description }}</div>
                    <div class="model-meta">
                        <span v-if="m.inputTokenLimit">in {{ formatK(m.inputTokenLimit) }}</span>
                        <span v-if="m.outputTokenLimit">out {{ formatK(m.outputTokenLimit) }}</span>
                        <span v-if="m.methods && m.methods.length">{{ m.methods.join(" · ") }}</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import I18n from "../utils/i18n";

const t = (key, params) => I18n.t(key, params);
const router = useRouter();

const keyword = ref("");
const loading = ref(true);
const models = ref([]);
const summary = ref({ Free: 0, Pro: 0, unknown: 0, untested: 0 });
const job = ref(null);
const probeModel = ref("");
let pollTimer = null;

const goBack = () => router.push("/");

const formatK = n => (n >= 1000 ? `${Math.round(n / 1000)}K` : String(n));

const grouped = computed(() => {
    const kw = keyword.value.trim().toLowerCase();
    const filtered = kw
        ? models.value.filter(
              m =>
                  m.id.toLowerCase().includes(kw) ||
                  (m.displayName || "").toLowerCase().includes(kw) ||
                  (m.description || "").toLowerCase().includes(kw)
          )
        : models.value;
    const order = ["text", "image", "audio", "music", "embedding", "other"];
    const byCat = {};
    for (const m of filtered) {
        (byCat[m.category] = byCat[m.category] || []).push(m);
    }
    return order.filter(c => byCat[c]).map(c => ({ category: c, models: byCat[c] }));
});

const load = async () => {
    try {
        const res = await fetch("/api/plaza");
        if (res.status === 401 || res.redirected) {
            window.location.href = "/login";
            return;
        }
        const data = await res.json();
        models.value = data.models || [];
        summary.value = data.summary || summary.value;
        job.value = data.job || null;
        probeModel.value = data.probeModel || "";
    } catch (error) {
        ElMessage.error(error.message);
    } finally {
        loading.value = false;
    }
};

const probeAll = async () => {
    try {
        await ElMessageBox.confirm(t("probeAllConfirm"), t("btnProbeAllTiers"), {
            cancelButtonText: t("cancel"),
            confirmButtonText: t("ok"),
            type: "warning",
        });
    } catch (_) {
        return;
    }
    try {
        const res = await fetch("/api/tiers/probe-all", { method: "POST" });
        const data = await res.json();
        if (!res.ok) {
            ElMessage.error(t(data.message || "tierProbeFailed"));
            return;
        }
        ElMessage.success(t("tierProbeStarted"));
        startPolling();
    } catch (error) {
        ElMessage.error(error.message);
    }
};

const startPolling = () => {
    if (pollTimer) return;
    pollTimer = setInterval(async () => {
        await load();
        if (!job.value) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }, 4000);
};

onMounted(() => {
    load();
});

onBeforeUnmount(() => {
    if (pollTimer) clearInterval(pollTimer);
});
</script>

<style scoped>
.plaza-page {
    min-height: 100vh;
    padding: 24px;
    background: var(--el-bg-color-page, #0f1115);
    color: var(--el-text-color-primary, #e5e7eb);
}

.plaza-header {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    justify-content: space-between;
    margin-bottom: 16px;
}

.plaza-header-left {
    align-items: center;
    display: flex;
    gap: 12px;
}

.plaza-header h1 {
    font-size: 1.25rem;
    margin: 0;
}

.plaza-header-right {
    align-items: center;
    display: flex;
    gap: 8px;
}

.plaza-back {
    background: transparent;
    border: 1px solid var(--el-border-color, #374151);
    border-radius: 8px;
    color: inherit;
    cursor: pointer;
    padding: 6px 12px;
}

.summary-chip {
    border-radius: 12px;
    font-size: 0.75rem;
    padding: 3px 10px;
}

.chip-pro {
    background: rgba(34, 197, 94, 0.2);
    color: #4ade80;
}

.chip-free {
    background: rgba(148, 163, 184, 0.2);
    color: #94a3b8;
}

.chip-untested {
    border: 1px dashed #94a3b8;
    color: #94a3b8;
}

.job-banner {
    background: rgba(59, 130, 246, 0.15);
    border: 1px solid rgba(59, 130, 246, 0.4);
    border-radius: 8px;
    color: #60a5fa;
    margin-bottom: 16px;
    padding: 10px 14px;
}

.plaza-search {
    margin-bottom: 20px;
    max-width: 420px;
}

.plaza-group h2 {
    font-size: 1rem;
    margin: 20px 0 12px;
}

.group-count {
    color: var(--el-text-color-secondary, #9ca3af);
    font-size: 0.8rem;
    font-weight: normal;
}

.plaza-grid {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
}

.model-card {
    background: var(--el-bg-color, #16181d);
    border: 1px solid var(--el-border-color, #2a2e36);
    border-radius: 10px;
    padding: 14px;
}

.model-card-head {
    align-items: center;
    display: flex;
    gap: 8px;
    justify-content: space-between;
}

.model-name {
    font-weight: 600;
}

.model-id {
    color: var(--el-text-color-secondary, #9ca3af);
    font-family: monospace;
    font-size: 0.78rem;
    margin-top: 4px;
    word-break: break-all;
}

.model-desc {
    color: var(--el-text-color-regular, #d1d5db);
    font-size: 0.8rem;
    margin-top: 8px;
}

.model-meta {
    color: var(--el-text-color-secondary, #9ca3af);
    display: flex;
    flex-wrap: wrap;
    font-size: 0.75rem;
    gap: 10px;
    margin-top: 10px;
}

.plaza-empty {
    color: var(--el-text-color-secondary, #9ca3af);
    padding: 48px 0;
    text-align: center;
}
</style>

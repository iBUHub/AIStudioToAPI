<template>
    <div class="screencast-page" @contextmenu.prevent>
        <div class="screencast-toolbar">
            <button class="toolbar-btn" :title="t('screencastBack')" @click="goBack">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                </svg>
            </button>
            <div class="url-bar">
                <input
                    v-model="urlInput"
                    :placeholder="t('screencastUrlPlaceholder')"
                    @keydown.enter="navigate"
                />
            </div>
            <span :class="['toolbar-status', statusClass]">{{ statusText }}</span>
            <button
                class="toolbar-btn save-btn"
                :disabled="state !== 'ready'"
                :title="t('screencastSave')"
                @click="saveAuth"
            >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z" />
                </svg>
                {{ t('screencastSave') }}
            </button>
        </div>

        <div ref="viewportRef" class="screencast-viewport">
            <canvas
                ref="canvasRef"
                tabindex="0"
                @keydown.prevent="onKeyDown"
                @keyup.prevent="onKeyUp"
                @mousedown="onMouseDown"
                @mousemove="onMouseMove"
                @mouseup="onMouseUp"
                @wheel.prevent="onWheel"
            />
            <div v-if="state === 'connecting'" class="screencast-overlay">
                <div class="loading-spinner" />
                <p>{{ t('screencastConnecting') }}</p>
            </div>
            <div v-if="state === 'saved'" class="screencast-overlay saved">
                <div class="saved-card">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="#34a853">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                    </svg>
                    <p class="saved-title">{{ t('screencastSaved') }}</p>
                    <p class="saved-filename">{{ savedFilename }}</p>
                    <button class="primary-btn" @click="goBack">{{ t('screencastReturnHome') }}</button>
                </div>
            </div>
            <div v-if="state === 'error'" class="screencast-overlay error">
                <p>{{ errorMessage }}</p>
                <button class="primary-btn" @click="goBack">{{ t('screencastBack') }}</button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, computed } from "vue";
import { useRouter } from "vue-router";
import I18n from "../utils/i18n";

const t = I18n.t.bind(I18n);
const router = useRouter();

const canvasRef = ref(null);
const viewportRef = ref(null);
const state = ref("connecting");
const errorMessage = ref("");
const savedFilename = ref("");
const urlInput = ref("");
const pageWidth = ref(1280);
const pageHeight = ref(800);

let ws = null;
let ctx = null;
let lastMouseMoveTime = 0;

const statusClass = computed(() => ({
    ready: state.value === "ready",
    saving: state.value === "saving",
    error: state.value === "error",
}));

const statusText = computed(() => {
    switch (state.value) {
        case "connecting": return t("screencastConnecting");
        case "ready": return "●";
        case "saving": return t("screencastSaving");
        case "saved": return t("screencastSaved");
        case "error": return errorMessage.value;
        default: return "";
    }
});

function sendJSON(data) {
    if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify(data));
    }
}

function mapCoordinates(event) {
    const canvas = canvasRef.value;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = pageWidth.value / rect.width;
    const scaleY = pageHeight.value / rect.height;
    return {
        x: Math.round((event.clientX - rect.left) * scaleX),
        y: Math.round((event.clientY - rect.top) * scaleY),
    };
}

function getModifiers(event) {
    let m = 0;
    if (event.altKey) m |= 1;
    if (event.ctrlKey) m |= 2;
    if (event.metaKey) m |= 4;
    if (event.shiftKey) m |= 8;
    return m;
}

function renderFrame(jpegData) {
    const blob = new Blob([jpegData], { type: "image/jpeg" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
        const canvas = canvasRef.value;
        if (!canvas) return;
        if (canvas.width !== img.width || canvas.height !== img.height) {
            canvas.width = img.width;
            canvas.height = img.height;
        }
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
    };
    img.src = url;
}

function handleControlMessage(msg) {
    switch (msg.type) {
        case "status":
            state.value = msg.state;
            if (msg.state === "error") errorMessage.value = msg.message || "Unknown error";
            if (msg.state === "saved") savedFilename.value = msg.message || "";
            break;
        case "resize":
            pageWidth.value = msg.width;
            pageHeight.value = msg.height;
            break;
    }
}

// Mouse handlers
function onMouseDown(event) {
    canvasRef.value?.focus();
    const { x, y } = mapCoordinates(event);
    sendJSON({ type: "mouse", event: "down", x, y, button: event.button });
}
function onMouseUp(event) {
    const { x, y } = mapCoordinates(event);
    sendJSON({ type: "mouse", event: "up", x, y, button: event.button });
}
function onMouseMove(event) {
    const now = Date.now();
    if (now - lastMouseMoveTime < 30) return;
    lastMouseMoveTime = now;
    const { x, y } = mapCoordinates(event);
    sendJSON({ type: "mouse", event: "move", x, y });
}
function onWheel(event) {
    const { x, y } = mapCoordinates(event);
    sendJSON({ type: "mouse", event: "wheel", x, y, deltaX: event.deltaX, deltaY: event.deltaY });
}

// Keyboard handlers
function onKeyDown(event) {
    sendJSON({
        type: "key",
        event: "down",
        key: event.key,
        code: event.code,
        text: event.key.length === 1 ? event.key : "",
        modifiers: getModifiers(event),
    });
}
function onKeyUp(event) {
    sendJSON({
        type: "key",
        event: "up",
        key: event.key,
        code: event.code,
        modifiers: getModifiers(event),
    });
}

function saveAuth() {
    sendJSON({ type: "save" });
}
function navigate() {
    if (urlInput.value) sendJSON({ type: "navigate", url: urlInput.value });
}
function goBack() {
    if (ws && ws.readyState <= 1) ws.close();
    router.push("/");
}

onMounted(() => {
    document.title = t("screencastPageTitle");
    ctx = canvasRef.value?.getContext("2d");

    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    ws = new WebSocket(`${protocol}//${location.host}/screencast`);
    ws.binaryType = "arraybuffer";

    ws.onmessage = event => {
        if (event.data instanceof ArrayBuffer) {
            renderFrame(event.data);
        } else {
            try {
                handleControlMessage(JSON.parse(event.data));
            } catch {
                // ignore
            }
        }
    };

    ws.onclose = () => {
        if (state.value !== "saved" && state.value !== "error") {
            state.value = "error";
            errorMessage.value = "Connection closed";
        }
    };

    ws.onerror = () => {
        state.value = "error";
        errorMessage.value = "WebSocket connection failed";
    };

    // Auto-focus canvas
    setTimeout(() => canvasRef.value?.focus(), 500);
});

onUnmounted(() => {
    if (ws && ws.readyState <= 1) ws.close();
});
</script>

<style lang="less" scoped>
.screencast-page {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    background: #1a1a1a;
    color: #fff;
    overflow: hidden;
}

.screencast-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: #2d2d2d;
    border-bottom: 1px solid #404040;
    flex-shrink: 0;
}

.toolbar-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: transparent;
    color: #ccc;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    white-space: nowrap;

    &:hover {
        background: #404040;
        color: #fff;
    }

    &:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
}

.save-btn {
    background: #1a73e8;
    color: #fff;

    &:hover:not(:disabled) {
        background: #1557b0;
    }
}

.url-bar {
    flex: 1;
    min-width: 0;

    input {
        width: 100%;
        padding: 6px 12px;
        background: #1a1a1a;
        color: #ccc;
        border: 1px solid #404040;
        border-radius: 20px;
        font-size: 13px;
        outline: none;

        &:focus {
            border-color: #1a73e8;
        }
    }
}

.toolbar-status {
    font-size: 12px;
    color: #888;
    white-space: nowrap;

    &.ready {
        color: #34a853;
    }

    &.saving {
        color: #fbbc04;
    }

    &.error {
        color: #ea4335;
    }
}

.screencast-viewport {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;

    canvas {
        max-width: 100%;
        max-height: 100%;
        cursor: default;
        outline: none;
    }
}

.screencast-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.7);
    gap: 16px;

    p {
        font-size: 16px;
        color: #ccc;
    }
}

.loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid #444;
    border-top-color: #1a73e8;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

.saved-card {
    text-align: center;
    padding: 32px;
    background: #2d2d2d;
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);

    .saved-title {
        font-size: 18px;
        font-weight: 600;
        color: #fff;
        margin: 16px 0 8px;
    }

    .saved-filename {
        font-size: 14px;
        color: #8ab4f8;
        font-family: monospace;
        margin-bottom: 20px;
    }
}

.primary-btn {
    padding: 10px 24px;
    background: #1a73e8;
    color: #fff;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;

    &:hover {
        background: #1557b0;
    }
}
</style>

<!--
 * File: ui/app/pages/AuthPage.vue
 * Description: VNC-based authentication page for adding new Google AI Studio accounts
 *
 * Author: Ellinav, iBenzene, bbbugg
-->

<template>
    <div v-cloak class="vnc-app">
        <div id="vnc-container">
            <div id="vnc-surface" />
            <div v-if="statusTitle" class="vnc-status" :class="`is-${statusTone}`">
                <div class="vnc-status-card">
                    <div class="vnc-status-title" :class="{ 'has-detail': statusDetail }">
                        {{ statusTitleText }}
                    </div>
                    <!-- eslint-disable-next-line vue/no-v-html -->
                    <div v-if="statusDetail" class="vnc-status-detail" v-html="statusDetailText" />
                    <button v-if="showReload" class="vnc-status-reload" type="button" @click="reloadPage">
                        {{ t("authReloadPage") }}
                    </button>
                </div>
            </div>
        </div>

        <el-affix
            :offset="20"
            position="bottom"
            class="vnc-affix vnc-affix-bar"
            style="position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); z-index: 999"
        >
            <div class="vnc-action-bar">
                <button
                    class="vnc-bar-button"
                    type="button"
                    :aria-label="t('authBack')"
                    :title="t('authBack')"
                    @click="goBack"
                >
                    <svg
                        t="1766055860230"
                        class="icon"
                        viewBox="0 0 1024 1024"
                        version="1.1"
                        xmlns="http://www.w3.org/2000/svg"
                        p-id="1639"
                        width="200"
                        height="200"
                    >
                        <path
                            d="M180.864 277.5808c-16.25088 12.288-16.25088 36.7104 0 48.9984L321.9456 433.31072c20.23424 15.3088 49.2544 0.87552 49.2544-24.4992V343.04h201.77408c118.48192 0 214.53312 89.3952 214.53312 199.68 0 110.27968-96.0512 199.68-214.53312 199.68H240.64a30.72 30.72 0 0 0-30.72 30.72v20.48a30.72 30.72 0 0 0 30.72 30.72h332.33408C740.06528 824.32 875.52 698.24512 875.52 542.72s-135.45472-281.6-302.54592-281.6H371.2V195.34848c0-25.37472-29.02016-39.808-49.2544-24.4992L180.864 277.5808z"
                            fill="#353535"
                            p-id="1640"
                        />
                    </svg>
                </button>
                <button
                    class="vnc-bar-button"
                    type="button"
                    :aria-label="t('switchLanguage')"
                    :title="t('switchLanguage')"
                    @click="toggleLanguage"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <path d="m5 8 6 6" />
                        <path d="m4 14 6-6 2-3" />
                        <path d="M2 5h12" />
                        <path d="M7 2h1" />
                        <path d="m22 22-5-10-5 10" fill="none" />
                        <path d="M14 18h6" />
                    </svg>
                </button>
                <button
                    class="vnc-bar-button"
                    type="button"
                    :disabled="!isConnected"
                    :aria-label="t('authInputText')"
                    :title="t('authInputText')"
                    @click="openTextDialog"
                >
                    <svg
                        t="1765981976088"
                        class="icon"
                        viewBox="0 0 1024 1024"
                        version="1.1"
                        xmlns="http://www.w3.org/2000/svg"
                        xmlns:xlink="http://www.w3.org/1999/xlink"
                    >
                        <path
                            d="M0 288v464c0 35.3 28.7 64 64 64h896c35.3 0 64-28.7 64-64V288c0-35.3-28.7-64-64-64H64c-35.3 0-64 28.7-64 64z m952 464H72c-4.4 0-8-3.6-8-8V296c0-4.4 3.6-8 8-8h880c4.4 0 8 3.6 8 8v448c0 4.4-3.6 8-8 8z"
                        />
                        <path
                            d="M632 672H264c-4.4 0-8-3.6-8-8v-48c0-4.4 3.6-8 8-8h368c4.4 0 8 3.6 8 8v48c0 4.4-3.6 8-8 8zM184 544h-48c-4.4 0-8-3.6-8-8v-48c0-4.4 3.6-8 8-8h48c4.4 0 8 3.6 8 8v48c0 4.4-3.6 8-8 8zM184 672h-48c-4.4 0-8-3.6-8-8v-48c0-4.4 3.6-8 8-8h48c4.4 0 8 3.6 8 8v48c0 4.4-3.6 8-8 8zM888 672h-48c-4.4 0-8-3.6-8-8v-48c0-4.4 3.6-8 8-8h48c4.4 0 8 3.6 8 8v48c0 4.4-3.6 8-8 8zM760 672h-48c-4.4 0-8-3.6-8-8v-48c0-4.4 3.6-8 8-8h48c4.4 0 8 3.6 8 8v48c0 4.4-3.6 8-8 8zM312 544h-48c-4.4 0-8-3.6-8-8v-48c0-4.4 3.6-8 8-8h48c4.4 0 8 3.6 8 8v48c0 4.4-3.6 8-8 8zM440 544h-48c-4.4 0-8-3.6-8-8v-48c0-4.4 3.6-8 8-8h48c4.4 0 8 3.6 8 8v48c0 4.4-3.6 8-8 8zM568 544h-48c-4.4 0-8-3.6-8-8v-48c0-4.4 3.6-8 8-8h48c4.4 0 8 3.6 8 8v48c0 4.4-3.6 8-8 8zM696 544h-48c-4.4 0-8-3.6-8-8v-48c0-4.4 3.6-8 8-8h48c4.4 0 8 3.6 8 8v48c0 4.4-3.6 8-8 8zM216 432h-80c-4.4 0-8-3.6-8-8v-48c0-4.4 3.6-8 8-8h80c4.4 0 8 3.6 8 8v48c0 4.4-3.6 8-8 8zM360 432h-80c-4.4 0-8-3.6-8-8v-48c0-4.4 3.6-8 8-8h80c4.4 0 8 3.6 8 8v48c0 4.4-3.6 8-8 8zM504 432h-80c-4.4 0-8-3.6-8-8v-48c0-4.4 3.6-8 8-8h80c4.4 0 8 3.6 8 8v48c0 4.4-3.6 8-8 8zM792 432h-80c-4.4 0-8-3.6-8-8v-48c0-4.4 3.6-8 8-8h80c4.4 0 8 3.6 8 8v48c0 4.4-3.6 8-8 8zM648 432h-80c-4.4 0-8-3.6-8-8v-48c0-4.4 3.6-8 8-8h80c4.4 0 8 3.6 8 8v48c0 4.4-3.6 8-8 8z"
                        />
                        <path
                            d="M896 376v136c0 17.7-14.3 32-32 32H760c-4.4 0-8-3.6-8-8v-48c0-4.4 3.6-8 8-8h64c4.4 0 8-3.6 8-8v-96c0-4.4 3.6-8 8-8h48c4.4 0 8 3.6 8 8z"
                        />
                    </svg>
                </button>
                <button
                    class="vnc-bar-button"
                    type="button"
                    :disabled="!isConnected"
                    :aria-label="t('authSendEnter')"
                    :title="t('authSendEnter')"
                    @click="sendEnter"
                >
                    <svg
                        t="1766081333596"
                        class="icon"
                        viewBox="0 0 1024 1024"
                        version="1.1"
                        xmlns="http://www.w3.org/2000/svg"
                        p-id="7842"
                        width="200"
                        height="200"
                    >
                        <path
                            d="M810.666667 213.333333a42.666667 42.666667 0 0 1 42.368 37.674667L853.333333 256v274.304c0 79.274667-50.944 147.498667-120.490666 152.106667L725.333333 682.666667H273.706667l97.792 97.834666a42.666667 42.666667 0 0 1-56.32 63.872l-4.010667-3.541333-170.666667-170.666667a42.666667 42.666667 0 0 1 0-60.330666l170.666667-170.666667a42.666667 42.666667 0 0 1 63.872 56.32l-3.541333 4.010667L273.706667 597.333333H725.333333c19.584 0 39.936-24.618667 42.410667-59.861333l0.256-7.168V256a42.666667 42.666667 0 0 1 42.666667-42.666667z"
                            fill="#000000"
                            p-id="7843"
                        />
                    </svg>
                </button>
                <button
                    class="vnc-bar-button is-backspace"
                    type="button"
                    :disabled="!isConnected"
                    :aria-label="t('authBackspace')"
                    :title="t('authBackspace')"
                    @click="sendBackspace"
                >
                    <svg
                        t="1765982025284"
                        class="icon"
                        viewBox="0 0 1024 1024"
                        version="1.1"
                        xmlns="http://www.w3.org/2000/svg"
                        xmlns:xlink="http://www.w3.org/1999/xlink"
                    >
                        <path
                            d="M494.48 673.68l113.136-113.152 113.152 113.136 56.56-56.56-113.136-113.12 113.136-113.152-56.56-56.56-113.152 113.136-113.136-113.136-56.56 56.56 113.136 113.136-113.136 113.136 56.56 56.56zM324.912 160L22.576 508.64 325.264 848H1008V160H324.912zM928 768H361.2L128.928 507.904 361.536 240H928v528z"
                            fill="#565D64"
                        />
                    </svg>
                </button>
                <button
                    class="vnc-bar-button is-save"
                    type="button"
                    :disabled="!isConnected || isSaving"
                    :aria-label="t('authSaveSession')"
                    :title="t('authSaveSession')"
                    @click="saveAuth()"
                >
                    <svg
                        t="1765982053330"
                        class="icon"
                        viewBox="0 0 1024 1024"
                        version="1.1"
                        xmlns="http://www.w3.org/2000/svg"
                        xmlns:xlink="http://www.w3.org/1999/xlink"
                    >
                        <path
                            d="M860.2 41H163.8C96.1 41 41 96.1 41 163.8v696.3C41 927.9 96.1 983 163.8 983h696.3c67.8 0 122.9-55.1 122.9-122.9V163.8C983 96.1 927.9 41 860.2 41z m-532.5 81.9h368.6v163.8c0 22.6-18.4 41-41 41H368.6c-22.6 0-41-18.4-41-41V122.9z m573.4 737.3c0 22.6-18.4 41-41 41H163.8c-22.6 0-41-18.4-41-41V163.8c0-22.6 18.4-41 41-41h81.9v163.8c0 67.8 55.1 122.9 122.9 122.9h286.7c67.8 0 122.9-55.1 122.9-122.9V122.9h81.9c22.6 0 41 18.4 41 41v696.3z"
                        />
                        <path
                            d="M593.9 276.5c28.2 0 51.2-23 51.2-51.2s-23-51.2-51.2-51.2c-28.2 0-51.2 23-51.2 51.2s23.1 51.2 51.2 51.2zM737.3 675.8H286.7c-22.5 0-41 18.4-41 41 0 22.5 18.4 41 41 41h450.6c22.5 0 41-18.4 41-41-0.1-22.5-18.5-41-41-41z"
                        />
                    </svg>
                </button>
            </div>
        </el-affix>

        <el-dialog
            :key="`intro-${langVersion}`"
            v-model="showIntroDialog"
            class="vnc-dialog"
            :close-on-click-modal="false"
            :close-on-press-escape="false"
            :show-close="false"
            align-center
        >
            <template #header>
                <div class="vnc-dialog-title">
                    {{ t("authSessionNoticeTitle") }}
                </div>
            </template>
            <div class="vnc-dialog-body">
                <p class="vnc-dialog-text">
                    {{ t("authSessionNoticeText") }}
                </p>
                <el-checkbox v-model="skipIntro">
                    {{ t("authDontShowAgain") }}
                </el-checkbox>
            </div>
            <template #footer>
                <el-button @click="handleIntroCancel">
                    {{ t("cancel") }}
                </el-button>
                <el-button type="primary" @click="handleIntroConfirm">
                    {{ t("authIUnderstand") }}
                </el-button>
            </template>
        </el-dialog>

        <el-dialog
            :key="`text-${langVersion}`"
            v-model="showTextDialog"
            class="vnc-dialog"
            :title="t('authSendText')"
            :close-on-click-modal="false"
            align-center
        >
            <el-input
                ref="textInputRef"
                v-model="textInput"
                type="textarea"
                :rows="4"
                :placeholder="t('authSendTextPlaceholder')"
                maxlength="2000"
                show-word-limit
            />
            <template #footer>
                <el-button @click="closeTextDialog">
                    {{ t("cancel") }}
                </el-button>
                <el-button type="primary" :disabled="!textInput" @click="sendText">
                    {{ t("authSend") }}
                </el-button>
            </template>
        </el-dialog>
    </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import I18n from "../utils/i18n";
import { useTheme } from "../utils/useTheme";

const hasInitialized = ref(false);
const isConnected = ref(false);
const isSaving = ref(false);
const langVersion = ref(0);
const rfb = ref(null);
const showIntroDialog = ref(false);
const showReload = ref(false);
const showTextDialog = ref(false);
const skipIntro = ref(false);
const statusDetail = ref("");
const statusTitle = ref("");
const statusTone = ref("info");
const textInput = ref("");
const textInputRef = ref(null);

// Initialize theme
useTheme();

const t = key => {
    langVersion.value; // Access to track language changes
    return I18n.t(key, key);
};

const statusTitleText = computed(() => {
    if (!statusTitle.value) return "";
    return typeof statusTitle.value === "object" ? t(statusTitle.value.key) : statusTitle.value;
});

const statusDetailText = computed(() => {
    if (!statusDetail.value) return "";
    if (typeof statusDetail.value === "object") {
        const translated = t(statusDetail.value.key);
        return statusDetail.value.html ? statusDetail.value.html.replace("__TRANSLATED__", translated) : translated;
    }
    return statusDetail.value;
});

const toggleLanguage = async () => {
    await I18n.toggleLang();
};

const cleanupSession = () => {
    if (navigator.sendBeacon) {
        fetch("/api/vnc/sessions", {
            keepalive: true,
            method: "DELETE",
        }).catch(() => {});
    }
};

const clearStatus = () => {
    statusTitle.value = "";
    statusDetail.value = "";
    statusTone.value = "info";
    showReload.value = false;
};

const closeTextDialog = () => {
    showTextDialog.value = false;
};

const ensureConnected = () => {
    if (!rfb.value || !isConnected.value) {
        ElMessage.warning(t("authVncNotConnected"));
        return false;
    }
    return true;
};

const escapeHtml = value =>
    String(value).replace(
        /[&<>"']/g,
        char =>
            ({
                '"': "&quot;",
                "&": "&amp;",
                "'": "&#x27;",
                "<": "&lt;",
                ">": "&gt;",
            })[char]
    );

const goBack = () => {
    if (window.history.length > 1) {
        window.history.back();
        return;
    }
    window.location.href = "/";
};

const handleIntroCancel = () => {
    showIntroDialog.value = false;
    goBack();
};

const handleIntroConfirm = () => {
    if (skipIntro.value) {
        localStorage.setItem("vncIntroSkip", "1");
    }
    showIntroDialog.value = false;
    startVncIfNeeded();
};

const initializeVnc = () => {
    const vncContainer = document.getElementById("vnc-container");
    const vncSurface = document.getElementById("vnc-surface");

    if (!vncContainer || !vncSurface) {
        setStatus({
            detail: { key: "authVncContainerMissingDetail" },
            reload: true,
            title: { key: "authVncContainerMissing" },
            tone: "error",
        });
        return;
    }

    loadVncClient(vncContainer, vncSurface);
};

const isIntroDismissed = () => localStorage.getItem("vncIntroSkip") === "1";

const loadVncClient = async (vncContainer, vncSurface) => {
    setStatus({ title: { key: "authLoadingVnc" } });

    let RFB;
    try {
        const module = await import("https://esm.sh/@novnc/novnc@1.4.0/lib/rfb.js");
        RFB = module.default;
    } catch (error) {
        console.error("Failed to load noVNC library:", error);
        const safeMessage = escapeHtml(error.message || error);
        setStatus({
            detail: {
                html: `${safeMessage}<div class="vnc-status-note">__TRANSLATED__</div>`,
                key: "authLoadVncFailedDetail",
            },
            reload: true,
            title: { key: "authLoadVncFailed" },
            tone: "error",
        });
        return;
    }

    setStatus({ title: { key: "authRequestingSession" } });

    try {
        const initialWidth = vncContainer.clientWidth;
        const initialHeight = vncContainer.clientHeight;

        const response = await fetch("/api/vnc/sessions", {
            body: JSON.stringify({ height: initialHeight, width: initialWidth }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
        });

        let data = {};
        try {
            data = await response.json();
        } catch (err) {
            data = {};
        }

        if (!response.ok) {
            throw new Error(data.error || `Server responded with ${response.status}`);
        }
        if (data.error) {
            throw new Error(data.error);
        }

        vncSurface.innerHTML = "";

        const protocol = window.location.protocol === "https:" ? "wss" : "ws";
        const wsUrl = `${protocol}://${window.location.host}/vnc`;

        const rfbOptions = { shared: true };
        if (data.password) {
            rfbOptions.credentials = { password: data.password };
        }

        rfb.value = new RFB(vncSurface, wsUrl, rfbOptions);

        rfb.value.addEventListener("connect", () => {
            isConnected.value = true;
            clearStatus();
        });

        rfb.value.addEventListener("disconnect", e => {
            // Check if we never connected (immediate failure)
            if (!isConnected.value) {
                console.warn("[VNC] Connection failed immediately. Likely WebSocket handshake failure (400/404).");
                setStatus({
                    detail: { key: "authConnectionFailedWsDetail" },
                    reload: true,
                    title: { key: "authConnectionFailedWs" },
                    tone: "error",
                });
                return;
            }

            isConnected.value = false;
            const detail = e && e.detail ? e.detail : {};
            const reason = detail.clean
                ? t("authSessionClosedNormally")
                : detail.reason || t("authSessionClosedUnexpected");
            setStatus({
                detail: { html: `__TRANSLATED__ ${escapeHtml(reason)}`, key: "authSessionClosedReason" },
                reload: true,
                title: { key: "authSessionClosed" },
                tone: "neutral",
            });
        });

        rfb.value.addEventListener("securityfailure", e => {
            console.error("[VNC] Security failure:", e);
            isConnected.value = false;
            setStatus({
                detail: { key: "authAuthFailedDetail" },
                reload: true,
                title: { key: "authAuthFailed" },
                tone: "error",
            });
        });

        rfb.value.scaleViewport = true;
        rfb.value.resizeSession = false;
    } catch (error) {
        console.error("Error starting VNC session:", error);
        const safeMessage = escapeHtml(error.message || error);
        setStatus({
            detail: {
                html: `${safeMessage}<div class="vnc-status-note">__TRANSLATED__</div>`,
                key: "authStartVncFailedDetail",
            },
            reload: true,
            title: { key: "authStartVncFailed" },
            tone: "error",
        });
    }
};

const openTextDialog = () => {
    if (!ensureConnected()) {
        return;
    }
    textInput.value = "";
    showTextDialog.value = true;
    nextTick(() => {
        textInputRef.value?.focus();
    });
};

const reloadPage = () => {
    window.location.reload();
};

const saveAuth = async (accountName = null) => {
    if (isSaving.value) {
        return;
    }
    if (!ensureConnected()) {
        return;
    }

    isSaving.value = true;

    try {
        const body = JSON.stringify(accountName ? { accountName } : {});
        const headers = { "Content-Type": "application/json" };

        const response = await fetch("/api/vnc/auth", {
            body,
            headers,
            method: "POST",
        });

        const data = await response.json();

        if (data.message === "vncAuthSaveSuccess") {
            ElMessage.success(t("authSaveSuccess").replace("{accountName}", data.accountName));
            sessionStorage.setItem("newAuthInfo", JSON.stringify(data));
            window.location.href = "/";
            return;
        }

        if (data.message === "errorVncEmailFetchFailed") {
            isSaving.value = false;
            try {
                const result = await ElMessageBox.prompt(t("authEnterAccountName"), t("authAccountNameTitle"), {
                    cancelButtonText: t("cancel"),
                    confirmButtonText: t("authSaveSession"),
                    inputValue: "",
                });
                if (result && result.value) {
                    await saveAuth(result.value);
                } else {
                    ElMessage.info(t("authSaveCancelled"));
                }
            } catch (err) {
                if (err !== "cancel" && err !== "close") {
                    console.error(err);
                }
            }
            return;
        }

        ElMessage.error(t("authSaveFailed").replace("{error}", data.error || "Unknown error."));
    } catch (error) {
        console.error("Error saving auth file:", error);
        ElMessage.error(t("authSaveError").replace("{error}", error.message || error));
    } finally {
        isSaving.value = false;
    }
};

const sendBackspace = () => {
    if (!ensureConnected()) {
        return;
    }
    rfb.value.sendKey(0xff08, "Backspace", true);
    rfb.value.sendKey(0xff08, "Backspace", false);
};

const sendEnter = () => {
    if (!ensureConnected()) {
        return;
    }
    rfb.value.sendKey(0xff0d, "Enter", true);
    rfb.value.sendKey(0xff0d, "Enter", false);
};

const sendText = () => {
    if (!ensureConnected()) {
        return;
    }
    const text = textInput.value;
    if (!text) {
        return;
    }
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const code = char.charCodeAt(0);
        rfb.value.sendKey(code, char, true);
        rfb.value.sendKey(code, char, false);
    }
    textInput.value = "";
    showTextDialog.value = false;
};

const setStatus = ({ title, detail = "", tone = "info", reload = false }) => {
    statusTitle.value = title;
    statusDetail.value = detail;
    statusTone.value = tone;
    showReload.value = reload;
};

const startVncIfNeeded = () => {
    if (hasInitialized.value) {
        return;
    }
    hasInitialized.value = true;
    initializeVnc();
};

onMounted(() => {
    document.title = t("authPageTitle");

    // Listen for language changes
    I18n.onChange(() => {
        langVersion.value++;
        document.title = t("authPageTitle");
    });

    if (isIntroDismissed()) {
        startVncIfNeeded();
    } else {
        showIntroDialog.value = true;
    }
    window.addEventListener("unload", cleanupSession);
});

onBeforeUnmount(() => {
    window.removeEventListener("unload", cleanupSession);
});
</script>

<style lang="less" scoped>
@import "../styles/variables.less";

#vnc-container {
    background: @vnc-surface-gradient;
    inset: 0;
    position: fixed;
}

#vnc-surface {
    height: 100%;
    width: 100%;
}

#vnc-surface canvas {
    display: block;
    height: 100% !important;
    width: 100% !important;
}

.vnc-status {
    align-items: center;
    backdrop-filter: blur(6px);
    background: @vnc-overlay-bg;
    color: @vnc-overlay-text;
    display: flex;
    inset: 0;
    justify-content: center;
    padding: @spacing-xl;
    position: absolute;
    text-align: center;

    &.is-error .vnc-status-title {
        color: @error-color;
    }
}

.vnc-status-card {
    background: @vnc-overlay-card-bg;
    border: 1px solid @vnc-overlay-border;
    border-radius: @border-radius-lg;
    box-shadow: @vnc-overlay-shadow;
    max-width: 520px;
    padding: @spacing-lg @spacing-xl;
}

.vnc-status-title {
    color: @vnc-overlay-text;
    font-size: 1.1rem;
    font-weight: 600;

    &.has-detail {
        margin-bottom: @spacing-sm;
    }
}

.vnc-status-detail {
    color: @vnc-overlay-muted;
    font-size: @font-size-small;
    line-height: 1.5;

    code {
        background: @vnc-overlay-code-bg;
        border-radius: @border-radius-sm;
        font-family: @font-family-mono;
        padding: 2px 6px;
    }
}

.vnc-status-note {
    display: block;
    margin-top: @spacing-sm;
}

.vnc-status-reload {
    background: @primary-color;
    border: none;
    border-radius: @border-radius-md;
    color: @background-white;
    cursor: pointer;
    font-size: @font-size-base;
    margin-top: @spacing-md;
    padding: @spacing-sm @spacing-lg;
    transition: background-color @transition-fast;

    &:hover {
        background: @primary-hover-color;
    }
}

.vnc-affix {
    position: fixed !important;
    z-index: @z-index-affix;
}

.vnc-icon-button {
    align-items: center;
    background: @vnc-toolbar-bg;
    border: 1px solid @vnc-toolbar-border;
    border-radius: @border-radius-circle;
    box-shadow: @vnc-toolbar-shadow;
    color: @text-secondary;
    cursor: pointer;
    display: inline-flex;
    height: @vnc-button-size;
    justify-content: center;
    padding: 0;
    transition:
        transform @transition-fast,
        background-color @transition-fast,
        box-shadow @transition-fast;
    width: @vnc-button-size;

    &:hover:not(:disabled) {
        background: @vnc-toolbar-hover-bg;
        color: @text-primary;
        transform: translateY(-1px);
    }

    &:disabled {
        cursor: not-allowed;
        opacity: 0.6;
    }

    svg {
        display: block;
        height: @vnc-icon-size;
        width: @vnc-icon-size;
    }
}

.vnc-icon-button svg path {
    fill: currentcolor;
}

.vnc-action-bar {
    align-items: center;
    backdrop-filter: blur(14px);
    background: @vnc-toolbar-bg;
    border: 1px solid @vnc-toolbar-border;
    border-radius: @vnc-bar-radius;
    box-shadow: @vnc-toolbar-shadow;
    display: flex;
    gap: @vnc-bar-gap;
    padding: @vnc-bar-padding @vnc-bar-padding;
}

.vnc-bar-button {
    align-items: center;
    background: transparent;
    border: none;
    border-radius: @border-radius-circle;
    color: @text-secondary;
    cursor: pointer;
    display: inline-flex;
    height: @vnc-button-size;
    justify-content: center;
    padding: 0;
    transition:
        background-color @transition-fast,
        color @transition-fast,
        transform @transition-fast;
    width: @vnc-button-size;

    &:hover:not(:disabled) {
        background: rgba(0, 0, 0, 0.06);
        color: @primary-color;
        transform: translateY(-1px);
    }

    &:disabled {
        cursor: not-allowed;
        opacity: 0.5;
    }

    &.is-save {
        color: @primary-color;
    }

    &.is-backspace {
        &:hover:not(:disabled) {
            color: @error-color;
        }
    }

    svg {
        display: block;
        height: @vnc-icon-size;
        width: @vnc-icon-size;
    }

    svg path {
        fill: currentcolor;
    }

    svg path[fill="none"] {
        fill: none;
        stroke: currentcolor;
    }
}

.vnc-dialog .el-dialog {
    border-radius: @border-radius-lg;
}

.vnc-dialog-title {
    font-size: 1rem;
    font-weight: 600;
}

.vnc-dialog-body {
    display: flex;
    flex-direction: column;
    gap: @spacing-sm;
}

.vnc-dialog-text {
    color: @text-primary;
    margin: 0;
}

@media (width <=520px) {
    .vnc-action-bar {
        gap: @spacing-sm;
        padding: @spacing-xs @spacing-md;
    }
}
</style>

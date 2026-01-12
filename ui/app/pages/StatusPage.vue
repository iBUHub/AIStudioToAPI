<!--
 * File: ui/app/pages/StatusPage.vue
 * Description: Status page component for monitoring and controlling the proxy service in real-time
 *
 * Maintainers: iBenzene, bbbugg
 * Original Author: Ellinav
-->

<template>
    <div class="status-page">
        <el-affix
            :offset="20"
            position="bottom"
            class="mobile-only"
            style="position: fixed; right: 20px; bottom: 20px; z-index: 999"
        >
            <div class="floating-actions">
                <button class="floating-btn lang-switcher" :title="t('switchLanguage')" @click="toggleLanguage">
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
                        <path d="m22 22-5-10-5 10" />
                        <path d="M14 18h6" />
                    </svg>
                </button>
                <button class="floating-btn logout-button" :title="t('logout')" @click="handleLogout">
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
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" x2="9" y1="12" y2="12" />
                    </svg>
                </button>
            </div>
        </el-affix>

        <div class="status-container">
            <button class="desktop-btn lang-switcher" :title="t('switchLanguage')" @click="toggleLanguage">
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
                    <path d="m22 22-5-10-5 10" />
                    <path d="M14 18h6" />
                </svg>
            </button>
            <button class="desktop-btn logout-button" :title="t('logout')" @click="handleLogout">
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
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" x2="9" y1="12" y2="12" />
                </svg>
            </button>
            <h1>
                <span>{{ t("statusHeading") }}</span>
                <span class="dot" />
            </h1>
            <div id="status-section">
                <pre>
<span class="label">{{ t('serviceStatus') }}</span>: <span :class="serviceConnectedClass">{{ serviceConnectedText }}</span><template v-if="state.serviceConnected">
<span class="label">{{ t('browserConnection') }}</span>: <span :class="browserConnectedClass">{{ browserConnectedText }}</span>
--- {{ t('serviceConfig') }} ---
<span class="label">{{ t('streamingMode') }}</span>: <span>{{ streamingModeText }}</span> <span class="comment">({{ t('onlyAppliesWhenStreamingEnabled') }})</span>
<span class="label">{{ t('forceThinking') }}</span>: <span>{{ forceThinkingIcon }}</span> <span>{{ forceThinkingText }}</span>
<span class="label">{{ t('forceWebSearch') }}</span>: <span>{{ forceWebSearchIcon }}</span> <span>{{ forceWebSearchText }}</span>
<span class="label">{{ t('forceUrlContext') }}</span>: <span>{{ forceUrlContextIcon }}</span> <span>{{ forceUrlContextText }}</span>
<span class="label">{{ t('apiKey') }}</span>: <span>{{ apiKeySourceText }}</span>
--- {{ t('accountStatus') }} ---
<span class="label">{{ t('currentAccount') }}</span>: #<span>{{ state.currentAuthIndex }}</span> (<span :class="currentAccountNameClass">{{ currentAccountName }}</span>)
<span class="label">{{ t('usageCount') }}</span>: <span>{{ state.usageCount }}</span>
<span class="label">{{ t('consecutiveFailures') }}</span>: <span>{{ state.failureCount }}</span>
<span class="label">{{ t('totalScanned') }}</span>: <span>{{ totalScannedAccountsText }}</span>
<span class="label">{{ t('dedupedAvailable') }}</span>: <span>{{ rotationAccountsText }}</span>
<span class="label">{{ t('duplicateAuth') }}</span>: <span>{{ duplicateAuthText }}</span><template v-for="account in state.accountDetails" :key="account.index">
<span class="label account-label" style="padding-left: 20px;">{{ t('account') }} {{ account.index }}</span>: {{ getAccountDisplayName(account) }}</template>
<span class="label">{{ t('formatErrors') }}</span>: <span>{{ formatErrorsText }}</span></template></pre>
            </div>
            <div id="actions-section" style="margin-top: 2em">
                <h2>{{ t("actionsPanel") }}</h2>
                <div class="action-group">
                    <el-select
                        v-model="state.selectedAccount"
                        :placeholder="t('noActiveAccount')"
                        :disabled="isBusy"
                        style="width: 240px"
                    >
                        <el-option
                            v-for="item in state.accountDetails"
                            :key="item.index"
                            :label="`${t('account')} #${item.index} (${getAccountDisplayName(item)})`"
                            :value="item.index"
                        />
                    </el-select>
                    <button
                        id="switch-account-btn"
                        :disabled="isBusy || state.selectedAccount === null"
                        :title="t('btnSwitchAccount')"
                        @click="switchSpecificAccount"
                    >
                        <svg
                            t="1765911521856"
                            class="icon"
                            viewBox="0 0 1024 1024"
                            version="1.1"
                            xmlns="http://www.w3.org/2000/svg"
                            xmlns:xlink="http://www.w3.org/1999/xlink"
                            width="24"
                            height="24"
                        >
                            <path
                                d="M886.2 604.8H137.8c-22.1 0-40 17.9-40 40 0 8.4 2.6 16.2 7 22.6 1.9 4.5 4.8 8.7 8.4 12.4L289.5 856c7.8 7.8 18 11.7 28.3 11.7s20.5-3.9 28.3-11.7c15.6-15.6 15.6-40.9 0-56.6L231.3 684.8h654.8c22.1 0 40-17.9 40-40s-17.8-40-39.9-40zM137.8 419.2h748.4c22.1 0 40-17.9 40-40 0-8.4-2.6-16.2-7-22.6-1.4-3.3-3.4-6.5-5.8-9.5L769.2 170.9c-14-17.1-39.2-19.6-56.3-5.6-17.1 14-19.6 39.2-5.6 56.3l96.3 117.6H137.8c-22.1 0-40 17.9-40 40s17.9 40 40 40z"
                                fill="currentColor"
                            />
                        </svg>
                    </button>
                    <button :disabled="isBusy" :title="t('btnAddUser')" @click="addUser">
                        <svg
                            t="1765912197860"
                            class="icon"
                            viewBox="0 0 1024 1024"
                            version="1.1"
                            xmlns="http://www.w3.org/2000/svg"
                            xmlns:xlink="http://www.w3.org/1999/xlink"
                            width="24"
                            height="24"
                        >
                            <path
                                d="M711.8 590.4c12.4-20 6.3-46.3-13.7-58.8-24.4-15.2-50.6-26.8-77.5-36.6 66.6-39.7 111.9-111.8 111.9-194.9 0-125.5-102.1-227.6-227.6-227.6S277.3 174.6 277.3 300.1c0 74.1 36.1 139.4 91.1 181C193.5 524.5 64 674.1 64 851.9c0 23.6 19.1 42.7 42.7 42.7s42.7-19.1 42.7-42.7c0-164.7 145.1-298.7 323.4-298.7 64.7 0 127 17.6 180.3 50.8 19.9 12.6 46.2 6.4 58.7-13.6zM504.9 157.8c78.4 0 142.2 63.8 142.2 142.2s-63.8 142.2-142.2 142.2c-78.4 0-142.2-63.8-142.2-142.2s63.8-142.2 142.2-142.2zM917.4 738.2H832v-85.3c0-23.6-19.1-42.7-42.7-42.7s-42.7 19.1-42.7 42.7v85.3h-85.3c-23.6 0-42.7 19.1-42.7 42.7s19.1 42.7 42.7 42.7h85.3v85.3c0 23.6 19.1 42.7 42.7 42.7s42.7-19.1 42.7-42.7v-85.3h85.3c23.6 0 42.7-19.1 42.7-42.7s-19.1-42.7-42.6-42.7z"
                                fill="currentColor"
                            />
                        </svg>
                    </button>
                    <button
                        class="btn-danger"
                        :disabled="isBusy || state.selectedAccount === null"
                        :title="t('btnDeleteUser')"
                        @click="deleteUser"
                    >
                        <svg
                            t="1765908584009"
                            class="icon"
                            viewBox="0 0 1049 1024"
                            version="1.1"
                            xmlns="http://www.w3.org/2000/svg"
                            xmlns:xlink="http://www.w3.org/1999/xlink"
                            width="24"
                            height="24"
                        >
                            <path
                                d="M818.93731 882.886003a64.030784 64.030784 0 0 1-63.948694 63.948693H294.295334a64.030784 64.030784 0 0 1-63.948693-63.948693V204.159692h588.590669v678.726311zM358.572391 89.396825a12.888248 12.888248 0 0 1 13.134519-13.134519h307.019401a12.888248 12.888248 0 0 1 13.13452 13.134519v38.500562h-333.28844z m652.539361 38.500562h-242.988616v-38.500562A89.643098 89.643098 0 0 0 678.726311 0H371.378547a89.643098 89.643098 0 0 0-89.396825 89.396825v38.500562H38.41847a38.582652 38.582652 0 1 0 0 77.083213h114.927049v677.987494a141.031906 141.031906 0 0 0 141.031906 141.031906h460.611191a141.031906 141.031906 0 0 0 141.031907-141.031906V204.159692h114.927048a38.500561 38.500561 0 0 0 38.500561-38.582652 37.761744 37.761744 0 0 0-38.500561-37.679653z m-486.469777 703.353535a38.500561 38.500561 0 0 0 38.582652-38.500561V382.871252a38.582652 38.582652 0 1 0-77.083213 0v409.879109a38.41847 38.41847 0 0 0 38.500561 38.500561z m-179.450376 0a38.500561 38.500561 0 0 0 38.500561-38.500561V382.871252a38.582652 38.582652 0 1 0-77.083213 0v409.879109a39.567741 39.567741 0 0 0 38.500561 38.500561z m359.064935 0a38.500561 38.500561 0 0 0 38.500561-38.500561V382.871252a38.582652 38.582652 0 1 0-77.083213 0v409.879109a38.500561 38.500561 0 0 0 38.500561 38.500561z"
                                fill="currentColor"
                            />
                        </svg>
                    </button>
                    <button
                        class="btn-warning"
                        :disabled="isBusy"
                        :title="t('btnDeduplicateAuth')"
                        @click="deduplicateAuth"
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
                            <path d="M22 3H2l8 9v7l4 2v-9l8-9z" />
                        </svg>
                    </button>
                    <input
                        ref="fileInput"
                        type="file"
                        style="display: none"
                        accept=".json"
                        @change="handleFileUpload"
                    />
                    <button :disabled="isBusy" :title="t('uploadFile')" @click="triggerFileUpload">
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
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" x2="12" y1="3" y2="15" />
                        </svg>
                    </button>
                    <button
                        :disabled="state.selectedAccount === null"
                        :title="t('download')"
                        @click="downloadSelectedAccount"
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
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" x2="12" y1="15" y2="3" />
                        </svg>
                    </button>
                </div>
                <div class="switch-container">
                    <span class="switch-label">{{ t("streamingMode") }}</span>
                    <el-switch
                        v-model="state.streamingModeReal"
                        :before-change="handleStreamingModeBeforeChange"
                        style="--el-switch-on-color: #007bff; --el-switch-off-color: #dcdfe6"
                    />
                    <span class="switch-status">{{ streamingModeText }}</span>
                </div>
                <div class="switch-container">
                    <span class="switch-label">{{ t("forceThinking") }}</span>
                    <el-switch
                        v-model="state.forceThinkingEnabled"
                        :before-change="handleForceThinkingBeforeChange"
                        style="--el-switch-on-color: #007bff; --el-switch-off-color: #dcdfe6"
                    />
                    <span class="switch-status">{{ forceThinkingText }}</span>
                </div>
                <div class="switch-container">
                    <span class="switch-label">{{ t("forceWebSearch") }}</span>
                    <el-switch
                        v-model="state.forceWebSearchEnabled"
                        :before-change="handleForceWebSearchBeforeChange"
                        style="--el-switch-on-color: #007bff; --el-switch-off-color: #dcdfe6"
                    />
                    <span class="switch-status">{{ forceWebSearchText }}</span>
                </div>
                <div class="switch-container">
                    <span class="switch-label">{{ t("forceUrlContext") }}</span>
                    <el-switch
                        v-model="state.forceUrlContextEnabled"
                        :before-change="handleForceUrlContextBeforeChange"
                        style="--el-switch-on-color: #007bff; --el-switch-off-color: #dcdfe6"
                    />
                    <span class="switch-status">{{ forceUrlContextText }}</span>
                </div>
            </div>
            <div id="log-section" style="margin-top: 2em">
                <h2>
                    <span>{{ t("realtimeLogs") }}</span>
                    (<span>{{ t("latestEntries") }}</span>
                    {{ state.logCount }}
                    <span>{{ t("entries") }}</span
                    >)
                </h2>
                <div class="switch-container" style="margin-bottom: 1em">
                    <span class="switch-label">{{ t("logLevel") }}</span>
                    <el-switch
                        v-model="state.debugModeEnabled"
                        :before-change="handleDebugModeBeforeChange"
                        style="--el-switch-on-color: #007bff; --el-switch-off-color: #dcdfe6"
                    />
                    <span class="switch-status">{{ logLevelText }}</span>
                </div>
                <pre id="log-container">{{ state.logs }}</pre>
            </div>
            <div class="version-footer">
                <a
                    href="https://github.com/iBenzene/AIStudioToAPI"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="github-link"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 98 96"
                        fill="currentColor"
                    >
                        <path
                            fill-rule="evenodd"
                            clip-rule="evenodd"
                            d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"
                        />
                    </svg>
                    <span>GitHub</span>
                </a>
                <span class="version-tag">{{ appVersion }}</span>
                <a
                    v-if="state.hasUpdate"
                    href="https://github.com/iBenzene/AIStudioToAPI/pkgs/container/aistudio-to-api"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="update-tag"
                    :title="`${t('newVersionAvailable')}: ${state.latestVersion}`"
                >
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    >
                        <path d="m18 15-6-6-6 6" />
                    </svg>
                    <span>{{ t("newVersionAvailable") }}</span>
                </a>
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watchEffect } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox, ElNotification } from "element-plus";
import I18n from "../utils/i18n";

const router = useRouter();
const fileInput = ref(null);

// Create reactive version counter
const langVersion = ref(0);

// Translation function that tracks language changes
const t = (key, options) => {
    langVersion.value; // Access to track changes
    return I18n.t(key, options);
};

const state = reactive({
    accountDetails: [],
    apiKeySource: "",
    browserConnected: false,
    currentAuthIndex: -1,
    debugModeEnabled: false,
    duplicateIndicesRaw: [],
    failureCount: 0,
    forceThinkingEnabled: false,
    forceUrlContextEnabled: false,
    forceWebSearchEnabled: false,
    hasUpdate: false,
    initialIndicesRaw: [],
    invalidIndicesRaw: [],
    isInitializing: true,
    isSwitchingAccount: false,
    isSystemBusy: false,
    isUpdating: false,
    latestVersion: null,
    logCount: 0,
    logs: t("loading"),
    releaseUrl: null,
    rotationIndicesRaw: [],
    selectedAccount: null,
    serviceConnected: false,
    streamingModeReal: false,
    usageCount: 0,
});

const apiKeySourceText = computed(() => {
    const key = state.apiKeySource ? state.apiKeySource.toLowerCase() : "";
    const translated = key ? t(key) : "";
    return translated === key ? state.apiKeySource : translated || state.apiKeySource;
});

const browserConnectedClass = computed(() => {
    if (state.isSystemBusy) {
        return "status-warning";
    }
    return state.browserConnected ? "status-ok" : "status-error";
});

const browserConnectedText = computed(() => {
    if (state.isSystemBusy) {
        return t("connecting");
    }
    return state.browserConnected ? t("running") : t("disconnected");
});

const currentAccountName = computed(() => {
    if (state.currentAuthIndex < 0) {
        return t("noActiveAccount");
    }
    const account = state.accountDetails.find(acc => acc.index === state.currentAuthIndex);
    return account ? getAccountDisplayName(account) : t("noActiveAccount");
});

const currentAccountNameClass = computed(() => {
    if (state.currentAuthIndex < 0) {
        return "status-error";
    }
    const account = state.accountDetails.find(acc => acc.index === state.currentAuthIndex);
    return account ? "" : "status-error";
});

const forceThinkingIcon = computed(() => (state.forceThinkingEnabled ? "✅" : "❌"));
const forceThinkingText = computed(() => (state.forceThinkingEnabled ? t("enabled") : t("disabled")));

const forceUrlContextIcon = computed(() => (state.forceUrlContextEnabled ? "✅" : "❌"));
const forceUrlContextText = computed(() => (state.forceUrlContextEnabled ? t("enabled") : t("disabled")));

const forceWebSearchIcon = computed(() => (state.forceWebSearchEnabled ? "✅" : "❌"));
const forceWebSearchText = computed(() => (state.forceWebSearchEnabled ? t("enabled") : t("disabled")));

const logLevelText = computed(() => (state.debugModeEnabled ? t("debug") : t("normal")));

const isBusy = computed(() => state.isSwitchingAccount || state.isSystemBusy);

const formatErrorsText = computed(() => {
    const indices = state.invalidIndicesRaw || [];
    return `[${indices.join(", ")}] (${t("total")}: ${indices.length})`;
});

const duplicateAuthText = computed(() => {
    const indices = state.duplicateIndicesRaw || [];
    return `[${indices.join(", ")}] (${t("total")}: ${indices.length})`;
});

const serviceConnectedClass = computed(() => (state.serviceConnected ? "status-ok" : "status-error"));

const serviceConnectedText = computed(() => (state.serviceConnected ? t("running") : t("disconnected")));

const streamingModeText = computed(() => (state.streamingModeReal ? t("real") : t("fake")));

const rotationAccountsText = computed(() => {
    const indices = state.rotationIndicesRaw || [];
    return `[${indices.join(", ")}] (${t("total")}: ${indices.length})`;
});

const totalScannedAccountsText = computed(() => {
    const indices = state.initialIndicesRaw || [];
    return `[${indices.join(", ")}] (${t("total")}: ${indices.length})`;
});

// App version from build-time injection
const appVersion = computed(() => {
    const version = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
    // Add 'v' prefix only if version starts with a number (e.g. 1.0.0 -> v1.0.0)
    if (/^\d/.test(version)) {
        return `v${version}`;
    }
    // Capitalize 'preview'
    if (version.startsWith("preview")) {
        return version.charAt(0).toUpperCase() + version.slice(1);
    }
    // Keep raw string for others (e.g. main, dev)
    return version;
});

// Get display name for account with i18n support
const getAccountDisplayName = account => {
    if (account.isInvalid) {
        return t("jsonFormatError");
    }
    const name = account.name || t("unnamedAccount");
    if (account.isDuplicate && account.canonicalIndex !== null && account.canonicalIndex !== undefined) {
        return `${name} (${t("duplicateAuthHint", { index: account.canonicalIndex })})`;
    }
    return name;
};

const addUser = () => {
    router.push("/auth");
};

const deleteUser = async () => {
    const targetIndex = state.selectedAccount;
    if (targetIndex === null || targetIndex === undefined) {
        ElMessage.warning(t("noAccountSelected"));
        return;
    }

    const targetAccount = state.accountDetails.find(acc => acc.index === targetIndex);
    const accountSuffix = targetAccount ? ` (${getAccountDisplayName(targetAccount)})` : "";

    // Helper function to perform the actual deletion
    const performDelete = async (forceDelete = false) => {
        state.isSwitchingAccount = true;
        let shouldUpdate = true; // Flag to control whether to update content
        try {
            const url = forceDelete ? `/api/accounts/${targetIndex}?force=true` : `/api/accounts/${targetIndex}`;
            const res = await fetch(url, {
                method: "DELETE",
            });
            const data = await res.json();

            // If 409 status (requires confirmation for current account), show warning dialog
            if (res.status === 409 && data.requiresConfirmation) {
                shouldUpdate = false; // Don't update content, just show confirmation dialog
                state.isSwitchingAccount = false;
                ElMessageBox.confirm(t("warningDeleteCurrentAccount"), t("warningTitle"), {
                    cancelButtonText: t("cancel"),
                    confirmButtonText: t("ok"),
                    lockScroll: false,
                    type: "error",
                })
                    .then(() => performDelete(true))
                    .catch(e => {
                        if (e !== "cancel") {
                            console.error(e);
                        }
                    });
                return; // Early return to prevent further execution
            }

            // Show success or error messages for completed operations
            const message = t(data.message, data);
            if (res.ok) {
                ElMessage.success(message);
            } else {
                ElMessage.error(message);
            }
        } catch (err) {
            ElMessage.error(t("deleteFailed", { message: err.message || err }));
        } finally {
            if (shouldUpdate) {
                state.isSwitchingAccount = false;
                updateContent();
            }
        }
    };

    // First confirmation dialog
    ElMessageBox.confirm(`${t("confirmDelete")} #${targetIndex}${accountSuffix}?`, t("warningTitle"), {
        cancelButtonText: t("cancel"),
        confirmButtonText: t("ok"),
        lockScroll: false,
        type: "warning",
    })
        .then(() => performDelete(false))
        .catch(e => {
            if (e !== "cancel") {
                console.error(e);
            }
        });
};

const deduplicateAuth = () => {
    ElMessageBox.confirm(t("accountDedupConfirm"), t("warningTitle"), {
        cancelButtonText: t("cancel"),
        confirmButtonText: t("ok"),
        lockScroll: false,
        type: "warning",
    })
        .then(async () => {
            const notification = ElNotification({
                duration: 0,
                message: t("operationInProgress"),
                title: t("warningTitle"),
                type: "warning",
            });
            state.isSwitchingAccount = true;
            try {
                const res = await fetch("/api/accounts/deduplicate", { method: "POST" });
                const data = await res.json();

                const removedIndicesText = Array.isArray(data.removedIndices)
                    ? `[${data.removedIndices.join(", ")}]`
                    : "[]";
                const failedText = Array.isArray(data.failed) ? JSON.stringify(data.failed) : "";

                const message = t(data.message, {
                    ...data,
                    failed: failedText,
                    removedIndices: removedIndicesText,
                });

                if (res.ok) {
                    ElMessage.success(message);
                } else {
                    ElMessage.error(message);
                }
            } catch (err) {
                ElMessage.error(t("accountDedupFailed", { error: err.message || err }));
            } finally {
                state.isSwitchingAccount = false;
                notification.close();
                updateContent();
            }
        })
        .catch(e => {
            if (e !== "cancel") {
                console.error(e);
            }
        });
};

const handleForceThinkingBeforeChange = () => handleSettingChange("/api/settings/force-thinking", "forceThinking");

const handleForceUrlContextBeforeChange = () =>
    handleSettingChange("/api/settings/force-url-context", "forceUrlContext");

const handleForceWebSearchBeforeChange = () => handleSettingChange("/api/settings/force-web-search", "forceWebSearch");

const handleDebugModeBeforeChange = () => handleSettingChange("/api/settings/debug-mode", "logLevel");

const handleLogout = () => {
    ElMessageBox.confirm(t("logoutConfirm"), {
        cancelButtonText: t("cancel"),
        confirmButtonText: t("ok"),
        lockScroll: false,
        type: "warning",
    })
        .then(() => {
            fetch("/logout", {
                headers: { "Content-Type": "application/json" },
                method: "POST",
            })
                .then(res => res.json())
                .then(data => {
                    const message = t(data.message);
                    if (data.message === "logoutSuccess") {
                        ElMessage.success(message);
                        setTimeout(() => {
                            window.location.href = "/login";
                        }, 500);
                    } else {
                        ElMessage.error(message);
                    }
                })
                .catch(err => {
                    console.error("Logout error:", err);
                    ElMessage.error(t("logoutError"));
                });
        })
        .catch(() => {});
};

const handleSettingChange = async (apiUrl, settingName) => {
    if (state.isUpdating) {
        return false;
    }

    try {
        const res = await fetch(apiUrl, { method: "PUT" });
        const data = await res.json();
        if (res.ok) {
            const message = t(data.message, {
                setting: t(settingName),
                value: t(String(data.value)),
            });
            ElMessage.success(message);
            updateContent();
            return true;
        }
        const message = t(data.message, data);
        ElMessage.error(message);
        return false;
    } catch (err) {
        ElMessage.error(t("settingFailed", { message: err.message || err }));
        return false;
    }
};

const handleStreamingModeBeforeChange = async () => {
    if (state.isUpdating) {
        return false;
    }

    const newMode = !state.streamingModeReal ? "real" : "fake";

    try {
        const res = await fetch("/api/settings/streaming-mode", {
            body: JSON.stringify({ mode: newMode }),
            headers: { "Content-Type": "application/json" },
            method: "PUT",
        });
        const data = await res.json();
        if (res.ok) {
            const message = t(data.message, {
                setting: t("streamingMode"),
                value: t(data.value),
            });
            ElMessage.success(message);
            updateContent();
            return true;
        }
        const message = t(data.message, data);
        ElMessage.error(message);
        return false;
    } catch (err) {
        ElMessage.error(t("settingFailed", { message: err.message || err }));
        return false;
    }
};

const switchSpecificAccount = () => {
    const targetIndex = state.selectedAccount;

    if (state.currentAuthIndex === targetIndex) {
        ElMessage.warning(t("alreadyCurrentAccount"));
        return;
    }

    const targetAccount = state.accountDetails.find(acc => acc.index === targetIndex);
    const accountSuffix = targetAccount ? ` (${getAccountDisplayName(targetAccount)})` : "";

    ElMessageBox.confirm(`${t("confirmSwitch")} #${targetIndex}${accountSuffix}?`, {
        cancelButtonText: t("cancel"),
        confirmButtonText: t("ok"),
        lockScroll: false,
        type: "warning",
    })
        .then(async () => {
            const notification = ElNotification({
                duration: 0,
                message: t("switchingAccountNotice"),
                title: t("warningTitle"),
                type: "warning",
            });
            state.isSwitchingAccount = true;
            try {
                const res = await fetch("/api/accounts/current", {
                    body: JSON.stringify({ targetIndex }),
                    headers: { "Content-Type": "application/json" },
                    method: "PUT",
                });
                const data = await res.json();
                const message = t(data.message, data);
                if (res.ok) {
                    ElMessage.success(message);
                } else {
                    ElMessage.error(message);
                }
            } catch (err) {
                ElMessage.error(t("settingFailed", { message: err.message || err }));
            } finally {
                state.isSwitchingAccount = false;
                notification.close();
                updateContent();
            }
        })
        .catch(e => {
            if (e !== "cancel") {
                console.error(e);
            }
        });
};

const updateStatus = data => {
    state.serviceConnected = true;
    if (state.isInitializing) {
        state.isInitializing = false;
    }

    const isEnabled = val => {
        if (val === true) return true;
        if (val === 1) return true;
        if (String(val).toLowerCase() === "true") return true;
        return false;
    };

    state.isUpdating = true;
    state.streamingModeReal = data.status.streamingMode === "real";
    state.forceThinkingEnabled = isEnabled(data.status.forceThinking);
    state.forceWebSearchEnabled = isEnabled(data.status.forceWebSearch);
    state.forceUrlContextEnabled = isEnabled(data.status.forceUrlContext);
    state.debugModeEnabled = isEnabled(data.status.debugMode);
    state.currentAuthIndex = data.status.currentAuthIndex;
    state.accountDetails = data.status.accountDetails || [];
    state.browserConnected = data.status.browserConnected;
    state.apiKeySource = data.status.apiKeySource;
    state.usageCount = data.status.usageCount;
    state.failureCount = data.status.failureCount;
    state.logCount = data.logCount || 0;
    state.logs = data.logs || "";
    state.initialIndicesRaw = data.status.initialIndicesRaw;
    state.rotationIndicesRaw = data.status.rotationIndicesRaw || [];
    state.invalidIndicesRaw = data.status.invalidIndicesRaw;
    state.duplicateIndicesRaw = data.status.duplicateIndicesRaw || [];
    state.isSystemBusy = data.status.isSystemBusy;

    const isSelectedAccountValid = state.accountDetails.some(acc => acc.index === state.selectedAccount);

    if (!isSelectedAccountValid) {
        const isActiveAccountValid = state.accountDetails.some(acc => acc.index === state.currentAuthIndex);
        state.selectedAccount = isActiveAccountValid ? state.currentAuthIndex : null;
    }

    nextTick(() => {
        state.isUpdating = false;
    });
};

let updateTimer = null;
let isActive = true;

const updateContent = async () => {
    const dot = document.querySelector(".dot");
    try {
        const res = await fetch("/api/status");
        if (res.redirected) {
            window.location.href = res.url;
            return;
        }
        if (res.status === 401) {
            window.location.href = "/login";
            return;
        }
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        const data = await res.json();
        if (dot) {
            dot.className = "dot status-running";
        }
        updateStatus(data);
    } catch (err) {
        console.error("Error fetching status:", err.message || err);
        if (dot) {
            dot.className = "dot status-error";
        }
        state.serviceConnected = false;
    }
};

const scheduleNextUpdate = () => {
    if (!isActive) {
        return;
    }
    const randomInterval = 4000 + Math.floor(Math.random() * 3000);
    updateTimer = setTimeout(() => {
        updateContent().finally(scheduleNextUpdate);
    }, randomInterval);
};

const toggleLanguage = async () => {
    await I18n.toggleLang();
};

const triggerFileUpload = () => {
    if (fileInput.value) {
        fileInput.value.click();
    }
};

const handleFileUpload = async event => {
    const file = event.target.files[0];
    if (!file) return;

    // Reset input so same file can be selected again
    event.target.value = "";

    const reader = new FileReader();
    reader.onload = async e => {
        try {
            const content = e.target.result;
            // Validate JSON
            JSON.parse(content);

            const res = await fetch("/api/files", {
                body: JSON.stringify({
                    content: JSON.parse(content), // Send as object to let backend stringify formatted
                }),
                headers: {
                    "Content-Type": "application/json",
                },
                method: "POST",
            });

            if (res.ok) {
                const data = await res.json();
                ElMessage.success(t("fileUploadSuccess") + ` (${data.filename || ""})`);
                // Immediately update status to reflect new account
                updateContent();
            } else {
                const data = await res.json();
                ElMessage.error(t("fileUploadFailed", { error: data.error || "Unknown error" }));
            }
        } catch (err) {
            ElMessage.error(t("fileUploadFailed", { error: "Invalid JSON file" }));
        }
    };
    reader.readAsText(file);
};

const downloadSelectedAccount = () => {
    if (state.selectedAccount === null) return;
    window.location.href = `/api/files/auth-${state.selectedAccount}.json`;
};

// Check for updates once on page load
const checkForUpdates = async () => {
    try {
        const res = await fetch("/api/version/check");
        if (res.ok) {
            const data = await res.json();
            state.hasUpdate = data.hasUpdate;
            state.latestVersion = data.latest;
            state.releaseUrl = data.releaseUrl;
        }
    } catch (err) {
        // Silently fail - version check is not critical
        console.warn("Failed to check for updates:", err.message);
    }
};

onMounted(() => {
    // Listen for language changes
    I18n.onChange(() => {
        langVersion.value++;
        if (state.logCount === 0) {
            state.logs = t("loading");
        }
    });
    updateContent().finally(scheduleNextUpdate);

    // Check for updates once on initial load
    checkForUpdates();
});

onBeforeUnmount(() => {
    isActive = false;
    if (updateTimer) {
        clearTimeout(updateTimer);
    }
});

watchEffect(() => {
    document.title = t("statusTitle");
});
</script>

<style lang="less" scoped>
@import "../styles/variables.less";

.status-page {
    min-height: 100vh;
    padding: 3em 0;
}

.status-container {
    background: @background-white;
    border-radius: @border-radius-xl;
    box-shadow: @shadow-light;
    margin: 0 auto;
    max-width: @container-max-width;
    padding: 1em 2em 2em 2em;
    position: relative;
}

h1,
h2 {
    border-bottom: 2px solid @border-light;
    color: @text-primary;
    padding-bottom: 0.5em;
}

pre {
    background: @dark-background;
    border-radius: @border-radius-md;
    color: @dark-text;
    font-size: @font-size-large;
    line-height: 1.6;
    padding: 1.5em;
    white-space: pre-wrap;
    word-wrap: break-word;
}

#log-container {
    font-size: @font-size-small;
    max-height: @log-container-max-height;
    overflow-y: auto;
}

.status-ok {
    color: @success-color;
    font-weight: bold;
}

.status-warning {
    color: @warning-color;
    font-weight: bold;
}

.status-error {
    color: @error-color;
    font-weight: bold;
}

.label {
    display: inline-block;
    width: 220px;
}

.dot {
    animation: blink 1s infinite alternate;
    background-color: #bbb;
    border-radius: @border-radius-circle;
    display: inline-block;
    height: 10px;
    margin-left: @spacing-sm;
    vertical-align: middle;
    width: 10px;

    &.status-running {
        background-color: @success-color;
    }

    &.status-error {
        background-color: @error-color;
    }
}

@keyframes blink {
    from {
        opacity: 0.3;
    }

    to {
        opacity: 1;
    }
}

.action-group {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: @spacing-md;

    button,
    select {
        align-items: center;
        border: 1px solid @border-color;
        border-radius: @border-radius-md;
        box-sizing: border-box;
        cursor: pointer;
        display: inline-flex;
        font-size: @font-size-base;
        justify-content: center;
        line-height: 1.5;
        min-height: @button-min-height;
        padding: @spacing-sm @spacing-md;
        transition: background-color @transition-normal;
        white-space: nowrap;

        &:disabled {
            cursor: not-allowed;
            opacity: 0.7;
        }
    }

    button {
        background: transparent;
        border: none;
        color: @text-secondary;
        min-height: auto;
        padding: @spacing-xs;

        svg {
            display: block;
        }

        &:hover:not(:disabled) {
            color: @primary-color;
            transform: scale(1.1);
        }

        &:disabled {
            opacity: 0.5;
        }

        // Danger button uses error color on hover
        &.btn-danger:hover:not(:disabled) {
            color: @error-color;
        }

        &.btn-warning:hover:not(:disabled) {
            color: @warning-color;
        }

        // Primary button uses primary color on hover (already default)
        &.btn-primary:hover:not(:disabled) {
            color: @primary-color;
        }
    }
}

// Desktop buttons (original position in container)
.desktop-btn {
    align-items: center;
    background: transparent;
    border: none;
    color: @text-secondary;
    cursor: pointer;
    display: none; // Hidden on mobile by default
    justify-content: center;
    padding: @spacing-xs;
    position: absolute;
    top: 35px;
    transition: all @transition-fast;

    &:disabled {
        cursor: not-allowed;
        opacity: 0.5;
    }

    svg {
        display: block;
    }

    &.lang-switcher {
        right: 70px;

        &:hover:not(:disabled) {
            color: @primary-color;
            transform: scale(1.1);
        }
    }

    &.logout-button {
        right: @spacing-lg;

        &:hover:not(:disabled) {
            color: @error-color;
            transform: scale(1.1);
        }
    }
}

// Mobile floating action buttons
.mobile-only {
    display: block;
}

.floating-actions {
    align-items: center;
    display: flex;
    flex-direction: column;
    gap: @affix-button-gap;
}

.floating-btn {
    align-items: center;
    backdrop-filter: blur(10px);
    background: @affix-button-bg;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-radius: @border-radius-circle;
    box-shadow: @affix-button-shadow;
    cursor: pointer;
    display: flex;
    height: @affix-button-size;
    justify-content: center;
    transition: all @transition-fast;
    width: @affix-button-size;

    &:disabled {
        cursor: not-allowed;
        opacity: 0.5;
    }

    svg {
        display: block;
    }

    &.lang-switcher {
        color: @text-secondary;

        &:hover:not(:disabled) {
            background: @primary-color;
            box-shadow: @affix-button-hover-shadow;
            color: @background-white;
            transform: scale(1.05);
        }
    }

    &.logout-button {
        color: @text-secondary;

        &:hover:not(:disabled) {
            background: @error-color;
            box-shadow: @affix-button-hover-shadow;
            color: @background-white;
            transform: scale(1.05);
        }
    }
}

// Media query: Desktop (>=768px)
@media (width >= 768px) {
    .mobile-only {
        display: none !important;
    }

    .desktop-btn {
        display: flex;
    }
}

.switch-container {
    align-items: center;
    display: flex;
    gap: @spacing-md;
    margin: @spacing-md 0;

    .switch-label {
        color: @text-primary;
        font-size: @font-size-base;
        font-weight: 500;
        min-width: 150px;
    }

    .switch-status {
        color: @text-secondary;
        font-size: @font-size-small;
        min-width: 60px;
    }
}

.file-actions {
    align-items: center;
    display: flex;
    gap: @spacing-md;
    margin-bottom: @spacing-md;

    .action-btn {
        background: transparent;
        border: 1px solid @border-color;
        border-radius: @border-radius-md;
        box-sizing: border-box;
        color: @text-primary;
        cursor: pointer;
        font-size: @font-size-base;
        padding: @spacing-xs @spacing-md;
        transition: all @transition-fast;

        &:hover:not(:disabled) {
            background: @primary-color;
            border-color: @primary-color;
            color: @background-white;
        }

        &:disabled {
            cursor: not-allowed;
            opacity: 0.5;
        }
    }
}

.version-footer {
    align-items: center;
    border-top: 2px solid @border-light;
    display: flex;
    font-size: @font-size-small;
    gap: 12px;
    justify-content: center;
    margin-top: 2em;
    padding-top: 1.5em;

    .github-link,
    .version-tag {
        align-items: center;
        border-radius: 16px;
        color: #fff;
        display: inline-flex;
        font-size: 12px;
        font-weight: 500;
        gap: 6px;
        padding: 6px 12px;
        text-decoration: none;
    }

    .github-link {
        background: linear-gradient(135deg, #24292f 0%, #1b1f23 100%);
        transition: all @transition-fast;

        &:hover {
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            transform: translateY(-1px);
        }

        svg {
            height: 14px;
            width: 14px;
        }
    }

    .version-tag {
        background: linear-gradient(135deg, @primary-color 0%, @primary-active-color 100%);
    }

    .update-tag {
        align-items: center;
        animation: pulse 2s infinite;
        background: linear-gradient(135deg, @error-color 0%, #c0392b 100%);
        border-radius: 16px;
        color: #fff;
        display: inline-flex;
        font-size: 12px;
        font-weight: 500;
        gap: 4px;
        padding: 6px 12px;
        text-decoration: none;
        transition: all @transition-fast;

        &:hover {
            animation: none;
            box-shadow: 0 4px 12px rgba(231, 76, 60, 0.4);
            transform: translateY(-1px);
        }

        svg {
            height: 12px;
            width: 12px;
        }
    }

    @keyframes pulse {
        0%,
        100% {
            opacity: 1;
        }

        50% {
            opacity: 0.7;
        }
    }
}
</style>

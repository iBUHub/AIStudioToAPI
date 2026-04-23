<!--
 * File: ui/app/pages/StatusPage.vue
 * Description: Status page component for displaying system status and logs
 *
 * Author: Ellinav, iBenzene, bbbugg
-->

<template>
    <div class="main-layout">
        <!-- Sidebar Navigation -->
        <aside class="sidebar">
            <div class="sidebar-menu">
                <button
                    class="menu-item"
                    :class="{ active: activeTab === 'home' }"
                    :title="t('statusHeading')"
                    @click="switchTab('home')"
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
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                        <polyline points="9 22 9 12 15 12 15 22"></polyline>
                    </svg>
                </button>
                <button
                    class="menu-item"
                    :class="{ active: activeTab === 'settings' }"
                    :title="t('actionsPanel')"
                    @click="switchTab('settings')"
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
                        <circle cx="12" cy="12" r="3"></circle>
                        <path
                            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
                        ></path>
                    </svg>
                </button>
                <button
                    class="menu-item"
                    :class="{ active: activeTab === 'logs' }"
                    :title="t('realtimeLogs')"
                    @click="switchTab('logs')"
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
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                    </svg>
                </button>
                <button
                    class="menu-item"
                    :class="{ active: activeTab === 'stats' }"
                    :title="t('usageStats')"
                    @click="switchTab('stats')"
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
                        <path d="M3 3v18h18"></path>
                        <path d="M7 16l4-4 3 3 5-7"></path>
                    </svg>
                </button>
            </div>

            <div class="sidebar-footer">
                <button
                    class="menu-item"
                    :title="t('switchLanguage')"
                    @click="handleLanguageChange(state.currentLang === 'en' ? 'zh' : 'en')"
                >
                    <svg
                        data-v-3ee666f0=""
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
                        <path data-v-3ee666f0="" d="m5 8 6 6"></path>
                        <path data-v-3ee666f0="" d="m4 14 6-6 2-3"></path>
                        <path data-v-3ee666f0="" d="M2 5h12"></path>
                        <path data-v-3ee666f0="" d="M7 2h1"></path>
                        <path data-v-3ee666f0="" d="m22 22-5-10-5 10"></path>
                        <path data-v-3ee666f0="" d="M14 18h6"></path>
                    </svg>
                </button>
                <button class="menu-item logout-button" :title="t('logout')" @click="handleLogout">
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
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                        <polyline points="16 17 21 12 16 7"></polyline>
                        <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                </button>
            </div>
        </aside>

        <!-- Main Content Area -->
        <main class="content-area">
            <!-- HOME VIEW -->
            <div v-if="activeTab === 'home'" class="view-container">
                <header class="page-header">
                    <h1>{{ t("statusHeading") }}</h1>
                </header>

                <div class="dashboard-grid">
                    <!-- Service Status Card -->
                    <div class="status-card">
                        <h3 class="card-title">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                style="margin-right: 8px; vertical-align: text-bottom"
                            >
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                            </svg>
                            {{ t("serviceStatus") }}
                            <span
                                class="dot"
                                :class="state.serviceConnected ? 'status-running' : 'status-error'"
                                style="display: inline-block; vertical-align: middle; margin-left: 8px"
                            ></span>
                        </h3>
                        <div class="status-list">
                            <div class="status-item">
                                <span class="label">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        style="margin-right: 6px; vertical-align: middle"
                                    >
                                        <path d="M20 8h-2"></path>
                                        <path d="M20 18h-2"></path>
                                        <rect x="2" y="4" width="20" height="8" rx="2" ry="2"></rect>
                                        <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                                        <line x1="6" y1="8" x2="6.01" y2="8"></line>
                                        <line x1="6" y1="18" x2="6.01" y2="18"></line>
                                    </svg>
                                    {{ t("serviceConnection") }}
                                </span>
                                <span class="value status-text-bold" :class="serviceConnectedClass">{{
                                    serviceConnectedText
                                }}</span>
                            </div>
                            <div v-if="state.serviceConnected" class="status-item">
                                <span class="label">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        style="margin-right: 6px; vertical-align: middle"
                                    >
                                        <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path>
                                    </svg>
                                    {{ t("browserConnection") }}
                                </span>
                                <span class="value status-text-bold" :class="browserConnectedClass">{{
                                    browserConnectedText
                                }}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Account Status Card -->
                    <div v-if="state.serviceConnected" class="status-card">
                        <h3 class="card-title">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                style="margin-right: 8px; vertical-align: text-bottom"
                            >
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                <circle cx="12" cy="7" r="4"></circle>
                            </svg>
                            {{ t("accountStatus") }}
                        </h3>
                        <div class="status-list">
                            <div class="status-item">
                                <span class="label">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        style="margin-right: 6px; vertical-align: middle"
                                    >
                                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                        <circle cx="8.5" cy="7" r="4"></circle>
                                        <polyline points="17 11 19 13 23 9"></polyline>
                                    </svg>
                                    {{ t("currentAccount") }}
                                </span>
                                <span class="value account-value">
                                    <span class="account-name" :class="currentAccountNameClass">
                                        #{{ state.currentAuthIndex }} {{ currentAccountName }}
                                    </span>
                                </span>
                            </div>
                            <div class="status-item">
                                <span class="label">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        style="margin-right: 6px; vertical-align: middle"
                                    >
                                        <line x1="18" y1="20" x2="18" y2="10"></line>
                                        <line x1="12" y1="20" x2="12" y2="4"></line>
                                        <line x1="6" y1="20" x2="6" y2="14"></line>
                                    </svg>
                                    <span>
                                        {{ t("usageCount") }}
                                        <EnvVarTooltip env-var="SWITCH_ON_USES" doc-section="proxy-config" />
                                    </span>
                                </span>
                                <span class="value">{{ state.usageCount }}</span>
                            </div>
                            <div class="status-item">
                                <span class="label">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        style="margin-right: 6px; vertical-align: middle"
                                    >
                                        <path
                                            d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"
                                        ></path>
                                        <line x1="12" y1="9" x2="12" y2="13"></line>
                                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                                    </svg>
                                    <span>
                                        {{ t("consecutiveFailures") }}
                                        <EnvVarTooltip env-var="FAILURE_THRESHOLD" doc-section="proxy-config" />
                                    </span>
                                </span>
                                <span class="value">{{ state.failureCount }}</span>
                            </div>
                            <div class="status-item">
                                <span class="label">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        style="margin-right: 6px; vertical-align: middle"
                                    >
                                        <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                                        <polyline points="2 17 12 22 22 17"></polyline>
                                        <polyline points="2 12 12 17 22 12"></polyline>
                                    </svg>
                                    {{ t("totalScanned") }}
                                </span>
                                <span class="value">{{ totalScannedCount }}</span>
                            </div>
                            <div class="status-item">
                                <span class="label">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        style="margin-right: 6px; vertical-align: middle"
                                    >
                                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                                    </svg>
                                    {{ t("dedupedAvailable") }}
                                </span>
                                <span class="value">{{ dedupedAvailableCount }}</span>
                            </div>
                            <div class="status-item">
                                <span class="label">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        style="margin-right: 6px; vertical-align: middle"
                                    >
                                        <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                                        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                                    </svg>
                                    <span>
                                        {{ t("activeContexts") }}
                                        <EnvVarTooltip env-var="MAX_CONTEXTS" doc-section="proxy-config" />
                                    </span>
                                </span>
                                <span class="value">{{ activeContextsDisplay }}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Proxy Settings Status Card -->
                    <div v-if="state.serviceConnected" class="status-card">
                        <h3 class="card-title">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                style="margin-right: 8px; vertical-align: text-bottom"
                            >
                                <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"></path>
                            </svg>
                            {{ t("proxySettingsStatus") }}
                        </h3>
                        <div class="status-list">
                            <div class="status-item">
                                <span class="label">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        style="margin-right: 6px; vertical-align: middle"
                                    >
                                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                                    </svg>
                                    <span>
                                        {{ t("streamingMode") }}
                                        <span
                                            style="
                                                font-size: 0.8em;
                                                color: var(--text-secondary);
                                                font-weight: normal;
                                                margin-left: 4px;
                                            "
                                            >({{ t("onlyAppliesWhenStreamingEnabled") }})</span
                                        >
                                        <EnvVarTooltip env-var="STREAMING_MODE" doc-section="other-config" />
                                    </span>
                                </span>
                                <span
                                    class="value status-text-bold"
                                    :class="state.streamingModeReal ? 'status-ok' : 'status-error'"
                                    >{{ state.streamingModeReal ? t("real") : t("fake") }}</span
                                >
                            </div>
                            <div class="status-item">
                                <span class="label">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        style="margin-right: 6px; vertical-align: middle"
                                    >
                                        <path d="M15.5 13a3.5 3.5 0 0 0 -3.5 3.5v1a3.5 3.5 0 0 0 7 0v-1.8"></path>
                                        <path d="M8.5 13a3.5 3.5 0 0 1 3.5 3.5v1a3.5 3.5 0 0 1 -7 0v-1.8"></path>
                                        <path d="M17.5 16a3.5 3.5 0 0 0 0 -7h-.5"></path>
                                        <path d="M19 9.3v-2.8a3.5 3.5 0 0 0 -7 0"></path>
                                        <path d="M6.5 16a3.5 3.5 0 0 1 0 -7h.5"></path>
                                        <path d="M5 9.3v-2.8a3.5 3.5 0 0 1 7 0v10"></path>
                                    </svg>
                                    <span>
                                        {{ t("forceThinking") }}
                                        <EnvVarTooltip env-var="FORCE_THINKING" doc-section="other-config" />
                                    </span>
                                </span>
                                <span
                                    class="value status-text-bold"
                                    :class="state.forceThinkingEnabled ? 'status-ok' : 'status-error'"
                                    >{{ state.forceThinkingEnabled ? t("enabled") : t("disabled") }}</span
                                >
                            </div>
                            <div class="status-item">
                                <span class="label">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        style="margin-right: 6px; vertical-align: middle"
                                    >
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <line x1="2" y1="12" x2="22" y2="12"></line>
                                        <path
                                            d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
                                        ></path>
                                    </svg>
                                    <span>
                                        {{ t("forceWebSearch") }}
                                        <EnvVarTooltip env-var="FORCE_WEB_SEARCH" doc-section="other-config" />
                                    </span>
                                </span>
                                <span
                                    class="value status-text-bold"
                                    :class="state.forceWebSearchEnabled ? 'status-ok' : 'status-error'"
                                    >{{ state.forceWebSearchEnabled ? t("enabled") : t("disabled") }}</span
                                >
                            </div>
                            <div class="status-item">
                                <span class="label">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        style="margin-right: 6px; vertical-align: middle"
                                    >
                                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                                    </svg>
                                    <span>
                                        {{ t("forceUrlContext") }}
                                        <EnvVarTooltip env-var="FORCE_URL_CONTEXT" doc-section="other-config" />
                                    </span>
                                </span>
                                <span
                                    class="value status-text-bold"
                                    :class="state.forceUrlContextEnabled ? 'status-ok' : 'status-error'"
                                    >{{ state.forceUrlContextEnabled ? t("enabled") : t("disabled") }}</span
                                >
                            </div>
                            <div class="status-item">
                                <span class="label">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        style="margin-right: 6px; vertical-align: middle"
                                    >
                                        <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path>
                                        <path d="M21 3v5h-5"></path>
                                    </svg>
                                    <span>
                                        {{ t("maxRetries") }}
                                        <span
                                            style="
                                                font-size: 0.8em;
                                                color: var(--text-secondary);
                                                font-weight: normal;
                                                margin-left: 4px;
                                            "
                                            >({{ t("onlyAppliesWhenFakeStreaming") }})</span
                                        >
                                        <EnvVarTooltip env-var="MAX_RETRIES" doc-section="proxy-config" />
                                    </span>
                                </span>
                                <span class="value">{{ state.maxRetries }}</span>
                            </div>
                            <div class="status-item">
                                <span class="label">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        style="margin-right: 6px; vertical-align: middle"
                                    >
                                        <path
                                            d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"
                                        ></path>
                                    </svg>
                                    <span>
                                        {{ t("apiKey") }}
                                        <EnvVarTooltip env-var="API_KEYS" doc-section="app-config" />
                                    </span>
                                </span>
                                <span class="value status-text-bold">{{ apiKeySourceText }}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Account Management Section (Full Width) -->
                <div v-if="state.serviceConnected" class="full-width-section">
                    <div class="status-card">
                        <h3 class="card-title">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                style="margin-right: 8px; vertical-align: text-bottom"
                            >
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                <circle cx="9" cy="7" r="4"></circle>
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                            </svg>
                            {{ t("accountManagement") }}
                        </h3>
                        <!-- Top action buttons: Add and Deduplicate -->
                        <div class="action-group account-top-actions">
                            <input
                                ref="fileInput"
                                type="file"
                                style="display: none"
                                accept=".json,.zip"
                                multiple
                                @change="handleFileUpload"
                            />
                            <!-- Left: Select all and batch delete -->
                            <div class="batch-actions">
                                <el-checkbox
                                    :model-value="isAllSelected"
                                    :indeterminate="hasSelection && !isAllSelected"
                                    :disabled="state.accountDetails.length === 0"
                                    @change="toggleSelectAll"
                                >
                                    {{ t("selectAll") }}
                                </el-checkbox>
                                <span v-if="hasSelection" class="selected-count">
                                    {{ t("selectedCount", { count: selectedCount }) }}
                                </span>
                                <button
                                    v-if="hasSelection"
                                    class="btn-batch-delete"
                                    :disabled="isBusy"
                                    :title="t('batchDelete')"
                                    @click="batchDeleteAccounts"
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="20"
                                        height="20"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    >
                                        <path
                                            d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"
                                        />
                                        <path d="m9.5 10 5 5" />
                                        <path d="m14.5 10-5 5" />
                                    </svg>
                                </button>
                                <button
                                    v-if="hasSelection"
                                    class="btn-batch-download"
                                    :title="t('batchDownload')"
                                    @click="batchDownloadAccounts"
                                >
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="20"
                                        height="20"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    >
                                        <path
                                            d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"
                                        />
                                        <path d="M12 10v6" />
                                        <path d="m9 13 3 3 3-3" />
                                    </svg>
                                </button>
                            </div>
                            <!-- Right: Add, upload, and deduplicate -->
                            <div class="icon-buttons">
                                <button :disabled="isBusy" :title="t('btnAddUser')" @click="addUser">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="20"
                                        height="20"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    >
                                        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                        <circle cx="8.5" cy="7" r="4"></circle>
                                        <line x1="20" y1="8" x2="20" y2="14"></line>
                                        <line x1="23" y1="11" x2="17" y2="11"></line>
                                    </svg>
                                </button>
                                <button :disabled="isBusy" :title="t('uploadFile')" @click="triggerFileUpload">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="20"
                                        height="20"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    >
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                        <polyline points="17 8 12 3 7 8"></polyline>
                                        <line x1="12" y1="3" x2="12" y2="15"></line>
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
                                        width="20"
                                        height="20"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                    >
                                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <!-- Account list -->
                        <div class="account-list">
                            <div
                                v-for="item in state.accountDetails"
                                :key="item.index"
                                class="account-list-item"
                                style="cursor: pointer"
                                :class="{
                                    'is-current': item.index === state.currentAuthIndex,
                                    'is-selected': isAccountSelected(item.index),
                                }"
                                @click="toggleSelectAccount(item.index)"
                            >
                                <el-checkbox
                                    :model-value="isAccountSelected(item.index)"
                                    class="account-checkbox"
                                    :aria-label="`Select account #${item.index}`"
                                    @change="toggleSelectAccount(item.index)"
                                    @click.stop
                                />
                                <el-tooltip
                                    :content="getAccountDisplayName(item)"
                                    placement="top"
                                    effect="dark"
                                    :hide-after="0"
                                >
                                    <div class="account-info">
                                        <span class="account-index">#{{ item.index }}</span>
                                        <span
                                            class="account-email"
                                            :class="{ 'is-error': item.isInvalid, 'is-duplicate': item.isDuplicate }"
                                        >
                                            {{ getAccountDisplayName(item) }}
                                        </span>
                                        <span v-if="item.index === state.currentAuthIndex" class="current-badge">
                                            {{ t("tagCurrent") }}
                                        </span>
                                        <span v-if="item.isExpired" class="expired-badge">
                                            {{ t("tagExpired") }}
                                        </span>
                                    </div>
                                </el-tooltip>
                                <div class="account-actions">
                                    <button
                                        class="btn-switch"
                                        :class="{
                                            'is-active': item.index === state.currentAuthIndex,
                                            'is-fast': item.hasContext && item.index !== state.currentAuthIndex,
                                        }"
                                        :disabled="isBusy || item.index === state.currentAuthIndex"
                                        :title="
                                            item.index === state.currentAuthIndex
                                                ? t('currentAccount')
                                                : item.hasContext
                                                  ? t('fastSwitch')
                                                  : t('btnSwitchAccount')
                                        "
                                        @click.stop="switchAccountByIndex(item.index)"
                                    >
                                        <svg
                                            v-if="item.index !== state.currentAuthIndex"
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="16"
                                            height="16"
                                            viewBox="0 0 1024 1024"
                                            fill="currentColor"
                                        >
                                            <path
                                                d="M886.2 604.8H137.8c-22.1 0-40 17.9-40 40 0 8.4 2.6 16.2 7 22.6 1.9 4.5 4.8 8.7 8.4 12.4L289.5 856c7.8 7.8 18 11.7 28.3 11.7s20.5-3.9 28.3-11.7c15.6-15.6 15.6-40.9 0-56.6L231.3 684.8h654.8c22.1 0 40-17.9 40-40s-17.8-40-39.9-40zM137.8 419.2h748.4c22.1 0 40-17.9 40-40 0-8.4-2.6-16.2-7-22.6-1.4-3.3-3.4-6.5-5.8-9.5L769.2 170.9c-14-17.1-39.2-19.6-56.3-5.6-17.1 14-19.6 39.2-5.6 56.3l96.3 117.6H137.8c-22.1 0-40 17.9-40 40s17.9 40 40 40z"
                                            ></path>
                                        </svg>
                                        <svg
                                            v-else
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="16"
                                            height="16"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            stroke-width="2"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                        >
                                            <polyline points="20 6 9 17 4 12"></polyline>
                                        </svg>
                                    </button>
                                    <button
                                        class="btn-danger"
                                        :disabled="isBusy"
                                        :title="t('btnDeleteUser')"
                                        @click.stop="deleteAccountByIndex(item.index)"
                                    >
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="16"
                                            height="16"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            stroke-width="2"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                        >
                                            <polyline points="3 6 5 6 21 6"></polyline>
                                            <path
                                                d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                                            ></path>
                                            <line x1="10" y1="11" x2="10" y2="17"></line>
                                            <line x1="14" y1="11" x2="14" y2="17"></line>
                                        </svg>
                                    </button>
                                    <button :title="t('download')" @click.stop="downloadAccountByIndex(item.index)">
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="16"
                                            height="16"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            stroke-width="2"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                        >
                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                            <polyline points="7 10 12 15 17 10"></polyline>
                                            <line x1="12" y1="15" x2="12" y2="3"></line>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                            <div v-if="state.accountDetails.length === 0" class="account-list-empty">
                                {{ t("noActiveAccount") }}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- SETTINGS VIEW -->
            <div v-if="activeTab === 'settings'" class="view-container">
                <header class="page-header">
                    <h1>{{ t("settings") }}</h1>
                </header>

                <div class="dashboard-grid settings-grid">
                    <!-- Version Information Card -->
                    <div class="status-card">
                        <h3 class="card-title">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                style="margin-right: 8px; vertical-align: text-bottom"
                            >
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="12" y1="16" x2="12" y2="12"></line>
                                <line x1="12" y1="8" x2="12.01" y2="8"></line>
                            </svg>
                            {{ t("versionInfo") }}
                        </h3>
                        <div class="status-list">
                            <div class="status-item">
                                <span class="label">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="currentColor"
                                        style="margin-right: 6px; vertical-align: middle"
                                    >
                                        <path
                                            d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385c.6.105.825-.255.825-.57c0-.285-.015-1.23-.015-2.235c-3.015.555-3.795-.735-4.035-1.41c-.135-.345-.72-1.41-1.23-1.695c-.42-.225-1.02-.78-.015-.795c.945-.015 1.62.87 1.845 1.23c1.08 1.815 2.805 1.305 3.495.99c.105-.78.42-1.305.765-1.605c-2.67-.3-5.46-1.335-5.46-5.925c0-1.305.465-2.385 1.23-3.225c-.12-.3-.54-1.53.12-3.18c0 0 1.005-.315 3.3 1.23c.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23c.66 1.65.24 2.88.12 3.18c.765.84 1.23 1.905 1.23 3.225c0 4.605-2.805 5.625-5.475 5.925c.435.375.81 1.095.81 2.22c0 1.605-.015 2.895-.015 3.3c0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"
                                        />
                                    </svg>
                                    GitHub {{ t("repo") }}
                                </span>
                                <a href="https://github.com/iBUHub/AIStudioToAPI" target="_blank" class="repo-link">
                                    iBUHub/AIStudioToAPI
                                </a>
                            </div>
                            <div class="status-item">
                                <span class="label">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        style="margin-right: 6px; vertical-align: middle"
                                    >
                                        <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"></path>
                                    </svg>
                                    {{ t("currentVersion") }}
                                </span>
                                <span class="value">
                                    <span class="clickable-version" :title="t('copy')" @click="copyAppVersion">
                                        {{ appVersion }}
                                        <span class="copy-icon">
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                width="14"
                                                height="14"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                stroke-width="2"
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                            >
                                                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                                <path
                                                    d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                                                ></path>
                                            </svg>
                                        </span>
                                    </span>
                                </span>
                            </div>
                            <div class="status-item">
                                <span class="label">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        style="margin-right: 6px; vertical-align: middle"
                                    >
                                        <circle cx="12" cy="13" r="8"></circle>
                                        <path d="M12 9v4l2 2"></path>
                                        <path d="m5 3 2 2"></path>
                                        <path d="m19 3-2 2"></path>
                                    </svg>
                                    <span>
                                        {{ t("latestVersion") }}
                                        <EnvVarTooltip env-var="CHECK_UPDATE" doc-section="app-config" />
                                    </span>
                                </span>
                                <span class="value">
                                    <span
                                        v-if="state.hasUpdate"
                                        class="clickable-version"
                                        :title="t('newVersionAvailable')"
                                    >
                                        <a
                                            :href="
                                                state.releaseUrl || 'https://github.com/iBUHub/AIStudioToAPI/releases'
                                            "
                                            target="_blank"
                                            class="update-link"
                                        >
                                            {{ latestVersionFormatted }}
                                        </a>
                                        <a
                                            class="copy-icon"
                                            :href="
                                                state.releaseUrl || 'https://github.com/iBUHub/AIStudioToAPI/releases'
                                            "
                                            target="_blank"
                                            style="color: inherit; display: inline-flex"
                                        >
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                width="14"
                                                height="14"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                stroke-width="2"
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                            >
                                                <path
                                                    d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
                                                ></path>
                                                <polyline points="15 3 21 3 21 9"></polyline>
                                                <line x1="10" y1="14" x2="21" y2="3"></line>
                                            </svg>
                                        </a>
                                    </span>
                                    <span v-else class="clickable-version" :title="t('viewRelease')">
                                        <a
                                            href="https://github.com/iBUHub/AIStudioToAPI/releases"
                                            target="_blank"
                                            style="color: inherit; text-decoration: none"
                                        >
                                            {{ latestVersionFormatted }}
                                        </a>
                                        <a
                                            class="copy-icon"
                                            href="https://github.com/iBUHub/AIStudioToAPI/releases"
                                            target="_blank"
                                            style="color: inherit; display: inline-flex"
                                        >
                                            <svg
                                                xmlns="http://www.w3.org/2000/svg"
                                                width="14"
                                                height="14"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                stroke-width="2"
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                            >
                                                <path
                                                    d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
                                                ></path>
                                                <polyline points="15 3 21 3 21 9"></polyline>
                                                <line x1="10" y1="14" x2="21" y2="3"></line>
                                            </svg>
                                        </a>
                                    </span>
                                </span>
                            </div>
                        </div>
                    </div>

                    <!-- System Settings Card -->
                    <div class="status-card">
                        <h3 class="card-title">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                style="margin-right: 8px; vertical-align: text-bottom"
                            >
                                <rect x="3" y="4" width="18" height="16" rx="2"></rect>
                                <path d="M7 8h10"></path>
                                <path d="M7 12h10"></path>
                                <path d="M7 16h6"></path>
                            </svg>
                            {{ t("systemSettings") }}
                        </h3>
                        <div class="settings-switches">
                            <div class="switch-container">
                                <span class="label">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        style="margin-right: 6px; vertical-align: middle"
                                    >
                                        <path d="M21 12a9 9 0 1 1-9-9"></path>
                                        <path d="M21 3v9h-9"></path>
                                    </svg>
                                    <span>
                                        {{ t("checkUpdate") }}
                                        <EnvVarTooltip env-var="CHECK_UPDATE" doc-section="app-config" />
                                    </span>
                                </span>
                                <el-switch
                                    v-model="state.checkUpdateEnabled"
                                    :width="50"
                                    :before-change="handleCheckUpdateBeforeChange"
                                />
                            </div>
                            <div class="switch-container">
                                <span class="label">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        style="margin-right: 6px; vertical-align: middle"
                                    >
                                        <path d="M12 3v18"></path>
                                        <path d="M17 8l-5-5-5 5"></path>
                                        <path d="M17 16l-5 5-5-5"></path>
                                    </svg>
                                    <span>
                                        {{ t("enableAuthUpdate") }}
                                        <EnvVarTooltip env-var="ENABLE_AUTH_UPDATE" doc-section="proxy-config" />
                                    </span>
                                </span>
                                <el-switch
                                    v-model="state.enableAuthUpdateEnabled"
                                    :width="50"
                                    :before-change="handleEnableAuthUpdateBeforeChange"
                                />
                            </div>
                        </div>
                    </div>

                    <!-- Log Settings Card -->
                    <div class="status-card">
                        <h3 class="card-title">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                style="margin-right: 8px; vertical-align: text-bottom"
                            >
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                <line x1="16" y1="13" x2="8" y2="13"></line>
                                <line x1="16" y1="17" x2="8" y2="17"></line>
                                <polyline points="10 9 9 9 8 9"></polyline>
                            </svg>
                            {{ t("log") }}
                        </h3>
                        <div class="status-list">
                            <div class="status-item">
                                <span class="label">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        style="margin-right: 6px; vertical-align: middle"
                                    >
                                        <line x1="8" y1="6" x2="21" y2="6"></line>
                                        <line x1="8" y1="12" x2="21" y2="12"></line>
                                        <line x1="8" y1="18" x2="21" y2="18"></line>
                                        <line x1="3" y1="6" x2="3.01" y2="6"></line>
                                        <line x1="3" y1="12" x2="3.01" y2="12"></line>
                                        <line x1="3" y1="18" x2="3.01" y2="18"></line>
                                    </svg>
                                    <span>
                                        {{ t("logLevel") }}
                                        <EnvVarTooltip env-var="LOG_LEVEL" doc-section="app-config" />
                                    </span>
                                </span>
                                <el-select
                                    v-model="state.debugModeEnabled"
                                    style="width: 120px"
                                    @change="handleStatsDebugChange"
                                >
                                    <el-option :label="t('normal')" :value="false" />
                                    <el-option :label="t('debug')" :value="true" />
                                </el-select>
                            </div>
                            <div class="status-item">
                                <span class="label">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        style="margin-right: 6px; vertical-align: middle"
                                    >
                                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                                        <line x1="8" y1="21" x2="16" y2="21"></line>
                                        <line x1="12" y1="17" x2="12" y2="21"></line>
                                    </svg>
                                    {{ t("logMaxCount") }}
                                </span>
                                <el-input-number
                                    v-model="state.logMaxCount"
                                    :min="1"
                                    :max="1000"
                                    style="width: 120px"
                                    @change="handleLogMaxCountChange"
                                />
                            </div>
                        </div>
                    </div>

                    <!-- Appearance Card -->
                    <div class="status-card">
                        <h3 class="card-title">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                style="margin-right: 8px; vertical-align: text-bottom"
                            >
                                <circle cx="12" cy="12" r="5"></circle>
                                <line x1="12" y1="1" x2="12" y2="3"></line>
                                <line x1="12" y1="21" x2="12" y2="23"></line>
                                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                                <line x1="1" y1="12" x2="3" y2="12"></line>
                                <line x1="21" y1="12" x2="23" y2="12"></line>
                                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                            </svg>
                            {{ t("appearance") }}
                        </h3>
                        <div class="status-list">
                            <div class="status-item">
                                <span class="label">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        style="margin-right: 6px; vertical-align: middle"
                                    >
                                        <circle cx="12" cy="12" r="5"></circle>
                                        <line x1="12" y1="1" x2="12" y2="3"></line>
                                        <line x1="12" y1="21" x2="12" y2="23"></line>
                                        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                                        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                                        <line x1="1" y1="12" x2="3" y2="12"></line>
                                        <line x1="21" y1="12" x2="23" y2="12"></line>
                                        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                                        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                                    </svg>
                                    {{ t("theme") }}
                                </span>
                                <el-select :model-value="theme" style="width: 150px" @update:model-value="setTheme">
                                    <el-option :label="t('followSystem')" value="auto" />
                                    <el-option :label="t('light')" value="light" />
                                    <el-option :label="t('dark')" value="dark" />
                                </el-select>
                            </div>
                            <div class="status-item">
                                <span class="label">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        style="margin-right: 6px; vertical-align: middle"
                                    >
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <line x1="2" y1="12" x2="22" y2="12"></line>
                                        <path
                                            d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
                                        ></path>
                                    </svg>
                                    {{ t("language") }}
                                </span>
                                <el-select
                                    v-model="state.currentLang"
                                    style="width: 150px"
                                    @change="handleLanguageChange"
                                >
                                    <el-option label="中文" value="zh" />
                                    <el-option label="English" value="en" />
                                </el-select>
                            </div>
                        </div>
                    </div>

                    <!-- Proxy Settings Card -->
                    <div class="status-card">
                        <h3 class="card-title">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                style="margin-right: 8px; vertical-align: text-bottom"
                            >
                                <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"></path>
                            </svg>
                            {{ t("proxySettings") }}
                        </h3>
                        <div class="settings-switches">
                            <div class="switch-container">
                                <span class="label">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        style="margin-right: 6px; vertical-align: middle"
                                    >
                                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                                    </svg>
                                    {{ t("streamingMode") }}
                                </span>
                                <el-switch
                                    v-model="state.streamingModeReal"
                                    inline-prompt
                                    :width="50"
                                    :active-text="t('real')"
                                    :inactive-text="t('fake')"
                                    :before-change="handleStreamingModeBeforeChange"
                                />
                            </div>
                            <div class="switch-container">
                                <span class="label">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        style="margin-right: 6px; vertical-align: middle"
                                    >
                                        <path d="M15.5 13a3.5 3.5 0 0 0 -3.5 3.5v1a3.5 3.5 0 0 0 7 0v-1.8"></path>
                                        <path d="M8.5 13a3.5 3.5 0 0 1 3.5 3.5v1a3.5 3.5 0 0 1 -7 0v-1.8"></path>
                                        <path d="M17.5 16a3.5 3.5 0 0 0 0 -7h-.5"></path>
                                        <path d="M19 9.3v-2.8a3.5 3.5 0 0 0 -7 0"></path>
                                        <path d="M6.5 16a3.5 3.5 0 0 1 0 -7h.5"></path>
                                        <path d="M5 9.3v-2.8a3.5 3.5 0 0 1 7 0v10"></path>
                                    </svg>
                                    {{ t("forceThinking") }}
                                </span>
                                <el-switch
                                    v-model="state.forceThinkingEnabled"
                                    :width="50"
                                    :before-change="handleForceThinkingBeforeChange"
                                />
                            </div>
                            <div class="switch-container">
                                <span class="label">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        style="margin-right: 6px; vertical-align: middle"
                                    >
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <line x1="2" y1="12" x2="22" y2="12"></line>
                                        <path
                                            d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
                                        ></path>
                                    </svg>
                                    {{ t("forceWebSearch") }}
                                </span>
                                <el-switch
                                    v-model="state.forceWebSearchEnabled"
                                    :width="50"
                                    :before-change="handleForceWebSearchBeforeChange"
                                />
                            </div>
                            <div class="switch-container">
                                <span class="label">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        style="margin-right: 6px; vertical-align: middle"
                                    >
                                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                                    </svg>
                                    {{ t("forceUrlContext") }}
                                </span>
                                <el-switch
                                    v-model="state.forceUrlContextEnabled"
                                    :width="50"
                                    :before-change="handleForceUrlContextBeforeChange"
                                />
                            </div>
                            <div class="switch-container">
                                <span class="label">
                                    <svg
                                        xmlns="http://www.w3.org/2000/svg"
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        style="margin-right: 6px; vertical-align: middle"
                                    >
                                        <path d="M12 3l7 4v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7l7-4z"></path>
                                        <path d="M9 12h6"></path>
                                    </svg>
                                    <span>
                                        {{ t("safetySettingsThreshold") }}
                                        <EnvVarTooltip env-var="SAFETY_SETTINGS_THRESHOLD" doc-section="other-config" />
                                    </span>
                                </span>
                                <el-select
                                    v-model="state.safetySettingsThreshold"
                                    style="width: 150px"
                                    @change="handleSafetySettingsThresholdChange"
                                >
                                    <el-option
                                        v-for="option in safetySettingsThresholdOptions"
                                        :key="option.value"
                                        :label="t(option.label)"
                                        :value="option.value"
                                    />
                                </el-select>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- STATS VIEW -->
            <div v-if="activeTab === 'stats'" class="view-container">
                <header class="page-header stats-page-header">
                    <div class="page-header-main">
                        <h1>{{ t("usageStats") }}</h1>
                    </div>
                    <div class="page-meta">
                        <input
                            ref="usageStatsImportInput"
                            type="file"
                            style="display: none"
                            accept=".jsonl"
                            @change="handleUsageStatsImport"
                        />
                        <button
                            class="meta-chip stats-download-button"
                            type="button"
                            :title="t('importUsageStats')"
                            :aria-label="t('importUsageStats')"
                            :disabled="isUsageStatsTransferBusy"
                            @click="triggerUsageStatsImport"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            >
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="17 8 12 3 7 8"></polyline>
                                <line x1="12" y1="3" x2="12" y2="15"></line>
                            </svg>
                        </button>
                        <button
                            class="meta-chip stats-download-button"
                            type="button"
                            :title="t('exportUsageStats')"
                            :aria-label="t('exportUsageStats')"
                            :disabled="isUsageStatsTransferBusy"
                            @click="downloadUsageStats"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            >
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                        </button>
                        <span class="meta-chip">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                style="margin-right: 6px; opacity: 0.7"
                            >
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                            <span style="opacity: 0.8; margin-right: 4px">{{ t("startedAt") }}:</span>
                            <span style="font-weight: 600; font-family: monospace">{{
                                formatDateTime(statsState.startedAt)
                            }}</span>
                        </span>
                        <span class="meta-chip">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                style="margin-right: 6px; opacity: 0.7"
                            >
                                <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
                            </svg>
                            <span style="opacity: 0.8; margin-right: 4px">{{ t("uptime") }}:</span>
                            <span style="font-weight: 600; font-family: monospace">{{
                                formatStatsUptime(statsState.startedAt, statsState.summary.uptimeSeconds)
                            }}</span>
                        </span>
                    </div>
                </header>

                <section
                    class="status-card stats-filters-card"
                    :class="{ 'is-collapsed-mobile': isStatsFiltersMobile && statsFiltersCollapsed }"
                >
                    <div
                        class="stats-filters-header"
                        :class="{ 'is-collapsible': isStatsFiltersMobile }"
                        :role="isStatsFiltersMobile ? 'button' : null"
                        :tabindex="isStatsFiltersMobile ? 0 : null"
                        :aria-expanded="isStatsFiltersMobile ? String(!statsFiltersCollapsed) : null"
                        @click="toggleStatsFilters"
                        @keydown="handleStatsFiltersHeaderKeydown"
                    >
                        <div class="stats-filters-copy">
                            <h3 class="card-title">{{ t("usageFilters") }}</h3>
                        </div>
                        <div v-if="!isStatsFiltersMobile" class="stats-filters-actions">
                            <el-select
                                v-model="timeRange"
                                popper-class="stats-filter-select-dropdown"
                                class="time-range-select stats-time-range-select"
                            >
                                <el-option :label="t('timeRangeAll')" value="all" />
                                <el-option :label="t('timeRange1h')" value="1h" />
                                <el-option :label="t('timeRange6h')" value="6h" />
                                <el-option :label="t('timeRange24h')" value="24h" />
                                <el-option :label="t('timeRange7d')" value="7d" />
                                <el-option :label="t('timeRange30d')" value="30d" />
                                <el-option :label="t('timeRangeCustom')" value="custom" />
                            </el-select>
                            <button
                                class="record-filter-reset"
                                :class="{ 'is-active': hasActiveStatsFilters }"
                                :disabled="!hasActiveStatsFilters"
                                @click.stop="resetRecordFilters"
                            >
                                {{ t("resetFilters") }}
                            </button>
                        </div>
                        <span class="stats-filters-toggle-indicator" :class="{ 'is-collapsed': statsFiltersCollapsed }">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="18"
                                height="18"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                aria-hidden="true"
                            >
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </span>
                    </div>
                    <div v-show="!isStatsFiltersMobile || !statsFiltersCollapsed" class="stats-filters-body">
                        <div v-if="isStatsFiltersMobile" class="stats-filters-actions">
                            <el-select
                                v-model="timeRange"
                                popper-class="stats-filter-select-dropdown"
                                class="time-range-select stats-time-range-select"
                            >
                                <el-option :label="t('timeRangeAll')" value="all" />
                                <el-option :label="t('timeRange1h')" value="1h" />
                                <el-option :label="t('timeRange6h')" value="6h" />
                                <el-option :label="t('timeRange24h')" value="24h" />
                                <el-option :label="t('timeRange7d')" value="7d" />
                                <el-option :label="t('timeRange30d')" value="30d" />
                                <el-option :label="t('timeRangeCustom')" value="custom" />
                            </el-select>
                            <button
                                class="record-filter-reset"
                                :class="{ 'is-active': hasActiveStatsFilters }"
                                :disabled="!hasActiveStatsFilters"
                                @click="resetRecordFilters"
                            >
                                {{ t("resetFilters") }}
                            </button>
                        </div>
                        <div v-if="timeRange === 'custom'" class="stats-custom-range">
                            <span class="stats-custom-range-label">{{ t("customTimeRange") }}</span>
                            <el-date-picker
                                v-model="customTimeRange"
                                type="datetimerange"
                                class="stats-custom-range-picker"
                                popper-class="stats-filter-select-dropdown stats-date-range-dropdown"
                                :placement="isStatsFiltersMobile ? 'bottom-start' : 'bottom'"
                                :teleported="!isStatsFiltersMobile"
                                :clearable="false"
                                :default-time="DATE_PICKER_DEFAULT_TIME"
                                :editable="false"
                                :range-separator="'~'"
                                :start-placeholder="t('customTimeRangeStart')"
                                :end-placeholder="t('customTimeRangeEnd')"
                            />
                        </div>
                        <div class="records-filters stats-record-filters">
                            <el-select
                                v-model="recordFilters.apiFormat"
                                multiple
                                popper-class="stats-filter-select-dropdown"
                                :placeholder="t('apiFormat')"
                                class="record-filter-select record-filter-select-custom"
                                @change="handleFilterChange('apiFormat')"
                                @visible-change="v => !v && (filterSearchQuery.apiFormat = '')"
                            >
                                <template #prefix>
                                    <span
                                        class="custom-label-text"
                                        :class="{
                                            'is-placeholder-label':
                                                recordFilters.apiFormat.length === 0 ||
                                                (recordFilters.apiFormat.length === 1 &&
                                                    recordFilters.apiFormat[0] === ''),
                                        }"
                                    >
                                        {{ getFilterLabel("apiFormat", t("apiFormat")) }}
                                    </span>
                                </template>
                                <el-option disabled class="stats-filter-search-option">
                                    <el-input
                                        v-model="filterSearchQuery.apiFormat"
                                        :placeholder="t('searchPlaceholder')"
                                        @click.stop
                                    >
                                        <template #suffix>
                                            <el-icon
                                                class="stats-search-clear-btn"
                                                :class="{ 'is-visible': filterSearchQuery.apiFormat }"
                                                @click.stop="filterSearchQuery.apiFormat = ''"
                                            >
                                                <CircleClose />
                                            </el-icon>
                                        </template>
                                    </el-input>
                                </el-option>
                                <el-option :label="t('timeRangeAll')" value="" />
                                <el-option
                                    v-for="item in recordFilterOptions.apiFormats"
                                    :key="item"
                                    :label="translateLabel(item)"
                                    :value="item"
                                />
                            </el-select>
                            <el-select
                                v-model="recordFilters.streamMode"
                                multiple
                                popper-class="stats-filter-select-dropdown"
                                :placeholder="t('streamingMode')"
                                class="record-filter-select record-filter-select-custom"
                                @change="handleFilterChange('streamMode')"
                                @visible-change="v => !v && (filterSearchQuery.streamMode = '')"
                            >
                                <template #prefix>
                                    <span
                                        class="custom-label-text"
                                        :class="{
                                            'is-placeholder-label':
                                                recordFilters.streamMode.length === 0 ||
                                                (recordFilters.streamMode.length === 1 &&
                                                    recordFilters.streamMode[0] === ''),
                                        }"
                                    >
                                        {{ getFilterLabel("streamMode", t("streamingMode")) }}
                                    </span>
                                </template>
                                <el-option disabled class="stats-filter-search-option">
                                    <el-input
                                        v-model="filterSearchQuery.streamMode"
                                        :placeholder="t('searchPlaceholder')"
                                        @click.stop
                                    >
                                        <template #suffix>
                                            <el-icon
                                                class="stats-search-clear-btn"
                                                :class="{ 'is-visible': filterSearchQuery.streamMode }"
                                                @click.stop="filterSearchQuery.streamMode = ''"
                                            >
                                                <CircleClose />
                                            </el-icon>
                                        </template>
                                    </el-input>
                                </el-option>
                                <el-option :label="t('timeRangeAll')" value="" />
                                <el-option
                                    v-for="item in recordFilterOptions.streamModes"
                                    :key="item"
                                    :label="translateLabel(item)"
                                    :value="item"
                                />
                            </el-select>
                            <el-select
                                v-model="recordFilters.model"
                                multiple
                                popper-class="stats-filter-select-dropdown"
                                :placeholder="t('requestModel')"
                                class="record-filter-select record-filter-select-wide record-filter-select-custom"
                                @change="handleFilterChange('model')"
                                @visible-change="v => !v && (filterSearchQuery.model = '')"
                            >
                                <template #prefix>
                                    <span
                                        class="custom-label-text"
                                        :class="{
                                            'is-placeholder-label':
                                                recordFilters.model.length === 0 ||
                                                (recordFilters.model.length === 1 && recordFilters.model[0] === ''),
                                        }"
                                    >
                                        {{ getFilterLabel("model", t("requestModel")) }}
                                    </span>
                                </template>
                                <el-option disabled class="stats-filter-search-option">
                                    <el-input
                                        v-model="filterSearchQuery.model"
                                        :placeholder="t('searchPlaceholder')"
                                        @click.stop
                                    >
                                        <template #suffix>
                                            <el-icon
                                                class="stats-search-clear-btn"
                                                :class="{ 'is-visible': filterSearchQuery.model }"
                                                @click.stop="filterSearchQuery.model = ''"
                                            >
                                                <CircleClose />
                                            </el-icon>
                                        </template>
                                    </el-input>
                                </el-option>
                                <el-option :label="t('timeRangeAll')" value="" />
                                <el-option
                                    v-for="item in recordFilterOptions.models"
                                    :key="item"
                                    :label="item === EMPTY_FILTER_VALUE ? t('emptyValue') : item"
                                    :value="item"
                                />
                            </el-select>
                            <el-select
                                v-model="recordFilters.outcome"
                                multiple
                                popper-class="stats-filter-select-dropdown"
                                :placeholder="t('requestOutcome')"
                                class="record-filter-select record-filter-select-custom"
                                @change="handleFilterChange('outcome')"
                                @visible-change="v => !v && (filterSearchQuery.outcome = '')"
                            >
                                <template #prefix>
                                    <span
                                        class="custom-label-text"
                                        :class="{
                                            'is-placeholder-label':
                                                recordFilters.outcome.length === 0 ||
                                                (recordFilters.outcome.length === 1 && recordFilters.outcome[0] === ''),
                                        }"
                                    >
                                        {{ getFilterLabel("outcome", t("requestOutcome")) }}
                                    </span>
                                </template>
                                <el-option disabled class="stats-filter-search-option">
                                    <el-input
                                        v-model="filterSearchQuery.outcome"
                                        :placeholder="t('searchPlaceholder')"
                                        @click.stop
                                    >
                                        <template #suffix>
                                            <el-icon
                                                class="stats-search-clear-btn"
                                                :class="{ 'is-visible': filterSearchQuery.outcome }"
                                                @click.stop="filterSearchQuery.outcome = ''"
                                            >
                                                <CircleClose />
                                            </el-icon>
                                        </template>
                                    </el-input>
                                </el-option>
                                <el-option :label="t('timeRangeAll')" value="" />
                                <el-option
                                    v-for="item in recordFilterOptions.outcomes"
                                    :key="item"
                                    :label="translateLabel(item)"
                                    :value="item"
                                />
                            </el-select>
                            <el-select
                                v-model="recordFilters.statusCode"
                                multiple
                                popper-class="stats-filter-select-dropdown"
                                :placeholder="t('requestStatus')"
                                class="record-filter-select record-filter-select-custom"
                                @change="handleFilterChange('statusCode')"
                                @visible-change="v => !v && (filterSearchQuery.statusCode = '')"
                            >
                                <template #prefix>
                                    <span
                                        class="custom-label-text"
                                        :class="{
                                            'is-placeholder-label':
                                                recordFilters.statusCode.length === 0 ||
                                                (recordFilters.statusCode.length === 1 &&
                                                    recordFilters.statusCode[0] === ''),
                                        }"
                                    >
                                        {{ getFilterLabel("statusCode", t("requestStatus")) }}
                                    </span>
                                </template>
                                <el-option disabled class="stats-filter-search-option">
                                    <el-input
                                        v-model="filterSearchQuery.statusCode"
                                        :placeholder="t('searchPlaceholder')"
                                        @click.stop
                                    >
                                        <template #suffix>
                                            <el-icon
                                                class="stats-search-clear-btn"
                                                :class="{ 'is-visible': filterSearchQuery.statusCode }"
                                                @click.stop="filterSearchQuery.statusCode = ''"
                                            >
                                                <CircleClose />
                                            </el-icon>
                                        </template>
                                    </el-input>
                                </el-option>
                                <el-option :label="t('timeRangeAll')" value="" />
                                <el-option
                                    v-for="item in recordFilterOptions.statusCodes"
                                    :key="item"
                                    :label="item === EMPTY_FILTER_VALUE ? t('emptyValue') : String(item)"
                                    :value="item === EMPTY_FILTER_VALUE ? item : String(item)"
                                />
                            </el-select>
                            <el-select
                                v-model="recordFilters.finalAccount"
                                multiple
                                popper-class="stats-filter-select-dropdown"
                                :placeholder="t('requestAccount')"
                                class="record-filter-select record-filter-select-wide record-filter-select-custom"
                                @change="handleFilterChange('finalAccount')"
                                @visible-change="v => !v && (filterSearchQuery.finalAccount = '')"
                            >
                                <template #prefix>
                                    <span
                                        class="custom-label-text"
                                        :class="{
                                            'is-placeholder-label':
                                                recordFilters.finalAccount.length === 0 ||
                                                (recordFilters.finalAccount.length === 1 &&
                                                    recordFilters.finalAccount[0] === ''),
                                        }"
                                    >
                                        {{ getFilterLabel("finalAccount", t("requestAccount")) }}
                                    </span>
                                </template>
                                <el-option disabled class="stats-filter-search-option">
                                    <el-input
                                        v-model="filterSearchQuery.finalAccount"
                                        :placeholder="t('searchPlaceholder')"
                                        @click.stop
                                    >
                                        <template #suffix>
                                            <el-icon
                                                class="stats-search-clear-btn"
                                                :class="{ 'is-visible': filterSearchQuery.finalAccount }"
                                                @click.stop="filterSearchQuery.finalAccount = ''"
                                            >
                                                <CircleClose />
                                            </el-icon>
                                        </template>
                                    </el-input>
                                </el-option>
                                <el-option :label="t('timeRangeAll')" value="" />
                                <el-option
                                    v-for="item in recordFilterOptions.finalAccounts"
                                    :key="item.value"
                                    :label="item.label"
                                    :value="item.value"
                                />
                            </el-select>
                            <el-select
                                v-model="recordFilters.clientIp"
                                multiple
                                popper-class="stats-filter-select-dropdown"
                                :placeholder="t('requestIp')"
                                class="record-filter-select record-filter-select-custom"
                                @change="handleFilterChange('clientIp')"
                                @visible-change="v => !v && (filterSearchQuery.clientIp = '')"
                            >
                                <template #prefix>
                                    <span
                                        class="custom-label-text"
                                        :class="{
                                            'is-placeholder-label':
                                                recordFilters.clientIp.length === 0 ||
                                                (recordFilters.clientIp.length === 1 &&
                                                    recordFilters.clientIp[0] === ''),
                                        }"
                                    >
                                        {{ getFilterLabel("clientIp", t("requestIp")) }}
                                    </span>
                                </template>
                                <el-option disabled class="stats-filter-search-option">
                                    <el-input
                                        v-model="filterSearchQuery.clientIp"
                                        :placeholder="t('searchPlaceholder')"
                                        @click.stop
                                    >
                                        <template #suffix>
                                            <el-icon
                                                class="stats-search-clear-btn"
                                                :class="{ 'is-visible': filterSearchQuery.clientIp }"
                                                @click.stop="filterSearchQuery.clientIp = ''"
                                            >
                                                <CircleClose />
                                            </el-icon>
                                        </template>
                                    </el-input>
                                </el-option>
                                <el-option :label="t('timeRangeAll')" value="" />
                                <el-option
                                    v-for="item in recordFilterOptions.clientIps"
                                    :key="item"
                                    :label="item === EMPTY_FILTER_VALUE ? t('emptyValue') : item"
                                    :value="item"
                                />
                            </el-select>
                            <el-select
                                v-model="recordFilters.attemptCount"
                                multiple
                                popper-class="stats-filter-select-dropdown"
                                :placeholder="t('requestAttempts')"
                                class="record-filter-select record-filter-select-narrow record-filter-select-custom"
                                @change="handleFilterChange('attemptCount')"
                                @visible-change="v => !v && (filterSearchQuery.attemptCount = '')"
                            >
                                <template #prefix>
                                    <span
                                        class="custom-label-text"
                                        :class="{
                                            'is-placeholder-label':
                                                recordFilters.attemptCount.length === 0 ||
                                                (recordFilters.attemptCount.length === 1 &&
                                                    recordFilters.attemptCount[0] === ''),
                                        }"
                                    >
                                        {{ getFilterLabel("attemptCount", t("requestAttempts")) }}
                                    </span>
                                </template>
                                <el-option disabled class="stats-filter-search-option">
                                    <el-input
                                        v-model="filterSearchQuery.attemptCount"
                                        :placeholder="t('searchPlaceholder')"
                                        @click.stop
                                    >
                                        <template #suffix>
                                            <el-icon
                                                class="stats-search-clear-btn"
                                                :class="{ 'is-visible': filterSearchQuery.attemptCount }"
                                                @click.stop="filterSearchQuery.attemptCount = ''"
                                            >
                                                <CircleClose />
                                            </el-icon>
                                        </template>
                                    </el-input>
                                </el-option>
                                <el-option :label="t('timeRangeAll')" value="" />
                                <el-option
                                    v-for="item in recordFilterOptions.attemptCounts"
                                    :key="item"
                                    :label="item === EMPTY_FILTER_VALUE ? t('emptyValue') : String(item)"
                                    :value="item === EMPTY_FILTER_VALUE ? item : String(item)"
                                />
                            </el-select>
                        </div>
                    </div>
                </section>

                <div class="stats-grid-v2">
                    <div class="stats-card-v2">
                        <div class="card-icon is-total">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            >
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                            </svg>
                        </div>
                        <div class="card-info">
                            <span class="stats-label">{{ t("requestRecords") }}</span>
                            <strong class="stats-value">{{ filteredSummary.totalRequests }}</strong>
                        </div>
                    </div>
                    <div class="stats-card-v2">
                        <div class="card-icon is-success">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            >
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                <polyline points="22 4 12 14.01 9 11.01"></polyline>
                            </svg>
                        </div>
                        <div class="card-info">
                            <span class="stats-label">{{ t("successRate") }}</span>
                            <strong class="stats-value">{{ filteredSummary.successRate }}%</strong>
                        </div>
                    </div>
                    <div class="stats-card-v2">
                        <div class="card-icon is-warning">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            >
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                        </div>
                        <div class="card-info">
                            <span class="stats-label">{{ t("avgDuration") }}</span>
                            <strong class="stats-value">{{ formatDuration(filteredSummary.avgDurationMs) }}</strong>
                        </div>
                    </div>
                    <div class="stats-card-v2">
                        <div class="card-icon is-active">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            >
                                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                            </svg>
                        </div>
                        <div class="card-info">
                            <span class="stats-label">{{ t("activeRequests") }}</span>
                            <strong class="stats-value">{{ filteredSummary.activeRequests }}</strong>
                        </div>
                    </div>
                    <div class="stats-card-v2">
                        <div class="card-icon is-accounts">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            >
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                <circle cx="9" cy="7" r="4"></circle>
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                            </svg>
                        </div>
                        <div class="card-info">
                            <span class="stats-label">{{ t("uniqueAccountPairs") }}</span>
                            <strong class="stats-value">{{ filteredSummary.uniqueAccountPairs }}</strong>
                        </div>
                    </div>
                    <div class="stats-card-v2">
                        <div class="card-icon is-error">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="20"
                                height="20"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            >
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="15" y1="9" x2="9" y2="15"></line>
                                <line x1="9" y1="9" x2="15" y2="15"></line>
                            </svg>
                        </div>
                        <div class="card-info">
                            <span class="stats-label">{{ t("failed") }}</span>
                            <strong class="stats-value">{{ filteredSummary.failedRequests }}</strong>
                        </div>
                    </div>
                </div>

                <div class="stats-dashboard-grid">
                    <section class="status-card summary-card-visual">
                        <div class="card-header-v2">
                            <h3 class="card-title-usage">{{ t("requestSummary") }}</h3>
                            <div class="summary-total-badge">{{ filteredSummary.totalRequests }} {{ t("total") }}</div>
                        </div>

                        <!-- Visual Progress Bar -->
                        <div class="progress-stacked-root">
                            <div class="progress-info-labels">
                                <span class="label-success"
                                    >{{ t("success") }}: {{ filteredSummary.successCount }}</span
                                >
                                <span class="label-error">{{ t("failed") }}: {{ filteredSummary.errorCount }}</span>
                                <span class="label-warn">{{ t("aborted") }}: {{ filteredSummary.abortedCount }}</span>
                            </div>
                            <div class="progress-stacked-bar">
                                <div
                                    class="bar-segment is-success"
                                    :style="{
                                        width:
                                            filteredSummary.totalRequests > 0
                                                ? (filteredSummary.successCount / filteredSummary.totalRequests) * 100 +
                                                  '%'
                                                : '0%',
                                    }"
                                    :title="t('success')"
                                ></div>
                                <div
                                    class="bar-segment is-error"
                                    :style="{
                                        width:
                                            filteredSummary.totalRequests > 0
                                                ? (filteredSummary.errorCount / filteredSummary.totalRequests) * 100 +
                                                  '%'
                                                : '0%',
                                    }"
                                    :title="t('failed')"
                                ></div>
                                <div
                                    class="bar-segment is-warning"
                                    :style="{
                                        width:
                                            filteredSummary.totalRequests > 0
                                                ? (filteredSummary.abortedCount / filteredSummary.totalRequests) * 100 +
                                                  '%'
                                                : '0%',
                                    }"
                                    :title="t('aborted')"
                                ></div>
                            </div>
                        </div>

                        <div class="breakdown-grid-v2">
                            <div class="breakdown-block-v2">
                                <h4>{{ t("apiFormat") }}</h4>
                                <div class="breakdown-list-v2">
                                    <div
                                        v-for="item in filteredSummary.formatBreakdown"
                                        :key="`format-${item.key}`"
                                        class="modern-chip"
                                    >
                                        <span class="chip-dot"></span>
                                        <span class="chip-label">{{ translateLabel(item.key) }}</span>
                                        <span class="chip-count">{{ item.count }}</span>
                                    </div>
                                </div>
                            </div>
                            <div class="breakdown-block-v2">
                                <h4>{{ t("streamingMode") }}</h4>
                                <div class="breakdown-list-v2">
                                    <div
                                        v-for="item in filteredSummary.streamModeBreakdown"
                                        :key="`streamMode-${item.key}`"
                                        class="modern-chip mode-chip"
                                    >
                                        <span class="chip-label">{{ translateLabel(item.key) }}</span>
                                        <span class="chip-count">{{ item.count }}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                <div class="full-width-section">
                    <section class="status-card wide-card">
                        <div class="card-header-v2">
                            <h3 class="card-title-usage">{{ t("accountUsageBreakdown") }}</h3>
                        </div>
                        <div v-if="filteredAccounts.length === 0" class="empty-state">
                            {{ t("noUsageStats") }}
                        </div>
                        <div v-else class="table-scroll-wrapper">
                            <table class="data-table fixed-header-table">
                                <thead>
                                    <tr>
                                        <th>{{ t("account") }}</th>
                                        <th>{{ t("total") }}</th>
                                        <th>{{ t("success") }}</th>
                                        <th>{{ t("failed") }}</th>
                                        <th>{{ t("aborted") }}</th>
                                        <th>{{ t("successRate") }}</th>
                                        <th>{{ t("avgDuration") }}</th>
                                        <th>{{ t("modelUsage") }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="item in filteredAccounts" :key="item.accountKey">
                                        <td class="account-cell">
                                            {{ formatAccount(item.authIndex, item.accountName) }}
                                        </td>
                                        <td>{{ item.totalRequests }}</td>
                                        <td class="status-ok">{{ item.successCount }}</td>
                                        <td class="status-error">{{ item.errorCount }}</td>
                                        <td class="status-warning">{{ item.abortedCount }}</td>
                                        <td>{{ item.successRate }}%</td>
                                        <td>{{ formatDuration(item.avgDurationMs) }}</td>
                                        <td>
                                            <div class="breakdown-list">
                                                <span
                                                    v-for="mc in item.modelCounts"
                                                    :key="mc.key"
                                                    class="usage-tag-compact"
                                                    :style="{
                                                        '--progress':
                                                            (item.totalRequests > 0
                                                                ? (mc.count / item.totalRequests) * 100
                                                                : 0) + '%',
                                                        '--error-progress':
                                                            (mc.count > 0 ? (mc.error / mc.count) * 100 : 0) + '%',
                                                    }"
                                                >
                                                    <span class="tag-label">
                                                        {{ mc.key === EMPTY_FILTER_VALUE ? t("emptyValue") : mc.key }}
                                                    </span>
                                                    <span class="tag-count">
                                                        {{ mc.count }}
                                                        <span v-if="mc.error > 0" class="tag-error-count"
                                                            >({{ mc.error }})</span
                                                        >
                                                    </span>
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section class="status-card wide-card">
                        <div class="card-header-v2">
                            <h3 class="card-title-usage">{{ t("modelUsageBreakdown") }}</h3>
                        </div>
                        <div v-if="filteredModels.length === 0" class="empty-state">
                            {{ t("noUsageStats") }}
                        </div>
                        <div v-else class="table-scroll-wrapper">
                            <table class="data-table fixed-header-table">
                                <thead>
                                    <tr>
                                        <th>{{ t("requestModel") }}</th>
                                        <th>{{ t("total") }}</th>
                                        <th>{{ t("success") }}</th>
                                        <th>{{ t("failed") }}</th>
                                        <th>{{ t("aborted") }}</th>
                                        <th>{{ t("successRate") }}</th>
                                        <th>{{ t("avgDuration") }}</th>
                                        <th>{{ t("accountUsage") }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="item in filteredModels" :key="item.modelKey">
                                        <td class="account-cell">
                                            {{ item.modelKey === EMPTY_FILTER_VALUE ? t("emptyValue") : item.modelKey }}
                                        </td>
                                        <td>{{ item.totalRequests }}</td>
                                        <td class="status-ok">{{ item.successCount }}</td>
                                        <td class="status-error">{{ item.errorCount }}</td>
                                        <td class="status-warning">{{ item.abortedCount }}</td>
                                        <td>{{ item.successRate }}%</td>
                                        <td>{{ formatDuration(item.avgDurationMs) }}</td>
                                        <td>
                                            <div class="breakdown-list">
                                                <span
                                                    v-for="ac in item.accountCounts"
                                                    :key="ac.key"
                                                    class="usage-tag-compact"
                                                    :style="{
                                                        '--progress':
                                                            (item.totalRequests > 0
                                                                ? (ac.count / item.totalRequests) * 100
                                                                : 0) + '%',
                                                        '--error-progress':
                                                            (ac.count > 0 ? (ac.error / ac.count) * 100 : 0) + '%',
                                                    }"
                                                >
                                                    <span class="tag-label">
                                                        {{ formatAccount(ac.authIndex, ac.accountName) }}
                                                    </span>
                                                    <span class="tag-count">
                                                        {{ ac.count }}
                                                        <span v-if="ac.error > 0" class="tag-error-count"
                                                            >({{ ac.error }})</span
                                                        >
                                                    </span>
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </section>
                </div>

                <div class="full-width-section">
                    <section class="status-card records-card">
                        <div class="card-header-v2">
                            <h3 class="card-title-usage">{{ t("requestRecords") }}</h3>
                            <span class="records-order">{{ t("recentToOldest") }}</span>
                        </div>
                        <div v-if="filteredRecords.length === 0" class="empty-state">
                            {{ t("noRequestRecords") }}
                        </div>
                        <div v-else ref="recordsTableWrapper" class="table-scroll-wrapper records-scroll-wrapper">
                            <table class="data-table fixed-header-table">
                                <thead>
                                    <tr>
                                        <th>{{ t("requestTime") }}</th>
                                        <th>{{ t("requestId") }}</th>
                                        <th>{{ t("apiFormat") }}</th>
                                        <th>{{ t("streamingMode") }}</th>
                                        <th>{{ t("requestModel") }}</th>
                                        <th>{{ t("requestOutcome") }}</th>
                                        <th>{{ t("requestStatus") }}</th>
                                        <th>{{ t("requestDuration") }}</th>
                                        <th>{{ t("requestAccount") }}</th>
                                        <th>{{ t("requestAttempts") }}</th>
                                        <th>{{ t("requestIp") }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="record in paginatedRecords" :key="record.sequence">
                                        <td class="sticky-time-col">{{ formatDateTime(record.startedAt) }}</td>
                                        <td class="mono truncate-cell">{{ record.requestId }}</td>
                                        <td>{{ translateLabel(record.apiFormat) }}</td>
                                        <td>{{ translateLabel(record.streamMode) }}</td>
                                        <td>{{ record.model || "-" }}</td>
                                        <td>
                                            <span
                                                class="outcome-badge"
                                                :class="`is-${record.outcome}`"
                                                :style="canShowErrorDetail(record) ? 'cursor: pointer' : ''"
                                                :title="canShowErrorDetail(record) ? t('clickToViewError') : ''"
                                                @click="showErrorDetail(record)"
                                            >
                                                {{ translateLabel(record.outcome) }}
                                            </span>
                                        </td>
                                        <td>{{ record.statusCode ?? "-" }}</td>
                                        <td>{{ formatDuration(record.durationMs) }}</td>
                                        <td>{{ formatAccount(record.finalAuthIndex, record.finalAccountName) }}</td>
                                        <td class="attempts-cell">
                                            <span
                                                class="attempts-count"
                                                :class="{ 'is-clickable': record.attemptCount > 1 }"
                                                :title="record.attemptCount > 1 ? t('clickToViewAttempts') : ''"
                                                @click="record.attemptCount > 1 && showAttemptsDetail(record)"
                                                >{{ record.attemptCount }}</span
                                            >
                                        </td>
                                        <td class="mono truncate-cell">
                                            <el-tooltip
                                                :content="record.clientIp || '-'"
                                                placement="top"
                                                effect="dark"
                                                :hide-after="0"
                                                :show-after="150"
                                                :disabled="!record.clientIp"
                                            >
                                                <span class="request-ip-text">
                                                    {{ record.clientIp || "-" }}
                                                </span>
                                            </el-tooltip>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <div v-if="filteredRecords.length > 0" class="records-pagination">
                            <div class="records-pagination-summary">
                                <span>{{ t("paginationRange", recordsPaginationRange) }}</span>
                                <label class="records-pagination-size">
                                    <span>{{ t("paginationPageSize") }}</span>
                                    <select
                                        class="records-pagination-select"
                                        :value="recordsPageSize"
                                        @change="handleRecordsPageSizeChange"
                                    >
                                        <option v-for="size in RECORDS_PAGE_SIZE_OPTIONS" :key="size" :value="size">
                                            {{ size }}
                                        </option>
                                    </select>
                                </label>
                            </div>
                            <div class="records-pagination-controls">
                                <button
                                    class="records-pagination-btn"
                                    type="button"
                                    :disabled="recordsCurrentPage === 1"
                                    @click="setRecordsPage(1)"
                                >
                                    {{ t("paginationFirst") }}
                                </button>
                                <button
                                    class="records-pagination-btn"
                                    type="button"
                                    :disabled="recordsCurrentPage === 1"
                                    @click="setRecordsPage(recordsCurrentPage - 1)"
                                >
                                    {{ t("paginationPrevious") }}
                                </button>
                                <div class="records-pagination-pages">
                                    <template v-for="item in recordsPaginationItems" :key="item.key">
                                        <span
                                            v-if="item.type === 'ellipsis'"
                                            class="records-pagination-ellipsis"
                                            aria-hidden="true"
                                        >
                                            ...
                                        </span>
                                        <button
                                            v-else
                                            class="records-pagination-btn records-pagination-page"
                                            :class="{ 'is-active': item.page === recordsCurrentPage }"
                                            type="button"
                                            :aria-current="item.page === recordsCurrentPage ? 'page' : undefined"
                                            @click="setRecordsPage(item.page)"
                                        >
                                            {{ item.page }}
                                        </button>
                                    </template>
                                </div>
                                <button
                                    class="records-pagination-btn"
                                    type="button"
                                    :disabled="recordsCurrentPage === recordsTotalPages"
                                    @click="setRecordsPage(recordsCurrentPage + 1)"
                                >
                                    {{ t("paginationNext") }}
                                </button>
                                <button
                                    class="records-pagination-btn"
                                    type="button"
                                    :disabled="recordsCurrentPage === recordsTotalPages"
                                    @click="setRecordsPage(recordsTotalPages)"
                                >
                                    {{ t("paginationLast") }}
                                </button>
                                <label class="records-pagination-jump">
                                    <span>{{ t("paginationJumpTo") }}</span>
                                    <input
                                        v-model="recordsPageJumpInput"
                                        class="records-pagination-input"
                                        type="number"
                                        inputmode="numeric"
                                        min="1"
                                        :max="recordsTotalPages"
                                        @keydown.enter.prevent="submitRecordsPageJump"
                                    />
                                    <button
                                        class="records-pagination-btn records-pagination-go"
                                        type="button"
                                        @click="submitRecordsPageJump"
                                    >
                                        {{ t("paginationGo") }}
                                    </button>
                                </label>
                            </div>
                        </div>
                    </section>
                </div>
            </div>

            <!-- LOGS VIEW -->
            <div v-if="activeTab === 'logs'" class="view-container logs-view-container">
                <header class="page-header" style="display: flex; justify-content: space-between; align-items: center">
                    <h1>{{ t("realtimeLogs") }} ({{ state.logCount }})</h1>
                    <button
                        class="btn-icon"
                        :title="t('downloadLogs')"
                        style="
                            padding: 8px;
                            border-radius: 8px;
                            background: var(--bg-card);
                            border: 1px solid var(--border-light);
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            gap: 6px;
                            color: var(--text-primary);
                        "
                        @click="downloadCurrentLogs"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        >
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        <span style="font-size: 0.9rem; font-weight: 500">{{ t("downloadLogs") }}</span>
                    </button>
                </header>
                <div class="status-card logs-card">
                    <pre id="log-container" v-html="formattedLogs"></pre>
                </div>
            </div>
        </main>

        <!-- Mobile Floating Action Buttons -->
        <el-affix
            :offset="90"
            position="bottom"
            class="mobile-only"
            style="position: fixed; right: 0; bottom: calc(90px + env(safe-area-inset-bottom, 0px)); z-index: 999"
        >
            <div class="floating-actions" :class="{ 'is-expanded': state.floatingActionsExpanded }">
                <button
                    class="floating-btn toggle-btn primary-btn"
                    :class="{ 'is-active': state.floatingActionsExpanded }"
                    :title="state.floatingActionsExpanded ? t('collapse') : t('expand')"
                    @click="state.floatingActionsExpanded = !state.floatingActionsExpanded"
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
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                </button>
                <button class="floating-btn logout-button secondary-btn" :title="t('logout')" @click="handleLogout">
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
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                        <polyline points="16 17 21 12 16 7"></polyline>
                        <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                </button>
                <button
                    class="floating-btn lang-switcher secondary-btn"
                    :title="t('switchLanguage')"
                    @click="handleLanguageChange(state.currentLang === 'en' ? 'zh' : 'en')"
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
                        <path d="m5 8 6 6"></path>
                        <path d="m4 14 6-6 2-3"></path>
                        <path d="M2 5h12"></path>
                        <path d="M7 2h1"></path>
                        <path d="m22 22-5-10-5 10"></path>
                        <path d="M14 18h6"></path>
                    </svg>
                </button>
            </div>
        </el-affix>
    </div>
</template>

<script setup>
import { computed, h, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch, watchEffect } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox, ElNotification } from "element-plus";
import { CircleClose } from "@element-plus/icons-vue";
import JSZip from "jszip";
import escapeHtml from "../utils/escapeHtml";
import I18n from "../utils/i18n";
import { useTheme } from "../utils/useTheme";
import EnvVarTooltip from "../components/EnvVarTooltip.vue";

const router = useRouter();
const fileInput = ref(null);
const usageStatsImportInput = ref(null);
const activeTab = ref("home");
const isDownloadingUsageStats = ref(false);
const isImportingUsageStats = ref(false);
const isUsageStatsTransferBusy = computed(() => isDownloadingUsageStats.value || isImportingUsageStats.value);

// Create reactive version counter
const langVersion = ref(0);

// Translation function that tracks language changes
const t = (key, options) => {
    langVersion.value; // Access to track changes
    return I18n.t(key, options);
};

// Stats tab state (reused from UsageStatsPage)
const statsState = reactive({
    accounts: [],
    records: [],
    startedAt: null,
    summary: {
        abortedCount: 0,
        activeRequests: 0,
        avgDurationMs: 0,
        errorCount: 0,
        formatBreakdown: [],
        requestCategoryBreakdown: [],
        successCount: 0,
        successRate: 0,
        totalRequests: 0,
        uniqueAccountPairs: 0,
        uptimeSeconds: 0,
    },
});

// Time range filter: 'all' | '1h' | '6h' | '24h' | '7d' | '30d' | 'custom'
const timeRange = ref("all");
const customTimeRange = ref([]);
const recordFilters = reactive({
    apiFormat: [""],
    attemptCount: [""],
    clientIp: [""],
    finalAccount: [""],
    model: [""],
    outcome: [""],
    statusCode: [""],
    streamMode: [""],
});

// Search keywords for internal selection searchboxes
const filterSearchQuery = reactive({
    apiFormat: "",
    attemptCount: "",
    clientIp: "",
    finalAccount: "",
    model: "",
    outcome: "",
    statusCode: "",
    streamMode: "",
});
const recordsTableWrapper = ref(null);
const recordsCurrentPage = ref(1);
const recordsPageSize = ref(10);
const recordsPageJumpInput = ref("");
const RECORDS_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const STATS_FILTERS_MOBILE_MEDIA_QUERY = "(max-width: 767px)";
const isStatsFiltersMobile = ref(false);
const statsFiltersCollapsed = ref(false);
let statsFiltersMobileMediaQuery = null;

const syncStatsFiltersViewport = mediaQueryList => {
    const isMobile = mediaQueryList.matches;
    const wasMobile = isStatsFiltersMobile.value;

    isStatsFiltersMobile.value = isMobile;

    if (isMobile && !wasMobile) {
        statsFiltersCollapsed.value = true;
    } else if (!isMobile) {
        statsFiltersCollapsed.value = false;
    }
};

const toggleStatsFilters = () => {
    if (!isStatsFiltersMobile.value) return;
    statsFiltersCollapsed.value = !statsFiltersCollapsed.value;
};

const handleStatsFiltersHeaderKeydown = event => {
    if (!isStatsFiltersMobile.value) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggleStatsFilters();
};

const TIME_RANGE_MS = {
    "1h": 60 * 60 * 1000,
    "6h": 6 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "24h": 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000,
    all: 0,
};
const DEFAULT_CUSTOM_TIME_RANGE = "24h";
const DATE_PICKER_DEFAULT_TIME = [new Date(2000, 0, 1, 0, 0, 0), new Date(2000, 0, 1, 23, 59, 59)];

const buildRelativeTimeRange = rangeKey => {
    const duration = TIME_RANGE_MS[rangeKey];
    if (!duration) return null;
    const end = new Date();
    return [new Date(end.getTime() - duration), end];
};

const isValidCustomTimeRange = range =>
    Array.isArray(range) &&
    range.length === 2 &&
    range.every(item => item instanceof Date && !Number.isNaN(item.getTime()));

const normalizedCustomTimeRange = computed(() => {
    if (!isValidCustomTimeRange(customTimeRange.value)) return null;
    const [start, end] = customTimeRange.value;
    return start.getTime() <= end.getTime() ? [start, end] : [end, start];
});

const EMPTY_FILTER_VALUE = "__EMPTY__";
const isEmptyFilterField = value =>
    value === null || value === undefined || (typeof value === "string" && !value.trim());
const isFilterArrayActive = filterArray =>
    Array.isArray(filterArray) && !(filterArray.length === 0 || (filterArray.length === 1 && filterArray[0] === ""));

const formatAccountValue = (authIndex, accountName) => `${authIndex ?? "unknown"}::${accountName ?? ""}`;
const getAccountFilterValue = (authIndex, accountName) => {
    if (authIndex === null || authIndex === undefined) {
        return isEmptyFilterField(accountName) ? EMPTY_FILTER_VALUE : formatAccountValue(authIndex, accountName);
    }
    return formatAccountValue(authIndex, accountName);
};
const getAccountStatsKey = (authIndex, accountName) => {
    if (authIndex === null || authIndex === undefined) {
        return isEmptyFilterField(accountName) ? "unassigned" : `unassigned:${accountName}`;
    }
    return `${authIndex}:${isEmptyFilterField(accountName) ? "N/A" : accountName}`;
};

const timeFilteredRecords = computed(() => {
    if (timeRange.value === "all") return statsState.records;
    if (timeRange.value === "custom") {
        const range = normalizedCustomTimeRange.value;
        if (!range) return statsState.records;
        const [start, end] = range;
        const startTs = start.getTime();
        const endTs = end.getTime();
        return statsState.records.filter(record => {
            const ts = record.startedAt ? new Date(record.startedAt).getTime() : 0;
            return ts >= startTs && ts <= endTs;
        });
    }
    const items = TIME_RANGE_MS[timeRange.value];
    if (!items) return statsState.records;
    const cutoff = Date.now() - items;
    return statsState.records.filter(r => {
        const ts = r.startedAt ? new Date(r.startedAt).getTime() : 0;
        return ts >= cutoff;
    });
});

const recordFilterOptions = computed(() => {
    // Stage 1: Get all valid combinations based on internal cascading logic
    const baseOptions = {
        apiFormats: new Set(),
        attemptCounts: new Set(),
        clientIps: new Set(),
        finalAccounts: new Map(), // value -> label
        models: new Set(),
        outcomes: new Set(),
        statusCodes: new Set(),
        streamModes: new Set(),
    };

    const records = timeFilteredRecords.value;
    const filters = recordFilters;

    records.forEach(record => {
        if (isRecordMatched(record, filters, "apiFormat"))
            baseOptions.apiFormats.add(isEmptyFilterField(record.apiFormat) ? EMPTY_FILTER_VALUE : record.apiFormat);
        if (isRecordMatched(record, filters, "streamMode"))
            baseOptions.streamModes.add(isEmptyFilterField(record.streamMode) ? EMPTY_FILTER_VALUE : record.streamMode);
        if (isRecordMatched(record, filters, "model"))
            baseOptions.models.add(isEmptyFilterField(record.model) ? EMPTY_FILTER_VALUE : record.model);
        if (isRecordMatched(record, filters, "outcome"))
            baseOptions.outcomes.add(isEmptyFilterField(record.outcome) ? EMPTY_FILTER_VALUE : record.outcome);
        if (isRecordMatched(record, filters, "statusCode"))
            baseOptions.statusCodes.add(
                record.statusCode !== null && record.statusCode !== undefined ? record.statusCode : EMPTY_FILTER_VALUE
            );
        if (isRecordMatched(record, filters, "clientIp"))
            baseOptions.clientIps.add(isEmptyFilterField(record.clientIp) ? EMPTY_FILTER_VALUE : record.clientIp);
        if (isRecordMatched(record, filters, "attemptCount"))
            baseOptions.attemptCounts.add(
                record.attemptCount !== null && record.attemptCount !== undefined
                    ? record.attemptCount
                    : EMPTY_FILTER_VALUE
            );
        if (isRecordMatched(record, filters, "finalAccount")) {
            const val = getAccountFilterValue(record.finalAuthIndex, record.finalAccountName);
            if (!baseOptions.finalAccounts.has(val)) {
                baseOptions.finalAccounts.set(
                    val,
                    val === EMPTY_FILTER_VALUE
                        ? t("emptyValue")
                        : formatAccount(record.finalAuthIndex, record.finalAccountName)
                );
            }
        }
    });

    // Stage 2: Helper to sort and apply internal search keywords from the top search bars
    const applySearchAndSort = (items, query, getLabel = null, isNumeric = false) => {
        let list = Array.from(items);

        // Filter by keyword
        if (query) {
            const q = query.toLowerCase();
            list = list.filter(item => {
                const label = getLabel ? getLabel(item) : String(item);
                return label.toLowerCase().includes(q);
            });
        }

        // Sort
        return list.sort((a, b) => {
            if (a === EMPTY_FILTER_VALUE) return -1;
            if (b === EMPTY_FILTER_VALUE) return 1;
            if (isNumeric) return Number(a) - Number(b);
            const labelA = getLabel ? getLabel(a) : String(a);
            const labelB = getLabel ? getLabel(b) : String(b);
            return labelA.localeCompare(labelB);
        });
    };

    return {
        apiFormats: applySearchAndSort(baseOptions.apiFormats, filterSearchQuery.apiFormat, translateLabel),
        attemptCounts: applySearchAndSort(
            baseOptions.attemptCounts,
            filterSearchQuery.attemptCount,
            item => (item === EMPTY_FILTER_VALUE ? t("emptyValue") : String(item)),
            true
        ),
        clientIps: applySearchAndSort(baseOptions.clientIps, filterSearchQuery.clientIp, item =>
            item === EMPTY_FILTER_VALUE ? t("emptyValue") : item
        ),
        finalAccounts: applySearchAndSort(
            Array.from(baseOptions.finalAccounts.keys()),
            filterSearchQuery.finalAccount,
            val => baseOptions.finalAccounts.get(val)
        ).map(val => ({
            label: baseOptions.finalAccounts.get(val),
            value: val,
        })),
        models: applySearchAndSort(baseOptions.models, filterSearchQuery.model, item =>
            item === EMPTY_FILTER_VALUE ? t("emptyValue") : item
        ),
        outcomes: applySearchAndSort(baseOptions.outcomes, filterSearchQuery.outcome, translateLabel),
        statusCodes: applySearchAndSort(
            baseOptions.statusCodes,
            filterSearchQuery.statusCode,
            item => (item === EMPTY_FILTER_VALUE ? t("emptyValue") : String(item)),
            true
        ),
        streamModes: applySearchAndSort(baseOptions.streamModes, filterSearchQuery.streamMode, translateLabel),
    };
});

const hasActiveStatsFilters = computed(
    () => timeRange.value !== "all" || Object.values(recordFilters).some(value => isFilterArrayActive(value))
);

// Computed: records filtered by time range + record filters (records are newest-first)
// Helper to check if a record matches current filters, optionally excluding one field for cascading filters
const isRecordMatched = (record, filters, excludeField = null) => {
    const checkMatch = (fieldValue, filterArray) => {
        // If filters are empty or only contains "All" (""), pass everything
        if (!filterArray || filterArray.length === 0 || filterArray.includes("")) return true;

        // Handle multiple selections
        const normalizedActualValue = isEmptyFilterField(fieldValue) ? EMPTY_FILTER_VALUE : fieldValue;

        // Check if the actual value matches any of the selected filter values
        return filterArray.some(v => String(v) === String(normalizedActualValue));
    };

    if (excludeField !== "apiFormat" && !checkMatch(record.apiFormat, filters.apiFormat)) return false;
    if (excludeField !== "streamMode" && !checkMatch(record.streamMode, filters.streamMode)) return false;
    if (excludeField !== "model" && !checkMatch(record.model, filters.model)) return false;
    if (excludeField !== "outcome" && !checkMatch(record.outcome, filters.outcome)) return false;
    if (excludeField !== "statusCode" && !checkMatch(record.statusCode, filters.statusCode)) return false;
    if (excludeField !== "clientIp" && !checkMatch(record.clientIp, filters.clientIp)) return false;
    if (excludeField !== "attemptCount" && !checkMatch(record.attemptCount, filters.attemptCount)) return false;

    if (
        excludeField !== "finalAccount" &&
        filters.finalAccount &&
        filters.finalAccount.length > 0 &&
        !filters.finalAccount.includes("")
    ) {
        const accVal = getAccountFilterValue(record.finalAuthIndex, record.finalAccountName);
        if (!filters.finalAccount.includes(accVal)) return false;
    }

    return true;
};

const filteredRecords = computed(() => {
    return timeFilteredRecords.value.filter(record => isRecordMatched(record, recordFilters));
});

const recordsTotalPages = computed(() => Math.max(1, Math.ceil(filteredRecords.value.length / recordsPageSize.value)));

const clampRecordsPage = page => {
    const normalizedPage = Number(page);
    if (!Number.isFinite(normalizedPage)) return 1;
    return Math.min(Math.max(Math.trunc(normalizedPage), 1), recordsTotalPages.value);
};

const setRecordsPage = page => {
    recordsCurrentPage.value = clampRecordsPage(page);
    recordsPageJumpInput.value = "";
};

const paginatedRecords = computed(() => {
    const startIndex = (recordsCurrentPage.value - 1) * recordsPageSize.value;
    return filteredRecords.value.slice(startIndex, startIndex + recordsPageSize.value);
});

const recordsPaginationRange = computed(() => {
    const total = filteredRecords.value.length;
    if (!total) return { end: 0, start: 0, total: 0 };

    const start = (recordsCurrentPage.value - 1) * recordsPageSize.value + 1;
    const end = Math.min(start + paginatedRecords.value.length - 1, total);
    return { end, start, total };
});

const buildRecordsPaginationItems = (currentPage, totalPages, siblingCount = 1, boundaryCount = 1) => {
    if (totalPages <= 0) return [];

    const visiblePages = new Set();

    for (let offset = 0; offset < boundaryCount; offset += 1) {
        visiblePages.add(offset + 1);
        visiblePages.add(totalPages - offset);
    }

    for (let page = currentPage - siblingCount; page <= currentPage + siblingCount; page += 1) {
        visiblePages.add(page);
    }

    const sortedPages = Array.from(visiblePages)
        .filter(page => page >= 1 && page <= totalPages)
        .sort((a, b) => a - b);

    const items = [];
    let previousPage = 0;

    sortedPages.forEach(page => {
        if (previousPage) {
            if (page - previousPage === 2) {
                items.push({ key: `page-${previousPage + 1}`, page: previousPage + 1, type: "page" });
            } else if (page - previousPage > 2) {
                items.push({ key: `ellipsis-${previousPage}-${page}`, type: "ellipsis" });
            }
        }

        items.push({ key: `page-${page}`, page, type: "page" });
        previousPage = page;
    });

    return items;
};

const recordsPaginationItems = computed(() =>
    buildRecordsPaginationItems(recordsCurrentPage.value, recordsTotalPages.value)
);

const recordsPaginationResetKey = computed(() =>
    [
        timeRange.value,
        normalizedCustomTimeRange.value ? normalizedCustomTimeRange.value.map(item => item.getTime()).join("|") : "",
        recordFilters.apiFormat.join("|"),
        recordFilters.attemptCount.join("|"),
        recordFilters.clientIp.join("|"),
        recordFilters.finalAccount.join("|"),
        recordFilters.model.join("|"),
        recordFilters.outcome.join("|"),
        recordFilters.statusCode.join("|"),
        recordFilters.streamMode.join("|"),
    ].join("::")
);

// Computed: summary recalculated from filtered records
const filteredSummary = computed(() => {
    const records = filteredRecords.value;
    if (!records.length) {
        return {
            abortedCount: 0,
            activeRequests: statsState.summary.activeRequests,
            avgDurationMs: 0,
            errorCount: 0,
            failedRequests: 0,
            formatBreakdown: [],
            requestCategoryBreakdown: [],
            streamModeBreakdown: [],
            successCount: 0,
            successRate: 0,
            totalRequests: 0,
            uniqueAccountPairs: 0,
        };
    }
    const totalRequests = records.length;
    const successCount = records.filter(r => r.outcome === "success").length;
    const errorCount = records.filter(r => r.outcome === "error").length;
    const abortedCount = records.filter(r => r.outcome === "aborted").length;
    const failedRequests = errorCount;
    const totalDurationMs = records.reduce((sum, r) => sum + (r.durationMs || 0), 0);
    const avgDurationMs = totalRequests > 0 ? Math.round(totalDurationMs / totalRequests) : 0;
    const successRate = totalRequests > 0 ? Number(((successCount / totalRequests) * 100).toFixed(1)) : 0;

    // Build per-format and per-category breakdowns from filtered records
    const formatCounts = {};
    const categoryCounts = {};
    const streamModeCounts = {};
    records.forEach(r => {
        const fmt = isEmptyFilterField(r.apiFormat) ? EMPTY_FILTER_VALUE : r.apiFormat;
        formatCounts[fmt] = (formatCounts[fmt] || 0) + 1;
        const cat = r.requestCategory || "unknown";
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        const sm = isEmptyFilterField(r.streamMode) ? EMPTY_FILTER_VALUE : r.streamMode;
        streamModeCounts[sm] = (streamModeCounts[sm] || 0) + 1;
    });
    const formatBreakdown = Object.entries(formatCounts)
        .map(([key, count]) => ({ count, key }))
        .sort((a, b) => b.count - a.count);
    const requestCategoryBreakdown = Object.entries(categoryCounts)
        .map(([key, count]) => ({ count, key }))
        .sort((a, b) => b.count - a.count);
    const streamModeBreakdown = Object.entries(streamModeCounts)
        .map(([key, count]) => ({ count, key }))
        .sort((a, b) => b.count - a.count);

    // Unique account pairs from filtered records, aligned with backend accountKey semantics
    const uniqueAccounts = new Set(
        records.map(r => r.accountKey || getAccountStatsKey(r.finalAuthIndex, r.finalAccountName))
    );

    return {
        abortedCount,
        activeRequests: statsState.summary.activeRequests,
        avgDurationMs,
        errorCount,
        failedRequests,
        formatBreakdown,
        requestCategoryBreakdown,
        streamModeBreakdown,
        successCount,
        successRate,
        totalRequests,
        uniqueAccountPairs: uniqueAccounts.size,
    };
});

// Computed: per-account stats recalculated from filtered records
const filteredAccounts = computed(() => {
    const records = filteredRecords.value;
    if (!records.length) return [];
    const accountMap = {};
    records.forEach(r => {
        const key = r.accountKey || getAccountStatsKey(r.finalAuthIndex, r.finalAccountName);
        if (!accountMap[key]) {
            accountMap[key] = {
                abortedCount: 0,
                accountKey: key,
                accountName: r.finalAccountName,
                authIndex: r.finalAuthIndex,
                errorCount: 0,
                modelCounts: {},
                successCount: 0,
                totalDurationMs: 0,
                totalRequests: 0,
            };
        }
        const acc = accountMap[key];
        acc.totalRequests += 1;
        acc.totalDurationMs += r.durationMs || 0;
        if (r.outcome === "success") acc.successCount += 1;
        else if (r.outcome === "aborted") acc.abortedCount += 1;
        else acc.errorCount += 1;

        const mk = isEmptyFilterField(r.model) ? EMPTY_FILTER_VALUE : r.model;
        if (!acc.modelCounts[mk]) {
            acc.modelCounts[mk] = { error: 0, total: 0 };
        }
        acc.modelCounts[mk].total += 1;
        if (r.outcome === "error") {
            acc.modelCounts[mk].error += 1;
        }
    });

    return Object.values(accountMap)
        .map(acc => ({
            ...acc,
            avgDurationMs: acc.totalRequests > 0 ? Math.round(acc.totalDurationMs / acc.totalRequests) : 0,
            modelCounts: Object.entries(acc.modelCounts)
                .map(([key, stats]) => ({
                    count: stats.total,
                    error: stats.error,
                    key,
                }))
                .sort((a, b) => b.count - a.count),
            successRate: acc.totalRequests > 0 ? Number(((acc.successCount / acc.totalRequests) * 100).toFixed(1)) : 0,
        }))
        .sort((a, b) => b.totalRequests - a.totalRequests);
});

const filteredModels = computed(() => {
    const records = filteredRecords.value;
    if (!records.length) return [];

    const modelMap = {};
    records.forEach(r => {
        const modelKey = isEmptyFilterField(r.model) ? EMPTY_FILTER_VALUE : r.model;
        if (!modelMap[modelKey]) {
            modelMap[modelKey] = {
                abortedCount: 0,
                accountCounts: {},
                errorCount: 0,
                modelKey,
                successCount: 0,
                totalDurationMs: 0,
                totalRequests: 0,
            };
        }

        const model = modelMap[modelKey];
        model.totalRequests += 1;
        model.totalDurationMs += r.durationMs || 0;
        if (r.outcome === "success") model.successCount += 1;
        else if (r.outcome === "aborted") model.abortedCount += 1;
        else model.errorCount += 1;

        const accountKey = r.accountKey || getAccountStatsKey(r.finalAuthIndex, r.finalAccountName);
        if (!model.accountCounts[accountKey]) {
            model.accountCounts[accountKey] = {
                accountName: r.finalAccountName,
                authIndex: r.finalAuthIndex,
                error: 0,
                total: 0,
            };
        }

        model.accountCounts[accountKey].total += 1;
        if (r.outcome === "error") {
            model.accountCounts[accountKey].error += 1;
        }
    });

    return Object.values(modelMap)
        .map(model => ({
            ...model,
            accountCounts: Object.entries(model.accountCounts)
                .map(([key, stats]) => ({
                    accountName: stats.accountName,
                    authIndex: stats.authIndex,
                    count: stats.total,
                    error: stats.error,
                    key,
                }))
                .sort((a, b) => b.count - a.count),
            avgDurationMs: model.totalRequests > 0 ? Math.round(model.totalDurationMs / model.totalRequests) : 0,
            successRate:
                model.totalRequests > 0 ? Number(((model.successCount / model.totalRequests) * 100).toFixed(1)) : 0,
        }))
        .sort((a, b) => b.totalRequests - a.totalRequests);
});

const translateLabel = value => {
    if (!value) return "-";
    if (value === EMPTY_FILTER_VALUE) return t("emptyValue");
    // Map backend identifiers to user-facing i18n keys
    const keyMap = {
        count_tokens: "countTokens",
        fake: "fakeStream",
        non: "nonStream",
        real: "realStream",
        response_api: "responseApi",
    };
    const keyToTranslate = keyMap[value] || (value === "error" ? "failed" : value);
    const translated = t(keyToTranslate);
    return translated === keyToTranslate ? value : translated;
};

const formatDateTime = value => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
};

const formatDuration = value => {
    const duration = Number(value);
    if (!Number.isFinite(duration)) return "-";
    if (duration < 1000) return `${duration} ms`;
    if (duration < 60000) return `${(duration / 1000).toFixed(1)} s`;
    return `${(duration / 60000).toFixed(1)} min`;
};

const formatUptime = seconds => {
    const total = Number(seconds);
    if (!Number.isFinite(total)) return "-";
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);

    const parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0 || parts.length > 0) parts.push(`${hours}h`);
    parts.push(`${minutes}m`);
    return parts.join(" ");
};

const formatStatsUptime = (startedAt, seconds) => {
    if (!startedAt) return "-";
    return formatUptime(seconds);
};

const formatAccount = (authIndex, accountName) => {
    if (authIndex === null || authIndex === undefined) {
        return accountName || "-";
    }
    return `#${authIndex} ${accountName || "N/A"}`;
};
const fetchUsageStats = async () => {
    const res = await fetch("/api/usage-stats");
    if (res.redirected) {
        window.location.href = res.url;
        return;
    }
    if (res.status === 401) {
        window.location.href = "/login";
        return;
    }
    if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    statsState.accounts = data.accounts || [];
    statsState.records = data.records || [];
    statsState.startedAt = data.startedAt || null;
    statsState.summary = {
        ...statsState.summary,
        ...(data.summary || {}),
    };
};

const showErrorDetail = record => {
    if (!canShowErrorDetail(record)) return;
    ElMessageBox.alert(record.errorMessage || t("errorUnknown"), t("errorDetailTitle"), {
        closeOnClickModal: true,
        confirmButtonText: t("ok"),
        lockScroll: false,
        type: "error",
    });
};

const canShowErrorDetail = record =>
    !!record && (record.outcome === "error" || record.outcome === "aborted") && !!record.errorMessage;

const showAttemptsDetail = record => {
    if (!record || !record.attempts || record.attempts.length === 0) return;
    const rows = record.attempts.map((item, index) => {
        const colonIdx = (item.accountKey || "").indexOf(":");
        const authIndex = colonIdx === -1 ? null : Number((item.accountKey || "").slice(0, colonIdx));
        const accountName = colonIdx === -1 ? item.accountKey || "" : (item.accountKey || "").slice(colonIdx + 1);
        return h(
            "div",
            {
                style: "display: flex; align-items: center; gap: 10px; margin-bottom: 10px; font-size: 14px;",
            },
            [
                h(
                    "span",
                    {
                        style: "display: inline-flex; align-items: center; justify-content: center; min-width: 24px; height: 24px; border-radius: 50%; background: #409eff; color: #fff; font-size: 12px; font-weight: 700; flex-shrink: 0;",
                    },
                    String(index + 1)
                ),
                h("span", { style: "color: #606266;" }, `#${authIndex} ${accountName}`),
            ]
        );
    });

    const content = h("div", { style: "padding: 4px 0;" }, rows);

    ElMessageBox({
        closeOnClickModal: true,
        confirmButtonText: t("ok"),
        lockScroll: false,
        message: content,
        title: t("attemptsPathTitle"),
    });
};

const resetRecordFilters = () => {
    timeRange.value = "all";
    customTimeRange.value = [];
    recordFilters.apiFormat = [""];
    recordFilters.attemptCount = [""];
    recordFilters.clientIp = [""];
    recordFilters.finalAccount = [""];
    recordFilters.model = [""];
    recordFilters.outcome = [""];
    recordFilters.statusCode = [""];
    recordFilters.streamMode = [""];
};

watch(
    timeRange,
    (newValue, oldValue) => {
        if (newValue !== "custom") return;
        if (normalizedCustomTimeRange.value) return;
        customTimeRange.value =
            buildRelativeTimeRange(oldValue) || buildRelativeTimeRange(DEFAULT_CUSTOM_TIME_RANGE) || [];
    },
    { flush: "sync" }
);

watch(
    [() => filteredRecords.value.length, recordsPageSize],
    () => {
        const nextPage = clampRecordsPage(recordsCurrentPage.value);
        if (nextPage !== recordsCurrentPage.value) {
            recordsCurrentPage.value = nextPage;
        }
    },
    { flush: "sync" }
);

watch(recordsPaginationResetKey, () => {
    recordsCurrentPage.value = 1;
    recordsPageJumpInput.value = "";
});

watch(
    recordsCurrentPage,
    async () => {
        await nextTick();
        if (recordsTableWrapper.value) {
            recordsTableWrapper.value.scrollTop = 0;
        }
    },
    { flush: "post" }
);

const handleRecordsPageSizeChange = event => {
    const nextSize = Number(event?.target?.value);
    if (!Number.isFinite(nextSize) || nextSize <= 0) return;

    const firstVisibleIndex = (recordsCurrentPage.value - 1) * recordsPageSize.value;
    recordsPageSize.value = nextSize;
    recordsCurrentPage.value = Math.floor(firstVisibleIndex / nextSize) + 1;
    recordsPageJumpInput.value = "";
};

const submitRecordsPageJump = () => {
    if (!recordsPageJumpInput.value) return;
    setRecordsPage(recordsPageJumpInput.value);
};

const getFilterLabel = (field, placeholder) => {
    const selected = recordFilters[field];

    // If empty or only "All" is selected, return the placeholder text
    if (selected.length === 0 || (selected.length === 1 && selected[0] === "")) {
        return placeholder;
    }

    if (selected.length === 1) {
        const val = selected[0];
        // Special case for finalAccount which is an array of objects
        if (field === "finalAccount") {
            const found = recordFilterOptions.value.finalAccounts.find(opt => opt.value === val);
            return found ? found.label : val;
        }

        // Use translateLabel for specific fields that need i18n
        if (["apiFormat", "streamMode", "outcome"].includes(field)) {
            return translateLabel(val);
        }

        // Others are simple strings or numbers
        return val === EMPTY_FILTER_VALUE ? t("emptyValue") : String(val);
    }
    return t("selectedCount", { count: selected.length });
};

const handleFilterChange = field => {
    const selected = recordFilters[field];

    if (selected.length === 0) {
        // If nothing is selected, default back to "All"
        recordFilters[field] = [""];
    } else if (selected.length > 1) {
        // If "All" was previously selected and a specific item is added, remove "All"
        const hasAll = selected.includes("");
        const lastSelected = selected[selected.length - 1];

        if (lastSelected === "") {
            // If "All" was just clicked, clear everything else
            recordFilters[field] = [""];
        } else if (hasAll) {
            // If specific items were clicked while "All" was selected, remove "All"
            recordFilters[field] = selected.filter(v => v !== "");
        }
    }
};

const scheduleUpdate = () => {
    if (!isActive) return;
    const randomInterval = 4000 + Math.floor(Math.random() * 3000);
    updateTimer = setTimeout(async () => {
        await Promise.all([updateContent(), fetchUsageStats()]).catch(err => {
            console.error("Error fetching data:", err.message || err);
        });
        scheduleUpdate();
    }, randomInterval);
};

const getApiErrorMessage = data => {
    if (data?.message) {
        return t(data.message, data);
    }

    if (data?.error) {
        return typeof data.error === "string" ? data.error : data.error.message;
    }

    return t("unknownError");
};

const switchTab = tabName => {
    if (activeTab.value === "logs") {
        const logContainer = document.getElementById("log-container");
        if (logContainer) {
            state.logScrollTop = logContainer.scrollTop;
        }
    }

    activeTab.value = tabName;

    if (tabName === "logs") {
        nextTick(() => {
            const logContainer = document.getElementById("log-container");
            if (logContainer) {
                logContainer.scrollTop = state.logScrollTop || 0;
            }
        });
    }
};

const { theme, setTheme } = useTheme();

const state = reactive({
    accountDetails: [],
    activeContextsCount: 0,
    apiKeySource: "",
    browserConnected: false,
    checkUpdateEnabled: true,
    currentAuthIndex: -1,
    currentLang: I18n.getLang(),
    debugModeEnabled: false,
    enableAuthUpdateEnabled: true,
    failureCount: 0,
    floatingActionsExpanded: false,
    forceThinkingEnabled: false,
    forceUrlContextEnabled: false,
    forceWebSearchEnabled: false,
    hasUpdate: false,
    isSwitchingAccount: false,
    isSystemBusy: false,
    isUpdating: false,
    latestVersion: null,
    logCount: 0,
    logMaxCount: 100,
    logs: t("loading"),
    logScrollTop: 0,
    maxContexts: 1,
    maxRetries: 3,
    releaseUrl: null,
    safetySettingsThreshold: "OFF",
    selectedAccounts: new Set(), // Selected account indices
    serviceConnected: false,
    streamingModeReal: false,
    // theme: handled by useTheme
    usageCount: 0,
});

const safetySettingsThresholdOptions = [
    { label: "safetySettingsThreshold.OFF", value: "OFF" },
    {
        label: "safetySettingsThreshold.HARM_BLOCK_THRESHOLD_UNSPECIFIED",
        value: "HARM_BLOCK_THRESHOLD_UNSPECIFIED",
    },
    { label: "safetySettingsThreshold.BLOCK_LOW_AND_ABOVE", value: "BLOCK_LOW_AND_ABOVE" },
    { label: "safetySettingsThreshold.BLOCK_MEDIUM_AND_ABOVE", value: "BLOCK_MEDIUM_AND_ABOVE" },
    { label: "safetySettingsThreshold.BLOCK_ONLY_HIGH", value: "BLOCK_ONLY_HIGH" },
    { label: "safetySettingsThreshold.BLOCK_NONE", value: "BLOCK_NONE" },
];

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

// Total scanned accounts count
const totalScannedCount = computed(() => state.accountDetails.length);

// Deduped available accounts count (excluding duplicates and invalid)
const dedupedAvailableCount = computed(() => {
    return state.accountDetails.filter(acc => !acc.isDuplicate && !acc.isInvalid).length;
});

// Active contexts display (e.g., "1 / 3" or "1 / ∞")
const activeContextsDisplay = computed(() => {
    const active = state.activeContextsCount;
    const max = state.maxContexts;
    return max === 0 ? `${active} / ∞` : `${active} / ${max}`;
});

const isBusy = computed(() => state.isSwitchingAccount || state.isSystemBusy);

const formattedLogs = computed(() => {
    if (!state.logs) return "";
    // Escape HTML first to prevent XSS (though logs should be safe, better safe than sorry)
    let safeLogs = escapeHtml(state.logs);

    // Highlight [DEBUG], [WARN], and [ERROR] at the start of lines with inline styles
    safeLogs = safeLogs.replace(
        /(^|\r?\n)(\[DEBUG\])(?=\s)/g,
        '$1<span style="color: #3498db; font-weight: bold;">$2</span>'
    );
    safeLogs = safeLogs.replace(
        /(^|\r?\n)(\[WARN\])(?=\s)/g,
        '$1<span style="color: #f39c12; font-weight: bold;">$2</span>'
    );
    safeLogs = safeLogs.replace(
        /(^|\r?\n)(\[ERROR\])(?=\s)/g,
        '$1<span style="color: #e74c3c; font-weight: bold;">$2</span>'
    );

    return safeLogs;
});

// Computed properties for batch selection
const selectedCount = computed(() => state.selectedAccounts.size);
const hasSelection = computed(() => state.selectedAccounts.size > 0);
const isAllSelected = computed(() => {
    if (state.accountDetails.length === 0) return false;
    return state.accountDetails.every(acc => state.selectedAccounts.has(acc.index));
});
const isAccountSelected = index => state.selectedAccounts.has(index);

// Toggle selection for a single account
const toggleSelectAccount = index => {
    if (state.selectedAccounts.has(index)) {
        state.selectedAccounts.delete(index);
    } else {
        state.selectedAccounts.add(index);
    }
};

// Toggle selection for all accounts
const toggleSelectAll = () => {
    if (isAllSelected.value) {
        state.selectedAccounts.clear();
    } else {
        state.accountDetails.forEach(acc => {
            state.selectedAccounts.add(acc.index);
        });
    }
};

// Clear selection
const clearSelection = () => {
    state.selectedAccounts.clear();
};

// Batch delete accounts
const batchDeleteAccounts = async () => {
    if (state.selectedAccounts.size === 0) {
        ElMessage.warning(t("noAccountSelected"));
        return;
    }

    const indices = Array.from(state.selectedAccounts);
    const count = indices.length;

    // Helper to perform batch delete
    const performBatchDelete = async (forceDelete = false) => {
        const notification = ElNotification({
            duration: 0,
            message: t("operationInProgress"),
            title: t("warningTitle"),
            type: "warning",
        });
        state.isSwitchingAccount = true;
        let shouldUpdate = true;
        try {
            const res = await fetch("/api/accounts/batch", {
                body: JSON.stringify({ force: forceDelete, indices }),
                headers: { "Content-Type": "application/json" },
                method: "DELETE",
            });
            const data = await res.json();

            if (res.status === 409 && data.requiresConfirmation) {
                shouldUpdate = false;
                state.isSwitchingAccount = false;
                ElMessageBox.confirm(t("warningDeleteCurrentAccount"), t("warningTitle"), {
                    cancelButtonText: t("cancel"),
                    confirmButtonText: t("ok"),
                    lockScroll: false,
                    type: "error",
                })
                    .then(() => performBatchDelete(true))
                    .catch(e => {
                        if (e !== "cancel") {
                            console.error(e);
                        }
                    });
                return;
            }

            if (res.status === 207) {
                // Handle partial success (Multi-Status) first, as res.ok is true for 2xx
                ElMessage.warning(
                    t("batchDeletePartial", {
                        failedCount: data.failedIndices?.length || 0,
                        successCount: data.successCount,
                    })
                );
                // Remove deleted items from selection
                data.successIndices?.forEach(idx => state.selectedAccounts.delete(idx));
            } else if (res.ok) {
                // Handle full success (200 OK)
                ElMessage.success(t("batchDeleteSuccess", { count: data.successCount }));
                clearSelection();
            } else {
                ElMessage.error(t(data.message, data));
            }
        } catch (err) {
            ElMessage.error(t("batchDeleteFailed", { error: err.message || err }));
        } finally {
            notification.close();
            if (shouldUpdate) {
                state.isSwitchingAccount = false;
                updateContent();
            }
        }
    };

    ElMessageBox.confirm(t("confirmBatchDelete", { count }), t("warningTitle"), {
        cancelButtonText: t("cancel"),
        confirmButtonText: t("ok"),
        lockScroll: false,
        type: "warning",
    })
        .then(() => performBatchDelete(false))
        .catch(e => {
            if (e !== "cancel") {
                console.error(e);
            }
        });
};

// Batch download accounts as ZIP
const batchDownloadAccounts = async () => {
    if (state.selectedAccounts.size === 0) {
        ElMessage.warning(t("noAccountSelected"));
        return;
    }

    const indices = Array.from(state.selectedAccounts);

    try {
        const res = await fetch("/api/accounts/batch/download", {
            body: JSON.stringify({ indices }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
        });

        if (!res.ok) {
            let errorKey = "batchDownloadFailed";
            let errorParams = { error: res.statusText || `HTTP ${res.status}` };

            try {
                const contentType = res.headers.get("content-type");
                if (contentType && contentType.includes("application/json")) {
                    const data = await res.json();
                    if (data.message) {
                        errorKey = data.message;
                        errorParams = data;
                    } else if (data.error) {
                        const errorDetail = typeof data.error === "string" ? data.error : data.error.message;
                        errorParams = { error: errorDetail };
                    }
                } else {
                    errorParams = { error: `HTTP Error ${res.status}: ${res.statusText}` };
                }
            } catch (e) {
                // Parsing failed, keep default errorParams
            }
            ElMessage.error(t(errorKey, errorParams));
            return;
        }

        // Get the blob and trigger download
        const blob = await res.blob();
        const contentDisposition = res.headers.get("Content-Disposition");
        let filename = "auth_batch.zip";
        if (contentDisposition) {
            const match = contentDisposition.match(/filename="?([^"]+)"?/);
            if (match) {
                filename = match[1];
            }
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        // Use actual file count from response header, fallback to indices length
        const actualCount = parseInt(res.headers.get("X-File-Count"), 10);
        const requestCount = indices.length;
        const failedCount = requestCount - (isNaN(actualCount) ? requestCount : actualCount);

        if (!isNaN(actualCount) && failedCount > 0) {
            ElMessage.warning(
                t("batchDownloadPartial", {
                    failedCount,
                    successCount: actualCount,
                })
            );
        } else {
            ElMessage.success(t("batchDownloadSuccess", { count: !isNaN(actualCount) ? actualCount : requestCount }));
        }
    } catch (err) {
        ElMessage.error(t("batchDownloadFailed", { error: err.message || err }));
    }
};

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

const serviceConnectedClass = computed(() => (state.serviceConnected ? "status-ok" : "status-error"));

const serviceConnectedText = computed(() => (state.serviceConnected ? t("running") : t("disconnected")));

const apiKeySourceText = computed(() => {
    const key = state.apiKeySource ? state.apiKeySource.toLowerCase() : "";
    const translated = key ? t(key) : "";
    return translated === key ? state.apiKeySource : translated || state.apiKeySource;
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

const latestVersionFormatted = computed(() => {
    const v = state.latestVersion || (typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev");
    if (/^\d/.test(v)) {
        return `v${v}`;
    }
    return v;
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

// Delete account by index
const deleteAccountByIndex = async targetIndex => {
    if (targetIndex === null || targetIndex === undefined) {
        ElMessage.warning(t("noAccountSelected"));
        return;
    }

    const targetAccount = state.accountDetails.find(acc => acc.index === targetIndex);
    const accountSuffix = targetAccount ? ` (${getAccountDisplayName(targetAccount)})` : "";

    // Helper function to perform the actual deletion
    const performDelete = async (forceDelete = false) => {
        const notification = ElNotification({
            duration: 0,
            message: t("operationInProgress"),
            title: t("warningTitle"),
            type: "warning",
        });
        state.isSwitchingAccount = true;
        let shouldUpdate = true;
        try {
            const url = forceDelete ? `/api/accounts/${targetIndex}?force=true` : `/api/accounts/${targetIndex}`;
            const res = await fetch(url, {
                method: "DELETE",
            });
            const data = await res.json();

            if (res.status === 409 && data.requiresConfirmation) {
                shouldUpdate = false;
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
                return;
            }

            const message = t(data.message, data);
            if (res.ok) {
                ElMessage.success(message);
            } else {
                ElMessage.error(message);
            }
        } catch (err) {
            ElMessage.error(t("deleteFailed", { message: err.message || err }));
        } finally {
            notification.close();
            if (shouldUpdate) {
                state.isSwitchingAccount = false;
                updateContent();
            }
        }
    };

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
const handleCheckUpdateBeforeChange = () => handleSettingChange("/api/settings/check-update", "checkUpdate");
const handleEnableAuthUpdateBeforeChange = () =>
    handleSettingChange("/api/settings/enable-auth-update", "enableAuthUpdate");

// Handle change specifically for Select component which might trigger logic differently
const handleStatsDebugChange = val => {
    handleSettingChange("/api/settings/debug-mode", "logLevel").then(success => {
        if (!success) {
            // Revert if failed
            state.debugModeEnabled = !val;
        }
    });
};

const handleLogMaxCountChange = val => {
    if (!val) return;
    fetch("/api/settings/log-max-count", {
        body: JSON.stringify({ count: val }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
    })
        .then(res => res.json())
        .then(data => {
            if (data.message === "settingUpdateSuccess") {
                ElMessage.success(t(data.message, { setting: t("logMaxCount"), value: val }));
                updateContent();
            } else {
                ElMessage.error(t(data.message || "settingFailed", { message: data.error || "" }));
            }
        })
        .catch(err => {
            ElMessage.error(t("settingFailed", { message: err.message || err }));
        });
};

const handleSafetySettingsThresholdChange = async val => {
    if (!val) return;

    try {
        const res = await fetch("/api/settings/safety-settings-threshold", {
            body: JSON.stringify({ value: val }),
            headers: { "Content-Type": "application/json" },
            method: "PUT",
        });
        const data = await res.json();

        if (res.ok) {
            ElMessage.success(
                t(data.message, {
                    setting: t("safetySettingsThreshold"),
                    value: t(`safetySettingsThreshold.${val}`),
                })
            );
            updateContent();
        } else {
            ElMessage.error(t(data.message || "settingFailed", { message: data.error || "" }));
            updateContent();
        }
    } catch (err) {
        ElMessage.error(t("settingFailed", { message: err.message || err }));
        updateContent();
    }
};

const handleLanguageChange = lang => {
    I18n.setLang(lang);
    state.currentLang = lang;
    langVersion.value++;
    localStorage.setItem("language", lang);
};

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

// Switch account by index
const switchAccountByIndex = targetIndex => {
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

const copyText = async text => {
    try {
        await navigator.clipboard.writeText(text);
        ElMessage.success(t("copySuccess"));
    } catch (err) {
        ElMessage.error(t("copyFailed"));
        console.error("Failed to copy:", err);
    }
};

const copyAppVersion = () => copyText(appVersion.value);

const updateStatus = data => {
    state.serviceConnected = true;

    const isEnabled = val => {
        if (val === true) return true;
        if (val === 1) return true;
        if (String(val).toLowerCase() === "true") return true;
        return false;
    };

    state.isUpdating = true;
    state.checkUpdateEnabled = isEnabled(data.status.checkUpdate);
    state.streamingModeReal = data.status.streamingMode === "real";
    state.enableAuthUpdateEnabled = isEnabled(data.status.enableAuthUpdate);
    state.forceThinkingEnabled = isEnabled(data.status.forceThinking);
    state.forceWebSearchEnabled = isEnabled(data.status.forceWebSearch);
    state.forceUrlContextEnabled = isEnabled(data.status.forceUrlContext);
    state.debugModeEnabled = isEnabled(data.status.debugMode);
    state.currentAuthIndex = data.status.currentAuthIndex;
    state.accountDetails = data.status.accountDetails || [];
    state.activeContextsCount = data.status.activeContextsCount || 0;
    state.maxContexts = data.status.maxContexts ?? 1;
    state.maxRetries = data.status.maxRetries ?? 3;
    state.safetySettingsThreshold = data.status.safetySettingsThreshold || "OFF";

    const validIndices = new Set(state.accountDetails.map(acc => acc.index));
    for (const idx of state.selectedAccounts) {
        if (!validIndices.has(idx)) {
            state.selectedAccounts.delete(idx);
        }
    }
    state.browserConnected = data.status.browserConnected;
    state.apiKeySource = data.status.apiKeySource;
    state.usageCount = data.status.usageCount;
    state.failureCount = data.status.failureCount;
    state.logCount = data.logCount || 0;
    state.logMaxCount = data.status.logMaxCount || 100;
    state.logs = data.logs || "";
    state.isSystemBusy = data.status.isSystemBusy;

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
            if (state.serviceConnected) dot.classList.add("status-running");
            else dot.classList.remove("status-running");
        }
        updateStatus(data);
    } catch (err) {
        console.error("Error fetching status:", err.message || err);
        state.serviceConnected = false;
    }
};

const triggerFileUpload = () => {
    if (fileInput.value) {
        fileInput.value.click();
    }
};

const handleFileUpload = async event => {
    const files = Array.from(event.target.files);
    if (!files.length) return;

    // Reset input so same files can be selected again
    event.target.value = "";

    // Show notification immediately
    const notification = ElNotification({
        duration: 0,
        message: t("operationInProgress"),
        title: t("warningTitle"),
        type: "warning",
    });

    // Set busy flag to disable UI during upload and rebalance
    state.isSwitchingAccount = true;

    try {
        // Helper function to read file as ArrayBuffer (for zip)
        const readFileAsArrayBuffer = file =>
            new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result);
                reader.onerror = () => reject(new Error(t("fileReadFailed")));
                reader.readAsArrayBuffer(file);
            });

        // Helper function to read file as text (for json)
        const readFileAsText = file =>
            new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => resolve({ content: e.target.result, name: file.name });
                reader.onerror = () => reject(new Error(t("fileReadFailed")));
                reader.readAsText(file);
            });

        // Helper function to upload a single file
        const uploadFile = async fileData => {
            let parsed;
            try {
                parsed = JSON.parse(fileData.content);
            } catch (err) {
                return { error: t("invalidJson"), filename: fileData.name, success: false };
            }

            try {
                const res = await fetch("/api/files", {
                    body: JSON.stringify({ content: parsed }),
                    headers: { "Content-Type": "application/json" },
                    method: "POST",
                });

                if (res.ok) {
                    const data = await res.json();
                    return { filename: data.filename || fileData.name, success: true };
                }

                let errorMsg;
                try {
                    const data = await res.json();
                    errorMsg = getApiErrorMessage(data);
                } catch (e) {
                    // Response is not JSON or cannot be parsed, fallback to status text or unknown error
                    if (res.statusText) {
                        errorMsg = `HTTP Error ${res.status}: ${res.statusText}`;
                    } else {
                        errorMsg = `HTTP Error ${res.status}`;
                    }
                }
                return { error: errorMsg, filename: fileData.name, success: false };
            } catch (err) {
                // Network or other fetch errors
                return { error: err.message || t("networkError"), filename: fileData.name, success: false };
            }
        };

        // Collect all JSON files to upload (including extracted from zip)
        const jsonFilesToUpload = [];
        const extractErrors = [];

        for (const file of files) {
            const lowerName = file.name.toLowerCase();

            if (lowerName.endsWith(".zip")) {
                // Extract JSON files from zip
                try {
                    let arrayBuffer;
                    try {
                        arrayBuffer = await readFileAsArrayBuffer(file);
                    } catch (readErr) {
                        extractErrors.push({ local: file.name, reason: readErr.message || t("fileReadFailed") });
                        continue; // Skip zip processing if read failed
                    }

                    const zip = await JSZip.loadAsync(arrayBuffer);
                    const zipEntries = Object.keys(zip.files);

                    let foundJsonInZip = false;
                    for (const entryName of zipEntries) {
                        const entry = zip.files[entryName];
                        // Skip directories and non-json files
                        if (entry.dir || !entryName.toLowerCase().endsWith(".json")) continue;

                        foundJsonInZip = true;
                        try {
                            const content = await entry.async("string");
                            // Use format: zipName/entryName for display
                            const displayName = `${file.name}/${entryName}`;
                            jsonFilesToUpload.push({ content, name: displayName });
                        } catch (err) {
                            extractErrors.push({
                                local: `${file.name}/${entryName}`,
                                reason: t("zipExtractFailed"), // Prefer localized generic error for extraction issues
                            });
                        }
                    }

                    if (!foundJsonInZip) {
                        extractErrors.push({ local: file.name, reason: t("zipNoJsonFiles") });
                    }
                } catch (err) {
                    // Catch any other errors during zip processing (e.g. invalid zip format)
                    extractErrors.push({ local: file.name, reason: t("zipExtractFailed") });
                }
            } else if (lowerName.endsWith(".json")) {
                // Regular JSON file
                try {
                    const fileData = await readFileAsText(file);
                    jsonFilesToUpload.push(fileData);
                } catch (err) {
                    extractErrors.push({ local: file.name, reason: err.message || t("fileReadFailed") });
                }
            }
        }

        // Check if we have anything to process
        if (jsonFilesToUpload.length === 0 && extractErrors.length === 0) {
            ElMessage.warning(t("noSupportedFiles"));
            return;
        }

        // Upload all collected JSON files
        const successFiles = [];
        const failedFiles = [...extractErrors];

        // Use batch upload API if multiple files, otherwise use single file upload
        if (jsonFilesToUpload.length > 1) {
            // Batch upload
            const parsedFiles = [];
            const parseErrors = [];

            // Parse all files first
            for (const fileData of jsonFilesToUpload) {
                try {
                    const parsed = JSON.parse(fileData.content);
                    parsedFiles.push({ content: parsed, name: fileData.name });
                } catch (err) {
                    parseErrors.push({ local: fileData.name, reason: t("invalidJson") });
                }
            }

            failedFiles.push(...parseErrors);

            // Upload all valid files in one batch
            if (parsedFiles.length > 0) {
                try {
                    const res = await fetch("/api/files/batch", {
                        body: JSON.stringify({ files: parsedFiles.map(f => f.content) }),
                        headers: { "Content-Type": "application/json" },
                        method: "POST",
                    });

                    if (res.ok || res.status === 207) {
                        const data = await res.json();
                        // Process results array with proper index mapping
                        if (data.results && Array.isArray(data.results)) {
                            for (const result of data.results) {
                                const originalFile = parsedFiles[result.index];
                                if (result.success) {
                                    successFiles.push({
                                        local: originalFile?.name || `file-${result.index}`,
                                        saved: result.filename || originalFile?.name || `file-${result.index}`,
                                    });
                                } else {
                                    failedFiles.push({
                                        local: originalFile?.name || `file-${result.index}`,
                                        reason: result.error || t("unknownError"),
                                    });
                                }
                            }
                        }
                    } else {
                        // Batch upload failed completely
                        let errorMsg;
                        try {
                            const data = await res.json();
                            errorMsg = getApiErrorMessage(data);
                        } catch (e) {
                            if (res.statusText) {
                                errorMsg = `HTTP Error ${res.status}: ${res.statusText}`;
                            } else {
                                errorMsg = `HTTP Error ${res.status}`;
                            }
                        }
                        // Mark all parsed files as failed
                        for (const fileData of parsedFiles) {
                            failedFiles.push({ local: fileData.name, reason: errorMsg });
                        }
                    }
                } catch (error) {
                    // Network or other error - mark all parsed files as failed
                    // (parseErrors are already in failedFiles)
                    for (const fileData of parsedFiles) {
                        failedFiles.push({ local: fileData.name, reason: error.message || t("networkError") });
                    }
                }
            }
        } else {
            // Single file upload (use existing logic)
            for (const fileData of jsonFilesToUpload) {
                const result = await uploadFile(fileData);
                if (result.success) {
                    successFiles.push({ local: fileData.name, saved: result.filename });
                } else {
                    failedFiles.push({ local: fileData.name, reason: result.error });
                }
            }
        }

        // Build notification message with file details (scrollable container)
        let messageHtml = '<div style="max-height: 50vh; overflow-y: auto;">';

        if (successFiles.length > 0) {
            messageHtml += `<div style="margin-bottom: 8px;"><strong style="color: var(--el-color-success);">${t("fileUploadBatchSuccess")} (${successFiles.length}):</strong></div>`;
            messageHtml += '<ul style="margin: 0 0 12px 16px; padding: 0;">';
            for (const f of successFiles) {
                messageHtml += `<li style="word-break: break-all;">${escapeHtml(f.local)} → ${escapeHtml(f.saved)}</li>`;
            }
            messageHtml += "</ul>";
        }

        if (failedFiles.length > 0) {
            messageHtml += `<div style="margin-bottom: 8px;"><strong style="color: var(--el-color-danger);">${t("fileUploadBatchFailed")} (${failedFiles.length}):</strong></div>`;
            messageHtml += '<ul style="margin: 0 0 0 16px; padding: 0;">';
            for (const f of failedFiles) {
                messageHtml += `<li style="word-break: break-all;">${escapeHtml(f.local)}: ${escapeHtml(f.reason)}</li>`;
            }
            messageHtml += "</ul>";
        }

        messageHtml += "</div>";

        // Determine notification type
        let notifyType = "success";
        if (failedFiles.length > 0 && successFiles.length === 0) {
            notifyType = "error";
        } else if (failedFiles.length > 0) {
            notifyType = "warning";
        }

        // Build title with counts
        const totalProcessed = successFiles.length + failedFiles.length;
        let notifyTitle;
        if (totalProcessed === 1) {
            notifyTitle = t("fileUploadComplete");
        } else {
            notifyTitle = `${t("fileUploadBatchResult")} (✓${successFiles.length} ✗${failedFiles.length})`;
        }

        // Show result notification (keep open)
        ElNotification({
            dangerouslyUseHTMLString: true,
            duration: 0,
            message: messageHtml,
            position: "top-right",
            title: notifyTitle,
            type: notifyType,
        });

        updateContent();
    } finally {
        // Always close notification and reset busy flag
        notification.close();
        state.isSwitchingAccount = false;
    }
};

// Download account by index
const downloadAccountByIndex = accountIndex => {
    if (accountIndex === null || accountIndex === undefined) return;
    window.location.href = `/api/files/auth-${accountIndex}.json`;
};

const formatDownloadTimestamp = () => {
    const now = new Date();
    const YYYY = now.getFullYear();
    const MM = String(now.getMonth() + 1).padStart(2, "0");
    const DD = String(now.getDate()).padStart(2, "0");
    const HH = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");

    return `${YYYY}-${MM}-${DD}_${HH}${mm}${ss}`;
};

const readFileAsText = file =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = () => reject(new Error(t("fileReadFailed")));
        reader.readAsText(file);
    });

const triggerUsageStatsImport = () => {
    if (isUsageStatsTransferBusy.value) return;

    ElMessageBox.confirm(t("usageStatsImportConfirm"), t("warningTitle"), {
        cancelButtonText: t("cancel"),
        confirmButtonText: t("ok"),
        lockScroll: false,
        type: "warning",
    })
        .then(() => usageStatsImportInput.value?.click())
        .catch(e => {
            if (e !== "cancel") {
                console.error(e);
            }
        });
};

const handleUsageStatsImport = async event => {
    const [file] = Array.from(event.target.files || []);
    event.target.value = "";
    if (!file) return;
    if (isUsageStatsTransferBusy.value) return;

    if (!file.name.toLowerCase().endsWith(".jsonl")) {
        ElMessage.error(t("usageStatsImportJsonlOnly"));
        return;
    }

    isImportingUsageStats.value = true;
    try {
        const content = await readFileAsText(file);
        const res = await fetch("/api/usage-stats/import", {
            body: JSON.stringify({ content, filename: file.name }),
            headers: { "Content-Type": "application/json" },
            method: "POST",
        });

        if (res.redirected) {
            window.location.href = res.url;
            return;
        }
        if (res.status === 401) {
            window.location.href = "/login";
            return;
        }

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            showUsageStatsImportNotification({
                message: t(data.message || "usageStatsImportFailed", { error: data.error || `HTTP ${res.status}` }),
                title: t("usageStatsImportResult"),
                type: "error",
            });
            return;
        }

        showUsageStatsImportNotification({
            message: t("usageStatsImportSuccess", data),
            title: t("usageStatsImportResult"),
            type: "success",
        });
        await fetchUsageStats();
    } catch (error) {
        showUsageStatsImportNotification({
            message: t("usageStatsImportFailed", { error: error.message }),
            title: t("usageStatsImportResult"),
            type: "error",
        });
    } finally {
        isImportingUsageStats.value = false;
    }
};

const showUsageStatsImportNotification = ({ message, title, type }) => {
    ElNotification({
        dangerouslyUseHTMLString: true,
        duration: 0,
        message: `<div style="max-height: 50vh; overflow-y: auto; word-break: break-word;">${escapeHtml(message)}</div>`,
        position: "top-right",
        title,
        type,
    });
};

// Download persisted usage stats JSONL
const downloadUsageStats = async () => {
    if (isUsageStatsTransferBusy.value) return;
    isDownloadingUsageStats.value = true;

    try {
        const res = await fetch("/api/usage-stats/download?check=1");
        if (res.redirected) {
            window.location.href = res.url;
            return;
        }
        if (res.status === 401) {
            window.location.href = "/login";
            return;
        }
        if (!res.ok) {
            let message = "usageStatsDownloadFailed";
            try {
                const data = await res.json();
                message = data.message || message;
                ElMessage.error(t(message, { error: data.error || `HTTP ${res.status}` }));
                return;
            } catch {
                // Ignore non-JSON error responses.
            }
            ElMessage.error(t(message, { error: `HTTP ${res.status}` }));
            return;
        }

        const filename = `AIStudioToAPI_usage-stats_${formatDownloadTimestamp()}.jsonl`;
        const a = document.createElement("a");
        a.href = "/api/usage-stats/download";
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } catch (error) {
        ElMessage.error(t("usageStatsDownloadFailed", { error: error.message }));
    } finally {
        isDownloadingUsageStats.value = false;
    }
};

// Download current logs
const downloadCurrentLogs = () => {
    if (!state.logs) return;

    const blob = new Blob([state.logs], { type: "text/plain" });
    const filename = `AIStudioToAPI_${formatDownloadTimestamp()}_${state.logCount}.log`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

// Theme handling is now managed by useTheme composable

onMounted(() => {
    // Listen for language changes
    I18n.onChange(() => {
        langVersion.value++;
        if (state.logCount === 0) {
            state.logs = t("loading");
        }
    });

    statsFiltersMobileMediaQuery = window.matchMedia(STATS_FILTERS_MOBILE_MEDIA_QUERY);
    syncStatsFiltersViewport(statsFiltersMobileMediaQuery);
    statsFiltersMobileMediaQuery.addEventListener("change", syncStatsFiltersViewport);

    updateContent().finally(scheduleUpdate);
    fetchUsageStats().finally(scheduleUpdate);

    // Check for updates once on initial load
    checkForUpdates();

    // Expose copyText function globally for tooltip HTML content
    window.__copyEnvVar = text => copyText(text);
});

onBeforeUnmount(() => {
    isActive = false;
    if (updateTimer) {
        clearTimeout(updateTimer);
    }
    if (statsFiltersMobileMediaQuery) {
        statsFiltersMobileMediaQuery.removeEventListener("change", syncStatsFiltersViewport);
    }
    // Clean up global function
    delete window.__copyEnvVar;
});

watchEffect(() => {
    document.title = t("statusTitle");
});
</script>

<style lang="less" scoped>
@import "../styles/variables.less";

.main-layout {
    display: flex;
    min-height: 100vh;
    background-color: @background-light;
}

/* Sidebar Styling */
.sidebar {
    width: 60px;
    background: @background-white;
    border-right: 1px solid @border-light;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 20px 0;
    align-items: center;
    position: fixed;
    height: 100vh;
    z-index: 100;
}

.sidebar-menu,
.sidebar-footer {
    display: flex;
    flex-direction: column;
    gap: 15px;
    align-items: center;
}

.menu-item {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    display: flex;
    justify-content: center;
    align-items: center;
    color: @text-secondary;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
    background: transparent;

    &:hover {
        background-color: @background-light;
        color: @primary-color;
    }

    &.active {
        background-color: @primary-color;
        color: @text-on-primary;
        box-shadow: 0 4px 12px rgba(var(--color-primary-rgb), 0.3);
    }

    &.logout-button:hover {
        color: @error-color;
        background-color: rgba(var(--color-error-rgb), 0.1);
    }
}

/* Content Area */
.content-area {
    flex: 1;
    margin-left: 60px; /* Sidebar width */
    padding: 2rem;
    max-width: none;
    min-width: 0;
}

.page-header {
    margin-bottom: 2rem;

    h1 {
        font-size: 1.5rem;
        font-weight: 600;
        color: @text-primary;
        display: flex;
        align-items: center;
        gap: 10px;
    }
}

.view-container {
    animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateY(10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* Dashboard Grid */
.dashboard-grid {
    display: grid;
    gap: 24px;
    width: 100%;
}

/* Responsive Grid Columns */
@media (max-width: 599px) {
    .dashboard-grid {
        grid-template-columns: 1fr;
    }
}

@media (min-width: 600px) and (max-width: 1023px) {
    .dashboard-grid {
        grid-template-columns: repeat(2, 1fr);
    }
}

@media (min-width: 1024px) {
    .dashboard-grid {
        grid-template-columns: repeat(3, 1fr);
    }
}

/* Full Width Section for Account Management */
.full-width-section {
    margin-top: 24px;
    width: 100%;
}

/* Common Card Styles */
.status-card {
    background: @background-white;
    border-radius: 16px;
    padding: 24px;
    box-shadow: @shadow-light;
    border: 1px solid @border-light;
    min-width: 0;
}

.card-title {
    font-size: 0.9rem;
    color: @text-secondary;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
    margin-bottom: 20px;
    border-bottom: 1px solid @border-light;
    padding-bottom: 15px;
}

/* Status Items */
.status-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.status-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.95rem;
    min-height: 32px; /* Ensure uniform height even with components */
}

.label {
    color: @text-secondary;
    display: inline-flex;
    align-items: center;

    svg {
        flex-shrink: 0;
        transform: translateY(1px);
    }
}

.value {
    font-weight: 500;
    color: @text-primary;
    font-family: @font-family-mono;
}

.status-text-bold {
    font-weight: 700 !important;
    opacity: 1 !important;
}

.account-value {
    display: flex;
    justify-content: flex-end;
    align-items: flex-start; /* Align to top for multiline names */
    gap: 6px;
    min-width: 0;
    max-width: 100%;
    text-align: right;
}

.account-idx-display {
    white-space: nowrap;
}

.account-name {
    max-width: 450px;
    word-break: break-word;
    white-space: normal;
    min-width: 0;
    text-align: right;
}

@media (min-width: 600px) {
    .account-name {
        max-width: 450px;
    }
}

@media (min-width: 1024px) {
    .account-name {
        max-width: none;
    }
}

.status-ok {
    color: @success-color;
}
.status-warning {
    color: @warning-color;
}
.status-error {
    color: @error-color;
}

.dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: @border-color;

    &.status-running {
        background-color: @success-color;
        box-shadow: 0 0 8px @success-color;
    }

    &.status-error {
        background-color: @error-color;
    }
}

.clickable-version {
    cursor: pointer;
    transition: color 0.3s;
    display: inline-flex;
    align-items: center;

    &:hover {
        color: @primary-color;
    }
}

/* Account List */
.account-list-container {
    margin: 15px 0;
    background: @background-light;
    border-radius: 8px;
    padding: 10px;
    max-height: 150px;
    overflow-y: auto;
}

.account-row {
    display: flex;
    justify-content: space-between;
    padding: 6px 0;
    font-size: 0.9rem;
    border-bottom: 1px solid rgba(0, 0, 0, 0.05);

    &:last-child {
        border-bottom: none;
    }
}

.account-idx {
    color: @text-secondary;
    font-family: @font-family-mono;
}

/* Settings View Specifics */
.settings-card {
    max-width: 600px;
    margin: 0 auto;
}

.action-group {
    display: flex;
    flex-wrap: wrap;
    gap: 15px;
    margin-bottom: 30px;
    align-items: center;
}

.icon-buttons {
    display: flex;
    gap: 10px;

    button {
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid @border-color;
        border-radius: 8px;
        background: @background-white;
        color: @text-secondary;
        cursor: pointer;
        transition: all 0.2s;

        &:hover:not(:disabled) {
            border-color: @primary-color;
            color: @primary-color;
        }

        &:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        &.btn-danger:hover:not(:disabled) {
            border-color: @error-color;
            color: @error-color;
        }

        &.btn-warning:hover:not(:disabled) {
            border-color: @warning-color;
            color: @warning-color;
        }
    }
}

/* Account list styles */
.account-top-actions {
    margin-bottom: 16px;
    justify-content: space-between;
}

.batch-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    height: 36px; // Force height to match buttons

    .el-checkbox {
        height: 100%;
        margin-right: 0;
        display: flex;
        align-items: center;
    }
}

.selected-count {
    font-size: 0.85rem;
    color: @primary-color;
    font-weight: 500;
    display: flex;
    align-items: center;
    height: 100%;
}

.btn-batch-delete {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 1px solid @border-color;
    border-radius: 8px;
    background: @background-white;
    color: @text-secondary;
    cursor: pointer;
    transition: all 0.2s;

    &:hover:not(:disabled) {
        border-color: @error-color;
        color: @error-color;
        background: transparent;
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
}

.btn-batch-download {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 1px solid @border-color;
    border-radius: 8px;
    background: @background-white;
    color: @text-secondary;
    cursor: pointer;
    transition: all 0.2s;

    &:hover:not(:disabled) {
        border-color: @primary-color;
        color: @primary-color;
        background: transparent;
    }

    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
}

.account-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 400px;
    overflow-y: auto;
}

.account-list-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: @background-light;
    border-radius: 8px;
    border: 1px solid transparent;
    transition: all 0.2s;

    &:hover {
        background: var(--bg-list-item-hover);
    }

    &.is-current {
        border-color: @success-color;
        background: rgba(var(--color-success-rgb), 0.25);
    }

    &.is-selected {
        background: rgba(var(--color-primary-rgb), 0.25); // Darker blue background for selected
    }

    &.is-current.is-selected {
        background: rgba(var(--color-primary-rgb), 0.25); // Use blue background like selected
        border: 1px solid @success-color;
    }
}

.account-checkbox {
    flex-shrink: 0;
    margin-right: 8px;
}

.account-info {
    display: flex;
    align-items: center;
    gap: 5px;
    flex: 1;
    min-width: 0;
}

.account-index {
    font-family: @font-family-mono;
    font-size: 0.85rem;
    color: @text-secondary;
    flex-shrink: 0;
}

.account-email {
    font-size: 0.9rem;
    color: @text-primary;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;

    &.is-error {
        color: @error-color;
    }

    &.is-duplicate {
        color: @warning-color;
    }
}

.current-badge {
    font-size: 0.75rem;
    padding: 2px 8px;
    background: @success-color;
    color: @text-on-primary;
    border-radius: 12px;
    flex-shrink: 0;
    margin-left: 0;
    margin-right: 6px;
}

.expired-badge {
    font-size: 0.75rem;
    padding: 2px 8px;
    background: @error-color;
    color: @text-on-primary;
    border-radius: 12px;
    flex-shrink: 0;
    margin-left: 0;
    margin-right: 6px;
}

.account-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;

    button {
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid @border-color;
        border-radius: 6px;
        background: @background-white;
        color: @text-secondary;
        cursor: pointer;
        transition: all 0.2s;

        &:hover:not(:disabled) {
            border-color: @primary-color;
            color: @primary-color;
        }

        &.btn-switch:hover:not(:disabled) {
            border-color: @success-color;
            color: @success-color;
        }

        &.btn-switch.is-active {
            background-color: @background-white;
            border-color: @success-color;
            color: @success-color;
            opacity: 1 !important;
            cursor: not-allowed;
        }

        &.btn-switch.is-fast {
            color: #f59e0b;
            border-color: #fcd34d;
        }

        &.btn-switch.is-fast:hover:not(:disabled) {
            border-color: @success-color;
            color: @success-color;
            background-color: @background-white;
        }

        &:disabled {
            opacity: 0.4;
            cursor: not-allowed;
        }

        &.btn-danger:hover:not(:disabled) {
            border-color: @error-color;
            color: @error-color;
        }
    }
}

.account-list-empty {
    padding: 24px;
    text-align: center;
    color: @text-secondary;
    font-size: 0.9rem;
}

.settings-switches {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.switch-container {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.95rem;
    min-height: 32px;
}

/* Logs View Specifics */
.logs-view-container {
    /* Full height minus content-area padding (2rem top + 2rem bottom) */
    height: calc(100vh - 4rem);
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.logs-view-container .page-header {
    flex-shrink: 0;
    /* Ensure header doesn't take extra margins causing overflow */
    margin-bottom: 20px;
}

.logs-card {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden; /* Contain scroll */
    min-height: 0; /* Allow flex child to shrink below content size */
    padding: 0;
    margin-bottom: 0;
}

#log-container {
    flex: 1;
    overflow-y: auto; /* Internal scrollbar */
    padding: 20px;
    margin: 0;
    background: @background-white;
    color: @text-primary;
    font-family: @font-family-mono;
    font-size: 0.85rem;
    line-height: 1.5;
    border-radius: 0 0 16px 16px;
    white-space: pre-wrap;
    word-break: break-all;
    max-width: 100%;
    width: 100%;
}

/* Stats View Styles */
.stats-grid-v2 {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
}

.stats-card-v2 {
    background: var(--bg-card);
    border: 1px solid var(--border-light);
    border-radius: @border-radius-lg;
    padding: 20px 16px;
    display: flex;
    align-items: center;
    min-height: 96px;
    gap: 12px;
    transition: all @transition-normal;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
    min-width: 0;

    &:hover {
        transform: translateY(-4px);
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
        border-color: @primary-color;
    }

    .card-icon {
        width: 42px;
        height: 42px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;

        &.is-total {
            color: #409eff;
            background: fade(#409eff, 10%);
        }
        &.is-success {
            color: #67c23a;
            background: fade(#67c23a, 10%);
        }
        &.is-warning {
            color: #e6a23c;
            background: fade(#e6a23c, 10%);
        }
        &.is-error {
            color: #f56c6c;
            background: fade(#f56c6c, 10%);
        }
        &.is-active {
            color: #6366f1;
            background: fade(#6366f1, 10%);
        }
        &.is-accounts {
            color: #ec4899;
            background: fade(#ec4899, 10%);
        }
    }

    .card-info {
        min-width: 0;
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
    }

    .stats-label {
        display: block;
        color: @text-secondary;
        font-size: 0.8rem;
        margin-bottom: 2px;
        font-weight: 500;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.3;
    }

    .stats-value {
        display: block;
        color: @text-primary;
        font-size: 1.5rem;
        font-weight: 800;
        letter-spacing: -0.02em;
        white-space: nowrap;
        line-height: 1.15;
        overflow: hidden;
        text-overflow: ellipsis;
    }
}

.card-header-v2 {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;
    padding-bottom: 15px;
    border-bottom: 1px solid @border-light;
}

.summary-card-visual {
    padding: 24px;
    background: @background-white;
    border-radius: @border-radius-lg;

    .summary-total-badge {
        background: var(--bg-light);
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 0.85rem;
        color: @text-secondary;
        border: 1px solid var(--border-light);
    }
}

.progress-stacked-root {
    margin-bottom: 30px;

    .progress-info-labels {
        display: flex;
        gap: 24px;
        margin-bottom: 12px;
        font-size: 0.85rem;
        font-weight: 600;

        span {
            position: relative;
            padding-left: 14px;
            display: flex;
            align-items: center;

            &::before {
                content: "";
                position: absolute;
                left: 0;
                width: 8px;
                height: 8px;
                border-radius: 50%;
            }
        }

        .label-success::before {
            background: #67c23a;
            box-shadow: 0 0 8px fade(#67c23a, 50%);
        }
        .label-error::before {
            background: #f56c6c;
            box-shadow: 0 0 8px fade(#f56c6c, 50%);
        }
        .label-warn::before {
            background: #e6a23c;
            box-shadow: 0 0 8px fade(#e6a23c, 50%);
        }
    }

    .progress-stacked-bar {
        display: flex;
        height: 12px;
        background: var(--bg-light);
        border-radius: 10px;
        overflow: hidden;
        border: 1px solid var(--border-light);
    }

    .bar-segment {
        height: 100%;
        transition: width 1s ease-out;

        &.is-success {
            background: @success-color;
        }
        &.is-error {
            background: @error-color;
        }
        &.is-warning {
            background: @warning-color;
        }
    }
}

.breakdown-grid-v2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 30px;

    @media (max-width: 600px) {
        grid-template-columns: 1fr;
        gap: 20px;
    }
}

.breakdown-block-v2 {
    h4 {
        font-size: 0.85rem;
        color: @text-secondary;
        margin: 0 0 12px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
}

.breakdown-list-v2 {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.modern-chip {
    display: flex;
    align-items: center;
    padding: 10px 14px;
    background: var(--bg-light);
    border: 1px solid var(--border-light);
    border-radius: 10px;
    font-size: 0.9rem;
    color: @text-primary;
    transition: all 0.2s;

    &:hover {
        border-color: @primary-color;
        background: var(--bg-card);
    }

    .chip-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: @primary-color;
        margin-right: 12px;
        box-shadow: 0 0 6px rgba(var(--color-primary-rgb), 0.4);
    }

    .chip-label {
        font-weight: 500;
        flex: 1;
    }

    .chip-count {
        background: var(--bg-card);
        padding: 2px 8px;
        border-radius: 6px;
        font-size: 0.8rem;
        font-weight: 700;
        color: @text-secondary;
        border: 1px solid var(--border-light);
    }

    &.mode-chip {
        background: transparent;
        border-style: dashed;

        .chip-label {
            color: @text-secondary;
        }
    }
}

.meta-chip {
    display: inline-flex;
    align-items: center;
    padding: 6px 14px;
    border-radius: 8px;
    background: @background-white;
    border: 1px solid @border-light;
    color: @text-secondary;
    font-size: 0.82rem;
    transition: all 0.2s;

    &:hover {
        border-color: @primary-color;
        color: @primary-color;
    }
}

.stats-download-button {
    justify-content: center;
    width: 34px;
    height: 34px;
    padding: 0;
    cursor: pointer;
    font-family: inherit;

    &:disabled {
        cursor: wait;
        opacity: 0.65;
    }
}

.time-range-select {
    width: 130px;

    :deep(.el-select__wrapper) {
        background: @background-white;
        border: 1px solid @border-light;
        box-shadow: none !important;
        border-radius: 8px !important;
        padding: 5px 12px;
        min-height: 35px;
        transition: all @transition-fast;

        &:hover {
            border-color: @primary-color;
        }

        &.is-focused {
            border-color: @primary-color;
        }
    }

    :deep(.el-select__placeholder) {
        color: @text-secondary;
        font-size: 0.82rem;
    }

    :deep(.el-select__selected-item) {
        color: @text-secondary !important;
        font-size: 0.82rem !important;
    }
}

.page-description {
    color: @text-secondary;
    margin: 0;
}

.wide-card {
    min-width: 0;
    margin-bottom: 24px;
}

.summary-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.summary-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.mono {
    font-family: @font-family-mono;
}

.data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;

    th,
    td {
        text-align: left;
        padding: 12px 10px;
        border-bottom: 1px solid @border-light;
        vertical-align: top;
    }

    th {
        color: @text-secondary;
        font-weight: 600;
        background: rgba(0, 0, 0, 0.02);
        position: sticky;
        top: 0;
        z-index: 1;
    }

    tbody tr:hover {
        background: rgba(var(--color-primary-rgb), 0.06);
    }
}

.empty-state {
    color: @text-secondary;
    text-align: center;
    padding: 24px 0;
}

.breakdown-block {
    margin-top: 20px;

    h4 {
        font-size: 0.85rem;
        color: @text-secondary;
        margin: 0 0 10px;
    }
}

.breakdown-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
}

.usage-tag-compact {
    position: relative;
    display: inline-flex;
    align-items: center;
    padding: 0;
    border-radius: 6px;
    background: var(--bg-tag-default, rgba(0, 0, 0, 0.03));
    border: 1px solid @border-light;
    font-size: 0.82rem;
    overflow: hidden;
    height: 24px;
    z-index: 1;
    transition: all 0.2s;

    &:hover {
        border-color: @primary-color;
        box-shadow: 0 2px 6px rgba(var(--color-primary-rgb), 0.1);
    }

    &::before {
        content: "";
        position: absolute;
        left: 0;
        top: 0;
        height: 100%;
        width: var(--progress, 0%);
        background: linear-gradient(
            to right,
            rgba(var(--color-error-rgb), var(--usage-tag-error-alpha)) 0%,
            rgba(var(--color-error-rgb), var(--usage-tag-error-alpha)) var(--error-progress, 0%),
            rgba(var(--color-success-rgb), var(--usage-tag-success-alpha)) var(--error-progress, 0%),
            rgba(var(--color-success-rgb), var(--usage-tag-success-alpha)) 100%
        );
        z-index: -1;
        transition: width 0.6s cubic-bezier(0.1, 0, 0.2, 1);
    }

    .tag-label {
        padding: 0 8px;
        color: @text-primary;
        font-weight: 500;
        white-space: nowrap;
    }

    .tag-count {
        background: rgba(0, 0, 0, 0.04);
        height: 100%;
        display: flex;
        align-items: center;
        padding: 0 6px;
        color: @text-secondary;
        font-weight: 700;
        font-family: @font-family-mono;
        font-size: 0.75rem;
        border-left: 1px solid @border-light;
        gap: 4px;
    }

    .tag-error-count {
        color: @error-color;
        font-weight: 900;
    }
}

.usage-tag-more {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 24px;
    padding: 0 8px;
    border-radius: 6px;
    background: var(--bg-hover);
    color: @primary-color;
    font-size: 0.75rem;
    font-weight: 700;
    cursor: help;
    border: 1px dashed rgba(var(--color-primary-rgb), 0.4);
    transition: all 0.2s;

    &:hover {
        background: rgba(var(--color-primary-rgb), 0.1);
        border-style: solid;
        transform: scale(1.05);
    }
}

.tooltip-model-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 4px;
    max-height: 300px;
    overflow-y: auto;
}

.tooltip-model-item {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    font-size: 0.8rem;
    padding: 2px 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);

    &:last-child {
        border-bottom: none;
    }

    .model-name-tip {
        color: rgba(255, 255, 255, 0.7);
    }

    .model-count-tip {
        color: #fff;
        font-weight: 700;
        font-family: @font-family-mono;
    }
}

.records-card {
    margin-bottom: 0;
}

.stats-filters-card {
    margin-bottom: 24px;
    background: @background-white;
    border: 1px solid @border-light;
    border-radius: 16px;
    padding: 24px;

    .card-title {
        margin: 0;
        border-bottom: none;
        padding-bottom: 0;
    }
}

.stats-filters-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 15px;
    border-bottom: 1px solid @border-light;
}

.stats-filters-body {
    margin-top: 16px;
}

.stats-filters-copy {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.stats-filters-toggle-indicator {
    display: none;
    align-items: center;
    justify-content: center;
    color: @text-secondary;
    transition:
        transform @transition-fast,
        color @transition-fast;

    &.is-collapsed {
        transform: rotate(-90deg);
    }
}

.stats-filters-actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    flex-wrap: wrap;
}

.stats-time-range-select {
    width: 144px;
}

.stats-custom-range {
    margin: 16px 0 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    flex-wrap: wrap;
}

.stats-custom-range-label {
    color: @text-secondary;
    font-size: 0.85rem;
    white-space: nowrap;
}

.stats-custom-range-picker {
    width: min(100%, 360px);
}

.stats-record-filters {
    margin: 16px 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
}

.records-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
}

.records-order {
    color: @text-secondary;
    font-size: 0.85rem;
}

.records-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin: 16px 0;
}

.records-shell {
    max-height: 60vh;
}

.records-pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    margin-top: 20px;
    padding: 12px 16px;
    background: rgba(var(--color-primary-rgb), 0.02);
    border-radius: @border-radius-lg;
    border: 1px solid @border-light;
}

.records-pagination-summary,
.records-pagination-controls,
.records-pagination-pages,
.records-pagination-size,
.records-pagination-jump {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.records-pagination-summary,
.records-pagination-size span,
.records-pagination-jump span {
    color: @text-secondary;
    font-size: 0.85rem;
    font-weight: 500;
}

.records-pagination-btn,
.records-pagination-select,
.records-pagination-input {
    height: 32px;
    line-height: 30px;
    border: 1px solid @border-color;
    border-radius: @border-radius-md;
    background: @background-white;
    color: @text-secondary;
    font-size: 0.85rem;
    transition: all @transition-fast;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    vertical-align: middle;

    &:hover:not(:disabled) {
        border-color: @primary-color;
        color: @primary-color;
        box-shadow: 0 3px 8px rgba(var(--color-primary-rgb), 0.15);
    }

    &:active:not(:disabled) {
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    }

    &:disabled {
        opacity: 0.45;
        cursor: not-allowed;
        background: @background-light;
        border-color: @border-light;
        box-shadow: none;
    }
}

.records-pagination-btn {
    padding: 0 12px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1;

    &.is-active {
        color: @text-on-primary;
        border-color: @primary-color;
        background: @primary-color;
        box-shadow: 0 2px 6px rgba(var(--color-primary-rgb), 0.35);

        &:hover {
            color: @text-on-primary;
            background: @primary-hover-color;
            border-color: @primary-hover-color;
        }
    }
}

.records-pagination-page {
    min-width: 32px;
    padding: 0;
}

.records-pagination-ellipsis {
    min-width: 20px;
    text-align: center;
    color: @text-secondary;
    font-size: 0.85rem;
    letter-spacing: 1px;
    line-height: 32px;
}

.records-pagination-select,
.records-pagination-input {
    padding: 0 8px;
    outline: none;
    border-color: @border-light;

    &:focus {
        border-color: @primary-color;
        box-shadow: 0 0 0 3px rgba(var(--color-primary-rgb), 0.12);
    }
}

.records-pagination-select {
    min-width: 70px;
    cursor: pointer;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;
    padding-right: 24px;
    line-height: 1;
}

.records-pagination-input {
    width: 50px;
    text-align: center;
    padding: 0;

    &::-webkit-inner-spin-button,
    &::-webkit-outer-spin-button {
        opacity: 0.1;
    }
}

.records-pagination-go {
    min-width: 50px;
    background: transparent;
    border-color: @border-light;

    &:hover:not(:disabled) {
        background: rgba(var(--color-primary-rgb), 0.05);
    }
}

.record-filter-select-custom {
    :deep(.el-select__wrapper) {
        cursor: pointer;
        height: 36px !important;
        overflow: hidden;
    }

    // Completely negate the height impact of tags
    :deep(.el-select__selection) {
        padding: 0 !important;
        margin: 0 !important;
        height: 100% !important;

        .el-tag {
            display: none !important;
        }
    }

    // Adjust placeholder and prefix positioning
    :deep(.el-select__placeholder) {
        display: none !important; // Hide native placeholder
    }

    // Custom label text style
    .custom-label-text {
        position: absolute;
        left: 12px; // Default alignment for Element Plus
        top: 50%;
        transform: translateY(-50%);
        color: var(--el-text-color-primary);
        font-weight: 400;
        max-width: calc(100% - 40px);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        pointer-events: none;
        z-index: 1;

        &.is-placeholder-label {
            color: var(--el-text-color-placeholder);
        }
    }
}

// Custom search option at the top of select dropdowns
.stats-filter-search-option {
    position: sticky;
    top: 0;
    z-index: 10;
    background: @background-white;
    padding: 8px 12px !important;
    height: auto !important;
    border-bottom: 1px solid @border-light;
    cursor: default !important;
    opacity: 1 !important; // Override disabled opacity

    &.is-disabled {
        background-color: @background-white !important;
        cursor: default !important;
        color: inherit !important;
    }

    :deep(.el-input) {
        .el-input__wrapper {
            box-shadow: 0 0 0 1px @border-light inset !important;
            border-radius: 6px;
            padding: 0 8px;
            height: 32px;
            background-color: @background-white;
            transition: all @transition-fast;
            width: 100%;
            box-sizing: border-box;

            &.is-focus {
                box-shadow: 0 0 0 1px @primary-color inset !important;
            }
        }

        .el-input__inner {
            padding-right: 24px !important; // Fixed reservation
        }
    }
}

// Fixed-layout clear button to prevent resizing
.stats-search-clear-btn {
    font-size: 14px;
    color: var(--el-text-color-placeholder);
    cursor: pointer;
    transition: all @transition-fast;
    visibility: hidden; // Keep space but hide
    pointer-events: none;
    margin-right: 2px;

    &.is-visible {
        visibility: visible;
        pointer-events: auto;

        &:hover {
            color: @primary-color;
        }
    }
}

.record-filter-select {
    width: 132px;

    :deep(.el-select__wrapper) {
        background: @background-white;
        border: 1px solid @border-light;
        box-shadow: none !important;
        border-radius: 8px !important;
        min-height: 36px;
        transition: all @transition-fast;

        &:hover {
            border-color: @primary-color;
        }

        &.is-focused {
            border-color: @primary-color;
        }
    }
}

.record-filter-select-wide {
    width: 180px;
}

.record-filter-select-narrow {
    width: 110px;
}

.record-filter-reset {
    height: 36px;
    padding: 0 14px;
    border-radius: 8px;
    border: 1px solid @border-light;
    background: @background-white;
    color: @text-secondary;
    cursor: pointer;
    transition: all @transition-fast;

    &:hover {
        color: @primary-color;
        border-color: @primary-color;
    }

    &.is-active {
        color: @primary-color;
        border-color: rgba(var(--color-primary-rgb), 0.35);
        background: rgba(var(--color-primary-rgb), 0.08);
    }

    &:disabled {
        opacity: 0.55;
        cursor: not-allowed;
        color: @text-secondary;
        border-color: @border-light;
        background: @background-white;
    }
}

:global(.el-popper.stats-filter-select-dropdown) {
    max-width: calc(100vw - 24px);
}

:global(.el-popper.stats-filter-select-dropdown .el-scrollbar__wrap) {
    overflow-x: auto !important;
}

:global(.el-popper.stats-filter-select-dropdown .el-select-dropdown__list) {
    min-width: max-content;
}

:global(.el-popper.stats-filter-select-dropdown .el-select-dropdown__item),
:global(.el-popper.stats-filter-select-dropdown .stats-filter-search-option) {
    white-space: nowrap;
}

:global(.el-popper.stats-date-range-dropdown) {
    max-width: calc(100vw - 24px);
}

/* Stats page header: allow meta chips to wrap below title on narrow screens */
.stats-page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
}

.page-header-main {
    flex: 1;
    min-width: 0;
}

.page-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

/* Scrollable table wrapper */
.table-scroll-wrapper {
    overflow-x: auto;
    border: 1px solid @border-light;
    border-radius: @border-radius-md;
    -webkit-overflow-scrolling: touch;
    max-height: 60vh;

    &::-webkit-scrollbar {
        width: 6px;
        height: 6px;
    }

    &::-webkit-scrollbar-track {
        background: transparent;
    }

    &::-webkit-scrollbar-thumb {
        background: @border-color;
        border-radius: 3px;

        &:hover {
            background: @text-secondary;
        }
    }

    &::-webkit-scrollbar-corner {
        background: transparent;
    }
}

.records-scroll-wrapper {
    max-height: none !important;
}

.fixed-header-table {
    width: max-content;
    min-width: 100%;

    th,
    td {
        white-space: nowrap;
    }

    tbody td {
        vertical-align: middle;
    }

    /* Solid background for generic th to prevent scroll-under contents from showing through */
    th {
        position: sticky;
        top: 0;
        z-index: 10;
        background: @background-light;
        /* Use box-shadow for bottom border to prevent sticky border-collapse disappearance */
        box-shadow: inset 0 -1px 0 @border-light;
    }

    th:first-child,
    td:first-child {
        position: sticky;
        left: 0;
        z-index: 5;
    }

    td:first-child {
        background: @background-white;
        box-shadow: inset -1px 0 0 @border-light;
    }

    th:first-child {
        z-index: 11;
        background: @background-light;
        /* Intersecting cell gets combined left and bottom shadows */
        box-shadow: inset -1px -1px 0 @border-light;
    }

    /* Opaque hover background for sticky cell to avoid scrolled content bleed-through */
    tbody tr:hover td:first-child,
    tbody tr:hover .account-cell {
        background:
            linear-gradient(rgba(var(--color-primary-rgb), 0.06), rgba(var(--color-primary-rgb), 0.06)),
            @background-white;
    }
}

/* Account column: allow wrapping for long email addresses */
.account-cell {
    white-space: normal !important;
    word-break: break-all;
    max-width: 240px;
    vertical-align: middle;
}

/* Base stats-grid responsiveness explicitly ensured via auto-fit */
.stats-grid-v2 {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;
    margin-bottom: 30px;
}

/* truncate cells for very long text (e.g. paths, IDs) */
.truncate-cell {
    max-width: 250px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.request-ip-text {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: bottom;
}

/* Time column in request records: sticky + fixed width */
.sticky-time-col {
    max-width: 180px;
    white-space: normal !important;
}

.outcome-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 72px;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 600;

    &.is-success {
        color: @success-color;
        background: rgba(var(--color-success-rgb), 0.12);
    }

    &.is-error {
        color: @error-color;
        background: rgba(var(--color-error-rgb), 0.12);
    }

    &.is-aborted {
        color: @warning-color;
        background: rgba(var(--color-warning-rgb), 0.12);
    }
}

.attempts-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    padding: 4px 10px;
    border-radius: 999px;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--text-secondary);
    background: var(--bg-hover);

    &.is-clickable {
        cursor: pointer;
        color: var(--color-primary);
        background: rgba(var(--color-primary-rgb), 0.1);

        &:hover {
            background: rgba(var(--color-primary-rgb), 0.2);
        }
    }
}

@media (max-width: 768px) {
    :global(.el-popper.stats-date-range-dropdown) {
        width: calc(100vw - 24px) !important;
        max-width: calc(100vw - 24px) !important;
        max-height: min(78vh, 560px);
        overflow: auto;
        overscroll-behavior: contain;
        -webkit-overflow-scrolling: touch;
        touch-action: pan-x pan-y;
    }

    :global(.el-popper.stats-date-range-dropdown .el-picker-panel) {
        min-width: 620px;
    }

    :global(.el-popper.stats-date-range-dropdown .el-picker-panel__body-wrapper) {
        overflow: visible;
    }

    .stats-page-header {
        flex-direction: column;
        align-items: flex-start;
    }

    .page-meta {
        width: 100%;
        justify-content: flex-start;
    }

    .stats-dashboard-grid {
        grid-template-columns: 1fr;
    }

    .stats-grid-v2 {
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
    }

    .table-scroll-wrapper {
        max-height: 45vh;
    }

    .record-filter-select,
    .record-filter-select-wide,
    .record-filter-select-narrow,
    .record-filter-reset,
    .stats-time-range-select,
    .stats-custom-range-picker {
        width: 100%;
    }

    .stats-filters-actions {
        width: 100%;
    }

    .stats-custom-range {
        align-items: stretch;
        justify-content: flex-start;
    }

    .stats-custom-range-label {
        width: 100%;
    }

    .stats-filters-header {
        &.is-collapsible {
            cursor: pointer;
            user-select: none;

            &:focus-visible {
                outline: 2px solid rgba(var(--color-primary-rgb), 0.28);
                outline-offset: 4px;
            }
        }
    }

    .stats-filters-toggle-indicator {
        display: inline-flex;
    }

    .stats-filters-card {
        &.is-collapsed-mobile {
            .stats-filters-header {
                padding-bottom: 0;
                border-bottom: none;
            }
        }
    }

    .account-cell {
        max-width: 150px;
    }

    .sticky-time-col {
        max-width: 150px;
    }
}

@media (max-width: 599px) {
    .stats-grid-v2 {
        grid-template-columns: 1fr 1fr;
    }

    .stats-card-v2 {
        padding: 14px 16px;

        .stats-value {
            font-size: 1.25rem;
        }
    }

    .stats-dashboard-grid {
        gap: 16px;
    }

    .page-meta {
        gap: 6px;
    }

    .meta-chip {
        font-size: 0.8rem;
        padding: 6px 10px;
    }

    .time-range-select {
        :deep(.el-select__wrapper) {
            font-size: 14px; // Prevent select text from shrinking at narrow widths
        }

        :deep(.el-select__placeholder),
        :deep(.el-select__selected-item) {
            font-size: 0.82rem;
        }
    }

    .stats-filters-card {
        padding: 18px;
    }

    .account-cell {
        max-width: 100px;
    }

    .sticky-time-col {
        max-width: 90px;
    }
}

.version-footer {
    margin-top: 30px;
    display: flex;
    gap: 15px;
    justify-content: center;
    align-items: center;
    font-size: 0.9rem;
    color: @text-secondary;
}

.github-link {
    display: flex;
    align-items: center;
    gap: 8px;
    background-color: #24292f;
    color: #fff !important;
    padding: 6px 16px;
    border-radius: 20px;
    font-weight: 600;
    transition: all 0.2s;

    &:hover {
        background-color: #333;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
}

.version-tag {
    background-color: #0366d6;
    color: #fff;
    padding: 6px 12px;
    border-radius: 20px;
    font-weight: 600;
    font-size: 0.9rem;
}

.update-tag {
    color: @error-color !important;
    font-weight: 600;
    font-size: 0.9rem;
}

.repo-link {
    color: @primary-color;
    text-decoration: none;
    font-weight: 500;
}

.repo-link:hover {
    text-decoration: underline;
}

.update-link {
    color: @error-color;
    text-decoration: none;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    transition: all 0.2s;
    animation: red-white-breath 2s infinite ease-in-out;

    &:hover {
        animation: none;
        color: @error-color;
        opacity: 1;
    }
}

@keyframes red-white-breath {
    0%,
    100% {
        color: @error-color;
    }
    50% {
        color: rgba(var(--color-error-rgb), 0.5);
    }
}

// Mobile floating action buttons
.mobile-only {
    display: block;
}

.floating-actions {
    align-items: flex-end;
    display: flex;
    flex-direction: column-reverse; /* Put toggle button at bottom */
    gap: 12px;
    transition: all @transition-normal;

    &:not(.is-expanded) {
        opacity: 0.5;
        transform: translateX(15px); /* Peek from the edge */

        &:hover {
            opacity: 1;
            transform: translateX(0);
        }
    }

    &.is-expanded {
        opacity: 1;
        transform: translateX(-30px);
    }
}

.floating-btn {
    align-items: center;
    backdrop-filter: blur(10px);
    background: @affix-button-bg;
    border: 1px solid @affix-button-border;
    border-radius: @border-radius-circle 0 0 @border-radius-circle; /* Rounded left side only when stuck */
    box-shadow: @affix-button-shadow;
    cursor: pointer;
    display: flex;
    height: @affix-button-size;
    justify-content: center;
    transition: all @transition-normal;
    width: @affix-button-size;
    position: relative;
    z-index: 1;

    &:disabled {
        cursor: not-allowed;
        opacity: 0.5;
    }

    svg {
        display: block;
        width: 24px;
        height: 24px;
        transition: transform @transition-normal;
    }

    &.secondary-btn {
        opacity: 0;
        transform: translateY(20px) scale(0.5);
        pointer-events: none;
        visibility: hidden;
        border-radius: @border-radius-circle; /* Secondary buttons remain round */
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

    &.toggle-btn {
        color: @text-secondary;
        z-index: 2;

        &:hover:not(:disabled) {
            background: @background-white;
            color: @primary-color;
        }

        &.is-active {
            background: @primary-color;
            color: @text-on-primary;
            border-radius: @border-radius-circle; /* Become round when expanded */

            svg {
                transform: rotate(45deg);
            }
        }
    }
}

.floating-actions.is-expanded {
    .secondary-btn {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
        visibility: visible;
    }
}

/* Mobile Adaptation */
@media (max-width: 768px) {
    .sidebar {
        width: 100%;
        height: 60px;
        bottom: 0;
        top: auto;
        flex-direction: row;
        border-right: none;
        border-top: 1px solid @border-light;
        padding: 0 20px;
    }

    .sidebar-menu {
        flex-direction: row;
        width: 100%;
        justify-content: space-around;
    }

    .sidebar-footer {
        display: none;
    }

    .content-area {
        margin-left: 0;
        padding: 16px;
        padding-bottom: 90px;
    }

    /* Mobile adaptation for logs view is now handled by the general flex layout,
       but we can adjust padding if needed */
    .logs-view-container {
        /* On mobile, content margin might be different.
           If sidebar changes to top nav, height calc might need adjustment.
           For now assuming similar layout logic or letting it fall back.
        */
        height: calc(100vh - 106px); /* Keeping the old logic for mobile specific height if needed */
    }
}

// Media query: Desktop (>=768px)
@media (min-width: 768px) {
    .mobile-only {
        display: none !important;
    }
}

.clickable-version,
.version-align {
    display: inline-flex;
    align-items: center;
    gap: 0;
}

.clickable-version {
    cursor: pointer;
    transition: color 0.2s;

    &:hover {
        color: @primary-color;

        .copy-icon {
            opacity: 1;
        }
    }
}

.copy-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 4px;
}
</style>

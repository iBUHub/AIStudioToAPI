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
                                        style="margin-right: 6px"
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
                                        style="margin-right: 6px"
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
                                        style="margin-right: 6px"
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
                                        style="margin-right: 6px"
                                    >
                                        <line x1="18" y1="20" x2="18" y2="10"></line>
                                        <line x1="12" y1="20" x2="12" y2="4"></line>
                                        <line x1="6" y1="20" x2="6" y2="14"></line>
                                    </svg>
                                    {{ t("usageCount") }}
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
                                        style="margin-right: 6px"
                                    >
                                        <path
                                            d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"
                                        ></path>
                                        <line x1="12" y1="9" x2="12" y2="13"></line>
                                        <line x1="12" y1="17" x2="12.01" y2="17"></line>
                                    </svg>
                                    {{ t("consecutiveFailures") }}
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
                                        style="margin-right: 6px"
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
                                        style="margin-right: 6px"
                                    >
                                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                                    </svg>
                                    {{ t("dedupedAvailable") }}
                                </span>
                                <span class="value">{{ dedupedAvailableCount }}</span>
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
                                    {{ t("forceThinking") }}
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
                                    {{ t("forceWebSearch") }}
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
                                    {{ t("forceUrlContext") }}
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
                                        <path
                                            d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"
                                        ></path>
                                    </svg>
                                    {{ t("apiKey") }}
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
                                accept=".json"
                                multiple
                                @change="handleFileUpload"
                            />
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
                                :class="{ 'is-current': item.index === state.currentAuthIndex }"
                            >
                                <el-tooltip
                                    :content="getAccountDisplayName(item)"
                                    placement="top"
                                    effect="dark"
                                    :hide-after="0"
                                >
                                    <div class="account-info" style="cursor: pointer">
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
                                    </div>
                                </el-tooltip>
                                <div class="account-actions">
                                    <button
                                        class="btn-switch"
                                        :class="{ 'is-active': item.index === state.currentAuthIndex }"
                                        :disabled="isBusy || item.index === state.currentAuthIndex"
                                        :title="
                                            item.index === state.currentAuthIndex
                                                ? t('currentAccount')
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
                                    <el-tooltip :content="t('copy')" placement="top">
                                        <span class="clickable-version" @click="copyAppVersion">
                                            {{ appVersion }}
                                        </span>
                                    </el-tooltip>
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
                                    {{ t("latestVersion") }}
                                </span>
                                <span class="value">
                                    <a
                                        v-if="state.hasUpdate"
                                        :href="state.releaseUrl || 'https://github.com/iBUHub/AIStudioToAPI/releases'"
                                        target="_blank"
                                        class="update-link"
                                        :title="t('newVersionAvailable')"
                                    >
                                        {{ latestVersionFormatted }}
                                    </a>
                                    <a
                                        v-else
                                        href="https://github.com/iBUHub/AIStudioToAPI/releases"
                                        target="_blank"
                                        style="color: inherit; text-decoration: none"
                                    >
                                        {{ latestVersionFormatted }}
                                    </a>
                                </span>
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
                                        style="margin-right: 6px"
                                    >
                                        <line x1="8" y1="6" x2="21" y2="6"></line>
                                        <line x1="8" y1="12" x2="21" y2="12"></line>
                                        <line x1="8" y1="18" x2="21" y2="18"></line>
                                        <line x1="3" y1="6" x2="3.01" y2="6"></line>
                                        <line x1="3" y1="12" x2="3.01" y2="12"></line>
                                        <line x1="3" y1="18" x2="3.01" y2="18"></line>
                                    </svg>
                                    {{ t("logLevel") }}
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
                                        style="margin-right: 6px"
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
                                        style="margin-right: 6px"
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
                                        style="margin-right: 6px"
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
                        </div>
                    </div>
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
                    <pre id="log-container">{{ state.logs }}</pre>
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
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watchEffect } from "vue";
import { useRouter } from "vue-router";
import { ElMessage, ElMessageBox, ElNotification } from "element-plus";
import I18n from "../utils/i18n";
import { useTheme } from "../utils/useTheme";

const router = useRouter();
const fileInput = ref(null);
const activeTab = ref("home");

// Create reactive version counter
const langVersion = ref(0);

// Translation function that tracks language changes
const t = (key, options) => {
    langVersion.value; // Access to track changes
    return I18n.t(key, options);
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
    apiKeySource: "",
    browserConnected: false,
    currentAuthIndex: -1,
    currentLang: I18n.getLang(),
    debugModeEnabled: false,
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
    logs: t("loading"),
    logScrollTop: 0,
    releaseUrl: null,
    serviceConnected: false,
    streamingModeReal: false,
    // theme: handled by useTheme
    usageCount: 0,
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

// Total scanned accounts count
const totalScannedCount = computed(() => state.accountDetails.length);

// Deduped available accounts count (excluding duplicates and invalid)
const dedupedAvailableCount = computed(() => {
    return state.accountDetails.filter(acc => !acc.isDuplicate && !acc.isInvalid).length;
});

const isBusy = computed(() => state.isSwitchingAccount || state.isSystemBusy);

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

const copyAppVersion = async () => {
    try {
        await navigator.clipboard.writeText(appVersion.value);
        ElMessage.success(t("copySuccess"));
    } catch (err) {
        ElMessage.error(t("copyFailed"));
        console.error("Failed to copy version:", err);
    }
};

const updateStatus = data => {
    state.serviceConnected = true;

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

const scheduleNextUpdate = () => {
    if (!isActive) {
        return;
    }
    const randomInterval = 4000 + Math.floor(Math.random() * 3000);
    updateTimer = setTimeout(() => {
        updateContent().finally(scheduleNextUpdate);
    }, randomInterval);
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

    // Helper function to read a single file
    const readFile = file =>
        new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve({ content: e.target.result, name: file.name });
            reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
            reader.readAsText(file);
        });

    // Helper function to upload a single file
    const uploadFile = async fileData => {
        try {
            const parsed = JSON.parse(fileData.content);
            const res = await fetch("/api/files", {
                body: JSON.stringify({ content: parsed }),
                headers: { "Content-Type": "application/json" },
                method: "POST",
            });
            if (res.ok) {
                const data = await res.json();
                return { filename: data.filename || fileData.name, success: true };
            }
            const data = await res.json();
            return { error: data.error || "Unknown error", filename: fileData.name, success: false };
        } catch (err) {
            return { error: "Invalid JSON", filename: fileData.name, success: false };
        }
    };

    // Upload all files (single or batch, same logic)
    const successFiles = [];
    const failedFiles = [];

    for (const file of files) {
        try {
            const fileData = await readFile(file);
            const result = await uploadFile(fileData);
            if (result.success) {
                successFiles.push({ local: file.name, saved: result.filename });
            } else {
                failedFiles.push({ local: file.name, reason: result.error });
            }
        } catch (err) {
            failedFiles.push({ local: file.name, reason: err.message || "Read failed" });
        }
    }

    // Build notification message with file details
    let messageHtml = "";

    if (successFiles.length > 0) {
        messageHtml += `<div style="margin-bottom: 8px;"><strong style="color: var(--el-color-success);">${t("fileUploadBatchSuccess")} (${successFiles.length}):</strong></div>`;
        messageHtml += '<ul style="margin: 0 0 12px 16px; padding: 0;">';
        for (const f of successFiles) {
            messageHtml += `<li style="word-break: break-all;">${f.local} → ${f.saved}</li>`;
        }
        messageHtml += "</ul>";
    }

    if (failedFiles.length > 0) {
        messageHtml += `<div style="margin-bottom: 8px;"><strong style="color: var(--el-color-danger);">${t("fileUploadBatchFailed")} (${failedFiles.length}):</strong></div>`;
        messageHtml += '<ul style="margin: 0 0 0 16px; padding: 0;">';
        for (const f of failedFiles) {
            messageHtml += `<li style="word-break: break-all;">${f.local}: ${f.reason}</li>`;
        }
        messageHtml += "</ul>";
    }

    // Determine notification type
    let notifyType = "success";
    if (failedFiles.length > 0 && successFiles.length === 0) {
        notifyType = "error";
    } else if (failedFiles.length > 0) {
        notifyType = "warning";
    }

    // Show notification in top-right, no auto close
    // Use different title for single vs batch upload
    const notifyTitle = files.length === 1 ? t("fileUploadComplete") : t("fileUploadBatchResult");
    ElNotification({
        dangerouslyUseHTMLString: true,
        duration: 0,
        message: messageHtml,
        position: "top-right",
        title: notifyTitle,
        type: notifyType,
    });

    updateContent();
};

// Download account by index
const downloadAccountByIndex = accountIndex => {
    if (accountIndex === null || accountIndex === undefined) return;
    window.location.href = `/api/files/auth-${accountIndex}.json`;
};

// Download current logs
const downloadCurrentLogs = () => {
    if (!state.logs) return;

    const blob = new Blob([state.logs], { type: "text/plain" });
    const now = new Date();
    const YYYY = now.getFullYear();
    const MM = String(now.getMonth() + 1).padStart(2, "0");
    const DD = String(now.getDate()).padStart(2, "0");
    const HH = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const ss = String(now.getSeconds()).padStart(2, "0");

    const filename = `AIStudioProxy_${YYYY}-${MM}-${DD}_${HH}${mm}${ss}_${state.logCount}.log`;

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
        border-color: @primary-color;
        background: rgba(var(--color-primary-rgb), 0.08);
    }
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
    background: @primary-color;
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
</style>

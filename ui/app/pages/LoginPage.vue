<!--
 * File: ui/app/pages/LoginPage.vue
 * Description: Login page component for user authentication with internationalization support
 *
 * Author: Ellinav, iBenzene, bbbugg
-->

<template>
    <div class="login-page">
        <form action="/login" method="post" class="login-form">
            <button type="button" class="lang-switcher" :title="t('switchLanguage')" @click="toggleLanguage">
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
            <div class="login-content">
                <h2 class="login-title">
                    {{ t("loginHeading") }}
                </h2>
                <div>
                    <input type="password" name="apiKey" :placeholder="t('apiKeyPlaceholder')" required autofocus />
                </div>
                <div>
                    <button type="submit">
                        {{ t("loginBtn") }}
                    </button>
                </div>
            </div>
            <p v-if="errorText" class="error">
                {{ errorText }}
            </p>
        </form>
    </div>
</template>

<script setup>
import { computed, onMounted, ref, watchEffect } from "vue";
import { useRoute } from "vue-router";
import I18n from "../utils/i18n";
import { useTheme } from "../utils/useTheme";

const route = useRoute();

// Create reactive version counter
const langVersion = ref(0);

// Listen for language changes
const onLangChange = () => {
    langVersion.value++;
};

// Initialize theme
useTheme();

onMounted(() => {
    I18n.onChange(onLangChange);
});

const t = (key, options) => {
    langVersion.value; // Access to track changes
    return I18n.t(key, options);
};

const errorText = computed(() => {
    const code = String(route.query.error || "");
    if (code === "1") {
        return t("loginErrorInvalidKey");
    }
    if (code === "2") {
        return t("loginErrorRateLimit");
    }
    return "";
});

const toggleLanguage = async () => {
    await I18n.toggleLang();
};

watchEffect(() => {
    document.title = t("loginTitle");
});
</script>

<style lang="less" scoped>
@import "../styles/variables.less";

.login-page {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
}

.login-content {
    width: 300px;
}

form {
    background: @background-white;
    border-radius: @border-radius-lg;
    box-shadow: @shadow-medium;
    padding: @spacing-xl;
    position: relative;
    text-align: center;
}

input {
    border: 1px solid @border-color;
    border-radius: @border-radius-sm;
    box-sizing: border-box;
    margin-top: @spacing-sm;
    padding: @spacing-sm;
    transition: all @transition-normal;
    width: 100%;

    &:focus {
        border-color: @primary-color;
        box-shadow: @shadow-focus;
        outline: none;
    }
}

button {
    align-items: center;
    background-color: @primary-color;
    border: none;
    border-radius: @border-radius-sm;
    box-sizing: border-box;
    color: @background-white;
    cursor: pointer;
    display: inline-flex;
    font-size: @font-size-base;
    justify-content: center;
    line-height: 1.5;
    margin-top: @spacing-lg;
    min-height: @button-min-height;
    padding: @spacing-sm;
    width: 100%;
}

.error {
    color: @error-color;
    margin-bottom: 0;
    margin-top: 25px;
}

.lang-switcher {
    align-items: center;
    background: transparent;
    border: none;
    color: @text-secondary;
    cursor: pointer;
    display: flex;
    justify-content: center;
    margin: 0;
    padding: @spacing-xs;
    position: absolute;
    right: @spacing-sm;
    top: @spacing-sm;
    transition: all @transition-fast;
    width: auto;

    &:hover {
        color: @primary-color;
        transform: scale(1.1);
    }

    svg {
        display: block;
    }
}
</style>

<!--
 * File: ui/app/App.vue
 * Description: Root Vue component that serves as the main entry point for the application router
 *
 * Author: Ellinav, iBenzene, bbbugg
-->

<template>
    <el-config-provider :locale="elementLocale">
        <router-view />
    </el-config-provider>
</template>

<script setup>
import { computed, ref } from "vue";
import en from "element-plus/es/locale/lang/en";
import zhCn from "element-plus/es/locale/lang/zh-cn";
import I18n from "./utils/i18n";

const currentLang = ref(I18n.getLang());

I18n.onChange(lang => {
    currentLang.value = lang;
});

const elementLocale = computed(() => (currentLang.value === "zh" ? zhCn : en));
</script>

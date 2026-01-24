/**
 * File: ui/app/utils/useTheme.js
 * Description: Composable for managing application theme state (light/dark/auto)
 */

import { ref, watchEffect } from 'vue';

const theme = ref(localStorage.getItem('theme') || 'auto');
const systemDarkMode = ref(window.matchMedia('(prefers-color-scheme: dark)').matches);

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    systemDarkMode.value = e.matches;
});

/**
 * Global theme application logic.
 * Handles:
 * 1. data-theme attribute for CSS variables
 * 2. class="dark" for Element Plus
 * 3. localStorage persistence
 *
 * Defined at module level to ensure it runs as a singleton,
 * preventing duplicate watchers if useTheme is called multiple times.
 */
watchEffect(() => {
    const currentTheme = theme.value;
    const htmlEl = document.documentElement;

    // Determine effective theme
    let isDark = false;
    if (currentTheme === 'auto') {
        isDark = systemDarkMode.value;
    } else {
        isDark = currentTheme === 'dark';
    }

    // Apply to DOM
    htmlEl.setAttribute('data-theme', isDark ? 'dark' : 'light');
    if (isDark) {
        htmlEl.classList.add('dark');
    } else {
        htmlEl.classList.remove('dark');
    }

    localStorage.setItem('theme', currentTheme);
});

export function useTheme() {
    const setTheme = newTheme => {
        theme.value = newTheme;
    };

    return {
        setTheme,
        theme,
    };
}

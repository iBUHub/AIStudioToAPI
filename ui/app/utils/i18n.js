/**
 * File: ui/app/utils/i18n.js
 * Description: Internationalization utility for managing multiple languages in the client-side application
 *
 * Author: Ellinav, iBenzene, bbbugg
 */

const supportedLangs = new Set(['en', 'zh']);
const fallbackLang = 'en';
const localesCache = {};
const listeners = [];
let initialized = false;

let currentLang = (() => {
    const saved = (localStorage.getItem('lang') || '').slice(0, 2).toLowerCase();
    if (supportedLangs.has(saved)) {
        return saved;
    }
    const browserLang = (navigator.language || '').slice(0, 2).toLowerCase();
    return supportedLangs.has(browserLang) ? browserLang : fallbackLang;
})();

// Reactive state for Vue components
const state = {
    lang: currentLang,
    version: 0,
};

const normalizeLang = lang => (supportedLangs.has(lang) ? lang : fallbackLang);

const loadLocale = async lang => {
    const normalized = normalizeLang(lang);
    if (localesCache[normalized]) {
        return localesCache[normalized];
    }
    try {
        const res = await fetch(`/locales/${normalized}.json`);
        if (!res.ok) {
            throw new Error(`Failed to load locale ${normalized}`);
        }
        const data = await res.json();
        localesCache[normalized] = data;
        return data;
    } catch (err) {
        console.warn('[i18n] Locale load failed:', err);
        localesCache[normalized] = {};
        return localesCache[normalized];
    }
};

const applyDomTranslations = lang => {
    const langData = localesCache[lang] || {};
    document.documentElement.lang = lang;

    const setText = (el, key) => {
        if (Object.prototype.hasOwnProperty.call(langData, key)) {
            el.textContent = langData[key];
        }
    };
    const setAttr = (el, key, attrName) => {
        if (Object.prototype.hasOwnProperty.call(langData, key)) {
            el.setAttribute(attrName, langData[key]);
        }
    };

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        setText(el, key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        setAttr(el, key, 'placeholder');
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        setAttr(el, key, 'title');
    });
};

const notifyListeners = lang => {
    listeners.forEach(cb => {
        try {
            cb(lang);
        } catch (err) {
            console.warn('[i18n] Listener error:', err);
        }
    });
};

const setLang = async lang => {
    const normalized = normalizeLang(lang);
    currentLang = normalized;
    state.lang = normalized;
    state.version++;

    localStorage.setItem('lang', normalized);
    await loadLocale(normalized);

    applyDomTranslations(normalized);
    notifyListeners(normalized);

    return normalized;
};

const init = async () => {
    await loadLocale(fallbackLang);
    await setLang(currentLang);
    initialized = true;
    return currentLang;
};

const t = (key, options) => {
    const langData = localesCache[currentLang] || {};
    let text = langData[key] || (options && options.fallback) || key;

    if (typeof options === 'object' && options !== null) {
        text = text.replace(/\{(\w+)}/g, (match, placeholder) =>
            options[placeholder] !== undefined ? options[placeholder] : match
        );
    }

    return text;
};

const toggleLang = () => setLang(currentLang === 'en' ? 'zh' : 'en');
const onChange = cb => {
    if (typeof cb === 'function') {
        listeners.push(cb);
    }
};

const I18n = {
    applyI18n: () => applyDomTranslations(currentLang),
    getLang: () => currentLang,
    init,
    isInitialized: () => initialized,
    onChange,
    setLang,
    state,
    t,
    toggleLang,
};

// For backward compatibility with window.I18n
if (typeof window !== 'undefined') {
    window.I18n = I18n;
}

export default I18n;

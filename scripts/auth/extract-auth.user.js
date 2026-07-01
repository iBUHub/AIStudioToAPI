// ==UserScript==
// @name         AI Studio Auth Extractor
// @author       xjetry
// @namespace    https://github.com/iBUHub/AIStudioToAPI
// @version      2.1.0
// @description  一键提取 Google AI Studio 认证信息（最小化），保存为 {email}.json
// @match        https://aistudio.google.com/*
// @grant        GM_cookie
// @run-at       document-idle
// @noframes
// ==/UserScript==

/**
 * 使用前请在 Tampermonkey 中完成以下设置（仅需一次）：
 *
 * 1. 点击 Tampermonkey 图标 → 管理面板 → 设置
 * 2. 将「配置模式」切换为「高级」
 * 3. 找到「安全」区域 → 将「允许脚本访问 Cookie」设置为「All」
 * 4. 保存设置并刷新 AI Studio 页面
 *
 * 原因：核心认证 Cookie（如 __Secure-1PSID）标记了 httpOnly，
 *       浏览器禁止 JS 直接读取。上述设置授权 Tampermonkey 的
 *       GM_cookie API 读取这些 httpOnly Cookie。
 */

(function () {
    "use strict";

    const AUTH_COOKIE_NAMES = new Set([
        "SID",                  // 主会话
        "HSID",                 // HTTP 会话绑定
        "SSID",                 // Secure 会话绑定
        "SAPISID",              // SAPISIDHASH 计算
        "SIDCC",                // consent
        "__Secure-1PSID",       // HTTPS 主会话
        "__Secure-1PAPISID",    // HTTPS API 认证
        "__Secure-1PSIDCC",     // HTTPS consent
        "__Secure-1PSIDTS",     // 会话时间戳
    ]);

    function mapSameSite(v) {
        if (v === "lax") return "Lax";
        if (v === "strict") return "Strict";
        return "None";
    }

    function normalizeCookie(c) {
        return {
            name: c.name,
            value: c.value,
            domain: c.domain,
            path: c.path || "/",
            expires: c.expirationDate != null ? c.expirationDate : -1,
            httpOnly: !!c.httpOnly,
            secure: !!c.secure,
            sameSite: mapSameSite(c.sameSite),
        };
    }

    function extractEmail() {
        const re = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
        for (const el of document.querySelectorAll('script[type="application/json"]')) {
            const m = (el.textContent || "").match(re);
            if (m) return m[0];
        }
        return null;
    }

    function listCookies() {
        return new Promise((resolve, reject) => {
            if (typeof GM_cookie === "undefined" || !GM_cookie || !GM_cookie.list) {
                return reject(new Error("GM_cookie 不可用"));
            }
            GM_cookie.list({}, (cookies, error) => {
                error ? reject(new Error(String(error))) : resolve(cookies || []);
            });
        });
    }

    function downloadJSON(data, filename) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
    }

    async function extract() {
        // 1. cookies — 只保留 .google.com 域下的核心 auth cookies
        const all = await listCookies();
        const cookies = all
            .filter(c => AUTH_COOKIE_NAMES.has(c.name) && (c.domain || "").includes(".google.com"))
            .map(normalizeCookie);

        if (!cookies.some(c => c.name === "__Secure-1PSID")) {
            throw new Error("缺少 __Secure-1PSID，请确保已登录 AI Studio。");
        }

        // 2. email
        let email = extractEmail();
        if (!email) {
            email = prompt("未检测到邮箱，请输入：");
            if (!email) return null;
        }

        // 3. 构建最小 storageState（空 localStorage 即可）
        return {
            email,
            state: {
                accountName: email,
                cookies,
                origins: [{ origin: "https://aistudio.google.com", localStorage: [] }],
            },
            count: cookies.length,
        };
    }

    // ---- UI ----

    const btn = document.createElement("button");
    btn.textContent = "\u{1F4E6} Extract Auth";
    Object.assign(btn.style, {
        position: "fixed",
        bottom: "20px",
        right: "20px",
        zIndex: "99999",
        padding: "10px 18px",
        background: "#1a73e8",
        color: "#fff",
        border: "none",
        borderRadius: "24px",
        fontSize: "14px",
        fontWeight: "500",
        cursor: "pointer",
        boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
        fontFamily: "Google Sans, Roboto, Arial, sans-serif",
        transition: "all 0.2s",
    });

    btn.onmouseenter = () => ((btn.style.background = "#1557b0"), (btn.style.transform = "translateY(-1px)"));
    btn.onmouseleave = () => ((btn.style.background = "#1a73e8"), (btn.style.transform = ""));

    btn.onclick = async () => {
        if (btn.disabled) return;
        btn.disabled = true;
        btn.textContent = "\u23F3 提取中...";
        try {
            const r = await extract();
            if (r) {
                downloadJSON(r.state, `${r.email}.json`);
                btn.textContent = `\u2705 ${r.count} cookies`;
                console.log(`[Auth Extractor] ${r.email}: ${r.count} cookies saved`);
            } else {
                btn.textContent = "\u274C 取消";
            }
        } catch (e) {
            btn.textContent = "\u274C 失败";
            alert(e.message);
        }
        setTimeout(() => {
            btn.textContent = "\u{1F4E6} Extract Auth";
            btn.disabled = false;
        }, 2500);
    };

    document.body.appendChild(btn);
})();

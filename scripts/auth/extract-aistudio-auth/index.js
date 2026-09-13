#!/usr/bin/env node

/**
 * extract-aistudio-auth
 *
 * 从已运行的 Chrome/Edge 浏览器中通过 CDP 提取 Google AI Studio 认证状态。
 * 输出 Playwright 兼容的 storageState JSON 文件 (auth-N.json)。
 *
 * 用法:
 *   npx extract-aistudio-auth [选项]
 *
 * 选项:
 *   -p, --port <port>      CDP 端口 (默认: 9222)
 *   -o, --output <path>    输出目录 (默认: ./configs/auth)
 *   -h, --help             显示帮助
 */

const { chromium } = require("playwright-core");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const readline = require("readline");

// --- Constants ---
const VALIDATION_LINE_THRESHOLD = 200;
const DEFAULT_CDP_PORT = 9222;
const DEFAULT_OUTPUT_DIR = path.join("configs", "auth");
const AI_STUDIO_URL_PATTERN = "aistudio.google.com";
const AI_STUDIO_LOGIN_URL = "https://aistudio.google.com";

const GOOGLE_DOMAIN_PATTERNS = [
    ".google.com",
    ".google.co.",
    ".googleapis.com",
    ".youtube.com",
    ".gstatic.com",
    ".googleusercontent.com",
    "accounts.google.com",
];

// --- Args ---
const parseArgs = () => {
    const args = process.argv.slice(2);
    const opts = { output: DEFAULT_OUTPUT_DIR, port: DEFAULT_CDP_PORT };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if ((arg === "-p" || arg === "--port") && args[i + 1]) {
            const p = parseInt(args[++i], 10);
            if (p > 0 && p < 65536) opts.port = p;
        } else if ((arg === "-o" || arg === "--output") && args[i + 1]) {
            opts.output = args[++i];
        } else if (arg === "-h" || arg === "--help") {
            printHelp();
            process.exit(0);
        }
    }
    return opts;
};

const printHelp = () => {
    console.log(`
extract-aistudio-auth - 从运行中的 Chrome 浏览器提取 Google AI Studio 认证

用法:
  npx extract-aistudio-auth [选项]

选项:
  -p, --port <port>      CDP 调试端口 (默认: 9222)
  -o, --output <path>    auth-N.json 输出目录 (默认: ./configs/auth)
  -h, --help             显示帮助

步骤:
  # 1. 运行脚本，按提示的命令启动 Chrome（使用独立配置，无需退出已有 Chrome）
  # 2. 首次使用需在调试浏览器中安装 1Password 扩展（之后复用）
  # 3. 用 1Password / passkey 登录 AI Studio，然后回到终端按回车

  npx extract-aistudio-auth
  npx extract-aistudio-auth --port 9223 --output ./my-auth
`);
};

// --- Helpers ---
const rl = () => readline.createInterface({ input: process.stdin, output: process.stdout });

const ask = prompt =>
    new Promise(resolve => {
        const r = rl();
        r.question(prompt, ans => {
            r.close();
            resolve(ans.trim());
        });
    });

const ensureDir = dirPath => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`📂 已创建目录: ${dirPath}`);
    }
};

const getNextAuthIndex = dir => {
    if (!fs.existsSync(dir)) return 0;
    const files = fs.readdirSync(dir).filter(f => /^auth-\d+\.json$/.test(f));
    if (files.length === 0) return 0;
    const indices = files.map(f => parseInt(f.match(/^auth-(\d+)\.json$/)[1], 10));
    return Math.max(...indices) + 1;
};

const isGoogleCookie = cookie => GOOGLE_DOMAIN_PATTERNS.some(p => (cookie.domain || "").includes(p));

/**
 * 通过 HTTP 请求获取 CDP WebSocket URL
 * 尝试 /json/version 和 /json/version/ 两种路径
 */
const fetchCdpWsUrl = port =>
    new Promise((resolve, reject) => {
        const paths = ["/json/version", "/json/version/"];
        let attempts = 0;

        const tryPath = urlPath => {
            const req = http.get(`http://127.0.0.1:${port}${urlPath}`, res => {
                if (res.statusCode !== 200) {
                    attempts++;
                    if (attempts < paths.length) {
                        tryPath(paths[attempts]);
                    } else {
                        reject(new Error(`CDP 端点返回状态码 ${res.statusCode}`));
                    }
                    res.resume();
                    return;
                }
                let data = "";
                res.on("data", chunk => (data += chunk));
                res.on("end", () => {
                    try {
                        const json = JSON.parse(data);
                        resolve(json.webSocketDebuggerUrl || null);
                    } catch {
                        reject(new Error("无法解析 CDP 端点响应"));
                    }
                });
            });
            req.on("error", reject);
            req.setTimeout(5000, () => {
                req.destroy();
                reject(new Error("连接超时"));
            });
        };

        tryPath(paths[0]);
    });

const CHROME_DEBUG_DIR = path.join(os.homedir(), "chrome", "profiles", "aistudio-debug");

const isFirstRun = () => {
    const extDir = path.join(CHROME_DEBUG_DIR, "Default", "Extensions");
    return !fs.existsSync(extDir) || fs.readdirSync(extDir).length === 0;
};

const showLaunchGuide = port => {
    const p = os.platform();
    const dataDir = CHROME_DEBUG_DIR;
    const firstRun = isFirstRun();

    console.log("");
    console.log("==========================================");

    if (firstRun) {
        console.log("🆕 首次使用：需要在调试浏览器中安装一次 1Password 扩展。");
        console.log("   安装后会保留在独立配置中，之后无需重复安装。");
    }

    console.log("");
    console.log("📋 复制以下命令启动 Chrome（无需退出已有 Chrome）：");
    console.log("");

    const envDataDir = "$HOME/chrome/profiles/aistudio-debug";

    if (p === "darwin") {
        console.log(
            `  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=${port} --user-data-dir=${envDataDir} --no-first-run ${AI_STUDIO_LOGIN_URL}`
        );
    } else if (p === "win32") {
        console.log("  cmd:");
        console.log(
            `    start chrome --remote-debugging-port=${port} --user-data-dir="%USERPROFILE%\\chrome\\profiles\\aistudio-debug" --no-first-run ${AI_STUDIO_LOGIN_URL}`
        );
        console.log("");
        console.log("  PowerShell:");
        console.log(
            `    Start-Process chrome --ArgumentList "--remote-debugging-port=${port}","--user-data-dir=$env:USERPROFILE\\chrome\\profiles\\aistudio-debug","--no-first-run","${AI_STUDIO_LOGIN_URL}"`
        );
    } else {
        console.log(
            `  google-chrome --remote-debugging-port=${port} --user-data-dir=${envDataDir} --no-first-run ${AI_STUDIO_LOGIN_URL}`
        );
    }

    if (firstRun) {
        console.log("");
        console.log("   ⬆️  启动后请先安装 1Password 扩展（仅首次）：");
        console.log("   https://chromewebstore.google.com/detail/1password/aeblfdkhhhdcdjpifhhbdiojplfjncoa");
        console.log("   安装并登录 1Password 后，再用它登录 AI Studio。");
    } else {
        console.log("");
        console.log("   启动后用 1Password / passkey 登录 Google AI Studio。");
    }

    console.log("==========================================");
    console.log("");
};

// --- Main ---
(async () => {
    const opts = parseArgs();

    showLaunchGuide(opts.port);

    await ask('▶️  确认浏览器已启动并登录 AI Studio 后，按 "回车键" 继续...\n');

    // --- Connect ---
    console.log(`🔗 正在连接浏览器 (端口 ${opts.port})...`);

    let browser;
    try {
        // 先尝试手动发现 WebSocket URL，再通过 ws:// 连接
        let wsUrl;
        try {
            wsUrl = await fetchCdpWsUrl(opts.port);
        } catch {
            // 发现失败，回退到默认方式
        }

        if (wsUrl) {
            console.log(`   -> 发现 CDP WebSocket: ${wsUrl}`);
            browser = await chromium.connectOverCDP(wsUrl);
        } else {
            browser = await chromium.connectOverCDP(`http://127.0.0.1:${opts.port}`);
        }
    } catch (error) {
        console.error("");
        console.error("❌ 无法连接到浏览器调试端口。");
        if (error.message.includes("ECONNREFUSED")) {
            console.error("   原因：连接被拒绝。请确保浏览器已使用 --remote-debugging-port 参数启动。");
        } else {
            console.error(`   错误: ${error.message}`);
        }
        console.error("");
        console.error("   提示：启动前需要先完全退出浏览器，然后使用调试端口参数重新启动。");
        process.exit(1);
    }

    console.log("✅ 已连接到浏览器。");

    try {
        // --- Find AI Studio tab ---
        console.log("🔍 正在查找 AI Studio 标签页...");

        let targetPage = null;
        let targetContext = null;

        for (const ctx of browser.contexts()) {
            for (const page of ctx.pages()) {
                try {
                    if (page.url().includes(AI_STUDIO_URL_PATTERN)) {
                        targetPage = page;
                        targetContext = ctx;
                        break;
                    }
                } catch {
                    /* page navigating */
                }
            }
            if (targetPage) break;
        }

        if (!targetPage) {
            console.error("❌ 未找到 AI Studio 标签页。");
            console.error("   当前打开的标签页：");
            for (const ctx of browser.contexts()) {
                for (const page of ctx.pages()) {
                    try {
                        const title = await page.title().catch(() => "?");
                        console.error(`     - ${title} | ${page.url()}`);
                    } catch {
                        /* skip */
                    }
                }
            }
            console.error("\n   请在浏览器中打开 https://aistudio.google.com 并登录后重试。");
            process.exit(1);
        }

        console.log(`✅ 找到 AI Studio 标签页: ${await targetPage.title().catch(() => "")}`);

        // --- Cookies (通过 CDP 获取浏览器全部 cookies) ---
        console.log("🍪 正在提取 cookies...");
        let cookies = [];
        try {
            const cdpSession = await targetContext.newCDPSession(targetPage);
            const { cookies: allCdpCookies } = await cdpSession.send("Network.getAllCookies");
            await cdpSession.detach();

            // 转换 CDP cookie 格式为 Playwright storageState 格式
            const allCookies = allCdpCookies.map(c => ({
                domain: c.domain,
                expires: c.expires,
                httpOnly: c.httpOnly,
                name: c.name,
                path: c.path,
                sameSite: c.sameSite === "none" ? "None" : c.sameSite === "lax" ? "Lax" : "Strict",
                secure: c.secure,
                value: c.value,
            }));
            cookies = allCookies.filter(isGoogleCookie);
            console.log(`   共 ${allCookies.length} 个，过滤后保留 ${cookies.length} 个 Google cookies。`);
        } catch (e) {
            console.warn(`⚠️  CDP 获取 cookies 失败，回退到 context.cookies(): ${e.message}`);
            const allCookies = await targetContext.cookies();
            cookies = allCookies.filter(isGoogleCookie);
            console.log(`   共 ${allCookies.length} 个，过滤后保留 ${cookies.length} 个 Google cookies。`);
        }

        // --- localStorage (通过 CDP 获取完整数据) ---
        console.log("📦 正在提取 localStorage...");
        let localStorageItems = [];
        try {
            const cdpSession = await targetContext.newCDPSession(targetPage);
            // 先通过 JS 执行获取
            const { result } = await cdpSession.send("Runtime.evaluate", {
                expression: `(() => {
                    const items = [];
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        items.push({ name: key, value: localStorage.getItem(key) });
                    }
                    return JSON.stringify(items);
                })()`,
                returnByValue: true,
            });
            await cdpSession.detach();
            localStorageItems = JSON.parse(result.value);
            console.log(`   获取到 ${localStorageItems.length} 个条目。`);
        } catch (e) {
            // 回退到 Playwright evaluate
            try {
                localStorageItems = await targetPage.evaluate(() => {
                    /* global localStorage */
                    const items = [];
                    for (let i = 0; i < localStorage.length; i++) {
                        const key = localStorage.key(i);
                        items.push({ name: key, value: localStorage.getItem(key) });
                    }
                    return items;
                });
                console.log(`   获取到 ${localStorageItems.length} 个条目。`);
            } catch (e2) {
                console.warn(`⚠️  无法提取 localStorage: ${e2.message}`);
            }
        }

        // --- Email (通过 CDP 获取页面 HTML 中的邮箱) ---
        let accountName = "unknown";
        try {
            console.log("🕵️  正在获取账号邮箱...");
            const cdpSession = await targetContext.newCDPSession(targetPage);
            const { result } = await cdpSession.send("Runtime.evaluate", {
                expression: `(() => {
                    const re = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})/;
                    const scripts = document.querySelectorAll('script[type="application/json"]');
                    for (const s of scripts) {
                        const m = s.textContent.match(re);
                        if (m) return m[0];
                    }
                    return null;
                })()`,
                returnByValue: true,
            });
            await cdpSession.detach();
            if (result.value) {
                accountName = result.value;
                console.log(`   -> 账号: ${accountName}`);
            }
        } catch (e) {
            console.warn(`⚠️  自动获取失败: ${e.message}`);
        }

        if (accountName === "unknown") {
            console.log("   -> 未能自动检测邮箱。");
            const input = await ask("请输入 Google 账号邮箱: ");
            if (input) accountName = input;
        }

        // --- Build state ---
        const state = {
            accountName,
            cookies,
            origins: [{ localStorage: localStorageItems, origin: "https://aistudio.google.com" }],
        };

        // --- Validate ---
        console.log("");
        console.log("正在验证...");
        const pretty = JSON.stringify(state, null, 2);
        const lines = pretty.split("\n").length;

        if (lines <= VALIDATION_LINE_THRESHOLD) {
            console.error(`❌ 验证失败 (${lines} 行 <= ${VALIDATION_LINE_THRESHOLD})。请确保已完全登录 AI Studio。`);
            process.exit(1);
        }

        console.log(`✅ 验证通过 (${lines} 行)。`);

        // --- Save ---
        const outputDir = path.resolve(opts.output);
        ensureDir(outputDir);
        const idx = getNextAuthIndex(outputDir);
        const fileName = `auth-${idx}.json`;
        const filePath = path.join(outputDir, fileName);

        fs.writeFileSync(filePath, JSON.stringify(state));
        console.log(`📄 已保存: ${filePath}`);
        console.log(`👤 账号: ${accountName}`);
    } finally {
        await browser.close().catch(() => {});
        console.log("\n🔌 已断开连接（浏览器不会被关闭）。");
    }

    process.exit(0);
})();

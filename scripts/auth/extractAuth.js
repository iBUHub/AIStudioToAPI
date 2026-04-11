/**
 * File: scripts/auth/extractAuth.js
 * Description: Extract authentication state from an already-running Chrome/Edge/Chromium browser via CDP (Chrome DevTools Protocol)
 *
 * Usage:
 *   1. Start Chrome with: google-chrome --remote-debugging-port=9222
 *   2. Log in to Google AI Studio in the browser (supports passkey login)
 *   3. Run: npm run extract-auth [-- --port 9222]
 */

const { chromium } = require("patchright");
const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline");

// Load environment variables from .env file
require("dotenv").config({ path: path.resolve(__dirname, "..", "..", ".env") });

// --- Configuration Constants ---
const VALIDATION_LINE_THRESHOLD = 200;
const CONFIG_DIR = "configs/auth";
const DEFAULT_CDP_PORT = 9222;
const AI_STUDIO_URL_PATTERN = "aistudio.google.com";

// Google-related cookie domain patterns
const GOOGLE_DOMAIN_PATTERNS = [
    ".google.com",
    ".google.co.",
    ".googleapis.com",
    ".youtube.com",
    ".gstatic.com",
    ".googleusercontent.com",
    "accounts.google.com",
];

// --- Language ---
let lang = "zh";
const getText = (zh, en) => (lang === "zh" ? zh : en);

/**
 * Prompt user to select language
 */
const selectLanguage = () =>
    new Promise(resolve => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        console.log("");
        console.log("==========================================");
        console.log("  please select language / please select language:");
        console.log("  1. 中文");
        console.log("  2. English");
        console.log("==========================================");

        rl.question("> ", answer => {
            rl.close();
            const trimmed = answer.trim();
            if (trimmed === "2" || trimmed.toLowerCase() === "en" || trimmed.toLowerCase() === "english") {
                lang = "en";
            } else {
                lang = "zh";
            }
            resolve(lang);
        });
    });

/**
 * Parse CDP port from command-line arguments or environment variable
 */
const parseCdpPort = () => {
    const args = process.argv.slice(2);
    const portArgIndex = args.findIndex(a => a === "--port" || a === "-p");
    if (portArgIndex !== -1 && args[portArgIndex + 1]) {
        const port = parseInt(args[portArgIndex + 1], 10);
        if (!isNaN(port) && port > 0 && port < 65536) return port;
    }
    const envPort = parseInt(process.env.CDP_PORT, 10);
    if (!isNaN(envPort) && envPort > 0 && envPort < 65536) return envPort;
    return DEFAULT_CDP_PORT;
};

/**
 * Ensures that the specified directory exists, creating it if it doesn't.
 */
const ensureDirectoryExists = dirPath => {
    if (!fs.existsSync(dirPath)) {
        console.log(
            getText(
                `📂 目录 "${path.basename(dirPath)}" 不存在，正在创建...`,
                `📂 Directory "${path.basename(dirPath)}" does not exist, creating...`
            )
        );
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

/**
 * Gets the next available authentication file index.
 * Always uses max existing index + 1 to ensure new auth is always the latest.
 */
const getNextAuthIndex = () => {
    const projectRoot = path.join(__dirname, "..", "..");
    const directory = path.join(projectRoot, CONFIG_DIR);

    if (!fs.existsSync(directory)) {
        return 0;
    }

    const files = fs.readdirSync(directory);
    const authFiles = files.filter(file => /^auth-\d+\.json$/.test(file));
    if (authFiles.length === 0) {
        return 0;
    }

    const indices = authFiles.map(file => parseInt(file.match(/^auth-(\d+)\.json$/)[1], 10));
    return Math.max(...indices) + 1;
};

/**
 * Check if a cookie belongs to a Google-related domain
 */
const isGoogleCookie = cookie => {
    const domain = cookie.domain || "";
    return GOOGLE_DOMAIN_PATTERNS.some(pattern => domain.includes(pattern));
};

/**
 * Display instructions for launching Chrome with remote debugging port
 */
const displayInstructions = port => {
    const platform = os.platform();
    console.log("");
    console.log("==========================================");
    console.log(
        getText(
            `📋 请确保你的 Chrome/Edge 浏览器已使用调试端口启动，并且已在浏览器中登录 Google AI Studio。`,
            `📋 Please make sure your Chrome/Edge browser is launched with the debugging port, and you are logged in to Google AI Studio.`
        )
    );
    console.log("");
    console.log(getText("启动命令示例：", "Launch command examples:"));
    console.log("");

    if (platform === "darwin") {
        console.log("  Chrome:");
        console.log(
            `    /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=${port}`
        );
        console.log("");
        console.log("  Edge:");
        console.log(
            `    /Applications/Microsoft\\ Edge.app/Contents/MacOS/Microsoft\\ Edge --remote-debugging-port=${port}`
        );
    } else if (platform === "win32") {
        console.log("  Chrome:");
        console.log(`    chrome.exe --remote-debugging-port=${port}`);
        console.log("");
        console.log("  Edge:");
        console.log(`    msedge.exe --remote-debugging-port=${port}`);
    } else {
        console.log("  Chrome:");
        console.log(`    google-chrome --remote-debugging-port=${port}`);
        console.log("");
        console.log("  Chromium:");
        console.log(`    chromium-browser --remote-debugging-port=${port}`);
    }

    console.log("");
    console.log(
        getText(
            `⚠️  注意：启动前需要先完全退出浏览器（不仅仅是关闭窗口），然后使用上述命令重新启动。`,
            `⚠️  Note: You must fully quit the browser first (not just close windows), then relaunch with the command above.`
        )
    );
    console.log("==========================================");
    console.log("");
};

/**
 * Wait for user to press Enter
 */
const waitForEnter = prompt =>
    new Promise(resolve => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        rl.question(prompt, () => {
            rl.close();
            resolve();
        });
    });

/**
 * Prompt user to manually input email
 */
const promptForEmail = () =>
    new Promise(resolve => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        rl.question(getText("请输入 Google 账号邮箱地址: ", "Please enter Google account email: "), answer => {
            rl.close();
            resolve(answer.trim() || "unknown");
        });
    });

// ==================== Main ====================

(async () => {
    await selectLanguage();

    const cdpPort = parseCdpPort();
    const projectRoot = path.join(__dirname, "..", "..");
    const configDirPath = path.join(projectRoot, CONFIG_DIR);

    displayInstructions(cdpPort);

    await waitForEnter(
        getText(
            '▶️  确认浏览器已启动并登录 AI Studio 后，按 "回车键" 继续...',
            '▶️  After confirming the browser is running and logged into AI Studio, press "Enter" to continue...'
        )
    );

    // --- Step 1: Connect via CDP ---
    console.log(
        getText(`🔗 正在连接到浏览器 (CDP 端口: ${cdpPort})...`, `🔗 Connecting to browser (CDP port: ${cdpPort})...`)
    );

    let browser;
    try {
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
    } catch (error) {
        console.error("");
        console.error(
            getText(
                `❌ 无法连接到浏览器的调试端口 (${cdpPort})。`,
                `❌ Failed to connect to browser debugging port (${cdpPort}).`
            )
        );

        if (error.message.includes("ECONNREFUSED")) {
            console.error(
                getText(
                    "   原因：连接被拒绝。请确保浏览器已使用 --remote-debugging-port 参数启动。",
                    "   Reason: Connection refused. Make sure the browser is launched with --remote-debugging-port flag."
                )
            );
        } else {
            console.error(getText(`   错误: ${error.message}`, `   Error: ${error.message}`));
        }

        console.error("");
        console.error(
            getText(
                "   提示：启动前需要先完全退出浏览器，然后使用调试端口参数重新启动。",
                "   Tip: Fully quit the browser first, then relaunch with the debugging port flag."
            )
        );
        process.exit(1);
    }

    console.log(getText("✅ 已成功连接到浏览器。", "✅ Successfully connected to the browser."));

    try {
        // --- Step 2: Find AI Studio page ---
        console.log(getText("🔍 正在查找 AI Studio 标签页...", "🔍 Searching for AI Studio tab..."));

        let targetPage = null;
        let targetContext = null;
        const contexts = browser.contexts();

        for (const context of contexts) {
            const pages = context.pages();
            for (const page of pages) {
                try {
                    const url = page.url();
                    if (url.includes(AI_STUDIO_URL_PATTERN)) {
                        targetPage = page;
                        targetContext = context;
                        break;
                    }
                } catch {
                    // Page might be navigating or closed
                }
            }
            if (targetPage) break;
        }

        if (!targetPage) {
            console.error("");
            console.error(getText("❌ 未找到 AI Studio 标签页。", "❌ No AI Studio tab found."));

            // List available tabs
            console.error(getText("   当前打开的标签页：", "   Currently open tabs:"));
            for (const context of contexts) {
                for (const page of context.pages()) {
                    try {
                        const url = page.url();
                        const title = await page.title().catch(() => "(unknown)");
                        console.error(`     - ${title} | ${url}`);
                    } catch {
                        // skip
                    }
                }
            }

            console.error("");
            console.error(
                getText(
                    "   请在浏览器中打开 https://aistudio.google.com 并登录后重试。",
                    "   Please open https://aistudio.google.com in the browser, log in, and try again."
                )
            );
            process.exit(1);
        }

        const pageUrl = targetPage.url();
        const pageTitle = await targetPage.title().catch(() => "(unknown)");
        console.log(
            getText(
                `✅ 找到 AI Studio 标签页: ${pageTitle} (${pageUrl})`,
                `✅ Found AI Studio tab: ${pageTitle} (${pageUrl})`
            )
        );

        // --- Step 3: Extract cookies ---
        console.log(getText("🍪 正在提取 cookies...", "🍪 Extracting cookies..."));
        const allCookies = await targetContext.cookies();
        const googleCookies = allCookies.filter(isGoogleCookie);
        console.log(
            getText(
                `   -> 共 ${allCookies.length} 个 cookies，过滤后保留 ${googleCookies.length} 个 Google 相关 cookies。`,
                `   -> Total ${allCookies.length} cookies, kept ${googleCookies.length} Google-related cookies after filtering.`
            )
        );

        // --- Step 4: Extract localStorage ---
        console.log(getText("📦 正在提取 localStorage...", "📦 Extracting localStorage..."));
        let localStorageItems = [];
        try {
            /* eslint-disable no-undef -- runs in browser context via Playwright */
            localStorageItems = await targetPage.evaluate(() => {
                const items = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    items.push({ name: key, value: localStorage.getItem(key) });
                }
                return items;
            });
            /* eslint-enable no-undef */
            console.log(
                getText(
                    `   -> 获取到 ${localStorageItems.length} 个 localStorage 条目。`,
                    `   -> Retrieved ${localStorageItems.length} localStorage entries.`
                )
            );
        } catch (error) {
            console.warn(
                getText(
                    `⚠️  无法提取 localStorage: ${error.message}`,
                    `⚠️  Failed to extract localStorage: ${error.message}`
                )
            );
        }

        // --- Step 5: Extract account email ---
        let accountName = "unknown";
        try {
            console.log(getText("🕵️  正在尝试获取账号名称...", "🕵️  Attempting to retrieve account name..."));

            const scriptLocators = targetPage.locator('script[type="application/json"]');
            const count = await scriptLocators.count();
            const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;

            for (let i = 0; i < count; i++) {
                const content = await scriptLocators.nth(i).textContent();
                if (content) {
                    const match = content.match(emailRegex);
                    if (match && match[0]) {
                        accountName = match[0];
                        console.log(
                            getText(
                                `   -> 成功获取账号: ${accountName}`,
                                `   -> Successfully retrieved account: ${accountName}`
                            )
                        );
                        break;
                    }
                }
            }
        } catch (error) {
            console.warn(
                getText(
                    `⚠️  自动获取账号名称失败: ${error.message}`,
                    `⚠️  Failed to automatically retrieve account name: ${error.message}`
                )
            );
        }

        if (accountName === "unknown") {
            console.log(
                getText("   -> 未能自动检测到邮箱地址。", "   -> Could not automatically detect email address.")
            );
            accountName = await promptForEmail();
        }

        // --- Step 6: Build storage state ---
        const storageState = {
            accountName,
            cookies: googleCookies,
            origins: [
                {
                    localStorage: localStorageItems,
                    origin: "https://aistudio.google.com",
                },
            ],
        };

        // --- Step 7: Validate ---
        console.log("");
        console.log(getText("正在验证登录状态...", "Validating login state..."));
        const prettyStateString = JSON.stringify(storageState, null, 2);
        const lineCount = prettyStateString.split("\n").length;

        if (lineCount <= VALIDATION_LINE_THRESHOLD) {
            console.error(
                getText(
                    `❌ 状态验证失败 (${lineCount} 行 <= ${VALIDATION_LINE_THRESHOLD} 行)。`,
                    `❌ State validation failed (${lineCount} lines <= ${VALIDATION_LINE_THRESHOLD} lines).`
                )
            );
            console.error(
                getText(
                    "   登录状态似乎为空或无效。请确保已在浏览器中完全登录 AI Studio。",
                    "   Login state appears to be empty or invalid. Please make sure you are fully logged in to AI Studio."
                )
            );
            process.exit(1);
        }

        console.log(
            getText(
                `✅ 状态验证通过 (${lineCount} 行 > ${VALIDATION_LINE_THRESHOLD} 行)。`,
                `✅ State validation passed (${lineCount} lines > ${VALIDATION_LINE_THRESHOLD} lines).`
            )
        );

        // --- Step 8: Save ---
        ensureDirectoryExists(configDirPath);
        const newIndex = getNextAuthIndex();
        const authFileName = `auth-${newIndex}.json`;
        const authFilePath = path.join(configDirPath, authFileName);

        const compactStateString = JSON.stringify(storageState);
        fs.writeFileSync(authFilePath, compactStateString);

        console.log(
            getText(
                `   📄 认证文件已保存到: ${path.join(CONFIG_DIR, authFileName)}`,
                `   📄 Authentication file saved to: ${path.join(CONFIG_DIR, authFileName)}`
            )
        );
        console.log(getText(`   👤 账号: ${accountName}`, `   👤 Account: ${accountName}`));
    } finally {
        // Disconnect CDP (does NOT close the user's browser)
        await browser.close().catch(() => {});
        console.log("");
        console.log(
            getText(
                "🔌 已断开浏览器连接（浏览器不会被关闭）。",
                "🔌 Disconnected from browser (browser will NOT be closed)."
            )
        );
    }

    process.exit(0);
})();

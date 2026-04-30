/**
 * File: scripts/auth/saveAuth.js
 * Description: Automated script to launch browser, extract authentication state from Google AI Studio, and save to config files
 *
 * Author: Ellinav, iBenzene, bbbugg
 */

const { firefox } = require("playwright");
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Load environment variables from .env file
require("dotenv").config({ path: path.resolve(__dirname, "..", "..", ".env") });

// Initialize language from environment variable passed by setupAuth.js
const normalizeLanguage = value => {
    const normalized = String(value || "")
        .trim()
        .toLowerCase();
    if (normalized === "2" || normalized === "en" || normalized === "english") {
        return "en";
    }
    return "zh";
};

let lang = normalizeLanguage(process.env.SETUP_AUTH_LANG || "zh");

// Bilingual text helper
const getText = (zh, en) => (lang === "zh" ? zh : en);

const parseBooleanLike = value => {
    if (value === undefined || value === null || value === "") return undefined;
    const normalized = String(value).trim().toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
    return undefined;
};

const parsePositiveInteger = (value, optionName) => {
    if (value === undefined || value === null || value === "") return undefined;
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(getText(`${optionName} 必须是正整数。`, `${optionName} must be a positive integer.`));
    }
    return parsed;
};

const readRequiredOptionValue = (args, index, optionName) => {
    const value = args[index + 1];
    if (value === undefined || value.startsWith("-")) {
        throw new Error(getText(`缺少 ${optionName} 的值。`, `Missing value for ${optionName}.`));
    }
    return value;
};

const parseCliArgs = args => {
    const options = {
        headless: undefined,
        nonInteractive: undefined,
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "-h" || arg === "--help") {
            options.help = true;
            continue;
        }
        if (arg === "--non-interactive") {
            options.nonInteractive = true;
            continue;
        }
        if (arg === "--headless") {
            options.headless = true;
            continue;
        }
        if (arg === "--headed") {
            options.headless = false;
            continue;
        }
        if (arg === "--debug-ui") {
            options.debugUi = true;
            continue;
        }
        if (arg.startsWith("--lang=")) {
            options.lang = arg.slice("--lang=".length);
            continue;
        }
        if (arg === "--lang") {
            options.lang = readRequiredOptionValue(args, i, "--lang");
            i++;
            continue;
        }
        if (arg.startsWith("--email=")) {
            options.email = arg.slice("--email=".length);
            continue;
        }
        if (arg === "--email") {
            options.email = readRequiredOptionValue(args, i, "--email");
            i++;
            continue;
        }
        if (arg.startsWith("--password=")) {
            options.password = arg.slice("--password=".length);
            continue;
        }
        if (arg === "--password") {
            options.password = readRequiredOptionValue(args, i, "--password");
            i++;
            continue;
        }
        if (arg.startsWith("--recovery-email=")) {
            options.recoveryEmail = arg.slice("--recovery-email=".length);
            continue;
        }
        if (arg === "--recovery-email") {
            options.recoveryEmail = readRequiredOptionValue(args, i, "--recovery-email");
            i++;
            continue;
        }
        if (arg.startsWith("--totp-secret=")) {
            options.totpSecret = arg.slice("--totp-secret=".length);
            continue;
        }
        if (arg === "--totp-secret") {
            options.totpSecret = readRequiredOptionValue(args, i, "--totp-secret");
            i++;
            continue;
        }
        if (arg.startsWith("--login-timeout-ms=")) {
            options.loginTimeoutMs = arg.slice("--login-timeout-ms=".length);
            continue;
        }
        if (arg === "--login-timeout-ms") {
            options.loginTimeoutMs = readRequiredOptionValue(args, i, "--login-timeout-ms");
            i++;
            continue;
        }

        throw new Error(getText(`未知参数: ${arg}`, `Unknown argument: ${arg}`));
    }

    return options;
};

const printHelp = () => {
    console.log("Usage: npm run save-auth -- [options]");
    console.log("");
    console.log("Options:");
    console.log("  -h, --help                 Show this help message");
    console.log("  --non-interactive          Exit on timeout/failure instead of waiting for Enter");
    console.log("  --lang <zh|en>             Override output language");
    console.log("  --email <email>            Auto-fill the Google account email");
    console.log("  --password <password>      Auto-fill the Google account password");
    console.log("  --recovery-email <email>   Auto-fill Google recovery email challenge");
    console.log("  --totp-secret <secret>     Auto-fill Google TOTP 2FA code using a Base32 secret");
    console.log("  --headless                 Launch Camoufox in headless mode");
    console.log("  --headed                   Force headed mode");
    console.log("  --login-timeout-ms <ms>    Override login detection timeout");
    console.log("  --debug-ui                 Dump UI diagnostics before auth export");
    console.log("");
    console.log("Environment variables:");
    console.log("  SETUP_AUTH_LANG=zh|en");
    console.log("  SETUP_AUTH_NON_INTERACTIVE=true");
    console.log("  SETUP_AUTH_HEADLESS=true");
    console.log("  SETUP_AUTH_LOGIN_TIMEOUT_MS=300000");
    console.log("  SETUP_AUTH_DEBUG_UI=true");
    console.log("  AUTO_FILL_EMAIL=<email>");
    console.log("  AUTO_FILL_PWD=<password>");
    console.log("  SETUP_AUTH_RECOVERY_EMAIL=<recovery email>");
    console.log("  SETUP_AUTH_TOTP_SECRET=<base32 secret>");
    console.log("  CAMOUFOX_EXECUTABLE_PATH=<path to camoufox executable>");
};

const cliOptions = parseCliArgs(process.argv.slice(2));
if (cliOptions.help) {
    printHelp();
    process.exit(0);
}

const loginTimeoutMs =
    parsePositiveInteger(cliOptions.loginTimeoutMs ?? process.env.SETUP_AUTH_LOGIN_TIMEOUT_MS, "login-timeout-ms") ||
    300000;

const runtimeOptions = {
    autoFillEmail: cliOptions.email ?? process.env.AUTO_FILL_EMAIL,
    autoFillPwd: cliOptions.password ?? process.env.AUTO_FILL_PWD,
    debugUi: cliOptions.debugUi ?? parseBooleanLike(process.env.SETUP_AUTH_DEBUG_UI) ?? false,
    headless: cliOptions.headless ?? parseBooleanLike(process.env.SETUP_AUTH_HEADLESS) ?? false,
    lang: normalizeLanguage(cliOptions.lang ?? process.env.SETUP_AUTH_LANG),
    loginTimeoutMs,
    nonInteractive: cliOptions.nonInteractive ?? parseBooleanLike(process.env.SETUP_AUTH_NON_INTERACTIVE) ?? false,
    recoveryEmail: cliOptions.recoveryEmail ?? process.env.SETUP_AUTH_RECOVERY_EMAIL,
    totpSecret: cliOptions.totpSecret ?? process.env.SETUP_AUTH_TOTP_SECRET,
};
lang = runtimeOptions.lang;

// --- Configuration Constants ---
const getDefaultBrowserExecutablePath = () => {
    const platform = os.platform();
    if (platform === "linux") return path.join(__dirname, "..", "..", "camoufox-linux", "camoufox");
    if (platform === "win32") return path.join(__dirname, "..", "..", "camoufox", "camoufox.exe");
    if (platform === "darwin")
        return path.join(__dirname, "..", "..", "camoufox-macos", "Camoufox.app", "Contents", "MacOS", "camoufox");
    return null;
};

const browserExecutablePath = process.env.CAMOUFOX_EXECUTABLE_PATH || getDefaultBrowserExecutablePath();
const VALIDATION_LINE_THRESHOLD = 200; // Validation line threshold
const CONFIG_DIR = "configs/auth"; // Authentication files directory

const { parseProxyFromEnv } = require("../../src/utils/ProxyUtils");

/**
 * Ensures that the specified directory exists, creating it if it doesn't.
 * @param {string} dirPath - The path of the directory to check and create.
 */
const ensureDirectoryExists = dirPath => {
    if (!fs.existsSync(dirPath)) {
        console.log(
            getText(
                `📂 目录 "${path.basename(dirPath)}" 不存在，正在创建...`,
                `📂 Directory "${path.basename(dirPath)}" does not exist, creating...`
            )
        );
        fs.mkdirSync(dirPath);
    }
};

/**
 * Gets the next available authentication file index from the 'configs/auth' directory.
 * Always uses max existing index + 1 to ensure new auth is always the latest.
 * This simplifies dedup logic assumption: higher index = newer auth.
 * @returns {number} - The next available index value.
 */
const getNextAuthIndex = () => {
    const projectRoot = path.join(__dirname, "..", "..");
    const directory = path.join(projectRoot, CONFIG_DIR);

    if (!fs.existsSync(directory)) {
        return 0;
    }

    // Find max existing index and use max + 1
    const files = fs.readdirSync(directory);
    const authFiles = files.filter(file => /^auth-\d+\.json$/.test(file));
    if (authFiles.length === 0) {
        return 0;
    }

    const indices = authFiles.map(file => parseInt(file.match(/^auth-(\d+)\.json$/)[1], 10));
    return Math.max(...indices) + 1;
};

const closeBrowserSafely = async browser => {
    if (!browser) return;
    try {
        await browser.close();
    } catch {
        // ignore browser cleanup error
    }
};

const normalizeTotpSecret = secret => {
    const raw = String(secret || "").trim();
    if (!raw) return "";

    if (raw.startsWith("otpauth://")) {
        try {
            const otpUrl = new URL(raw);
            const parsedSecret = otpUrl.searchParams.get("secret");
            if (parsedSecret) return parsedSecret;
        } catch {
            // Fall back to treating the raw input as a plain secret.
        }
    }

    return raw;
};

const decodeBase32Secret = secret => {
    const sanitized = normalizeTotpSecret(secret)
        .toUpperCase()
        .replace(/\s+/g, "")
        .replace(/-/g, "")
        .replace(/=+$/g, "");

    if (!sanitized) {
        throw new Error(getText("TOTP 密钥为空。", "TOTP secret is empty."));
    }

    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = 0;
    let value = 0;
    const bytes = [];

    for (const char of sanitized) {
        const index = alphabet.indexOf(char);
        if (index === -1) {
            throw new Error(
                getText(`TOTP 密钥包含无效字符: ${char}`, `TOTP secret contains an invalid character: ${char}`)
            );
        }

        value = (value << 5) | index;
        bits += 5;

        if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }

    return Buffer.from(bytes);
};

const waitForFreshTotpWindow = async () => {
    const secondsRemaining = 30 - (Math.floor(Date.now() / 1000) % 30);
    if (secondsRemaining <= 3) {
        await new Promise(resolve => setTimeout(resolve, (secondsRemaining + 1) * 1000));
    }
};

const generateTotpCode = secret => {
    const key = decodeBase32Secret(secret);
    const counter = Math.floor(Date.now() / 1000 / 30);
    const buffer = Buffer.alloc(8);

    buffer.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    buffer.writeUInt32BE(counter >>> 0, 4);

    const hmac = crypto.createHmac("sha1", key).update(buffer).digest();
    const offset = hmac[hmac.length - 1] & 15;
    const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000;
    return String(code).padStart(6, "0");
};

const clickGoogleTransitionButtons = async (page, randomWait) => {
    const nextButton = page.locator(
        'button:has(span:text("Next")), button:has(span:text("下一步")), button:has-text("Next"), button:has-text("下一步")'
    );
    const notNowButton = page.locator(
        'button:has(span:text("Not now")), button:has(span:text("暂时不")), button:has-text("Not now"), button:has-text("暂时不")'
    );

    for (let i = 0; i < 10; i++) {
        if (await nextButton.isVisible({ timeout: 1000 })) {
            console.log(
                getText(
                    "🕵️ 检测到「下一步」按钮，正在点击以跳过说明页...",
                    "🕵️ Detected 'Next' button, clicking to skip info page..."
                )
            );
            await nextButton.click();
            await randomWait();
        } else if (await notNowButton.isVisible({ timeout: 1000 })) {
            console.log(
                getText(
                    "🕵️ 检测到「暂时不」按钮，正在点击以跳过...",
                    "🕵️ Detected 'Not now' button, clicking to skip..."
                )
            );
            await notNowButton.click();
            await randomWait();
        }

        const title = await page.title();
        if (title.includes("AI Studio")) break;
        await page.waitForTimeout(1000);
    }
};

const acceptAiStudioTermsIfPresent = async (page, randomWait, options = {}) => {
    const maxRounds = options.rounds ?? 12;
    const explicitAcceptPatterns = [/^i agree$/i, /^i accept$/i, /^agree$/i, /^accept$/i, /^(我同意|同意|接受)$/i];
    const contextualButtonPatterns = [
        /^continue$/i,
        /^ok$/i,
        /^okay$/i,
        /^got it$/i,
        /^(继续|确定|好的|知道了|完成)$/i,
    ];
    const checkboxSelector = 'input[type="checkbox"], [role="checkbox"]';
    const agreementContainerSelector = [
        '[role="dialog"]',
        '[aria-modal="true"]',
        "mat-dialog-container",
        ".mat-mdc-dialog-container",
        ".cdk-overlay-pane",
        ".mdc-dialog",
    ].join(", ");
    const termsPattern =
        /google api terms|terms of service|additional terms|privacy policy|\bterms\b|agree to|accept.*terms|条款|协议|政策|隐私|同意/i;

    const normalizeControlText = value =>
        String(value || "")
            .replace(/\s+/g, " ")
            .trim();

    const getControlLabel = async control => {
        const text = await control.textContent({ timeout: 300 }).catch(() => "");
        const ariaLabel = await control.getAttribute("aria-label").catch(() => "");
        const value = await control.getAttribute("value").catch(() => "");
        return normalizeControlText(text || ariaLabel || value);
    };

    const clickAgreementControl = async control => {
        try {
            if (!(await control.isVisible({ timeout: 300 }))) return false;
            if (await control.isDisabled().catch(() => false)) return false;
            await control.scrollIntoViewIfNeeded().catch(() => {});
            console.log(
                getText(
                    "🕵️ 检测到 AI Studio 首次协议弹窗，正在自动点击确认按钮...",
                    "🕵️ Detected an AI Studio first-run agreement dialog. Clicking the confirmation button..."
                )
            );
            await control.click({ timeout: 5000 });
            await randomWait();
            return true;
        } catch {
            return false;
        }
    };

    const ensureCheckboxChecked = async checkbox => {
        try {
            const role = await checkbox.getAttribute("role").catch(() => null);
            const checked =
                role === "checkbox"
                    ? (await checkbox.getAttribute("aria-checked").catch(() => "")) === "true"
                    : await checkbox.isChecked().catch(() => false);
            if (!checked) {
                await checkbox.scrollIntoViewIfNeeded().catch(() => {});
                await checkbox.click({ timeout: 5000 });
                await randomWait();
            }
            return true;
        } catch {
            return false;
        }
    };

    const clickMatchingButton = async (container, patterns) => {
        for (const pattern of patterns) {
            const button = container.getByRole("button", { name: pattern }).first();
            if (await clickAgreementControl(button)) return true;
        }

        const controls = container.locator('button, [role="button"], input[type="button"], input[type="submit"]');
        const controlCount = await controls.count().catch(() => 0);
        for (let i = 0; i < Math.min(controlCount, 30); i++) {
            const control = controls.nth(i);
            const label = await getControlLabel(control);
            if (!label || !patterns.some(pattern => pattern.test(label))) continue;
            if (await clickAgreementControl(control)) return true;
        }

        return false;
    };

    const processContainer = async (container, fallbackText) => {
        let containerText = fallbackText || "";
        try {
            containerText = (await container.textContent({ timeout: 500 })) || containerText;
        } catch {
            // Some containers may detach while the page is settling.
        }

        const looksLikeTerms = termsPattern.test(containerText);
        const checkboxes = container.locator(checkboxSelector);
        const checkboxCount = await checkboxes.count().catch(() => 0);

        if (!looksLikeTerms && checkboxCount === 0) {
            return clickMatchingButton(container, explicitAcceptPatterns);
        }

        for (let i = 0; i < Math.min(checkboxCount, 3); i++) {
            const checkbox = checkboxes.nth(i);
            try {
                if (await checkbox.isVisible({ timeout: 200 })) {
                    await ensureCheckboxChecked(checkbox);
                }
            } catch {
                // Keep going if one checkbox becomes detached.
            }
        }

        if (await clickMatchingButton(container, explicitAcceptPatterns)) return true;
        return clickMatchingButton(container, contextualButtonPatterns);
    };

    for (let round = 0; round < maxRounds; round++) {
        for (const frame of page.frames()) {
            let bodyText = "";
            try {
                bodyText = (await frame.locator("body").textContent({ timeout: 500 })) || "";
            } catch {
                // Ignore detached/cross-origin frames and continue scanning others.
            }

            const containers = frame.locator(agreementContainerSelector);
            const containerCount = await containers.count().catch(() => 0);
            for (let i = 0; i < Math.min(containerCount, 6); i++) {
                const container = containers.nth(i);
                try {
                    if (
                        (await container.isVisible({ timeout: 200 })) &&
                        (await processContainer(container, bodyText))
                    ) {
                        return true;
                    }
                } catch {
                    // Continue scanning other containers.
                }
            }

            try {
                const body = frame.locator("body");
                if (await processContainer(body, bodyText)) {
                    return true;
                }
            } catch {
                // Continue polling for the next round.
            }
        }

        await page.waitForTimeout(1000);
    }

    return false;
};

const truncateDiagnosticText = (value, maxLength = 220) => {
    const normalized = String(value || "")
        .replace(/\s+/g, " ")
        .trim();
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
};

const logAuthUiDiagnostics = async (page, reason) => {
    if (!runtimeOptions.debugUi) return;

    console.log("");
    console.log(getText(`🔎 UI 调试: ${reason}`, `🔎 UI debug: ${reason}`));

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const debugDir = path.join(__dirname, "..", "..", "logs");
    const screenshotPath = path.join(debugDir, `auth-ui-${timestamp}.png`);
    const htmlPath = path.join(debugDir, `auth-ui-${timestamp}.html`);

    try {
        fs.mkdirSync(debugDir, { recursive: true });
        await page.screenshot({ fullPage: true, path: screenshotPath });
        fs.writeFileSync(htmlPath, await page.content());
        console.log(
            getText(
                `   -> 页面截图: ${path.relative(path.join(__dirname, "..", ".."), screenshotPath)}`,
                `   -> Screenshot: ${path.relative(path.join(__dirname, "..", ".."), screenshotPath)}`
            )
        );
        console.log(
            getText(
                `   -> 页面 HTML: ${path.relative(path.join(__dirname, "..", ".."), htmlPath)}`,
                `   -> Page HTML: ${path.relative(path.join(__dirname, "..", ".."), htmlPath)}`
            )
        );
    } catch (error) {
        console.warn(
            getText(
                `   -> 保存 UI 调试文件失败: ${error.message}`,
                `   -> Failed to save UI debug files: ${error.message}`
            )
        );
    }

    const dialogSelector = [
        '[role="dialog"]',
        '[aria-modal="true"]',
        "mat-dialog-container",
        ".mat-mdc-dialog-container",
        ".cdk-overlay-pane",
        ".mdc-dialog",
    ].join(", ");
    const controlSelector = 'button, [role="button"], input[type="button"], input[type="submit"]';
    const checkboxSelector = 'input[type="checkbox"], [role="checkbox"]';

    for (const [frameIndex, frame] of page.frames().entries()) {
        console.log(`   -> frame #${frameIndex}: ${truncateDiagnosticText(frame.url(), 180)}`);

        try {
            const bodyText = await frame.locator("body").textContent({ timeout: 500 });
            console.log(`      body: ${truncateDiagnosticText(bodyText, 320)}`);
        } catch {
            console.log("      body: <unavailable>");
        }

        const dialogs = frame.locator(dialogSelector);
        const dialogCount = await dialogs.count().catch(() => 0);
        for (let i = 0; i < Math.min(dialogCount, 8); i++) {
            const dialog = dialogs.nth(i);
            try {
                if (await dialog.isVisible({ timeout: 200 })) {
                    const text = await dialog.textContent({ timeout: 500 }).catch(() => "");
                    console.log(`      dialog[${i}]: ${truncateDiagnosticText(text, 320)}`);
                }
            } catch {
                // Ignore detached diagnostics candidates.
            }
        }

        const checkboxes = frame.locator(checkboxSelector);
        const checkboxCount = await checkboxes.count().catch(() => 0);
        let visibleCheckboxes = 0;
        for (let i = 0; i < Math.min(checkboxCount, 12); i++) {
            try {
                if (await checkboxes.nth(i).isVisible({ timeout: 100 })) visibleCheckboxes++;
            } catch {
                // Ignore detached diagnostics candidates.
            }
        }
        if (visibleCheckboxes > 0) {
            console.log(`      visible checkboxes: ${visibleCheckboxes}`);
        }

        const controls = frame.locator(controlSelector);
        const controlCount = await controls.count().catch(() => 0);
        for (let i = 0; i < Math.min(controlCount, 30); i++) {
            const control = controls.nth(i);
            try {
                if (!(await control.isVisible({ timeout: 100 }))) continue;
                const text = await control.textContent({ timeout: 300 }).catch(() => "");
                const ariaLabel = await control.getAttribute("aria-label").catch(() => "");
                const value = await control.getAttribute("value").catch(() => "");
                const label = truncateDiagnosticText(text || ariaLabel || value || "<empty>", 180);
                console.log(`      control[${i}]: ${label}`);
            } catch {
                // Ignore detached diagnostics candidates.
            }
        }
    }
};

const fillTotpInputs = async (page, code) => {
    const candidates = page.locator(
        [
            'input[autocomplete="one-time-code"]',
            'input[type="tel"]',
            'input[inputmode="numeric"]',
            'input[aria-label*="code" i]',
            'input[aria-label*="verification" i]',
            'input[aria-label*="验证码"]',
            'input[placeholder*="code" i]',
            'input[placeholder*="验证码"]',
        ].join(", ")
    );

    const visibleInputs = [];
    const count = await candidates.count();
    for (let i = 0; i < Math.min(count, 8); i++) {
        const input = candidates.nth(i);
        try {
            if ((await input.isVisible({ timeout: 250 })) && (await input.isEditable())) {
                visibleInputs.push(input);
            }
        } catch {
            // Ignore non-editable or detached candidates and continue scanning.
        }
    }

    if (visibleInputs.length === 0) return false;

    if (visibleInputs.length === 1) {
        await visibleInputs[0].fill(code);
        return true;
    }

    if (visibleInputs.length >= code.length) {
        for (let i = 0; i < code.length; i++) {
            await visibleInputs[i].fill(code[i]);
        }
        return true;
    }

    return false;
};

const autoFillTotpIfRequired = async (page, totpSecret, randomWait, options = {}) => {
    if (!totpSecret) return false;

    const maxAttempts = options.maxAttempts ?? 20;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            const title = await page.title();
            if (title.includes("AI Studio")) return false;
        } catch {
            // Page may still be navigating.
        }

        await waitForFreshTotpWindow();
        const code = generateTotpCode(totpSecret);
        const filled = await fillTotpInputs(page, code);

        if (filled) {
            console.log(
                getText(
                    "🕵️ 检测到 2FA 验证码输入框，已自动填入 TOTP 验证码。",
                    "🕵️ Detected a 2FA input and auto-filled a TOTP code."
                )
            );
            await randomWait();
            await page.keyboard.press("Enter");
            await randomWait();
            await clickGoogleTransitionButtons(page, randomWait);
            return true;
        }

        await page.waitForTimeout(1000);
    }

    return false;
};

const clickRecoveryEmailOption = async (page, randomWait) => {
    const optionPatterns = [
        /confirm your recovery email/i,
        /confirm.*recovery email/i,
        /verify.*recovery email/i,
        /确认.*辅助邮箱/,
        /确认.*恢复邮箱/,
        /验证.*辅助邮箱/,
        /验证.*恢复邮箱/,
    ];
    const controlSelector = 'button, [role="button"], [role="link"], div[role="link"], div[role="button"]';

    for (const frame of page.frames()) {
        const controls = frame.locator(controlSelector);
        const controlCount = await controls.count().catch(() => 0);
        for (let i = 0; i < Math.min(controlCount, 40); i++) {
            const control = controls.nth(i);
            try {
                if (!(await control.isVisible({ timeout: 150 }))) continue;
                const text = ((await control.textContent({ timeout: 300 }).catch(() => "")) || "")
                    .replace(/\s+/g, " ")
                    .trim();
                const ariaLabel = ((await control.getAttribute("aria-label").catch(() => "")) || "").trim();
                const label = text || ariaLabel;
                if (!optionPatterns.some(pattern => pattern.test(label))) continue;

                console.log(
                    getText(
                        "🕵️ 检测到恢复邮箱确认选项，正在选择该验证方式...",
                        "🕵️ Detected the recovery email verification option. Selecting it..."
                    )
                );
                await control.scrollIntoViewIfNeeded().catch(() => {});
                await control.click({ timeout: 5000 });
                await randomWait();
                return true;
            } catch {
                // Continue scanning other candidates.
            }
        }
    }

    return false;
};

const fillRecoveryEmailInput = async (page, recoveryEmail) => {
    const challengePattern =
        /confirm your recovery email|enter your recovery email|recovery email|辅助邮箱|恢复邮箱|备用邮箱|找回邮箱/i;
    const inputSelector = [
        'input[name="knowledgePreregisteredEmailResponse"]',
        'input[type="email"]',
        'input[aria-label*="recovery" i]',
        'input[aria-label*="email" i]',
        'input[aria-label*="邮箱"]',
        'input[placeholder*="recovery" i]',
        'input[placeholder*="email" i]',
        'input[placeholder*="邮箱"]',
        'input[type="text"]',
    ].join(", ");

    for (const frame of page.frames()) {
        let bodyText = "";
        try {
            bodyText = (await frame.locator("body").textContent({ timeout: 500 })) || "";
        } catch {
            // Frame may still be navigating.
        }
        if (!challengePattern.test(bodyText)) continue;

        const inputs = frame.locator(inputSelector);
        const inputCount = await inputs.count().catch(() => 0);
        for (let i = 0; i < Math.min(inputCount, 8); i++) {
            const input = inputs.nth(i);
            try {
                if ((await input.isVisible({ timeout: 250 })) && (await input.isEditable())) {
                    await input.fill(recoveryEmail);
                    return true;
                }
            } catch {
                // Ignore non-editable or detached candidates.
            }
        }
    }

    return false;
};

const autoFillRecoveryEmailIfRequired = async (page, recoveryEmail, randomWait) => {
    if (!recoveryEmail) return false;

    for (let attempt = 0; attempt < 20; attempt++) {
        try {
            const title = await page.title();
            if (title.includes("AI Studio")) return false;
        } catch {
            // Page may still be navigating.
        }

        const filled = await fillRecoveryEmailInput(page, recoveryEmail);
        if (filled) {
            console.log(
                getText("🕵️ 已自动填入恢复邮箱验证。", "🕵️ Auto-filled the recovery email verification challenge.")
            );
            await randomWait();
            await page.keyboard.press("Enter");
            await randomWait();
            await clickGoogleTransitionButtons(page, randomWait);
            return true;
        }

        await clickRecoveryEmailOption(page, randomWait);
        await page.waitForTimeout(1000);
    }

    return false;
};

(async () => {
    // Use project root directory instead of scripts directory
    const projectRoot = path.join(__dirname, "..", "..");
    const configDirPath = path.join(projectRoot, CONFIG_DIR);
    ensureDirectoryExists(configDirPath);

    const newIndex = getNextAuthIndex();
    const authFileName = `auth-${newIndex}.json`;

    console.log(
        getText(
            `▶️  正在准备为账号 #${newIndex} 创建新的认证文件...`,
            `▶️  Preparing to create new authentication file for account #${newIndex}...`
        )
    );
    console.log(getText(`▶️  启动浏览器: ${browserExecutablePath}`, `▶️  Launching browser: ${browserExecutablePath}`));

    if (!browserExecutablePath || !fs.existsSync(browserExecutablePath)) {
        console.error(getText("❌ 未找到 Camoufox 可执行文件。", "❌ Camoufox executable not found."));
        console.error(
            getText(
                `   -> 检查路径: ${browserExecutablePath || "(null)"}`,
                `   -> Checked: ${browserExecutablePath || "(null)"}`
            )
        );
        console.error(
            getText(
                '   -> 请先运行 "npm run setup-auth"，或设置 CAMOUFOX_EXECUTABLE_PATH。',
                '   -> Please run "npm run setup-auth" first, or set CAMOUFOX_EXECUTABLE_PATH.'
            )
        );
        process.exit(1);
    }

    if (runtimeOptions.nonInteractive && (!runtimeOptions.autoFillEmail || !runtimeOptions.autoFillPwd)) {
        console.error(
            getText(
                "❌ 无交互模式需要同时提供邮箱和密码。请通过命令行参数或环境变量设置。",
                "❌ Non-interactive mode requires both email and password. Provide them via CLI options or environment variables."
            )
        );
        process.exit(1);
    }

    const proxyConfig = parseProxyFromEnv();
    if (proxyConfig) {
        const bypassText = proxyConfig.bypass ? `, bypass=${proxyConfig.bypass}` : "";
        console.log(
            getText(
                `🌐  使用代理: ${proxyConfig.server}${bypassText}`,
                `🌐  Using proxy: ${proxyConfig.server}${bypassText}`
            )
        );
    } else {
        console.log(
            getText(
                "🌐  未检测到代理环境变量 (HTTPS_PROXY/HTTP_PROXY/ALL_PROXY)。如需代理请在运行前设置。",
                "🌐  No proxy env detected (HTTPS_PROXY/HTTP_PROXY/ALL_PROXY). Set it before running if needed."
            )
        );
    }

    console.log(
        getText(
            `🪟 浏览器模式: ${runtimeOptions.headless ? "headless" : "headed"}`,
            `🪟 Browser mode: ${runtimeOptions.headless ? "headless" : "headed"}`
        )
    );
    if (runtimeOptions.nonInteractive) {
        console.log(
            getText(
                `⏱️  无交互模式登录超时: ${runtimeOptions.loginTimeoutMs}ms`,
                `⏱️  Non-interactive login timeout: ${runtimeOptions.loginTimeoutMs}ms`
            )
        );
    }
    if (runtimeOptions.debugUi) {
        console.log(
            getText(
                "🔎 UI 调试模式已开启：保存认证文件前会输出页面控件诊断并保存截图。",
                "🔎 UI debug mode enabled: diagnostics and a screenshot will be saved before auth export."
            )
        );
    }

    const browser = await firefox.launch({
        executablePath: browserExecutablePath,
        headless: runtimeOptions.headless,
        ...(proxyConfig ? { proxy: proxyConfig } : {}),
    });

    const context = await browser.newContext(proxyConfig ? { proxy: proxyConfig } : {});
    const page = await context.newPage();

    const { autoFillEmail, autoFillPwd } = runtimeOptions;

    if (!autoFillEmail && !runtimeOptions.nonInteractive) {
        console.log("");
        console.log(
            getText(
                "--- 请在新打开的 Camoufox 窗口中完成以下步骤 ---",
                "--- Please complete the following steps in the newly opened Camoufox window ---"
            )
        );
        console.log(
            getText(
                "1. 浏览器将打开 Google AI Studio。请在弹出的页面上完整登录您的 Google 账号。",
                "1. The browser will open Google AI Studio. Please log in to your Google account completely on the popup page."
            )
        );
        console.log(
            getText(
                "2. 登录成功并看到 AI Studio 界面后，请不要关闭浏览器窗口。",
                "2. After successful login and seeing the AI Studio interface, do not close the browser window."
            )
        );
        console.log(
            getText(
                '3. 返回此终端，然后按 "回车键" 继续...',
                '3. Return to this terminal, then press "Enter" to continue...'
            )
        );
    }

    const randomWait = () => new Promise(r => setTimeout(r, 1000 + Math.random() * 4000));

    // <<< This is the only modification point: updated to Google AI Studio address >>>
    await page.goto("https://aistudio.google.com/u/0/prompts/new_chat");

    if (autoFillEmail) {
        try {
            console.log(
                getText(
                    `🕵️ 正在尝试自动填入账号: ${autoFillEmail}`,
                    `🕵️ Attempting to auto-fill account: ${autoFillEmail}`
                )
            );
            await page.waitForSelector('input[type="email"]', { timeout: 30000 });
            await randomWait();
            await page.fill('input[type="email"]', autoFillEmail);
            await page.keyboard.press("Enter");

            if (autoFillPwd) {
                console.log(getText("🕵️ 正在等待密码输入框...", "🕵️ Waiting for password input field..."));
                await page.waitForSelector('input[type="password"]', { state: "visible", timeout: 30000 });
                await randomWait();
                await page.fill('input[type="password"]', autoFillPwd);
                await page.keyboard.press("Enter");

                try {
                    await acceptAiStudioTermsIfPresent(page, randomWait, { rounds: 4 });
                    await autoFillTotpIfRequired(page, runtimeOptions.totpSecret, randomWait, {
                        maxAttempts: runtimeOptions.recoveryEmail ? 8 : 20,
                    });
                    await autoFillRecoveryEmailIfRequired(page, runtimeOptions.recoveryEmail, randomWait);
                    await acceptAiStudioTermsIfPresent(page, randomWait, { rounds: 4 });
                    await clickGoogleTransitionButtons(page, randomWait);
                } catch (e) {
                    // Best effort
                }
            }
            console.log(
                getText(
                    runtimeOptions.totpSecret
                        ? "🕵️ 自动填充已完成。如有未识别的 2FA 或额外风控，请在浏览器中手动完成。"
                        : "🕵️ 自动填充已完成。如有 2FA 请在浏览器中手动完成。",
                    runtimeOptions.totpSecret
                        ? "🕵️ Auto-fill complete. If there is an unsupported 2FA step or extra risk challenge, complete it manually in the browser."
                        : "🕵️ Auto-fill complete. Please complete 2FA manually if required."
                )
            );
        } catch (e) {
            console.warn(
                getText(
                    `⚠️ 自动填充提示: 未能完全自动执行 (${e.message})`,
                    `⚠️ Auto-fill notice: Could not complete automatically (${e.message})`
                )
            );
        }
    }

    console.log("");
    console.log(
        getText(
            "🕵️ 正在监测登录状态 (监测 AI Studio 标题)...",
            "🕵️ Monitoring login status (watching for AI Studio title)..."
        )
    );

    // Monitoring loop for AI Studio title
    let loginDetected = false;
    const checkInterval = 1000;
    const maxWaitTime = runtimeOptions.loginTimeoutMs;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
        try {
            const title = await page.title();
            if (title.includes("AI Studio")) {
                console.log(
                    getText("✨ 检测到 AI Studio 标题，登录成功！", "✨ AI Studio title detected, login successful!")
                );
                await page.waitForTimeout(2000); // Wait 2s for state to stabilize
                loginDetected = true;
                break;
            }
        } catch (e) {
            // Page might be navigating
        }
        await page.waitForTimeout(checkInterval);
    }

    if (!loginDetected) {
        if (runtimeOptions.nonInteractive) {
            await logAuthUiDiagnostics(page, "登录超时前未检测到 AI Studio 标题");
            console.error(
                getText(
                    `❌ 在 ${maxWaitTime}ms 内未检测到 AI Studio 登录成功，已退出无交互模式。`,
                    `❌ Timed out after ${maxWaitTime}ms without detecting a successful AI Studio login. Exiting non-interactive mode.`
                )
            );
            await closeBrowserSafely(browser);
            process.exit(1);
        }
        if (autoFillEmail) {
            console.log(
                getText(
                    "⚠️ 未能自动检测到登录成功状态。请在浏览器中手动完成登录。",
                    "⚠️ Could not automatically detect login success. Please complete login manually in the browser."
                )
            );
        }
        console.log(
            getText(
                '▶️  返回此终端，然后按 "回车键" 继续...',
                '▶️  Return to this terminal, then press "Enter" to continue...'
            )
        );
        await new Promise(resolve => process.stdin.once("data", resolve));
    }

    try {
        const acceptedTerms = await acceptAiStudioTermsIfPresent(page, randomWait, { rounds: 8 });
        if (acceptedTerms) {
            await page.waitForTimeout(2000);
        } else {
            await logAuthUiDiagnostics(page, "保存认证文件前未命中协议确认控件");
        }
    } catch {
        // Agreement handling is best-effort and should not block auth export.
    }

    // ==================== Capture Account Name ====================

    let accountName = "unknown"; // Default value
    try {
        console.log(
            getText(
                "🕵️  正在尝试获取账号名称 (V3 - 扫描 <script> JSON)...",
                "🕵️  Attempting to retrieve account name (V3 - Scanning <script> JSON)..."
            )
        );

        // 1. Locate all <script type="application/json"> tags
        const scriptLocators = page.locator('script[type="application/json"]');
        const count = await scriptLocators.count();
        console.log(getText(`   -> 找到 ${count} 个 JSON <script> 标签。`, `   -> Found ${count} JSON <script> tags.`));

        // 2. Define a basic Email regular expression
        // It will match strings like "ouyang5453@gmail.com"
        const emailRegex = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/;

        // 3. Iterate through all tags to find the first matching Email
        for (let i = 0; i < count; i++) {
            const content = await scriptLocators.nth(i).textContent();

            if (content) {
                // 4. Search for Email in tag content
                const match = content.match(emailRegex);

                if (match && match[0]) {
                    // 5. Found it!
                    accountName = match[0];
                    console.log(
                        getText(
                            `   -> 成功获取账号: ${accountName}`,
                            `   -> Successfully retrieved account: ${accountName}`
                        )
                    );
                    break; // Exit loop immediately after finding
                }
            }
        }

        if (accountName === "unknown") {
            console.log(
                getText(
                    `   -> 已遍历所有 ${count} 个 <script> 标签，但未找到 Email。`,
                    `   -> Iterated through all ${count} <script> tags, but no Email found.`
                )
            );
        }
    } catch (error) {
        console.warn(
            getText(
                "⚠️  无法自动获取账号名称 (V3 扫描出错)。",
                "⚠️  Unable to automatically retrieve account name (error during V3 scan)."
            )
        );
        console.warn(getText(`   -> 错误: ${error.message}`, `   -> Error: ${error.message}`));
        console.warn(getText('   -> 将使用 "unknown" 作为账号名称。', '   -> Will use "unknown" as account name.'));
    }

    // ==================== Smart Validation and Dual-file Save Logic ====================
    console.log("");
    console.log(getText("正在获取并验证登录状态...", "Retrieving and validating login status..."));
    const currentState = await context.storageState();
    currentState.accountName = accountName;
    const prettyStateString = JSON.stringify(currentState, null, 2);
    const lineCount = prettyStateString.split("\n").length;

    if (lineCount > VALIDATION_LINE_THRESHOLD) {
        console.log(
            getText(
                `✅ 状态验证通过 (${lineCount} 行 > ${VALIDATION_LINE_THRESHOLD} 行)。`,
                `✅ State validation passed (${lineCount} lines > ${VALIDATION_LINE_THRESHOLD} lines).`
            )
        );

        const compactStateString = JSON.stringify(currentState);
        const authFilePath = path.join(configDirPath, authFileName);

        fs.writeFileSync(authFilePath, compactStateString);
        console.log(
            getText(
                `   📄 认证文件已保存到: ${path.join(CONFIG_DIR, authFileName)}`,
                `   📄 Authentication file saved to: ${path.join(CONFIG_DIR, authFileName)}`
            )
        );
    } else {
        console.log(
            getText(
                `❌ 状态验证失败 (${lineCount} 行 <= ${VALIDATION_LINE_THRESHOLD} 行)。`,
                `❌ State validation failed (${lineCount} lines <= ${VALIDATION_LINE_THRESHOLD} lines).`
            )
        );
        console.log(
            getText(
                "   登录状态似乎为空或无效，文件未保存。",
                "   Login status appears to be empty or invalid, file was not saved."
            )
        );
        console.log(
            getText(
                "   请确保您已完全登录后再按回车键。",
                "   Please make sure you are fully logged in before pressing Enter."
            )
        );

        await closeBrowserSafely(browser);
        console.log("");
        console.log(getText("浏览器已关闭。", "Browser closed."));
        process.exit(1); // Exit with error code when validation fails
    }
    // ===================================================================

    await closeBrowserSafely(browser);
    console.log("");
    console.log(getText("浏览器已关闭。", "Browser closed."));

    process.exit(0);
})().catch(async error => {
    console.error("");
    console.error(getText("错误:", "ERROR:"), error?.message || error);
    process.exit(1);
});

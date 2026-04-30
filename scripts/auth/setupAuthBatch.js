/**
 * File: scripts/auth/setupAuthBatch.js
 * Description: Batch wrapper for setup-auth, reading users.csv and generating auth files account by account.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

require("dotenv").config({ path: path.resolve(__dirname, "..", "..", ".env") });

const PROJECT_ROOT = path.join(__dirname, "..", "..");

const normalizeLanguage = value => {
    const normalized = String(value || "")
        .trim()
        .toLowerCase();
    if (normalized === "2" || normalized === "en" || normalized === "english") {
        return "en";
    }
    return "zh";
};

let lang = normalizeLanguage(process.env.SETUP_AUTH_BATCH_LANG || process.env.SETUP_AUTH_LANG || "zh");
const getText = (zh, en) => (lang === "zh" ? zh : en);

const parseBooleanLike = value => {
    if (value === undefined || value === null || value === "") return undefined;
    const normalized = String(value).trim().toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
    return undefined;
};

const parseNonNegativeInteger = (value, optionName) => {
    if (value === undefined || value === null || value === "") return undefined;
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(getText(`${optionName} 必须是非负整数。`, `${optionName} must be a non-negative integer.`));
    }
    return parsed;
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
        continueOnError: undefined,
        debugUi: undefined,
        headless: undefined,
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === "-h" || arg === "--help") {
            options.help = true;
            continue;
        }
        if (arg === "--continue-on-error") {
            options.continueOnError = true;
            continue;
        }
        if (arg === "--stop-on-error") {
            options.continueOnError = false;
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
        if (arg.startsWith("--csv=")) {
            options.csv = arg.slice("--csv=".length);
            continue;
        }
        if (arg === "--csv") {
            options.csv = readRequiredOptionValue(args, i, "--csv");
            i++;
            continue;
        }
        if (arg.startsWith("--accounts=")) {
            options.accounts = arg.slice("--accounts=".length);
            continue;
        }
        if (arg === "--accounts") {
            options.accounts = readRequiredOptionValue(args, i, "--accounts");
            i++;
            continue;
        }
        if (arg.startsWith("--delay-ms=")) {
            options.delayMs = arg.slice("--delay-ms=".length);
            continue;
        }
        if (arg === "--delay-ms") {
            options.delayMs = readRequiredOptionValue(args, i, "--delay-ms");
            i++;
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
    console.log("Usage: npm run setup-auth-batch -- [options]");
    console.log("");
    console.log("Options:");
    console.log("  -h, --help                 Show this help message");
    console.log("  --csv <path>               CSV file path, defaults to users.csv");
    console.log("  --accounts <list>          Account selectors: all, 1, 1,3-5, or email");
    console.log("  --headless                 Run browser in headless mode (default)");
    console.log("  --headed                   Force headed mode");
    console.log("  --debug-ui                 Dump UI diagnostics before auth export");
    console.log("  --continue-on-error        Continue with remaining accounts if one account fails");
    console.log("  --stop-on-error            Stop at first failed account (default)");
    console.log("  --delay-ms <ms>            Delay between accounts, defaults to 1000");
    console.log("  --lang <zh|en>             Override output language");
    console.log("  --login-timeout-ms <ms>    Override per-account login detection timeout");
    console.log("");
    console.log("CSV columns:");
    console.log("  email,password,recovery_email,totp_secret");
    console.log("");
    console.log("Environment variables:");
    console.log("  SETUP_AUTH_BATCH_ACCOUNTS=all");
    console.log("  SETUP_AUTH_BATCH_CONTINUE_ON_ERROR=true");
    console.log("  SETUP_AUTH_BATCH_CSV=users.csv");
    console.log("  SETUP_AUTH_BATCH_DELAY_MS=1000");
    console.log("  SETUP_AUTH_BATCH_LANG=zh|en");
    console.log("  SETUP_AUTH_HEADLESS=true");
    console.log("  SETUP_AUTH_LOGIN_TIMEOUT_MS=300000");
    console.log("  SETUP_AUTH_DEBUG_UI=true");
};

const buildRuntimeOptions = cliOptions => {
    const langValue = cliOptions.lang ?? process.env.SETUP_AUTH_BATCH_LANG ?? process.env.SETUP_AUTH_LANG;
    const csvValue = cliOptions.csv ?? process.env.SETUP_AUTH_BATCH_CSV ?? "users.csv";

    return {
        accounts: cliOptions.accounts ?? process.env.SETUP_AUTH_BATCH_ACCOUNTS ?? "all",
        continueOnError:
            cliOptions.continueOnError ?? parseBooleanLike(process.env.SETUP_AUTH_BATCH_CONTINUE_ON_ERROR) ?? false,
        csvPath: path.resolve(PROJECT_ROOT, csvValue),
        debugUi: cliOptions.debugUi ?? parseBooleanLike(process.env.SETUP_AUTH_DEBUG_UI) ?? false,
        delayMs:
            parseNonNegativeInteger(cliOptions.delayMs ?? process.env.SETUP_AUTH_BATCH_DELAY_MS, "delay-ms") ?? 1000,
        headless: cliOptions.headless ?? parseBooleanLike(process.env.SETUP_AUTH_HEADLESS) ?? true,
        lang: normalizeLanguage(langValue),
        loginTimeoutMs: parsePositiveInteger(
            cliOptions.loginTimeoutMs ?? process.env.SETUP_AUTH_LOGIN_TIMEOUT_MS,
            "login-timeout-ms"
        ),
    };
};

const parseCSVLine = line => {
    const parts = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === "," && !inQuotes) {
            parts.push(current.trim());
            current = "";
        } else {
            current += char;
        }
    }
    parts.push(current.trim());
    return parts;
};

const getHeaderIndex = (header, patterns) =>
    header.findIndex(column => patterns.some(pattern => pattern.test(String(column || "").trim())));

const parseAccountRowWithHeader = (parts, header, index) => {
    const emailIndex = getHeaderIndex(header, [/^email$/i, /^account$/i, /^账号$/, /^邮箱$/]);
    const passwordIndex = getHeaderIndex(header, [/^password$/i, /^pwd$/i, /^pass$/i, /^密码$/]);
    const recoveryIndex = getHeaderIndex(header, [
        /^recovery/i,
        /recovery.*email/i,
        /^辅助邮箱$/,
        /^恢复邮箱$/,
        /^备用邮箱$/,
    ]);
    const totpIndex = getHeaderIndex(header, [/^totp/i, /^otp/i, /^2fa/i, /secret/i, /密钥/]);

    const email = emailIndex >= 0 ? parts[emailIndex] : "";
    const password = passwordIndex >= 0 ? parts[passwordIndex] || "" : "";
    const recoveryEmail = recoveryIndex >= 0 ? parts[recoveryIndex] || "" : "";
    const totpSecret = totpIndex >= 0 ? parts[totpIndex] || "" : "";

    return email
        ? {
              email,
              index,
              password,
              recoveryEmail,
              totpSecret,
          }
        : null;
};

const parseAccountRowWithoutHeader = (parts, index) => {
    const emailIndex = parts.findIndex(part => part.includes("@"));
    if (emailIndex === -1) return null;

    const thirdValue = parts[emailIndex + 2] || "";

    return {
        email: parts[emailIndex],
        index,
        password:
            parts[emailIndex + 1] || parts.find((part, partIndex) => partIndex !== emailIndex && part.length > 0) || "",
        recoveryEmail: thirdValue.includes("@") ? thirdValue : "",
        totpSecret: parts[emailIndex + 3] || (thirdValue && !thirdValue.includes("@") ? thirdValue : ""),
    };
};

const getAccountsFromCSV = csvPath => {
    if (!fs.existsSync(csvPath)) {
        throw new Error(getText(`未找到 CSV 文件: ${csvPath}`, `CSV file not found: ${csvPath}`));
    }

    const content = fs.readFileSync(csvPath, "utf-8");
    const rows = content
        .split(/\r?\n/)
        .filter(line => line.trim() !== "")
        .map(line => parseCSVLine(line));

    if (rows.length === 0) {
        throw new Error(getText(`CSV 文件为空: ${csvPath}`, `CSV file is empty: ${csvPath}`));
    }

    const firstRow = rows[0].map(part => part.trim());
    const hasHeader =
        !firstRow.some(part => part.includes("@")) &&
        getHeaderIndex(firstRow, [/^email$/i, /^account$/i, /^账号$/, /^邮箱$/]) !== -1;
    const accountRows = hasHeader ? rows.slice(1) : rows;
    const header = hasHeader ? firstRow : [];

    return accountRows
        .map((parts, offset) =>
            hasHeader
                ? parseAccountRowWithHeader(parts, header, offset + 1)
                : parseAccountRowWithoutHeader(parts, offset + 1)
        )
        .filter(Boolean);
};

const addAccountByIndex = (accounts, selected, seen, index) => {
    const account = accounts.find(item => item.index === index);
    if (!account) {
        throw new Error(
            getText(`users.csv 中不存在序号为 ${index} 的账号。`, `No users.csv account found at index ${index}.`)
        );
    }
    if (!seen.has(account.email)) {
        selected.push(account);
        seen.add(account.email);
    }
};

const selectAccounts = (accounts, selectorValue) => {
    const selector = String(selectorValue || "all").trim();
    if (!selector || selector.toLowerCase() === "all") return accounts;

    const selected = [];
    const seen = new Set();
    for (const token of selector
        .split(",")
        .map(part => part.trim())
        .filter(Boolean)) {
        const rangeMatch = token.match(/^(\d+)-(\d+)$/);
        if (rangeMatch) {
            const start = Number.parseInt(rangeMatch[1], 10);
            const end = Number.parseInt(rangeMatch[2], 10);
            if (start > end) {
                throw new Error(getText(`账号范围无效: ${token}`, `Invalid account range: ${token}`));
            }
            for (let index = start; index <= end; index++) {
                addAccountByIndex(accounts, selected, seen, index);
            }
            continue;
        }

        if (/^\d+$/.test(token)) {
            addAccountByIndex(accounts, selected, seen, Number.parseInt(token, 10));
            continue;
        }

        const account = accounts.find(item => item.email.toLowerCase() === token.toLowerCase());
        if (!account) {
            throw new Error(getText(`users.csv 中不存在账号 ${token}。`, `No users.csv account found for ${token}.`));
        }
        if (!seen.has(account.email)) {
            selected.push(account);
            seen.add(account.email);
        }
    }

    return selected;
};

const maskEmail = email => email.replace(/^(.{2}).*(@.*)$/, "$1***$2");

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const runSetupAuthForAccount = (account, options) => {
    const args = [
        path.join("scripts", "auth", "setupAuth.js"),
        "--non-interactive",
        "--email",
        account.email,
        "--password",
        account.password,
        "--lang",
        options.lang,
    ];

    args.push(options.headless ? "--headless" : "--headed");
    if (options.debugUi) args.push("--debug-ui");
    if (options.loginTimeoutMs) args.push("--login-timeout-ms", String(options.loginTimeoutMs));
    if (account.recoveryEmail) args.push("--recovery-email", account.recoveryEmail);
    if (account.totpSecret) args.push("--totp-secret", account.totpSecret);

    return spawnSync(process.execPath, args, {
        cwd: PROJECT_ROOT,
        env: {
            ...process.env,
            SETUP_AUTH_BATCH_RUNNING: "true",
        },
        stdio: "inherit",
    });
};

const main = async () => {
    const cliOptions = parseCliArgs(process.argv.slice(2));
    if (cliOptions.help) {
        printHelp();
        process.exit(0);
    }

    const options = buildRuntimeOptions(cliOptions);
    lang = options.lang;

    const accounts = getAccountsFromCSV(options.csvPath);
    const selectedAccounts = selectAccounts(accounts, options.accounts);
    if (selectedAccounts.length === 0) {
        throw new Error(getText("没有可处理的账号。", "No accounts selected."));
    }

    const missingPassword = selectedAccounts.find(account => !account.password);
    if (missingPassword) {
        throw new Error(
            getText(
                `账号 ${missingPassword.email} 缺少密码，无法无交互批量添加。`,
                `Account ${missingPassword.email} is missing a password and cannot be added non-interactively.`
            )
        );
    }

    console.log("");
    console.log("==========================================");
    console.log(getText("  AI Studio To API - 批量认证设置", "  AI Studio To API - Batch Auth Setup"));
    console.log("==========================================");
    console.log(getText(`CSV 文件: ${options.csvPath}`, `CSV file: ${options.csvPath}`));
    console.log(getText(`待处理账号数: ${selectedAccounts.length}`, `Accounts to process: ${selectedAccounts.length}`));
    console.log("");

    const failures = [];
    for (let i = 0; i < selectedAccounts.length; i++) {
        const account = selectedAccounts[i];
        console.log("");
        console.log("==========================================");
        console.log(
            getText(
                `  [${i + 1}/${selectedAccounts.length}] 正在添加账号: ${maskEmail(account.email)}`,
                `  [${i + 1}/${selectedAccounts.length}] Adding account: ${maskEmail(account.email)}`
            )
        );
        console.log("==========================================");

        const result = runSetupAuthForAccount(account, options);
        const failed = result.error || (typeof result.status === "number" && result.status !== 0);
        if (failed) {
            const message = result.error?.message || `exit code ${result.status}`;
            failures.push({ email: account.email, message });
            console.error(
                getText(`账号 ${account.email} 添加失败: ${message}`, `Failed to add ${account.email}: ${message}`)
            );
            if (!options.continueOnError) break;
        }

        if (i < selectedAccounts.length - 1 && options.delayMs > 0) {
            await sleep(options.delayMs);
        }
    }

    console.log("");
    console.log("==========================================");
    console.log(getText("  批量认证设置完成", "  Batch auth setup complete"));
    console.log("==========================================");
    console.log(
        getText(
            `成功: ${selectedAccounts.length - failures.length}`,
            `Succeeded: ${selectedAccounts.length - failures.length}`
        )
    );
    console.log(getText(`失败: ${failures.length}`, `Failed: ${failures.length}`));
    for (const failure of failures) {
        console.log(`  - ${failure.email}: ${failure.message}`);
    }

    if (failures.length > 0) process.exit(1);
};

main().catch(error => {
    console.error("");
    console.error(getText("错误:", "ERROR:"), error?.message || error);
    process.exit(1);
});

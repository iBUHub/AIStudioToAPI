/**
 * File: scripts/auth/setupAuth.js
 * Description: Cross-platform auth setup helper. Installs dependencies, downloads Camoufox, and runs saveAuth.js.
 *
 * Author: Ellinav, iBenzene, bbbugg, MasakiMu319
 */

const { spawnSync } = require("child_process");
const fs = require("fs");
const https = require("https");
const os = require("os");
const path = require("path");
const readline = require("readline");
const { HttpsProxyAgent, SocksProxyAgent } = require("playwright-core/lib/utilsBundle");
const { getProxySummaryFromEnv, parseProxyFromEnv } = require("../../src/utils/ProxyUtils");

const DEFAULT_CAMOUFOX_VERSION = "135.0.1-beta.24";
const GITHUB_RELEASE_TAG_PREFIX = "v";

const PROJECT_ROOT = path.join(__dirname, "..", "..");

// Language setting (will be set after user selection)
let lang = "zh";

// Bilingual text helper
const getText = (zh, en) => (lang === "zh" ? zh : en);

const normalizeLanguage = value => {
    const normalized = String(value || "")
        .trim()
        .toLowerCase();
    if (normalized === "2" || normalized === "en" || normalized === "english") {
        return "en";
    }
    return "zh";
};

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
        nonInteractive: false,
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
        if (arg.startsWith("--account=")) {
            options.account = arg.slice("--account=".length);
            continue;
        }
        if (arg === "--account") {
            options.account = readRequiredOptionValue(args, i, "--account");
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
    console.log("Usage: npm run setup-auth -- [options]");
    console.log("");
    console.log("Options:");
    console.log("  -h, --help                 Show this help message");
    console.log("  --non-interactive          Run without prompts and exit on timeout/failure");
    console.log("  --lang <zh|en>             Skip language prompt");
    console.log("  --email <email>            Auto-fill the Google account email");
    console.log("  --password <password>      Auto-fill the Google account password");
    console.log("  --recovery-email <email>   Auto-fill Google recovery email challenge");
    console.log("  --totp-secret <secret>     Auto-fill Google TOTP 2FA code using a Base32 secret");
    console.log("  --account <index|email>    Select an account from users.csv without prompting");
    console.log("  --headless                 Launch Camoufox in headless mode");
    console.log("  --headed                   Force headed mode");
    console.log("  --login-timeout-ms <ms>    Override login detection timeout");
    console.log("  --debug-ui                 Dump UI diagnostics before auth export");
    console.log("");
    console.log("Environment variables:");
    console.log("  CAMOUFOX_VERSION=135.0.1-beta.24");
    console.log("  CAMOUFOX_URL=<direct zip url>");
    console.log("  CAMOUFOX_EXECUTABLE_PATH=<path to camoufox executable>");
    console.log("  SETUP_AUTH_NON_INTERACTIVE=true");
    console.log("  SETUP_AUTH_LANG=zh|en");
    console.log("  SETUP_AUTH_EMAIL=<email>");
    console.log("  SETUP_AUTH_PASSWORD=<password>");
    console.log("  SETUP_AUTH_RECOVERY_EMAIL=<recovery email>");
    console.log("  SETUP_AUTH_TOTP_SECRET=<base32 secret>");
    console.log("  SETUP_AUTH_ACCOUNT=<index or email>");
    console.log("  SETUP_AUTH_HEADLESS=true");
    console.log("  SETUP_AUTH_LOGIN_TIMEOUT_MS=300000");
    console.log("  SETUP_AUTH_DEBUG_UI=true");
    console.log("");
    console.log("Examples:");
    console.log("  npm run setup-auth -- --non-interactive --email your@gmail.com --password your-password --headless");
    console.log("  npm run setup-auth -- --non-interactive --account 1");
};

const buildRuntimeOptions = cliOptions => {
    const langValue = cliOptions.lang ?? process.env.SETUP_AUTH_LANG;
    const nonInteractive =
        cliOptions.nonInteractive || parseBooleanLike(process.env.SETUP_AUTH_NON_INTERACTIVE) === true;
    const headless = cliOptions.headless ?? parseBooleanLike(process.env.SETUP_AUTH_HEADLESS) ?? false;

    return {
        account: cliOptions.account ?? process.env.SETUP_AUTH_ACCOUNT,
        debugUi: cliOptions.debugUi ?? parseBooleanLike(process.env.SETUP_AUTH_DEBUG_UI) ?? false,
        email: cliOptions.email ?? process.env.SETUP_AUTH_EMAIL ?? process.env.AUTO_FILL_EMAIL,
        hasExplicitLang: langValue !== undefined,
        headless,
        lang: normalizeLanguage(langValue),
        loginTimeoutMs: parsePositiveInteger(
            cliOptions.loginTimeoutMs ?? process.env.SETUP_AUTH_LOGIN_TIMEOUT_MS,
            "login-timeout-ms"
        ),
        nonInteractive,
        password: cliOptions.password ?? process.env.SETUP_AUTH_PASSWORD ?? process.env.AUTO_FILL_PWD,
        recoveryEmail: cliOptions.recoveryEmail ?? process.env.SETUP_AUTH_RECOVERY_EMAIL,
        totpSecret: cliOptions.totpSecret ?? process.env.SETUP_AUTH_TOTP_SECRET,
    };
};

// Prompt user to select language
const selectLanguage = () =>
    new Promise(resolve => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        console.log("");
        console.log("==========================================");
        console.log("请选择语言 / Please select language:");
        console.log("  1. 中文");
        console.log("  2. English");
        console.log("==========================================");

        rl.question("> ", answer => {
            rl.close();
            lang = normalizeLanguage(answer);
            resolve(lang);
        });
    });

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

const getAccountsFromCSV = () => {
    const csvPath = path.join(PROJECT_ROOT, "users.csv");
    if (!fs.existsSync(csvPath)) return [];

    const content = fs.readFileSync(csvPath, "utf-8");
    const rows = content
        .split(/\r?\n/)
        .filter(line => line.trim() !== "")
        .map(line => parseCSVLine(line));

    if (rows.length === 0) return [];

    const firstRow = rows[0].map(part => part.trim());
    const hasHeader =
        !firstRow.some(part => part.includes("@")) &&
        getHeaderIndex(firstRow, [/^email$/i, /^account$/i, /^账号$/, /^邮箱$/]) !== -1;
    const accountRows = hasHeader ? rows.slice(1) : rows;
    const emailHeaderIndex = hasHeader ? getHeaderIndex(firstRow, [/^email$/i, /^account$/i, /^账号$/, /^邮箱$/]) : -1;
    const passwordHeaderIndex = hasHeader
        ? getHeaderIndex(firstRow, [/^password$/i, /^pwd$/i, /^pass$/i, /^密码$/])
        : -1;
    const recoveryHeaderIndex = hasHeader
        ? getHeaderIndex(firstRow, [/^recovery/i, /recovery.*email/i, /^辅助邮箱$/, /^恢复邮箱$/, /^备用邮箱$/])
        : -1;
    const totpHeaderIndex = hasHeader ? getHeaderIndex(firstRow, [/^totp/i, /^otp/i, /^2fa/i, /secret/i, /密钥/]) : -1;

    return accountRows
        .map((parts, index) => {
            const emailIdx = hasHeader ? emailHeaderIndex : parts.findIndex(p => p.includes("@"));
            if (emailIdx === -1) return null;

            const email = parts[emailIdx];
            const password = hasHeader
                ? parts[passwordHeaderIndex] || ""
                : parts[emailIdx + 1] || parts.find((p, idx) => idx !== emailIdx && p.length > 0) || "";
            const thirdValue = parts[emailIdx + 2] || "";
            const recoveryEmail = hasHeader
                ? parts[recoveryHeaderIndex] || ""
                : thirdValue.includes("@")
                  ? thirdValue
                  : "";
            const totpSecret = hasHeader
                ? parts[totpHeaderIndex] || ""
                : parts[emailIdx + 3] || (thirdValue && !thirdValue.includes("@") ? thirdValue : "");

            return {
                email,
                index: index + 1,
                password,
                recoveryEmail,
                totpSecret,
            };
        })
        .filter(acc => acc?.email);
};

const findAccountFromCSV = selector => {
    const accounts = getAccountsFromCSV();
    if (accounts.length === 0) {
        throw new Error(getText("未找到可用的 users.csv 账号。", "No accounts found in users.csv."));
    }

    const trimmedSelector = String(selector || "").trim();
    if (/^\d+$/.test(trimmedSelector)) {
        const index = Number.parseInt(trimmedSelector, 10);
        const account = accounts.find(item => item.index === index);
        if (!account) {
            throw new Error(
                getText(`users.csv 中不存在序号为 ${index} 的账号。`, `No users.csv account found at index ${index}.`)
            );
        }
        return account;
    }

    const account = accounts.find(item => item.email.toLowerCase() === trimmedSelector.toLowerCase());
    if (!account) {
        throw new Error(
            getText(`users.csv 中不存在账号 ${trimmedSelector}。`, `No users.csv account found for ${trimmedSelector}.`)
        );
    }
    return account;
};

const selectAccountFromCSV = accounts =>
    new Promise(resolve => {
        if (accounts.length === 0) {
            resolve(null);
            return;
        }

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });

        console.log("");
        console.log("==========================================");
        console.log(
            getText("检测到 users.csv，请选择要预填的账号:", "Detected users.csv, select account to auto-fill:")
        );
        console.log(getText("  0. 不预填 (手动输入)", "  0. Do not auto-fill (manual)"));
        accounts.forEach(acc => {
            console.log(`  ${acc.index}. ${acc.email}`);
        });
        console.log("==========================================");

        rl.question("> ", answer => {
            rl.close();
            const idx = parseInt(answer.trim(), 10);
            if (!Number.isNaN(idx) && idx > 0 && idx <= accounts.length) {
                resolve(accounts[idx - 1]);
            } else {
                resolve(null);
            }
        });
    });

const resolveSelectedAccount = async options => {
    if (options.email) {
        return {
            email: options.email,
            password: options.password || "",
        };
    }

    if (options.account) {
        return findAccountFromCSV(options.account);
    }

    const accounts = getAccountsFromCSV();
    if (options.nonInteractive) {
        if (accounts.length === 1) return accounts[0];
        if (accounts.length > 1) {
            throw new Error(
                getText(
                    "无交互模式下，当 users.csv 包含多个账号时必须显式指定 --account。",
                    "In non-interactive mode, --account is required when users.csv contains multiple accounts."
                )
            );
        }
        return null;
    }

    return selectAccountFromCSV(accounts);
};

const execOrThrow = (command, args, options) => {
    const result = spawnSync(command, args, {
        stdio: "inherit",
        ...options,
    });

    if (result.error) throw result.error;
    if (typeof result.status === "number" && result.status !== 0) {
        throw new Error(`Command failed: ${command} ${args.join(" ")}`);
    }
};

const pathExists = p => {
    try {
        fs.accessSync(p);
        return true;
    } catch {
        return false;
    }
};

const ensureDir = dirPath => {
    if (!pathExists(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
};

const npmCommand = () => (process.platform === "win32" ? "npm.cmd" : "npm");

const getCamoufoxInstallConfig = () => {
    const platform = process.platform;

    if (platform === "win32") {
        const dir = path.join(PROJECT_ROOT, "camoufox");
        return {
            expectedAppDirName: null,
            expectedExecutableName: "camoufox.exe",
            expectedExecutablePath: path.join(dir, "camoufox.exe"),
            installDir: dir,
            platform,
        };
    }

    if (platform === "linux") {
        const dir = path.join(PROJECT_ROOT, "camoufox-linux");
        return {
            expectedAppDirName: null,
            expectedExecutableName: "camoufox",
            expectedExecutablePath: path.join(dir, "camoufox"),
            installDir: dir,
            platform,
        };
    }

    if (platform === "darwin") {
        const dir = path.join(PROJECT_ROOT, "camoufox-macos");
        return {
            expectedAppDirName: "Camoufox.app",
            expectedExecutableName: "camoufox",
            expectedExecutablePath: path.join(dir, "Camoufox.app", "Contents", "MacOS", "camoufox"),
            installDir: dir,
            platform,
        };
    }

    throw new Error(getText(`不支持的操作系统: ${platform}`, `Unsupported operating system: ${platform}`));
};

const downloadFile = async (url, outFilePath) => {
    const maxRedirects = 10;
    const normalizeProxyURL = proxy => {
        let normalized = String(proxy || "").trim();
        if (!/^\w+:\/\//.test(normalized)) {
            normalized = `http://${normalized}`;
        }
        return new URL(normalized);
    };
    const shouldBypassProxy = (targetUrl, bypass) => {
        if (!bypass) return false;
        const domains = bypass.split(",").map(domain => {
            let normalized = domain.trim();
            if (!normalized.startsWith(".")) normalized = `.${normalized}`;
            return normalized;
        });
        const targetDomain = `.${targetUrl.hostname}`;
        return domains.some(domain => targetDomain.endsWith(domain));
    };
    const createProxyAgent = (proxy, targetUrl) => {
        if (!proxy) return undefined;
        if (targetUrl && proxy.bypass && shouldBypassProxy(targetUrl, proxy.bypass)) return undefined;

        const proxyUrl = normalizeProxyURL(proxy.server);
        if (proxyUrl.protocol.startsWith("socks")) {
            if (proxyUrl.protocol === "socks5:") proxyUrl.protocol = "socks5h:";
            else if (proxyUrl.protocol === "socks4:") proxyUrl.protocol = "socks4a:";
            return new SocksProxyAgent(proxyUrl);
        }

        if (proxy.username) {
            proxyUrl.username = proxy.username;
            proxyUrl.password = proxy.password || "";
        }

        return new HttpsProxyAgent(proxyUrl);
    };
    const formatBytes = bytes => {
        if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
        if (bytes < 1024) return `${bytes} B`;

        const units = ["KB", "MB", "GB", "TB"];
        let value = bytes / 1024;
        let unitIndex = 0;
        while (value >= 1024 && unitIndex < units.length - 1) {
            value /= 1024;
            unitIndex++;
        }
        return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
    };

    const fetchOnce = (currentUrl, redirectsLeft) =>
        new Promise((resolve, reject) => {
            const targetUrl = new URL(currentUrl);
            const proxyConfig = parseProxyFromEnv();
            const agent = createProxyAgent(proxyConfig, targetUrl);
            const request = https.get(
                targetUrl,
                {
                    agent,
                    headers: {
                        Accept: "*/*",
                        "User-Agent": "aistudio-to-api setup-auth",
                    },
                },
                res => {
                    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        res.resume();
                        if (redirectsLeft <= 0) {
                            reject(
                                new Error(
                                    getText(
                                        `下载时重定向次数过多: ${url}`,
                                        `Too many redirects while downloading: ${url}`
                                    )
                                )
                            );
                            return;
                        }
                        resolve(fetchOnce(res.headers.location, redirectsLeft - 1));
                        return;
                    }

                    if (res.statusCode !== 200) {
                        const chunks = [];
                        res.on("data", chunk => chunks.push(chunk));
                        res.on("end", () => {
                            const body = Buffer.concat(chunks).toString("utf-8");
                            reject(
                                new Error(
                                    getText(
                                        `下载失败 (${res.statusCode}): ${body.slice(0, 300)}`,
                                        `Download failed (${res.statusCode}): ${body.slice(0, 300)}`
                                    )
                                )
                            );
                        });
                        return;
                    }

                    const totalBytes = Number.parseInt(String(res.headers["content-length"] || "0"), 10) || 0;
                    const downloadStartTime = Date.now();
                    let downloadedBytes = 0;
                    let lastLineLength = 0;
                    let lastRenderAt = 0;
                    let progressVisible = false;

                    const renderProgress = force => {
                        if (!process.stdout.isTTY) return;

                        const now = Date.now();
                        if (!force && now - lastRenderAt < 120) return;

                        const elapsedSeconds = Math.max((now - downloadStartTime) / 1000, 0.001);
                        const speedBytesPerSecond = downloadedBytes / elapsedSeconds;
                        const progressText =
                            totalBytes > 0
                                ? getText(
                                      `下载进度: ${((downloadedBytes / totalBytes) * 100).toFixed(1)}% (${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}) ${formatBytes(speedBytesPerSecond)}/s`,
                                      `Download progress: ${((downloadedBytes / totalBytes) * 100).toFixed(1)}% (${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}) ${formatBytes(speedBytesPerSecond)}/s`
                                  )
                                : getText(
                                      `下载中: ${formatBytes(downloadedBytes)} ${formatBytes(speedBytesPerSecond)}/s`,
                                      `Downloading: ${formatBytes(downloadedBytes)} ${formatBytes(speedBytesPerSecond)}/s`
                                  );

                        const paddedText =
                            progressText.length < lastLineLength
                                ? progressText + " ".repeat(lastLineLength - progressText.length)
                                : progressText;
                        process.stdout.write(`\r${paddedText}`);
                        lastLineLength = paddedText.length;
                        lastRenderAt = now;
                        progressVisible = true;
                    };

                    const fileStream = fs.createWriteStream(outFilePath);
                    res.on("data", chunk => {
                        downloadedBytes += chunk.length;
                        renderProgress(false);
                    });
                    res.pipe(fileStream);
                    fileStream.on("finish", () => {
                        renderProgress(true);
                        if (progressVisible) {
                            process.stdout.write("\n");
                        }
                        fileStream.close(() => resolve());
                    });
                    fileStream.on("error", err => {
                        if (progressVisible) {
                            process.stdout.write("\n");
                        }
                        try {
                            fs.unlinkSync(outFilePath);
                        } catch {
                            // ignore cleanup error
                        }
                        reject(err);
                    });
                }
            );
            request.on("error", reject);
        });

    await fetchOnce(url, maxRedirects);
};

const fetchJson = async url =>
    new Promise((resolve, reject) => {
        https
            .get(
                url,
                {
                    headers: {
                        Accept: "application/vnd.github+json",
                        "User-Agent": "aistudio-to-api setup-auth",
                    },
                },
                res => {
                    const chunks = [];
                    res.on("data", chunk => chunks.push(chunk));
                    res.on("end", () => {
                        const body = Buffer.concat(chunks).toString("utf-8");
                        if (res.statusCode !== 200) {
                            reject(
                                new Error(
                                    getText(
                                        `GitHub API 请求失败 (${res.statusCode}): ${body.slice(0, 300)}`,
                                        `GitHub API request failed (${res.statusCode}): ${body.slice(0, 300)}`
                                    )
                                )
                            );
                            return;
                        }
                        try {
                            resolve(JSON.parse(body));
                        } catch (error) {
                            reject(
                                new Error(
                                    getText(
                                        `解析 GitHub API 响应失败: ${error.message}`,
                                        `Failed to parse GitHub API response: ${error.message}`
                                    )
                                )
                            );
                        }
                    });
                }
            )
            .on("error", reject);
    });

const selectCamoufoxAsset = (assets, platform, arch) => {
    if (!Array.isArray(assets)) return null;

    const isZip = a => typeof a?.name === "string" && a.name.toLowerCase().endsWith(".zip");
    const nameOf = a => String(a?.name || "").toLowerCase();

    const hasAny = (name, tokens) => tokens.some(t => name.includes(t));

    const isWindows = name => hasAny(name, ["win", "windows"]);
    const isLinux = name => hasAny(name, ["lin", "linux"]);
    const isDarwin = name => hasAny(name, ["mac", "macos", "osx", "darwin"]);

    const isArm64 = name => hasAny(name, ["arm64", "aarch64"]);
    const isX64 = name => hasAny(name, ["x86_64", "x64", "amd64"]);

    const platformMatcher = name => {
        if (platform === "win32") return isWindows(name);
        if (platform === "linux") return isLinux(name);
        if (platform === "darwin") return isDarwin(name);
        return false;
    };

    const archMatcher = name => {
        if (arch === "arm64") return isArm64(name);
        if (arch === "x64") return isX64(name);
        return false;
    };

    const candidates = assets
        .filter(a => isZip(a))
        .filter(a => platformMatcher(nameOf(a)))
        .filter(a => archMatcher(nameOf(a)));

    if (candidates.length === 0) return null;

    candidates.sort((a, b) => (b.size || 0) - (a.size || 0));
    return candidates[0];
};

const extractZip = (zipFilePath, destinationDir) => {
    if (process.platform === "win32") {
        execOrThrow(
            "powershell",
            [
                "-NoProfile",
                "-Command",
                `Expand-Archive -Path "${zipFilePath}" -DestinationPath "${destinationDir}" -Force`,
            ],
            { cwd: PROJECT_ROOT }
        );
        return;
    }

    const unzipCheck = spawnSync("unzip", ["-v"], { stdio: "ignore" });
    if (unzipCheck.error || unzipCheck.status !== 0) {
        throw new Error(
            getText(
                '缺少 "unzip" 命令。请安装它（macOS 通常已预装），或设置 CAMOUFOX_URL 并手动解压。',
                'Missing "unzip" command. Please install it (macOS usually has it), or set CAMOUFOX_URL and extract manually.'
            )
        );
    }

    execOrThrow("unzip", ["-q", zipFilePath, "-d", destinationDir], { cwd: PROJECT_ROOT });
};

const walkFiles = (rootDir, maxDepth, onEntry) => {
    const stack = [{ depth: 0, dir: rootDir }];
    while (stack.length > 0) {
        const current = stack.pop();
        const entries = fs.readdirSync(current.dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(current.dir, entry.name);
            onEntry(fullPath, entry);
            if (entry.isDirectory() && current.depth < maxDepth) {
                stack.push({ depth: current.depth + 1, dir: fullPath });
            }
        }
    }
};

const locatePath = (rootDir, maxDepth, predicate) => {
    let found = null;
    walkFiles(rootDir, maxDepth, (fullPath, entry) => {
        if (found) return;
        if (predicate(fullPath, entry)) found = fullPath;
    });
    return found;
};

const ensureCamoufoxExecutable = async () => {
    const { installDir, expectedExecutablePath, expectedExecutableName, expectedAppDirName } =
        getCamoufoxInstallConfig();

    if (pathExists(expectedExecutablePath)) return expectedExecutablePath;

    const version = process.env.CAMOUFOX_VERSION || DEFAULT_CAMOUFOX_VERSION;
    const tag = `${GITHUB_RELEASE_TAG_PREFIX}${version}`;

    const camoufoxUrlFromEnv = process.env.CAMOUFOX_URL;
    let downloadUrl = camoufoxUrlFromEnv;

    if (!downloadUrl) {
        const apiUrl = `https://api.github.com/repos/daijro/camoufox/releases/tags/${tag}`;
        const release = await fetchJson(apiUrl);
        const asset = selectCamoufoxAsset(release?.assets, process.platform, process.arch);

        if (!asset?.browser_download_url) {
            const assetNames = Array.isArray(release?.assets) ? release.assets.map(a => a?.name).filter(Boolean) : [];
            throw new Error(
                [
                    getText(
                        `无法找到适用于 platform=${process.platform} arch=${process.arch} 的 Camoufox 资源。`,
                        `Unable to find a Camoufox asset for platform=${process.platform} arch=${process.arch}.`
                    ),
                    getText(
                        `请设置 CAMOUFOX_URL 为直接下载链接，或手动下载到 ${path.relative(PROJECT_ROOT, installDir)}。`,
                        `Please set CAMOUFOX_URL to a direct download URL, or download it manually into ${path.relative(PROJECT_ROOT, installDir)}.`
                    ),
                    assetNames.length > 0
                        ? getText(`可用资源: ${assetNames.join(", ")}`, `Available assets: ${assetNames.join(", ")}`)
                        : getText("发布版本中没有找到资源。", "No assets found in release."),
                ].join("\n")
            );
        }

        downloadUrl = asset.browser_download_url;
    }

    ensureDir(installDir);

    const zipFilePath = path.join(PROJECT_ROOT, "camoufox.zip");
    const proxySummary = getProxySummaryFromEnv();

    console.log(getText("[2/4] 检查 Camoufox...", "[2/4] Checking Camoufox..."));
    console.log(getText(`正在下载 Camoufox (${version})...`, `Downloading Camoufox (${version})...`));
    console.log(getText(`下载地址: ${downloadUrl}`, `Download URL: ${downloadUrl}`));
    if (proxySummary.enabled) {
        console.log(
            getText(
                `下载代理: ${proxySummary.server}${proxySummary.envKey ? ` (${proxySummary.envKey})` : ""}`,
                `Download proxy: ${proxySummary.server}${proxySummary.envKey ? ` (${proxySummary.envKey})` : ""}`
            )
        );
    } else {
        console.log(
            getText(
                "下载代理: 未检测到代理环境变量，当前为直连下载。",
                "Download proxy: no proxy environment variable detected, downloading directly."
            )
        );
    }

    await downloadFile(downloadUrl, zipFilePath);
    console.log(getText("下载完成。", "Download complete."));

    console.log(getText("[3/4] 正在解压 Camoufox...", "[3/4] Extracting Camoufox..."));
    extractZip(zipFilePath, installDir);

    try {
        fs.unlinkSync(zipFilePath);
    } catch {
        // ignore cleanup error
    }

    if (!pathExists(expectedExecutablePath)) {
        if (expectedAppDirName) {
            const foundApp = locatePath(
                installDir,
                4,
                (fullPath, entry) => entry.isDirectory() && entry.name === expectedAppDirName
            );
            if (foundApp) {
                const targetApp = path.join(installDir, expectedAppDirName);
                if (!pathExists(targetApp)) {
                    fs.renameSync(foundApp, targetApp);
                }
            }
        } else {
            const foundExe = locatePath(
                installDir,
                4,
                (fullPath, entry) => entry.isFile() && entry.name === expectedExecutableName
            );
            if (foundExe) {
                const targetExe = path.join(installDir, expectedExecutableName);
                if (!pathExists(targetExe)) {
                    fs.renameSync(foundExe, targetExe);
                }
            }
        }
    }

    if (!pathExists(expectedExecutablePath)) {
        throw new Error(
            [
                getText(
                    "Camoufox 解压完成，但未找到可执行文件。",
                    "Camoufox extraction completed, but the executable was not found."
                ),
                getText(`预期路径: ${expectedExecutablePath}`, `Expected: ${expectedExecutablePath}`),
                getText(
                    "请尝试删除 camoufox 目录并重新运行设置，或手动设置 CAMOUFOX_EXECUTABLE_PATH。",
                    "Try deleting the camoufox directory and rerun setup, or set CAMOUFOX_EXECUTABLE_PATH manually."
                ),
            ].join("\n")
        );
    }

    if (process.platform !== "win32") {
        try {
            fs.chmodSync(expectedExecutablePath, 0o755);
        } catch {
            // ignore chmod error
        }
    }

    return expectedExecutablePath;
};

const ensureNodeModules = () => {
    console.log(getText("[1/4] 检查 Node.js 依赖...", "[1/4] Checking Node.js dependencies..."));
    const nodeModulesDir = path.join(PROJECT_ROOT, "node_modules");
    if (pathExists(nodeModulesDir)) {
        console.log(getText("依赖已存在，跳过安装。", "Dependencies exist, skipping installation."));
        return;
    }
    console.log(getText("正在安装 npm 依赖...", "Installing npm dependencies..."));
    execOrThrow(npmCommand(), ["install"], { cwd: PROJECT_ROOT, shell: true });
};

const loadEnvConfig = () => {
    require("dotenv").config({ path: path.resolve(__dirname, "..", "..", ".env") });
};

const runSaveAuth = (camoufoxExecutablePath, selectedAccount, options) => {
    console.log(getText("[4/4] 启动认证保存工具...", "[4/4] Starting auth save tool..."));
    console.log("");
    console.log("==========================================");
    console.log(
        options.nonInteractive
            ? getText("  正在以无交互模式运行认证流程", "  Running authentication flow in non-interactive mode")
            : getText("  请按提示在新打开的 Camoufox 窗口中操作", "  Please follow the prompts to login")
    );
    console.log("==========================================");
    console.log("");

    const env = {
        ...process.env,
        CAMOUFOX_EXECUTABLE_PATH: camoufoxExecutablePath,
        SETUP_AUTH_DEBUG_UI: String(options.debugUi),
        SETUP_AUTH_HEADLESS: String(options.headless),
        SETUP_AUTH_LANG: lang, // Pass selected language to saveAuth.js
        SETUP_AUTH_LOGIN_TIMEOUT_MS: String(options.loginTimeoutMs || 300000),
        SETUP_AUTH_NON_INTERACTIVE: String(options.nonInteractive),
    };

    if (selectedAccount) {
        env.AUTO_FILL_EMAIL = selectedAccount.email;
        env.AUTO_FILL_PWD = selectedAccount.password;
    }
    const recoveryEmail = options.recoveryEmail || selectedAccount?.recoveryEmail;
    if (recoveryEmail) {
        env.SETUP_AUTH_RECOVERY_EMAIL = recoveryEmail;
    }
    const totpSecret = options.totpSecret || selectedAccount?.totpSecret;
    if (totpSecret) {
        env.SETUP_AUTH_TOTP_SECRET = totpSecret;
    }

    const result = spawnSync(process.execPath, [path.join("scripts", "auth", "saveAuth.js")], {
        cwd: PROJECT_ROOT,
        env,
        stdio: "inherit",
    });

    if (result.error) throw result.error;
    if (typeof result.status === "number" && result.status !== 0) {
        throw new Error(
            getText("认证保存失败。请查看上方错误信息。", "Auth save failed. Please check error messages above.")
        );
    }
};

const main = async () => {
    const cliOptions = parseCliArgs(process.argv.slice(2));
    if (cliOptions.help) {
        printHelp();
        process.exit(0);
    }

    if (cliOptions.lang !== undefined) {
        lang = normalizeLanguage(cliOptions.lang);
    }

    ensureNodeModules();
    loadEnvConfig();

    const options = buildRuntimeOptions(cliOptions);
    if (options.hasExplicitLang || options.nonInteractive) {
        lang = options.lang;
    } else {
        await selectLanguage();
    }

    console.log("");
    console.log("==========================================");
    console.log(getText("  AI Studio To API - 认证设置", "  AI Studio To API - Auth Setup"));
    console.log("==========================================");
    console.log(getText(`操作系统: ${os.platform()}  架构: ${os.arch()}`, `OS: ${os.platform()}  Arch: ${os.arch()}`));
    console.log("");

    const selectedAccount = await resolveSelectedAccount(options);
    if (options.nonInteractive) {
        if (!selectedAccount?.email) {
            throw new Error(
                getText(
                    "无交互模式需要可用的账号凭据。请使用 --email/--password，或通过 --account 从 users.csv 选择账号。",
                    "Non-interactive mode requires account credentials. Use --email/--password or select one from users.csv via --account."
                )
            );
        }
        if (!selectedAccount.password) {
            throw new Error(
                getText(
                    "无交互模式需要账号密码。请补充 --password，或确保 users.csv 中包含该账号的密码。",
                    "Non-interactive mode requires a password. Provide --password or ensure the selected users.csv entry includes one."
                )
            );
        }
    }

    let camoufoxExecutablePath = process.env.CAMOUFOX_EXECUTABLE_PATH;
    if (!camoufoxExecutablePath) {
        camoufoxExecutablePath = await ensureCamoufoxExecutable();
    }

    console.log(
        getText(`Camoufox 可执行文件: ${camoufoxExecutablePath}`, `Camoufox executable: ${camoufoxExecutablePath}`)
    );

    if (process.platform === "darwin") {
        console.log("");
        console.log(
            getText(
                '如果首次运行被 Gatekeeper 阻止，请前往 "系统设置 -> 隐私与安全性" 允许此应用后重试。',
                'If the first run is blocked by Gatekeeper, please go to "System Settings -> Privacy & Security" to allow the app and try again.'
            )
        );
    }

    runSaveAuth(camoufoxExecutablePath, selectedAccount, options);

    console.log("");
    console.log("==========================================");
    console.log(getText("  认证设置完成！", "  Auth setup complete!"));
    console.log("==========================================");
    console.log("");
    console.log(getText('认证文件已保存到 "configs/auth"。', 'Auth files saved to "configs/auth".'));
    console.log(getText('现在可以运行 "npm start" 启动服务器。', 'You can now run "npm start" to start the server.'));
};

main().catch(error => {
    console.error("");
    console.error(getText("错误:", "ERROR:"), error?.message || error);
    process.exit(1);
});

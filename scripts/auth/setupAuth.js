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

const DEFAULT_CAMOUFOX_VERSION = "135.0.1-beta.24";
const GITHUB_RELEASE_TAG_PREFIX = "v";

const PROJECT_ROOT = path.join(__dirname, "..", "..");

// Language setting (will be set after user selection)
let lang = "zh";

// Bilingual text helper
const getText = (zh, en) => (lang === "zh" ? zh : en);

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
            const trimmed = answer.trim();
            if (trimmed === "2" || trimmed.toLowerCase() === "en" || trimmed.toLowerCase() === "english") {
                lang = "en";
            } else {
                lang = "zh";
            }
            resolve(lang);
        });
    });

// Select account from users.csv
const selectAccountFromCSV = () =>
    new Promise(resolve => {
        const csvPath = path.join(PROJECT_ROOT, "users.csv");
        if (!fs.existsSync(csvPath)) {
            resolve(null);
            return;
        }

        const content = fs.readFileSync(csvPath, "utf-8");
        const lines = content.split(/\r?\n/).filter(line => line.trim() !== "");

        // CSV parser that handles double quotes
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

        // Filter out headers (lines without @)
        const accounts = lines
            .map(line => parseCSVLine(line))
            .filter(parts => parts.some(p => p.includes("@")))
            .map(parts => {
                const email = parts.find(p => p.includes("@"));
                // Default: Email first, then Password
                // Based on user's instruction: default is email, password
                const emailIdx = parts.indexOf(email);
                const password =
                    parts[emailIdx + 1] || parts.find(p => p !== email && p.length > 5 && !p.includes("@"));
                return { email, password };
            })
            .filter(acc => acc.email);

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
        accounts.forEach((acc, i) => {
            console.log(`  ${i + 1}. ${acc.email}`);
        });
        console.log("==========================================");

        rl.question("> ", answer => {
            rl.close();
            const idx = parseInt(answer.trim());
            if (!isNaN(idx) && idx > 0 && idx <= accounts.length) {
                resolve({ ...accounts[idx - 1], index: idx });
            } else {
                resolve(null);
            }
        });
    });

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

    const fetchOnce = (currentUrl, redirectsLeft) =>
        new Promise((resolve, reject) => {
            const request = https.get(
                currentUrl,
                {
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

                    const fileStream = fs.createWriteStream(outFilePath);
                    res.pipe(fileStream);
                    fileStream.on("finish", () => fileStream.close(() => resolve()));
                    fileStream.on("error", err => {
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

    console.log(getText("[2/4] 检查 Camoufox...", "[2/4] Checking Camoufox..."));
    console.log(getText(`正在下载 Camoufox (${version})...`, `Downloading Camoufox (${version})...`));
    console.log(getText(`下载地址: ${downloadUrl}`, `Download URL: ${downloadUrl}`));

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

const runSaveAuth = (camoufoxExecutablePath, selectedAccount) => {
    console.log(getText("[4/4] 启动认证保存工具...", "[4/4] Starting auth save tool..."));
    console.log("");
    console.log("==========================================");
    console.log(getText("  请按提示在新打开的 Camoufox 窗口中操作", "  Please follow the prompts to login"));
    console.log("==========================================");
    console.log("");

    const env = {
        ...process.env,
        CAMOUFOX_EXECUTABLE_PATH: camoufoxExecutablePath,
        SETUP_AUTH_LANG: lang, // Pass selected language to saveAuth.js
    };

    if (selectedAccount) {
        env.AUTO_FILL_EMAIL = selectedAccount.email;
        env.AUTO_FILL_PWD = selectedAccount.password;
        env.AUTH_INDEX_OVERRIDE = (selectedAccount.index + 100).toString();
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
    const args = process.argv.slice(2);
    if (args.includes("-h") || args.includes("--help")) {
        console.log("Usage: npm run setup-auth");
        console.log("");
        console.log("Optional env vars:");
        console.log("  CAMOUFOX_VERSION=135.0.1-beta.24");
        console.log("  CAMOUFOX_URL=<direct zip url>");
        console.log("  CAMOUFOX_EXECUTABLE_PATH=<path to camoufox executable>");
        process.exit(0);
    }

    // Ask user to select language first
    await selectLanguage();

    // Check for users.csv and ask for account selection
    const selectedAccount = await selectAccountFromCSV();

    console.log("");
    console.log("==========================================");
    console.log(getText("  AI Studio To API - 认证设置", "  AI Studio To API - Auth Setup"));
    console.log("==========================================");
    console.log(getText(`操作系统: ${os.platform()}  架构: ${os.arch()}`, `OS: ${os.platform()}  Arch: ${os.arch()}`));
    console.log("");

    ensureNodeModules();
    loadEnvConfig();

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

    runSaveAuth(camoufoxExecutablePath, selectedAccount);

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

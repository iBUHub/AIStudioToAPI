const fs = require("fs").promises;
const path = require("path");
const { randomUUID } = require("crypto");
const { spawn } = require("child_process");

async function acquireProfileLock(profileDir, profileId) {
    const lockPath = path.join(profileDir, ".agent-browser.lock");
    const token = randomUUID();
    const record = { pid: process.pid, profileId, purpose: "aistudio-to-api", token };
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            await fs.writeFile(lockPath, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
            return async () => {
                for (const nativeLock of [".parentlock", "parent.lock", "lock"]) {
                    await fs.rm(path.join(profileDir, nativeLock), { force: true });
                }
                try {
                    const current = JSON.parse(await fs.readFile(lockPath, "utf8"));
                    if (current.pid === process.pid && current.token === token) await fs.rm(lockPath, { force: true });
                } catch (error) {
                    if (error.code !== "ENOENT") throw error;
                }
            };
        } catch (error) {
            if (error.code !== "EEXIST") throw error;
            let existing;
            try {
                existing = JSON.parse(await fs.readFile(lockPath, "utf8"));
            } catch {
                throw new Error(`Camoufox profile lock is malformed: ${lockPath}`);
            }
            if (Number.isInteger(existing.pid) && isRunning(existing.pid)) {
                throw new Error(
                    `Camoufox profile is locked by PID ${existing.pid} (${existing.purpose || "unknown"}).`
                );
            }
            await fs.rm(lockPath, { force: true });
        }
    }
    throw new Error(`Camoufox profile lock changed while acquiring it: ${lockPath}`);
}

function isRunning(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

async function startFocusGuard() {
    if (process.platform !== "darwin") return undefined;
    const script = `import AppKit\nimport CoreGraphics\nimport Darwin\nimport Foundation\nlet parentPid: pid_t = pid_t(CommandLine.arguments[1])!\nlet managedBundle = "org.mozilla.camoufox"\nvar target = NSWorkspace.shared.frontmostApplication\nvar userOwnsCamoufox = false\nprint("READY"); fflush(stdout)\nwhile kill(parentPid, 0) == 0 {\n if let frontmost = NSWorkspace.shared.frontmostApplication {\n  if frontmost.bundleIdentifier == managedBundle {\n   let clicked = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: .leftMouseDown) < 0.20\n   if clicked { userOwnsCamoufox = true }\n   if !userOwnsCamoufox, let previous = target, !previous.isTerminated { previous.activate(options: []) }\n  } else { target = frontmost; userOwnsCamoufox = false }\n }\n usleep(50_000)\n}`;
    const child = spawn("/usr/bin/swift", ["-e", script, String(process.pid)], { stdio: ["ignore", "pipe", "ignore"] });
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Camoufox focus guard did not start.")), 5000);
        child.stdout.on("data", b => {
            if (b.toString().includes("READY")) {
                clearTimeout(timer);
                resolve();
            }
        });
        child.once("error", reject);
    });
    return () => child.kill("SIGTERM");
}

module.exports = { acquireProfileLock, startFocusGuard };

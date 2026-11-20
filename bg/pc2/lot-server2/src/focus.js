// change-log:
// - 2026-11-21: UM12/UM06 DLL로 1회 AF를 시도한다. 실패하면 호출자가 촬영만 한다.
// related files:
// - bg/pc2/lot-server2/src/microscope-ctl.ps1
// - bg/pc2/lot-server2/vendor/vitiny/mltcCom.dll

import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DLL_DIR = path.resolve(__dirname, "../vendor/vitiny");
const SCRIPT = path.resolve(__dirname, "microscope-ctl.ps1");
const FOCUS_TIMEOUT_MS = 20000;

export function parseFocusStdout(stdout) {
  const lines = String(stdout || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (!lines[i].startsWith("{")) continue;
    try {
      return JSON.parse(lines[i]);
    } catch {
      // 앞줄의 로그를 건너뛴다.
    }
  }
  return null;
}

export function focusConfirmed(focus) {
  return Boolean(
    focus &&
      focus.ok === true &&
      (focus.af === "done" || focus.af === "accepted"),
  );
}

function powershell32() {
  const root = process.env.SystemRoot || "C:\\Windows";
  return path.join(
    root,
    "SysWOW64",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
}

function runFile(file, args, timeoutMs) {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 1_000_000 },
      (err, stdout, stderr) => {
        resolve({
          err,
          stdout: stdout?.toString() || "",
          stderr: stderr?.toString() || "",
        });
      },
    );
  });
}

export async function tryFocus() {
  if (process.platform !== "win32") {
    return { ok: false, reason: "not-windows" };
  }
  const dll = path.join(DLL_DIR, "mltcCom.dll");
  if (!fs.existsSync(dll) || !fs.existsSync(SCRIPT)) {
    return { ok: false, reason: "dll-missing" };
  }
  const ps = powershell32();
  if (!fs.existsSync(ps)) {
    return { ok: false, reason: "powershell-missing" };
  }
  const run = await runFile(
    ps,
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      SCRIPT,
      "-DllDir",
      DLL_DIR,
    ],
    FOCUS_TIMEOUT_MS,
  );
  const parsed = parseFocusStdout(run.stdout);
  if (parsed) return parsed;
  const detail = `${run.stderr || run.err?.message || ""}`.trim().slice(0, 400);
  return { ok: false, reason: "focus-failed", detail };
}

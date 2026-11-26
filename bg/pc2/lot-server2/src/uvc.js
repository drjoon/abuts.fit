// change-log:
// - 2026-11-26: UM20은 mltcCom ComInitial이 안 되므로 UVC 노출·밝기·포커스를 건다.
// related files:
// - bg/pc2/lot-server2/src/uvc-ctl.ps1
// - bg/pc2/lot-server2/src/watch.js

import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseFocusStdout } from "./focus.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(__dirname, "uvc-ctl.ps1");
const TIMEOUT_MS = 12000;

function powershellAt(folder) {
  const root = process.env.SystemRoot || "C:\\Windows";
  return path.join(root, folder, "WindowsPowerShell", "v1.0", "powershell.exe");
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

/** DirectShow UVC: exposure/brightness/gain + focus auto. 64-bit PowerShell. */
export async function tryUvc(deviceName = "") {
  if (process.platform !== "win32") {
    return { ok: false, af: "none", reason: "not-windows", path: "uvc" };
  }
  if (!fs.existsSync(SCRIPT)) {
    return { ok: false, af: "none", reason: "script-missing", path: "uvc" };
  }
  const args = [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    SCRIPT,
    "-DeviceName",
    String(deviceName || ""),
  ];
  const hosts = [powershellAt("System32"), powershellAt("SysWOW64")].filter((file) =>
    fs.existsSync(file),
  );
  if (!hosts.length) {
    return { ok: false, af: "none", reason: "powershell-missing", path: "uvc" };
  }
  let last = null;
  for (const ps of hosts) {
    const run = await runFile(ps, args, TIMEOUT_MS);
    const parsed = parseFocusStdout(run.stdout);
    if (parsed?.ok) return { ...parsed, path: parsed.path || "uvc", host: ps };
    last = parsed
      ? { ...parsed, path: parsed.path || "uvc", host: ps }
      : {
          ok: false,
          af: "none",
          reason: "uvc-failed",
          detail: `${run.stderr || run.err?.message || ""}`.trim().slice(0, 400),
          path: "uvc",
          host: ps,
        };
    const reason = String(last.reason || "");
    if (!reason.startsWith("cocreate") && reason !== "exception") break;
  }
  return last;
}

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

function powershellHosts() {
  const root = process.env.SystemRoot || "C:\\Windows";
  // Sysnative is the real 64-bit System32 when this node is 32-bit.
  const folders = ["Sysnative", "System32", "SysWOW64"];
  const hosts = [];
  for (const folder of folders) {
    const file = path.join(root, folder, "WindowsPowerShell", "v1.0", "powershell.exe");
    if (fs.existsSync(file) && !hosts.includes(file)) hosts.push(file);
  }
  return hosts;
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
  const hosts = powershellHosts();
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

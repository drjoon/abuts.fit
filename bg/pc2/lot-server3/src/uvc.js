// change-log:
// - 2026-11-26: UvcTool.exe(MF IUnknown)로 밝기 제어. PS Add-Type COM은 이 PC에서 Activate 실패.
// - 2026-11-26: UM20은 mltcCom ComInitial이 안 되므로 UVC 노출·밝기·포커스를 건다.
// related files:
// - bg/pc2/lot-server2/src/UvcTool.exe
// - bg/pc2/lot-server2/src/UvcTool.cs
// - bg/pc2/lot-server2/src/uvc-ctl.ps1
// - bg/pc2/lot-server2/src/watch.js

import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseFocusStdout } from "./focus.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOOL = path.resolve(__dirname, "UvcTool.exe");
const SCRIPT = path.resolve(__dirname, "uvc-ctl.ps1");
const TIMEOUT_MS = 12000;

function powershellHosts() {
  const root = process.env.SystemRoot || "C:\\Windows";
  const exe = (folder) =>
    path.join(root, folder, "WindowsPowerShell", "v1.0", "powershell.exe");
  if (process.arch === "x64") {
    const file = exe("System32");
    return fs.existsSync(file) ? [file] : [];
  }
  return ["Sysnative", "System32"]
    .map(exe)
    .filter((file, index, all) => fs.existsSync(file) && all.indexOf(file) === index);
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

async function tryUvcTool(deviceName) {
  if (!fs.existsSync(TOOL)) return null;
  const run = await runFile(TOOL, [String(deviceName || "Digital Microscope")], TIMEOUT_MS);
  const parsed = parseFocusStdout(run.stdout);
  if (parsed) {
    return {
      ...parsed,
      path: parsed.path || "uvc-tool",
      tool: "UvcTool.exe",
    };
  }
  return {
    ok: false,
    af: "none",
    reason: "uvc-tool-failed",
    detail: `${run.stderr || run.err?.message || run.stdout || ""}`.trim().slice(0, 400),
    path: "uvc-tool",
  };
}

async function tryUvcScript(deviceName) {
  if (!fs.existsSync(SCRIPT)) {
    return { ok: false, af: "none", reason: "script-missing", path: "uvc" };
  }
  const args = [
    "-Sta",
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

/** UVC 밝기(최대)·가능하면 노출/포커스. 우선 UvcTool.exe. */
export async function tryUvc(deviceName = "") {
  if (process.platform !== "win32") {
    return { ok: false, af: "none", reason: "not-windows", path: "uvc" };
  }
  const tool = await tryUvcTool(deviceName);
  if (tool?.ok) return tool;
  const script = await tryUvcScript(deviceName);
  if (script?.ok) return script;
  return tool?.reason ? tool : script;
}

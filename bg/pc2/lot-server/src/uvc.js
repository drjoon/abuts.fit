// change-log:
// - 2026-11-27: 밝기를 255로 고정하지 않는다. 저장된 화질 설정(camera-settings.js)을 UvcTool.exe apply로 건다.
//   uvcGet/uvcSet(get/set 모드)로 모달에서 읽고 바꾼다. uvc-ctl.ps1 대체 경로는 LOT_UVC_SCRIPT=1일 때만(밝기 최대로 올린다).
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
import { loadSettings, uvcSpec } from "./camera-settings.js";

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

async function tryUvcTool(deviceName, spec) {
  if (!fs.existsSync(TOOL)) return null;
  const args = [String(deviceName || "Digital Microscope")];
  if (spec) args.push("apply", spec);
  const run = await runFile(TOOL, args, TIMEOUT_MS);
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

/** UVC 노출·포커스 + 저장된 화질(밝기 128 등). 우선 UvcTool.exe. */
export async function tryUvc(deviceName = "", settings = loadSettings()) {
  if (process.platform !== "win32") {
    return { ok: false, af: "none", reason: "not-windows", path: "uvc" };
  }
  const tool = await tryUvcTool(deviceName, uvcSpec(settings));
  if (tool?.ok) return tool;
  if (String(process.env.LOT_UVC_SCRIPT || "0") !== "1") return tool || { ok: false, af: "none", reason: "uvc-tool-missing", path: "uvc" };
  const script = await tryUvcScript(deviceName);
  if (script?.ok) return script;
  return tool?.reason ? tool : script;
}

function parseJsonLine(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (!lines[i].startsWith("{")) continue;
    try {
      return JSON.parse(lines[i]);
    } catch {}
  }
  return null;
}

async function runToolMode(deviceName, mode, spec = "") {
  if (process.platform !== "win32") return { ok: false, reason: "not-windows" };
  if (!fs.existsSync(TOOL)) return { ok: false, reason: "uvc-tool-missing" };
  const args = [String(deviceName || "Digital Microscope"), mode];
  if (spec) args.push(spec);
  const run = await runFile(TOOL, args, TIMEOUT_MS);
  const parsed = parseJsonLine(run.stdout);
  if (parsed) return parsed;
  return { ok: false, reason: "uvc-tool-failed", detail: `${run.stderr || run.err?.message || run.stdout || ""}`.trim().slice(0, 300) };
}

/** 지금 카메라 값(범위·기본·현재). 장치를 잠깐 연다(스트림 중이면 실패할 수 있다). */
export function uvcGet(deviceName = "") {
  return runToolMode(deviceName, "get");
}

/** 화질만 건다(포커스·노출은 건드리지 않는다). */
export function uvcSet(deviceName = "", settings = loadSettings()) {
  return runToolMode(deviceName, "set", uvcSpec(settings));
}

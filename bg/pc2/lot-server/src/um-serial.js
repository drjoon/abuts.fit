// change-log:
// - 2026-11-26: ViTiny UM 시리즈 하드웨어 AF. CP210x 가상 COM(115200 8N2)으로 리모컨과 같은 키를 보낸다.
//   UM Viewer 1.100(NewUMControl)의 프로토콜. mltcCom/UVC로는 이 UM20 포커스를 못 바꾼다.
// - 2026-11-26: 시리얼 작업은 한 줄로 줄 세운다(AF·LED·상태가 포트를 동시에 열지 않게).
// - 2026-11-26: LED 켜기/끄기(umLed, 종료 시 umLedOffSync). LOT_LED_LEVEL(1–12)이면 켤 때 그 단계로 맞춘다.
// - 2026-11-27: EV 단계(umSetEv). LED 단계는 저장된 화질 설정(camera-settings.js)이 우선, 없으면 LOT_LED_LEVEL.
// related files:
// - bg/pc2/lot-server2/src/um-serial.ps1
// - bg/pc2/lot-server2/src/watch.js
// - bg/pc2/lot-server2/src/index.js
// - bg/pc2/lot-server2/src/focus.js

import { execFile, execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseFocusStdout } from "./focus.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(__dirname, "um-serial.ps1");

/** 마지막으로 찾은 COM 포트(다음 호출에서 먼저 시도). */
let knownPort = "";

export function umSerialEnabled() {
  return process.platform === "win32" && String(process.env.LOT_UM_SERIAL ?? "1") !== "0";
}

function powershell() {
  const root = process.env.SystemRoot || "C:\\Windows";
  const sysnative = path.join(root, "Sysnative", "WindowsPowerShell", "v1.0", "powershell.exe");
  if (process.arch !== "x64" && fs.existsSync(sysnative)) return sysnative;
  return path.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

/**
 * @param {{ action?: "status" | "af" | "afc" | "manual" | "release" | "ledon" | "ledoff", area?: "whole" | "local", timeoutMs?: number, level?: number }} [opts]
 * @returns {Promise<object>} um-serial.ps1의 JSON. ok·af(done/timeout/...)·position·startPosition·port·sn
 */
function buildArgs({ action, area, timeoutMs, level, ev = -1 }) {
  const port = String(process.env.LOT_UM_PORT || knownPort || "");
  const args = [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    SCRIPT,
    "-Action",
    action,
    "-Area",
    area,
    "-TimeoutMs",
    String(timeoutMs),
  ];
  if (port) args.push("-Port", port);
  if (level > 0) args.push("-Level", String(level));
  if (ev >= 0) args.push("-Ev", String(ev));
  return args;
}

/** LOT_LED_LEVEL: 1–12면 그 단계, 비었거나 범위 밖이면 0(현재 단계 유지). */
export function ledLevelFromEnv(value = process.env.LOT_LED_LEVEL) {
  const n = Math.floor(Number(String(value ?? "").trim()));
  return Number.isFinite(n) && n >= 1 && n <= 12 ? n : 0;
}

/** 앞 작업이 끝난 뒤에 다음 작업을 시작한다. */
let queue = Promise.resolve();

export function runUmSerial(opts = {}) {
  const job = queue.then(() => runUmSerialNow(opts));
  queue = job.catch(() => {});
  return job;
}

async function runUmSerialNow({ action = "status", area = "whole", timeoutMs = 25000, level = 0, ev = -1 } = {}) {
  if (!umSerialEnabled()) return { ok: false, reason: "disabled", path: "serial" };
  if (!fs.existsSync(SCRIPT)) return { ok: false, reason: "script-missing", path: "serial" };
  const args = buildArgs({ action, area, timeoutMs, level, ev });
  const run = await new Promise((resolve) => {
    execFile(
      powershell(),
      args,
      { timeout: timeoutMs + 10000, windowsHide: true, maxBuffer: 1_000_000 },
      (err, stdout, stderr) => resolve({ err, stdout: String(stdout || ""), stderr: String(stderr || "") }),
    );
  });
  const parsed = parseFocusStdout(run.stdout);
  if (parsed) {
    if (parsed.port) knownPort = parsed.port;
    return { ...parsed, path: "serial" };
  }
  return {
    ok: false,
    reason: "serial-failed",
    detail: `${run.stderr || run.err?.message || run.stdout}`.trim().slice(0, 300),
    path: "serial",
  };
}

/** 단일 AF. area: whole(전체 구간, ~10초) | local(현재 구간, ~5초). */
export function umAutoFocus(area = "whole") {
  return runUmSerial({ action: "af", area });
}

/** LED 켜기/끄기. 켤 때 LOT_LED_LEVEL이 있으면 그 단계로. 끝나면 원격 제어를 풀어 리모컨이 다시 듣는다. */
export function umLed(on, level = ledLevelFromEnv()) {
  return runUmSerial({ action: on ? "ledon" : "ledoff", level: on ? level : 0, timeoutMs: 8000 });
}

/** EV 단계(0–19, 10=Auto). 끝나면 원격 제어를 푼다. */
export function umSetEv(ev) {
  const n = Math.round(Number(ev));
  if (!Number.isFinite(n) || n < 0 || n > 19) return Promise.resolve({ ok: false, reason: "ev-range" });
  return runUmSerial({ action: "ev", ev: n, timeoutMs: 12000 });
}

/** 프로세스 종료 직전용 동기 LED 끄기(SIGINT/exit). 실패해도 던지지 않는다. */
export function umLedOffSync() {
  if (!umSerialEnabled() || !fs.existsSync(SCRIPT)) return { ok: false, reason: "disabled" };
  try {
    const out = execFileSync(powershell(), buildArgs({ action: "ledoff", area: "whole", timeoutMs: 8000, level: 0 }), {
      timeout: 15000,
      windowsHide: true,
    });
    return parseFocusStdout(String(out || "")) || { ok: false, reason: "serial-failed" };
  } catch (e) {
    return { ok: false, reason: "serial-failed", detail: String(e?.message || e).slice(0, 200) };
  }
}

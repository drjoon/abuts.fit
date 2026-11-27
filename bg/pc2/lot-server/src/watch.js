// change-log:
// - 2026-11-27: 목록 밖 코드도 confirm(기본 2)회 연속 같은 판독이면 ‘대기열 없음’으로 확정·ocrLog 카드에 남기고 HOLD(움직임 전까지 재시도 안 함).
// - 2026-11-27: 첫 인식·지그 교체 체감 단축: 시작 시 바로 armed, LED/EV는 스트림 뒤 비동기,
//   폴링·안정·버스트·홀드 기본값 하향, 2번째 확정은 quick 촬영. ocrLog(한 줄)를 상태에 실어 UI 카드 스트립용.
// - 2026-11-27: not_in_queue 안내에 대기 목록·카드 선택 유도. UI(station.js)가 lastError를 note에 표시.
// - 2026-11-27: 인식은 각인 전용 인식기(ocr/index.js → src/engrave)가 먼저. latest에 method·engrave(회전·글자 상자·지그 프로필).
// - 2026-11-27: 인식 안전장치: allowedLots(지금 세척.패킹 대기 목록)에 있는 코드만 결과로 낸다(목록을 못 받으면 결과 없음).
//   한 정지 구간에서 같은 코드를 LOT_OCR_CONFIRM(기본 2)번 연속 읽어야 확정. 다른 코드가 섞이면 버린다.
// - 2026-11-27: 화질 설정(camera-settings.js): 감시 시작 때 UVC 밝기 128 등 저장값, LED 단계, EV를 건다. applyCameraSettings()·previewFrame().
// - 2026-11-26: LED가 꺼져 있으면(시리얼 상태 bit1) 자동 초점을 건너뛰고 안내한다. 감시 중지 때 라이브 프레임을 비운다(옛 프레임이 켜진 LED처럼 보이던 문제).
// - 2026-11-26: 감시 시작 때 UM LED 켬(LOT_LED_LEVEL 단계), 중지·종료 때 끔(시리얼, 원격 제어는 풀어 둔다). 상태에 led.
// - 2026-11-26: 하드웨어 AF: UM 시리얼(um-serial.js, CP210x COM). 흐림이면 스트림을 끊지 않고 AF(1회째 현재 구간, 이후 전체). 수동 AF autoFocus()/POST /focus.
// - 2026-11-26: mltcCom DLL은 LOT_VITINY_DLL=1일 때만(기본 핫패스 제외). 하드웨어 AF가 없으면 OCR 직전 UVC 재제어로 스트림을 끊지 않는다.
// - 2026-11-26: 흐림/어두움인데 제어할 수 없으면 lastError에 안내(리모컨 AF·높이). 프레임 지표(lastFrame)를 상태에 넣는다.
// - 2026-11-26: OCR 실패 시 아밍당 LOT_OCR_RETRY회까지 다시 시도. tick/수동 인식은 한 번에 하나(lock).
// - 2026-11-26: 감시 중이 아닐 때 forceRecognize는 감시를 켜지 않고 1회만 찍고 스트림을 닫는다.
// - 2026-11-26: UVC는 UvcTool.exe 우선. cocreate를 fatal에서 제외. 해제 대기 900ms.
// - 2026-11-26: UM20 제어는 mltcCom 대신 UVC 노출·밝기·포커스. DLL init-failed는 쓰지 않는다.
// - 2026-11-26: LED+AF 전에 ffmpeg 스트림을 잠시 놓아 ComInitial(init-failed)을 피한다.
// - 2026-11-26: 현미경 제어 실패 시 exception detail을 로그·UI에 남긴다.
// - 2026-11-26: 감시 시작·흐림/어두움 시 LED+AF(횟수·간격 상한). 선명 전에 AF를 건다.
// - 2026-11-24: 스트림 프로파일 재시도·null readFrame 방지.
// - 2026-11-23: 상주 ffmpeg 스트림으로 감시. 프레임마다 프로세스 생성 금지.
// - 2026-11-23: 감시 프레임을 라이브 뷰(/live)로 제공한다.
// - 2026-11-23: 페달 없이 영상을 보다가 움직임이 멈추고 선명하면 로컬 OCR.
// related files:
// - bg/pc2/lot-server2/src/index.js
// - bg/pc2/lot-server2/src/camera.js
// - bg/pc2/lot-server2/src/ocr/index.js
// - bg/pc2/lot-server2/src/capture.js
// - bg/pc2/lot-server2/src/focus.js
// - bg/pc2/lot-server2/src/uvc.js
// - bg/pc2/lot-server2/src/um-serial.js
// - bg/pc2/lot-server2/public/index.html

import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import {
  createFrameStream,
  defaultStreamPath,
  getSelectedDeviceName,
  resolveDevice,
} from "./camera.js";
import { analyzeImage, grabFrames, scoreFile } from "./capture.js";
import { focusConfirmed, prepareMicroscope } from "./focus.js";
import { tryUvc, uvcSet } from "./uvc.js";
import { runUmSerial, umAutoFocus, umLed, umLedOffSync, umSerialEnabled, umSetEv, ledLevelFromEnv } from "./um-serial.js";
import { EV_AUTO, loadSettings } from "./camera-settings.js";
import { lotFileName } from "./names.js";
import { recognizeLot } from "./ocr/index.js";
import { meanAbsDiff, selectBest as pickSharpest } from "./sharpness.js";

const PHASE = {
  IDLE: "idle",
  MOVING: "moving",
  STABLE: "stable",
  FOCUSING: "focusing",
  OCR: "ocr",
  HOLD: "hold",
  ERROR: "error",
};

function numEnv(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? n : fallback;
}

export function createWatcher({
  captureDir,
  deviceName = "",
  log = () => {},
  onRecognize = () => {},
  /** () => Promise<Set<string> | null>. 주면 그 코드만 인식 결과로 낸다. null이면(목록 실패) 결과를 내지 않는다. */
  allowedLots = null,
} = {}) {
  let deviceNameOverride = String(deviceName || "").trim();
  const currentDeviceName = () =>
    deviceNameOverride || getSelectedDeviceName() || "";
  const motionThreshold = numEnv("LOT_MOTION_THRESHOLD", 6);
  const sharpThreshold = numEnv("LOT_SHARP_THRESHOLD", 8);
  const stableNeeded = Math.max(1, Math.floor(numEnv("LOT_STABLE_FRAMES", 2)));
  // 폴링·버스트를 너무 조이면 CPU·카메라가 버벅인다. 기본은 체감 빠르게.
  const pollMs = Math.max(350, Math.floor(numEnv("LOT_WATCH_POLL_MS", 700)));
  const holdMs = Math.max(400, Math.floor(numEnv("LOT_HOLD_MS", 900)));
  const burstFrames = Math.max(1, Math.floor(numEnv("LOT_OCR_FRAMES", 2)));
  const streamFps = Math.max(1, Math.min(5, Number(process.env.LOT_STREAM_FPS || 3)));
  // 어두우면 LED+AF를 다시 건다(0–255 평균).
  const darkMean = Math.max(1, numEnv("LOT_DARK_MEAN", 28));
  // 흐림/어두움 재시도: 쿨다운·아밍당 횟수 상한(무한 루프 금지).
  const afCooldownMs = Math.max(3000, Math.floor(numEnv("LOT_AF_COOLDOWN_MS", 8000)));
  const afMaxPerArm = Math.max(1, Math.min(5, Math.floor(numEnv("LOT_AF_MAX_PER_ARM", 3))));
  // OCR 실패 시 같은 아밍에서 다시 읽는 횟수(움직임 없이).
  const ocrRetry = Math.max(0, Math.min(5, Math.floor(numEnv("LOT_OCR_RETRY", 2))));
  // 같은 코드를 연속 몇 번 읽어야 확정하는지(1–4).
  const confirmNeeded = Math.max(1, Math.min(4, Math.floor(numEnv("LOT_OCR_CONFIRM", 2))));
  /** 목록 밖이라 버린 마지막 판독. */
  let lastRejected = null;
  /** 마지막으로 건 화질 설정 결과. */
  let lastSettings = null;
  /** 촬영·인식 한 줄 로그(최신 앞). UI 가로 카드 스트립. */
  const ocrLog = [];
  const OCR_LOG_MAX = 40;
  function pushOcrLog(entry) {
    const row = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      at: new Date().toISOString(),
      ...entry,
    };
    ocrLog.unshift(row);
    if (ocrLog.length > OCR_LOG_MAX) ocrLog.length = OCR_LOG_MAX;
    return row;
  }
  // mltcCom은 이 UM20에서 ComInitial init-failed(최대 22초). 명시적으로 켤 때만 부른다.
  const useVitinyDll = String(process.env.LOT_VITINY_DLL || "0") === "1";

  let running = false;
  let loopPromise = null;
  let prevGray = null;
  let stableCount = 0;
  let armed = false;
  let lastLot = "";
  let lastError = "";
  let phase = PHASE.IDLE;
  let latest = null;
  let deviceLabel = "";
  /** @type {object | null} */
  let lastFocus = null;
  let dllDead = !useVitinyDll;
  let ocrFailsThisArm = 0;
  /** UM 시리얼 AF 결과(마지막). */
  let lastAf = null;
  /** null=아직 모름, true=COM에서 UM 확인, false=없음. */
  let serialAvailable = umSerialEnabled() ? null : false;
  /** 마지막 LED 제어 결과. ledOnByWatch: 감시 시작 때 켰으니 중지·종료 때 끈다. */
  let lastLed = null;
  let ledOnByWatch = false;
  /** 마지막 시리얼 확인에서 LED가 꺼져 있었다. */
  let ledOff = false;
  const LED_OFF_HINT = "LED가 꺼져 있어 자동 초점을 건너뜁니다. 리모컨으로 LED를 켜거나 감시를 다시 시작하세요.";
  const ledControl = String(process.env.LOT_UM_LED ?? "1") !== "0";
  /** AF로 렌즈가 움직인 직후 화면 변화는 '움직임'으로 보지 않는다. */
  let afSettleUntil = 0;
  /** @type {{ score: number, mean: number, motion: number, at: number } | null} */
  let lastFrame = null;
  /** tick과 수동 인식이 장치를 동시에 만지지 않게 직렬화. */
  let lockChain = Promise.resolve();
  function withLock(fn) {
    const run = lockChain.then(fn, fn);
    lockChain = run.catch(() => {});
    return run;
  }
  let lastAfAt = 0;
  let afAttemptsThisArm = 0;
  /** @type {Buffer | null} */
  let liveFrame = null;
  let liveAt = 0;
  /** @type {ReturnType<typeof createFrameStream> | null} */
  let stream = null;
  let streamDeviceKey = "";

  function setLiveFrame(buffer) {
    if (!buffer || !buffer.length) return;
    liveFrame = Buffer.from(buffer);
    liveAt = Date.now();
  }

  function snapshot() {
    return {
      running,
      phase,
      lastLot,
      lastError,
      device: deviceLabel,
      latest,
      live: Boolean(liveFrame),
      liveAt: liveAt || null,
      stream: Boolean(stream?.running),
      motionThreshold,
      sharpThreshold,
      darkMean,
      stableNeeded,
      pollMs,
      lastFocus,
      afAttemptsThisArm,
      lastFrame,
      ocrRetry,
      serialAf: serialAvailable,
      led: lastLed,
      ledOff,
      lastAf,
      confirmNeeded,
      lastRejected,
      lastSettings,
      ocrLog: ocrLog.slice(0, 24),
    };
  }

  async function runMicroscopePrepare(reason) {
    if (process.platform !== "win32") {
      return { ok: false, reason: "not-windows", path: "uvc" };
    }
    phase = PHASE.FOCUSING;
    // UVC 제어는 장치를 독점한다. ffmpeg를 잠시 놓고, 끝나면 반드시 놓는다.
    const resumeStream = Boolean(stream?.running) && running;
    if (stream?.running) {
      await stopStream();
      // MF Activate가 장치 해제 직후 C00D36E6 나는 경우가 있어 여유를 둔다.
      await sleep(900);
    }
    let focus;
    let dll = null;
    try {
      // LOT_VITINY_DLL=1이면 설치본 mltcCom(vendor/vitiny)을 먼저. 실패하면 UVC.
      if (!dllDead) {
        dll = await prepareMicroscope();
        if (dll?.reason === "init-failed" || dll?.reason === "exception") dllDead = true;
      }
      if (focusConfirmed(dll)) {
        focus = { ...dll, path: "dll" };
      } else {
        const uvc = await tryUvc(currentDeviceName());
        focus = focusConfirmed(uvc) || uvc?.ok ? { ...uvc, dll } : { ...(dll || {}), ...uvc, dll };
      }
    } finally {
      if (resumeStream) {
        await sleep(800);
        try {
          await ensureStream();
        } catch (err) {
          log(`uvc stream resume failed ${err?.message || err}`);
        }
      }
    }
    lastFocus = focus;
    lastAfAt = Date.now();
    const detail = [
      focus?.detail ? `detail=${String(focus.detail).slice(0, 280)}` : "",
      dll?.detail ? `dllDetail=${String(dll.detail).slice(0, 180)}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    log(
      `uvc ${reason} path=${focus?.path || "-"} af=${focus?.af || "none"} dll=${dll?.reason || dll?.af || "-"} focus=${focus?.focus || "-"} exposure=${focus?.exposure || "-"} brightness=${focus?.brightness || "-"} gain=${focus?.gain || "-"} reason=${focus?.reason || ""} ${detail}`,
    );
    if (!focusConfirmed(focus) && focus?.reason) {
      lastError = focus.detail
        ? `카메라 제어: ${focus.reason} (${String(focus.detail).slice(0, 120)})`
        : `카메라 제어: ${focus.reason}`;
    } else if (focusConfirmed(focus)) {
      lastError = "";
    }
    return focus;
  }

  function needsMicroscopeAssist(frame) {
    return frame.score < sharpThreshold || frame.mean < darkMean;
  }

  function isFatalMicroscopeReason(reason) {
    const text = String(reason || "");
    // cocreate는 구 PS 경로 실패. UvcTool.exe가 있으면 재시도한다.
    return ["exception", "powershell-missing", "script-missing", "not-windows", "uvc-tool-failed"].includes(
      text,
    );
  }

  /** UM 시리얼 AF 가능 여부를 한 번 확인한다(스트림과 무관). */
  async function probeSerial() {
    if (!umSerialEnabled()) {
      serialAvailable = false;
      return null;
    }
    const st = await runUmSerial({ action: "status" });
    serialAvailable = Boolean(st?.ok && st?.sn);
    log(`um-serial status ok=${Boolean(st?.ok)} port=${st?.port || "-"} sn=${st?.sn || "-"} fw=${st?.firmware || "-"} pos=${st?.position ?? "-"} reason=${st?.reason || ""}`);
    return st;
  }

  /** LED 켜기/끄기(시리얼). 끝나면 원격 제어를 풀어 리모컨이 다시 듣는다. */
  async function setLed(on, reason) {
    if (!ledControl || !serialAvailable) return null;
    const level = on ? loadSettings().ledLevel || ledLevelFromEnv() : 0;
    const r = await umLed(on, level).catch((e) => ({ ok: false, reason: String(e?.message || e) }));
    lastLed = { ok: Boolean(r?.ok), on: r?.ledOn ?? null, level: r?.led ?? null, reason: r?.reason || "", why: reason, at: new Date().toISOString() };
    if (r?.ok) {
      ledOnByWatch = on;
      ledOff = !on;
    }
    log(`led ${on ? "on" : "off"} (${reason}) ok=${Boolean(r?.ok)} ledOn=${r?.ledOn} level=${r?.led ?? "-"} reason=${r?.reason || ""}`);
    return r;
  }

  /** 하드웨어 AF(시리얼). 스트림은 그대로 둔다. */
  async function runSerialAf(reason, area) {
    const prevPhase = phase;
    phase = PHASE.FOCUSING;
    const before = lastFrame?.score ?? null;
    const t0 = Date.now();
    const af = await umAutoFocus(area);
    lastAfAt = Date.now();
    if (af?.reason === "led-off") {
      // 어두운 화면은 흐림이 아니다. 렌즈를 움직이지 않는다.
      ledOff = true;
      lastAf = { ok: false, af: "skipped", area, reason: "led-off", port: af?.port || "", startPosition: af?.startPosition ?? null, position: af?.position ?? null, scoreBefore: before, scoreAfter: null, ms: Date.now() - t0, at: new Date().toISOString() };
      lastError = LED_OFF_HINT;
      log(`af ${reason} skipped: led-off`);
      if (phase === PHASE.FOCUSING) phase = prevPhase === PHASE.FOCUSING ? PHASE.STABLE : prevPhase;
      return lastAf;
    }
    if (af?.ok) ledOff = false;
    afSettleUntil = Date.now() + 1500;
    if (af?.sn) serialAvailable = true;
    else if (af?.reason === "no-um-serial" || af?.reason === "disabled") serialAvailable = false;
    // AF 뒤 새 장이 들어올 시간.
    await sleep(Math.max(600, Math.floor(1500 / streamFps)));
    let after = null;
    try {
      const buf = (await stream?.readFrame()) || null;
      if (buf) {
        const a = await analyzeImage(buf);
        after = Number(a.score.toFixed(2));
        setLiveFrame(buf);
        // 움직임 비교 기준을 AF 뒤 화면으로 바꾼다(초점 변화로 재아밍되어 AF가 반복되지 않게).
        prevGray = a.gray;
      }
    } catch {
      // 다음 tick에서 다시 잰다.
    }
    lastAf = {
      ok: Boolean(af?.ok),
      af: af?.af || "none",
      area,
      reason: af?.reason || "",
      port: af?.port || "",
      startPosition: af?.startPosition ?? null,
      position: af?.position ?? null,
      scoreBefore: before,
      scoreAfter: after,
      ms: Date.now() - t0,
      at: new Date().toISOString(),
    };
    log(
      `af ${reason} area=${area} ok=${lastAf.ok} af=${lastAf.af} pos=${lastAf.startPosition}->${lastAf.position} score=${before}->${after} ms=${lastAf.ms} ${lastAf.reason}`,
    );
    if (phase === PHASE.FOCUSING) phase = prevPhase === PHASE.FOCUSING ? PHASE.STABLE : prevPhase;
    return lastAf;
  }

  /** UVC 포커스가 없고 DLL AF도 없으면 소프트웨어로 초점을 바꿀 수 없다. */
  function noHardwareAf() {
    if (serialAvailable) return false;
    if (!lastFocus) return false;
    const focusHow = String(lastFocus.focus || "");
    const dllDeadOrFailed =
      dllDead ||
      lastFocus.dll?.reason === "init-failed" ||
      lastFocus.path === "mf" ||
      lastFocus.path === "uvc-tool" ||
      lastFocus.tool === "UvcTool.exe";
    return focusHow === "skip" && dllDeadOrFailed;
  }

  /** 제어로 못 고치는 흐림/어두움은 화면에 안내한다. */
  function assistHint(frame) {
    if (ledOff) return LED_OFF_HINT;
    if (frame.mean < darkMean) {
      return `화면이 어둡습니다(밝기 ${frame.mean.toFixed(0)} < ${darkMean}). LED를 켜거나 밝기를 올리세요.`;
    }
    if (serialAvailable) {
      return `자동 초점 후에도 흐립니다(선명도 ${frame.score.toFixed(1)} < ${sharpThreshold}, AF ${afAttemptsThisArm}/${afMaxPerArm}회). 현미경 높이나 시료 위치를 확인하세요.`;
    }
    return `초점이 맞지 않습니다(선명도 ${frame.score.toFixed(1)} < ${sharpThreshold}). 현미경 리모컨 AF(AFC 권장)나 높이로 초점을 맞추세요.`;
  }

  /** UVC 포커스가 없고 DLL AF도 죽은 뒤엔, 어두울 때만 재제어(흐림으로 스트림을 반복 끊지 않음). */
  function shouldAssist(frame) {
    if (!needsMicroscopeAssist(frame)) return false;
    // 시리얼 AF가 있으면 흐림은 AF로 고친다(어두움은 아래 UVC 경로).
    if (serialAvailable && frame.mean >= darkMean) return frame.score < sharpThreshold;
    if (noHardwareAf()) {
      const brightMaxed =
        Number(lastFocus?.brightLevel) > 0 &&
        Number(lastFocus?.brightLevel) >= Number(lastFocus?.brightMax || 0);
      // 이미 최대 밝기면 흐림만으로는 UVC를 다시 열지 않는다.
      if (brightMaxed && frame.mean >= darkMean) return false;
      return frame.mean < darkMean;
    }
    return true;
  }

  async function maybeAssistFocus(frame) {
    if (!shouldAssist(frame)) return false;
    // 컴파일/PowerShell 실패면 스트림을 반복해서 끊지 않는다.
    if (isFatalMicroscopeReason(lastFocus?.reason)) return false;
    if (afAttemptsThisArm >= afMaxPerArm) return false;
    if (Date.now() - lastAfAt < afCooldownMs) return false;
    afAttemptsThisArm += 1;
    if (serialAvailable && frame.mean >= darkMean) {
      // 1회째는 현재 구간(빠름), 그 뒤는 전체 구간.
      const r = await runSerialAf(`assist ${afAttemptsThisArm}/${afMaxPerArm}`, afAttemptsThisArm === 1 ? "local" : "whole");
      // LED 꺼짐·포트 사용 중은 시도 횟수에 넣지 않는다(쿨다운 뒤 다시 확인).
      if (r?.reason === "led-off" || r?.reason === "port-busy") afAttemptsThisArm -= 1;
      return true;
    }
    await runMicroscopePrepare(`assist ${afAttemptsThisArm}/${afMaxPerArm}`);
    // AF 직후 스트림이 새 장을 받을 시간을 준다.
    await sleep(Math.max(400, Math.floor(1000 / streamFps)));
    return true;
  }

  async function ensureStream() {
    const { device } = await resolveDevice(currentDeviceName());
    if (!device) {
      const err = new Error("카메라를 찾지 못했습니다.");
      err.code = "no-camera";
      throw err;
    }
    const key = `${device.name}|${device.input}`;
    if (stream && streamDeviceKey === key && stream.running) {
      deviceLabel = device.name;
      return device;
    }
    if (stream) {
      await stream.stop();
      stream = null;
    }
    deviceLabel = device.name;
    streamDeviceKey = key;
    stream = createFrameStream({
      device,
      outFile: defaultStreamPath(),
      fps: streamFps,
      log,
    });
    const buf = await stream.startUntilFrame({ waitMs: 2500, attempts: 10 });
    setLiveFrame(buf);
    return device;
  }

  async function stopStream() {
    if (!stream) return;
    await stream.stop();
    stream = null;
    streamDeviceKey = "";
  }

  async function grabOne() {
    await ensureStream();
    let buffer = null;
    for (let i = 0; i < 4; i += 1) {
      if (!stream?.running) break;
      buffer = (await stream.readFrame()) || liveFrame;
      if (buffer) break;
      await sleep(200);
    }
    if (!buffer) {
      const detail = stream?.lastStderr?.trim?.() || "";
      const err = new Error("라이브 프레임을 아직 받지 못했습니다.");
      err.code = "capture-failed";
      err.detail = detail.slice(0, 400);
      // 죽은 스트림은 다음 ensureStream에서 다시 연다.
      await stopStream();
      throw err;
    }
    let analysis;
    try {
      analysis = await analyzeImage(buffer);
    } catch (err) {
      // 깨진 장 하나 때문에 스트림을 재시작하지 않는다. 다음 폴링에서 다시 읽는다.
      return null;
    }
    setLiveFrame(buffer);
    return { ...analysis, buffer, tempDir: "" };
  }

  async function captureForOcr({ quick = false } = {}) {
    // UVC 스크립트 자체가 깨지면 장치를 다시 잡지 않는다.
    // 하드웨어 AF가 없으면(UVC focus=skip, DLL 없음) 다시 걸어도 초점은 그대로다. 스트림을 끊지 않는다.
    let focus = lastFocus;
    if (!quick && !isFatalMicroscopeReason(focus?.reason) && !noHardwareAf() && !serialAvailable) {
      focus = await runMicroscopePrepare("ocr");
    }
    const focused = focusConfirmed(focus);

    // 스트림에서 몇 장 모아 선명한 것을 고른다(추가 ffmpeg 없음).
    // 1회 인식(감시 꺼짐)에서도 스트림을 다시 연다. 닫는 건 호출측.
    // quick: 2번째 확정용 — 라이브 1장만(버스트·대기 생략).
    if (!stream?.running) {
      await ensureStream().catch(() => {});
    }
    const nFrames = quick ? 1 : burstFrames;
    const scored = [];
    for (let i = 0; i < nFrames; i += 1) {
      const buffer = (await stream?.readFrame()) || liveFrame;
      if (!buffer) continue;
      const analysis = await analyzeImage(buffer).catch(() => null);
      if (!analysis) continue;
      scored.push({
        index: i,
        score: analysis.score,
        buffer,
      });
      if (i + 1 < nFrames) await sleep(Math.max(80, Math.floor(800 / streamFps)));
    }

    let best = pickSharpest(scored);
    let tempDir = "";

    if (!best || best.score < sharpThreshold) {
      // 스트림을 잠시 멈추고 한 번만 버스트 Grab.
      await stopStream();
      await sleep(700);
      try {
        const grabbed = await grabFrames({
          captureDir,
          deviceName: currentDeviceName(),
          count: burstFrames,
        });
        tempDir = grabbed.tempDir;
        deviceLabel = grabbed.device.name;
        const fileScored = [];
        for (let index = 0; index < grabbed.names.length; index += 1) {
          const filePath = path.join(tempDir, grabbed.names[index]);
          const score = await scoreFile(filePath);
          fileScored.push({ index, score, filePath });
        }
        const fileBest = pickSharpest(fileScored);
        if (!fileBest || fileBest.score < sharpThreshold) {
          return {
            ok: false,
            reason: "blurry",
            focus,
            score: fileBest?.score || best?.score || 0,
            tempDir,
          };
        }
        const buffer = await fs.readFile(fileBest.filePath);
        setLiveFrame(buffer);
        return {
          ok: true,
          buffer,
          score: fileBest.score,
          focus,
          focused,
          tempDir,
        };
      } finally {
        if (running) await ensureStream().catch(() => {});
      }
    }

    setLiveFrame(best.buffer);
    return {
      ok: true,
      buffer: best.buffer,
      score: best.score,
      focus,
      focused,
      tempDir,
    };
  }

  /** 한 장 찍어 읽는다. 저장·확정은 하지 않는다. */
  async function readCandidate(allowed, { quick = false } = {}) {
    phase = PHASE.OCR;
    const t0 = Date.now();
    const shot = await captureForOcr({ quick });
    try {
      if (!shot.ok) {
        pushOcrLog({
          kind: "blur",
          line: `흐림·초점 부족 · ${(Date.now() - t0) / 1000}초`,
          ms: Date.now() - t0,
          score: shot.score || 0,
        });
        return { shot: null, ocr: null, unfocused: true };
      }
      const ocr = await recognizeLot(shot.buffer, allowedLots ? { allowed } : {});
      const ms = Date.now() - t0;
      const sec = (ms / 1000).toFixed(1);
      if (!ocr.success) {
        if (ocr.reason === "not_in_queue") {
          // 최종 ‘대기열 없음’ 카드는 recognizeOnce에서 confirm 후 한 장만 남긴다.
          pushOcrLog({
            kind: "read",
            lot: ocr.rejected || "",
            line: `${ocr.rejected || "?"} 판독 · ${sec}초`,
            ms,
            score: shot.score,
            reason: ocr.reason,
          });
        } else {
          pushOcrLog({
            kind: "miss",
            lot: ocr.top || "",
            line: `미확정 ${ocr.top || "-"} (${ocr.reason || "miss"}) · ${sec}초`,
            ms,
            score: shot.score,
            reason: ocr.reason || "",
          });
        }
      } else {
        pushOcrLog({
          kind: "read",
          lot: ocr.lot,
          line: `${ocr.lot} 판독 conf${Math.round(ocr.confidence || 0)} · ${sec}초`,
          ms,
          score: shot.score,
          confidence: ocr.confidence,
        });
      }
      return { shot: { buffer: shot.buffer, score: shot.score, focus: shot.focus }, ocr };
    } finally {
      if (shot.tempDir) {
        await fs.rm(shot.tempDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }

  async function recognizeOnce({ hold = true, confirm = confirmNeeded } = {}) {
    phase = PHASE.OCR;
    let allowed;
    if (allowedLots) {
      allowed = await Promise.resolve()
        .then(() => allowedLots())
        .catch(() => null);
      if (!allowed) {
        phase = PHASE.STABLE;
        lastError = "세척·패킹 대기 목록을 불러오지 못해 인식 결과를 쓰지 않습니다.";
        ocrFailsThisArm += 1;
        log("ocr skipped: queue unavailable");
        return null;
      }
    }
    // 같은 코드를 confirm번 연속으로 읽어야 확정. 시도는 confirm+1번까지.
    // 목록 밖(not_in_queue)도 같은 규칙: 2번 같은 코드면 ‘대기열 없음’으로 확정하고 HOLD(재시도 안 함).
    // 2번째부터는 quick 촬영(라이브 1장)으로 확정 대기 시간을 줄인다.
    let agreed = null;
    let count = 0;
    let lastShot = null;
    let rejectedLot = "";
    let rejectedCount = 0;
    const tAll = Date.now();
    for (let attempt = 0; attempt < confirm + 1 && count < confirm && rejectedCount < confirm; attempt += 1) {
      const { shot, ocr, unfocused } = await readCandidate(allowed, { quick: count > 0 || rejectedCount > 0 });
      if (unfocused) {
        phase = PHASE.STABLE;
        lastError = "초점이 부족해 OCR을 건너뜁니다.";
        return null;
      }
      if (!ocr.success) {
        if (ocr.reason === "not_in_queue") {
          const code = String(ocr.rejected || "").toUpperCase();
          if (agreed) {
            // 목록 안 확정 도중 목록 밖이 끼면 버린다.
            phase = PHASE.STABLE;
            lastError = `판독이 엇갈립니다(${agreed.lot}/${code || "?"}). 다시 읽습니다.`;
            ocrFailsThisArm += 1;
            return null;
          }
          if (rejectedLot && code && rejectedLot !== code) {
            log(`ocr reject disagree ${rejectedLot} vs ${code}`);
            pushOcrLog({
              kind: "disagree",
              lot: code,
              line: `엇갈림 ${rejectedLot}/${code} · ${((Date.now() - tAll) / 1000).toFixed(1)}초`,
              ms: Date.now() - tAll,
            });
            phase = PHASE.STABLE;
            lastError = `판독이 엇갈립니다(${rejectedLot}/${code}). 다시 읽습니다.`;
            ocrFailsThisArm += 1;
            return null;
          }
          rejectedLot = code || rejectedLot;
          rejectedCount += 1;
          lastRejected = { lot: rejectedLot, at: new Date().toISOString() };
          if (rejectedCount >= confirm) {
            const totalSec = ((Date.now() - tAll) / 1000).toFixed(1);
            pushOcrLog({
              kind: "reject",
              lot: rejectedLot,
              line: `${rejectedLot || "?"} 대기열 없음 ×${confirm} · ${totalSec}초`,
              ms: Date.now() - tAll,
              confirmed: confirm,
            });
            log(`ocr rejected ${rejectedLot || "-"} (not in queue ×${confirm})`);
            lastError = `${rejectedLot || "?"}는 대기 목록에 없습니다.`;
            // 같은 부품으로 반복 OCR하지 않음. 지그에서 빼거나 새 부품이 들어올 때까지 HOLD.
            lastLot = rejectedLot || lastLot;
            phase = PHASE.HOLD;
            if (hold) await sleep(holdMs);
            return null;
          }
          continue;
        }
        continue;
      }
      if (rejectedLot) {
        phase = PHASE.STABLE;
        lastError = `판독이 엇갈립니다(${rejectedLot}/${ocr.lot}). 다시 읽습니다.`;
        ocrFailsThisArm += 1;
        return null;
      }
      if (agreed && ocr.lot !== agreed.lot) {
        log(`ocr disagree ${agreed.lot} vs ${ocr.lot}`);
        pushOcrLog({
          kind: "disagree",
          lot: ocr.lot,
          line: `엇갈림 ${agreed.lot}/${ocr.lot} · ${((Date.now() - tAll) / 1000).toFixed(1)}초`,
          ms: Date.now() - tAll,
        });
        phase = PHASE.STABLE;
        lastError = `판독이 엇갈립니다(${agreed.lot}/${ocr.lot}). 다시 읽습니다.`;
        ocrFailsThisArm += 1;
        return null;
      }
      agreed = agreed ? { ...agreed, confidence: Math.min(agreed.confidence, ocr.confidence) } : { ...ocr };
      count += 1;
      lastShot = shot;
    }
    if (rejectedCount > 0 && rejectedCount < confirm) {
      phase = PHASE.STABLE;
      lastError = `${rejectedLot || "코드"}를 한 번만 읽었습니다. 다시 읽습니다.`;
      ocrFailsThisArm += 1;
      log(`ocr reject partial ${rejectedLot} ${rejectedCount}/${confirm}`);
      return null;
    }
    if (!agreed || count < confirm) {
      phase = PHASE.STABLE;
      lastError = agreed ? `${agreed.lot}을(를) 한 번만 읽었습니다. 다시 읽습니다.` : "로트 3글자를 읽지 못했습니다.";
      ocrFailsThisArm += 1;
      log(`ocr miss ${agreed ? `partial ${agreed.lot} ${count}/${confirm}` : ""} tries=${ocrFailsThisArm}`);
      return null;
    }
    const ocr = agreed;
    const shot = lastShot;
    if (ocr.lot === lastLot) {
      phase = PHASE.HOLD;
      return null;
    }

    const fileName = lotFileName(new Date(), ocr.lot);
    const dest = path.join(captureDir, fileName);
    await fs.mkdir(captureDir, { recursive: true });
    await fs.writeFile(dest, shot.buffer);
    const meta = await sharp(dest).metadata();
    lastLot = ocr.lot;
    lastError = "";
    latest = {
      success: true,
      lot: ocr.lot,
      confidence: ocr.confidence,
      fileName,
      filePath: dest,
      score: Number(shot.score.toFixed(3)),
      focus: shot.focus,
      device: deviceLabel,
      width: meta.width || 0,
      height: meta.height || 0,
      provider: ocr.provider,
      method: ocr.method || "",
      engrave:
        ocr.method === "engrave"
          ? { rotation: ocr.rotation, boxes: ocr.boxes, profileId: ocr.profileId, margin: ocr.margin, model: ocr.model || "" }
          : null,
      confirmed: count,
      at: new Date().toISOString(),
    };
    phase = PHASE.HOLD;
    const totalSec = ((Date.now() - tAll) / 1000).toFixed(1);
    pushOcrLog({
      kind: "ok",
      lot: ocr.lot,
      line: `${ocr.lot} 확정 conf${Math.round(ocr.confidence || 0)} ×${count} · ${totalSec}초`,
      ms: Date.now() - tAll,
      score: latest.score,
      confidence: ocr.confidence,
      confirmed: count,
      fileName,
    });
    log(
      `lot ${ocr.lot} conf=${Number(ocr.confidence).toFixed(1)} x${count} file=${fileName} score=${latest.score}`,
    );
    onRecognize(latest);
    if (hold) await sleep(holdMs);
    return latest;
  }

  /** 저장된 EV를 건다(Auto면 Auto로). */
  async function applyEv(settings, reason) {
    if (!serialAvailable) return null;
    const ev = Number.isFinite(settings?.ev) ? settings.ev : EV_AUTO;
    const r = await umSetEv(ev).catch((e) => ({ ok: false, reason: String(e?.message || e) }));
    log(`ev ${ev} (${reason}) ok=${Boolean(r?.ok)} now=${r?.ev ?? "-"} reason=${r?.reason || ""}`);
    return r;
  }

  async function tick() {
    const frame = await grabOne();
    if (!frame) return;
    const motion = prevGray ? meanAbsDiff(prevGray, frame.gray) : 999;
    prevGray = frame.gray;
    lastFrame = {
      score: Number(frame.score.toFixed(2)),
      mean: Number(frame.mean.toFixed(1)),
      motion: motion === 999 ? null : Number(motion.toFixed(2)),
      at: Date.now(),
    };

    if (motion >= motionThreshold && Date.now() < afSettleUntil) {
      // AF 직후 초점 변화. 정지 카운트만 다시 센다.
      stableCount = 0;
      return;
    }

    if (phase === PHASE.HOLD) {
      if (motion >= motionThreshold) {
        phase = PHASE.MOVING;
        armed = true;
        afAttemptsThisArm = 0;
        ocrFailsThisArm = 0;
        stableCount = 0;
        lastLot = "";
      }
      return;
    }

    if (motion >= motionThreshold) {
      phase = PHASE.MOVING;
      armed = true;
      afAttemptsThisArm = 0;
      ocrFailsThisArm = 0;
      stableCount = 0;
      return;
    }

    if (!armed) {
      // 대기 중에도 너무 어둡거나 흐리면 LED+AF를 한도 내에서 건다.
      if (needsMicroscopeAssist(frame)) {
        const assisted = await maybeAssistFocus(frame);
        if (!assisted && !lastError.startsWith("카메라 제어:")) lastError = assistHint(frame);
      }
      phase = PHASE.IDLE;
      stableCount = 0;
      return;
    }

    if (needsMicroscopeAssist(frame)) {
      phase = PHASE.STABLE;
      stableCount = 0;
      const assisted = await maybeAssistFocus(frame);
      if (!assisted && !lastError.startsWith("카메라 제어:")) lastError = assistHint(frame);
      return;
    }
    if (lastError.startsWith("초점이 맞지 않습니다") || lastError.startsWith("화면이 어둡습니다") || lastError === LED_OFF_HINT) {
      lastError = "";
    }

    stableCount += 1;
    phase = PHASE.STABLE;
    if (stableCount < stableNeeded) return;

    stableCount = 0;
    const result = await recognizeOnce();
    // 저장했거나 같은 로트면 끝. 못 읽었으면 한도 안에서 다음 정지 구간에 다시 읽는다.
    if (result || phase === PHASE.HOLD || ocrFailsThisArm > ocrRetry) armed = false;
  }

  async function loop() {
    while (running) {
      try {
        await withLock(tick);
      } catch (err) {
        phase = PHASE.ERROR;
        lastError = err?.message || String(err);
        log(`watch error ${lastError}${err?.detail ? ` ${err.detail}` : ""}`);
        await stopStream();
        await sleep(Math.max(pollMs, 1500));
      }
      if (!running) break;
      await sleep(pollMs);
    }
    await stopStream();
  }

  return {
    start() {
      if (running) return snapshot();
      running = true;
      phase = PHASE.IDLE;
      // 시작 때 부품이 이미 지그에 있어도, 움직임 없이 바로 안정→OCR로 들어가게 한다.
      armed = true;
      stableCount = 0;
      afAttemptsThisArm = 0;
      ocrFailsThisArm = 0;
      lastAfAt = 0;
      lastLot = "";
      pushOcrLog({ kind: "start", line: "감시 시작" });
      // UVC 노출·밝기·포커스를 스트림보다 먼저 건다. mltcCom은 이 UM20에서 init-failed.
      // LED/EV는 수 초 걸릴 수 있어 스트림을 연 뒤 루프와 겹친다(첫 인식 대기 단축).
      loopPromise = (async () => {
        try {
          afAttemptsThisArm = 1;
          await withLock(async () => {
            await runMicroscopePrepare("start");
            await ensureStream();
          });
          void (async () => {
            try {
              if (serialAvailable !== false) await probeSerial().catch(() => null);
              await setLed(true, "watch-start");
              await applyEv(loadSettings(), "watch-start");
            } catch (err) {
              log(`watch start led/ev ${err?.message || err}`);
            }
          })();
        } catch (err) {
          phase = PHASE.ERROR;
          lastError = err?.message || String(err);
          log(`watch start prepare failed ${lastError}`);
        }
        await loop();
      })();
      log("watch started");
      return snapshot();
    },
    async stop() {
      running = false;
      phase = PHASE.IDLE;
      if (loopPromise) await loopPromise.catch(() => {});
      loopPromise = null;
      await stopStream();
      // 멈춘 뒤 옛 프레임(LED 켜진 화면)을 라이브로 보여 주지 않는다.
      liveFrame = null;
      // 리모컨으로 켰어도 감시 중지 = LED 끔.
      if (serialAvailable) await withLock(() => setLed(false, "watch-stop")).catch(() => null);
      log("watch stopped");
      return snapshot();
    },
    status: snapshot,
    /** 서버 종료 직전(SIGINT/exit). 감시가 켠 LED를 동기로 끈다. */
    shutdownSync() {
      running = false;
      if (!ledOnByWatch || !serialAvailable) return null;
      ledOnByWatch = false;
      const r = umLedOffSync();
      log(`led off (shutdown) ok=${Boolean(r?.ok)} reason=${r?.reason || ""}`);
      return r;
    },
    setDeviceName(name) {
      deviceNameOverride = String(name || "").trim();
      // 다음 ensureStream에서 장치를 갈아탄다.
      streamDeviceKey = "";
      return deviceNameOverride;
    },
    getLiveFrame() {
      return liveFrame;
    },
    /**
     * 화질 설정을 지금 건다. UVC(밝기·대비·채도·색조)는 스트림을 잠시 놓고 건다.
     * LED 단계는 감시 중(LED 켜짐)일 때만, EV는 시리얼이 있으면 바로.
     */
    async applyCameraSettings(settings = loadSettings()) {
      return withLock(async () => {
        const resume = Boolean(stream?.running) && running;
        if (stream?.running) {
          await stopStream();
          await sleep(900);
        }
        let uvc;
        try {
          uvc = await uvcSet(currentDeviceName(), settings);
        } finally {
          if (resume) {
            await sleep(600);
            await ensureStream().catch((err) => log(`settings stream resume failed ${err?.message || err}`));
          }
        }
        if (serialAvailable === null) await probeSerial().catch(() => null);
        let led = null;
        if (running && settings.ledLevel > 0) led = await setLed(true, "settings");
        const ev = await applyEv(settings, "settings");
        lastSettings = {
          at: new Date().toISOString(),
          uvc: { ok: Boolean(uvc?.ok), reason: uvc?.reason || "", props: uvc?.props || null },
          led: led ? { ok: Boolean(led.ok), level: led.led ?? null } : null,
          ev: ev ? { ok: Boolean(ev.ok), value: ev.ev ?? null, reason: ev.reason || "" } : null,
        };
        log(`settings applied uvc=${Boolean(uvc?.ok)} ${uvc?.reason || ""} led=${led ? led.led : "-"} ev=${ev ? ev.ev : "-"}`);
        return lastSettings;
      });
    },
    /** 미리보기 한 장. 감시 중이면 라이브, 아니면 스트림을 잠깐 연다. */
    async previewFrame() {
      if (running && liveFrame) return liveFrame;
      return withLock(async () => {
        const opened = !stream?.running;
        try {
          if (opened) await ensureStream();
          await sleep(Math.max(500, Math.floor(1000 / streamFps)));
          let buf = null;
          for (let i = 0; i < 3 && !buf; i += 1) buf = await stream?.readFrame();
          return buf || null;
        } finally {
          if (opened && !running) {
            await stopStream();
            liveFrame = null;
          }
        }
      });
    },
    /** 수동 AF(화면 버튼·POST /focus). 감시 중이 아니면 스트림을 잠깐 열어 전후 선명도를 잰다. */
    async autoFocus(area = "whole") {
      return withLock(async () => {
        const opened = !stream?.running;
        try {
          if (opened) await ensureStream().catch(() => null);
          if (serialAvailable === null) await probeSerial().catch(() => null);
          if (stream?.running) {
            const buf = await stream.readFrame();
            if (buf) {
              const a = await analyzeImage(buf);
              lastFrame = { ...(lastFrame || {}), score: Number(a.score.toFixed(2)), mean: Number(a.mean.toFixed(1)), at: Date.now() };
            }
          }
          return await runSerialAf("manual", area === "local" ? "local" : "whole");
        } finally {
          if (opened && !running) await stopStream();
        }
      });
    },
    async forceRecognize() {
      return withLock(async () => {
        lastLot = "";
        afAttemptsThisArm = 0;
        if (running) {
          // 감시 루프와 같은 스트림을 쓴다. 흐리면 먼저 AF.
          await ensureStream();
          if (serialAvailable && lastFrame && lastFrame.score < sharpThreshold) {
            await runSerialAf("recognize", "local");
          }
          const result = await recognizeOnce();
          if (phase === PHASE.HOLD) armed = false;
          return result;
        }
        // 감시 중이 아니면 1회만: UVC → 스트림 → 인식 → 스트림 닫기.
        try {
          if (!lastFocus) await runMicroscopePrepare("once");
          await ensureStream();
          await sleep(Math.max(400, Math.floor(1000 / streamFps)));
          if (serialAvailable === null) await probeSerial().catch(() => null);
          if (serialAvailable) {
            const buf = await stream?.readFrame();
            const a = buf ? await analyzeImage(buf) : null;
            if (!a || a.score < sharpThreshold) await runSerialAf("once", "whole");
          }
          return await recognizeOnce({ hold: false });
        } finally {
          await stopStream();
          phase = PHASE.IDLE;
        }
      });
    },
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

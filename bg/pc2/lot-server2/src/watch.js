// change-log:
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
import { focusConfirmed, prepareMicroscope, tryFocus } from "./focus.js";
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
} = {}) {
  let deviceNameOverride = String(deviceName || "").trim();
  const currentDeviceName = () =>
    deviceNameOverride || getSelectedDeviceName() || "";
  const motionThreshold = numEnv("LOT_MOTION_THRESHOLD", 6);
  const sharpThreshold = numEnv("LOT_SHARP_THRESHOLD", 8);
  const stableNeeded = Math.max(2, Math.floor(numEnv("LOT_STABLE_FRAMES", 3)));
  // 기본 1.2초. Continuity/ffmpeg 한 방마다 띄우면 Cursor·머신 전체가 죽는다.
  const pollMs = Math.max(400, Math.floor(numEnv("LOT_WATCH_POLL_MS", 1200)));
  const holdMs = Math.max(500, Math.floor(numEnv("LOT_HOLD_MS", 2500)));
  const burstFrames = Math.max(2, Math.floor(numEnv("LOT_OCR_FRAMES", 3)));
  const streamFps = Math.max(1, Math.min(5, Number(process.env.LOT_STREAM_FPS || 2)));
  // 어두우면 LED+AF를 다시 건다(0–255 평균).
  const darkMean = Math.max(1, numEnv("LOT_DARK_MEAN", 28));
  // 흐림/어두움 재시도: 쿨다운·아밍당 횟수 상한(무한 루프 금지).
  const afCooldownMs = Math.max(3000, Math.floor(numEnv("LOT_AF_COOLDOWN_MS", 8000)));
  const afMaxPerArm = Math.max(1, Math.min(5, Math.floor(numEnv("LOT_AF_MAX_PER_ARM", 3))));

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
    };
  }

  async function runMicroscopePrepare(reason) {
    if (process.platform !== "win32") {
      return { ok: false, reason: "not-windows" };
    }
    phase = PHASE.FOCUSING;
    const focus = await prepareMicroscope();
    lastFocus = focus;
    lastAfAt = Date.now();
    const led = focus?.ledOn
      ? `led=${focus.ledLevel}/${focus.ledMax}`
      : `ledOff reason=${focus?.reason || ""}`;
    log(
      `microscope ${reason} af=${focus?.af || "none"} mode=${focus?.devMode || 0} ${led}`,
    );
    if (!focusConfirmed(focus) && focus?.reason) {
      lastError = `현미경 제어: ${focus.reason}`;
    }
    return focus;
  }

  function needsMicroscopeAssist(frame) {
    return frame.score < sharpThreshold || frame.mean < darkMean;
  }

  async function maybeAssistFocus(frame) {
    if (!needsMicroscopeAssist(frame)) return false;
    if (afAttemptsThisArm >= afMaxPerArm) return false;
    if (Date.now() - lastAfAt < afCooldownMs) return false;
    afAttemptsThisArm += 1;
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
    setLiveFrame(buffer);
    const analysis = await analyzeImage(buffer);
    return { ...analysis, buffer, tempDir: "" };
  }

  async function captureForOcr() {
    phase = PHASE.FOCUSING;
    const focus = await tryFocus({ action: "prepare" });
    lastFocus = focus;
    lastAfAt = Date.now();
    const focused = focusConfirmed(focus);

    // 스트림에서 몇 장 모아 선명한 것을 고른다(추가 ffmpeg 없음).
    const scored = [];
    for (let i = 0; i < burstFrames; i += 1) {
      const buffer = (await stream?.readFrame()) || liveFrame;
      if (!buffer) continue;
      const analysis = await analyzeImage(buffer);
      scored.push({
        index: i,
        score: analysis.score,
        buffer,
      });
      await sleep(Math.max(150, Math.floor(1000 / streamFps)));
    }

    let best = pickSharpest(scored);
    let tempDir = "";

    if (!best || best.score < sharpThreshold) {
      // 스트림을 잠시 멈추고 한 번만 버스트 Grab.
      await stopStream();
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

  async function recognizeOnce() {
    phase = PHASE.OCR;
    const shot = await captureForOcr();
    try {
      if (!shot.ok) {
        phase = PHASE.STABLE;
        lastError = "초점이 부족해 OCR을 건너뜁니다.";
        return null;
      }
      const ocr = await recognizeLot(shot.buffer);
      if (!ocr.success) {
        phase = PHASE.STABLE;
        lastError = "로트 3글자를 읽지 못했습니다.";
        return null;
      }
      if (ocr.lot === lastLot) {
        phase = PHASE.HOLD;
        return null;
      }

      const fileName = lotFileName(new Date(), ocr.lot);
      const dest = path.join(captureDir, fileName);
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
        at: new Date().toISOString(),
      };
      phase = PHASE.HOLD;
      log(
        `lot ${ocr.lot} conf=${ocr.confidence.toFixed(1)} file=${fileName} score=${latest.score}`,
      );
      onRecognize(latest);
      await sleep(holdMs);
      return latest;
    } finally {
      if (shot.tempDir) {
        await fs.rm(shot.tempDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }

  async function tick() {
    const frame = await grabOne();
    const motion = prevGray ? meanAbsDiff(prevGray, frame.gray) : 999;
    prevGray = frame.gray;

    if (phase === PHASE.HOLD) {
      if (motion >= motionThreshold) {
        phase = PHASE.MOVING;
        armed = true;
        afAttemptsThisArm = 0;
        stableCount = 0;
        lastLot = "";
      }
      return;
    }

    if (motion >= motionThreshold) {
      phase = PHASE.MOVING;
      armed = true;
      afAttemptsThisArm = 0;
      stableCount = 0;
      return;
    }

    if (!armed) {
      // 대기 중에도 너무 어둡거나 흐리면 LED+AF를 한도 내에서 건다.
      if (needsMicroscopeAssist(frame)) {
        await maybeAssistFocus(frame);
      }
      phase = PHASE.IDLE;
      stableCount = 0;
      return;
    }

    if (needsMicroscopeAssist(frame)) {
      phase = PHASE.STABLE;
      stableCount = 0;
      await maybeAssistFocus(frame);
      return;
    }

    stableCount += 1;
    phase = PHASE.STABLE;
    if (stableCount < stableNeeded) return;

    stableCount = 0;
    armed = false;
    await recognizeOnce();
  }

  async function loop() {
    while (running) {
      try {
        await tick();
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
      afAttemptsThisArm = 0;
      lastAfAt = 0;
      // 스트림 연 뒤 LED+AF를 한 번 건다(상한 1회는 start 준비).
      loopPromise = (async () => {
        try {
          await ensureStream();
          afAttemptsThisArm = 1;
          await runMicroscopePrepare("start");
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
      log("watch stopped");
      return snapshot();
    },
    status: snapshot,
    setDeviceName(name) {
      deviceNameOverride = String(name || "").trim();
      // 다음 ensureStream에서 장치를 갈아탄다.
      streamDeviceKey = "";
      return deviceNameOverride;
    },
    getLiveFrame() {
      return liveFrame;
    },
    async forceRecognize() {
      lastLot = "";
      armed = true;
      afAttemptsThisArm = 0;
      stableCount = stableNeeded;
      if (!running) this.start();
      await ensureStream();
      await runMicroscopePrepare("force");
      return recognizeOnce();
    },
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

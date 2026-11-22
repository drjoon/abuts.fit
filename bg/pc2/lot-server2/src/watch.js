// change-log:
// - 2026-11-23: 감시 프레임을 라이브 뷰(/live)로 제공한다.
// - 2026-11-23: 페달 없이 영상을 보다가 움직임이 멈추고 선명하면 로컬 OCR.
// related files:
// - bg/pc2/lot-server2/src/index.js
// - bg/pc2/lot-server2/src/ocr/index.js
// - bg/pc2/lot-server2/src/capture.js
// - bg/pc2/lot-server2/public/index.html

import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { getSelectedDeviceName } from "./camera.js";
import { analyzeFrame, grabFrames, scoreFile } from "./capture.js";
import { focusConfirmed, tryFocus } from "./focus.js";
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
  const pollMs = Math.max(200, Math.floor(numEnv("LOT_WATCH_POLL_MS", 450)));
  const holdMs = Math.max(500, Math.floor(numEnv("LOT_HOLD_MS", 2500)));
  const burstFrames = Math.max(2, Math.floor(numEnv("LOT_OCR_FRAMES", 4)));

  let running = false;
  let loopPromise = null;
  let prevGray = null;
  let stableCount = 0;
  let armed = false; // 움직임이 한 번 있은 뒤에만 OCR (빈 화면 오인식 방지)
  let lastLot = "";
  let lastError = "";
  let phase = PHASE.IDLE;
  let latest = null;
  let deviceLabel = "";
  /** @type {Buffer | null} */
  let liveFrame = null;
  let liveAt = 0;

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
      motionThreshold,
      sharpThreshold,
      stableNeeded,
    };
  }

  async function grabOne() {
    const { names, tempDir, device } = await grabFrames({
      captureDir,
      deviceName: currentDeviceName(),
      count: 1,
    });
    deviceLabel = device.name;
    const filePath = path.join(tempDir, names[0]);
    try {
      const analysis = await analyzeFrame(filePath);
      const buffer = await fs.readFile(filePath);
      setLiveFrame(buffer);
      return { ...analysis, buffer, tempDir, filePath };
    } catch (err) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      throw err;
    }
  }

  async function captureForOcr() {
    const focus = await tryFocus();
    const focused = focusConfirmed(focus);
    phase = PHASE.FOCUSING;
    const { names, tempDir, device } = await grabFrames({
      captureDir,
      deviceName: currentDeviceName(),
      count: burstFrames,
    });
    deviceLabel = device.name;
    try {
      const scored = [];
      for (let index = 0; index < names.length; index += 1) {
        const filePath = path.join(tempDir, names[index]);
        const score = await scoreFile(filePath);
        scored.push({ index, score, filePath });
      }
      const best = pickSharpest(scored);
      if (!best || best.score < sharpThreshold) {
        return {
          ok: false,
          reason: "blurry",
          focus,
          score: best?.score || 0,
          tempDir,
        };
      }
      const buffer = await fs.readFile(best.filePath);
      setLiveFrame(buffer);
      return {
        ok: true,
        buffer,
        filePath: best.filePath,
        score: best.score,
        focus,
        focused,
        tempDir,
      };
    } catch (err) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      throw err;
    }
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
    try {
      const motion = prevGray ? meanAbsDiff(prevGray, frame.gray) : 999;
      prevGray = frame.gray;

      if (phase === PHASE.HOLD) {
        if (motion >= motionThreshold) {
          phase = PHASE.MOVING;
          armed = true;
          stableCount = 0;
          lastLot = "";
        }
        return;
      }

      if (motion >= motionThreshold) {
        phase = PHASE.MOVING;
        armed = true;
        stableCount = 0;
        return;
      }

      if (!armed) {
        phase = PHASE.IDLE;
        stableCount = 0;
        return;
      }

      if (frame.score < sharpThreshold) {
        phase = PHASE.STABLE;
        stableCount = 0;
        return;
      }

      stableCount += 1;
      phase = PHASE.STABLE;
      if (stableCount < stableNeeded) return;

      stableCount = 0;
      armed = false;
      await recognizeOnce();
    } finally {
      await fs.rm(frame.tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  async function loop() {
    while (running) {
      try {
        await tick();
      } catch (err) {
        phase = PHASE.ERROR;
        lastError = err?.message || String(err);
        log(`watch error ${lastError}${err?.detail ? ` ${err.detail}` : ""}`);
        await sleep(Math.max(pollMs, 1000));
      }
      if (!running) break;
      await sleep(pollMs);
    }
  }

  return {
    start() {
      if (running) return snapshot();
      running = true;
      phase = PHASE.IDLE;
      loopPromise = loop();
      log("watch started");
      return snapshot();
    },
    async stop() {
      running = false;
      phase = PHASE.IDLE;
      if (loopPromise) await loopPromise.catch(() => {});
      loopPromise = null;
      log("watch stopped");
      return snapshot();
    },
    status: snapshot,
    setDeviceName(name) {
      deviceNameOverride = String(name || "").trim();
      return deviceNameOverride;
    },
    /** @returns {Buffer | null} */
    getLiveFrame() {
      return liveFrame;
    },
    async forceRecognize() {
      lastLot = "";
      armed = true;
      stableCount = stableNeeded;
      if (!running) this.start();
      return recognizeOnce();
    },
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

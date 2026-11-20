// change-log:
// - 2026-11-21: 초점 제어 뒤 한 장을 저장한다. 제어가 안 되면 짧은 연속 촬영에서 선명한 장을 고른다.
// related files:
// - bg/pc2/lot-server2/src/index.js
// - bg/pc2/lot-server2/src/focus.js

import { execFile } from "child_process";
import { createRequire } from "module";
import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import { chooseDevice, parseVideoDevices } from "./devices.js";
import { focusConfirmed, tryFocus } from "./focus.js";
import { captureFileName } from "./names.js";
import { scoreGray, selectBest } from "./sharpness.js";

const require = createRequire(import.meta.url);
const FRAMES_AFTER_FOCUS = 4;
const FRAMES_CAPTURE_ONLY = 8;
const FFMPEG_TIMEOUT_MS = 15000;

export class CaptureError extends Error {
  constructor(message, code, detail = "") {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

export function resolveFfmpeg() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  try {
    const resolved = require("ffmpeg-static");
    if (typeof resolved === "string" && resolved) return resolved;
  } catch {
    // 시스템 ffmpeg로 넘긴다.
  }
  return "ffmpeg";
}

function runFfmpeg(ffmpeg, args) {
  return new Promise((resolve) => {
    execFile(
      ffmpeg,
      args,
      { timeout: FFMPEG_TIMEOUT_MS, windowsHide: true, maxBuffer: 2_000_000 },
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

export async function listCameras(ffmpeg = resolveFfmpeg()) {
  const platform = process.platform;
  const args =
    platform === "darwin"
      ? ["-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""]
      : ["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"];
  const run = await runFfmpeg(ffmpeg, args);
  const text = `${run.stdout}\n${run.stderr}`;
  if (run.err && /ENOENT/.test(run.err.message || "")) {
    throw new CaptureError("ffmpeg가 없습니다.", "no-ffmpeg");
  }
  return parseVideoDevices(text, platform);
}

function captureArgs(device, count, pattern, withRate) {
  const inputFormat = process.platform === "darwin" ? "avfoundation" : "dshow";
  const args = [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    inputFormat,
  ];
  if (withRate) args.push("-framerate", "15");
  args.push("-i", device.input, "-frames:v", String(count), pattern);
  return args;
}

async function scoreFile(filePath) {
  const { data, info } = await sharp(filePath)
    .greyscale()
    .resize({ width: 160, height: 160, fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return scoreGray(data, info.width, info.height);
}

export function successMessage(mode, focus) {
  if (mode === "focus") {
    return "저장했습니다.\n포커스를 맞춘 뒤 촬영했습니다.";
  }
  if (focus && focus.af === "timeout") {
    return "저장했습니다.\n초점 확인이 끝나기 전에 촬영했습니다.";
  }
  return "저장했습니다.\n영상만 저장했습니다.";
}

export async function captureAndSave({
  captureDir,
  deviceName = process.env.MICROSCOPE_DEVICE || "",
  ffmpeg = resolveFfmpeg(),
} = {}) {
  await fs.mkdir(captureDir, { recursive: true });
  const focus = await tryFocus();
  const focused = focusConfirmed(focus);
  const cameras = await listCameras(ffmpeg);
  const device = chooseDevice(cameras, deviceName);
  if (!device) {
    throw new CaptureError(
      deviceName
        ? "설정한 카메라를 찾지 못했습니다."
        : "카메라를 찾지 못했습니다.",
      "no-camera",
    );
  }

  const tempDir = path.join(
    captureDir,
    `.tmp-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
  );
  await fs.mkdir(tempDir, { recursive: true });
  try {
    const count = focused ? FRAMES_AFTER_FOCUS : FRAMES_CAPTURE_ONLY;
    const pattern = path.join(tempDir, "frame_%02d.jpg");
    const listFrames = async () =>
      (await fs.readdir(tempDir))
        .filter((name) => /^frame_\d+\.jpg$/i.test(name))
        .sort();
    let run = await runFfmpeg(ffmpeg, captureArgs(device, count, pattern, true));
    let names = await listFrames();
    if (!names.length) {
      run = await runFfmpeg(ffmpeg, captureArgs(device, count, pattern, false));
      names = await listFrames();
    }
    if (!names.length) {
      const detail = `${run.stderr || run.err?.message || ""}`.trim().slice(0, 500);
      const busy = /busy|in use/i.test(detail);
      throw new CaptureError(
        busy
          ? "카메라가 사용 중입니다. UMViewer를 종료한 뒤 다시 촬영합니다."
          : "촬영에 실패했습니다.",
        "capture-failed",
        detail,
      );
    }

    const scored = [];
    for (let index = 0; index < names.length; index += 1) {
      const filePath = path.join(tempDir, names[index]);
      const score = await scoreFile(filePath);
      scored.push({ index, score, filePath });
    }
    const best = selectBest(scored);
    const fileName = captureFileName(new Date(), focused);
    const dest = path.join(captureDir, fileName);
    await fs.copyFile(best.filePath, dest);
    const meta = await sharp(dest).metadata();
    const mode = focused ? "focus" : "capture";
    return {
      success: true,
      fileName,
      filePath: dest,
      mode,
      message: successMessage(mode, focus),
      focus,
      device: device.name,
      score: Number(best.score.toFixed(3)),
      width: meta.width || 0,
      height: meta.height || 0,
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

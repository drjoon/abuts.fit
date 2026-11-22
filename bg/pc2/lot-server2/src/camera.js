// change-log:
// - 2026-11-23: 카메라 연동 모듈. 장치 목록·선택·Grab 프로파일(avfoundation/dshow).
// related files:
// - bg/pc2/lot-server2/src/capture.js
// - bg/pc2/lot-server2/src/devices.js
// - bg/pc2/lot-server2/src/index.js

import { execFile } from "child_process";
import { createRequire } from "module";
import {
  annotateDevices,
  chooseDevice,
  isContinuityCamera,
  parseVideoDevices,
} from "./devices.js";

const require = createRequire(import.meta.url);
const FFMPEG_TIMEOUT_MS = 15000;

export class CameraError extends Error {
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
    // 시스템 ffmpeg
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

/** @type {string} */
let selectedName = String(process.env.MICROSCOPE_DEVICE || "").trim();

export function getSelectedDeviceName() {
  return selectedName;
}

export function setSelectedDeviceName(name) {
  selectedName = String(name || "").trim();
  return selectedName;
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
    throw new CameraError("ffmpeg가 없습니다.", "no-ffmpeg");
  }
  return annotateDevices(parseVideoDevices(text, platform));
}

export async function resolveDevice(preferred = selectedName, ffmpeg = resolveFfmpeg()) {
  const cameras = await listCameras(ffmpeg);
  const device = chooseDevice(cameras, preferred);
  return { cameras, device, preferred: preferred || "" };
}

/**
 * 플랫폼별 Grab 인자 후보.
 * Continuity/iPhone 은 기본 29.97fps를 거부하므로 30fps·640x480을 먼저 시도한다.
 */
export function buildCaptureProfiles(device, count, pattern) {
  const platform = process.platform;
  const inputFormat = platform === "darwin" ? "avfoundation" : "dshow";
  const base = ["-hide_banner", "-loglevel", "error", "-y", "-f", inputFormat];
  const out = ["-frames:v", String(count), pattern];
  const profiles = [];

  if (platform === "darwin") {
    const continuity = isContinuityCamera(device?.name);
    const sizes = continuity
      ? ["640x480", "1280x720"]
      : ["1280x720", "1920x1080", "640x480"];
    for (const size of sizes) {
      for (const fps of ["30", "60", "15"]) {
        profiles.push({
          label: `${fps}fps ${size}`,
          args: [...base, "-framerate", fps, "-video_size", size, "-i", device.input, ...out],
        });
      }
    }
    profiles.push({
      label: "30fps",
      args: [...base, "-framerate", "30", "-i", device.input, ...out],
    });
    profiles.push({
      label: "default",
      args: [...base, "-i", device.input, ...out],
    });
  } else {
    profiles.push({
      label: "15fps",
      args: [...base, "-framerate", "15", "-i", device.input, ...out],
    });
    profiles.push({
      label: "30fps",
      args: [...base, "-framerate", "30", "-i", device.input, ...out],
    });
    profiles.push({
      label: "default",
      args: [...base, "-i", device.input, ...out],
    });
  }
  return profiles;
}

export async function runCaptureProfiles({
  device,
  count,
  pattern,
  listFrames,
  ffmpeg = resolveFfmpeg(),
}) {
  const profiles = buildCaptureProfiles(device, count, pattern);
  let last = { stderr: "", err: null, label: "" };
  for (const profile of profiles) {
    const run = await runFfmpeg(ffmpeg, profile.args);
    const names = await listFrames();
    if (names.length) {
      return { names, profile: profile.label, stderr: run.stderr };
    }
    last = { stderr: run.stderr, err: run.err, label: profile.label };
  }
  const detail = `${last.stderr || last.err?.message || ""}`.trim().slice(0, 800);
  const busy = /busy|in use|already|점유/i.test(detail);
  const fpsIssue = /framerate|not supported by the device/i.test(detail);
  let message = "촬영에 실패했습니다.";
  if (busy) {
    message = "카메라가 사용 중입니다. UMViewer·다른 앱을 종료한 뒤 다시 시도합니다.";
  } else if (fpsIssue) {
    message =
      "카메라가 요청 fps/해상도를 거부했습니다. 다른 장치를 고르거나 Continuity 카메라면 연결을 확인합니다.";
  } else if (isContinuityCamera(device?.name)) {
    message =
      "Continuity(iPhone) 카메라 촬영에 실패했습니다. Mac에 FaceTime/USB 카메라가 있으면 그걸 고르세요.";
  }
  throw new CameraError(message, "capture-failed", detail || last.label);
}

export { runFfmpeg };

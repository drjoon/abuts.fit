// change-log:
// - 2026-11-24: Windows 상주 스트림 fps 강제 완화·stderr 로그·프로파일 재시도.
// - 2026-11-23: 상주 ffmpeg 스트림·프로파일 캐시로 Grab 부하를 줄인다.
// - 2026-11-23: 카메라 연동 모듈. 장치 목록·선택·Grab 프로파일(avfoundation/dshow).
// related files:
// - bg/pc2/lot-server2/src/capture.js
// - bg/pc2/lot-server2/src/devices.js
// - bg/pc2/lot-server2/src/index.js
// - bg/pc2/lot-server2/src/watch.js

import { execFile, spawn } from "child_process";
import { createRequire } from "module";
import fsp from "fs/promises";
import os from "os";
import path from "path";
import {
  annotateDevices,
  chooseDevice,
  isContinuityCamera,
  parseVideoDevices,
} from "./devices.js";

const require = createRequire(import.meta.url);
const FFMPEG_TIMEOUT_MS = 8000;
const LIST_CACHE_MS = 5000;

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

function runFfmpeg(ffmpeg, args, timeoutMs = FFMPEG_TIMEOUT_MS) {
  return new Promise((resolve) => {
    execFile(
      ffmpeg,
      args,
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 2_000_000 },
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

/** @type {{ at: number, cameras: object[] } | null} */
let listCache = null;

/** deviceKey -> profile label */
const profileCache = new Map();

export function getSelectedDeviceName() {
  return selectedName;
}

export function setSelectedDeviceName(name) {
  selectedName = String(name || "").trim();
  return selectedName;
}

export function clearCameraCaches() {
  listCache = null;
  profileCache.clear();
}

function deviceKey(device) {
  return `${process.platform}|${device?.name || ""}|${device?.input || ""}`;
}

export async function listCameras(ffmpeg = resolveFfmpeg()) {
  const now = Date.now();
  if (listCache && now - listCache.at < LIST_CACHE_MS) {
    return listCache.cameras;
  }
  const platform = process.platform;
  const args =
    platform === "darwin"
      ? ["-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""]
      : ["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"];
  const run = await runFfmpeg(ffmpeg, args, 10000);
  const text = `${run.stdout}\n${run.stderr}`;
  if (run.err && /ENOENT/.test(run.err.message || "")) {
    throw new CameraError("ffmpeg가 없습니다.", "no-ffmpeg");
  }
  const cameras = annotateDevices(parseVideoDevices(text, platform));
  listCache = { at: now, cameras };
  return cameras;
}

export async function resolveDevice(preferred = selectedName, ffmpeg = resolveFfmpeg()) {
  const cameras = await listCameras(ffmpeg);
  const device = chooseDevice(cameras, preferred);
  return { cameras, device, preferred: preferred || "" };
}

/**
 * 플랫폼별 Grab 인자 후보. 후보 수를 적게 유지한다.
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
    if (continuity) {
      profiles.push({
        label: "30fps 640x480",
        args: [
          ...base,
          "-framerate",
          "30",
          "-video_size",
          "640x480",
          "-i",
          device.input,
          ...out,
        ],
      });
      profiles.push({
        label: "30fps",
        args: [...base, "-framerate", "30", "-i", device.input, ...out],
      });
    } else {
      profiles.push({
        label: "30fps 1280x720",
        args: [
          ...base,
          "-framerate",
          "30",
          "-video_size",
          "1280x720",
          "-i",
          device.input,
          ...out,
        ],
      });
      profiles.push({
        label: "30fps",
        args: [...base, "-framerate", "30", "-i", device.input, ...out],
      });
      profiles.push({
        label: "15fps",
        args: [...base, "-framerate", "15", "-i", device.input, ...out],
      });
    }
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

function orderProfiles(device, profiles) {
  const cached = profileCache.get(deviceKey(device));
  if (!cached) return profiles;
  const hit = profiles.find((p) => p.label === cached);
  if (!hit) return profiles;
  return [hit, ...profiles.filter((p) => p.label !== cached)];
}

export async function runCaptureProfiles({
  device,
  count,
  pattern,
  listFrames,
  ffmpeg = resolveFfmpeg(),
}) {
  const profiles = orderProfiles(device, buildCaptureProfiles(device, count, pattern));
  let last = { stderr: "", err: null, label: "" };
  for (const profile of profiles) {
    const run = await runFfmpeg(ffmpeg, profile.args);
    const names = await listFrames();
    if (names.length) {
      profileCache.set(deviceKey(device), profile.label);
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

/**
 * 상주 스트림 인자 후보.
 * Windows UM20(MJPG 60)은 -framerate 15만 강제하면 dshow가 바로 죽는 경우가 많다.
 */
export function buildStreamArgSets(device, outFile, fps = 2) {
  const platform = process.platform;
  const inputFormat = platform === "darwin" ? "avfoundation" : "dshow";
  const head = ["-hide_banner", "-loglevel", "error", "-y", "-f", inputFormat];
  const out = [
    "-vf",
    `fps=${fps}`,
    "-q:v",
    "5",
    "-f",
    "image2",
    "-update",
    "1",
    outFile,
  ];
  const sets = [];

  if (platform === "darwin") {
    if (isContinuityCamera(device.name)) {
      sets.push({
        label: "30fps 640x480",
        args: [
          ...head,
          "-framerate",
          "30",
          "-video_size",
          "640x480",
          "-i",
          device.input,
          ...out,
        ],
      });
    }
    sets.push({
      label: "30fps",
      args: [...head, "-framerate", "30", "-i", device.input, ...out],
    });
    sets.push({
      label: "default",
      args: [...head, "-i", device.input, ...out],
    });
    return sets;
  }

  // win32 / 기타: 장치 기본 → 720p30 → 15fps 순
  sets.push({
    label: "default",
    args: [...head, "-i", device.input, ...out],
  });
  sets.push({
    label: "30fps 1280x720",
    args: [
      ...head,
      "-framerate",
      "30",
      "-video_size",
      "1280x720",
      "-i",
      device.input,
      ...out,
    ],
  });
  sets.push({
    label: "15fps",
    args: [...head, "-framerate", "15", "-i", device.input, ...out],
  });
  return sets;
}

/**
 * 상주 ffmpeg가 outFile을 주기적으로 덮어쓴다.
 * 프레임마다 프로세스를 새로 띄우지 않는다.
 */
export function createFrameStream({
  device,
  outFile,
  fps = 2,
  ffmpeg = resolveFfmpeg(),
  log = () => {},
} = {}) {
  let child = null;
  let stopping = false;
  let lastStderr = "";
  let lastExitCode = null;
  let activeLabel = "";

  function spawnWithArgs(args, label) {
    lastStderr = "";
    lastExitCode = null;
    activeLabel = label;
    child = spawn(ffmpeg, args, {
      windowsHide: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    child.stderr?.on("data", (chunk) => {
      lastStderr = `${lastStderr}${chunk}`.slice(-2000);
    });
    child.on("exit", (code, signal) => {
      child = null;
      lastExitCode = code;
      if (!stopping) {
        const detail = lastStderr.trim().slice(0, 240);
        log(
          `camera stream exit code=${code} signal=${signal || ""} label=${label}${
            detail ? ` ${detail}` : ""
          }`,
        );
      }
    });
    log(`camera stream start device=${device.name} fps=${fps} label=${label}`);
  }

  function start() {
    if (child) return;
    stopping = false;
    const first = buildStreamArgSets(device, outFile, fps)[0];
    spawnWithArgs(first.args, first.label);
  }

  /**
   * 프로파일을 돌려 첫 JPEG가 나올 때까지 연다.
   * 실패하면 CameraError(capture-failed).
   */
  async function startUntilFrame({ waitMs = 2000, attempts = 8 } = {}) {
    stopping = false;
    await stopChildOnly();
    try {
      await fsp.unlink(outFile);
    } catch {
      // ignore
    }
    const sets = buildStreamArgSets(device, outFile, fps);
    let lastDetail = "";
    for (const set of sets) {
      spawnWithArgs(set.args, set.label);
      for (let i = 0; i < attempts; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, Math.floor(waitMs / attempts)));
        if (!child) break;
        const buf = await readFrame();
        if (buf) return buf;
      }
      lastDetail = `${set.label}: exit=${lastExitCode} ${lastStderr}`.trim().slice(0, 800);
      await stopChildOnly();
    }
    throw new CameraError(
      "카메라 라이브 스트림을 열지 못했습니다. UMViewer를 끄고 PC CAM 모드인지 확인합니다.",
      "capture-failed",
      lastDetail,
    );
  }

  async function stopChildOnly() {
    if (!child) return;
    const proc = child;
    child = null;
    try {
      proc.kill("SIGTERM");
    } catch {
      // ignore
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    try {
      if (!proc.killed) proc.kill("SIGKILL");
    } catch {
      // ignore
    }
  }

  async function stop() {
    stopping = true;
    await stopChildOnly();
  }

  async function readFrame(minAgeMs = 0) {
    try {
      const st = await fsp.stat(outFile);
      if (minAgeMs && Date.now() - st.mtimeMs > 10000) return null;
      if (st.size < 100) return null;
      return await fsp.readFile(outFile);
    } catch {
      return null;
    }
  }

  return {
    start,
    startUntilFrame,
    stop,
    readFrame,
    get running() {
      return Boolean(child);
    },
    get lastStderr() {
      return lastStderr;
    },
    get lastExitCode() {
      return lastExitCode;
    },
    get profile() {
      return activeLabel;
    },
    outFile,
  };
}

export function defaultStreamPath() {
  return path.join(os.tmpdir(), `lot-server2-live-${process.pid}.jpg`);
}

export { runFfmpeg };

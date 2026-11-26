// change-log:
// - 2026-11-26: 선명도 score를 tileFocusScore(320px, 타일 상위 10%)로 바꿈. 움직임용 gray(96px)는 그대로.
// - 2026-11-26: 저장 전 제어는 UVC(노출·밝기·포커스). mltcCom은 호출하지 않는다.
// - 2026-11-26: 프레임 평균 밝기(mean)를 같이 돌려 LED 재점등 판단에 쓴다.
// - 2026-11-23: Grab을 camera 모듈 프로파일로 돌린다.
// - 2026-11-23: 감시 루프용 프레임 Grab을 분리한다.
// - 2026-11-21: 초점 제어 뒤 한 장을 저장한다. 제어가 안 되면 짧은 연속 촬영에서 선명한 장을 고른다.
// related files:
// - bg/pc2/lot-server2/src/camera.js
// - bg/pc2/lot-server2/src/index.js
// - bg/pc2/lot-server2/src/focus.js
// - bg/pc2/lot-server2/src/watch.js

import fs from "fs/promises";
import path from "path";
import sharp from "sharp";
import {
  CameraError,
  getSelectedDeviceName,
  listCameras,
  resolveDevice,
  resolveFfmpeg,
  runCaptureProfiles,
} from "./camera.js";
import { focusConfirmed } from "./focus.js";
import { tryUvc } from "./uvc.js";
import { captureFileName } from "./names.js";
import { meanAbsDiff, scoreGray, selectBest, tileFocusScore } from "./sharpness.js";

export { meanAbsDiff, listCameras, resolveFfmpeg };

const FRAMES_AFTER_FOCUS = 4;
const FRAMES_CAPTURE_ONLY = 8;

export class CaptureError extends Error {
  constructor(message, code, detail = "") {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

function asCaptureError(err) {
  if (err instanceof CaptureError) return err;
  if (err instanceof CameraError) {
    return new CaptureError(err.message, err.code, err.detail);
  }
  return new CaptureError(err?.message || "촬영에 실패했습니다.", "capture-failed");
}

export async function scoreFile(filePath) {
  return focusScore(filePath);
}

/** 초점 점수(타일 라플라시안 상위 10%, 폭 320px). */
export async function focusScore(input) {
  const { data, info } = await sharp(input)
    .greyscale()
    .resize({ width: 320, height: 320, fit: "inside" })
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return tileFocusScore(data, info.width, info.height);
}

/**
 * 카메라에서 count장을 찍어 임시 폴더에 둔다.
 * @returns {Promise<{ names: string[], tempDir: string, device: object, profile: string }>}
 */
export async function grabFrames({
  captureDir,
  deviceName = getSelectedDeviceName(),
  count = 1,
  ffmpeg = resolveFfmpeg(),
} = {}) {
  await fs.mkdir(captureDir, { recursive: true });
  let resolved;
  try {
    resolved = await resolveDevice(deviceName, ffmpeg);
  } catch (err) {
    throw asCaptureError(err);
  }
  const { device } = resolved;
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
  const pattern = path.join(tempDir, "frame_%02d.jpg");
  const listFrames = async () =>
    (await fs.readdir(tempDir))
      .filter((name) => /^frame_\d+\.jpg$/i.test(name))
      .sort();

  try {
    const { names, profile } = await runCaptureProfiles({
      device,
      count,
      pattern,
      listFrames,
      ffmpeg,
    });
    return { names, tempDir, device, profile };
  } catch (err) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw asCaptureError(err);
  }
}

/** 한 장의 선명도와 축소 그레이 버퍼(움직임 비교용). */
export async function analyzeFrame(filePath) {
  return analyzeImage(filePath);
}

/** @param {Buffer | string} input */
export async function analyzeImage(input) {
  const { data, info } = await sharp(input)
    .greyscale()
    .resize({ width: 96, height: 96, fit: "inside" })
    .extractChannel(0)
    .raw()
    .toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (let i = 0; i < data.length; i += 1) sum += data[i];
  const mean = data.length ? sum / data.length : 0;
  const score = await focusScore(input);
  return { score, mean, gray: data, width: info.width, height: info.height };
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
  deviceName = getSelectedDeviceName(),
  ffmpeg = resolveFfmpeg(),
} = {}) {
  const focus = await tryUvc(deviceName);
  const focused = focusConfirmed(focus);
  const count = focused ? FRAMES_AFTER_FOCUS : FRAMES_CAPTURE_ONLY;
  const grabbed = await grabFrames({
    captureDir,
    deviceName,
    count,
    ffmpeg,
  });
  const { names, tempDir, device } = grabbed;
  try {
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
      profile: grabbed.profile,
      score: Number(best.score.toFixed(3)),
      width: meta.width || 0,
      height: meta.height || 0,
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

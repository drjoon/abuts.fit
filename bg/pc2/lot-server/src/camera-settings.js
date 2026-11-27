// change-log:
// - 2026-11-27: 현미경 화질 설정(UVC 밝기·대비·채도·색조, UM LED 단계, UM EV)을 data/camera-settings.json에 저장.
//   UM Viewer와 같은 균형 잡힌 화면은 UVC 밝기 기본값 128(예전 코드는 255로 고정해 하얗게 날아갔다).
// related files:
// - bg/pc2/lot-server/src/uvc.js
// - bg/pc2/lot-server/src/um-serial.js
// - bg/pc2/lot-server/src/watch.js
// - bg/pc2/lot-server/src/index.js
// - bg/pc2/lot-server/public/station.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

/** UM20 EV 레지스터(0x16) 값 → 표시. 10 = Auto. 7은 FLK(깜빡임 방지)라 고르지 않는다. */
export const EV_LABELS = [
  "-10", "-9", "-8", "-7", "-6", "-5", "-4", "FLK", "-2", "-1",
  "Auto", "+1", "+2", "+3", "+4", "+5", "+6", "+7", "+8", "+9",
];
export const EV_AUTO = 10;

export const LIMITS = {
  brightness: [0, 255],
  contrast: [0, 255],
  saturation: [0, 255],
  hue: [-32, 31],
  ledLevel: [0, 12], // 0 = 지금 단계 유지
  ev: [0, 19],
};

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || String(raw).trim() === "") return fallback;
  const n = Math.round(Number(raw));
  return Number.isFinite(n) ? n : fallback;
}

/** 권장값(local.env LOT_UVC_* / LOT_LED_LEVEL / LOT_UM_EV로 바꿀 수 있다). */
export function recommendedSettings() {
  return normalizeSettings({
    brightness: envInt("LOT_UVC_BRIGHTNESS", 128),
    contrast: envInt("LOT_UVC_CONTRAST", 128),
    saturation: envInt("LOT_UVC_SATURATION", 128),
    hue: envInt("LOT_UVC_HUE", 0),
    ledLevel: envInt("LOT_LED_LEVEL", 0),
    ev: envInt("LOT_UM_EV", EV_AUTO),
  });
}

function clamp(value, [lo, hi], fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

/** 알 수 없는 키는 버리고 범위를 맞춘다. FLK(7)는 Auto로 바꾼다. */
export function normalizeSettings(input = {}, base = null) {
  const b = base || {
    brightness: 128,
    contrast: 128,
    saturation: 128,
    hue: 0,
    ledLevel: 0,
    ev: EV_AUTO,
  };
  const out = {};
  for (const key of Object.keys(LIMITS)) {
    out[key] = clamp(input?.[key] ?? b[key], LIMITS[key], b[key]);
  }
  if (out.ev === 7) out.ev = EV_AUTO;
  return out;
}

export function settingsFile() {
  return process.env.LOT_CAMERA_SETTINGS || path.join(ROOT, "data", "camera-settings.json");
}

/** 저장본(없으면 권장값). 파일이 깨졌으면 권장값. */
export function loadSettings(file = settingsFile()) {
  const rec = recommendedSettings();
  try {
    if (!fs.existsSync(file)) return { ...rec, saved: false };
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return { ...normalizeSettings(parsed, rec), saved: true, savedAt: parsed.savedAt || null };
  } catch {
    return { ...rec, saved: false };
  }
}

export function saveSettings(input, file = settingsFile()) {
  const current = loadSettings(file);
  const next = normalizeSettings(input, current);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = { ...next, savedAt: new Date().toISOString() };
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(body, null, 2), "utf8");
  fs.renameSync(tmp, file);
  return { ...next, saved: true, savedAt: body.savedAt };
}

/** UvcTool.exe 세 번째 인자. 예: brightness=128,contrast=128,saturation=128,hue=0 */
export function uvcSpec(settings) {
  const s = normalizeSettings(settings);
  return `brightness=${s.brightness},contrast=${s.contrast},saturation=${s.saturation},hue=${s.hue}`;
}

export function evLabel(index) {
  return EV_LABELS[index] ?? String(index);
}

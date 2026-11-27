// change-log:
// - 2026-11-27: 패킹 작업대 운영 토글(자동 프린트·포장.발송, 표본 수집)을 data/station-settings.json에 저장.
// related files:
// - bg/pc2/lot-server/src/index.js
// - bg/pc2/lot-server/public/station.js
// - docs/intent/lot-server-packing-station.md

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function envBool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || String(raw).trim() === "") return fallback;
  const s = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(s)) return true;
  if (["0", "false", "no", "n", "off"].includes(s)) return false;
  return fallback;
}

/** 기본값: 실작업(자동 커밋 on), 표본 수집은 LOT_ENGRAVE_COLLECT. */
export function recommendedStationSettings() {
  return {
    /** 인식 후 패킹 라벨 출력 + 이미지 첨부 + 포장.발송. false면 연습(인식만). */
    autoCommit: true,
    /** 매칭 성공 때 각인 학습 표본 저장. */
    collectSamples: envBool("LOT_ENGRAVE_COLLECT", true),
  };
}

export function normalizeStationSettings(input = {}, base = null) {
  const b = base || recommendedStationSettings();
  return {
    autoCommit: input?.autoCommit === undefined ? b.autoCommit : Boolean(input.autoCommit),
    collectSamples:
      input?.collectSamples === undefined ? b.collectSamples : Boolean(input.collectSamples),
  };
}

export function stationSettingsFile() {
  return process.env.LOT_STATION_SETTINGS || path.join(ROOT, "data", "station-settings.json");
}

export function loadStationSettings(file = stationSettingsFile()) {
  const rec = recommendedStationSettings();
  try {
    if (!fs.existsSync(file)) return { ...rec, saved: false };
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      ...normalizeStationSettings(parsed, rec),
      saved: true,
      savedAt: parsed.savedAt || null,
    };
  } catch {
    return { ...rec, saved: false };
  }
}

export function saveStationSettings(input, file = stationSettingsFile()) {
  const current = loadStationSettings(file);
  const next = normalizeStationSettings(input, current);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const body = { ...next, savedAt: new Date().toISOString() };
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(body, null, 2), "utf8");
  fs.renameSync(tmp, file);
  return { ...next, saved: true, savedAt: body.savedAt };
}

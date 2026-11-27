// change-log:
// - 2026-11-27: 지그 프로필. 각인 면을 찾을 ROI(프레임 비율 0–1)·글자 높이 범위(프레임 높이 비율)·허용 회전.
//   지그를 바꾸면 새 프로필(ROI만)을 만든다. 글자 분류기·데이터셋은 지그와 무관(ROI 상대 좌표)이라 다시 학습할 필요 없다.
//   저장: data/jig-profiles.json(LOT_JIG_PROFILES). 코드 덮어쓰기와 무관한 data/ 아래.
// related files:
// - bg/pc2/lot-server/src/engrave/recognize.js
// - bg/pc2/lot-server/src/index.js
// - bg/pc2/lot-server/public/station.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

/** 2026-11-27 지그(UM20, 1280×720): 각인 면이 x 0.33–0.58, y 0.12–0.68. 글자 높이 프레임의 ~11–13%. */
export const DEFAULT_PROFILE = {
  id: "jig-1",
  name: "지그 1 (2026-11)",
  roi: { x: 0.33, y: 0.12, w: 0.25, h: 0.56 },
  letterH: { min: 0.085, max: 0.165 },
  // 이 지그는 각인이 세로(회전 90)로 거의 고정. 0/180까지 쓰면 판독이 2배 느리다.
  rotations: [90, 270],
};

export function profilesFile() {
  return process.env.LOT_JIG_PROFILES || path.join(ROOT, "data", "jig-profiles.json");
}

const clamp01 = (v, d) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : d;
};

export function normalizeProfile(p = {}, base = DEFAULT_PROFILE) {
  const roi = p.roi || base.roi;
  const x = clamp01(roi.x, base.roi.x);
  const y = clamp01(roi.y, base.roi.y);
  const w = Math.max(0.02, Math.min(1 - x, clamp01(roi.w, base.roi.w)));
  const h = Math.max(0.02, Math.min(1 - y, clamp01(roi.h, base.roi.h)));
  const lh = p.letterH || base.letterH;
  let min = Math.max(0.02, Math.min(0.6, Number(lh.min) || base.letterH.min));
  let max = Math.max(0.02, Math.min(0.6, Number(lh.max) || base.letterH.max));
  if (min > max) [min, max] = [max, min];
  const rotations = Array.isArray(p.rotations)
    ? [...new Set(p.rotations.map((r) => ((Math.round(Number(r) / 90) * 90) % 360 + 360) % 360))]
    : base.rotations;
  const id = String(p.id || base.id).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "jig";
  return {
    id,
    name: String(p.name || base.name || id).slice(0, 60),
    roi: { x: round4(x), y: round4(y), w: round4(w), h: round4(h) },
    letterH: { min: round4(min), max: round4(max) },
    rotations: rotations.length ? rotations : [0, 90, 180, 270],
    createdAt: p.createdAt || null,
    updatedAt: p.updatedAt || null,
  };
}

function round4(v) {
  return Math.round(v * 10000) / 10000;
}

export function loadProfiles(file = profilesFile()) {
  try {
    if (fs.existsSync(file)) {
      const j = JSON.parse(fs.readFileSync(file, "utf8"));
      const profiles = {};
      for (const p of Object.values(j.profiles || {})) {
        const n = normalizeProfile(p);
        profiles[n.id] = n;
      }
      if (!Object.keys(profiles).length) profiles[DEFAULT_PROFILE.id] = normalizeProfile(DEFAULT_PROFILE);
      const active = profiles[j.active] ? j.active : Object.keys(profiles)[0];
      return { active, profiles };
    }
  } catch {}
  const d = normalizeProfile(DEFAULT_PROFILE);
  return { active: d.id, profiles: { [d.id]: d } };
}

function write(state, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
  fs.renameSync(tmp, file);
  return state;
}

export function activeProfile(file = profilesFile()) {
  const s = loadProfiles(file);
  return s.profiles[s.active];
}

/** 만들기·고치기. id가 없으면 이름에서 만든다. */
export function upsertProfile(input, { activate = false } = {}, file = profilesFile()) {
  const s = loadProfiles(file);
  const id = String(input.id || "").trim() || `jig-${Date.now().toString(36)}`;
  const prev = s.profiles[id];
  const now = new Date().toISOString();
  const p = normalizeProfile({ ...(prev || DEFAULT_PROFILE), ...input, id, createdAt: prev?.createdAt || now, updatedAt: now }, prev || DEFAULT_PROFILE);
  s.profiles[p.id] = p;
  if (activate) s.active = p.id;
  write(s, file);
  return { state: s, profile: p };
}

export function duplicateProfile(id, name, file = profilesFile()) {
  const s = loadProfiles(file);
  const src = s.profiles[id] || s.profiles[s.active];
  const copy = { ...src, id: `jig-${Date.now().toString(36)}`, name: name || `${src.name} 복사본`, createdAt: null };
  return upsertProfile(copy, { activate: true }, file);
}

export function selectProfile(id, file = profilesFile()) {
  const s = loadProfiles(file);
  if (!s.profiles[id]) throw new Error("없는 지그 프로필입니다.");
  s.active = id;
  return write(s, file);
}

// 기공소 AI 디자인 — 디자인 프리셋(내면 파라미터) 정규화.
// 프리셋마다 크라운·인레이온레이·임플란트 열을 둔다. 기본 프리셋 값은 프론트가 SSOT다.
// related files:
// - web/frontend/src/shared/practice/labDesignPresets.ts
// - web/backend/controllers/labDesignPresets/labDesignPreset.controller.js

export const MAX_LAB_DESIGN_PRESETS = 40;
const MAX_NAME = 40;

export const INNER_KINDS = ["crown", "cavity", "implant"];
const METHODS = ["milling", "print"];
const MATERIALS_BY_METHOD = {
  milling: ["zirconia", "glass", "pmma"],
  print: ["resin"],
};

/** [min, max]. 프론트 `INNER_FIELDS`와 같다. */
export const INNER_RANGES = {
  toolRadiusMm: [0, 1.5],
  minThicknessMm: [0.2, 3],
  cementGapMm: [0, 0.3],
  extraGapMm: [0, 0.3],
  sealGapMm: [0, 0.3],
  sealHeightMm: [0, 3],
  marginWidthMm: [0, 1],
  marginAngleDeg: [0, 90],
};

function clampNumber(value, [min, max]) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.min(max, Math.max(min, n)) * 1000) / 1000;
}

export function normalizeInnerParams(raw) {
  if (!raw || typeof raw !== "object") return null;
  const method = METHODS.includes(raw.method) ? raw.method : "milling";
  const materials = MATERIALS_BY_METHOD[method];
  const material = materials.includes(raw.material) ? raw.material : materials[0];
  const out = { method, material };
  for (const [key, range] of Object.entries(INNER_RANGES)) {
    const value = clampNumber(raw[key], range);
    if (value == null) return null;
    out[key] = value;
  }
  if (method === "print") out.toolRadiusMm = 0;
  return out;
}

function normalizePreset(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim().slice(0, 64);
  const name = String(raw.name || "").trim().slice(0, MAX_NAME);
  if (!id || !name) return null;
  const out = {
    id,
    name,
    clinicName: String(raw.clinicName || "").trim().slice(0, 80),
  };
  for (const kind of INNER_KINDS) {
    const params = normalizeInnerParams(raw[kind]);
    if (!params) return null;
    out[kind] = params;
  }
  return out;
}

/** 저장 전 정리. 목록이 비면 null(프론트 기본 프리셋을 쓴다). */
export function normalizeLabDesignPresets(raw) {
  const list = Array.isArray(raw?.presets) ? raw.presets : [];
  const seen = new Set();
  const presets = [];
  for (const row of list) {
    const preset = normalizePreset(row);
    if (!preset || seen.has(preset.id)) continue;
    seen.add(preset.id);
    presets.push(preset);
    if (presets.length >= MAX_LAB_DESIGN_PRESETS) break;
  }
  if (presets.length === 0) return null;
  const wanted = String(raw?.defaultId || "").trim();
  return {
    presets,
    defaultId: seen.has(wanted) ? wanted : presets[0].id,
  };
}

// related files:
// - web/frontend/src/shared/practice/requestStagePresets.ts
// - web/backend/controllers/practiceTransfers/practiceTransferSettings.controller.js
// - web/backend/models/businessAnchor.model.js
// - web/backend/models/practiceTransfer.model.js
// - 2026-09-07: 기공의뢰 다단계 단계 프리셋 정규화(BE).

export const DEFAULT_ARRIVAL_OFFSET_DAYS = 7;
export const MAX_REQUEST_STAGE_PRESETS = 40;
export const MAX_STAGES_PER_PRESET = 12;
export const MAX_STAGE_NAME_LEN = 48;

export const DEFAULT_REQUEST_STAGE_PRESETS = [
  {
    prosthesisType: "전체틀니",
    stages: [
      { name: "스냅인상", arrivalOffsetDays: DEFAULT_ARRIVAL_OFFSET_DAYS },
      { name: "최종인상", arrivalOffsetDays: DEFAULT_ARRIVAL_OFFSET_DAYS },
      { name: "교합채득", arrivalOffsetDays: DEFAULT_ARRIVAL_OFFSET_DAYS },
      { name: "배열확인", arrivalOffsetDays: DEFAULT_ARRIVAL_OFFSET_DAYS },
      { name: "완성", arrivalOffsetDays: DEFAULT_ARRIVAL_OFFSET_DAYS },
    ],
  },
  {
    prosthesisType: "부분틀니",
    stages: [
      { name: "스냅인상", arrivalOffsetDays: DEFAULT_ARRIVAL_OFFSET_DAYS },
      { name: "최종인상", arrivalOffsetDays: DEFAULT_ARRIVAL_OFFSET_DAYS },
      {
        name: "프레임시적&교합채득",
        arrivalOffsetDays: DEFAULT_ARRIVAL_OFFSET_DAYS,
      },
      { name: "배열확인", arrivalOffsetDays: DEFAULT_ARRIVAL_OFFSET_DAYS },
      { name: "완성", arrivalOffsetDays: DEFAULT_ARRIVAL_OFFSET_DAYS },
    ],
  },
];

const LEGACY_DEFAULT_STAGE_NAME_SIGS = {
  전체틀니: "인상|교합채득|납의치시적|완성",
  부분틀니: "인상|금속프레임시적|납의치시적|완성",
};

const stageNameSignature = (stages) =>
  (Array.isArray(stages) ? stages : []).map((s) => String(s?.name || "")).join("|");

const normalizeOffsetDays = (value) => {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return DEFAULT_ARRIVAL_OFFSET_DAYS;
  return Math.min(365, Math.max(0, Math.floor(raw)));
};

export const normalizeRequestStages = (items) => {
  const list = Array.isArray(items) ? items : [];
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const row = raw && typeof raw === "object" ? raw : {};
    const name = String(row.name || "").trim().slice(0, MAX_STAGE_NAME_LEN);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      name,
      arrivalOffsetDays: normalizeOffsetDays(row.arrivalOffsetDays),
    });
    if (out.length >= MAX_STAGES_PER_PRESET) break;
  }
  return out;
};

/**
 * null/undefined → 기본(전체틀니·부분틀니).
 * 배열 → 정규화만(빈 배열=의도적 삭제).
 */
export const normalizeRequestStagePresets = (items) => {
  if (items == null) {
    return DEFAULT_REQUEST_STAGE_PRESETS.map((row) => ({
      prosthesisType: row.prosthesisType,
      stages: row.stages.map((s) => ({ ...s })),
    }));
  }
  const list = Array.isArray(items) ? items : [];
  const byType = new Map();

  for (const raw of list) {
    const row = raw && typeof raw === "object" ? raw : {};
    const prosthesisType = String(row.prosthesisType || "")
      .trim()
      .slice(0, MAX_STAGE_NAME_LEN);
    if (!prosthesisType) continue;
    let stages = normalizeRequestStages(row.stages);
    const legacySig = LEGACY_DEFAULT_STAGE_NAME_SIGS[prosthesisType];
    if (legacySig && stageNameSignature(stages) === legacySig) {
      const upgraded = DEFAULT_REQUEST_STAGE_PRESETS.find(
        (p) => p.prosthesisType === prosthesisType,
      );
      if (upgraded) stages = upgraded.stages.map((s) => ({ ...s }));
    }
    if (stages.length === 0) continue;
    const key = prosthesisType.toLowerCase();
    byType.set(key, { prosthesisType, stages });
    if (byType.size >= MAX_REQUEST_STAGE_PRESETS) break;
  }

  return Array.from(byType.values());
};

export const normalizeLabRequestStagePlan = (raw) => {
  const row = raw && typeof raw === "object" ? raw : {};
  const prosthesisType = String(row.prosthesisType || "").trim();
  const stages = normalizeRequestStages(row.stages);
  if (!prosthesisType || stages.length === 0) return null;
  const idxRaw = Number(row.currentIndex);
  const currentIndex = Number.isFinite(idxRaw)
    ? Math.min(stages.length - 1, Math.max(0, Math.floor(idxRaw)))
    : 0;
  return { prosthesisType, stages, currentIndex };
};

export const normalizeLabRequestStagePlans = (items) => {
  const list = Array.isArray(items) ? items : [];
  const byType = new Map();
  for (const raw of list) {
    const plan = normalizeLabRequestStagePlan(raw);
    if (!plan) continue;
    byType.set(plan.prosthesisType.toLowerCase(), plan);
  }
  return Array.from(byType.values());
};

export const advanceLabRequestStagePlans = (plans) =>
  normalizeLabRequestStagePlans(plans).map((plan) => {
    if (plan.currentIndex >= plan.stages.length - 1) return plan;
    return { ...plan, currentIndex: plan.currentIndex + 1 };
  });

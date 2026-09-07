// related files:
// - web/backend/controllers/practiceTransfers/practiceTransferSettings.controller.js
// - web/backend/models/businessAnchor.model.js
// - web/backend/models/practiceTransfer.model.js
// - web/frontend/src/pages/practice/components/PracticeTransferArrivalSettingsTab.tsx
// - web/frontend/src/shared/components/practice/PracticeRequestStagePresetDialog.tsx
// - 2026-09-07: 기공의뢰 다단계(틀니 등) 단계 프리셋 — 도착 일수·이름 순서.

import { DEFAULT_PRACTICE_ARRIVAL_OFFSET_DAYS } from "@/shared/practice/labArrivalDefaults";

export const MAX_REQUEST_STAGE_PRESETS = 40;
export const MAX_STAGES_PER_PRESET = 12;
export const MAX_STAGE_NAME_LEN = 48;

export type PracticeRequestStage = {
  name: string;
  /** 해당 단계 주문일 → 치과도착 달력 일수 */
  arrivalOffsetDays: number;
};

export type PracticeRequestStagePreset = {
  prosthesisType: string;
  stages: PracticeRequestStage[];
};

/** 전송 스냅샷 — 프리셋 복사 + 현재 단계 인덱스 */
export type PracticeLabRequestStagePlan = {
  prosthesisType: string;
  stages: PracticeRequestStage[];
  currentIndex: number;
};

export const DEFAULT_REQUEST_STAGE_PRESETS: PracticeRequestStagePreset[] = [
  {
    prosthesisType: "전체틀니",
    stages: [
      {
        name: "스냅인상",
        arrivalOffsetDays: DEFAULT_PRACTICE_ARRIVAL_OFFSET_DAYS,
      },
      {
        name: "최종인상",
        arrivalOffsetDays: DEFAULT_PRACTICE_ARRIVAL_OFFSET_DAYS,
      },
      {
        name: "교합채득",
        arrivalOffsetDays: DEFAULT_PRACTICE_ARRIVAL_OFFSET_DAYS,
      },
      {
        name: "배열확인",
        arrivalOffsetDays: DEFAULT_PRACTICE_ARRIVAL_OFFSET_DAYS,
      },
      { name: "완성", arrivalOffsetDays: DEFAULT_PRACTICE_ARRIVAL_OFFSET_DAYS },
    ],
  },
  {
    prosthesisType: "부분틀니",
    stages: [
      {
        name: "스냅인상",
        arrivalOffsetDays: DEFAULT_PRACTICE_ARRIVAL_OFFSET_DAYS,
      },
      {
        name: "최종인상",
        arrivalOffsetDays: DEFAULT_PRACTICE_ARRIVAL_OFFSET_DAYS,
      },
      {
        name: "프레임시적&교합채득",
        arrivalOffsetDays: DEFAULT_PRACTICE_ARRIVAL_OFFSET_DAYS,
      },
      {
        name: "배열확인",
        arrivalOffsetDays: DEFAULT_PRACTICE_ARRIVAL_OFFSET_DAYS,
      },
      { name: "완성", arrivalOffsetDays: DEFAULT_PRACTICE_ARRIVAL_OFFSET_DAYS },
    ],
  },
];

/** 2026-09-07 초안 기본값 — 새 기본으로 승격 */
const LEGACY_DEFAULT_STAGE_NAME_SIGS: Record<string, string> = {
  전체틀니: "인상|교합채득|납의치시적|완성",
  부분틀니: "인상|금속프레임시적|납의치시적|완성",
};

const stageNameSignature = (stages: PracticeRequestStage[]) =>
  stages.map((s) => s.name).join("|");

const normalizeOffsetDays = (value: unknown): number => {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return DEFAULT_PRACTICE_ARRIVAL_OFFSET_DAYS;
  return Math.min(365, Math.max(0, Math.floor(raw)));
};

export const normalizeRequestStage = (
  raw: unknown,
): PracticeRequestStage | null => {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const name = String(row.name || "").trim().slice(0, MAX_STAGE_NAME_LEN);
  if (!name) return null;
  return {
    name,
    arrivalOffsetDays: normalizeOffsetDays(row.arrivalOffsetDays),
  };
};

export const normalizeRequestStages = (
  items: unknown,
): PracticeRequestStage[] => {
  const list = Array.isArray(items) ? items : [];
  const out: PracticeRequestStage[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const stage = normalizeRequestStage(raw);
    if (!stage) continue;
    const key = stage.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(stage);
    if (out.length >= MAX_STAGES_PER_PRESET) break;
  }
  return out;
};

/**
 * null/undefined → 기본(전체틀니·부분틀니).
 * 배열(빈 배열 포함) → 정규화만(의도적 삭제 유지).
 */
export const normalizeRequestStagePresets = (
  items: unknown,
): PracticeRequestStagePreset[] => {
  if (items == null) {
    return DEFAULT_REQUEST_STAGE_PRESETS.map((row) => ({
      prosthesisType: row.prosthesisType,
      stages: row.stages.map((s) => ({ ...s })),
    }));
  }
  const list = Array.isArray(items) ? items : [];
  const byType = new Map<string, PracticeRequestStagePreset>();

  for (const raw of list) {
    const row =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
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
    // 단계 0개 = 다단계 아님(프리셋 제거). 목록에는 남기지 않음.
    if (stages.length === 0) continue;
    const key = prosthesisType.toLowerCase();
    byType.set(key, { prosthesisType, stages });
    if (byType.size >= MAX_REQUEST_STAGE_PRESETS) break;
  }

  return Array.from(byType.values());
};

export const resolveRequestStagePreset = (
  prosthesisType: string | null | undefined,
  presets: PracticeRequestStagePreset[] | null | undefined,
): PracticeRequestStagePreset | null => {
  const typeName = String(prosthesisType || "").trim();
  if (!typeName) return null;
  const rows = normalizeRequestStagePresets(presets ?? null);
  const hit = rows.find(
    (row) => row.prosthesisType.toLowerCase() === typeName.toLowerCase(),
  );
  return hit && hit.stages.length > 0 ? hit : null;
};

export const prosthesisTypeHasRequestStages = (
  prosthesisType: string | null | undefined,
  presets: PracticeRequestStagePreset[] | null | undefined,
): boolean => Boolean(resolveRequestStagePreset(prosthesisType, presets));

export const upsertRequestStagePreset = (
  presets: PracticeRequestStagePreset[],
  next: PracticeRequestStagePreset,
): PracticeRequestStagePreset[] => {
  const prosthesisType = String(next.prosthesisType || "").trim();
  const stages = normalizeRequestStages(next.stages);
  const without = normalizeRequestStagePresets(presets).filter(
    (row) => row.prosthesisType.toLowerCase() !== prosthesisType.toLowerCase(),
  );
  if (!prosthesisType || stages.length === 0) return without;
  return [{ prosthesisType, stages }, ...without].slice(
    0,
    MAX_REQUEST_STAGE_PRESETS,
  );
};

export const normalizeLabRequestStagePlan = (
  raw: unknown,
): PracticeLabRequestStagePlan | null => {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const prosthesisType = String(row.prosthesisType || "").trim();
  const stages = normalizeRequestStages(row.stages);
  if (!prosthesisType || stages.length === 0) return null;
  const idxRaw = Number(row.currentIndex);
  const currentIndex = Number.isFinite(idxRaw)
    ? Math.min(stages.length - 1, Math.max(0, Math.floor(idxRaw)))
    : 0;
  return { prosthesisType, stages, currentIndex };
};

export const normalizeLabRequestStagePlans = (
  items: unknown,
): PracticeLabRequestStagePlan[] => {
  const list = Array.isArray(items) ? items : [];
  const byType = new Map<string, PracticeLabRequestStagePlan>();
  for (const raw of list) {
    const plan = normalizeLabRequestStagePlan(raw);
    if (!plan) continue;
    byType.set(plan.prosthesisType.toLowerCase(), plan);
  }
  return Array.from(byType.values());
};

export const buildLabRequestStagePlansFromTypes = (
  prosthesisTypes: string[],
  presets: PracticeRequestStagePreset[] | null | undefined,
): PracticeLabRequestStagePlan[] => {
  const plans: PracticeLabRequestStagePlan[] = [];
  const seen = new Set<string>();
  for (const raw of prosthesisTypes) {
    const typeName = String(raw || "").trim();
    if (!typeName) continue;
    const key = typeName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const preset = resolveRequestStagePreset(typeName, presets);
    if (!preset) continue;
    plans.push({
      prosthesisType: preset.prosthesisType,
      stages: preset.stages.map((s) => ({ ...s })),
      currentIndex: 0,
    });
  }
  return plans;
};

export const currentStageOfPlan = (
  plan: PracticeLabRequestStagePlan | null | undefined,
): PracticeRequestStage | null => {
  if (!plan || !plan.stages.length) return null;
  const idx = Math.min(
    plan.stages.length - 1,
    Math.max(0, Math.floor(Number(plan.currentIndex) || 0)),
  );
  return plan.stages[idx] || null;
};

export const nextStageOfPlan = (
  plan: PracticeLabRequestStagePlan | null | undefined,
): PracticeRequestStage | null => {
  if (!plan || !plan.stages.length) return null;
  const idx = Math.min(
    plan.stages.length - 1,
    Math.max(0, Math.floor(Number(plan.currentIndex) || 0)),
  );
  if (idx >= plan.stages.length - 1) return null;
  return plan.stages[idx + 1] || null;
};

/** 재도착 시 모든 플랜의 currentIndex를 1 올림(이미 마지막이면 유지). */
export const advanceLabRequestStagePlans = (
  plans: PracticeLabRequestStagePlan[] | null | undefined,
): PracticeLabRequestStagePlan[] => {
  return normalizeLabRequestStagePlans(plans).map((plan) => {
    if (plan.currentIndex >= plan.stages.length - 1) return plan;
    return { ...plan, currentIndex: plan.currentIndex + 1 };
  });
};

/** 다음 단계들의 도착 일수 중 최대(여러 플랜이 함께 진행될 때). */
export const resolveNextStageArrivalOffsetDays = (
  plans: PracticeLabRequestStagePlan[] | null | undefined,
  fallback: number = DEFAULT_PRACTICE_ARRIVAL_OFFSET_DAYS,
): number => {
  const offsets = normalizeLabRequestStagePlans(plans)
    .map((plan) => nextStageOfPlan(plan)?.arrivalOffsetDays)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (offsets.length === 0) return normalizeOffsetDays(fallback);
  return Math.max(...offsets.map(normalizeOffsetDays));
};

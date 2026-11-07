export const COMPOSITE_FINISH_STEP_MM_OPTIONS = [0.03, 0.05, 0.1, 0.2] as const;

export type CompositeFinishStepMm = (typeof COMPOSITE_FINISH_STEP_MM_OPTIONS)[number];

export type CompositeFinishStepDraft = "requestor" | CompositeFinishStepMm;

const ALLOWED = new Set<number>(COMPOSITE_FINISH_STEP_MM_OPTIONS);

export function normalizeCompositeFinishStepOverrideMm(
  raw: unknown,
): CompositeFinishStepMm | null | undefined {
  if (raw === null || raw === undefined || raw === "") {
    return null;
  }
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) {
    return undefined;
  }
  for (const allowed of COMPOSITE_FINISH_STEP_MM_OPTIONS) {
    if (Math.abs(n - allowed) < 1e-6) {
      return allowed;
    }
  }
  return undefined;
}

export function overrideMmToDraft(
  overrideMm: unknown,
): CompositeFinishStepDraft {
  const normalized = normalizeCompositeFinishStepOverrideMm(overrideMm);
  if (normalized == null) {
    return "requestor";
  }
  if (normalized === undefined) {
    return "requestor";
  }
  return normalized;
}

export function resolveCompositePostStepMm(
  retentionGroove: "none" | "shallow" | "deep" | undefined,
  overrideMm: unknown,
): CompositeFinishStepMm {
  const normalized = normalizeCompositeFinishStepOverrideMm(overrideMm);
  if (normalized != null && normalized !== undefined && ALLOWED.has(normalized)) {
    return normalized;
  }
  return retentionGroove === "deep" ? 0.2 : 0.05;
}

/** Finish_Back 기본. 5axisComposite_Back.prc. 백엔드 resolveFinishBackStepMm과 같다. */
export const FINISH_BACK_STEP_DEFAULT_MM = 0.07;
const FINISH_BACK_STEP_MIN_MM = 0.03;
const FINISH_BACK_STEP_MAX_MM = 0.07;
const FINISH_BACK_SURFACE_STEP_MM =
  FINISH_BACK_STEP_MIN_MM / Math.cos((78 * Math.PI) / 180);

function quantizeFinishBackStepMm(mm: number): number {
  const rounded = Math.round((mm + Number.EPSILON) * 100) / 100;
  return Math.min(FINISH_BACK_STEP_MAX_MM, Math.max(FINISH_BACK_STEP_MIN_MM, rounded));
}

export function finishBackStepMmFromCuffAngleDeg(angleDeg: number): number {
  if (!Number.isFinite(angleDeg)) return FINISH_BACK_STEP_DEFAULT_MM;
  const clampedAngle = Math.min(89, Math.max(0, angleDeg));
  const raw = FINISH_BACK_SURFACE_STEP_MM * Math.cos((clampedAngle * Math.PI) / 180);
  const clamped = Math.min(FINISH_BACK_STEP_MAX_MM, Math.max(FINISH_BACK_STEP_MIN_MM, raw));
  return quantizeFinishBackStepMm(clamped);
}

export function readCuffAngleDegForFinishBack(caseInfos?: {
  cuffBlend?: { status?: string; maxAngleDeg?: number | null };
  cuffProposal?: { maxCuffAngleDegBefore?: number | null };
} | null): number | null {
  const blend = caseInfos?.cuffBlend;
  const applied = Number(blend?.maxAngleDeg);
  if (blend?.status === "applied" && Number.isFinite(applied)) return applied;
  const before = Number(caseInfos?.cuffProposal?.maxCuffAngleDegBefore);
  if (Number.isFinite(before)) return before;
  return null;
}

export function resolveCompositeGingivaStepMm(
  overrideMm: unknown,
  caseInfos?: {
    cuffBlend?: { status?: string; maxAngleDeg?: number | null };
    cuffProposal?: { maxCuffAngleDegBefore?: number | null };
  } | null,
): number {
  const normalized = normalizeCompositeFinishStepOverrideMm(overrideMm);
  if (normalized != null && normalized !== undefined && ALLOWED.has(normalized)) {
    return normalized;
  }
  const angle = readCuffAngleDegForFinishBack(caseInfos);
  if (angle == null) return FINISH_BACK_STEP_DEFAULT_MM;
  return finishBackStepMmFromCuffAngleDeg(angle);
}

export function formatCompositeStepMmLabel(mm: number): string {
  for (const allowed of COMPOSITE_FINISH_STEP_MM_OPTIONS) {
    if (Math.abs(mm - allowed) < 1e-6) {
      return allowed.toFixed(2);
    }
  }
  return mm.toFixed(2);
}

export function draftToOverrideMm(
  draft: CompositeFinishStepDraft,
): number | null {
  return draft === "requestor" ? null : draft;
}

export function compositeFinishStepsMatch(postMm: number, gingivaMm: number): boolean {
  return Math.abs(postMm - gingivaMm) < 1e-6;
}

export function resolveEffectiveCompositeSteps(caseInfos?: {
  retentionGroove?: "none" | "shallow" | "deep";
  compositeStepIncrementPostOverrideMm?: unknown;
  compositeStepIncrementGingivaOverrideMm?: unknown;
  cuffBlend?: { status?: string; maxAngleDeg?: number | null };
  cuffProposal?: { maxCuffAngleDegBefore?: number | null };
} | null): { post: CompositeFinishStepMm; gingiva: number } {
  return {
    post: resolveCompositePostStepMm(
      caseInfos?.retentionGroove,
      caseInfos?.compositeStepIncrementPostOverrideMm,
    ),
    gingiva: resolveCompositeGingivaStepMm(
      caseInfos?.compositeStepIncrementGingivaOverrideMm,
      caseInfos,
    ),
  };
}

// [legacy One Pass] PreviewModal 토글 제거. Finish는 항상 2–3단.
// export function resolveOnePassEnabled(_caseInfos?: unknown): boolean {
//   return false;
// }

export function displayedCompositeStepMm(
  draft: CompositeFinishStepDraft,
  effectiveMm: number,
): number {
  return draft === "requestor" ? effectiveMm : draft;
}

export function compositeStepTriggerLabel(
  side: "포스트" | "치은",
  draft: CompositeFinishStepDraft,
  effectiveMm: number,
): string {
  if (draft === "requestor") {
    return `${side} 의뢰 ${formatCompositeStepMmLabel(effectiveMm)}`;
  }
  return `${side} ${formatCompositeStepMmLabel(draft)}`;
}

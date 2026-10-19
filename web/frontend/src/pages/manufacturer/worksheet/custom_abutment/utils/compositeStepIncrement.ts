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

export function resolveCompositeGingivaStepMm(
  overrideMm: unknown,
): CompositeFinishStepMm {
  const normalized = normalizeCompositeFinishStepOverrideMm(overrideMm);
  if (normalized != null && normalized !== undefined && ALLOWED.has(normalized)) {
    return normalized;
  }
  return 0.05;
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
} | null): { post: CompositeFinishStepMm; gingiva: CompositeFinishStepMm } {
  return {
    post: resolveCompositePostStepMm(
      caseInfos?.retentionGroove,
      caseInfos?.compositeStepIncrementPostOverrideMm,
    ),
    gingiva: resolveCompositeGingivaStepMm(
      caseInfos?.compositeStepIncrementGingivaOverrideMm,
    ),
  };
}

/** NC·ESPRIT 적용 여부 — caseInfos.onePassEnabled와 포스트·치은 스텝 일치. */
export function resolveOnePassEnabled(caseInfos?: {
  onePassEnabled?: boolean;
  retentionGroove?: "none" | "shallow" | "deep";
  compositeStepIncrementPostOverrideMm?: unknown;
  compositeStepIncrementGingivaOverrideMm?: unknown;
} | null): boolean {
  if (caseInfos?.onePassEnabled !== true) return false;
  const { post, gingiva } = resolveEffectiveCompositeSteps(caseInfos);
  return compositeFinishStepsMatch(post, gingiva);
}

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

/** Finish Composite StepIncrement(mm) — 포스트(A)·치은(B). 제조사 override 또는 의뢰자(retentionGroove). */
export const COMPOSITE_FINISH_STEP_MM_VALUES = [0.03, 0.05, 0.1, 0.2];

const ALLOWED = new Set(COMPOSITE_FINISH_STEP_MM_VALUES);

export function normalizeCompositeFinishStepOverrideMm(raw) {
  if (raw === null || raw === undefined || raw === "") {
    return null;
  }
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) {
    return undefined;
  }
  for (const allowed of COMPOSITE_FINISH_STEP_MM_VALUES) {
    if (Math.abs(n - allowed) < 1e-6) {
      return allowed;
    }
  }
  return undefined;
}

export function resolveCompositePostStepMmFromRetentionGroove(retentionGroove) {
  const rg = String(retentionGroove || "")
    .trim()
    .toLowerCase();
  if (rg === "deep" || rg === "있음") {
    return 0.2;
  }
  return 0.05;
}

export function isAllowedCompositeFinishStepMm(n) {
  return ALLOWED.has(n);
}

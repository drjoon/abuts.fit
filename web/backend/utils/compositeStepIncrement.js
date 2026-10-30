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

export function resolveEffectiveCompositeSteps(caseInfos) {
  const postOverride = normalizeCompositeFinishStepOverrideMm(
    caseInfos?.compositeStepIncrementPostOverrideMm,
  );
  const gingivaOverride = normalizeCompositeFinishStepOverrideMm(
    caseInfos?.compositeStepIncrementGingivaOverrideMm,
  );
  return {
    post:
      postOverride ??
      resolveCompositePostStepMmFromRetentionGroove(caseInfos?.retentionGroove),
    gingiva: gingivaOverride ?? 0.05,
  };
}

// [legacy One Pass] PreviewModal 토글 제거. Finish는 항상 2–3단.
// export function resolveOnePassEnabled(_caseInfos) {
//   return false;
// }

export function readStampedCompositeSteps(ncFile) {
  const post = Number(ncFile?.compositeStepPostMm);
  const gingiva = Number(ncFile?.compositeStepGingivaMm);
  if (!Number.isFinite(post) || !Number.isFinite(gingiva)) return null;
  return { post, gingiva };
}

export function compositeStepsMatch(left, right) {
  if (!left || !right) return false;
  return (
    Math.abs(Number(left.post) - Number(right.post)) < 1e-6 &&
    Math.abs(Number(left.gingiva) - Number(right.gingiva)) < 1e-6
  );
}

const NC_OWNER_REQUEST_ID = /\d{8}-[A-Z0-9]{6,10}/gi;

/** NC 경로에 들어 있는 의뢰번호. 이 의뢰번호가 있으면 그 파일은 이 카드 것이다. */
export function ncOwnerRequestId(ncFile, selfRequestId) {
  const blob = [ncFile?.s3Key, ncFile?.filePath, ncFile?.fileName]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" ");
  const self = String(selfRequestId || "").trim().toLowerCase();
  const ids = blob.match(NC_OWNER_REQUEST_ID) || [];
  const unique = [...new Set(ids.map((id) => id.toUpperCase()))];
  if (self && unique.some((id) => id.toLowerCase() === self)) {
    return self.toUpperCase();
  }
  return unique[0] || null;
}

export function stampCompositeStepsOnNcFile(ncFile, caseInfos) {
  if (!ncFile || typeof ncFile !== "object") return ncFile || null;
  const steps =
    readStampedCompositeSteps(ncFile) ||
    resolveEffectiveCompositeSteps(caseInfos);
  return {
    ...ncFile,
    compositeStepPostMm: steps.post,
    compositeStepGingivaMm: steps.gingiva,
  };
}

export function isAllowedCompositeFinishStepMm(n) {
  return ALLOWED.has(n);
}

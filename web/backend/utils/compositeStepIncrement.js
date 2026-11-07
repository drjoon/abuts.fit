/** Finish Composite StepIncrement(mm) — 포스트(A)·치은(B). 제조사 override 또는 자동. */
export const COMPOSITE_FINISH_STEP_MM_VALUES = [0.03, 0.05, 0.1, 0.2];

/** Finish_Back 기본. 5axisComposite_Back.prc StepIncrement. */
export const FINISH_BACK_STEP_DEFAULT_MM = 0.07;
export const FINISH_BACK_STEP_MIN_MM = 0.03;
export const FINISH_BACK_STEP_MAX_MM = 0.07;
/**
 * 축에서 78°로 누운 커프에 축 스텝 0.03mm를 주면 면에 남는 간격.
 * 그보다 선 각도는 같은 면 간격을 유지하고, 0.03mm 밑으로는 내리지 않는다.
 */
const FINISH_BACK_REF_ANGLE_DEG = 78;
const FINISH_BACK_SURFACE_STEP_MM =
  FINISH_BACK_STEP_MIN_MM /
  Math.cos((FINISH_BACK_REF_ANGLE_DEG * Math.PI) / 180);

/** 이 표식이 있는 NC의 치은 스텝은 실제 가공값. 없는 0.05는 예전 PRC 0.07 스탬프다. */
export const GINGIVA_STEP_RULE_CUFF_ANGLE = "cuff-angle-v1";

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

/** 0.03~0.07을 0.01mm 단위로 반올림한다. */
function quantizeFinishBackStepMm(mm) {
  const rounded = Math.round((mm + Number.EPSILON) * 100) / 100;
  return Math.min(
    FINISH_BACK_STEP_MAX_MM,
    Math.max(FINISH_BACK_STEP_MIN_MM, rounded),
  );
}

/** 축 기준 커프 각도(0=수직, 90=수평) → Finish_Back 축 스텝(mm). */
export function finishBackStepMmFromCuffAngleDeg(angleDeg) {
  const angle = Number(angleDeg);
  if (!Number.isFinite(angle)) return FINISH_BACK_STEP_DEFAULT_MM;
  const clampedAngle = Math.min(89, Math.max(0, angle));
  const raw =
    FINISH_BACK_SURFACE_STEP_MM *
    Math.cos((clampedAngle * Math.PI) / 180);
  const clamped = Math.min(
    FINISH_BACK_STEP_MAX_MM,
    Math.max(FINISH_BACK_STEP_MIN_MM, raw),
  );
  return quantizeFinishBackStepMm(clamped);
}

/**
 * 가공되는 커프 면의 최대 기울기.
 * 보정이 적용된 면이 있으면 그 각도. 아니면 제안 전 원본 각도.
 */
export function readCuffAngleDegForFinishBack(caseInfos) {
  const blend = caseInfos?.cuffBlend;
  const applied = Number(blend?.maxAngleDeg);
  if (blend?.status === "applied" && Number.isFinite(applied)) {
    return applied;
  }
  const before = Number(caseInfos?.cuffProposal?.maxCuffAngleDegBefore);
  if (Number.isFinite(before)) return before;
  return null;
}

/** Finish_Back 스텝. 제조사 override가 있으면 그 값, 없으면 커프 각도. */
export function resolveFinishBackStepMm(caseInfos) {
  const override = normalizeCompositeFinishStepOverrideMm(
    caseInfos?.compositeStepIncrementGingivaOverrideMm,
  );
  if (override != null) return override;
  const angle = readCuffAngleDegForFinishBack(caseInfos);
  if (angle == null) return FINISH_BACK_STEP_DEFAULT_MM;
  return finishBackStepMmFromCuffAngleDeg(angle);
}

export function resolveEffectiveCompositeSteps(caseInfos) {
  const postOverride = normalizeCompositeFinishStepOverrideMm(
    caseInfos?.compositeStepIncrementPostOverrideMm,
  );
  return {
    post:
      postOverride ??
      resolveCompositePostStepMmFromRetentionGroove(caseInfos?.retentionGroove),
    gingiva: resolveFinishBackStepMm(caseInfos),
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

/**
 * NC에 적힌 치은 스텝을 실제 가공값으로 읽는다.
 * cuff-angle-v1 이전·override 없음·0.05는 Esprit PRC 0.07이었다.
 */
export function interpretBakedCompositeSteps(ncFile, caseInfos) {
  const stamped = readStampedCompositeSteps(ncFile);
  if (!stamped) return null;
  if (ncFile?.gingivaStepRule === GINGIVA_STEP_RULE_CUFF_ANGLE) {
    return stamped;
  }
  const manual = normalizeCompositeFinishStepOverrideMm(
    caseInfos?.compositeStepIncrementGingivaOverrideMm,
  );
  if (manual == null && Math.abs(stamped.gingiva - 0.05) < 1e-6) {
    return { post: stamped.post, gingiva: FINISH_BACK_STEP_DEFAULT_MM };
  }
  return stamped;
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

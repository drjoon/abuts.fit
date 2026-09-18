// related files:
// - web/backend/controllers/bg/bg.controller.js
// - web/backend/rules.md
// - bg/pc1/esprit-addin/Helpers/NcFileGenerator.cs
//
// 복사샘플 생성 후에는 샘플 액션(NC 재생성 등)이 원본 caseInfos.ncFile 등을
// 덮어쓰면 안 된다. BG register-file 파일명 fallback 점수를 여기서 고정한다.

export const REQUEST_CATEGORY = {
  RND_SAMPLE: "rnd_sample",
  COPIED_SAMPLE: "copied_sample",
};

export function isRndArchivedSampleRequest(requestLike) {
  return (
    String(requestLike?.requestCategory || "").trim() ===
    REQUEST_CATEGORY.RND_SAMPLE
  );
}

export function isCopiedSampleRequest(requestLike) {
  return (
    String(requestLike?.requestCategory || "").trim() ===
    REQUEST_CATEGORY.COPIED_SAMPLE
  );
}

export function isProductionOrderRequest(requestLike) {
  const cat = String(requestLike?.requestCategory || "").trim();
  return !cat || cat === "order";
}

/**
 * 공유 filled STL 파일명 매칭 시 점수.
 * 복사샘플·CAM 진행 중을 우선하고, 이미 NC가 있는 정식 의뢰(order)는 3-nc fallback에서 크게 감점한다.
 */
export function scoreBgFilenameMatchCandidate({
  requestLike,
  sourceStep = "",
  requestReviewStatus = "",
  actualCamStart = null,
  actualCamComplete = null,
  hasNcFile = false,
} = {}) {
  const stageLabel = String(requestLike?.manufacturerStage || "").trim();
  const isSampleWorkingCopy = isCopiedSampleRequest(requestLike);
  const isOrder = isProductionOrderRequest(requestLike);
  const isActiveCamWindow =
    requestReviewStatus === "APPROVED" && actualCamStart && !actualCamComplete;
  const step = String(sourceStep || "").trim();

  let score = 0;
  if (isActiveCamWindow) score += 50;
  if (stageLabel === "준비" || stageLabel === "CAM") score += 15;
  if (!hasNcFile) score += 10;
  if (isSampleWorkingCopy) score += 20;
  // 정식 의뢰에 이미 NC가 있으면 파일명 fallback으로 덮지 않도록 강한 감점
  if (step === "3-nc" && isOrder && hasNcFile) score -= 100;
  return score;
}

/**
 * 3-nc 성공 콜백이 파일명/경로 fallback으로만 잡힌 정식 의뢰의 기존 ncFile을
 * 덮어쓰려 하면 거부한다. (복사샘플 NC가 원본으로 새는 회귀 방지)
 */
export function shouldRefuseNcOverwriteOnProductionOrder({
  sourceStep = "",
  status = "",
  matchSource = "",
  requestLike = null,
  hasExistingNcFile = false,
} = {}) {
  const step = String(sourceStep || "").trim();
  const st = String(status || "")
    .trim()
    .toLowerCase();
  const src = String(matchSource || "").trim();
  if (step !== "3-nc" || st !== "success") return false;
  if (src !== "pathGuess" && src !== "filename") return false;
  if (!isProductionOrderRequest(requestLike)) return false;
  return Boolean(hasExistingNcFile);
}

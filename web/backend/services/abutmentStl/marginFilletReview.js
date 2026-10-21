// related files:
// - web/backend/services/abutmentStl/tightCorner.js
// - web/backend/services/abutmentStl/pipeline.js
// - web/backend/services/abutmentStl/preflight.service.js
//
// 마진 필렛 검사·보정본의 한 곳.
// 간이 검사(업로드 직후)는 screenMarginFillet만 쓴다.
// 정점을 옮기는 correctMarginFillet는 의뢰자 동의 단계인 확인 전 보정 STL만 쓴다. 제조사 준비는 측정만 한다.
import {
  FINISH_BALL_DIAMETER_MM,
  FINISH_BALL_RADIUS_MM,
  TIGHT_CORNER_VERSION,
  correctTightCornerFillet,
  detectTightCorners,
  movedFilletSurface,
  tightCornerMetaFromCorrection,
} from "./tightCorner.js";

/** 평균 필렛 R이 이 값 이상이면 간이 검사에서 보정 없이 진행할 수 있다. 공구 R은 0.6mm. */
export const PROCEED_AS_IS_MIN_AVERAGE_FILLET_MM = 0.5;

export function canProceedAsIs(averageFilletRadiusMm) {
  const r = Number(averageFilletRadiusMm);
  return Number.isFinite(r) && r >= PROCEED_AS_IS_MIN_AVERAGE_FILLET_MM;
}

/** 옮긴 코너가 없을 때의 메타. 제조사 준비가 항상 같은 모양을 남긴다. */
export function emptyMarginFilletReview() {
  return {
    version: TIGHT_CORNER_VERSION,
    toolDiameterMm: FINISH_BALL_DIAMETER_MM,
    tightCount: 0,
    averageFilletRadiusMm: null,
    samples: [],
    tightFinishLineSegments: [],
    ballPassPolylines: [],
    reliefOverlay: null,
    correctionSolid: null,
    needsCorrectionReview: false,
  };
}

/**
 * 간이 검사. 둘레를 성기게 재고 평균 R·타이트 여부·표시용 띠만 만든다.
 * 정점은 옮기지 않고 보정 STL도 만들지 않는다.
 */
export function screenMarginFillet(mesh, finishLinePoints, options = {}) {
  const tightCorner = detectTightCorners(mesh, finishLinePoints, {
    ...options,
    screen: true,
  });
  return {
    tightCorner,
    filletSurface: tightCorner?.reliefOverlay || null,
    toolRadiusMm: FINISH_BALL_RADIUS_MM,
  };
}

/**
 * 완전한 검사와 보정본. 피니시라인 한 바퀴를 재고, 공구 R보다 좁은 코너 정점만 옮긴다.
 * 이 결과로 메시를 바꾸는 것은 확인 전 보정 STL(의뢰자 동의 단계)만 한다.
 * @returns {{ corrected: object|null, tightCorner: object|null, filletSurface: object|null }}
 */
export function correctMarginFillet(mesh, finishLinePoints, options = {}) {
  const corrected = correctTightCornerFillet(mesh, finishLinePoints, options);
  if (!corrected?.movedCount) {
    return { corrected: null, tightCorner: null, filletSurface: null };
  }
  const filletSurface = movedFilletSurface(corrected);
  return {
    corrected,
    filletSurface,
    tightCorner: tightCornerMetaFromCorrection(corrected, filletSurface),
  };
}

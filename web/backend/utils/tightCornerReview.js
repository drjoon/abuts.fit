// related files:
// - web/backend/services/abutmentStl/tightCorner.js
// - web/backend/services/autoMachiningGate.service.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/utils/tightCornerReview.ts
// - web/frontend/src/features/requests/utils/marginFilletInspection.ts
/** tightCorner.js `TIGHT_CORNER_VERSION`과 같아야 한다. 무거운 모듈 import를 피한다. */
const CURRENT_TIGHT_CORNER_VERSION = 9;

/**
 * D1.2 볼(실제 반경 0.5mm)로 깎지 못해 보정 솔리드가 붙는 타이트 코너.
 * filled STL·CAM은 원본 그대로 두고, 작업자 확인·자동 승인 보류 SSOT.
 * v9 미만(피니시라인 날 R0 오검사)은 보정 필요로 보지 않는다.
 */
export function isTightCornerCorrectionRequired(tightCorner) {
  if (!tightCorner || typeof tightCorner !== "object") return false;
  const version = Number(tightCorner.version);
  if (!Number.isFinite(version) || version < CURRENT_TIGHT_CORNER_VERSION) {
    return false;
  }
  if (typeof tightCorner.needsCorrectionReview === "boolean") {
    return tightCorner.needsCorrectionReview;
  }
  const count = Number(tightCorner.tightCount);
  if (!Number.isFinite(count) || count <= 0) return false;
  const solidLen = Number(tightCorner.correctionSolid?.positions?.length);
  const overlayLen = Number(tightCorner.reliefOverlay?.positions?.length);
  return (
    (Number.isFinite(solidLen) && solidLen > 0) ||
    (Number.isFinite(overlayLen) && overlayLen > 0)
  );
}

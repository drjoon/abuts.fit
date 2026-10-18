// related files:
// - web/backend/services/abutmentStl/tightCorner.js
// - web/backend/services/autoMachiningGate.service.js
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/utils/tightCornerReview.ts
/**
 * φ1.2 볼(공구 R 0.6mm)로 깎지 못해 보정 솔리드가 붙는 타이트 코너.
 * filled STL·CAM은 원본 그대로 두고, 작업자 확인·자동 승인 보류 SSOT.
 */
export function isTightCornerCorrectionRequired(tightCorner) {
  if (!tightCorner || typeof tightCorner !== "object") return false;
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

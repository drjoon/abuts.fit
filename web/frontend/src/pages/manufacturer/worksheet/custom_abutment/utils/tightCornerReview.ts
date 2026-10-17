// related files:
// - web/backend/utils/tightCornerReview.js
// - web/frontend/src/features/requests/hooks/useStlMetadata.ts

/** fillet R < 공구 R(0.6mm) — 보정 솔리드가 메타에 담긴 경우 */
export function isTightCornerCorrectionRequired(
  tightCorner: {
    tightCount?: number;
    correctionSolid?: { positions?: number[] } | null;
    reliefOverlay?: { positions?: number[] } | null;
  } | null | undefined,
): boolean {
  if (!tightCorner || typeof tightCorner !== "object") return false;
  const count = Number(tightCorner.tightCount);
  if (!Number.isFinite(count) || count <= 0) return false;
  const solidLen = Number(tightCorner.correctionSolid?.positions?.length);
  const overlayLen = Number(tightCorner.reliefOverlay?.positions?.length);
  return (
    (Number.isFinite(solidLen) && solidLen > 0) ||
    (Number.isFinite(overlayLen) && overlayLen > 0)
  );
}

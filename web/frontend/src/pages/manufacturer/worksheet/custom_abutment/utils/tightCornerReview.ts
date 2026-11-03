// related files:
// - web/backend/utils/tightCornerReview.js
// - web/frontend/src/features/requests/hooks/useStlMetadata.ts
// - web/frontend/src/features/requests/utils/marginFilletInspection.ts

import { isCurrentTightCornerMeta } from "@/features/requests/utils/marginFilletInspection";

/** fillet R < 공구 R(0.5mm) — 보정 솔리드가 메타에 담긴 경우. 구버전(v9 미만)은 오검사라 무시. */
export function isTightCornerCorrectionRequired(
  tightCorner: {
    version?: number | null;
    tightCount?: number;
    needsCorrectionReview?: boolean;
    correctionSolid?: { positions?: number[] } | null;
    reliefOverlay?: { positions?: number[] } | null;
  } | null | undefined,
): boolean {
  if (!isCurrentTightCornerMeta(tightCorner)) return false;
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

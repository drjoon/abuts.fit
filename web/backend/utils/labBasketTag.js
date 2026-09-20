// related files:
// - web/backend/models/practiceTransfer.model.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/frontend/src/shared/practice/labBasketTagSheetPrint.ts
// - 2026-09-20: 기공소 바구니 번호표 01–99. 기공소 BA(수신) 내 진행 중 unique.
import { resolvePracticeTransferManufacturerStage } from "./practiceTransferStage.js";

/** 01–99 (00 제외) */
export const LAB_BASKET_TAG_RE = /^(0[1-9]|[1-9][0-9])$/;

export function normalizeLabBasketTag(value) {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();
  if (/^\d{1,2}$/.test(raw)) {
    const n = Number(raw);
    if (n >= 1 && n <= 99) return String(n).padStart(2, "0");
  }
  return LAB_BASKET_TAG_RE.test(raw) ? raw : "";
}

/**
 * 진행 중 의뢰가 번호표를 점유하는지.
 * FE `isLabBasketTagOccupyingTransfer`와 동일 의도 — 취소/거부·완료(어벗 없음)는 해제, 완료 후 재사용.
 */
export function isLabBasketTagOccupyingDoc(doc, labAnchorId = null) {
  if (!doc) return false;
  const stage = resolvePracticeTransferManufacturerStage(doc, {
    viewerLabAnchorId: labAnchorId,
  });
  if (stage === "작업취소" || stage === "취소" || stage === "거부") {
    return false;
  }

  const production =
    doc?.production && typeof doc.production === "object" ? doc.production : {};
  const designN = Math.max(
    Number(production.designFileCount || 0) || 0,
    Array.isArray(production.designFiles) ? production.designFiles.length : 0,
  );
  const isAbutment =
    stage === "생산진행" ||
    stage === "포장.발송" ||
    designN > 0 ||
    Boolean(production.designReadyAt);

  // 작업완료 + 어벗 뱃지 아님 → 점유 해제(표시값은 유지·재사용 가능)
  if (stage === "작업완료" && !isAbutment) return false;
  return true;
}

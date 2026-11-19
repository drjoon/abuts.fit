// 기공의뢰에 커스텀어벗이 있는데 치과가 아직 확정하지 않은 상태.
// 접수 직원·위생사가 먼저 보내고, 치과의사가 나중에 디자인 화면에서 확정한다.
// 수행 기공소 STL이 올라갔거나 수작업·플랫폼 경로가 정해지면 끝난다.
// 상단은 「어벗 검토」(디자인 화면)와 「어벗 의뢰」(수작업·채팅)로 나눈다.
// 검토 대기는 뱃지·육각형에 practice-abutment-design-awaiting-attention.
// related files:
// - web/frontend/src/pages/practice/components/PracticeRecentTransfersCalendar.tsx
// - web/frontend/src/pages/practice/components/PracticeRecentTransfersAllModal.tsx
// - web/frontend/src/shared/practice/practiceTransferLabReceive.ts

/** 디자인 확정 대기 — 헤더 뱃지·육각형 깜빡임 (index.css) */
export const PRACTICE_ABUTMENT_DESIGN_AWAITING_ATTENTION_CLASS =
  "practice-abutment-design-awaiting-attention";

/** 상단 뱃지 키. 상태 필터가 아니라 디자인 화면·채팅으로 바로 연다. */
export const ABUTMENT_REVIEW_BADGE_KEY = "abutmentReview";
export const ABUTMENT_ORDER_BADGE_KEY = "abutmentOrder";

export type AbutmentDesignAwaitingInput = {
  status?: string | null;
  hasCustomAbutment?: boolean | null;
  abutmentFeeRoute?: string | null;
  practiceDesignConfirmedAt?: string | null;
  labDesignConfirmedAt?: string | null;
  designReadyAt?: string | null;
  designFileCount?: number | null;
  manualRequested?: boolean | null;
};

const CLOSED_STATUS = new Set([
  "취소",
  "canceled",
  "deleted",
  "임시저장",
  "거부",
  "작업취소",
]);

const LAB_REVIEW_CLOSED_STATUS = new Set([
  ...CLOSED_STATUS,
  "작업완료",
  "생산진행",
  "포장.발송",
  "기한만료",
]);

export function isPtxAbutmentDesignAwaitingDentist(
  input: AbutmentDesignAwaitingInput | null | undefined,
) {
  if (!input?.hasCustomAbutment) return false;
  const status = String(input.status || "").trim();
  if (CLOSED_STATUS.has(status)) return false;
  if (String(input.practiceDesignConfirmedAt || "").trim()) return false;
  if (String(input.designReadyAt || "").trim()) return false;
  if (Math.max(0, Number(input.designFileCount || 0)) > 0) return false;
  if (input.manualRequested) return false;
  const route = String(input.abutmentFeeRoute || "").trim();
  if (route === "platform" || route === "lab") return false;
  return true;
}

/** 수작업 의뢰. 치과·기공소 상단 「어벗 의뢰」. 채팅에서 확인한다. */
export function isPtxAbutmentManualOrder(
  input: AbutmentDesignAwaitingInput | null | undefined,
) {
  if (!input?.manualRequested) return false;
  const status = String(input.status || "").trim();
  if (CLOSED_STATUS.has(status)) return false;
  return true;
}

/**
 * 기공소 「어벗 검토」.
 * 치과가 디자인을 확정했고, 수작업이 아니며, 기공소가 아직 디자인 확정하지 않은 자기 수행 건.
 * 플랫폼 확정본은 designFiles가 이미 있어도 검토 대상으로 둔다(제조 진입은 기공소 확정 후).
 */
export function isPtxAbutmentDesignReviewForLab(
  input: AbutmentDesignAwaitingInput | null | undefined,
) {
  if (!input?.hasCustomAbutment) return false;
  const status = String(input.status || "").trim();
  if (LAB_REVIEW_CLOSED_STATUS.has(status)) return false;
  if (input.manualRequested) return false;
  if (!String(input.practiceDesignConfirmedAt || "").trim()) return false;
  if (String(input.labDesignConfirmedAt || "").trim()) return false;
  return true;
}

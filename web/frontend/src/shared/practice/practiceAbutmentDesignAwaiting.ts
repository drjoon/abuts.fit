// 기공의뢰에 커스텀어벗이 있는데 치과가 아직 확정하지 않은 상태.
// 접수 직원·위생사가 먼저 보내고, 치과의사가 나중에 디자인 화면에서 확정한다.
// 수행 기공소 STL이 올라갔거나 수작업·플랫폼 경로가 정해지면 끝난다.
// 상단은 「어벗 검토」(디자인 화면)와 「어벗 의뢰」(수작업·채팅)로 나눈다.
// 검토 대기는 뱃지·육각형에 practice-abutment-design-awaiting-attention.
// related files:
// - web/frontend/src/pages/practice/components/PracticeRecentTransfersCalendar.tsx
// - web/frontend/src/pages/practice/components/PracticeRecentTransfersAllModal.tsx
// - web/frontend/src/shared/practice/practiceTransferLabReceive.ts
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// change-log:
// - 2026-11-19: 작업시작 비활성 툴팁 카피(LAB_WORK_START_AWAITING_PRACTICE_ABUTMENT_CHAT_HINT).
// - 2026-11-19: 기공소 작업시작 게이트·보철 업로드 안내 모달 카피 SSOT.
// - 2026-11-20: 작업시작 보철 업로드 안내 모달 문구 간소화.

/** 디자인 확정 대기 — 헤더 뱃지·육각형 깜빡임 (index.css) */
export const PRACTICE_ABUTMENT_DESIGN_AWAITING_ATTENTION_CLASS =
  "practice-abutment-design-awaiting-attention";

/** 상단 뱃지 키. 상태 필터가 아니라 디자인 화면·채팅으로 바로 연다. */
export const ABUTMENT_REVIEW_BADGE_KEY = "abutmentReview";
export const ABUTMENT_ORDER_BADGE_KEY = "abutmentOrder";

/** 기공소 작업시작 — 치과 어벗·디자인 확정 대기 */
export const LAB_WORK_START_AWAITING_PRACTICE_ABUTMENT_HINT =
  "치과에서 어벗 생성 방식·디자인을 확정한 뒤 작업을 시작할 수 있습니다.";
export const LAB_WORK_START_AWAITING_PRACTICE_ABUTMENT_CHAT_HINT =
  "확인이 필요하면 채팅으로 연락해 주세요.";

/** 작업시작 전 보철 업로드 요구 안내(모달) */
export const LAB_WORK_START_UPLOAD_NOTICE_PROSTHESIS_REQUIRED =
  "이 치과는 보철 디자인 파일 업로드를 요구합니다.";
export const LAB_WORK_START_UPLOAD_NOTICE_CA_SETTLEMENT =
  "커스텀어벗 기공비는 생산이 끝난 뒤에 적립됩니다.";

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
 * 치과 확정 후 기공소 확정 전. 제조 STL·생산의뢰 완료로 보지 않는다.
 * 표시 단계가 파일 때문에 작업완료로 올라가도 이 구간은 유지한다.
 */
export function isPlatformAbutmentDesignHeldForLabReview(
  input: AbutmentDesignAwaitingInput | null | undefined,
) {
  if (!input) return false;
  if (input.manualRequested) return false;
  if (!String(input.practiceDesignConfirmedAt || "").trim()) return false;
  if (String(input.labDesignConfirmedAt || "").trim()) return false;
  if (String(input.abutmentFeeRoute || "").trim() === "lab") return false;
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

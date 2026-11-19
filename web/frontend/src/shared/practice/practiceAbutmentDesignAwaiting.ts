// 기공의뢰에 커스텀어벗이 있는데 치과가 아직 확정하지 않은 상태.
// 접수 직원·위생사가 먼저 보내고, 치과의사가 나중에 디자인 화면에서 확정한다.
// 수행 기공소 STL이 올라갔거나 수작업·플랫폼 경로가 정해지면 끝난다.
// 대기 중이면 상단 「어벗」뱃지 건수·육각형 아이콘에 practice-abutment-design-awaiting-attention.
// related files:
// - web/frontend/src/pages/practice/components/PracticeRecentTransfersCalendar.tsx
// - web/frontend/src/pages/practice/components/PracticeRecentTransfersAllModal.tsx
// - web/frontend/src/shared/practice/practiceTransferLabReceive.ts

/** 디자인 확정 대기 — 헤더 뱃지·육각형 깜빡임 (index.css) */
export const PRACTICE_ABUTMENT_DESIGN_AWAITING_ATTENTION_CLASS =
  "practice-abutment-design-awaiting-attention";

export type AbutmentDesignAwaitingInput = {
  status?: string | null;
  hasCustomAbutment?: boolean | null;
  abutmentFeeRoute?: string | null;
  practiceDesignConfirmedAt?: string | null;
  designReadyAt?: string | null;
  designFileCount?: number | null;
  manualRequested?: boolean | null;
};

const CLOSED_STATUS = new Set(["취소", "canceled", "deleted", "임시저장"]);

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

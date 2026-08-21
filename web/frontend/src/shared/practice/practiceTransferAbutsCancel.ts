// related files:
// - web/frontend/src/shared/components/PastRequestsModal.tsx
// - web/frontend/src/pages/requestor/new_request/components/RequestorAbutmentPageHeader.tsx
// - web/frontend/src/features/requestSettings/RequestCaseMetaBadges.tsx
// - web/backend/controllers/requests/common.requests.controller.js
// change-log:
// - 2026-08-21: 어벗츠로의뢰에서 PTX(치과 기공의뢰) CA 취소 안내 SSOT.

/** 치과→기공의뢰수신→어벗츠 CA (partnerBilling.relatedPracticeTransferId) */
export const isPracticeTransferLinkedRequest = (row: unknown): boolean => {
  const pb =
    row &&
    typeof row === "object" &&
    (row as { partnerBilling?: unknown }).partnerBilling &&
    typeof (row as { partnerBilling?: unknown }).partnerBilling === "object"
      ? ((row as { partnerBilling: Record<string, unknown> }).partnerBilling as Record<
          string,
          unknown
        >)
      : null;
  if (!pb) return false;
  const related = pb.relatedPracticeTransferId;
  if (related == null || related === "") return false;
  if (typeof related === "object") {
    const id = String(
      (related as { _id?: unknown })._id || related || "",
    ).trim();
    return Boolean(id);
  }
  return Boolean(String(related).trim());
};

/** 어벗츠로의뢰 취소 클릭 시 안내 (취소 SSOT = 기공의뢰수신 작업취소) */
export const PRACTICE_TRANSFER_CANCEL_FROM_ABUTS_MESSAGE =
  "치과 기공의뢰로 들어온 건은 어벗츠로의뢰에서 취소할 수 없습니다. 기공의뢰수신에서 작업취소해 주세요.";

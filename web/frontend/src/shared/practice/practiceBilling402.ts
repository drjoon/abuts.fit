// related files:
// - web/backend/utils/creditLock.util.js
// - web/backend/services/practiceTransferBilling.service.js
// - web/frontend/src/shared/legal/creditLedgerCopy.ts

export const PRACTICE_CREDIT_SETTLEMENT_LOCK_REASON = "practice_credit_locked";

export const CREDITS_PRACTICE_AUTOPAY_HREF = "/dashboard/credits?tab=autopay";

export type PracticeBilling402Dialog = {
  title: string;
  descriptionLines: readonly string[];
  confirmLabel: string;
  href: string;
};

export function parseApiErrorPayload(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== "object") return {};
  const root = data as Record<string, unknown>;
  const nested = root.data;
  if (nested && typeof nested === "object") {
    return { ...root, ...(nested as Record<string, unknown>) };
  }
  return root;
}

export function resolvePracticeBilling402Dialog(
  body: Record<string, unknown>,
  status?: number,
): PracticeBilling402Dialog | null {
  const reason = String(body.reason || "").trim();
  const message = String(body.message || body.lockedReason || "").trim();

  if (
    reason === PRACTICE_CREDIT_SETTLEMENT_LOCK_REASON ||
    (status === 402 && message.includes("신규 기공의뢰"))
  ) {
    const lines = message
      ? message.split(/\n+/).filter(Boolean)
      : [
          "지난 기공료가 아직 확인되지 않았습니다.",
          "확인되는 대로 새 기공의뢰를 바로 보내실 수 있습니다.",
          "이미 입금해 주셨다면 확인 후 바로 열어 드립니다.",
          "진행 중인 의뢰는 그대로 이어집니다.",
        ];
    return {
      title: "입금 확인 후 이어서 보내 주세요",
      descriptionLines: lines,
      confirmLabel: "정산 안내",
      href: CREDITS_PRACTICE_AUTOPAY_HREF,
    };
  }

  const rejectedSend =
    message.includes("이번 전송은 접수되지 않았습니다") ||
    message.includes("접수하지 못했습니다");
  const isCustomAbutmentCredit =
    !rejectedSend &&
    (message.includes("커스텀어벗") || message.includes("무료 크레딧"));
  if (
    !isCustomAbutmentCredit &&
    status === 402 &&
    (reason === "insufficient_credit_for_practice_transfer" ||
      reason === "insufficient_credit_for_hold" ||
      reason === "practice_transfer_hold_failed" ||
      message.includes("크레딧이 부족") ||
      message.includes("접수되지 않았습니다") ||
      message.includes("접수하지 못했습니다"))
  ) {
    const lines = message
      ? message.split(/\n+/).filter(Boolean)
      : ["크레딧이 부족합니다."];
    if (!lines.some((line) => line.includes("접수"))) {
      lines.push("이번 전송은 접수되지 않았습니다.");
    }
    return {
      title: "의뢰가 전송되지 않았습니다",
      descriptionLines: lines,
      confirmLabel: "확인",
      href: "",
    };
  }

  return null;
}

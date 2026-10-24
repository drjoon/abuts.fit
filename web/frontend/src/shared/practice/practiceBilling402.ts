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

  if (
    status === 402 &&
    (reason === "insufficient_credit_for_practice_transfer" ||
      reason === "insufficient_credit_for_hold" ||
      message.includes("크레딧이 부족"))
  ) {
    return {
      title: "정산 안내",
      descriptionLines: [
        "기공료는 후불입니다.",
        "정산 탭에서 이번 달 사용분과 입금 계좌를 확인하실 수 있습니다.",
        "기한을 두 번 넘기거나 일부만 입금하면 이후 주문은 선불 크레딧입니다.",
      ],
      confirmLabel: "정산 안내",
      href: CREDITS_PRACTICE_AUTOPAY_HREF,
    };
  }

  return null;
}

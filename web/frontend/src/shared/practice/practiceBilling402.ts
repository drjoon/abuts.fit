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
          "월 정산 미납 또는 자동이체 재인증이 필요합니다.",
          "자동정산 탭에서 Face ID(지문)로 재이체·재인증을 완료해 주세요.",
        ];
    return {
      title: "기공의뢰를 보낼 수 없습니다",
      descriptionLines: lines,
      confirmLabel: "자동정산",
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
      title: "자동정산이 필요합니다",
      descriptionLines: [
        "오픈뱅킹 장기동의를 등록하면 기공의뢰·어벗 비용을 후불로 이용할 수 있습니다.",
        "자동정산 탭에서 출금 계좌를 연결해 주세요.",
      ],
      confirmLabel: "자동정산",
      href: CREDITS_PRACTICE_AUTOPAY_HREF,
    };
  }

  return null;
}

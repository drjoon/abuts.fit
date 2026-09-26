// related files:
// - web/frontend/src/features/settings/tabs/LabSettlementPayoutTab.tsx
// - web/frontend/src/shared/components/business/settings/PayoutAccountCard.tsx
// - web/backend/jobs/monthlySettlementBatchWorker.js
// change-log:
// - 2026-09-26: 플랫폼 사용료·하청 영업 수수료 평문 안내를 정책 문장과 맞춤.
// - 2026-09-24: 지정 수수료 기본 표시 2%. 이벤트 문구는 「2% → 0%」(취소선은 LabDirectPlatformFeeNotice).
// - 2026-09-21: PAYOUT_ACCOUNT_CARD_ID 공통화(기공소·딜러사). LAB_* 별칭 유지.
// - 2026-09-16: 기공소 통장사본·정산일(1일) 리마인드 헬퍼. 미등록 시 지급 1개월 이월 안내. 월 지급 유보 50만원 상수.
import { toKstYmd } from "@/shared/date/kst";

/** KST 월 정산일(기본 1일). 백엔드 SETTLEMENT_BATCH_DAY_OF_MONTH 와 맞춤. */
export const LAB_SETTLEMENT_PAYOUT_DAY = Math.max(
  1,
  Math.min(28, Number(1)),
);

export type LabPayoutAccountSnapshot = {
  bankName?: string;
  accountNumber?: string;
  holderName?: string;
  bankbook?: {
    s3Key?: string;
    fileId?: string;
    originalName?: string;
    uploadedAt?: string | null;
  } | null;
};

export function hasLabPayoutAccountText(account?: LabPayoutAccountSnapshot | null) {
  return Boolean(
    String(account?.bankName || "").trim() &&
      String(account?.accountNumber || "").trim() &&
      String(account?.holderName || "").trim(),
  );
}

export function hasLabPayoutBankbook(account?: LabPayoutAccountSnapshot | null) {
  const book = account?.bankbook;
  return Boolean(
    String(book?.s3Key || "").trim() || String(book?.fileId || "").trim(),
  );
}

/** 계좌 텍스트 + 통장 사본. */
export function isLabPayoutReady(account?: LabPayoutAccountSnapshot | null) {
  return hasLabPayoutAccountText(account) && hasLabPayoutBankbook(account);
}

/** 정산일 포함 직전 7일(KST). 예: 정산일 1일 → 전월 25일~당월 1일. */
export function isWithinLabSettlementRemindWindow(now = new Date()): boolean {
  const ymd = toKstYmd(now);
  if (!ymd) return false;
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return false;

  const day = LAB_SETTLEMENT_PAYOUT_DAY;
  let daysUntil: number;
  if (d <= day) {
    daysUntil = day - d;
  } else {
    const lastDay = new Date(Date.UTC(y, m, 0, 12)).getUTCDate();
    daysUntil = lastDay - d + day;
  }
  return daysUntil >= 0 && daysUntil <= 7;
}

const remindKey = (anchorId: string, ymd: string) =>
  `abuts.labPayoutBankbookRemind.${anchorId}.${ymd}`;

export function hasLabPayoutRemindShownToday(anchorId: string, now = new Date()) {
  const ymd = toKstYmd(now);
  if (!ymd || !anchorId) return true;
  try {
    return localStorage.getItem(remindKey(anchorId, ymd)) === "1";
  } catch {
    return false;
  }
}

export function markLabPayoutRemindShownToday(anchorId: string, now = new Date()) {
  const ymd = toKstYmd(now);
  if (!ymd || !anchorId) return;
  try {
    localStorage.setItem(remindKey(anchorId, ymd), "1");
  } catch {
    // ignore
  }
}

export const LAB_PAYOUT_BANKBOOK_DELAY_NOTICE =
  "정산 지급일까지 통장 사본을 등록하지 않으면, 이번 달 지급분은 1개월 후 다음 달에 지급됩니다.";

/** 설정 · 사업자 탭의 통장 사본·입금 계좌 카드로 스크롤. */
export const PAYOUT_ACCOUNT_CARD_ID = "payout-account-card";
/** @deprecated PAYOUT_ACCOUNT_CARD_ID 별칭. */
export const LAB_PAYOUT_ACCOUNT_CARD_ID = PAYOUT_ACCOUNT_CARD_ID;
export const PAYOUT_SETTINGS_PATH =
  "/dashboard/settings?tab=business&focus=payout";
/** @deprecated PAYOUT_SETTINGS_PATH 별칭. */
export const LAB_PAYOUT_SETTINGS_PATH = PAYOUT_SETTINGS_PATH;

/** 월 지급 시 다음 달 초 사용을 위해 남기는 기공크레딧(원). BE `LAB_SETTLEMENT_PAYOUT_RESERVE_WON` 와 맞춤. */
export const LAB_SETTLEMENT_PAYOUT_RESERVE_WON = 500_000;

export const LAB_SETTLEMENT_PAYOUT_RESERVE_NOTICE =
  "다음 달 초 사용을 위해 기공크레딧 50만원은 남겨 두고, 나머지 잔액만 지급합니다.";

/** 커스텀어벗 치과→기공소 정산 — 확정·지급만 STL·생산비 후. 적립 보류는 hold부터. */
export const LAB_CUSTOM_ABUTMENT_SETTLEMENT_NOTICE =
  "커스텀어벗은 디자인 STL을 올리고 어벗츠에 생산비가 지급된 뒤에 확정 정산·지급에 포함됩니다. 그 전에도 적립 보류는 보이며, 조건이 갖춰진 시점에 정산됩니다.";

/** 플랫폼 사용료 기본 표시용(관리자 설정 미로드 시). */
export const LAB_DIRECT_PLATFORM_FEE_POLICY_RATE_PCT = 2;

/** 하청 영업 수수료 기본 표시용(관리자 설정 미로드 시). */
export const LAB_SUBCONTRACT_SALES_FEE_POLICY_RATE_PCT = 10;

export function resolveLabDirectPlatformFeePct(ratePct?: number): number {
  if (ratePct == null || !Number.isFinite(Number(ratePct))) {
    return LAB_DIRECT_PLATFORM_FEE_POLICY_RATE_PCT;
  }
  return Math.max(0, Math.round(Number(ratePct)));
}

export function resolveLabSubcontractSalesFeePct(ratePct?: number): number {
  if (ratePct == null || !Number.isFinite(Number(ratePct))) {
    return LAB_SUBCONTRACT_SALES_FEE_POLICY_RATE_PCT;
  }
  return Math.max(0, Math.round(Number(ratePct)));
}

/** 하청 영업 수수료 안내(평문). UI는 LabDirectPlatformFeeNotice. */
export function formatLabDirectPlatformFeeNotice(opts?: {
  /** @deprecated 플랫폼 사용료는 폐지 */
  ratePct?: number;
  subcontractRatePct?: number;
}): string {
  const salesPct = resolveLabSubcontractSalesFeePct(opts?.subcontractRatePct);
  return `협력건은 기공비 전액을 크레딧으로 적립합니다. 하청건은 매출액의 ${salesPct}%를 영업 수수료로 차감하고, 나머지를 크레딧으로 적립합니다.`;
}

/** @deprecated UI는 LabDirectPlatformFeeNotice 사용. */
export const LAB_DIRECT_PLATFORM_FEE_NOTICE =
  formatLabDirectPlatformFeeNotice({ enabled: false });

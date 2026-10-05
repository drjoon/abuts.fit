// related files:
// - web/frontend/src/features/settings/tabs/LabSettlementPayoutTab.tsx
// - web/frontend/src/shared/components/business/settings/PayoutAccountCard.tsx
// - web/backend/jobs/monthlySettlementBatchWorker.js
// change-log:
// - 2026-10-05: 플랫폼 사용료·하청 수수료 미부과. 안내 문구는 휴면(LabDirectPlatformFeeNotice).
// - 2026-09-27: 플랫폼 사용료 2% 복원. 이벤트 기간 면제(0%) 평문·resolveLabFeeDisplay.
// - 2026-09-26: 수수료 평문 — 협력은 수수료 없이 전액, 하청은 영업 수수료를 제한 적립.
// - 2026-09-26: 플랫폼 사용료·하청 영업 수수료 평문 안내를 정책 문장과 맞춤.
// - 2026-09-24: 지정 수수료 기본 표시 2%. 이벤트 문구는 「2% → 0%」(취소선은 LabDirectPlatformFeeNotice).
// - 2026-09-21: PAYOUT_ACCOUNT_CARD_ID 공통화(기공소·딜러사). LAB_* 별칭 유지.
// - 2026-09-16: 기공소 통장사본·정산일(1일) 리마인드 헬퍼. 미등록 시 지급 1개월 이월 안내. 월 지급 유보 50만원 상수.
import { toKstYmd } from "@/shared/date/kst";

/** 백엔드 CHARGE_LAB_PLATFORM_AND_SUBCONTRACT_FEES 와 맞춤. 재개 시 true. */
export const CHARGE_LAB_PLATFORM_AND_SUBCONTRACT_FEES = false;

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
  "정산 지급일까지 통장 사본이 없으면 이번 달 지급분은 다음 달로 이월됩니다.";

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
  "다음 달 초 사용을 위해 50만원은 남기고, 나머지 잔액만 지급합니다.";

/** 커스텀어벗 치과→기공소 정산 — 확정·지급만 STL·생산비 후. 적립 보류는 hold부터. */
export const LAB_CUSTOM_ABUTMENT_SETTLEMENT_NOTICE =
  "STL 업로드와 어벗츠 생산비 지급 뒤에 확정됩니다. 그전까지는 적립 보류입니다.";

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

/** 관리자 설정(`payoutRates`)에서 온 기공소 수수료 표시값. */
export type LabFeeRatesLike = {
  subcontractFeeRate?: number;
  directPlatformFeeEnabled?: boolean;
  directPlatformFeeRate?: number;
};

/** 플랫폼 사용료 정책%·적용 여부(false=이벤트 면제)·하청 영업 수수료%. */
export function resolveLabFeeDisplay(feeRates?: LabFeeRatesLike | null): {
  platformPct: number;
  platformEnabled: boolean;
  subcontractPct: number;
} {
  const rate = feeRates?.directPlatformFeeRate;
  const sub = feeRates?.subcontractFeeRate;
  return {
    platformPct: resolveLabDirectPlatformFeePct(
      rate != null && Number.isFinite(Number(rate)) ? Number(rate) * 100 : undefined,
    ),
    platformEnabled: feeRates?.directPlatformFeeEnabled === true,
    subcontractPct: resolveLabSubcontractSalesFeePct(
      sub != null && Number.isFinite(Number(sub)) ? Number(sub) * 100 : undefined,
    ),
  };
}

/** 플랫폼 사용료·하청 영업 수수료 안내(평문). UI는 미부과 기간 동안 노출하지 않음. */
export function formatLabDirectPlatformFeeNotice(opts?: {
  /** false·없음 = 이벤트 면제 */
  enabled?: boolean;
  ratePct?: number;
  subcontractRatePct?: number;
}): string {
  const pct = resolveLabDirectPlatformFeePct(opts?.ratePct);
  const salesPct = resolveLabSubcontractSalesFeePct(opts?.subcontractRatePct);
  const rate =
    opts?.enabled === true ? `${pct}%` : `${pct}%(이벤트 기간 면제, 0%)`;
  return `기공소의 플랫폼 사용료는 매출액의 ${rate}입니다. 협력건과 하청건 모두 플랫폼 사용료를 차감하고 크레딧으로 적립합니다. 하청건은 ${salesPct}% 영업 수수료가 추가로 차감됩니다. 어벗츠기공소 수행건은 항상 면제입니다.`;
}

/** @deprecated UI는 LabDirectPlatformFeeNotice 사용. */
export const LAB_DIRECT_PLATFORM_FEE_NOTICE =
  formatLabDirectPlatformFeeNotice({ enabled: false });

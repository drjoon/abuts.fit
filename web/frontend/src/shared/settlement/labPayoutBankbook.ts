// related files:
// - web/frontend/src/features/settings/tabs/LabSettlementPayoutTab.tsx
// - web/frontend/src/shared/components/business/settings/LabPayoutAccountCard.tsx
// - web/backend/jobs/monthlySettlementBatchWorker.js
// change-log:
// - 2026-09-20: 지정 수수료 안내를 formatLabDirectPlatformFeeNotice(관리자 on/%)로 생성.
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
export const LAB_PAYOUT_ACCOUNT_CARD_ID = "lab-payout-account-card";
export const LAB_PAYOUT_SETTINGS_PATH =
  "/dashboard/settings?tab=business&focus=payout";

/** 월 지급 시 다음 달 초 사용을 위해 남기는 기공크레딧(원). BE `LAB_SETTLEMENT_PAYOUT_RESERVE_WON` 와 맞춤. */
export const LAB_SETTLEMENT_PAYOUT_RESERVE_WON = 500_000;

export const LAB_SETTLEMENT_PAYOUT_RESERVE_NOTICE =
  "다음 달 초 사용을 위해 기공크레딧 50만원은 남겨 두고, 나머지 잔액만 지급합니다.";

/** 커스텀어벗 치과→기공소 정산 — STL·생산비 지급 전 제외. */
export const LAB_CUSTOM_ABUTMENT_SETTLEMENT_NOTICE =
  "커스텀어벗은 디자인 STL을 올리고 어벗츠에 생산비가 지급된 뒤에 정산·지급에 포함됩니다. 그 전에는 빠지며, 기간이 지나도 그때 정산됩니다.";

/** 지정 수수료 기본 표시용(관리자 설정 미로드 시). 실효 문구는 formatLabDirectPlatformFeeNotice. */
export const LAB_DIRECT_PLATFORM_FEE_POLICY_RATE_PCT = 1;

/** 지정 수수료 안내 — 관리자 `directPlatformFeeEnabled` / `directPlatformFeeRate` 반영. */
export function formatLabDirectPlatformFeeNotice(opts?: {
  enabled?: boolean;
  /** 0~100 퍼센트 포인트 */
  ratePct?: number;
}): string {
  const enabled = opts?.enabled === true;
  const pct = Math.max(
    0,
    Math.round(
      Number.isFinite(Number(opts?.ratePct))
        ? Number(opts?.ratePct)
        : LAB_DIRECT_PLATFORM_FEE_POLICY_RATE_PCT,
    ),
  );
  if (enabled) {
    return `지정 기공소 의뢰의 플랫폼 수수료는 매출액의 ${pct}%입니다.`;
  }
  return "지정 기공소 의뢰의 플랫폼 수수료는 이벤트 기간 동안 0%입니다.";
}

/** @deprecated 관리자 설정 반영 문구는 formatLabDirectPlatformFeeNotice 사용. */
export const LAB_DIRECT_PLATFORM_FEE_NOTICE =
  formatLabDirectPlatformFeeNotice({ enabled: false });

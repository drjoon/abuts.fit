// related files:
// - web/frontend/src/shared/demo/DemoModeBadge.tsx
// - web/frontend/src/shared/demo/useDemoMode.ts
// - web/frontend/src/shared/legal/creditPrepaidCopy.ts
// - web/backend/controllers/businesses/business.demoMode.util.js

/** @deprecated 신규는 데모 크레딧 미지급. 레거시 상수 동기용. */
export const DEMO_CREDIT_AMOUNT = 0;

/** 데모 모드 유효기간(일). 백엔드 DEMO_MODE_DURATION_DAYS 와 동기. */
export const DEMO_MODE_DURATION_DAYS = 30;

/** @deprecated Prefer formatDemoModeBadgeLabel(daysRemaining). */
export const DEMO_MODE_BADGE_LABEL = "데모";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 데모 남은 일수(ceil). 만료 시 0.
 * expiresAt 우선, 없으면 startedAt + durationDays.
 */
export function resolveDemoModeDaysRemaining({
  startedAt,
  expiresAt,
  durationDays = DEMO_MODE_DURATION_DAYS,
  now = new Date(),
}: {
  startedAt?: string | Date | null;
  expiresAt?: string | Date | null;
  durationDays?: number;
  now?: Date;
} = {}): number | null {
  let expiresMs: number | null = null;
  if (expiresAt) {
    const t = new Date(expiresAt).getTime();
    if (Number.isFinite(t)) expiresMs = t;
  }
  if (expiresMs == null && startedAt) {
    const startedMs = new Date(startedAt).getTime();
    if (Number.isFinite(startedMs)) {
      expiresMs = startedMs + Math.max(0, Number(durationDays) || 0) * MS_PER_DAY;
    }
  }
  if (expiresMs == null) return null;
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(nowMs)) return null;
  return Math.max(0, Math.ceil((expiresMs - nowMs) / MS_PER_DAY));
}

/** 뱃지 라벨: 「데모 N일 남음」. 일수 없으면 「데모」, 0이면 「데모 종료 임박」. */
export function formatDemoModeBadgeLabel(daysRemaining: number | null): string {
  if (daysRemaining == null) return DEMO_MODE_BADGE_LABEL;
  if (daysRemaining <= 0) return "데모 종료 임박";
  return `데모 ${daysRemaining}일 남음`;
}

export const DEMO_MODE_EXIT_TITLE = "실사용으로 전환할까요?";

/** 실사용 전환 확인 본문(줄 단위). ConfirmDialog 에 줄바꿈으로 렌더. */
export const DEMO_MODE_EXIT_DESCRIPTION_LINES = [
  "데모 기간 중 쌓인 마이너스 잔고는 0원으로 리셋됩니다.",
  "데모 기간의 기공료는 기공소와 별도 정산하신 뒤 실사용해주세요.",
  "",
  "어벗츠 선수금(유료 크레딧)을 충전하셔야 주문, 의뢰할 수 있습니다.",
  "전환 후에는 데모 모드로 되돌릴 수 없습니다.",
] as const;

export const DEMO_MODE_EXIT_DESCRIPTION =
  DEMO_MODE_EXIT_DESCRIPTION_LINES.join("\n");

export const DEMO_MODE_EXIT_CONFIRM_LABEL = "실사용으로 전환";

/** 충전 탭 — 데모 중 유료 충전 요청 전 확인. */
export const DEMO_MODE_CHARGE_EXIT_TITLE =
  "충전하면 실사용으로 전환됩니다";

export const DEMO_MODE_CHARGE_EXIT_DESCRIPTION_LINES = [
  "어벗츠 선수금(유료 크레딧) 입금이 확인되면 데모 모드가 종료됩니다.",
  "데모 기간 중 쌓인 마이너스 잔고는 0원으로 리셋됩니다.",
  "데모 기간의 기공료는 기공소와 별도 정산하신 뒤 실사용해주세요.",
  "",
  "입금 확인 후에는 어벗츠 선수금(유료 크레딧)으로 주문·의뢰할 수 있습니다.",
  "전환 후에는 데모 모드로 되돌릴 수 없습니다.",
] as const;

export const DEMO_MODE_CHARGE_EXIT_CONFIRM_LABEL = "확인하고 충전하기";

/** 정산 내역 — 데모 모드 안내. */
export const CREDIT_LEDGER_DEMO_NOTICE_BODY =
  "데모 모드는 가상 잔고로 운영됩니다. 구강스캔·커스텀어벗 기공비는 잔고가 부족해도 마이너스로 진행할 수 있습니다. 실거래 금액은 기존처럼 치과→기공소로 직접 입금하세요. 가입 후 첫 커스텀어벗 2건은 무료 테스트(0원)입니다. 스토어 이용·유료 크레딧(선수금) 입금이 확인되면 자동으로 실사용 전환됩니다. 가입 후 30일 또는 수동 전환 시에도 마이너스 잔고는 0으로 리셋됩니다.";

/** 정산 현재 잔액 — 데모 모드 안내. */
export const CREDIT_LEDGER_DEMO_BALANCE_HINT =
  "데모 모드입니다. 장부 잔고는 가상입니다. 구강스캔·커스텀어벗 기공비는 마이너스 잔고가 허용되고, 실거래는 치과→기공소 직접 입금입니다. 유료 크레딧 입금이 확인되면 자동으로 실사용 전환되며, 가입 후 30일 또는 수동 전환 시에도 잔고가 리셋됩니다.";

export const CREDIT_DEMO_BUCKET_HINT = "데모 체험";

/** @deprecated 요약 카드에서 무료 충전 항 제거. 레거시 참조용. */
export const CREDIT_DEMO_BUCKET_LABEL = "무료 충전";

/** 정산 기간 소비 카드 — 데모 모드 툴팁. */
export const CREDIT_LEDGER_DEMO_PERIOD_SPEND_HINT =
  "데모 모드에서 기공의뢰·커스텀어벗·스토어 등 기간 지출 합계입니다(가상 잔고).";

/** 정산 충전 카드 — 요약 UI 공통 라벨(치과·기공소). */
export const CREDIT_LEDGER_CHARGE_LABEL = "충전";

export const CREDIT_LEDGER_CHARGE_DETAIL_TITLE = "충전 내역";

/** 정산 충전 카드 — 데모 모드 툴팁(유료/선수금 아님). */
export const CREDIT_LEDGER_DEMO_CHARGE_HINT =
  "데모 모드의 가상 잔고 충전 합계입니다. 어벗츠 선수금(유료 크레딧) 입금이 확인되면 자동으로 실사용 전환됩니다.";

/** @deprecated Prefer CREDIT_LEDGER_CHARGE_LABEL. */
export const CREDIT_LEDGER_DEMO_CHARGE_LABEL = CREDIT_LEDGER_CHARGE_LABEL;

/** @deprecated Prefer CREDIT_LEDGER_CHARGE_DETAIL_TITLE. */
export const CREDIT_LEDGER_DEMO_CHARGE_DETAIL_TITLE =
  CREDIT_LEDGER_CHARGE_DETAIL_TITLE;

/** 기공소 PTX — 어벗 디자인/생산 시 실크레딧 부족 안내. */
export const PTX_CA_INSUFFICIENT_CREDIT_TITLE = "크레딧이 부족합니다";

export const PTX_CA_INSUFFICIENT_CREDIT_DESCRIPTION_LINES = [
  "어벗 디자인을 올리고 생산을 시작할 때 크레딧으로 결제됩니다(가입 무료 테스트 2건 소진 후).",
  "데모 모드 치과는 가상 잔고(마이너스 허용)로 진행됩니다. 기공소→어벗츠 생산비는 기공소 크레딧이 필요합니다.",
  "충전 후 다시 업로드해 주세요.",
] as const;

export const PTX_CA_INSUFFICIENT_CREDIT_CONFIRM_LABEL = "충전하기";

export const PTX_CA_INSUFFICIENT_CREDIT_REASON = "insufficient_credit_for_ptx_ca";

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
  "이후 기공비는 유료 크레딧으로 결제됩니다.",
  "치과↔기공소 결산은 기존처럼 양쪽에서 수동으로 처리하세요.",
  "전환 후에는 데모 모드로 되돌릴 수 없습니다.",
] as const;

export const DEMO_MODE_EXIT_DESCRIPTION =
  DEMO_MODE_EXIT_DESCRIPTION_LINES.join("\n");

export const DEMO_MODE_EXIT_CONFIRM_LABEL = "실사용으로 전환";

/** 정산 내역 — 데모 모드 안내. */
export const CREDIT_LEDGER_DEMO_NOTICE_BODY =
  "데모 모드는 크레딧 0원으로 시작합니다. 치과↔기공소 기공의뢰(구강스캔·보철 기공비)는 잔고가 부족해도 마이너스로 진행할 수 있습니다. 커스텀어벗(어벗디자인)은 가입 후 첫 2건이 무료 테스트(0원)이며, 이후·스토어는 유료 크레딧이 필요합니다. 가입 후 30일 또는 실사용 전환 시 마이너스 잔고는 0으로 리셋됩니다.";

/** 정산 현재 잔액 — 데모 모드 안내. */
export const CREDIT_LEDGER_DEMO_BALANCE_HINT =
  "데모 모드입니다. 구강스캔 기공의뢰 보철 기공비는 마이너스 잔고가 허용되고, 커스텀어벗은 가입 테스트 2건 후 유료 크레딧으로 결제됩니다. 가입 후 30일 또는 실사용 전환 시 잔고가 리셋됩니다.";

export const CREDIT_DEMO_BUCKET_HINT = "데모 체험";

/** @deprecated 요약 카드에서 무료 충전 항 제거. 레거시 참조용. */
export const CREDIT_DEMO_BUCKET_LABEL = "무료 충전";

/** 정산 기간 소비 카드 — 데모 모드 툴팁. */
export const CREDIT_LEDGER_DEMO_PERIOD_SPEND_HINT =
  "데모 모드에서 기공의뢰(치과 차감)와 스토어·커스텀어벗 등 기간 지출 합계입니다.";

/** 기공소 PTX — 어벗 디자인/생산 시 실크레딧 부족 안내. */
export const PTX_CA_INSUFFICIENT_CREDIT_TITLE = "크레딧이 부족합니다";

export const PTX_CA_INSUFFICIENT_CREDIT_DESCRIPTION_LINES = [
  "어벗 디자인을 올리고 생산을 시작할 때 유료 크레딧으로 결제됩니다(가입 무료 테스트 2건 소진 후).",
  "데모 모드의 마이너스 잔고는 구강스캔 기공의뢰 보철 기공비에만 적용됩니다.",
  "충전 후 다시 업로드해 주세요.",
] as const;

export const PTX_CA_INSUFFICIENT_CREDIT_CONFIRM_LABEL = "충전하기";

export const PTX_CA_INSUFFICIENT_CREDIT_REASON = "insufficient_credit_for_ptx_ca";

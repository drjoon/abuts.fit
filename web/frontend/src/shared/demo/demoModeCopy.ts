// related files:
// - web/frontend/src/shared/demo/DemoModeBadge.tsx
// - web/frontend/src/shared/demo/useDemoMode.ts
// - web/frontend/src/shared/legal/creditPrepaidCopy.ts
// - web/backend/controllers/businesses/business.demoMode.util.js

/** @deprecated 신규는 데모 크레딧 미지급. 레거시 상수 동기용. */
export const DEMO_CREDIT_AMOUNT = 0;

/** 데모 모드 유효기간(일). 백엔드 DEMO_MODE_DURATION_DAYS 와 동기. */
export const DEMO_MODE_DURATION_DAYS = 90;

/** 만료 N일 전부터 하루 1회 실사용 전환 유도 모달. */
export const DEMO_MODE_PROMPT_DAYS_BEFORE = 7;

/** @deprecated Prefer formatDemoModeBadgeLabel(daysRemaining). */
export const DEMO_MODE_BADGE_LABEL = "데모";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type DemoRequestorKind = "practice" | "lab" | null | undefined;

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

/** 뱃지 표시: 「N일」(좁은 헤더용). 일수 없으면 「데모」, 0이면 「종료」. */
export function formatDemoModeBadgeLabel(daysRemaining: number | null): string {
  if (daysRemaining == null) return DEMO_MODE_BADGE_LABEL;
  if (daysRemaining <= 0) return "종료";
  return `${daysRemaining}일`;
}

/** 접근성·툴팁용 전체 문구: 「데모 N일 남음」. */
export function formatDemoModeBadgeAriaLabel(
  daysRemaining: number | null,
): string {
  if (daysRemaining == null) return "데모 모드";
  if (daysRemaining <= 0) return "데모 종료 임박";
  return `데모 ${daysRemaining}일 남음`;
}

export const DEMO_MODE_EXIT_TITLE = "실사용 전환할까요?";

const DEMO_MODE_EXIT_BODY_PRACTICE =
  "데모 기간의 미정산 기공비는 기공소에 직접 지급해 주세요. 기공소가 지급을 확인하면 실사용으로 전환됩니다.";

const DEMO_MODE_EXIT_BODY_LAB =
  "데모 기간 이용료를 넉넉히 입금하시면 어벗츠 정산 후 남는 금액은 선수금(유료 크레딧)이 됩니다.";

export const DEMO_MODE_EXIT_WARNING =
  "전환 후 데모로 되돌릴 수 없습니다. 신규 의뢰는 충전(선결제) 후 가능합니다.";

/** 전환 요청 후 — 기공소 지급 확인 대기 모달. */
export const DEMO_MODE_PENDING_TITLE = "기공소 확인을 기다리고 있습니다";

export const DEMO_MODE_PENDING_BODY_LINES = [
  "실사용 전환을 요청했습니다.",
  "기공소가 지급을 확인하면 전환됩니다.",
] as const;

export type DemoPendingLabStatus = {
  labName?: string;
  isAbutsLab?: boolean;
  status?: "PENDING" | "CONFIRMED" | string;
};

/** 대기 목록 표시명. 어벗츠 몫은 관리자 확인. */
export function resolveDemoConversionLabDisplayName(
  lab: DemoPendingLabStatus,
): string {
  if (lab.isAbutsLab) return "어벗츠(관리자)";
  return String(lab.labName || "").trim() || "기공소";
}

/**
 * 대기 모달 본문. 일부만 확인된 경우 남은 기공소를 명시한다.
 */
export function resolveDemoModePendingBodyLines(
  labs: DemoPendingLabStatus[] = [],
): readonly string[] {
  const pendingLabs = labs.filter((lab) => lab.status !== "CONFIRMED");
  const confirmedCount = labs.length - pendingLabs.length;
  if (labs.length > 1 && confirmedCount > 0 && pendingLabs.length > 0) {
    const names = pendingLabs
      .map((lab) => resolveDemoConversionLabDisplayName(lab))
      .join(", ");
    return [
      "실사용 전환을 요청했습니다.",
      `${names} 확인이 끝나면 전환됩니다.`,
    ];
  }
  if (pendingLabs.length === 1 && pendingLabs[0]?.isAbutsLab) {
    return [
      "실사용 전환을 요청했습니다.",
      "어벗츠(관리자)가 지급을 확인하면 전환됩니다.",
    ];
  }
  return DEMO_MODE_PENDING_BODY_LINES;
}

export const DEMO_MODE_PENDING_NOTICE =
  "미정산 기공비를 아직 지급하지 않았다면 기공소에 직접 지급해 주세요.";

export function resolveDemoModeExitBody(kind?: DemoRequestorKind): string {
  return kind === "lab" ? DEMO_MODE_EXIT_BODY_LAB : DEMO_MODE_EXIT_BODY_PRACTICE;
}

/** @deprecated Prefer resolveDemoModeExitBody + DEMO_MODE_EXIT_WARNING. */
const DEMO_MODE_EXIT_DESCRIPTION_LINES_PRACTICE = [
  DEMO_MODE_EXIT_BODY_PRACTICE,
  "",
  DEMO_MODE_EXIT_WARNING,
] as const;

const DEMO_MODE_EXIT_DESCRIPTION_LINES_LAB = [
  DEMO_MODE_EXIT_BODY_LAB,
  "",
  DEMO_MODE_EXIT_WARNING,
] as const;

/** @deprecated Prefer resolveDemoModeExitDescriptionLines(kind). */
export const DEMO_MODE_EXIT_DESCRIPTION_LINES =
  DEMO_MODE_EXIT_DESCRIPTION_LINES_PRACTICE;

export function resolveDemoModeExitDescriptionLines(
  kind?: DemoRequestorKind,
): readonly string[] {
  return kind === "lab"
    ? DEMO_MODE_EXIT_DESCRIPTION_LINES_LAB
    : DEMO_MODE_EXIT_DESCRIPTION_LINES_PRACTICE;
}

export const DEMO_MODE_EXIT_DESCRIPTION =
  DEMO_MODE_EXIT_DESCRIPTION_LINES.join("\n");

export const DEMO_MODE_EXIT_CONFIRM_LABEL = "전환 요청";

/** 7일 전부터 하루 1회 전환 유도 모달. */
export const DEMO_MODE_PROMPT_TITLE = "실사용으로 전환하세요";

export function resolveDemoModePromptLines(
  daysRemaining: number | null,
): readonly string[] {
  if (daysRemaining != null && daysRemaining <= 0) {
    return [
      "데모 기간이 끝났습니다.",
      "실사용으로 전환하면 신규 의뢰를 다시 보낼 수 있습니다.",
    ];
  }
  return [
    `데모가 ${daysRemaining ?? DEMO_MODE_PROMPT_DAYS_BEFORE}일 남았습니다.`,
    "종료 후에는 실사용 전환 전까지 신규 의뢰를 보낼 수 없습니다.",
  ];
}

export const DEMO_MODE_PROMPT_CONFIRM_LABEL = "전환 요청";
export const DEMO_MODE_PROMPT_LATER_LABEL = "나중에";

/** 전환 완료 후 충전 안내. */
export const DEMO_MODE_CONVERTED_TOAST_TITLE = "실사용으로 전환되었습니다";
export const DEMO_MODE_CONVERTED_TOAST_DESCRIPTION =
  "신규 의뢰는 선결제(충전)가 필요합니다. 충전 페이지로 이동합니다.";

/** 전환 요청 직후 토스트. */
export const DEMO_MODE_PENDING_TOAST =
  "기공소에 미정산 기공비를 직접 지급해 주세요. 기공소가 확인하면 전환됩니다.";

/** 뱃지 툴팁 — 전환 대기. */
export const DEMO_MODE_PENDING_BADGE_HINT =
  "기공소의 지급 확인을 기다리고 있습니다.";

/** 충전 탭 — 데모 중 유료 충전 요청 전 확인(전환 모달과 동일 본문). */
export const DEMO_MODE_CHARGE_EXIT_TITLE = "전환 입금할까요?";

export function resolveDemoModeChargeExitBody(
  kind?: DemoRequestorKind,
): string {
  return resolveDemoModeExitBody(kind);
}

export const DEMO_MODE_CHARGE_EXIT_WARNING = DEMO_MODE_EXIT_WARNING;

/** @deprecated Prefer resolveDemoModeChargeExitBody + DEMO_MODE_CHARGE_EXIT_WARNING. */
const DEMO_MODE_CHARGE_EXIT_DESCRIPTION_LINES_PRACTICE = [
  DEMO_MODE_EXIT_BODY_PRACTICE,
  "",
  DEMO_MODE_EXIT_WARNING,
] as const;

const DEMO_MODE_CHARGE_EXIT_DESCRIPTION_LINES_LAB = [
  DEMO_MODE_EXIT_BODY_LAB,
  "",
  DEMO_MODE_EXIT_WARNING,
] as const;

/** @deprecated Prefer resolveDemoModeChargeExitDescriptionLines(kind). */
export const DEMO_MODE_CHARGE_EXIT_DESCRIPTION_LINES =
  DEMO_MODE_CHARGE_EXIT_DESCRIPTION_LINES_PRACTICE;

export function resolveDemoModeChargeExitDescriptionLines(
  kind?: DemoRequestorKind,
): readonly string[] {
  return kind === "lab"
    ? DEMO_MODE_CHARGE_EXIT_DESCRIPTION_LINES_LAB
    : DEMO_MODE_CHARGE_EXIT_DESCRIPTION_LINES_PRACTICE;
}

export const DEMO_MODE_CHARGE_EXIT_CONFIRM_LABEL = "입금 요청하기";

const CREDIT_LEDGER_DEMO_NOTICE_BODY_PRACTICE =
  "데모는 가상 잔고로 90일간 무제한 이용할 수 있습니다. 실사용 전환 시 미정산 기공비는 기공소에 직접 지급합니다.";

const CREDIT_LEDGER_DEMO_NOTICE_BODY_LAB =
  "데모는 가상 잔고로 운영됩니다. 이용료를 넉넉히 입금하면 정산 후 남는 금액이 선수금이 되고 실사용으로 전환됩니다. 데모·전환 대기 중 기공크레딧 인출은 동결됩니다.";

/** @deprecated Prefer resolveCreditLedgerDemoNoticeBody(kind). */
export const CREDIT_LEDGER_DEMO_NOTICE_BODY =
  CREDIT_LEDGER_DEMO_NOTICE_BODY_PRACTICE;

export function resolveCreditLedgerDemoNoticeBody(
  kind?: DemoRequestorKind,
): string {
  return kind === "lab"
    ? CREDIT_LEDGER_DEMO_NOTICE_BODY_LAB
    : CREDIT_LEDGER_DEMO_NOTICE_BODY_PRACTICE;
}

const CREDIT_LEDGER_DEMO_BALANCE_HINT_PRACTICE =
  "데모 모드 · 가상 잔고입니다. 실사용 전환 시 기공소에 직접 지급합니다.";

const CREDIT_LEDGER_DEMO_BALANCE_HINT_LAB =
  "데모 모드 · 가상 잔고입니다. 입금 확인 후 정산 잔액이 선수금이 됩니다. 기공크레딧 인출은 동결됩니다.";

/** @deprecated Prefer resolveCreditLedgerDemoBalanceHint(kind). */
export const CREDIT_LEDGER_DEMO_BALANCE_HINT =
  CREDIT_LEDGER_DEMO_BALANCE_HINT_PRACTICE;

export function resolveCreditLedgerDemoBalanceHint(
  kind?: DemoRequestorKind,
): string {
  return kind === "lab"
    ? CREDIT_LEDGER_DEMO_BALANCE_HINT_LAB
    : CREDIT_LEDGER_DEMO_BALANCE_HINT_PRACTICE;
}

export const CREDIT_DEMO_BUCKET_HINT = "데모 체험";

/** @deprecated 요약 카드에서 무료 충전 항 제거. 레거시 참조용. */
export const CREDIT_DEMO_BUCKET_LABEL = "무료 충전";

/** 정산 기간 소비 카드 — 데모 모드 툴팁. */
export const CREDIT_LEDGER_DEMO_PERIOD_SPEND_HINT =
  "데모 기간 기공의뢰·커스텀어벗·스토어 지출 합계입니다.";

export const CREDIT_LEDGER_DEMO_PERIOD_SPEND_HINT_LAB =
  "데모 기간 어벗 생산·배송·스토어 지출 합계입니다.";

export function resolveCreditLedgerDemoPeriodSpendHint(
  kind?: DemoRequestorKind,
): string {
  return kind === "lab"
    ? CREDIT_LEDGER_DEMO_PERIOD_SPEND_HINT_LAB
    : CREDIT_LEDGER_DEMO_PERIOD_SPEND_HINT;
}

/** 정산 충전 카드 — 요약 UI 공통 라벨(치과·기공소). */
export const CREDIT_LEDGER_CHARGE_LABEL = "충전";

export const CREDIT_LEDGER_CHARGE_DETAIL_TITLE = "충전 내역";

/** 정산 충전 카드 — 데모 모드 툴팁(유료/선수금 아님). */
export const CREDIT_LEDGER_DEMO_CHARGE_HINT =
  "데모 중 가상 잔고 충전 합계입니다.";

/** @deprecated Prefer CREDIT_LEDGER_CHARGE_LABEL. */
export const CREDIT_LEDGER_DEMO_CHARGE_LABEL = CREDIT_LEDGER_CHARGE_LABEL;

/** @deprecated Prefer CREDIT_LEDGER_CHARGE_DETAIL_TITLE. */
export const CREDIT_LEDGER_DEMO_CHARGE_DETAIL_TITLE =
  CREDIT_LEDGER_CHARGE_DETAIL_TITLE;

/** 기공소 PTX — 어벗 디자인/생산 시 실크레딧 부족 안내(실사용 전환 후). */
export const PTX_CA_INSUFFICIENT_CREDIT_TITLE = "크레딧이 부족합니다";

export const PTX_CA_INSUFFICIENT_CREDIT_DESCRIPTION_LINES = [
  "어벗 디자인을 올리고 생산을 시작할 때 크레딧으로 결제됩니다.",
  "데모 중에는 가상 잔고(마이너스 허용)로 진행됩니다. 데모가 끝났다면 충전 후 다시 업로드해 주세요.",
] as const;

export const PTX_CA_INSUFFICIENT_CREDIT_CONFIRM_LABEL = "충전하기";

export const PTX_CA_INSUFFICIENT_CREDIT_REASON = "insufficient_credit_for_ptx_ca";

/** FAQ·도움말 공통 — 데모/무료 크레딧 안내. */
export const DEMO_MODE_FREE_CREDIT_FAQ_ANSWER =
  "아니요. 가입 환영 무료 크레딧은 없습니다. 90일 데모(가상 잔고·마이너스 허용)로 체험할 수 있고, 실사용 전환 시 미정산 기공비는 기공소에 직접 지급합니다. 이후 신규 의뢰는 충전(선결제)이 필요합니다.";

export const DEMO_MODE_ONBOARDING_HINT =
  "가입 후 90일 데모(가상 잔고)로 체험할 수 있어요. 실사용 전환 시 미정산 기공비는 기공소에 직접 지급합니다.";

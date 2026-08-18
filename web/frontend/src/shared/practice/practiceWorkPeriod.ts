// related files:
// - web/frontend/src/shared/date/kst.ts
// - web/frontend/src/shared/components/practice/PracticeOrderArrivalDateRangeField.tsx
// - web/frontend/src/shared/components/practice/PracticeWorkPeriodText.tsx
// - web/frontend/src/shared/components/practice/PracticeRushConfirmDialog.tsx
// - 2026-08-19: 출고=도착−2영업일. 지정 도착일 1영업일 전 배송 목표.
// - 2026-08-17: N+2 의미 툴팁 — 치과 배송·출고=치과도착일, 줄바꿈.
// - 2026-08-17: 제조 모드 항상 묶음. 2·3영업일은 지연고지(빨간 툴팁)만. 출고=도착−1. 할증 없음.
// - 2026-08-17: ≤3영업일 → 제조 express+지연고지. 출고 스케줄은 항상 묶음(도착−1 clamp).
// - 2026-08-17: 출고 목표=치과도착−1영업일. 안내 툴팁 3+2 권고 문구 고정. 할증 폐기·2영업일 신속배송.
// - 2026-08-17: 신속(≤3영업일) 배송일정 툴팁을 확인 모달(12시 컷오프)과 동일 문구로.
// - 2026-08-17: shouldEnablePracticeRushProcessing — 새로고침 시 신속 납기면 할증 복원.
// - 2026-08-17: 신속처리 확인 모달 문구 구조화(요금·납기·어벗/보철)·단순화.
// - 2026-08-17: 신속처리=합계≤3영업일 시 모달 확인(체크박스 폐기). 안내 문구 간결화.
// - 2026-08-17: 최소 작업+배송 2+2(4영업일)·신속처리 상수/고지.
// - 2026-08-16: 커스텀어벗 치과 직납·출고=도착−2영업일 안내를 작업+배송 툴팁에 포함.
// - 2026-08-15: 작업기간(주문→도착) 5일 미만 경고 SSOT.
// - 2026-08-15: 치과·기공소 툴팁 문구 분리. 표기 기공기간→작업기간.
// - 2026-08-15: 작업기간을 영업일(월~금) 기준으로 계산·표시.
// - 2026-08-15: 작업=도착-2영업일·배송=2일. 라벨 작업+배송기간, 표기 3+2영업일.
// - 2026-08-15: 카드/필드 라벨 주문-치과도착. lead 앞 + 제거.
// - 2026-08-15: N+2영업일 의미 툴팁(N일=기공작업, 2일=배송) 상시 표시.

import { kstYmdDiffBusinessDays } from "@/shared/date/kst";

/** 배송기간(영업일). 작업기간 = (주문→치과도착 영업일) − 이 값. 표기 N+2. */
export const PRACTICE_SHIPPING_BUSINESS_DAYS = 2;

/**
 * 커스텀어벗 제조 출고 목표 = 치과도착일 − 이 값(영업일).
 * 배송 lead(2)와 별도: 출고는 도착 2영업일 전 → 지정 도착일 1영업일 전 배송 목표.
 */
export const PRACTICE_SHIP_BEFORE_ARRIVAL_BUSINESS_DAYS = 2;

/** 일반 의뢰 최소 작업+배송 합계(영업일) = 2+2. */
export const PRACTICE_WORK_PERIOD_MIN_DAYS = 4;

/** 권고 작업+배송 합계(영업일) = 3+2. */
export const PRACTICE_WORK_PERIOD_RECOMMENDED_DAYS = 5;

/**
 * 신속처리 구간: 주문→도착 합계 ≤ 이 값(3영업일 이하).
 * 확인 모달 후 rushProcessing.
 */
export const PRACTICE_RUSH_MAX_WORK_PLUS_SHIP_DAYS = 3;

/**
 * 제조 표시상 신속 구간이었던 상한(2·3영업일).
 * 현재 제조 shippingMode는 항상 묶음 — 툴팁·확인 UI용.
 */
export const PRACTICE_EXPRESS_MAX_WORK_PLUS_SHIP_DAYS = 3;

/** 신속처리 기본 치과도착 = 주문일 + N영업일(선택값 없을 때) */
export const PRACTICE_RUSH_ARRIVAL_BUSINESS_DAYS = 2;

/** @deprecated 신속처리 할증 없음. 레거시 표기 호환용. */
export const PRACTICE_RUSH_FEE_MULTIPLIER = 1;

export const PRACTICE_RUSH_COURIER_DISCLAIMER =
  "택배 사정으로 도착을 보장하지 않습니다.";

export const PRACTICE_NORMAL_MIN_PERIOD_MESSAGE =
  "일반 의뢰는 작업+배송 2+2영업일 이상이어야 합니다. 3영업일 이하는 신속처리로 진행할 수 있습니다. 3+2영업일 이상 설정을 권합니다.";

/** 안내 툴팁 권고 문구 SSOT */
export const PRACTICE_WORK_PERIOD_RECOMMEND_NOTE =
  "3+2영업일 이상 설정을 권합니다.";

/** 신속처리 확인 모달 문구 */
export const PRACTICE_RUSH_CONFIRM_TITLE = "신속처리로 진행할까요?";
export const PRACTICE_RUSH_CONFIRM_PERIOD_LABEL = "3영업일 이하 납기 · 할증 없음";
export const PRACTICE_RUSH_CONFIRM_DETAILS = [
  {
    label: "어벗",
    value: [
      "2·3영업일: 제조는 묶음배송. 출고는 도착 2영업일 전 규칙으로 진행하며 지연될 수 있습니다.",
    ],
  },
  { label: "보철", value: "선택 납기까지 도착 목표" },
  {
    label: "권고",
    value: PRACTICE_WORK_PERIOD_RECOMMEND_NOTE,
  },
] as const;

/** @deprecated 할증 없음. */
export function formatPracticeRushFeeConfirmLabel(
  _multiplier?: number | null,
): string {
  return "할증 없음";
}

/** 툴팁·도움말용. 할증 배수 표기 없음. */
export function formatPracticeRushFeeParenLabel(
  _multiplier?: number | null,
): string {
  return "신속처리";
}

export type PracticeWorkPeriodViewer = "practice" | "lab";

/** N+2영업일: N일=기공작업시간, 2일=배송. 안내 줄바꿈(`whitespace-pre-line`). */
export function formatPracticeWorkPlusShipMeaningTooltip(
  totalBusinessDays: number | null | undefined,
): string {
  const workDays = getPracticeWorkOnlyBusinessDays(totalBusinessDays);
  const shipNote =
    "커스텀어벗은 치과로 직납되며, 출고는 도착 2영업일 전(지정 도착일 1영업일 전 배송 목표)입니다.";
  const lead =
    workDays == null
      ? `${PRACTICE_SHIPPING_BUSINESS_DAYS}일은 배송시간입니다.`
      : `${workDays}일은 기공작업시간, ${PRACTICE_SHIPPING_BUSINESS_DAYS}일은 배송시간입니다.`;
  return [lead, shipNote, PRACTICE_WORK_PERIOD_RECOMMEND_NOTE].join("\n");
}

/**
 * 2·3영업일 납기 툴팁: 제조 묶음배송 + 지연 가능.
 */
export function formatPracticeTightRushPeriodTooltip(): string {
  return [
    "2·3영업일 납기입니다. 제조는 묶음배송으로 넘기며, 출고는 치과도착 2영업일 전 규칙으로 진행합니다.",
    "목표 일정에 늦을 수 있습니다.",
    PRACTICE_WORK_PERIOD_RECOMMEND_NOTE,
    PRACTICE_RUSH_COURIER_DISCLAIMER,
  ].join("\n");
}

/** @deprecated formatPracticeTightRushPeriodTooltip 사용. */
export function formatPracticeRushPeriodTooltip(
  _multiplier?: number | null,
): string {
  return formatPracticeTightRushPeriodTooltip();
}

/** 치과(발신): 권고 미만(현재 4영업일) — meaning 툴팁에 권고가 이미 있으면 기공소용과 동일 보조 */
export const PRACTICE_WORK_PERIOD_SHORT_TOOLTIP_PRACTICE =
  PRACTICE_WORK_PERIOD_RECOMMEND_NOTE;

/** 기공소(수신): 짧은 기간이면 수락하지 않아도 됨 */
export const PRACTICE_WORK_PERIOD_SHORT_TOOLTIP_LAB =
  "작업+배송기간이 짧습니다. 수락하지 않으셔도 됩니다.";

export function getPracticeWorkPeriodShortTooltip(
  viewer: PracticeWorkPeriodViewer = "practice",
): string {
  return viewer === "lab"
    ? PRACTICE_WORK_PERIOD_SHORT_TOOLTIP_LAB
    : PRACTICE_WORK_PERIOD_SHORT_TOOLTIP_PRACTICE;
}

/**
 * N+2 의미 / 2·3영업일 지연고지 / 짧은 기간 경고.
 * 2·3영업일: 제조 묶음배송 + 지연 가능(빨간 표시는 PracticeWorkPeriodText).
 */
export function getPracticeWorkPeriodTooltip(
  viewer: PracticeWorkPeriodViewer = "practice",
  days?: number | null,
): string {
  if (isPracticeRushPeriod(days)) {
    return formatPracticeTightRushPeriodTooltip();
  }
  const meaning = formatPracticeWorkPlusShipMeaningTooltip(days);
  // 치과: meaning에 권고 포함. 기공소: 짧은 기간이면 수락 거부 안내만 추가.
  if (isPracticeWorkPeriodShort(days) && viewer === "lab") {
    return `${meaning}\n${PRACTICE_WORK_PERIOD_SHORT_TOOLTIP_LAB}`;
  }
  return meaning;
}

/** 주문일→치과도착일 영업일 합계(작업+배송). 같은 날=0. */
export function getPracticeWorkPeriodDays(
  orderYmd?: string | null,
  arrivalYmd?: string | null,
): number | null {
  return kstYmdDiffBusinessDays(orderYmd, arrivalYmd);
}

/** 작업 영업일 = 합계 − 배송(2). 합계가 배송보다 짧으면 0. */
export function getPracticeWorkOnlyBusinessDays(
  totalBusinessDays: number | null | undefined,
): number | null {
  if (typeof totalBusinessDays !== "number" || !Number.isFinite(totalBusinessDays)) {
    return null;
  }
  if (totalBusinessDays < 0) return null;
  return Math.max(0, totalBusinessDays - PRACTICE_SHIPPING_BUSINESS_DAYS);
}

/** 신속처리 후보: 합계 ≤ 3영업일 */
export function isPracticeRushPeriod(days: number | null | undefined): boolean {
  return (
    typeof days === "number" &&
    Number.isFinite(days) &&
    days >= 0 &&
    days <= PRACTICE_RUSH_MAX_WORK_PLUS_SHIP_DAYS
  );
}

/** @deprecated 제조는 항상 묶음. 2·3영업일 지연고지 구간과 동일. */
export function isPracticeExpressPeriod(
  days: number | null | undefined,
): boolean {
  return isPracticeRushPeriod(days);
}

/**
 * 확인 플래그 또는 주문→도착 영업일로 신속처리 적용 여부.
 * 새로고침 복원 시 플래그가 없어도 납기가 신속 구간이면 true.
 */
export function shouldEnablePracticeRushProcessing(args: {
  rushProcessing?: boolean | null;
  orderYmd?: string | null;
  arrivalYmd?: string | null;
}): boolean {
  if (args.rushProcessing === true) return true;
  return isPracticeRushPeriod(
    getPracticeWorkPeriodDays(args.orderYmd, args.arrivalYmd),
  );
}

/**
 * 권고(5) 미만·신속(≤3) 초과 → 짧은 기간(현재 4영업일).
 * 빨간 표시 + 기공소 거부 가능 안내.
 */
export function isPracticeWorkPeriodShort(days: number | null | undefined): boolean {
  return (
    typeof days === "number" &&
    Number.isFinite(days) &&
    days > PRACTICE_RUSH_MAX_WORK_PLUS_SHIP_DAYS &&
    days < PRACTICE_WORK_PERIOD_RECOMMENDED_DAYS
  );
}

/** `3+2영업일` (작업+배송). lead/days 공통 — 앞에 +를 붙이지 않음. */
export function formatPracticeWorkPlusShipLabel(totalBusinessDays: number | null): string {
  const workDays = getPracticeWorkOnlyBusinessDays(totalBusinessDays);
  if (workDays == null || totalBusinessDays == null || totalBusinessDays < 0) return "";
  // 합계≤2: 1+1영업일 표기(작업1·배송1). 3영업일은 1+2.
  if (totalBusinessDays <= 2) {
    const rushWork = Math.max(0, totalBusinessDays - 1);
    return `${rushWork}+1영업일`;
  }
  return `${workDays}+${PRACTICE_SHIPPING_BUSINESS_DAYS}영업일`;
}

/** 날짜 필드 옆·카드: 1+2영업일 */
export function formatPracticeWorkPeriodLeadLabel(totalBusinessDays: number | null): string {
  return formatPracticeWorkPlusShipLabel(totalBusinessDays);
}

/** 목록·상세: 1+2영업일 */
export function formatPracticeWorkPeriodDaysLabel(totalBusinessDays: number | null): string {
  return formatPracticeWorkPlusShipLabel(totalBusinessDays);
}

/** 카드/필드 공통 라벨: 주문-치과도착 */
export const PRACTICE_ORDER_ARRIVAL_PERIOD_LABEL = "주문-치과도착";

export function buildPracticeWorkPeriodSummaryItem(
  orderYmd?: string | null,
  arrivalYmd?: string | null,
  viewer: PracticeWorkPeriodViewer = "practice",
): {
  label: string;
  value: string;
  valueClassName?: string;
  tooltip?: string;
} | null {
  const days = getPracticeWorkPeriodDays(orderYmd, arrivalYmd);
  const value = formatPracticeWorkPeriodDaysLabel(days);
  if (!value) return null;
  const short = isPracticeWorkPeriodShort(days);
  const rush = isPracticeRushPeriod(days);
  return {
    label: "작업+배송기간",
    value,
    tooltip: getPracticeWorkPeriodTooltip(viewer, days),
    ...(short || rush ? { valueClassName: "text-destructive" } : {}),
  };
}

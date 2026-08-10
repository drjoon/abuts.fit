// change-log:
// - 2026-08-09: 디자인+생산(구강스캔)은 메시 최대직경을 무시하고 생산 리드타임 1일.
// - 2026-08-09: 디자인+생산(design_custom_abutment)은 묶음/신속 출고 +1영업일.
// - 2026-08-10: 묶음 리드타임 minBusinessDays=N → N영업일 후 출고(lead=1 → 익영업일).
// - 2026-08-08: 신속 선택 가능 = 신속 ETA < 묶음 ETA (당일·조기 이점 있을 때만).
// related files:
// - web/frontend/src/pages/requestor/new_request/hooks/useLeadTimeForecast.ts
// - web/frontend/src/shared/shipping/weeklyBatchSchedule.ts
// - web/backend/controllers/requests/production.utils.js
// - web/backend/controllers/requests/expressSelectable.utils.js
import { toKstYmd } from "@/shared/date/kst";
import {
  normalizeWeeklyBatchDays,
  resolveNextWeeklyBatchYmd,
} from "@/shared/shipping/weeklyBatchSchedule";

export const EXPRESS_SHIPPING_UNAVAILABLE_MESSAGE =
  "지금은 신속 출고를 선택할 수 없습니다. 예상 출고일이 묶음 출고와 같아 조기 출고 이점이 없습니다.";

export type LeadTimesMap = Partial<
  Record<
    "d6" | "d8" | "d10" | "d12",
    { minBusinessDays?: number | string }
  >
>;

export type EstimateShipParams = {
  weeklyBatchDays?: unknown;
  leadTimes?: LeadTimesMap | null;
  diameter?: number | null;
  shippingMode?: "normal" | "express";
  requestedAt?: Date;
  /** design_custom_abutment 이면 출고 +1영업일 (묶음/신속 공통) */
  productMode?: string | null;
};

const EXPRESS_CUTOFF_HOUR_KST = 12;
const DESIGN_LEAD_BUSINESS_DAYS = 1;

function needsDesignLeadDay(productMode?: string | null): boolean {
  return String(productMode || "").trim() === "design_custom_abutment";
}

function getKstWeekdayFromYmd(ymd: string): number | null {
  const parts = ymd.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n) || n <= 0)) {
    return null;
  }
  const [y, m, d] = parts;
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

function addBusinessDaysFromKstYmd(startYmd: string, days: number): string {
  if (!Number.isFinite(days) || days <= 0) return startYmd;

  const result = new Date(`${startYmd}T12:00:00+09:00`);
  if (Number.isNaN(result.getTime())) return startYmd;

  let added = 0;
  while (added < days) {
    result.setUTCDate(result.getUTCDate() + 1);
    const day = getKstWeekdayFromYmd(toKstYmd(result) || startYmd);
    if (day != null && day !== 0 && day !== 6) {
      added += 1;
    }
  }

  return toKstYmd(result) || startYmd;
}

function resolveLeadDaysForPickup(leadDays: number): number {
  if (!Number.isFinite(leadDays) || leadDays <= 0) return 1;
  return Math.max(1, Math.floor(Number(leadDays)));
}

function formatKstMonthDayWithWeekday(ymd: string): string {
  const date = new Date(`${ymd}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return ymd;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function getKstHour(dateInput: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    hour: "numeric",
    hour12: false,
  }).formatToParts(dateInput);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  return Number.isFinite(hour) ? hour : dateInput.getHours();
}

function nextBusinessDayInclusive(startYmd: string): string {
  const day = getKstWeekdayFromYmd(startYmd);
  if (day != null && day !== 0 && day !== 6) return startYmd;
  return addBusinessDaysFromKstYmd(startYmd, 1);
}

function resolveDiameterKey(diameter: number | null | undefined) {
  const d = Number.isFinite(diameter) && diameter != null ? Number(diameter) : 8;
  if (d <= 6) return "d6" as const;
  if (d <= 8) return "d8" as const;
  if (d <= 10) return "d10" as const;
  return "d12" as const;
}

function applyDesignLeadDay(
  shipYmd: string,
  productMode?: string | null,
): string {
  if (!needsDesignLeadDay(productMode)) return shipYmd;
  return addBusinessDaysFromKstYmd(shipYmd, DESIGN_LEAD_BUSINESS_DAYS);
}

export function computeEstimatedShipYmd({
  weeklyBatchDays,
  leadTimes,
  diameter = null,
  shippingMode = "normal",
  requestedAt = new Date(),
  productMode = null,
}: EstimateShipParams): string | null {
  const requestedYmd = toKstYmd(requestedAt);
  if (!requestedYmd) return null;

  if (shippingMode === "express") {
    const beforeNoon = getKstHour(requestedAt) < EXPRESS_CUTOFF_HOUR_KST;
    const baseYmd = beforeNoon
      ? nextBusinessDayInclusive(requestedYmd)
      : addBusinessDaysFromKstYmd(requestedYmd, 1);
    return applyDesignLeadDay(baseYmd, productMode);
  }

  // 구강스캔·디자인+생산: 턱스캔 메시 직경(>20mm)으로 d12 최대 리드가 잡히지 않게
  // 생산 리드타임은 1영업일 고정. (디자인 +1영업일은 applyDesignLeadDay)
  const designMode = needsDesignLeadDay(productMode);
  if (!designMode && !leadTimes) return null;

  let leadDays = 1;
  if (!designMode) {
    const diameterKey = resolveDiameterKey(diameter);
    const rawLead = leadTimes?.[diameterKey]?.minBusinessDays;
    const leadNumber = Number(rawLead);
    leadDays = Number.isFinite(leadNumber) ? Math.max(1, leadNumber) : 1;
  }
  const resolvedLeadDays = resolveLeadDaysForPickup(leadDays);
  const baseShipYmd = applyDesignLeadDay(
    addBusinessDaysFromKstYmd(requestedYmd, resolvedLeadDays),
    productMode,
  );
  const batchDays = normalizeWeeklyBatchDays(weeklyBatchDays);
  // 묶음 출고일 미로드/미설정 시 baseYmd(월요일 등)만 노출하지 않는다.
  if (batchDays.length === 0) return null;
  return resolveNextWeeklyBatchYmd(baseShipYmd, batchDays);
}

export function computeEstimatedShipLabel(params: EstimateShipParams): string | null {
  const ymd = computeEstimatedShipYmd(params);
  return ymd ? formatKstMonthDayWithWeekday(ymd) : null;
}

/**
 * 신속 출고 선택 가능 여부.
 * 신속 예상 출고 YMD가 묶음보다  Strictly earlier 일 때만 true.
 * 묶음 ETA를 아직 못 구하면(리드타임·요일 미설정) 비교 불가로 선택 허용(백엔드가 최종 판정).
 */
export function isExpressShippingSelectable(
  params: Omit<EstimateShipParams, "shippingMode"> = {},
): boolean {
  const expressYmd = computeEstimatedShipYmd({
    ...params,
    shippingMode: "express",
  });
  if (!expressYmd) return false;

  const normalYmd = computeEstimatedShipYmd({
    ...params,
    shippingMode: "normal",
  });
  if (!normalYmd) return true;

  return expressYmd < normalYmd;
}

export function logEstimatedShipDebug(
  tag: string,
  params: EstimateShipParams & { label?: string | null },
) {
  if (!import.meta.env.DEV) return;
  const batchDays = normalizeWeeklyBatchDays(params.weeklyBatchDays);
  const ymd = computeEstimatedShipYmd(params);
  console.debug("[ship-eta]", tag, {
    shippingMode: params.shippingMode ?? "normal",
    productMode: params.productMode ?? null,
    weeklyBatchDays: batchDays,
    diameter: params.diameter ?? null,
    leadTimesLoaded: Boolean(params.leadTimes),
    ymd,
    label: params.label ?? (ymd ? formatKstMonthDayWithWeekday(ymd) : null),
  });
}

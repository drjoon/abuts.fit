// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/backend/controllers/requests/shipping.controller.js
// - web/frontend/src/shared/shipping/shippingMode.ts
// - web/frontend/src/shared/date/kst.ts
// change-log:
// - 2026-09-10: 우편함 배지 요일 = 가장 빠른 estimatedShipYmd (묶음 설정 요일 아님)
import type { ManufacturerRequest } from "../../utils/request";
import { resolveShippingMode } from "@/shared/shipping/shippingMode";
import { kstYmdWeekday } from "@/shared/date/kst";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const DAY_LABELS: Record<string, string> = {
  sun: "일",
  mon: "월",
  tue: "화",
  wed: "수",
  thu: "목",
  fri: "금",
  sat: "토",
};

export const getKstDayKey = (date: Date = new Date()): string => {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return DAY_KEYS[kst.getUTCDay()];
};

export const getKstTodayYmd = (date: Date = new Date()): string => {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().split("T")[0];
};

const normalizeDays = (raw: unknown): string[] => {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .map((v) =>
          String(v || "")
            .trim()
            .toLowerCase(),
        )
        .filter((v): v is (typeof DAY_KEYS)[number] =>
          (DAY_KEYS as readonly string[]).includes(v),
        ),
    ),
  );
};

export const getRequestWeeklyBatchDays = (
  req: ManufacturerRequest | null | undefined,
): string[] => {
  const raw = (req as any)?.business?.shippingPolicy?.weeklyBatchDays;
  return normalizeDays(raw);
};

/**
 * Next shipping weekday key based on today's KST weekday.
 * Returns null when the provided days include today or list is empty.
 */
export const getNextShippingDayKey = (
  days: string[],
  todayKey: string = getKstDayKey(),
): string | null => {
  const valid = normalizeDays(days);
  if (!valid.length) return null;
  if (valid.includes(todayKey)) return null;
  const todayIdx = DAY_KEYS.indexOf(todayKey as (typeof DAY_KEYS)[number]);
  if (todayIdx < 0) return valid[0];
  let best: string | null = null;
  let bestDiff = 8;
  for (const d of valid) {
    const idx = DAY_KEYS.indexOf(d as (typeof DAY_KEYS)[number]);
    if (idx < 0) continue;
    const diff = (idx - todayIdx + 7) % 7 || 7;
    if (diff < bestDiff) {
      bestDiff = diff;
      best = d;
    }
  }
  return best;
};

export const getDayLabel = (key: string | null | undefined): string =>
  (key && DAY_LABELS[key]) || "";

export type MailboxShippingDayInfo = {
  /** true when earliest estimatedShipYmd is after today (or weeklyBatchDays fallback). */
  notToday: boolean;
  /** Weekday of earliest estimatedShipYmd (e.g. "금"), else weeklyBatchDays next day. */
  nextDayLabel: string | null;
};

/**
 * Determine whether a mailbox is shippable today.
 * Prefer earliest timeline.estimatedShipYmd (matches modal 출고 date).
 * Fall back to weeklyBatchDays only when no estimated YMD is present.
 */
export const resolveMailboxShippingDayInfo = (
  requests: ManufacturerRequest[],
  todayKey: string = getKstDayKey(),
  todayYmd: string = getKstTodayYmd(),
): MailboxShippingDayInfo => {
  if (!requests || requests.length === 0) {
    return { notToday: false, nextDayLabel: null };
  }
  if (
    requests.some(
      (req) => Boolean((req as any)?.timeline?.forceTodayShipment) === true,
    )
  ) {
    return { notToday: false, nextDayLabel: null };
  }
  // 신속 건이 포함된 우편함은 주간 묶음 요일 제한을 적용하지 않는다.
  if (requests.some((req) => resolveShippingMode(req as any) === "express")) {
    return { notToday: false, nextDayLabel: null };
  }

  let earliest: string | null = null;
  for (const req of requests) {
    const ymd = String((req as any)?.timeline?.estimatedShipYmd || "").trim();
    if (!ymd) continue;
    if (!earliest || ymd < earliest) earliest = ymd;
  }
  if (earliest) {
    if (earliest > todayYmd) {
      const dow = kstYmdWeekday(earliest);
      if (dow == null) return { notToday: true, nextDayLabel: null };
      return {
        notToday: true,
        nextDayLabel: getDayLabel(DAY_KEYS[dow]) || null,
      };
    }
    return { notToday: false, nextDayLabel: null };
  }

  // All requests in a mailbox share the same requestor org, so inspect the first
  // with a policy.
  for (const req of requests) {
    const days = getRequestWeeklyBatchDays(req);
    if (days.length === 0) continue;
    if (days.includes(todayKey)) {
      return { notToday: false, nextDayLabel: null };
    }
    const next = getNextShippingDayKey(days, todayKey);
    return { notToday: true, nextDayLabel: getDayLabel(next) || null };
  }
  return { notToday: false, nextDayLabel: null };
};

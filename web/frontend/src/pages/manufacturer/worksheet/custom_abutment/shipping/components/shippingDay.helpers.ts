import type { ManufacturerRequest } from "../../utils/request";

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
  /** true when any request in the mailbox has a weeklyBatchDays policy that excludes today. */
  notToday: boolean;
  /** Next shipping weekday label like "수" when notToday, else null. */
  nextDayLabel: string | null;
};

/**
 * Determine whether a mailbox (with its grouped requests) is shippable today.
 * A mailbox is marked notToday when its requestor has a weeklyBatchDays policy
 * that does not include today's KST weekday. Policies without weeklyBatchDays
 * default to "shippable today" (backward compatible).
 */
export const resolveMailboxShippingDayInfo = (
  requests: ManufacturerRequest[],
  todayKey: string = getKstDayKey(),
  todayYmd: string = getKstTodayYmd(),
): MailboxShippingDayInfo => {
  if (!requests || requests.length === 0) {
    return { notToday: false, nextDayLabel: null };
  }
  // 마감일(estimatedShipYmd)이 오늘이거나 이미 지난 의뢰가 하나라도 있으면
  // 의뢰자의 weeklyBatchDays 정책과 무관하게 오늘 함께 발송 가능하도록 한다.
  // (마감보다 일찍 제품이 나온 미래 발송 의뢰는 함께 묶어 조기 발송)
  const hasDueOrOverdue = requests.some((req) => {
    const ymd = String(req?.timeline?.estimatedShipYmd || "").trim();
    return ymd && ymd <= todayYmd;
  });
  if (hasDueOrOverdue) {
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

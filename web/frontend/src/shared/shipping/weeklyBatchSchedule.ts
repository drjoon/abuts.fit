// change-log:
// - 2026-08-08: 묶음 출고일 정렬 SSOT. 백엔드 resolveNextWeeklyBatchYmd와 동일한
//   KST 달력일 요일(civil YMD) 기준. 서버 로컬/브라우저 TZ getDay() 금지.
// related files:
// - web/frontend/src/pages/requestor/new_request/hooks/useLeadTimeForecast.ts
// - web/frontend/src/pages/requestor/new_request/hooks/useBulkShippingPolicy.ts
// - web/backend/controllers/requests/production.utils.js

export const WEEKLY_BATCH_DAY_KEYS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
] as const;

export type WeeklyBatchDayKey = (typeof WEEKLY_BATCH_DAY_KEYS)[number];

const WEEKDAY_KEYS = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
] as const;

/** KST 달력 YMD의 요일 키 (mon..sun). rules.md civil calendar SSOT. */
export function getWeekdayKeyFromYmd(ymd: string): string | null {
  const parts = String(ymd || "")
    .split("-")
    .map((n) => Number(n));
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n) || n <= 0)) {
    return null;
  }
  const [y, m, d] = parts;
  return WEEKDAY_KEYS[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()] || null;
}

export function normalizeWeeklyBatchDays(raw: unknown): WeeklyBatchDayKey[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .map((day) => String(day || "").trim().toLowerCase())
        .filter((day): day is WeeklyBatchDayKey =>
          (WEEKLY_BATCH_DAY_KEYS as readonly string[]).includes(day),
        ),
    ),
  );
}

export function serializeWeeklyBatchDays(days: unknown): string {
  return normalizeWeeklyBatchDays(days).slice().sort().join(",");
}

/**
 * baseYmd(생산/포장 완료 기준일) 이후 가장 먼저 도래하는 선택 요일 YMD.
 * 백엔드 resolveNextWeeklyBatchYmd와 동일(공휴일 보정 제외 — ETA 미리보기용).
 */
export function resolveNextWeeklyBatchYmd(
  baseYmd: string,
  weeklyBatchDays: unknown,
): string {
  const trimmed = String(baseYmd || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed || baseYmd;

  const allowed = new Set(normalizeWeeklyBatchDays(weeklyBatchDays));
  if (allowed.size === 0) return trimmed;

  let candidateYmd = trimmed;
  for (let i = 0; i < 20; i += 1) {
    const weekdayKey = getWeekdayKeyFromYmd(candidateYmd);
    if (weekdayKey && allowed.has(weekdayKey as WeeklyBatchDayKey)) {
      return candidateYmd;
    }
    candidateYmd = addKstCalendarDays(candidateYmd, 1);
  }

  return trimmed;
}

function addKstCalendarDays(startYmd: string, days: number): string {
  const base = new Date(`${startYmd}T12:00:00+09:00`);
  if (Number.isNaN(base.getTime())) return startYmd;
  const step = Number.isFinite(days) && days > 0 ? Math.floor(days) : 0;
  base.setUTCDate(base.getUTCDate() + step);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(base);
}

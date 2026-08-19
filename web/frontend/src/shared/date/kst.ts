// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/practice/components/PracticeRecentTransfersCalendar.tsx
const KST_TZ = "Asia/Seoul";

export function toKstYmd(input?: string | number | Date | null): string | null {
  if (input == null) return null;
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: KST_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** YYYY-MM-DD, ko dotted date, ISO/timestamp → KST YMD. */
export function toKstYmdLoose(input?: string | number | Date | null): string | null {
  if (input == null) return null;
  if (typeof input === "number" || input instanceof Date) return toKstYmd(input);
  const raw = String(input).trim();
  if (!raw || raw === "-") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const dotted = raw.match(/^(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/);
  if (dotted) {
    const y = Number(dotted[1]);
    const m = Number(dotted[2]);
    const d = Number(dotted[3]);
    if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
    return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return toKstYmd(raw);
}

/** civil YMD + days (UTC noon, rules.md §1.4). */
export function kstAddCivilDays(ymd?: string | null, days = 0): string | null {
  const raw = String(ymd || "").trim();
  const parts = raw.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n) || n <= 0)) {
    return null;
  }
  const [y, m, d] = parts;
  const next = new Date(Date.UTC(y, m - 1, d + Math.trunc(Number(days) || 0), 12));
  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** weekStartsOn: 0=일 … 6=토. */
export function kstStartOfWeek(ymd?: string | null, weekStartsOn = 0): string | null {
  const raw = String(ymd || "").trim();
  const dow = kstYmdWeekday(raw);
  if (dow == null) return null;
  const start = ((Number(weekStartsOn) % 7) + 7) % 7;
  const delta = (dow - start + 7) % 7;
  return kstAddCivilDays(raw, -delta);
}

export function kstStartOfMonth(ymd?: string | null): string | null {
  const raw = String(ymd || "").trim();
  const parts = raw.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n) || n <= 0)) {
    return null;
  }
  const [y, m] = parts;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
}

export function kstEndOfMonth(ymd?: string | null): string | null {
  const start = kstStartOfMonth(ymd);
  if (!start) return null;
  const nextMonth = kstAddCivilDays(start, 32);
  const nextStart = kstStartOfMonth(nextMonth);
  if (!nextStart) return null;
  return kstAddCivilDays(nextStart, -1);
}

export function ymdToKstDate(ymd?: string | null): Date | null {
  if (!ymd) return null;
  const d = new Date(`${ymd}T00:00:00+09:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** KST 달력일 기준 일수 차이 (to - from). 잘못된 YMD면 null. */
export function kstYmdDiffDays(fromYmd?: string | null, toYmd?: string | null): number | null {
  const from = ymdToKstDate(String(fromYmd || "").trim());
  const to = ymdToKstDate(String(toYmd || "").trim());
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/** KST YMD의 요일 (0=일 … 6=토). 잘못된 YMD면 null. */
export function kstYmdWeekday(ymd?: string | null): number | null {
  const raw = String(ymd || "").trim();
  const parts = raw.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n) || n <= 0)) {
    return null;
  }
  const [y, m, d] = parts;
  // civil calendar weekday (rules.md §1.4) — UTC noon, not server-local
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

function isKstWeekdayYmd(ymd: string): boolean {
  const dow = kstYmdWeekday(ymd);
  return dow != null && dow !== 0 && dow !== 6;
}

function addOneCivilDayYmd(ymd: string): string | null {
  const d = ymdToKstDate(ymd);
  if (!d) return null;
  d.setDate(d.getDate() + 1);
  return toKstYmd(d);
}

/**
 * KST 영업일(월~금) 차이 (to - from).
 * from 다음날부터 to까지 영업일 개수. 같은 날이면 0.
 * 공휴일은 제외하지 않음(프론트 ETA와 동일).
 */
export function kstYmdDiffBusinessDays(
  fromYmd?: string | null,
  toYmd?: string | null,
): number | null {
  const from = String(fromYmd || "").trim();
  const to = String(toYmd || "").trim();
  if (!from || !to) return null;
  if (!ymdToKstDate(from) || !ymdToKstDate(to)) return null;
  if (from === to) return 0;

  if (to < from) {
    const forward = kstYmdDiffBusinessDays(to, from);
    return forward == null ? null : -forward;
  }

  let count = 0;
  let cursor = addOneCivilDayYmd(from);
  let guard = 0;
  while (cursor && cursor <= to && guard < 3700) {
    if (isKstWeekdayYmd(cursor)) count += 1;
    cursor = addOneCivilDayYmd(cursor);
    guard += 1;
  }
  return count;
}

/** startYmd 기준 N영업일 후 YMD(월~금, 공휴일 미제외). */
export function kstAddBusinessDays(
  startYmd?: string | null,
  days = 0,
): string | null {
  const start = String(startYmd || "").trim();
  if (!ymdToKstDate(start)) return null;
  const n = Math.max(0, Math.floor(Number(days) || 0));
  if (n === 0) return start;
  let cursor = start;
  let added = 0;
  let guard = 0;
  while (added < n && guard < 3700) {
    cursor = addOneCivilDayYmd(cursor) || "";
    if (!cursor) return null;
    if (isKstWeekdayYmd(cursor)) added += 1;
    guard += 1;
  }
  return cursor || null;
}

export function formatKstYmdToKo(ymd?: string | null): string {
  const d = ymdToKstDate(ymd);
  if (!d) return "-";

  return d.toLocaleDateString("ko-KR", {
    timeZone: KST_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
}

export function formatKstDateTimeToKo(input?: string | number | Date | null): string {
  if (input == null) return "-";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ko-KR", { timeZone: KST_TZ });
}

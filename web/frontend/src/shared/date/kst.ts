// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
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

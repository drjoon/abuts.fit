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

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

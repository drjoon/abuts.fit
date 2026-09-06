// related files:
// - web/frontend/src/pages/salesTeam/SalesHomePage.tsx
// - web/frontend/src/shared/date/kst.ts

/** KST civil calendar: add delta days to YYYY-MM-DD. */
export function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta, 12));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function formatDayLabel(ymd: string): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][
    new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()
  ];
  return `${ymd} (${weekday})`;
}

export function visitStatusLabel(status: string): string {
  if (status === "done") return "완료";
  if (status === "canceled") return "취소";
  if (status === "noShow") return "부재";
  if (status === "postponed") return "연기";
  return "예정";
}

/** KST HH:mm — today면 지금 이후(30분 단위 올림), 다른 날은 10:00. */
export function defaultVisitHm(ymd: string, todayYmd: string): string {
  if (!ymd || ymd !== todayYmd) return "10:00";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value || 0);
  let total = hour * 60 + minute + 1;
  const rem = total % 30;
  if (rem !== 0) total += 30 - rem;
  if (total >= 24 * 60) total = 23 * 60 + 30;
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** 오늘·과거 시각이면 지금 이후로 올림. */
export function clampVisitHmAfterNow(
  hm: string,
  ymd: string,
  todayYmd: string,
): string {
  const raw = String(hm || "").trim();
  if (!/^\d{2}:\d{2}$/.test(raw)) return defaultVisitHm(ymd, todayYmd);
  if (ymd !== todayYmd) return raw;
  const min = defaultVisitHm(ymd, todayYmd);
  return raw < min ? min : raw;
}

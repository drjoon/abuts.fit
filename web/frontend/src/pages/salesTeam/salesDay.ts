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
  return "예정";
}

/**
 * 날짜를 "YYYY-MM-DD (요일)" 형식으로 포맷
 * @param value 날짜 문자열 (ISO 8601 또는 YYYY-MM-DD 형식)
 * @param fallback 값이 없을 때 반환할 기본값 (기본값: "-")
 * @returns 포맷된 날짜 문자열, 예: "2026-03-17 (화)"
 */
export const formatDateWithDay = (
  value?: string | null,
  fallback: string = "-"
): string => {
  if (!value) return fallback;
  try {
    // ISO 8601 또는 YYYY-MM-DD 형식 처리
    const dateStr = String(value).slice(0, 10);
    const d = new Date(`${dateStr}T00:00:00+09:00`);
    if (Number.isNaN(d.getTime())) return fallback;
    
    const formatted = d.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
    const dayStr = d.toLocaleDateString("ko-KR", {
      weekday: "short",
      timeZone: "Asia/Seoul",
    });
    return `${formatted} (${dayStr})`;
  } catch {
    return fallback;
  }
};

/**
 * 날짜를 "YYYY-MM-DD" 형식으로 포맷 (요일 제외)
 * @param value 날짜 문자열
 * @param fallback 값이 없을 때 반환할 기본값
 * @returns 포맷된 날짜 문자열
 */
export const formatDateOnly = (
  value?: string | null,
  fallback: string = "-"
): string => {
  if (!value) return fallback;
  try {
    const dateStr = String(value).slice(0, 10);
    const d = new Date(`${dateStr}T00:00:00+09:00`);
    if (Number.isNaN(d.getTime())) return fallback;
    return d.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
  } catch {
    return fallback;
  }
};

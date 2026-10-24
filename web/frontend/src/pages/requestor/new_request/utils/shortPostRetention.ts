// 피니시라인 max_z에서 포스트 탑까지가 이 값 이하면 유지홈을 묻는다.
export const SHORT_POST_RETENTION_MAX_MM = 3;

export type ShortPostRetentionChoice = "none" | "deep";

export function measuredPostLengthMm(
  preflight?: { postLengthMm?: number | null; status?: string } | null,
): number | null {
  if (!preflight || preflight.status === "checking") return null;
  const length = Number(preflight.postLengthMm);
  return Number.isFinite(length) ? length : null;
}

export function isShortPostLength(lengthMm: number | null | undefined): boolean {
  return (
    typeof lengthMm === "number" &&
    Number.isFinite(lengthMm) &&
    lengthMm <= SHORT_POST_RETENTION_MAX_MM
  );
}

export function formatPostLengthMm(lengthMm: number): string {
  const rounded = Math.round(lengthMm * 100) / 100;
  return String(rounded);
}

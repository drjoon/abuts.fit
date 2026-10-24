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

const SHORT_POST_RETENTION_STORAGE_KEY = "abuts.newRequest.shortPostRetention.v1";

export function readShortPostRetentionChoices(): Record<
  string,
  ShortPostRetentionChoice
> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(SHORT_POST_RETENTION_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    const next: Record<string, ShortPostRetentionChoice> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value === "deep" || value === "none") next[key] = value;
    }
    return next;
  } catch {
    return {};
  }
}

export function writeShortPostRetentionChoice(
  fileKey: string,
  value: ShortPostRetentionChoice,
): void {
  const key = String(fileKey || "").trim();
  if (!key || typeof localStorage === "undefined") return;
  const next = { ...readShortPostRetentionChoices(), [key]: value };
  try {
    localStorage.setItem(SHORT_POST_RETENTION_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 저장 공간이 없으면 이번 세션 값만 유지한다.
  }
}

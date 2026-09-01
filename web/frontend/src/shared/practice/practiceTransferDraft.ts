import { kstAddCivilDays, toKstYmd } from "@/shared/date/kst";

/** 임시저장 자동 휴지통 — N일간 갱신 없으면 soft-delete (백엔드와 동일) */
export const PRACTICE_TRANSFER_DRAFT_STALE_DAYS = 7;

/** UI 깜빡임 — KST 기준 N일 이상 지난 임시저장 */
export const PRACTICE_TRANSFER_DRAFT_STALE_HIGHLIGHT_DAYS = 1;

export type PracticeTransferDraftCompletenessInput = {
  targetLabName?: string | null;
  targetLabAnchorId?: string | null;
  fileCount?: number | null;
};

/** 기공소·첨부 파일 모두 없으면 미완성 */
export function isPracticeTransferDraftIncomplete(
  draft: PracticeTransferDraftCompletenessInput,
): boolean {
  const hasLab =
    Boolean(String(draft.targetLabAnchorId || "").trim()) ||
    Boolean(String(draft.targetLabName || "").trim());
  const hasFiles = Number(draft.fileCount || 0) > 0;
  return !hasLab && !hasFiles;
}

/** KST 기준으로 하루(24h civil day) 이상 갱신되지 않은 임시저장 */
export function isPracticeTransferDraftStaleHighlight(
  updatedAt?: string | null,
  now: Date = new Date(),
  staleDays: number = PRACTICE_TRANSFER_DRAFT_STALE_HIGHLIGHT_DAYS,
): boolean {
  const updatedYmd = toKstYmd(updatedAt);
  const todayYmd = toKstYmd(now);
  if (!updatedYmd || !todayYmd) return false;
  const days = Math.max(1, Math.trunc(Number(staleDays) || 1));
  const thresholdYmd = kstAddCivilDays(todayYmd, -days);
  if (!thresholdYmd) return false;
  return updatedYmd <= thresholdYmd;
}

export function practiceTransferDraftCountBadgeClassName(): string {
  return "ml-0.5 border-amber-200 bg-amber-100 text-amber-900 hover:bg-amber-100";
}

export function practiceTransferDraftStaleAttentionClassName(
  stale?: boolean,
): string {
  return stale ? "practice-draft-stale-attention" : "";
}

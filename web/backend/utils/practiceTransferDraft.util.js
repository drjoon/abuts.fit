/** 임시저장 보관 — N일간 갱신 없으면 영구 삭제(휴지통 아님) */
export const PRACTICE_TRANSFER_DRAFT_STALE_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export function buildPracticeTransferDraftStaleCutoff(
  now = new Date(),
  staleDays = PRACTICE_TRANSFER_DRAFT_STALE_DAYS,
) {
  const days = Math.max(1, Number(staleDays) || PRACTICE_TRANSFER_DRAFT_STALE_DAYS);
  return new Date(now.getTime() - days * DAY_MS);
}

/**
 * 활성 draft 중 updatedAt이 cutoff 이전인 건을 영구 삭제한다.
 * 사용자가 휴지통으로 옮긴 건(`deletedAt`이 있는 문서)은 건드리지 않는다.
 * @returns {{ purgedIds: string[], purgedCount: number, purgedAt: Date | null }}
 */
export async function purgeStalePracticeTransferDrafts({
  scope,
  PracticeTransferDraft,
  now = new Date(),
  staleDays = PRACTICE_TRANSFER_DRAFT_STALE_DAYS,
}) {
  const cutoff = buildPracticeTransferDraftStaleCutoff(now, staleDays);
  const staleDocs = await PracticeTransferDraft.find({
    ...scope,
    deletedAt: null,
    updatedAt: { $lt: cutoff },
  })
    .select({ _id: 1 })
    .lean();

  const purgedIds = staleDocs
    .map((doc) => String(doc?._id || "").trim())
    .filter(Boolean);

  if (purgedIds.length === 0) {
    return { purgedIds: [], purgedCount: 0, purgedAt: null };
  }

  const purgedAt = now instanceof Date ? now : new Date(now);
  await PracticeTransferDraft.deleteMany({
    _id: { $in: purgedIds },
    deletedAt: null,
  });

  return {
    purgedIds,
    purgedCount: purgedIds.length,
    purgedAt,
  };
}

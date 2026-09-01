/** 임시저장 자동 휴지통 — N일간 갱신 없으면 soft-delete */
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
 * 활성 draft 중 updatedAt이 cutoff 이전인 건을 휴지통(deletedAt)으로 옮긴다.
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
  await PracticeTransferDraft.updateMany(
    {
      _id: { $in: purgedIds },
      deletedAt: null,
    },
    { $set: { deletedAt: purgedAt } },
  );

  return {
    purgedIds,
    purgedCount: purgedIds.length,
    purgedAt,
  };
}

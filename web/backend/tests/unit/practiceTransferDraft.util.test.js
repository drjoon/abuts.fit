import { describe, expect, it, jest } from "@jest/globals";

import {
  PRACTICE_TRANSFER_DRAFT_STALE_DAYS,
  buildPracticeTransferDraftStaleCutoff,
  purgeStalePracticeTransferDrafts,
} from "../../utils/practiceTransferDraft.util.js";

describe("practiceTransferDraft.util", () => {
  it("buildPracticeTransferDraftStaleCutoff subtracts stale days", () => {
    const now = new Date("2026-09-08T12:00:00+09:00");
    const cutoff = buildPracticeTransferDraftStaleCutoff(now, 7);
    expect(cutoff.toISOString()).toBe("2026-09-01T03:00:00.000Z");
    expect(PRACTICE_TRANSFER_DRAFT_STALE_DAYS).toBe(7);
  });

  it("purgeStalePracticeTransferDrafts permanently deletes stale active drafts", async () => {
    const now = new Date("2026-09-08T00:00:00.000Z");
    const staleId = "507f1f77bcf86cd799439011";
    const deleteMany = jest.fn().mockResolvedValue({ deletedCount: 1 });
    const PracticeTransferDraft = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([{ _id: staleId }]),
        }),
      }),
      deleteMany,
    };

    const result = await purgeStalePracticeTransferDrafts({
      scope: { practiceBusinessAnchorId: "abc" },
      PracticeTransferDraft,
      now,
      staleDays: 7,
    });

    expect(result.purgedCount).toBe(1);
    expect(result.purgedIds).toEqual([staleId]);
    expect(result.purgedAt).toEqual(now);
    expect(deleteMany).toHaveBeenCalledWith({
      _id: { $in: [staleId] },
      deletedAt: null,
    });
    expect(PracticeTransferDraft.find).toHaveBeenCalledWith(
      expect.objectContaining({
        deletedAt: null,
        updatedAt: { $lt: buildPracticeTransferDraftStaleCutoff(now, 7) },
      }),
    );
  });

  it("purgeStalePracticeTransferDrafts no-ops when nothing stale", async () => {
    const PracticeTransferDraft = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([]),
        }),
      }),
      deleteMany: jest.fn(),
    };

    const result = await purgeStalePracticeTransferDrafts({
      scope: {},
      PracticeTransferDraft,
    });

    expect(result).toEqual({ purgedIds: [], purgedCount: 0, purgedAt: null });
    expect(PracticeTransferDraft.deleteMany).not.toHaveBeenCalled();
  });
});

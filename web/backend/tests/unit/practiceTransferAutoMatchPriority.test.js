// related files:
// - web/backend/utils/practiceTransferAutoMatchCore.js
import {
  PRACTICE_TRANSFER_AUTO_MATCH_PRIORITY_MS,
  buildAutoMatchPriorityAccessClause,
  buildAutoMatchPriorityFieldsCore,
  canAccessAutoMatchOpenPool,
  canOpenPracticeTransferSubcontract,
  isAutoMatchClaimActive,
  isAutoMatchOpenPool,
  isAutoMatchPriorityActive,
  isAutoMatchPriorityLabAnchorId,
  isInternalLabBusinessType,
  isPracticeTransferLabReceiverRole,
  toAutoMatchApiFieldsCore,
} from "../../utils/practiceTransferAutoMatchCore.js";

const OID_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const OID_B = "bbbbbbbbbbbbbbbbbbbbbbbb";

describe("practiceTransferAutoMatch priority (core)", () => {
  const now = new Date();

  const openTransfer = {
    matchingMode: "auto",
    status: "active",
    targetLabAnchorId: null,
    autoMatch: {
      completedAt: null,
      eligibleLabAnchorIds: [OID_A, OID_B],
      priorityLabAnchorIds: [OID_A],
      priorityUntil: new Date(
        now.getTime() + PRACTICE_TRANSFER_AUTO_MATCH_PRIORITY_MS,
      ),
      declinedLabAnchorIds: [],
    },
  };

  test("isPracticeTransferLabReceiverRole includes internalLab", () => {
    expect(isPracticeTransferLabReceiverRole("internalLab")).toBe(true);
    expect(isPracticeTransferLabReceiverRole("requestor")).toBe(true);
    expect(isPracticeTransferLabReceiverRole("practice")).toBe(false);
  });

  test("priority active only for open pool within priorityUntil", () => {
    expect(isAutoMatchPriorityActive(openTransfer, now)).toBe(true);
    expect(
      isAutoMatchPriorityActive(
        openTransfer,
        new Date(now.getTime() + PRACTICE_TRANSFER_AUTO_MATCH_PRIORITY_MS + 1),
      ),
    ).toBe(false);
    expect(
      isAutoMatchPriorityActive(
        {
          ...openTransfer,
          targetLabAnchorId: OID_A,
          autoMatch: { ...openTransfer.autoMatch, claimedAt: now },
        },
        now,
      ),
    ).toBe(false);
  });

  test("only priority lab can access open pool while active", () => {
    expect(canAccessAutoMatchOpenPool(openTransfer, OID_A, now)).toBe(true);
    expect(canAccessAutoMatchOpenPool(openTransfer, OID_B, now)).toBe(false);
    expect(
      canAccessAutoMatchOpenPool(
        openTransfer,
        OID_B,
        new Date(now.getTime() + PRACTICE_TRANSFER_AUTO_MATCH_PRIORITY_MS + 1),
      ),
    ).toBe(true);
  });

  test("buildAutoMatchPriorityFieldsCore empty when no internalLab in eligible", () => {
    const fields = buildAutoMatchPriorityFieldsCore({
      eligibleLabAnchorIds: [OID_B],
      priorityLabAnchorIds: [],
      now,
    });
    expect(fields.priorityUntil).toBeNull();
    expect(fields.priorityLabAnchorIds).toBeUndefined();
  });

  test("buildAutoMatchPriorityFieldsCore sets +30m when Abuts eligible", () => {
    const fields = buildAutoMatchPriorityFieldsCore({
      eligibleLabAnchorIds: [OID_A, OID_B],
      priorityLabAnchorIds: [OID_A],
      now,
    });
    expect(fields.priorityUntil.getTime()).toBe(
      now.getTime() + PRACTICE_TRANSFER_AUTO_MATCH_PRIORITY_MS,
    );
    expect(fields.priorityLabAnchorIds).toEqual([OID_A]);
  });

  test("priority access clause includes priorityLabAnchorIds branch", () => {
    const clause = buildAutoMatchPriorityAccessClause(OID_B, now);
    expect(clause.$or.some((c) => c["autoMatch.priorityLabAnchorIds"] === OID_B)).toBe(
      true,
    );
    expect(clause.$or.some((c) => c["autoMatch.priorityUntil"]?.$lte)).toBe(true);
  });

  test("toAutoMatchApiFieldsCore exposes priorityActive", () => {
    const fields = toAutoMatchApiFieldsCore(openTransfer, OID_A);
    expect(fields.autoMatch.priorityActive).toBe(true);
    expect(fields.autoMatch.priorityLabForMe).toBe(true);
    expect(fields.autoMatch.canOpenSubcontract).toBe(true);
    expect(isAutoMatchPriorityLabAnchorId(openTransfer, OID_A)).toBe(true);
  });

  test("isInternalLabBusinessType", () => {
    expect(isInternalLabBusinessType("internalLab")).toBe(true);
    expect(isInternalLabBusinessType({ businessType: "internalLab" })).toBe(
      true,
    );
    expect(isInternalLabBusinessType({ businessType: "requestor" })).toBe(
      false,
    );
  });

  test("Path B 원청만 있으면 공개 풀·우선창 유지", () => {
    const pathB = { ...openTransfer, targetLabAnchorId: OID_A };
    expect(isAutoMatchOpenPool(pathB, now)).toBe(true);
    expect(isAutoMatchClaimActive(pathB, now)).toBe(false);
    expect(isAutoMatchPriorityActive(pathB, now)).toBe(true);
    expect(canOpenPracticeTransferSubcontract(pathB, OID_A, now)).toBe(true);
    expect(canOpenPracticeTransferSubcontract(pathB, OID_B, now)).toBe(false);
  });

  test("하청 전환(priorityUntil=now) 후 타 기공소 즉시 접근", () => {
    const opened = {
      ...openTransfer,
      targetLabAnchorId: OID_A,
      autoMatch: { ...openTransfer.autoMatch, priorityUntil: now },
    };
    expect(isAutoMatchPriorityActive(opened, now)).toBe(false);
    expect(canAccessAutoMatchOpenPool(opened, OID_B, now)).toBe(true);
    expect(canOpenPracticeTransferSubcontract(opened, OID_A, now)).toBe(false);
  });

  test("assignee가 있으면 claim active — 원청 target만으로는 아님", () => {
    const claimed = {
      ...openTransfer,
      targetLabAnchorId: OID_A,
      assigneeLabAnchorId: OID_B,
      autoMatch: { ...openTransfer.autoMatch, claimedAt: now },
    };
    expect(isAutoMatchClaimActive(claimed, now)).toBe(true);
    expect(isAutoMatchOpenPool(claimed, now)).toBe(false);
    expect(isAutoMatchPriorityActive(claimed, now)).toBe(false);
  });
});

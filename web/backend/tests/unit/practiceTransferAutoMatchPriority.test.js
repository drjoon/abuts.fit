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
  collectSubcontractDirectBlockedLabIds,
  isLabIdBlockedAsDirectPracticeTarget,
  isPracticeTransferSubcontracted,
  isSubcontractFeeScheduleContext,
  isSubcontractIdentityHiddenFromViewer,
  isSubcontractPoolOpen,
  resolveFeeScheduleLabAnchorId,
  resolvePerformingLabAnchorId,
  SUBCONTRACT_PRACTICE_DISPLAY_NAME,
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
    expect(fields.autoMatch.canOpenSubcontract).toBe(false);
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

  test("지정 어벗츠 의뢰는 원청이 하청 전환 가능", () => {
    const direct = {
      matchingMode: "direct",
      status: "active",
      targetLabAnchorId: OID_A,
    };
    expect(canOpenPracticeTransferSubcontract(direct, OID_A, now)).toBe(true);
    expect(canOpenPracticeTransferSubcontract(direct, OID_B, now)).toBe(false);
  });

  test("하청 풀을 연 뒤에는 원청이 다시 하청 전환할 수 없음", () => {
    const opened = {
      matchingMode: "direct",
      status: "active",
      targetLabAnchorId: OID_A,
      autoMatch: {
        subcontractPoolOpen: true,
        eligibleLabAnchorIds: [OID_B],
      },
    };
    expect(canOpenPracticeTransferSubcontract(opened, OID_A, now)).toBe(false);
    expect(canOpenPracticeTransferSubcontract(opened, OID_B, now)).toBe(false);
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

  test("하청 풀·수행 중에는 원청 수가표를 쓴다", () => {
    const poolOpen = {
      matchingMode: "direct",
      status: "active",
      targetLabAnchorId: OID_A,
      autoMatch: { subcontractPoolOpen: true },
    };
    const subcontracted = {
      matchingMode: "direct",
      status: "active",
      targetLabAnchorId: OID_A,
      assigneeLabAnchorId: OID_B,
    };
    expect(isSubcontractFeeScheduleContext(poolOpen)).toBe(true);
    expect(isSubcontractFeeScheduleContext(subcontracted)).toBe(true);
    expect(resolveFeeScheduleLabAnchorId(subcontracted)).toBe(OID_A);
    expect(resolveFeeScheduleLabAnchorId(subcontracted)).not.toBe(OID_B);
  });

  test("하청 식별 정보 — 원청만 assignee·치과 실명", () => {
    const poolOpen = {
      matchingMode: "direct",
      status: "active",
      targetLabAnchorId: OID_A,
      assigneeLabAnchorId: OID_B,
      assigneeLabName: "협력 기공소",
      autoMatch: { subcontractPoolOpen: false },
    };
    expect(isSubcontractIdentityHiddenFromViewer(poolOpen, OID_B)).toBe(true);
    expect(isSubcontractIdentityHiddenFromViewer(poolOpen, OID_A)).toBe(false);

    const fieldsForPartner = toAutoMatchApiFieldsCore(poolOpen, OID_B);
    expect(fieldsForPartner.assigneeLabAnchorId).toBeUndefined();
    expect(fieldsForPartner.autoMatch?.subcontracted).toBe(true);

    const fieldsForPrime = toAutoMatchApiFieldsCore(poolOpen, OID_A);
    expect(fieldsForPrime.assigneeLabAnchorId).toBe(OID_B);
    expect(fieldsForPrime.assigneeLabName).toBe("협력 기공소");
  });

  test("하청 풀 openPool에 subcontractPoolOpen 포함", () => {
    const opened = {
      matchingMode: "direct",
      status: "active",
      targetLabAnchorId: OID_A,
      autoMatch: { subcontractPoolOpen: true },
    };
    const fields = toAutoMatchApiFieldsCore(opened, OID_B);
    expect(fields.autoMatch?.openPool).toBe(true);
    expect(isSubcontractIdentityHiddenFromViewer(opened, OID_B)).toBe(true);
    expect(SUBCONTRACT_PRACTICE_DISPLAY_NAME).toBe("비공개");
  });

  test("하청 수행 이력이 있는 기공소는 지정 대상에서 제외", () => {
    const blocked = collectSubcontractDirectBlockedLabIds([
      {
        targetLabAnchorId: OID_A,
        assigneeLabAnchorId: OID_B,
      },
      {
        targetLabAnchorId: OID_A,
        assigneeLabAnchorId: OID_A,
      },
    ]);
    expect(blocked).toEqual([OID_B]);
    expect(isLabIdBlockedAsDirectPracticeTarget(OID_B, blocked)).toBe(true);
    expect(isLabIdBlockedAsDirectPracticeTarget(OID_A, blocked)).toBe(false);
  });
});

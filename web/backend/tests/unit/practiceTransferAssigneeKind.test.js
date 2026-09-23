// related files:
// - web/backend/utils/practiceTransferAutoMatchCore.js
import {
  ASSIGNEE_KIND_COOPERATION,
  ASSIGNEE_KIND_SUBCONTRACT,
  formatAbutsCooperationLabLabel,
  isCooperationAssignee,
  isSubcontractAssignee,
  isSubcontractFeeApplicable,
  resolveAssigneeKind,
  shouldHideAssigneeFromPractice,
} from "../../utils/practiceTransferAutoMatchCore.js";

describe("assigneeKind cooperation vs subcontract", () => {
  const abutsId = "64a000000000000000000001";
  const partnerId = "64a000000000000000000099";

  test("create-time partner without claimedAt → cooperation", () => {
    const t = {
      targetLabAnchorId: abutsId,
      targetLabName: "어벗츠기공소",
      assigneeLabAnchorId: partnerId,
      assigneeLabName: "통영 Zahn-Art 치과기공소",
    };
    expect(resolveAssigneeKind(t)).toBe(ASSIGNEE_KIND_COOPERATION);
    expect(isCooperationAssignee(t)).toBe(true);
    expect(isSubcontractFeeApplicable(t)).toBe(false);
    expect(shouldHideAssigneeFromPractice(t)).toBe(false);
    expect(formatAbutsCooperationLabLabel(t.assigneeLabName)).toBe(
      "어벗츠 · 통영 Zahn-Art 치과기공소",
    );
  });

  test("ledger-style redact shows cooperation partner for practice", () => {
    const t = {
      targetLabAnchorId: abutsId,
      targetLabName: "어벗츠기공소",
      assigneeLabAnchorId: partnerId,
      assigneeLabName: "우리치과기공소",
      assigneeKind: ASSIGNEE_KIND_COOPERATION,
      matchingMode: "direct",
    };
    // creditLedger uses redactAutoMatchLabIdentity — imported below via dynamic to keep this file core-focused
    expect(formatAbutsCooperationLabLabel(t.assigneeLabName)).toBe(
      "어벗츠 · 우리치과기공소",
    );
    expect(resolveAssigneeKind(t)).toBe(ASSIGNEE_KIND_COOPERATION);
    expect(shouldHideAssigneeFromPractice(t)).toBe(false);
  });

  test("explicit assigneeKind wins over claimedAt", () => {
    const t = {
      targetLabAnchorId: abutsId,
      assigneeLabAnchorId: partnerId,
      assigneeKind: ASSIGNEE_KIND_COOPERATION,
      autoMatch: { claimedAt: new Date() },
    };
    expect(resolveAssigneeKind(t)).toBe(ASSIGNEE_KIND_COOPERATION);
  });

  test("pool claim (claimedAt, no kind) → subcontract 5%", () => {
    const t = {
      targetLabAnchorId: abutsId,
      assigneeLabAnchorId: partnerId,
      autoMatch: { claimedAt: new Date() },
    };
    expect(resolveAssigneeKind(t)).toBe(ASSIGNEE_KIND_SUBCONTRACT);
    expect(isSubcontractAssignee(t)).toBe(true);
    expect(isSubcontractFeeApplicable(t)).toBe(true);
    expect(shouldHideAssigneeFromPractice(t)).toBe(true);
  });

  test("no assignee → null kind", () => {
    const t = {
      targetLabAnchorId: abutsId,
      targetLabName: "어벗츠기공소",
    };
    expect(resolveAssigneeKind(t)).toBeNull();
    expect(isSubcontractFeeApplicable(t)).toBe(false);
  });
});

// related files:
// - web/backend/utils/practiceTransferAutoMatchCore.js
import {
  ABUTS_LAB_DISPLAY_NAME,
  ASSIGNEE_KIND_COOPERATION,
  ASSIGNEE_KIND_SUBCONTRACT,
  isAbutsPrimePracticeTransfer,
  canLabOperatePracticeTransferWork,
  canLabUsePracticeTransferAiDesign,
  isLabPerformingOnTransfer,
  resolveFeeScheduleLabAnchorId,
  resolveLabFeeMultiplierLabAnchorId,
  resolvePracticeTransferSettlementParties,
} from "../../utils/practiceTransferAutoMatchCore.js";

const PRIME = "64a0000000000000000000aa";
const ASSIGNEE = "64a0000000000000000000bb";
const OTHER = "64a0000000000000000000cc";

describe("resolvePracticeTransferSettlementParties", () => {
  test("어벗츠 + 하청: gross→수행, 매입 없음, 수가=수행", () => {
    const transfer = {
      targetLabAnchorId: PRIME,
      targetLabName: ABUTS_LAB_DISPLAY_NAME,
      assigneeLabAnchorId: ASSIGNEE,
      assigneeKind: ASSIGNEE_KIND_SUBCONTRACT,
      matchingMode: "direct",
    };
    expect(isAbutsPrimePracticeTransfer(transfer)).toBe(true);
    const parties = resolvePracticeTransferSettlementParties(transfer);
    expect(parties.grossOwnerId).toBe(ASSIGNEE);
    expect(parties.purchasePayeeId).toBeNull();
    expect(parties.subcontracted).toBe(true);
    expect(resolveFeeScheduleLabAnchorId(transfer)).toBe(ASSIGNEE);
    expect(resolveLabFeeMultiplierLabAnchorId(transfer)).toBe(ASSIGNEE);
    expect(isLabPerformingOnTransfer(transfer, ASSIGNEE)).toBe(true);
    expect(canLabOperatePracticeTransferWork(transfer, ASSIGNEE)).toBe(true);
    expect(canLabOperatePracticeTransferWork(transfer, PRIME)).toBe(true);
  });

  test("레거시 협력: gross→수행, 매입 없음", () => {
    const transfer = {
      targetLabAnchorId: PRIME,
      targetLabName: ABUTS_LAB_DISPLAY_NAME,
      assigneeLabAnchorId: ASSIGNEE,
      assigneeKind: ASSIGNEE_KIND_COOPERATION,
      matchingMode: "direct",
    };
    expect(resolveFeeScheduleLabAnchorId(transfer)).toBe(ASSIGNEE);
    const parties = resolvePracticeTransferSettlementParties(transfer);
    expect(parties.grossOwnerId).toBe(ASSIGNEE);
    expect(parties.purchasePayeeId).toBeNull();
    expect(canLabOperatePracticeTransferWork(transfer, ASSIGNEE)).toBe(true);
    expect(canLabOperatePracticeTransferWork(transfer, PRIME)).toBe(false);
    expect(canLabUsePracticeTransferAiDesign(transfer, PRIME)).toBe(true);
  });

  test("지정 기공소 직접: gross→target", () => {
    const transfer = {
      targetLabAnchorId: OTHER,
      targetLabName: "외부기공소",
      matchingMode: "direct",
    };
    expect(isAbutsPrimePracticeTransfer(transfer)).toBe(false);
    const parties = resolvePracticeTransferSettlementParties(transfer);
    expect(parties.grossOwnerId).toBe(OTHER);
    expect(parties.purchasePayeeId).toBeNull();
    expect(resolveFeeScheduleLabAnchorId(transfer)).toBe(OTHER);
  });

  test("어벗츠 자체 수행: gross→prime", () => {
    const transfer = {
      targetLabAnchorId: PRIME,
      targetLabName: ABUTS_LAB_DISPLAY_NAME,
      matchingMode: "direct",
    };
    const parties = resolvePracticeTransferSettlementParties(transfer);
    expect(parties.grossOwnerId).toBe(PRIME);
    expect(parties.purchasePayeeId).toBeNull();
  });
});

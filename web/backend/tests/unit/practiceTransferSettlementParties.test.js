// related files:
// - web/backend/utils/practiceTransferAutoMatchCore.js
import {
  ABUTS_LAB_DISPLAY_NAME,
  ASSIGNEE_KIND_COOPERATION,
  ASSIGNEE_KIND_SUBCONTRACT,
  isAbutsPrimePracticeTransfer,
  isLabPerformingOnTransfer,
  resolveFeeScheduleLabAnchorId,
  resolveLabFeeMultiplierLabAnchorId,
  resolvePracticeTransferSettlementParties,
} from "../../utils/practiceTransferAutoMatchCore.js";

const PRIME = "64a0000000000000000000aa";
const ASSIGNEE = "64a0000000000000000000bb";
const OTHER = "64a0000000000000000000cc";

describe("resolvePracticeTransferSettlementParties", () => {
  test("어벗츠 원청 + 하청: gross→prime, purchase→assignee, 수가·할증=원청", () => {
    const transfer = {
      targetLabAnchorId: PRIME,
      targetLabName: ABUTS_LAB_DISPLAY_NAME,
      assigneeLabAnchorId: ASSIGNEE,
      assigneeKind: ASSIGNEE_KIND_SUBCONTRACT,
      matchingMode: "direct",
    };
    expect(isAbutsPrimePracticeTransfer(transfer)).toBe(true);
    const parties = resolvePracticeTransferSettlementParties(transfer);
    expect(parties.grossOwnerId).toBe(PRIME);
    expect(parties.purchasePayeeId).toBe(ASSIGNEE);
    expect(parties.subcontracted).toBe(true);
    expect(resolveFeeScheduleLabAnchorId(transfer)).toBe(PRIME);
    expect(resolveLabFeeMultiplierLabAnchorId(transfer)).toBe(PRIME);
    expect(isLabPerformingOnTransfer(transfer, ASSIGNEE)).toBe(true);
    expect(isLabPerformingOnTransfer(transfer, PRIME)).toBe(false);
  });

  test("어벗츠 원청 + 협력: 수가·할증=수행, 정산 gross→prime·purchase→assignee", () => {
    const transfer = {
      targetLabAnchorId: PRIME,
      targetLabName: ABUTS_LAB_DISPLAY_NAME,
      assigneeLabAnchorId: ASSIGNEE,
      assigneeKind: ASSIGNEE_KIND_COOPERATION,
      matchingMode: "direct",
    };
    expect(resolveFeeScheduleLabAnchorId(transfer)).toBe(ASSIGNEE);
    expect(resolveLabFeeMultiplierLabAnchorId(transfer)).toBe(ASSIGNEE);
    const parties = resolvePracticeTransferSettlementParties(transfer);
    expect(parties.grossOwnerId).toBe(PRIME);
    expect(parties.purchasePayeeId).toBe(ASSIGNEE);
  });

  test("어벗츠 자체 수행: gross→prime, 매입 없음, 수가·할증=원청", () => {
    const transfer = {
      targetLabAnchorId: PRIME,
      targetLabName: ABUTS_LAB_DISPLAY_NAME,
      matchingMode: "direct",
    };
    const parties = resolvePracticeTransferSettlementParties(transfer);
    expect(parties.grossOwnerId).toBe(PRIME);
    expect(parties.purchasePayeeId).toBeNull();
    expect(isLabPerformingOnTransfer(transfer, PRIME)).toBe(true);
    expect(resolveFeeScheduleLabAnchorId(transfer)).toBe(PRIME);
    expect(resolveLabFeeMultiplierLabAnchorId(transfer)).toBe(PRIME);
  });

  test("레거시 외부 직접 지정: gross→performing, 수가·할증=수행", () => {
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
    expect(resolveLabFeeMultiplierLabAnchorId(transfer)).toBe(OTHER);
  });
});

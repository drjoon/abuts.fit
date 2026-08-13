// related files:
// - web/backend/utils/labFeeSchedule.js
import {
  computePracticeTransferRetailFees,
  LAB_FEE_SCHEDULE_DEFAULTS,
  resolveLabFeeKeyFromProsthesisType,
} from "../../utils/labFeeSchedule.js";

describe("labFeeSchedule", () => {
  test("작업X는 과금 키가 없다", () => {
    expect(resolveLabFeeKeyFromProsthesisType("작업X")).toBeNull();
    expect(resolveLabFeeKeyFromProsthesisType("상실치")).toBeNull();
  });

  test("치식별 기공비·어벗 소매가를 합산한다", () => {
    const fees = computePracticeTransferRetailFees({
      toothWorks: [
        { toothNumber: "16", prosthesisType: "크라운", customAbutment: true },
        { toothNumber: "26", prosthesisType: "브리지" },
        { toothNumber: "27", prosthesisType: "작업X" },
      ],
      labFeeSchedule: LAB_FEE_SCHEDULE_DEFAULTS,
      abutmentRetailPrice: 40000,
    });
    expect(fees.labFeeTotal).toBe(120000);
    expect(fees.abutmentRetailTotal).toBe(40000);
    expect(fees.abutmentQty).toBe(1);
    expect(fees.total).toBe(160000);
    expect(fees.lines).toHaveLength(2);
  });
});

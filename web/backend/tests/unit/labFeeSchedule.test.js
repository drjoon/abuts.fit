// related files:
// - web/backend/utils/labFeeSchedule.js
import {
  computePracticeTransferRetailFees,
  LAB_FEE_SCHEDULE_DEFAULTS,
  LAB_FEE_SCHEDULE_ZEROS,
  resolveLabFeeKeyFromProsthesisType,
  splitPracticeTransferSettlement,
} from "../../utils/labFeeSchedule.js";

describe("labFeeSchedule", () => {
  test("작업X는 과금 키가 없다", () => {
    expect(resolveLabFeeKeyFromProsthesisType("작업X")).toBeNull();
    expect(resolveLabFeeKeyFromProsthesisType("상실치")).toBeNull();
  });

  test("커스텀어벗은 기공소 수가 키가 없다", () => {
    expect(resolveLabFeeKeyFromProsthesisType("커스텀어벗")).toBeNull();
    expect(resolveLabFeeKeyFromProsthesisType("어벗 디자인")).toBeNull();
  });

  test("인레이·크라운은 기공비만 합산한다", () => {
    const fees = computePracticeTransferRetailFees({
      toothWorks: [
        { toothNumber: "16", prosthesisType: "크라운" },
        { toothNumber: "26", prosthesisType: "브리지" },
        { toothNumber: "27", prosthesisType: "작업X" },
      ],
      labFeeSchedule: LAB_FEE_SCHEDULE_DEFAULTS,
      abutmentPricingTier: "regular",
    });
    expect(fees.labFeeTotal).toBe(120000);
    expect(fees.abutmentRetailTotal).toBe(0);
    expect(fees.abutmentQty).toBe(0);
    expect(fees.total).toBe(120000);
    expect(fees.lines).toHaveLength(2);
  });

  test("커스텀어벗은 어벗츠 일반 단가를 쓴다", () => {
    const fees = computePracticeTransferRetailFees({
      toothWorks: [
        {
          toothNumber: "16",
          prosthesisType: "커스텀어벗",
          customAbutment: true,
          abutmentProductMode: "custom_abutment",
        },
        {
          toothNumber: "26",
          prosthesisType: "커스텀어벗",
          customAbutment: true,
          abutmentProductMode: "design_custom_abutment",
        },
      ],
      labFeeSchedule: LAB_FEE_SCHEDULE_DEFAULTS,
      abutmentPricingTier: "regular",
    });
    expect(fees.labFeeTotal).toBe(0);
    expect(fees.abutmentRetailTotal).toBe(60000);
    expect(fees.abutmentQty).toBe(2);
    expect(fees.total).toBe(60000);
  });

  test("커스텀어벗은 어벗츠 멤버십 단가를 쓴다", () => {
    const fees = computePracticeTransferRetailFees({
      toothWorks: [
        {
          toothNumber: "16",
          prosthesisType: "커스텀어벗",
          customAbutment: true,
          abutmentProductMode: "custom_abutment",
        },
        {
          toothNumber: "26",
          prosthesisType: "커스텀어벗",
          customAbutment: true,
          abutmentProductMode: "design_custom_abutment",
        },
      ],
      labFeeSchedule: LAB_FEE_SCHEDULE_ZEROS,
      abutmentPricingTier: "membership",
    });
    expect(fees.labFeeTotal).toBe(0);
    expect(fees.abutmentRetailTotal).toBe(40000);
    expect(fees.total).toBe(40000);
  });

  test("리메이크는 기공소 리메이크 수가를 쓰고 어벗 단가는 제외한다", () => {
    const fees = computePracticeTransferRetailFees({
      toothWorks: [
        { toothNumber: "16", prosthesisType: "크라운" },
        { toothNumber: "26", prosthesisType: "브리지" },
      ],
      labFeeSchedule: {
        ...LAB_FEE_SCHEDULE_DEFAULTS,
        remake: {
          crown: 20000,
          bridge: 15000,
          inlay: 0,
          pontic: 0,
          customAbutmentDesign: 0,
          customAbutmentDesignAndProduction: 0,
        },
      },
      remake: true,
    });
    expect(fees.labFeeTotal).toBe(35000);
    expect(fees.abutmentRetailTotal).toBe(0);
    expect(fees.total).toBe(35000);
  });

  test("기공비 수수료와 어벗츠 단가를 분리한다", () => {
    const split = splitPracticeTransferSettlement({
      labFeeTotal: 100000,
      abutmentRetailTotal: 20000,
      feeRateApplied: 0.25,
    });
    expect(split.labSettlementAmount).toBe(75000);
    expect(split.abutsRevenueAmount).toBe(45000);
    expect(split.total).toBe(120000);
  });
});

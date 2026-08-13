// related files:
// - web/backend/utils/labFeeSchedule.js
// - 2026-08-13: 견적 라인 치아번호 10→20→30→40번대 정렬.
import {
  buildUnsetLabFeeSchedule,
  computePracticeTransferRetailFees,
  isLabFeeScheduleConfigured,
  LAB_FEE_SCHEDULE_SAMPLE,
  LAB_FEE_SCHEDULE_ZEROS,
  normalizeLabFeeItems,
  resolveLabFeeKeyFromProsthesisType,
  resolveLabFeeScheduleSource,
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
      labFeeSchedule: LAB_FEE_SCHEDULE_SAMPLE,
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
      labFeeSchedule: LAB_FEE_SCHEDULE_SAMPLE,
      abutmentPricingTier: "regular",
    });
    expect(fees.labFeeTotal).toBe(0);
    expect(fees.abutmentRetailTotal).toBe(60000);
    expect(fees.abutmentQty).toBe(2);
    expect(fees.total).toBe(60000);
  });

  test("크라운·브리지+어벗은 기공수가와 어벗츠 단가를 함께 합산한다", () => {
    const fees = computePracticeTransferRetailFees({
      toothWorks: [
        {
          toothNumber: "11",
          prosthesisType: "커스텀어벗",
          customAbutment: true,
          abutmentProductMode: "design_custom_abutment",
        },
        {
          toothNumber: "21",
          prosthesisType: "브리지",
          customAbutment: true,
          abutmentProductMode: "design_custom_abutment",
        },
        {
          toothNumber: "22",
          prosthesisType: "브리지",
          customAbutment: true,
          abutmentProductMode: "custom_abutment",
        },
        {
          toothNumber: "23",
          prosthesisType: "크라운",
          customAbutment: true,
          abutmentProductMode: "design_custom_abutment",
        },
      ],
      labFeeSchedule: LAB_FEE_SCHEDULE_SAMPLE,
      abutmentPricingTier: "membership",
    });
    expect(fees.labFeeTotal).toBe(180000);
    expect(fees.abutmentRetailTotal).toBe(90000);
    expect(fees.abutmentQty).toBe(4);
    expect(fees.total).toBe(270000);
    const byTooth = Object.fromEntries(
      fees.lines.map((line) => [line.toothNumber, line]),
    );
    expect(byTooth["11"]).toMatchObject({ labFee: 0, abutmentRetail: 25000 });
    expect(byTooth["21"]).toMatchObject({ labFee: 60000, abutmentRetail: 25000 });
    expect(byTooth["22"]).toMatchObject({ labFee: 60000, abutmentRetail: 15000 });
    expect(byTooth["23"]).toMatchObject({ labFee: 60000, abutmentRetail: 25000 });
  });

  test("리메이크 크라운+어벗은 크라운 리메이크 수가만 쓴다", () => {
    const fees = computePracticeTransferRetailFees({
      toothWorks: [
        {
          toothNumber: "16",
          prosthesisType: "크라운",
          customAbutment: true,
          abutmentProductMode: "design_custom_abutment",
        },
      ],
      labFeeSchedule: {
        ...LAB_FEE_SCHEDULE_SAMPLE,
        remake: {
          crown: 20000,
          bridge: 0,
          inlay: 0,
          pontic: 0,
          customAbutmentDesign: 0,
          customAbutmentDesignAndProduction: 5000,
        },
      },
      remake: true,
    });
    expect(fees.labFeeTotal).toBe(20000);
    expect(fees.abutmentRetailTotal).toBe(0);
    expect(fees.total).toBe(20000);
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
        ...LAB_FEE_SCHEDULE_SAMPLE,
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

  test("기본 수가의 임시치아는 3치·6치 카드로 분리된다", () => {
    const items = normalizeLabFeeItems(LAB_FEE_SCHEDULE_SAMPLE);
    const temps = items.filter((item) => item.name === "임시치아");
    expect(temps).toHaveLength(2);
    expect(temps[0]).toMatchObject({
      name: "임시치아",
      unit: "perNTeeth",
    });
    expect(temps[0].tiers[0]).toMatchObject({ n: 3, price: 30000, remake: 0 });
    expect(temps[1]).toMatchObject({
      name: "임시치아",
      unit: "perNTeeth",
    });
    expect(temps[1].tiers[0]).toMatchObject({ n: 6, price: 50000, remake: 0 });
  });

  test("임시치아1·임시치아2 카드는 의뢰서 임시치아에 구간으로 합산한다", () => {
    const fees = computePracticeTransferRetailFees({
      toothWorks: [
        { toothNumber: "16", prosthesisType: "임시치아" },
        { toothNumber: "15", prosthesisType: "임시치아" },
        { toothNumber: "14", prosthesisType: "임시치아" },
        { toothNumber: "13", prosthesisType: "임시치아" },
      ],
      labFeeSchedule: {
        items: [
          {
            id: "temp1",
            name: "임시치아1",
            unit: "perNTeeth",
            price: 30000,
            remake: 0,
            enabled: true,
            tiers: [{ n: 3, price: 30000, remake: 0 }],
          },
          {
            id: "temp2",
            name: "임시치아2",
            unit: "perNTeeth",
            price: 50000,
            remake: 0,
            enabled: true,
            tiers: [{ n: 6, price: 50000, remake: 0 }],
          },
        ],
      },
    });
    expect(fees.labFeeTotal).toBe(50000);
  });

  test("한 항목에 묶인 임시치아 구간도 카드 분리 후 동일하게 합산한다", () => {
    const fees = computePracticeTransferRetailFees({
      toothWorks: [
        { toothNumber: "16", prosthesisType: "임시치아" },
        { toothNumber: "15", prosthesisType: "임시치아" },
        { toothNumber: "14", prosthesisType: "임시치아" },
        { toothNumber: "13", prosthesisType: "임시치아" },
      ],
      labFeeSchedule: {
        items: [
          {
            id: "temp",
            name: "임시치아",
            unit: "perNTeeth",
            enabled: true,
            price: 30000,
            remake: 0,
            tiers: [
              { n: 3, price: 30000, remake: 0 },
              { n: 6, price: 50000, remake: 0 },
            ],
          },
        ],
      },
    });
    expect(fees.labFeeTotal).toBe(50000);
  });

  test("유지장치는 연결 없으면 악궁당 1세트, 임시치아는 치아 수 구간으로 합산한다", () => {
    expect(resolveLabFeeKeyFromProsthesisType("유지장치")).toBe("retainer");
    expect(resolveLabFeeKeyFromProsthesisType("임시치아")).toBeNull();
    const fees = computePracticeTransferRetailFees({
      toothWorks: [
        { toothNumber: "11", prosthesisType: "유지장치" },
        { toothNumber: "21", prosthesisType: "유지장치" },
        { toothNumber: "31", prosthesisType: "유지장치" },
        { toothNumber: "16", prosthesisType: "임시치아" },
        { toothNumber: "15", prosthesisType: "임시치아" },
        { toothNumber: "14", prosthesisType: "임시치아" },
        { toothNumber: "13", prosthesisType: "임시치아" },
      ],
      labFeeSchedule: LAB_FEE_SCHEDULE_SAMPLE,
      abutmentPricingTier: "regular",
    });
    expect(fees.labFeeTotal).toBe(130000);
    expect(fees.abutmentRetailTotal).toBe(0);
    expect(fees.total).toBe(130000);
  });

  test("유지장치·임시치아에 남은 커스텀 플래그는 어벗 과금하지 않는다", () => {
    const fees = computePracticeTransferRetailFees({
      toothWorks: [
        {
          toothNumber: "16",
          prosthesisType: "유지장치",
          customAbutment: true,
          abutmentProductMode: "design_custom_abutment",
          bridgeLinkedTeeth: ["15"],
        },
        {
          toothNumber: "15",
          prosthesisType: "임시치아",
          customAbutment: true,
          bridgeLinkedTeeth: ["16"],
        },
      ],
      labFeeSchedule: LAB_FEE_SCHEDULE_SAMPLE,
      abutmentPricingTier: "regular",
    });
    expect(fees.abutmentRetailTotal).toBe(0);
    expect(fees.abutmentQty).toBe(0);
  });

  test("유지장치는 같은 악궁이어도 연결이 끊기면 스팬당 1세트다", () => {
    const fees = computePracticeTransferRetailFees({
      toothWorks: [
        { toothNumber: "43", prosthesisType: "유지장치", bridgeLinkedTeeth: ["42"] },
        { toothNumber: "42", prosthesisType: "유지장치", bridgeLinkedTeeth: ["43", "41"] },
        { toothNumber: "41", prosthesisType: "유지장치", bridgeLinkedTeeth: ["42"] },
        { toothNumber: "31", prosthesisType: "유지장치", bridgeLinkedTeeth: ["32"] },
        { toothNumber: "32", prosthesisType: "유지장치", bridgeLinkedTeeth: ["31", "33"] },
        { toothNumber: "33", prosthesisType: "유지장치", bridgeLinkedTeeth: ["32"] },
      ],
      labFeeSchedule: LAB_FEE_SCHEDULE_SAMPLE,
      abutmentPricingTier: "regular",
    });
    expect(fees.labFeeTotal).toBe(80000);
    expect(fees.lines.filter((line) => String(line.prosthesisType).includes("유지장치"))).toHaveLength(2);
  });

  test("커스텀 수가 항목은 이름·단위로 청구한다", () => {
    const fees = computePracticeTransferRetailFees({
      toothWorks: [
        { toothNumber: "11", prosthesisType: "덴쳐" },
        { toothNumber: "21", prosthesisType: "덴쳐" },
        { toothNumber: "16", prosthesisType: "크라운" },
      ],
      labFeeSchedule: {
        items: [
          { id: "denture", name: "덴쳐", unit: "perSet", price: 80000, remake: 0, enabled: true },
          { id: "crown", name: "크라운", unit: "perTooth", price: 10000, remake: 0, enabled: true },
        ],
      },
    });
    expect(fees.labFeeTotal).toBe(90000);
    expect(fees.lines).toHaveLength(2);
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

  test("마스터 active가 켜져야 기공비 설정 완료다", () => {
    expect(isLabFeeScheduleConfigured(null)).toBe(false);
    expect(isLabFeeScheduleConfigured({})).toBe(false);
    expect(isLabFeeScheduleConfigured({ updatedAt: null })).toBe(false);
    expect(isLabFeeScheduleConfigured({ updatedAt: new Date() })).toBe(true);
    expect(isLabFeeScheduleConfigured({ active: false, updatedAt: new Date() })).toBe(
      false,
    );
    expect(isLabFeeScheduleConfigured({ active: true })).toBe(true);
  });

  test("견적 라인은 치아번호 10·20·30·40번대 순이다", () => {
    const fees = computePracticeTransferRetailFees({
      toothWorks: [
        { toothNumber: "33", prosthesisType: "브리지" },
        { toothNumber: "22", prosthesisType: "크라운" },
        { toothNumber: "43", prosthesisType: "브리지" },
        {
          toothNumber: "23",
          prosthesisType: "커스텀어벗",
          customAbutment: true,
          abutmentProductMode: "custom_abutment",
        },
        { toothNumber: "42", prosthesisType: "Pontic" },
        { toothNumber: "41", prosthesisType: "Pontic" },
        { toothNumber: "31", prosthesisType: "Pontic" },
        { toothNumber: "32", prosthesisType: "Pontic" },
      ],
      labFeeSchedule: LAB_FEE_SCHEDULE_SAMPLE,
      abutmentPricingTier: "regular",
    });
    expect(fees.lines.map((line) => line.toothNumber)).toEqual([
      "22",
      "23",
      "31",
      "32",
      "33",
      "41",
      "42",
      "43",
    ]);
  });

  test("미설정 스케줄은 0원·전부 미제공이다", () => {
    const items = normalizeLabFeeItems(buildUnsetLabFeeSchedule());
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.enabled === false)).toBe(true);
    expect(items.every((item) => item.price === 0)).toBe(true);
    const fees = computePracticeTransferRetailFees({
      toothWorks: [
        { toothNumber: "16", prosthesisType: "크라운" },
        { toothNumber: "26", prosthesisType: "브리지" },
      ],
      labFeeSchedule: resolveLabFeeScheduleSource({ crown: 60000 }),
    });
    expect(fees.labFeeTotal).toBe(0);
  });
});

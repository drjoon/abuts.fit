// related files:
// - web/backend/utils/labFeeSchedule.js
// - 2026-08-25: 심플어벗은 기공소 어벗 수가·견적에서 제외.
// - 2026-08-24: 커스텀어벗 수가 perSet·0원 저장이어도 normalize로 perTooth 강제·단가 반영.
// - 2026-08-23: 커스텀어벗 수가 지그포함(4만)·지그제외(3만) 분리.
// - 2026-08-21: PTX CA 치과=기공소 수가. 어벗츠 1.5/2.5만은 기공소→어벗츠.
// - 2026-08-13: 견적 라인 치아번호 10→20→30→40번대 정렬.
// - 2026-08-17: 번대 안은 정중선 가운데(18→11, 21→28, 38→31, 41→48).
// - 2026-08-14: 환봉 요청중은 기공소 어벗, 도입·CNC도 기공소 어벗 수가.
// - 2026-08-15: 치아 미선택 자리표시 행은 견적 0원.
// - 2026-08-19: 마스터 On + 제공 항목 수가여야 청구 준비.
// - 2026-08-19: 임시치아+어벗은 임시치아 수가와 기공소 어벗 수가를 함께 합산.
// - 2026-08-19: 임시치아 어벗은 치아별 커스텀어벗 단가 줄로 분리.
// - 2026-08-21: 크라운·브리지·인레이+어벗도 보철 줄과 커스텀어벗 줄을 분리.
// - 2026-08-19: 같은 악궁 임시치아도 연결이 끊기면 스팬별 구간 수가.
// - 2026-08-20: Pontic 수가 제거. 레거시 Pontic 치아는 브리지. 임시치아 스팬의 구 Pontic은 세트에 포함.
import {
  buildUnsetLabFeeSchedule,
  computePracticeTransferRetailFees,
  isLabFeeScheduleConfigured,
  isLabFeeScheduleReadyToCharge,
  hasEnabledLabFeePrices,
  toothWorksNeedLabFee,
  missingLabFeeItemNames,
  isPendingRoundBarAbutment,
  isLabFeeShippingItem,
  LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME,
  LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_NAME,
  LAB_FEE_SCHEDULE_SAMPLE,
  LAB_FEE_SCHEDULE_ZEROS,
  normalizeLabFeeItems,
  resolveLabFeeKeyFromProsthesisType,
  resolveLabFeeScheduleSource,
  resolveLabPracticeFeeMultiplierAsOf,
  resolveLabShippingFeeFromSchedule,
  splitPracticeTransferSettlement,
  upsertLabPracticeFeeMultiplierList,
  ensureSplitCustomAbutmentFeeItems,
  mergeEnabledCatalogItemsIntoLabFeeItems,
  resolveLabFeeCatalogNeedSetupNames,
} from "../../utils/labFeeSchedule.js";

describe("labFeeSchedule", () => {
  test("치아번호 없는 자리표시 행은 견적에 넣지 않는다", () => {
    const fees = computePracticeTransferRetailFees({
      toothWorks: [
        { toothNumber: "", prosthesisType: "크라운" },
        { toothNumber: "  ", prosthesisType: "인레이" },
      ],
      labFeeSchedule: LAB_FEE_SCHEDULE_SAMPLE,
    });
    expect(fees.labFeeTotal).toBe(0);
    expect(fees.total).toBe(0);
    expect(fees.lines).toEqual([]);
  });

  test("치과별 기공수가 할증은 기공비·기공소 어벗만 배수한다", () => {
    const fees = computePracticeTransferRetailFees({
      toothWorks: [
        { toothNumber: "16", prosthesisType: "크라운" },
        {
          toothNumber: "26",
          prosthesisType: "커스텀어벗",
          customAbutment: true,
          abutmentProductMode: "custom_abutment",
        },
      ],
      labFeeSchedule: LAB_FEE_SCHEDULE_SAMPLE,
      abutmentPricingTier: "regular",
      labFeeMultiplier: 1.5,
    });
    // 크라운 6만·CA 지그제외 3만 ×1.5
    expect(fees.labFeeTotal).toBe(135000);
    expect(fees.labAbutmentTotal).toBe(45000);
    expect(fees.abutmentRetailTotal).toBe(0);
    expect(fees.total).toBe(135000);
    expect(fees.labFeeMultiplier).toBe(1.5);
    expect(fees.lines.find((l) => l.prosthesisType === "크라운")?.labFee).toBe(
      90000,
    );
  });

  test("작업X는 과금 키가 없다", () => {
    expect(resolveLabFeeKeyFromProsthesisType("작업X")).toBeNull();
    expect(resolveLabFeeKeyFromProsthesisType("상실치")).toBeNull();
  });

  test("커스텀어벗은 레거시 보철 수가 키가 없다(항목명으로 매칭)", () => {
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

  test("커스텀어벗(지그제외)은 기공소 수가를 쓴다", () => {
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
    expect(fees.labFeeTotal).toBe(60000);
    expect(fees.labAbutmentTotal).toBe(60000);
    expect(fees.abutmentRetailTotal).toBe(0);
    expect(fees.abutmentQty).toBe(0);
    expect(fees.total).toBe(60000);
  });

  test("심플어벗은 기공소 어벗 수가·견적에서 제외한다", () => {
    const fees = computePracticeTransferRetailFees({
      toothWorks: [
        {
          toothNumber: "16",
          prosthesisType: "커스텀어벗",
          customAbutment: true,
          abutmentManufacturer: "심플어벗",
          abutmentDiameter: "8",
          abutmentHeight: "M",
        },
        {
          toothNumber: "26",
          prosthesisType: "크라운",
          customAbutment: true,
          abutmentManufacturer: "심플밀링",
          abutmentDiameter: "7",
          abutmentHeight: "S",
        },
        {
          toothNumber: "36",
          prosthesisType: "크라운",
          customAbutment: true,
          abutmentManufacturer: "Osstem",
          abutmentDiameter: "4.5",
          abutmentHeight: "5.5",
        },
      ],
      labFeeSchedule: LAB_FEE_SCHEDULE_SAMPLE,
      abutmentPricingTier: "regular",
    });
    // 단독 심플=0 · 크라운+심플=크라운만 · 크라운+스캔바디 CA=크라운+지그포함
    const crown = Math.round(
      Number(
        LAB_FEE_SCHEDULE_SAMPLE.items.find((i) => i.name === "크라운")?.price ||
          0,
      ),
    );
    const withJig = Math.round(
      Number(
        LAB_FEE_SCHEDULE_SAMPLE.items.find(
          (i) => i.name === LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME,
        )?.price || 0,
      ),
    );
    expect(fees.labAbutmentTotal).toBe(withJig);
    expect(fees.labFeeTotal).toBe(crown * 2 + withJig);
    expect(fees.abutmentRetailTotal).toBe(0);
    expect(
      fees.lines.some(
        (l) =>
          l.toothNumber === "16" &&
          (l.labAbutmentFee > 0 || l.labFee > 0),
      ),
    ).toBe(false);
    expect(
      fees.lines.find((l) => l.toothNumber === "26" && l.prosthesisType === "크라운")
        ?.labFee,
    ).toBe(crown);
    expect(
      fees.lines.some(
        (l) => l.toothNumber === "26" && l.labAbutmentFee > 0,
      ),
    ).toBe(false);
    expect(
      fees.lines.find(
        (l) =>
          l.toothNumber === "36" &&
          l.prosthesisType === LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME,
      )?.labAbutmentFee,
    ).toBe(withJig);
  });

  test("크라운·브리지+어벗은 지그포함, 단독 CA는 지그제외 수가를 쓴다", () => {
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
    expect(fees.labFeeTotal).toBe(330000);
    expect(fees.labAbutmentTotal).toBe(150000);
    expect(fees.abutmentRetailTotal).toBe(0);
    expect(fees.abutmentQty).toBe(0);
    expect(fees.total).toBe(330000);
    expect(fees.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          toothNumber: "11",
          prosthesisType: LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_NAME,
          labFee: 0,
          labAbutmentFee: 30000,
          abutmentRetail: 0,
        }),
        expect.objectContaining({
          toothNumber: "21",
          prosthesisType: "브리지",
          labFee: 60000,
          labAbutmentFee: 0,
        }),
        expect.objectContaining({
          toothNumber: "21",
          prosthesisType: LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME,
          labFee: 0,
          labAbutmentFee: 40000,
        }),
        expect.objectContaining({
          toothNumber: "22",
          prosthesisType: "브리지",
          labFee: 60000,
          labAbutmentFee: 0,
        }),
        expect.objectContaining({
          toothNumber: "22",
          prosthesisType: LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME,
          labFee: 0,
          labAbutmentFee: 40000,
        }),
        expect.objectContaining({
          toothNumber: "23",
          prosthesisType: "크라운",
          labFee: 60000,
          labAbutmentFee: 0,
        }),
        expect.objectContaining({
          toothNumber: "23",
          prosthesisType: LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME,
          labFee: 0,
          labAbutmentFee: 40000,
        }),
      ]),
    );
  });

  test("커스텀어벗(지그포함)이 perSet로 저장돼도 치아당 단가로 과금한다", () => {
    const fees = computePracticeTransferRetailFees({
      toothWorks: [
        {
          toothNumber: "37",
          prosthesisType: "크라운",
          customAbutment: true,
          abutmentProductMode: "design_custom_abutment",
        },
      ],
      labFeeSchedule: {
        items: [
          {
            id: "crown",
            name: "크라운",
            unit: "perTooth",
            enabled: true,
            price: 60000,
            remake: 0,
            tiers: [],
          },
          {
            id: "customAbutmentWithoutJig",
            name: LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_NAME,
            unit: "perTooth",
            enabled: true,
            price: 30000,
            remake: 0,
            tiers: [],
          },
          {
            id: "broken-with-jig",
            name: LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME,
            unit: "perSet",
            enabled: true,
            price: 40000,
            remake: 0,
            tiers: [],
          },
        ],
      },
    });
    const items = normalizeLabFeeItems({
      items: [
        {
          id: "broken-with-jig",
          name: LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME,
          unit: "perSet",
          enabled: true,
          price: 40000,
          remake: 0,
          tiers: [],
        },
      ],
    });
    expect(items.find((i) => i.name === LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME)?.unit).toBe(
      "perTooth",
    );
    expect(fees.labFeeTotal).toBe(100000);
    expect(fees.labAbutmentTotal).toBe(40000);
    expect(fees.total).toBe(100000);
    expect(fees.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          toothNumber: "37",
          prosthesisType: "크라운",
          labFee: 60000,
        }),
        expect.objectContaining({
          toothNumber: "37",
          prosthesisType: LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME,
          labAbutmentFee: 40000,
        }),
      ]),
    );
  });

  test("items에 보철만 있어도 flat 커스텀어벗 단가로 어벗을 과금한다", () => {
    const fees = computePracticeTransferRetailFees({
      toothWorks: [
        {
          toothNumber: "37",
          prosthesisType: "크라운",
          customAbutment: true,
          abutmentProductMode: "design_custom_abutment",
        },
      ],
      labFeeSchedule: {
        customAbutmentDesignAndProduction: 35000,
        enabled: { customAbutmentDesignAndProduction: true },
        items: [
          {
            id: "crown",
            name: "크라운",
            unit: "perTooth",
            enabled: true,
            price: 60000,
            remake: 0,
            tiers: [],
          },
        ],
      },
    });
    expect(fees.labAbutmentTotal).toBe(35000);
    expect(fees.total).toBe(95000);
    expect(fees.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          prosthesisType: LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME,
          labAbutmentFee: 35000,
        }),
      ]),
    );
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

  test("커스텀어벗 수가가 0원이면 어벗츠 단가로 대체하지 않는다", () => {
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
    expect(fees.abutmentRetailTotal).toBe(0);
    expect(fees.total).toBe(0);
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

  test("유지장치에 남은 커스텀 플래그는 어벗 과금하지 않는다", () => {
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
          prosthesisType: "유지장치",
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

  test("임시치아+어벗은 임시치아 수가와 기공소 어벗 수가를 함께 합산한다", () => {
    const fees = computePracticeTransferRetailFees({
      toothWorks: [
        {
          toothNumber: "33",
          prosthesisType: "임시치아",
          customAbutment: true,
          abutmentProductMode: "design_custom_abutment",
          bridgeLinkedTeeth: ["34"],
        },
        {
          toothNumber: "34",
          prosthesisType: "임시치아",
          customAbutment: true,
          abutmentProductMode: "design_custom_abutment",
          bridgeLinkedTeeth: ["33"],
        },
      ],
      labFeeSchedule: LAB_FEE_SCHEDULE_SAMPLE,
      abutmentPricingTier: "regular",
    });
    expect(fees.labFeeTotal).toBe(110000);
    expect(fees.labAbutmentTotal).toBe(80000);
    expect(fees.abutmentRetailTotal).toBe(0);
    expect(fees.abutmentQty).toBe(0);
    expect(fees.total).toBe(110000);
    const tempLine = fees.lines.find((line) =>
      String(line.prosthesisType).includes("임시치아"),
    );
    expect(tempLine).toMatchObject({ labFee: 30000, abutmentRetail: 0 });
    expect(
      fees.lines.filter(
        (line) => line.prosthesisType === LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME,
      ),
    ).toEqual([
      expect.objectContaining({
        toothNumber: "34",
        labFee: 0,
        labAbutmentFee: 40000,
        abutmentRetail: 0,
      }),
      expect.objectContaining({
        toothNumber: "33",
        labFee: 0,
        labAbutmentFee: 40000,
        abutmentRetail: 0,
      }),
    ]);
  });

  test("같은 하악 임시치아도 연결이 끊기면 3치·2치 2세트다", () => {
    const fees = computePracticeTransferRetailFees({
      toothWorks: [
        { toothNumber: "46", prosthesisType: "임시치아", bridgeLinkedTeeth: ["45"] },
        { toothNumber: "45", prosthesisType: "임시치아", bridgeLinkedTeeth: ["46", "44"] },
        { toothNumber: "44", prosthesisType: "임시치아", bridgeLinkedTeeth: ["45"] },
        { toothNumber: "34", prosthesisType: "임시치아", bridgeLinkedTeeth: ["33"] },
        { toothNumber: "33", prosthesisType: "임시치아", bridgeLinkedTeeth: ["34"] },
      ],
      labFeeSchedule: LAB_FEE_SCHEDULE_SAMPLE,
      abutmentPricingTier: "regular",
    });
    expect(fees.labFeeTotal).toBe(60000);
    const tempLines = fees.lines.filter((line) =>
      String(line.prosthesisType).includes("임시치아"),
    );
    expect(tempLines).toHaveLength(2);
    expect(tempLines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          toothNumber: "34,33",
          prosthesisType: "임시치아(하악) 2치",
          labFee: 30000,
        }),
        expect.objectContaining({
          toothNumber: "44,45,46",
          prosthesisType: "임시치아(하악) 3치",
          labFee: 30000,
        }),
      ]),
    );
  });

  test("임시치아+레거시 Pontic 연결은 임시치아 브리지 1세트다", () => {
    const fees = computePracticeTransferRetailFees({
      toothWorks: [
        {
          toothNumber: "45",
          prosthesisType: "임시치아",
          customAbutment: true,
          abutmentProductMode: "design_custom_abutment",
          bridgeLinkedTeeth: ["44"],
        },
        {
          toothNumber: "44",
          prosthesisType: "Pontic",
          bridgeLinkedTeeth: ["45", "43"],
        },
        {
          toothNumber: "43",
          prosthesisType: "임시치아",
          customAbutment: true,
          abutmentProductMode: "design_custom_abutment",
          bridgeLinkedTeeth: ["44"],
        },
      ],
      labFeeSchedule: LAB_FEE_SCHEDULE_SAMPLE,
      abutmentPricingTier: "membership",
    });
    expect(fees.labFeeTotal).toBe(110000);
    expect(fees.labAbutmentTotal).toBe(80000);
    expect(fees.abutmentRetailTotal).toBe(0);
    expect(fees.abutmentQty).toBe(0);
    expect(
      fees.lines.filter((line) => String(line.prosthesisType).includes("임시치아")),
    ).toEqual([
      expect.objectContaining({
        toothNumber: "43,44,45",
        prosthesisType: "임시치아(하악) 3치",
        labFee: 30000,
      }),
    ]);
    expect(
      fees.lines.some((line) => /pontic/i.test(String(line.prosthesisType))),
    ).toBe(false);
  });

  test("Pontic 수가 항목은 없고 레거시 Pontic 치아는 브리지로 청구한다", () => {
    const items = normalizeLabFeeItems(LAB_FEE_SCHEDULE_SAMPLE);
    expect(
      items.some(
        (item) =>
          String(item.id).toLowerCase() === "pontic" ||
          /^pontic$/i.test(String(item.name)),
      ),
    ).toBe(false);
    expect(resolveLabFeeKeyFromProsthesisType("Pontic")).toBe("bridge");
    const fromStoredItems = normalizeLabFeeItems({
      items: [
        { id: "crown", name: "크라운", price: 60000, enabled: true },
        { id: "pontic", name: "Pontic", price: 40000, enabled: true },
        { id: "bridge", name: "브리지", price: 60000, enabled: true },
      ],
    });
    expect(
      fromStoredItems.some((item) => String(item.id).toLowerCase() === "pontic"),
    ).toBe(false);
    const fees = computePracticeTransferRetailFees({
      toothWorks: [{ toothNumber: "21", prosthesisType: "Pontic" }],
      labFeeSchedule: LAB_FEE_SCHEDULE_SAMPLE,
    });
    expect(fees.labFeeTotal).toBe(60000);
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

  test("마스터 On이어도 제공 항목이 없으면 청구 준비가 아니다", () => {
    const allOff = {
      active: true,
      items: [
        { id: "crown", name: "크라운", price: 60000, enabled: false },
        { id: "bridge", name: "브리지", price: 60000, enabled: false },
      ],
    };
    expect(isLabFeeScheduleConfigured(allOff)).toBe(true);
    expect(isLabFeeScheduleReadyToCharge(allOff)).toBe(false);
    expect(hasEnabledLabFeePrices(allOff)).toBe(false);
    expect(
      toothWorksNeedLabFee([{ toothNumber: "36", prosthesisType: "크라운" }]),
    ).toBe(true);
    expect(
      toothWorksNeedLabFee([
        {
          toothNumber: "36",
          prosthesisType: "커스텀어벗",
          customAbutment: true,
        },
      ]),
    ).toBe(true);
    expect(
      missingLabFeeItemNames(allOff, [
        { toothNumber: "36", prosthesisType: "크라운" },
      ]),
    ).toEqual(["크라운"]);
    expect(
      missingLabFeeItemNames(allOff, [
        {
          toothNumber: "36",
          prosthesisType: "커스텀어벗",
          customAbutment: true,
        },
      ]),
    ).toEqual([LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_NAME]);
    expect(
      isLabFeeScheduleReadyToCharge({
        active: true,
        items: [{ id: "crown", name: "크라운", price: 60000, enabled: true }],
      }),
    ).toBe(true);
  });

  test("치과→기공소 배송 무료 — normalize strip·missing에 배송비 없음·labShippingFee 0", () => {
    const items = normalizeLabFeeItems({
      items: [
        { id: "crown", name: "크라운", price: 60000, enabled: true },
        { id: "shipping", name: "배송비", price: 3500, enabled: true, unit: "perSet" },
      ],
    });
    expect(items.some((row) => isLabFeeShippingItem(row))).toBe(false);
    expect(resolveLabShippingFeeFromSchedule({ items })).toBe(0);
    expect(
      missingLabFeeItemNames(
        {
          active: true,
          items: [{ id: "crown", name: "크라운", price: 60000, enabled: true }],
        },
        [{ toothNumber: "11", prosthesisType: "크라운" }],
      ),
    ).not.toContain("배송비");
    const fees = computePracticeTransferRetailFees({
      toothWorks: [{ toothNumber: "11", prosthesisType: "크라운" }],
      labFeeSchedule: {
        active: true,
        items: [
          { id: "crown", name: "크라운", price: 60000, enabled: true },
          { id: "shipping", name: "배송비", price: 3500, enabled: true },
        ],
      },
      includeLabShippingFee: true,
    });
    expect(fees.labShippingFee).toBe(0);
    expect(fees.labFeeTotal).toBe(60000);
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
        { toothNumber: "11", prosthesisType: "크라운" },
        { toothNumber: "12", prosthesisType: "크라운" },
        { toothNumber: "21", prosthesisType: "크라운" },
      ],
      labFeeSchedule: LAB_FEE_SCHEDULE_SAMPLE,
      abutmentPricingTier: "regular",
    });
    expect(fees.lines.map((line) => line.toothNumber)).toEqual([
      "12",
      "11",
      "21",
      "22",
      "23",
      "33",
      "32",
      "31",
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

  test("임플란트 추가 요청 커스텀어벗은 기공소 어벗(어벗츠 단가 제외)", () => {
    const tooth = {
      toothNumber: "16",
      prosthesisType: "커스텀어벗",
      customAbutment: true,
      abutmentProductMode: "design_custom_abutment",
      implantManufacturer: "Acme",
      implantBrand: "추가요청",
      implantFamily: "미정",
      implantType: "임플란트 추가 요청",
      implantAddRequest: true,
    };
    expect(isPendingRoundBarAbutment(tooth)).toBe(true);
    const fees = computePracticeTransferRetailFees({
      toothWorks: [tooth],
      labFeeSchedule: LAB_FEE_SCHEDULE_SAMPLE,
      abutmentPricingTier: "regular",
    });
    expect(fees.abutmentRetailTotal).toBe(0);
    expect(fees.abutmentQty).toBe(0);
    expect(fees.labAbutmentPending).toBe(true);
    expect(fees.labAbutmentTotal).toBe(30000);
    expect(fees.lines[0]).toMatchObject({
      toothNumber: "16",
      labFee: 0,
      labAbutmentFee: 30000,
      labAbutmentPending: true,
      abutmentRetail: 0,
    });
  });

  
  test("implantType=헥스(사이즈 미정)만으로는 pending이 아니다", () => {
    const tooth = {
      toothNumber: "16",
      prosthesisType: "커스텀어벗",
      customAbutment: true,
      implantType: "헥스(사이즈 미정)",
    };
    expect(isPendingRoundBarAbutment(tooth)).toBe(false);
  });

test("환봉 요청중+기공소 커스텀어벗 수가가 있으면 기공소 어벗으로 합산한다", () => {
    const fees = computePracticeTransferRetailFees({
      toothWorks: [
        {
          toothNumber: "16",
          prosthesisType: "커스텀어벗",
          customAbutment: true,
          abutmentProductMode: "custom_abutment",
          implantType: "임플란트 추가 요청",
          implantBrand: "추가요청",
          implantAddRequest: true,
        },
      ],
      labFeeSchedule: {
        items: [
          {
            id: "lab-abut",
            name: LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_NAME,
            unit: "perTooth",
            enabled: true,
            price: 35000,
            remake: 0,
            tiers: [],
          },
        ],
      },
      abutmentPricingTier: "regular",
    });
    expect(fees.labAbutmentTotal).toBe(35000);
    expect(fees.labFeeTotal).toBe(35000);
    expect(fees.abutmentRetailTotal).toBe(0);
    expect(fees.total).toBe(35000);
    expect(fees.lines[0]).toMatchObject({
      labAbutmentFee: 35000,
      labAbutmentPending: true,
      abutmentRetail: 0,
    });
  });

  test("환봉 도입 프리셋은 기공소 커스텀어벗 수가를 쓴다", () => {
    const tooth = {
      toothNumber: "16",
      prosthesisType: "커스텀어벗",
      customAbutment: true,
      abutmentProductMode: "custom_abutment",
      implantManufacturer: "Acme",
      implantBrand: "One",
      implantFamily: "Regular",
      implantType: "헥스(사이즈 미정)",
    };
    const favorites = [
      {
        manufacturer: "Acme",
        brand: "One",
        family: "Regular",
        type: "헥스(사이즈 미정)",
        roundBar: true,
        adopted: true,
        adoptedKind: "cnc",
      },
    ];
    expect(isPendingRoundBarAbutment(tooth, favorites)).toBe(false);
    const fees = computePracticeTransferRetailFees({
      toothWorks: [tooth],
      implantFavorites: favorites,
      labFeeSchedule: LAB_FEE_SCHEDULE_SAMPLE,
      abutmentPricingTier: "regular",
    });
    expect(fees.abutmentRetailTotal).toBe(0);
    expect(fees.labAbutmentTotal).toBe(30000);
    expect(fees.labAbutmentPending).toBe(false);
    expect(fees.lines[0]).toMatchObject({
      labAbutmentFee: 30000,
      labAbutmentPending: false,
      abutmentRetail: 0,
    });
  });

  test("환봉어벗으로 도입하면 기공소 수가를 쓰고 0원이면 별도 고지한다", () => {
    const tooth = {
      toothNumber: "16",
      prosthesisType: "커스텀어벗",
      customAbutment: true,
      abutmentProductMode: "custom_abutment",
      implantManufacturer: "Acme",
      implantBrand: "One",
      implantFamily: "Regular",
      implantType: "헥스(사이즈 미정)",
    };
    const favorites = [
      {
        manufacturer: "Acme",
        brand: "One",
        family: "Regular",
        type: "헥스(사이즈 미정)",
        roundBar: true,
        adopted: true,
        adoptedKind: "round_bar",
      },
    ];
    const fees = computePracticeTransferRetailFees({
      toothWorks: [tooth],
      implantFavorites: favorites,
      labFeeSchedule: LAB_FEE_SCHEDULE_SAMPLE,
      abutmentPricingTier: "regular",
    });
    expect(fees.abutmentRetailTotal).toBe(0);
    expect(fees.labAbutmentTotal).toBe(30000);
    expect(fees.labAbutmentPending).toBe(false);
    expect(fees.lines[0]).toMatchObject({
      labAbutmentFee: 30000,
      labAbutmentPending: false,
      abutmentRetail: 0,
    });
  });

  test("관리자가 타입을 바꿔도 같은 제조사 환봉 도입에 기공소 수가를 쓴다", () => {
    const tooth = {
      toothNumber: "16",
      prosthesisType: "커스텀어벗",
      customAbutment: true,
      abutmentProductMode: "custom_abutment",
      implantManufacturer: "Acme",
      implantBrand: "One",
      implantFamily: "Regular",
      implantType: "헥스(사이즈 미정)",
    };
    const favorites = [
      {
        manufacturer: "Acme",
        brand: "One",
        family: "Regular",
        type: "2.5 Hex",
        roundBar: true,
        adopted: true,
        adoptedKind: "round_bar",
      },
    ];
    const fees = computePracticeTransferRetailFees({
      toothWorks: [tooth],
      implantFavorites: favorites,
      labFeeSchedule: LAB_FEE_SCHEDULE_SAMPLE,
      abutmentPricingTier: "regular",
    });
    expect(fees.abutmentRetailTotal).toBe(0);
    expect(fees.labAbutmentTotal).toBe(30000);
    expect(fees.labAbutmentPending).toBe(false);
  });

  test("환봉 단가 0원이면 별도 고지 노트를 남긴다", () => {
    const tooth = {
      toothNumber: "16",
      prosthesisType: "커스텀어벗",
      customAbutment: true,
      abutmentProductMode: "custom_abutment",
      implantManufacturer: "Acme",
      implantBrand: "One",
      implantFamily: "Regular",
      implantType: "헥스(사이즈 미정)",
    };
    const favorites = [
      {
        manufacturer: "Acme",
        brand: "One",
        family: "Regular",
        type: "헥스(사이즈 미정)",
        roundBar: true,
        adopted: true,
        adoptedKind: "round_bar",
      },
    ];
    const fees = computePracticeTransferRetailFees({
      toothWorks: [tooth],
      implantFavorites: favorites,
      labFeeSchedule: LAB_FEE_SCHEDULE_ZEROS,
      abutmentPricingTier: "regular",
      abutmentPrices: {
        regularRoundBarProductionPrice: 0,
        membershipRoundBarProductionPrice: 0,
      },
    });
    expect(fees.abutmentRetailTotal).toBe(0);
    expect(fees.abutmentQuotePending).toBe(true);
    expect(fees.abutmentQty).toBe(1);
    expect(fees.lines[0]).toMatchObject({
      labAbutmentFee: 0,
      labAbutmentPending: false,
      abutmentRetail: 0,
      abutmentRetailNote: "quote",
    });
  });

  test("크라운+임플란트 추가 요청중은 기공물과 기공소 어벗을 분리한다", () => {
    const fees = computePracticeTransferRetailFees({
      toothWorks: [
        {
          toothNumber: "26",
          prosthesisType: "크라운",
          customAbutment: true,
          abutmentProductMode: "design_custom_abutment",
          implantType: "임플란트 추가 요청",
          implantBrand: "추가요청",
          implantAddRequest: true,
        },
      ],
      labFeeSchedule: LAB_FEE_SCHEDULE_SAMPLE,
      abutmentPricingTier: "regular",
    });
    expect(fees.labFeeTotal).toBe(100000);
    expect(fees.labAbutmentTotal).toBe(40000);
    expect(fees.labAbutmentPending).toBe(true);
    expect(fees.abutmentRetailTotal).toBe(0);
    expect(fees.lines).toEqual([
      expect.objectContaining({
        toothNumber: "26",
        prosthesisType: "크라운",
        labFee: 60000,
        labAbutmentFee: 0,
        labAbutmentPending: false,
        abutmentRetail: 0,
      }),
      expect.objectContaining({
        toothNumber: "26",
        prosthesisType: LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME,
        labFee: 0,
        labAbutmentFee: 40000,
        labAbutmentPending: true,
        abutmentRetail: 0,
      }),
    ]);
  });

  test("할증 updatedAt이 의뢰 createdAt 이후면 해당 건에 미적용", () => {
    const practiceId = "64b000000000000000000001";
    const orderAt = new Date("2026-08-14T10:00:00+09:00");
    const before = new Date("2026-08-14T09:00:00+09:00");
    const after = new Date("2026-08-14T11:00:00+09:00");
    const labBefore = {
      labPracticeFeeMultipliers: [
        { practiceAnchorId: practiceId, multiplier: 1.1, updatedAt: before },
      ],
    };
    const labAfter = {
      labPracticeFeeMultipliers: [
        { practiceAnchorId: practiceId, multiplier: 1.1, updatedAt: after },
      ],
    };
    const labLegacy = {
      labPracticeFeeMultipliers: [
        { practiceAnchorId: practiceId, multiplier: 1.2 },
      ],
    };
    expect(
      resolveLabPracticeFeeMultiplierAsOf(labBefore, practiceId, orderAt),
    ).toBe(1.1);
    expect(
      resolveLabPracticeFeeMultiplierAsOf(labAfter, practiceId, orderAt),
    ).toBe(1);
    expect(
      resolveLabPracticeFeeMultiplierAsOf(labLegacy, practiceId, orderAt),
    ).toBe(1.2);
  });

  test("할증을 1x로 해제해도 기존 의뢰는 당시 배수를 유지한다", () => {
    const practiceId = "64b000000000000000000001";
    const orderAt = new Date("2026-08-14T10:00:00+09:00");
    const setAt = new Date("2026-08-14T09:00:00+09:00");
    const clearAt = new Date("2026-08-14T11:00:00+09:00");
    const rows = upsertLabPracticeFeeMultiplierList([], practiceId, 1.1, {
      updatedAt: setAt,
    });
    const cleared = upsertLabPracticeFeeMultiplierList(rows, practiceId, 1, {
      updatedAt: clearAt,
    });
    expect(cleared).toHaveLength(1);
    expect(cleared[0].multiplier).toBe(1);
    expect(cleared[0].history.map((h) => h.multiplier)).toEqual([1.1, 1]);
    expect(
      resolveLabPracticeFeeMultiplierAsOf(
        { labPracticeFeeMultipliers: cleared },
        practiceId,
        orderAt,
      ),
    ).toBe(1.1);
    expect(
      resolveLabPracticeFeeMultiplierAsOf(
        { labPracticeFeeMultipliers: cleared },
        practiceId,
        clearAt,
      ),
    ).toBe(1);
  });

  test("할증 배수를 바꿔도 기존 의뢰는 이전 배수를 유지한다", () => {
    const practiceId = "64b000000000000000000001";
    const orderAt = new Date("2026-08-14T10:00:00+09:00");
    const firstAt = new Date("2026-08-14T09:00:00+09:00");
    const secondAt = new Date("2026-08-14T11:00:00+09:00");
    const rows = upsertLabPracticeFeeMultiplierList([], practiceId, 1.1, {
      updatedAt: firstAt,
    });
    const changed = upsertLabPracticeFeeMultiplierList(rows, practiceId, 1.2, {
      updatedAt: secondAt,
    });
    expect(
      resolveLabPracticeFeeMultiplierAsOf(
        { labPracticeFeeMultipliers: changed },
        practiceId,
        orderAt,
      ),
    ).toBe(1.1);
    expect(
      resolveLabPracticeFeeMultiplierAsOf(
        { labPracticeFeeMultipliers: changed },
        practiceId,
        secondAt,
      ),
    ).toBe(1.2);
  });

  test("upsertLabPracticeFeeMultiplierList는 updatedAt을 기록한다", () => {
    const practiceId = "64b000000000000000000001";
    const at = new Date("2026-08-14T12:00:00+09:00");
    const rows = upsertLabPracticeFeeMultiplierList([], practiceId, 1.1, {
      updatedAt: at,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].multiplier).toBe(1.1);
    expect(rows[0].updatedAt.getTime()).toBe(at.getTime());
    expect(rows[0].history).toHaveLength(1);
    expect(rows[0].history[0].multiplier).toBe(1.1);
  });

  test("기존 수가에 CA가 없으면 Off로 보완한다", () => {
    const items = ensureSplitCustomAbutmentFeeItems([
      {
        id: "crown",
        name: "크라운",
        unit: "perTooth",
        enabled: true,
        price: 60000,
        remake: 0,
        tiers: [],
      },
    ]);
    const withJig = items.find(
      (item) => item.name === LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME,
    );
    const withoutJig = items.find(
      (item) => item.name === LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_NAME,
    );
    expect(withJig?.enabled).toBe(false);
    expect(withJig?.price).toBe(40000);
    expect(withoutJig?.enabled).toBe(false);
    expect(withoutJig?.price).toBe(30000);
  });

  test("카탈로그 On 신규·Off CA는 needSetupNames에 들어간다", () => {
    const schedule = {
      active: true,
      items: [
        {
          id: "crown",
          name: "크라운",
          unit: "perTooth",
          enabled: true,
          price: 60000,
          remake: 0,
          tiers: [],
        },
        {
          id: "customAbutmentWithJig",
          name: LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME,
          unit: "perTooth",
          enabled: false,
          price: 40000,
          remake: 0,
          tiers: [],
        },
        {
          id: "customAbutmentWithoutJig",
          name: LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_NAME,
          unit: "perTooth",
          enabled: false,
          price: 30000,
          remake: 0,
          tiers: [],
        },
      ],
    };
    const catalog = [
      {
        id: "crown",
        name: "크라운",
        unit: "perTooth",
        enabled: true,
        price: 60000,
        remake: 0,
        tiers: [],
      },
      {
        id: "customAbutmentWithJig",
        name: LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME,
        unit: "perTooth",
        enabled: true,
        price: 40000,
        remake: 0,
        tiers: [],
      },
      {
        id: "customAbutmentWithoutJig",
        name: LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_NAME,
        unit: "perTooth",
        enabled: true,
        price: 30000,
        remake: 0,
        tiers: [],
      },
      {
        id: "new-1",
        name: "올세라믹",
        unit: "perTooth",
        enabled: true,
        price: 120000,
        remake: 0,
        tiers: [],
      },
    ];
    expect(resolveLabFeeCatalogNeedSetupNames(schedule, catalog)).toEqual([
      LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME,
      LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_NAME,
      "올세라믹",
    ]);
    const merged = mergeEnabledCatalogItemsIntoLabFeeItems(
      normalizeLabFeeItems(schedule),
      catalog,
    );
    expect(merged.some((item) => item.name === "올세라믹" && item.enabled === false)).toBe(
      true,
    );
  });

  test("의도적으로 Off한 일반 수가(크라운)는 needSetupNames에 넣지 않는다", () => {
    const schedule = {
      active: true,
      items: [
        {
          id: "crown",
          name: "크라운",
          unit: "perTooth",
          enabled: false,
          price: 60000,
          remake: 0,
          tiers: [],
        },
        {
          id: "customAbutmentWithJig",
          name: LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME,
          unit: "perTooth",
          enabled: true,
          price: 40000,
          remake: 0,
          tiers: [],
        },
        {
          id: "customAbutmentWithoutJig",
          name: LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_NAME,
          unit: "perTooth",
          enabled: true,
          price: 30000,
          remake: 0,
          tiers: [],
        },
      ],
    };
    const catalog = [
      {
        id: "crown",
        name: "크라운",
        unit: "perTooth",
        enabled: true,
        price: 60000,
        remake: 0,
        tiers: [],
      },
      {
        id: "customAbutmentWithJig",
        name: LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME,
        unit: "perTooth",
        enabled: true,
        price: 40000,
        remake: 0,
        tiers: [],
      },
      {
        id: "customAbutmentWithoutJig",
        name: LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_NAME,
        unit: "perTooth",
        enabled: true,
        price: 30000,
        remake: 0,
        tiers: [],
      },
    ];
    expect(resolveLabFeeCatalogNeedSetupNames(schedule, catalog)).toEqual([]);
  });
});

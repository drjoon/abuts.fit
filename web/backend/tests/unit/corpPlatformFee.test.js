// related files:
// - web/backend/services/corpPlatformFee.service.js
import {
  CORP_FEE_MAX_WON,
  buildCorpProductRows,
  suggestCorpUnitFee,
  buildCorpFeeHistoryEntry,
  normalizeCorpPlatformFees,
  validateCorpPlatformFeesPatch,
} from "../../services/corpPlatformFee.service.js";

describe("normalizeCorpPlatformFees", () => {
  test("비어 있으면 0원과 빈 제품 목록", () => {
    const out = normalizeCorpPlatformFees(undefined);
    expect(out.platformUsageMonthlyFee).toBe(0);
    expect(out.cncRentalMonthlyFee).toBe(0);
    expect(out.productUnitFees).toEqual([]);
  });

  test("저장값을 정수 원으로 정리", () => {
    const out = normalizeCorpPlatformFees({
      platformUsageMonthlyFee: 100000.4,
      cncRentalMonthlyFee: -5,
      productUnitFees: [{ key: "crown", label: "크라운", unitPrice: "2500" }],
    });
    expect(out.platformUsageMonthlyFee).toBe(100000);
    expect(out.cncRentalMonthlyFee).toBe(0);
    expect(out.productUnitFees).toEqual([
      { key: "crown", label: "크라운", unitPrice: 2500 },
    ]);
  });
});

describe("validateCorpPlatformFeesPatch", () => {
  test("월 정액과 제품 단가를 받는다", () => {
    const res = validateCorpPlatformFeesPatch({
      platformUsageMonthlyFee: 300000,
      cncRentalMonthlyFee: 1200000,
      productUnitFees: [
        { key: "custom_abutment", label: "커스텀어벗(1개)", unitPrice: 5000 },
      ],
      note: "2026-10 협의",
    });
    expect(res.ok).toBe(true);
    expect(res.value.platformUsageMonthlyFee).toBe(300000);
    expect(res.value.productUnitFees[0].unitPrice).toBe(5000);
    expect(res.value.note).toBe("2026-10 협의");
  });

  test("정률 필드는 거부한다", () => {
    for (const body of [
      { feeRate: 0.1 },
      { platformPercent: 5 },
      { revenueRatio: 0.2, platformUsageMonthlyFee: 1 },
    ]) {
      const res = validateCorpPlatformFeesPatch(body);
      expect(res.ok).toBe(false);
    }
  });

  test("범위·중복·빈 키를 거부한다", () => {
    expect(
      validateCorpPlatformFeesPatch({ cncRentalMonthlyFee: -1 }).ok,
    ).toBe(false);
    expect(
      validateCorpPlatformFeesPatch({
        platformUsageMonthlyFee: CORP_FEE_MAX_WON + 1,
      }).ok,
    ).toBe(false);
    expect(
      validateCorpPlatformFeesPatch({
        productUnitFees: [
          { key: "a", label: "A", unitPrice: 1 },
          { key: "a", label: "B", unitPrice: 2 },
        ],
      }).ok,
    ).toBe(false);
    expect(
      validateCorpPlatformFeesPatch({
        productUnitFees: [{ key: "", label: "A", unitPrice: 1 }],
      }).ok,
    ).toBe(false);
    expect(validateCorpPlatformFeesPatch({}).ok).toBe(false);
  });
});

describe("buildCorpFeeHistoryEntry", () => {
  test("변경 후 값 스냅샷과 변경자를 남긴다", () => {
    const next = normalizeCorpPlatformFees({
      platformUsageMonthlyFee: 1,
      cncRentalMonthlyFee: 2,
      note: "메모",
    });
    const at = new Date("2026-10-15T00:00:00Z");
    const entry = buildCorpFeeHistoryEntry({
      next,
      actorLabel: "admin@abuts.fit",
      at,
    });
    expect(entry.at).toBe(at);
    expect(entry.by).toBe("admin@abuts.fit");
    expect(entry.platformUsageMonthlyFee).toBe(1);
    expect(entry.cncRentalMonthlyFee).toBe(2);
    expect(entry.note).toBe("메모");
  });
});

describe("suggestCorpUnitFee", () => {
  test("50%를 1000원 단위로 올림", () => {
    expect(suggestCorpUnitFee(10000)).toBe(5000);
    expect(suggestCorpUnitFee(10100)).toBe(6000);
    expect(suggestCorpUnitFee(1)).toBe(1000);
    expect(suggestCorpUnitFee(0)).toBe(0);
  });
});

describe("buildCorpProductRows", () => {
  test("적용 중 항목만, 저장 단가는 없으면 null", () => {
    const rows = buildCorpProductRows(
      [
        { id: "a", name: "A", unit: "perTooth", enabled: true, price: 21000 },
        { id: "b", name: "B", enabled: false, price: 1000 },
        { id: "c", name: "C", enabled: true, price: 1000, pendingReview: true },
      ],
      [{ key: "a", label: "A", unitPrice: 9000 }],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: "a",
      abutsPrice: 21000,
      suggestedPrice: 11000,
      unitPrice: 9000,
    });
    expect(
      buildCorpProductRows([{ id: "x", name: "X", enabled: true, price: 2000 }], [])[0]
        .unitPrice,
    ).toBeNull();
  });
});

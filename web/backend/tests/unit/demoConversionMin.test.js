import {
  assertChargeMeetsConversionMinimum,
  resolveConversionMinTotal,
  resolveDemoChargeSuggestion,
} from "../../utils/demoConversionMath.js";

describe("demoConversionMath", () => {
  test("resolveConversionMinTotal rounds up to unit", () => {
    expect(
      resolveConversionMinTotal({
        demoDebt: 95_000,
        prepaidMin: 1_000_000,
        chargeUnit: 1_000_000,
      }),
    ).toBe(2_000_000);
  });

  test("resolveConversionMinTotal is at least one unit", () => {
    expect(
      resolveConversionMinTotal({
        demoDebt: 0,
        prepaidMin: 500_000,
        chargeUnit: 500_000,
      }),
    ).toBe(500_000);
  });

  test("resolveDemoChargeSuggestion is debt + debt/3 rounded to 100만", () => {
    const minTotal = resolveConversionMinTotal({
      demoDebt: 11_355_000,
      prepaidMin: 1_000_000,
      chargeUnit: 1_000_000,
    });
    expect(minTotal).toBe(13_000_000);
    expect(
      resolveDemoChargeSuggestion({
        demoDebt: 11_355_000,
        chargeUnit: 1_000_000,
        minTotal,
      }),
    ).toEqual({
      // 11_355_000/3 → 3_785_000 → 100만 반올림 4_000_000
      alpha: 4_000_000,
      // 15_355_000 → 유닛 반올림 15_000_000 (≥ min 13_000_000)
      suggestedTotal: 15_000_000,
    });
  });

  test("resolveDemoChargeSuggestion stays at least minTotal", () => {
    const minTotal = resolveConversionMinTotal({
      demoDebt: 100_000,
      prepaidMin: 1_000_000,
      chargeUnit: 1_000_000,
    });
    expect(
      resolveDemoChargeSuggestion({
        demoDebt: 100_000,
        chargeUnit: 1_000_000,
        minTotal,
      }).suggestedTotal,
    ).toBe(minTotal);
  });

  test("assertChargeMeetsConversionMinimum rejects below min", () => {
    expect(() =>
      assertChargeMeetsConversionMinimum(500_000, {
        demoDebt: 100_000,
        prepaidMin: 500_000,
        minTotal: 1_000_000,
      }),
    ).toThrow(/최소/);
  });

  test("assertChargeMeetsConversionMinimum accepts min", () => {
    expect(
      assertChargeMeetsConversionMinimum(1_000_000, {
        demoDebt: 100_000,
        prepaidMin: 500_000,
        minTotal: 1_000_000,
      }),
    ).toBe(true);
  });
});

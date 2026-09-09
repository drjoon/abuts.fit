import {
  assertChargeMeetsConversionMinimum,
  resolveConversionMinTotal,
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

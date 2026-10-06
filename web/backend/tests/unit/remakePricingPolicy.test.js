/**
 * @jest-environment node
 */
import {
  ABUTS_REMAKE_FIXED_AMOUNT,
  ABUTS_REMAKE_MONTHLY_FREE_RULE,
  ABUTS_REMAKE_PRICE_RULE,
  buildAbutsRemakePriceFromMonthlyUsage,
  buildFixedRemakeRetailFees,
  FREE_REMAKE_YEARS_MAX,
  freeRemakeDetectWindowDays,
  isWithinRemakePolicyWindow,
  kstMonthBounds,
  MONTHLY_REMAKE_FREE_LIMIT,
  normalizeFreeRemakeYears,
  parseFreeRemakeYearsInput,
  remakeFreeCutoffDateFromYears,
  resolveMonthlyRemakePricing,
  REMAKE_POLICY_WINDOW_DAYS,
} from "../../utils/remakePricingPolicy.js";

describe("remakePricingPolicy monthly quota", () => {
  test("resolveMonthlyRemakePricing free then paid", () => {
    expect(resolveMonthlyRemakePricing({ used: 0 })).toMatchObject({
      free: true,
      amount: 0,
      rule: ABUTS_REMAKE_MONTHLY_FREE_RULE,
      monthlyRemakeFreeRemaining: MONTHLY_REMAKE_FREE_LIMIT,
    });
    expect(resolveMonthlyRemakePricing({ used: 2 })).toMatchObject({
      free: true,
      amount: 0,
      monthlyRemakeFreeRemaining: 1,
    });
    expect(resolveMonthlyRemakePricing({ used: 3 })).toMatchObject({
      free: false,
      amount: ABUTS_REMAKE_FIXED_AMOUNT,
      rule: ABUTS_REMAKE_PRICE_RULE,
      monthlyRemakeFreeRemaining: 0,
    });
  });

  test("buildAbutsRemakePriceFromMonthlyUsage", () => {
    const free = buildAbutsRemakePriceFromMonthlyUsage({
      baseAmount: 15000,
      used: 1,
    });
    expect(free.amount).toBe(0);
    expect(free.rule).toBe(ABUTS_REMAKE_MONTHLY_FREE_RULE);
    expect(free.discountMeta.monthlyRemakeUsed).toBe(1);

    const paid = buildAbutsRemakePriceFromMonthlyUsage({
      baseAmount: 15000,
      used: 3,
    });
    expect(paid.amount).toBe(ABUTS_REMAKE_FIXED_AMOUNT);
    expect(paid.rule).toBe(ABUTS_REMAKE_PRICE_RULE);
  });

  test("buildFixedRemakeRetailFees", () => {
    const fees = buildFixedRemakeRetailFees();
    expect(fees.labFeeTotal).toBe(ABUTS_REMAKE_FIXED_AMOUNT);
    expect(fees.total).toBe(ABUTS_REMAKE_FIXED_AMOUNT);
    expect(fees.lines).toHaveLength(1);
  });

  test("kstMonthBounds uses KST civil month", () => {
    const { start, nextStart, year, month } = kstMonthBounds(
      new Date("2026-10-07T01:00:00+09:00"),
    );
    expect(year).toBe(2026);
    expect(month).toBe(10);
    expect(start.toISOString()).toBe(
      new Date("2026-10-01T00:00:00+09:00").toISOString(),
    );
    expect(nextStart.toISOString()).toBe(
      new Date("2026-11-01T00:00:00+09:00").toISOString(),
    );
  });
});

describe("remakePricingPolicy legacy helpers", () => {
  test("normalizeFreeRemakeYears", () => {
    expect(normalizeFreeRemakeYears(null)).toBeNull();
    expect(normalizeFreeRemakeYears("")).toBeNull();
    expect(normalizeFreeRemakeYears(-1)).toBeNull();
    expect(normalizeFreeRemakeYears(0)).toBe(0);
    expect(normalizeFreeRemakeYears(1.9)).toBe(1);
    expect(normalizeFreeRemakeYears(99)).toBe(FREE_REMAKE_YEARS_MAX);
  });

  test("parseFreeRemakeYearsInput keeps fallback when undefined", () => {
    expect(parseFreeRemakeYearsInput(undefined, 2)).toBe(2);
    expect(parseFreeRemakeYearsInput(null, 2)).toBeNull();
    expect(parseFreeRemakeYearsInput(0, 2)).toBe(0);
  });

  test("cutoff uses KST civil year", () => {
    const now = new Date("2026-03-01T12:00:00+09:00");
    const cutoff = remakeFreeCutoffDateFromYears(1, now);
    expect(cutoff?.toISOString()).toBe(
      new Date("2025-03-01T00:00:00+09:00").toISOString(),
    );
  });

  test("CA remake window stays 180 days", () => {
    const now = new Date("2026-09-21T12:00:00+09:00");
    const within = new Date(
      now.getTime() - (REMAKE_POLICY_WINDOW_DAYS - 1) * 86400000,
    );
    const outside = new Date(
      now.getTime() - (REMAKE_POLICY_WINDOW_DAYS + 1) * 86400000,
    );
    expect(isWithinRemakePolicyWindow(within, now)).toBe(true);
    expect(isWithinRemakePolicyWindow(outside, now)).toBe(false);
  });

  test("detect window is fixed max years", () => {
    expect(freeRemakeDetectWindowDays(null)).toBe(365 * FREE_REMAKE_YEARS_MAX);
    expect(freeRemakeDetectWindowDays(1)).toBe(365 * FREE_REMAKE_YEARS_MAX);
  });
});

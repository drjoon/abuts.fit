/**
 * @jest-environment node
 */
import {
  ABUTS_REMAKE_FIXED_AMOUNT,
  ABUTS_REMAKE_PRICE_RULE,
  buildAbutsRemakeFixedPrice,
  buildAbutsRemakePriceFromMonthlyUsage,
  buildFixedRemakeRetailFees,
  FREE_REMAKE_YEARS_MAX,
  freeRemakeDetectWindowDays,
  isWithinRemakePolicyWindow,
  kstMonthBounds,
  normalizeFreeRemakeYears,
  parseFreeRemakeYearsInput,
  remakeFreeCutoffDateFromYears,
  REMAKE_POLICY_WINDOW_DAYS,
} from "../../utils/remakePricingPolicy.js";

describe("remakePricingPolicy abuts path", () => {
  test("buildAbutsRemakeFixedPrice is 10000", () => {
    const price = buildAbutsRemakeFixedPrice({
      baseAmount: 15000,
      quotedAt: new Date("2026-10-07T01:00:00+09:00"),
    });
    expect(price.amount).toBe(ABUTS_REMAKE_FIXED_AMOUNT);
    expect(price.rule).toBe(ABUTS_REMAKE_PRICE_RULE);
    expect(price.discountAmount).toBe(5000);
  });

  test("buildAbutsRemakePriceFromMonthlyUsage always fixed (legacy helper)", () => {
    const freeSlot = buildAbutsRemakePriceFromMonthlyUsage({
      baseAmount: 15000,
      used: 0,
    });
    expect(freeSlot.amount).toBe(ABUTS_REMAKE_FIXED_AMOUNT);
    expect(freeSlot.rule).toBe(ABUTS_REMAKE_PRICE_RULE);

    const afterQuota = buildAbutsRemakePriceFromMonthlyUsage({
      baseAmount: 15000,
      used: 3,
    });
    expect(afterQuota.amount).toBe(ABUTS_REMAKE_FIXED_AMOUNT);
    expect(afterQuota.rule).toBe(ABUTS_REMAKE_PRICE_RULE);
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

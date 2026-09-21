/**
 * @jest-environment node
 */
import {
  FREE_REMAKE_YEARS_MAX,
  isWithinLabFreeRemakeWindow,
  isWithinRemakePolicyWindow,
  normalizeFreeRemakeYears,
  parseFreeRemakeYearsInput,
  remakeFreeCutoffDateFromYears,
  REMAKE_POLICY_WINDOW_DAYS,
} from "../../utils/remakePricingPolicy.js";

describe("remakePricingPolicy freeRemakeYears", () => {
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

  test("null/0 years → paid; 1+ within window → free", () => {
    const now = new Date("2026-09-21T12:00:00+09:00");
    const within = new Date("2025-09-22T00:00:00+09:00");
    const outside1y = new Date("2024-09-20T00:00:00+09:00");
    const within2y = new Date("2024-09-22T00:00:00+09:00");
    expect(isWithinLabFreeRemakeWindow(within, null, now)).toBe(false);
    expect(isWithinLabFreeRemakeWindow(within, 0, now)).toBe(false);
    expect(isWithinLabFreeRemakeWindow(within, 1, now)).toBe(true);
    expect(isWithinLabFreeRemakeWindow(outside1y, 1, now)).toBe(false);
    expect(isWithinLabFreeRemakeWindow(within2y, 2, now)).toBe(true);
    expect(isWithinLabFreeRemakeWindow(outside1y, 2, now)).toBe(false);
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
});

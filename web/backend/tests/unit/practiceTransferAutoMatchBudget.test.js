// related files:
// - web/backend/utils/practiceTransferAutoMatchBudget.js
// - web/backend/tests/unit/labFeeSchedule.test.js

import {
  isAutoMatchBudgetConfigured,
  isLabFeeWithinAutoMatchBudget,
  normalizeAutoMatchBudget,
} from "../../utils/practiceTransferAutoMatchBudgetCore.js";

describe("practiceTransferAutoMatchBudget", () => {
  test("normalizes min/max and clamps min to max", () => {
    expect(normalizeAutoMatchBudget({ minLabFee: 80_000, maxLabFee: 50_000 })).toEqual({
      minLabFee: 50_000,
      maxLabFee: 50_000,
    });
    expect(normalizeAutoMatchBudget({ min: 0, max: 100_000 })).toEqual({
      minLabFee: 0,
      maxLabFee: 100_000,
    });
  });

  test("rejects missing or non-positive max", () => {
    expect(normalizeAutoMatchBudget(null)).toBeNull();
    expect(normalizeAutoMatchBudget({ minLabFee: 0, maxLabFee: 0 })).toBeNull();
    expect(normalizeAutoMatchBudget({ minLabFee: 10_000 })).toBeNull();
    expect(isAutoMatchBudgetConfigured({ maxLabFee: 0 })).toBe(false);
    expect(isAutoMatchBudgetConfigured({ maxLabFee: 40_000 })).toBe(true);
  });

  test("checks inclusive lab fee band", () => {
    const band = { minLabFee: 40_000, maxLabFee: 60_000 };
    expect(isLabFeeWithinAutoMatchBudget(40_000, band)).toBe(true);
    expect(isLabFeeWithinAutoMatchBudget(60_000, band)).toBe(true);
    expect(isLabFeeWithinAutoMatchBudget(39_999, band)).toBe(false);
    expect(isLabFeeWithinAutoMatchBudget(60_001, band)).toBe(false);
  });
});

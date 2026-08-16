// related files:
// - web/backend/utils/practiceTransferRush.js
// - web/backend/utils/labFeeSchedule.js
import {
  PRACTICE_NORMAL_MIN_WORK_PLUS_SHIP_DAYS,
  PRACTICE_RUSH_FEE_MULTIPLIER,
  applyRushFeeMultiplierToFees,
  countWeekdayBusinessDays,
  resolveRushFeeMultiplier,
  upsertMemoArrivalYmd,
} from "../../utils/practiceTransferRush.js";
import { computePracticeTransferRetailFees } from "../../utils/labFeeSchedule.js";

describe("practiceTransferRush", () => {
  test("resolveRushFeeMultiplier is 1.5 when rush, else 1", () => {
    expect(resolveRushFeeMultiplier({ rushProcessing: true })).toBe(
      PRACTICE_RUSH_FEE_MULTIPLIER,
    );
    expect(resolveRushFeeMultiplier({ rushProcessing: false })).toBe(1);
    expect(
      resolveRushFeeMultiplier({
        rushProcessing: false,
        rushFeeMultiplier: 1.5,
      }),
    ).toBe(1.5);
  });

  test("applyRushFeeMultiplierToFees scales lab and abutment", () => {
    const scaled = applyRushFeeMultiplierToFees(
      {
        labFeeTotal: 10000,
        labAbutmentTotal: 2000,
        abutmentRetailTotal: 25000,
        total: 37000,
        lines: [
          {
            labFee: 10000,
            labAbutmentFee: 2000,
            abutmentRetail: 25000,
          },
        ],
      },
      1.5,
    );
    expect(scaled.labFeeTotal).toBe(15000);
    expect(scaled.labAbutmentTotal).toBe(3000);
    expect(scaled.abutmentRetailTotal).toBe(37500);
    expect(scaled.total).toBe(55500);
    expect(scaled.lines[0].labFee).toBe(15000);
    expect(scaled.lines[0].abutmentRetail).toBe(37500);
    expect(scaled.rushFeeMultiplier).toBe(1.5);
  });

  test("countWeekdayBusinessDays matches 2+2 minimum window", () => {
    // Mon 2026-08-17 → Fri 2026-08-21 = 4 weekdays
    expect(countWeekdayBusinessDays("2026-08-17", "2026-08-21")).toBe(4);
    expect(PRACTICE_NORMAL_MIN_WORK_PLUS_SHIP_DAYS).toBe(4);
    expect(countWeekdayBusinessDays("2026-08-17", "2026-08-20")).toBe(3);
    expect(
      countWeekdayBusinessDays("2026-08-17", "2026-08-20") <
        PRACTICE_NORMAL_MIN_WORK_PLUS_SHIP_DAYS,
    ).toBe(true);
  });

  test("upsertMemoArrivalYmd replaces arrival tag", () => {
    const next = upsertMemoArrivalYmd(
      "[주문일: 2026-08-17]\n[도착일: 2026-08-30]\n메모",
      "2026-08-19",
    );
    expect(next).toContain("[도착일: 2026-08-19]");
    expect(next).not.toContain("2026-08-30");
  });

  test("computePracticeTransferRetailFees stacks rush after lab multiplier", () => {
    const fees = computePracticeTransferRetailFees({
      toothWorks: [
        {
          toothNumber: "16",
          prosthesisType: "크라운",
          customAbutment: false,
        },
      ],
      labFeeSchedule: {
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
        ],
      },
      abutmentPricingTier: "regular",
      abutmentPrices: {},
      labFeeMultiplier: 2,
      rushFeeMultiplier: 1.5,
    });
    // 60k * 2 * 1.5 = 180k
    expect(fees.labFeeTotal).toBe(180000);
    expect(fees.rushFeeMultiplier).toBe(1.5);
  });
});

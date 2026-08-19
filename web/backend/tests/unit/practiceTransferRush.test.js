// related files:
// - web/backend/utils/practiceTransferRush.js
// - web/backend/utils/labFeeSchedule.js
import {
  PRACTICE_NORMAL_MIN_WORK_PLUS_SHIP_DAYS,
  PRACTICE_RUSH_FEE_MULTIPLIER,
  applyRushFeeMultiplierToFees,
  countWeekdayBusinessDays,
  normalizeConfiguredRushFeeMultiplier,
  normalizeRushFeeMultiplier,
  resolveRushFeeMultiplier,
  upsertMemoArrivalYmd,
} from "../../utils/practiceTransferRush.js";
import { computePracticeTransferRetailFees } from "../../utils/labFeeSchedule.js";

describe("practiceTransferRush", () => {
  test("default rush multiplier is 1 (no surcharge)", () => {
    expect(PRACTICE_RUSH_FEE_MULTIPLIER).toBe(1);
  });

  test("resolveRushFeeMultiplier ignores rush flag (no surcharge)", () => {
    expect(resolveRushFeeMultiplier({ rushProcessing: true })).toBe(1);
    expect(
      resolveRushFeeMultiplier({
        rushProcessing: true,
        configuredMultiplier: 1.3,
      }),
    ).toBe(1);
    expect(resolveRushFeeMultiplier({ rushProcessing: false })).toBe(1);
    expect(
      resolveRushFeeMultiplier({
        rushProcessing: false,
        rushFeeMultiplier: 1.5,
      }),
    ).toBe(1.5);
  });

  test("normalizeRushFeeMultiplier accepts range (1, 2]", () => {
    expect(normalizeRushFeeMultiplier(1)).toBe(1);
    expect(normalizeRushFeeMultiplier(1.2)).toBe(1.2);
    expect(normalizeRushFeeMultiplier(1.5)).toBe(1.5);
    expect(normalizeRushFeeMultiplier(2)).toBe(2);
    expect(normalizeRushFeeMultiplier(2.5)).toBe(2);
    expect(normalizeConfiguredRushFeeMultiplier(null)).toBe(1);
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
      1.2,
    );
    expect(scaled.labFeeTotal).toBe(12000);
    expect(scaled.labAbutmentTotal).toBe(2400);
    expect(scaled.abutmentRetailTotal).toBe(30000);
    expect(scaled.total).toBe(42000);
    expect(scaled.lines[0].labFee).toBe(12000);
    expect(scaled.lines[0].abutmentRetail).toBe(30000);
    expect(scaled.rushFeeMultiplier).toBe(1.2);
  });

  test("countWeekdayBusinessDays matches 2+2 minimum window", () => {
    const afterNoon = new Date("2026-08-17T15:00:00+09:00");
    // Mon 2026-08-17 15:00 → Fri 2026-08-21 = 4 weekdays (오늘 제외)
    expect(countWeekdayBusinessDays("2026-08-17", "2026-08-21", afterNoon)).toBe(
      4,
    );
    expect(PRACTICE_NORMAL_MIN_WORK_PLUS_SHIP_DAYS).toBe(3);
    expect(countWeekdayBusinessDays("2026-08-17", "2026-08-20", afterNoon)).toBe(
      3,
    );
    expect(
      countWeekdayBusinessDays("2026-08-17", "2026-08-19", afterNoon) <
        PRACTICE_NORMAL_MIN_WORK_PLUS_SHIP_DAYS,
    ).toBe(true);
  });

  test("countWeekdayBusinessDays includes order day before noon", () => {
    const beforeNoon = new Date("2026-08-20T11:59:00+09:00");
    const noon = new Date("2026-08-20T12:00:00+09:00");
    // Thu 20 → Wed 26: 12시 전=목금월화수(5), 12시=금월화수(4)
    expect(countWeekdayBusinessDays("2026-08-20", "2026-08-26", beforeNoon)).toBe(
      5,
    );
    expect(countWeekdayBusinessDays("2026-08-20", "2026-08-26", noon)).toBe(4);
    expect(
      countWeekdayBusinessDays(
        "2026-08-20",
        "2026-08-20",
        beforeNoon,
      ),
    ).toBe(1);
    expect(countWeekdayBusinessDays("2026-08-20", "2026-08-20", noon)).toBe(0);
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
      rushFeeMultiplier: 1.2,
    });
    // 60000 * 2 * 1.2
    expect(fees.labFeeTotal).toBe(144000);
    expect(fees.rushFeeMultiplier).toBe(1.2);
  });
});

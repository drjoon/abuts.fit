// related files:
// - web/backend/utils/practiceTransferAutoMatchBudgetCore.js

import {
  bandFromAdminBase,
  buildDefaultAutoMatchBudgetItems,
  isAutoMatchBudgetConfigured,
  isLabUnitPricesWithinAutoMatchBudget,
  normalizeAutoMatchBudget,
  resolveAutoMatchBudgetOrDefaults,
  scaleLabUnitPricesByMultiplier,
} from "../../utils/practiceTransferAutoMatchBudgetCore.js";

describe("practiceTransferAutoMatchBudgetCore", () => {
  test("admin 80%~120% floors to 1000원", () => {
    expect(bandFromAdminBase(60000)).toEqual({ min: 48000, max: 72000 });
    expect(bandFromAdminBase(50000)).toEqual({ min: 40000, max: 60000 });
    expect(bandFromAdminBase(50001)).toEqual({ min: 40000, max: 60000 });
  });

  test("defaults cover all prosthetic keys at 80%~120%", () => {
    const items = buildDefaultAutoMatchBudgetItems();
    expect(items.crown).toEqual({ min: 48000, max: 72000 });
    expect(items.bridge).toEqual({ min: 48000, max: 72000 });
    expect(isAutoMatchBudgetConfigured({ version: 2, items })).toBe(true);
  });

  test("pct budget expands new catalog items", () => {
    const catalog = [
      { id: "crown", name: "크라운", price: 60000, enabled: true },
      { id: "custom-veneer", name: "비니어", price: 80000, enabled: true },
    ];
    const budget = resolveAutoMatchBudgetOrDefaults(
      { version: 3, minPct: 80, maxPct: 120 },
      catalog,
    );
    expect(budget.minPct).toBe(80);
    expect(budget.maxPct).toBe(120);
    expect(budget.items.crown).toEqual({ min: 48000, max: 72000 });
    expect(budget.items["custom-veneer"]).toEqual({
      min: 64000,
      max: 96000,
    });
  });

  test("unit price eligibility is inclusive per required key", () => {
    const budget = resolveAutoMatchBudgetOrDefaults(null);
    expect(
      isLabUnitPricesWithinAutoMatchBudget(
        { crown: 48000, bridge: 72000 },
        budget,
        ["crown", "bridge"],
      ),
    ).toBe(true);
    expect(
      isLabUnitPricesWithinAutoMatchBudget(
        { crown: 47999, bridge: 72000 },
        budget,
        ["crown"],
      ),
    ).toBe(false);
  });

  test("normalize floors bands to 1000원", () => {
    expect(
      normalizeAutoMatchBudget({
        version: 2,
        items: { inlay: { min: 45001, max: 55001 } },
      }),
    ).toEqual({
      version: 2,
      items: { inlay: { min: 45000, max: 55000 } },
    });
  });

  test("legacy total-only budget is treated as unset", () => {
    expect(
      normalizeAutoMatchBudget({ minLabFee: 0, maxLabFee: 100000 }),
    ).toBeNull();
  });

  test("unit price helper scales surcharge (eligibility uses base; billing may scale)", () => {
    const budget = {
      version: 2,
      items: { crown: { min: 48000, max: 72000 } },
    };
    const base = { crown: 60000 };
    expect(
      isLabUnitPricesWithinAutoMatchBudget(
        scaleLabUnitPricesByMultiplier(base, 1),
        budget,
        ["crown"],
      ),
    ).toBe(true);
    expect(
      isLabUnitPricesWithinAutoMatchBudget(
        scaleLabUnitPricesByMultiplier(base, 1.1),
        budget,
        ["crown"],
      ),
    ).toBe(true);
    expect(
      isLabUnitPricesWithinAutoMatchBudget(
        scaleLabUnitPricesByMultiplier(base, 1.5),
        budget,
        ["crown"],
      ),
    ).toBe(false);
    expect(scaleLabUnitPricesByMultiplier(base, 1.5).crown).toBe(90000);
  });
});

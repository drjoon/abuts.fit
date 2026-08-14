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
  test("admin ±10% floors to 1000원", () => {
    expect(bandFromAdminBase(60000)).toEqual({ min: 54000, max: 66000 });
    // 50000*1.1 부동소수점 → Math.ceil이면 55001; 1000원 절사로 55000
    expect(bandFromAdminBase(50000)).toEqual({ min: 45000, max: 55000 });
    expect(bandFromAdminBase(50001)).toEqual({ min: 45000, max: 55000 });
  });

  test("defaults cover all prosthetic keys", () => {
    const items = buildDefaultAutoMatchBudgetItems();
    expect(items.crown).toEqual({ min: 54000, max: 66000 });
    expect(items.bridge).toEqual({ min: 54000, max: 66000 });
    expect(isAutoMatchBudgetConfigured({ version: 2, items })).toBe(true);
  });

  test("new catalog items appear in resolved budget", () => {
    const catalog = [
      { id: "crown", name: "크라운", price: 60000, enabled: true },
      { id: "custom-veneer", name: "비니어", price: 80000, enabled: true },
    ];
    const budget = resolveAutoMatchBudgetOrDefaults(
      { version: 2, items: { crown: { min: 54000, max: 66000 } } },
      catalog,
    );
    expect(budget.items.crown).toEqual({ min: 54000, max: 66000 });
    expect(budget.items["custom-veneer"]).toEqual({
      min: 72000,
      max: 88000,
    });
  });

  test("unit price eligibility is inclusive per required key", () => {
    const budget = resolveAutoMatchBudgetOrDefaults(null);
    expect(
      isLabUnitPricesWithinAutoMatchBudget(
        { crown: 54000, bridge: 66000 },
        budget,
        ["crown", "bridge"],
      ),
    ).toBe(true);
    expect(
      isLabUnitPricesWithinAutoMatchBudget(
        { crown: 53999, bridge: 66000 },
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

  test("surcharge unit prices must stay within budget band", () => {
    const budget = {
      version: 2,
      items: { crown: { min: 54000, max: 66000 } },
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
        scaleLabUnitPricesByMultiplier(base, 1.2),
        budget,
        ["crown"],
      ),
    ).toBe(false);
    expect(scaleLabUnitPricesByMultiplier(base, 1.2).crown).toBe(72000);
  });
});

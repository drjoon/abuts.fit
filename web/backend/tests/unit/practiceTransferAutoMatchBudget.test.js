// related files:
// - web/backend/utils/practiceTransferAutoMatchBudgetCore.js

import {
  bandFromAdminBase,
  buildDefaultAutoMatchBudgetItems,
  isAutoMatchBudgetConfigured,
  isLabUnitPricesWithinAutoMatchBudget,
  normalizeAutoMatchBudget,
  resolveAutoMatchBudgetOrDefaults,
} from "../../utils/practiceTransferAutoMatchBudgetCore.js";

describe("practiceTransferAutoMatchBudgetCore", () => {
  test("admin ±20% uses Math.ceil", () => {
    expect(bandFromAdminBase(60000)).toEqual({ min: 48000, max: 72000 });
    expect(bandFromAdminBase(50001)).toEqual({
      min: Math.ceil(50001 * 0.8),
      max: Math.ceil(50001 * 1.2),
    });
  });

  test("defaults cover all prosthetic keys", () => {
    const items = buildDefaultAutoMatchBudgetItems();
    expect(items.crown).toEqual({ min: 48000, max: 72000 });
    expect(items.bridge).toEqual({ min: 48000, max: 72000 });
    expect(isAutoMatchBudgetConfigured({ version: 2, items })).toBe(true);
  });

  test("new catalog items appear in resolved budget", () => {
    const catalog = [
      { id: "crown", name: "크라운", price: 60000, enabled: true },
      { id: "custom-veneer", name: "비니어", price: 80000, enabled: true },
    ];
    const budget = resolveAutoMatchBudgetOrDefaults(
      { version: 2, items: { crown: { min: 48000, max: 72000 } } },
      catalog,
    );
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

  test("legacy total-only budget is treated as unset", () => {
    expect(
      normalizeAutoMatchBudget({ minLabFee: 0, maxLabFee: 100000 }),
    ).toBeNull();
  });
});

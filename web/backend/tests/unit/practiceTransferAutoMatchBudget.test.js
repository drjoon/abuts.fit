// related files:
// - web/backend/utils/practiceTransferAutoMatchBudgetCore.js

import {
  bandFromAdminBase,
  buildDefaultAutoMatchBudgetItems,
  buildScheduleFromAutoMatchBudgetAtStars,
  isAutoMatchBudgetConfigured,
  isLabUnitPricesWithinAutoMatchBudget,
  normalizeAutoMatchBudget,
  resolveAutoMatchBudgetFromStarBand,
  resolveAutoMatchBudgetFromStars,
  resolveAutoMatchBudgetOrDefaults,
  scaleLabUnitPricesByMultiplier,
} from "../../utils/practiceTransferAutoMatchBudgetCore.js";

describe("practiceTransferAutoMatchBudgetCore", () => {
  test("admin 80%~120% floors to 1000원 (legacy)", () => {
    expect(bandFromAdminBase(60000)).toEqual({ min: 48000, max: 72000 });
    expect(bandFromAdminBase(50000)).toEqual({ min: 40000, max: 60000 });
    expect(bandFromAdminBase(50001)).toEqual({ min: 40000, max: 60000 });
  });

  test("v4 fixed fee from stars: 1=0.8x, 2=0.9x, 3=1x, 4=1.1x, 5=1.2x ceil 1000", () => {
    const catalog = [
      { id: "crown", name: "크라운", price: 60000, enabled: true },
    ];
    expect(resolveAutoMatchBudgetFromStars(1, catalog)).toMatchObject({
      version: 4,
      stars: 1,
      maxStars: 1,
      feeMultiplier: 0.8,
      items: { crown: { min: 48000, max: 48000 } },
    });
    expect(resolveAutoMatchBudgetFromStars(2, catalog)).toMatchObject({
      version: 4,
      stars: 2,
      feeMultiplier: 0.9,
      items: { crown: { min: 54000, max: 54000 } },
    });
    expect(resolveAutoMatchBudgetFromStars(3, catalog)).toMatchObject({
      version: 4,
      stars: 3,
      feeMultiplier: 1,
      items: { crown: { min: 60000, max: 60000 } },
    });
    expect(resolveAutoMatchBudgetFromStars(4, catalog).items.crown).toEqual({
      min: 66000,
      max: 66000,
    });
    expect(resolveAutoMatchBudgetFromStars(5, catalog).items.crown).toEqual({
      min: 72000,
      max: 72000,
    });
    // 55555 * 1.1 = 61110.5 → ceil 62000
    const odd = [{ id: "crown", name: "크라운", price: 55555, enabled: true }];
    expect(resolveAutoMatchBudgetFromStars(4, odd).items.crown).toEqual({
      min: 62000,
      max: 62000,
    });
  });

  test("v4 star band builds min/max fees from lower/upper multipliers", () => {
    const catalog = [
      { id: "crown", name: "크라운", price: 60000, enabled: true },
    ];
    const band = resolveAutoMatchBudgetFromStarBand(
      { minStars: 3, maxStars: 4 },
      catalog,
    );
    expect(band).toMatchObject({
      version: 4,
      stars: 3,
      maxStars: 4,
      feeMultiplier: 1,
      items: { crown: { min: 60000, max: 66000 } },
    });
  });

  test("buildScheduleFromAutoMatchBudgetAtStars uses lab stars within band", () => {
    const catalog = [
      { id: "crown", name: "크라운", price: 60000, enabled: true },
      { id: "bridge", name: "브리지", price: 60000, enabled: true },
    ];
    const budget = resolveAutoMatchBudgetFromStarBand(
      { minStars: 3, maxStars: 4 },
      catalog,
    );
    const at3 = buildScheduleFromAutoMatchBudgetAtStars(budget, 3, catalog);
    expect(at3.items.find((row) => row.id === "bridge")?.price).toBe(60000);
    const at4 = buildScheduleFromAutoMatchBudgetAtStars(budget, 4, catalog);
    expect(at4.items.find((row) => row.id === "bridge")?.price).toBe(66000);
    // 미지정·대역 밖 → 기본 3(대역 하한 쪽)
    const fallback = buildScheduleFromAutoMatchBudgetAtStars(
      budget,
      null,
      catalog,
    );
    expect(fallback.items.find((row) => row.id === "bridge")?.price).toBe(
      60000,
    );
  });

  test("resolveAutoMatchBudgetOrDefaults prefers minStars for v4", () => {
    const budget = resolveAutoMatchBudgetOrDefaults(
      { version: 3, minPct: 80, maxPct: 120 },
      null,
      { minStars: 4 },
    );
    expect(budget.version).toBe(4);
    expect(budget.stars).toBe(4);
    expect(budget.feeMultiplier).toBe(1.1);
  });

  test("defaults cover prosthetic keys at 80%~120% (legacy builder)", () => {
    const items = buildDefaultAutoMatchBudgetItems();
    expect(items.crown).toEqual({ min: 48000, max: 72000 });
    expect(items.bridge).toEqual({ min: 48000, max: 72000 });
    expect(isAutoMatchBudgetConfigured({ version: 2, items })).toBe(true);
  });

  test("pct budget expands new catalog items (legacy)", () => {
    const catalog = [
      { id: "crown", name: "크라운", price: 60000, enabled: true },
      { id: "custom-veneer", name: "비니어", price: 80000, enabled: true },
    ];
    const budget = normalizeAutoMatchBudget(
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

  test("pct normalize keeps case minLabFee/maxLabFee for quote tooltip", () => {
    const normalized = normalizeAutoMatchBudget({
      version: 3,
      minPct: 80,
      maxPct: 120,
      minLabFee: 96000,
      maxLabFee: 144000,
    });
    expect(normalized).toMatchObject({
      version: 3,
      minPct: 80,
      maxPct: 120,
      minLabFee: 96000,
      maxLabFee: 144000,
    });
    expect(normalized.items.crown).toEqual({ min: 48000, max: 72000 });
  });

  test("unit price eligibility is inclusive per required key (legacy)", () => {
    const budget = {
      version: 3,
      minPct: 80,
      maxPct: 120,
      items: buildDefaultAutoMatchBudgetItems(),
    };
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

  test("unit price helper scales surcharge", () => {
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
        scaleLabUnitPricesByMultiplier(base, 1.5),
        budget,
        ["crown"],
      ),
    ).toBe(false);
    expect(scaleLabUnitPricesByMultiplier(base, 1.5).crown).toBe(90000);
  });
});

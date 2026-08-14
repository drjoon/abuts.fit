// related files:
// - web/backend/controllers/credits/creditLedger.utils.js
import {
  buildLedgerItemsWithBucketBalanceAfter,
  isSettlementLedgerType,
  resolveLedgerTypesForFilters,
} from "../../controllers/credits/creditLedger.utils.js";

describe("isSettlementLedgerType", () => {
  test("기공 적립/정산만 settlement", () => {
    expect(isSettlementLedgerType("LAB_SETTLEMENT_CHARGE")).toBe(true);
    expect(isSettlementLedgerType("LAB_SETTLEMENT_PAYOUT")).toBe(true);
    expect(isSettlementLedgerType("CHARGE_FREE_REQUEST")).toBe(false);
    expect(isSettlementLedgerType("SPEND_HOLD")).toBe(false);
  });
});

describe("buildLedgerItemsWithBucketBalanceAfter", () => {
  test("무료충전 이후 기공 적립도 총잔액으로 이어진다", () => {
    // newest-first: 기공+120k → 기공+120k → 기공+59.4k → 무료+7k → 무료+30k
    // 현재: spendable 37k + settlement 299.4k = 336.4k
    const rows = [
      { _id: "1", type: "LAB_SETTLEMENT_CHARGE", amount: 120000 },
      { _id: "2", type: "LAB_SETTLEMENT_CHARGE", amount: 120000 },
      { _id: "3", type: "LAB_SETTLEMENT_CHARGE", amount: 59400 },
      { _id: "4", type: "CHARGE_FREE_SHIPPING", amount: 7000 },
      { _id: "5", type: "CHARGE_FREE_REQUEST", amount: 30000 },
    ];
    const items = buildLedgerItemsWithBucketBalanceAfter({
      rows,
      startIdx: 0,
      endIdx: 5,
      spendableBalance: 37000,
      settlementBalance: 299400,
    });

    expect(items.map((i) => i.balanceAfter)).toEqual([
      336400,
      216400,
      96400, // 37,000 무료 + 59,400 기공 (리셋되지 않음)
      37000,
      30000,
    ]);
  });

  test("페이지 스킵도 총잔액 러닝에 반영한다", () => {
    const rows = [
      { _id: "1", type: "LAB_SETTLEMENT_CHARGE", amount: 100 },
      { _id: "2", type: "CHARGE_PAID", amount: 50 },
      { _id: "3", type: "LAB_SETTLEMENT_CHARGE", amount: 20 },
    ];
    const items = buildLedgerItemsWithBucketBalanceAfter({
      rows,
      startIdx: 1,
      endIdx: 3,
      spendableBalance: 50,
      settlementBalance: 120,
    });
    // total 170 - skipped first(+100) = 70
    expect(items).toHaveLength(2);
    expect(items[0].balanceAfter).toBe(70);
    expect(items[1].balanceAfter).toBe(20);
  });
});

describe("resolveLedgerTypesForFilters", () => {
  test("단일 type 하위호환", () => {
    expect(resolveLedgerTypesForFilters({ type: "SPEND_HOLD" })).toEqual([
      "SPEND_HOLD",
    ]);
  });

  test("버킷·동작 교집합", () => {
    expect(
      resolveLedgerTypesForFilters({ creditKind: "PAID", action: "CHARGE" }),
    ).toEqual(["CHARGE_PAID"]);
    expect(
      resolveLedgerTypesForFilters({
        creditKind: "SETTLEMENT",
        action: "CHARGE",
      }),
    ).toEqual(["LAB_SETTLEMENT_CHARGE"]);
    expect(
      resolveLedgerTypesForFilters({
        creditKind: "SETTLEMENT",
        action: "SPEND",
      }).sort(),
    ).toEqual(["LAB_SETTLEMENT_PAYOUT", "SPEND_SETTLEMENT"].sort());
    expect(
      resolveLedgerTypesForFilters({ creditKind: "FREE", action: "SPEND" }).sort(),
    ).toEqual(["SPEND_FREE_REQUEST", "SPEND_FREE_SHIPPING"].sort());
  });

  test("동작만 지정", () => {
    expect(resolveLedgerTypesForFilters({ action: "ADJUST" })).toEqual([
      "ADJUST",
    ]);
    expect(resolveLedgerTypesForFilters({ action: "SPEND" })).toEqual(
      expect.arrayContaining(["SPEND_HOLD", "SPEND_PAID", "LAB_SETTLEMENT_PAYOUT"]),
    );
  });
});

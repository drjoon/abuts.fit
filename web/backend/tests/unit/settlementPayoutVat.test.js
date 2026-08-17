// related files:
// - web/backend/services/settlement.service.js
import {
  resolveSettlementInvoiceDraftSpec,
  resolveSettlementPayoutAmounts,
  TAXABLE_SETTLEMENT_ROLES,
} from "../../services/settlement.service.js";

describe("resolveSettlementPayoutAmounts", () => {
  test("salesman: supply balance + 10% VAT = deposit", () => {
    expect(
      resolveSettlementPayoutAmounts({
        role: "salesman",
        balanceAmount: 10000,
        vatRate: 0.1,
      }),
    ).toEqual({
      supplyAmount: 10000,
      vatAmount: 1000,
      amount: 11000,
      vatRate: 0.1,
    });
  });

  test("devops: same payout-time VAT as salesman", () => {
    expect(
      resolveSettlementPayoutAmounts({
        role: "devops",
        balanceAmount: 25000,
        vatRate: 0.1,
      }),
    ).toEqual({
      supplyAmount: 25000,
      vatAmount: 2500,
      amount: 27500,
      vatRate: 0.1,
    });
  });

  test("manufacturer: exempt — no VAT", () => {
    expect(
      resolveSettlementPayoutAmounts({
        role: "manufacturer",
        balanceAmount: 9000,
        vatRate: 0.1,
      }),
    ).toEqual({
      supplyAmount: 9000,
      vatAmount: 0,
      amount: 9000,
      vatRate: 0.1,
    });
  });

  test("lab: exempt — no VAT", () => {
    expect(
      resolveSettlementPayoutAmounts({
        role: "lab",
        balanceAmount: 50000,
        vatRate: 0.1,
      }),
    ).toEqual({
      supplyAmount: 50000,
      vatAmount: 0,
      amount: 50000,
      vatRate: 0.1,
    });
  });

  test("taxable roles set", () => {
    expect(TAXABLE_SETTLEMENT_ROLES.has("manufacturer")).toBe(false);
    expect(TAXABLE_SETTLEMENT_ROLES.has("salesman")).toBe(true);
    expect(TAXABLE_SETTLEMENT_ROLES.has("devops")).toBe(true);
    expect(TAXABLE_SETTLEMENT_ROLES.has("lab")).toBe(false);
  });
});

describe("resolveSettlementInvoiceDraftSpec", () => {
  test("manufacturer: 면세 AFFILIATE_TO_ABUTS draft", () => {
    expect(
      resolveSettlementInvoiceDraftSpec({
        role: "manufacturer",
        breakdown: { supplyAmount: 9000, vatAmount: 0, amount: 9000 },
      }),
    ).toEqual({
      direction: "AFFILIATE_TO_ABUTS",
      issuanceMode: "TRUSTEE",
      taxType: "면세",
      itemName: "커스텀어벗 생산 하청 정산",
      supplyAmount: 9000,
      vatAmount: 0,
      totalAmount: 9000,
    });
  });

  test("lab: 면세 draft", () => {
    expect(
      resolveSettlementInvoiceDraftSpec({
        role: "lab",
        breakdown: { supplyAmount: 120000, vatAmount: 0, amount: 120000 },
      }),
    ).toMatchObject({
      taxType: "면세",
      vatAmount: 0,
      totalAmount: 120000,
      itemName: "기공 정산",
    });
  });

  test("salesman: 과세 draft with VAT split", () => {
    expect(
      resolveSettlementInvoiceDraftSpec({
        role: "salesman",
        breakdown: { supplyAmount: 10000, vatAmount: 1000, amount: 11000 },
      }),
    ).toMatchObject({
      taxType: "과세",
      supplyAmount: 10000,
      vatAmount: 1000,
      totalAmount: 11000,
    });
  });

  test("admin: no draft", () => {
    expect(
      resolveSettlementInvoiceDraftSpec({
        role: "admin",
        breakdown: { supplyAmount: 5000, vatAmount: 0, amount: 5000 },
      }),
    ).toBeNull();
  });
});

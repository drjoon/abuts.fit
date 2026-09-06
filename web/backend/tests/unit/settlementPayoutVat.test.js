// related files:
// - web/backend/services/settlement.service.js
// change-log:
// - 2026-09-06: 과세 잔액=포함가. 지급 재가산 없음(÷1.1 분해).
// - 2026-08-23: 제조사=일반과세(지급 VAT·세금계산서).
import {
  resolveSettlementInvoiceDraftSpec,
  resolveSettlementPayoutAmounts,
  TAXABLE_SETTLEMENT_ROLES,
} from "../../services/settlement.service.js";

describe("resolveSettlementPayoutAmounts", () => {
  test("salesman: inclusive balance → deposit as-is, split for invoice", () => {
    expect(
      resolveSettlementPayoutAmounts({
        role: "salesman",
        balanceAmount: 11000,
        vatRate: 0.1,
      }),
    ).toEqual({
      supplyAmount: 10000,
      vatAmount: 1000,
      amount: 11000,
      vatRate: 0.1,
    });
  });

  test("devops: inclusive balance, no double VAT", () => {
    expect(
      resolveSettlementPayoutAmounts({
        role: "devops",
        balanceAmount: 27500,
        vatRate: 0.1,
      }),
    ).toEqual({
      supplyAmount: 25000,
      vatAmount: 2500,
      amount: 27500,
      vatRate: 0.1,
    });
  });

  test("manufacturer: inclusive 8800 → pay 8800 (not 9680)", () => {
    expect(
      resolveSettlementPayoutAmounts({
        role: "manufacturer",
        balanceAmount: 8800,
        vatRate: 0.1,
      }),
    ).toEqual({
      supplyAmount: 8000,
      vatAmount: 800,
      amount: 8800,
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
    expect(TAXABLE_SETTLEMENT_ROLES.has("manufacturer")).toBe(true);
    expect(TAXABLE_SETTLEMENT_ROLES.has("salesman")).toBe(true);
    expect(TAXABLE_SETTLEMENT_ROLES.has("devops")).toBe(true);
    expect(TAXABLE_SETTLEMENT_ROLES.has("lab")).toBe(false);
  });
});

describe("resolveSettlementInvoiceDraftSpec", () => {
  test("manufacturer taxable draft from inclusive payout breakdown", () => {
    const breakdown = resolveSettlementPayoutAmounts({
      role: "manufacturer",
      balanceAmount: 8800,
      vatRate: 0.1,
    });
    expect(
      resolveSettlementInvoiceDraftSpec({
        role: "manufacturer",
        breakdown,
      }),
    ).toMatchObject({
      taxType: "과세",
      supplyAmount: 8000,
      vatAmount: 800,
      totalAmount: 8800,
    });
  });

  test("lab exempt draft", () => {
    expect(
      resolveSettlementInvoiceDraftSpec({
        role: "lab",
        breakdown: {
          supplyAmount: 50000,
          vatAmount: 0,
          amount: 50000,
        },
      }),
    ).toMatchObject({
      taxType: "면세",
      supplyAmount: 50000,
      vatAmount: 0,
      totalAmount: 50000,
    });
  });

  test("taxable earn line shape: supply + vat = inclusive amount", () => {
    const supply = 4500;
    const vatRate = 0.1;
    const vat = Math.round(supply * vatRate);
    const total = supply + vat;
    expect({ amount: total, amountExcludingVat: supply, vatAmount: vat, amountIncludingVat: total }).toEqual({
      amount: 4950,
      amountExcludingVat: 4500,
      vatAmount: 450,
      amountIncludingVat: 4950,
    });
    expect(
      resolveSettlementPayoutAmounts({
        role: "salesman",
        balanceAmount: total,
        vatRate,
      }).amount,
    ).toBe(total);
  });
});

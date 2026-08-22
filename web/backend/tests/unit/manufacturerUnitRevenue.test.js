// related files:
// - web/backend/services/creditRevenuePolicy.service.js
// change-log:
// - 2026-08-18: 제조사는 기공소(면세) — VAT 0.
// - 2026-08-17: 어벗 qty·플랫폼수수료/기공소배송 제외 테스트.
import {
  resolveManufacturerUnitApply,
  resolveManufacturerUnitEarn,
  resolveRevenueOwnerBaseAllocation,
} from "../../services/creditRevenuePolicy.service.js";

describe("manufacturer fixed unit + residual allocation", () => {
  const owners = {
    manufacturerAnchorId: "mfg",
    devopsAnchorId: "dev",
    salesmanAnchorId: "sales",
    adminAnchorId: "admin",
  };

  const creditSettings = {
    manufacturerRequestUnitPrice: 9000,
    manufacturerShippingUnitPrice: 3500,
    affiliateVatRate: 0.1,
  };

  test("resolveManufacturerUnitEarn: request and shipping exempt (no VAT)", () => {
    const request = resolveManufacturerUnitEarn({
      isShippingSpend: false,
      creditSettings,
    });
    expect(request).toEqual({
      supply: 9000,
      vat: 0,
      total: 9000,
      vatRate: 0,
      qty: 1,
    });

    const shipping = resolveManufacturerUnitEarn({
      isShippingSpend: true,
      creditSettings,
    });
    expect(shipping).toEqual({
      supply: 3500,
      vat: 0,
      total: 3500,
      vatRate: 0,
      qty: 1,
    });
  });

  test("express surcharge: no manufacturer unit", () => {
    const earn = resolveManufacturerUnitEarn({
      isShippingSpend: false,
      creditSettings,
      applyManufacturerUnit: false,
    });
    expect(earn.supply).toBe(0);
    expect(earn.vat).toBe(0);
    expect(earn.qty).toBe(0);
  });

  test("qty 2 abutments: manufacturer supply 18000, no VAT", () => {
    const earn = resolveManufacturerUnitEarn({
      isShippingSpend: false,
      creditSettings,
      qty: 2,
    });
    expect(earn).toEqual({
      supply: 18000,
      vat: 0,
      total: 18000,
      vatRate: 0,
      qty: 2,
    });
  });

  test("resolveManufacturerUnitApply: skip lab shipping and platform fee", () => {
    expect(
      resolveManufacturerUnitApply({
        usageKind: "practice_transfer_lab_shipping",
        isShippingSpend: true,
      }),
    ).toBe(false);
    expect(
      resolveManufacturerUnitApply({
        source: "lab_platform_fee",
        displayKind: "platform_fee",
      }),
    ).toBe(false);
    expect(
      resolveManufacturerUnitApply({
        source: "non_partner_platform_fee",
        abutmentQty: 1,
        abutmentRetailTotal: 40000,
      }),
    ).toBe(true);
    expect(
      resolveManufacturerUnitApply({
        source: "abutment_retail",
        displayKind: "abuts_share",
        abutmentQty: 1,
      }),
    ).toBe(true);
  });

  test("request spend: manufacturer fixed supply, residual to affiliates", () => {
    const alloc = resolveRevenueOwnerBaseAllocation({
      spendAmount: 20000,
      hasSalesmanReferrer: true,
      configuredRates: {
        manufacturerRate: 0.6,
        devopsRate: 0.1,
        salesmanRate: 0.1,
        adminRate: 0.2,
      },
      owners,
      isShippingSpend: false,
      creditSettings,
    });

    expect(alloc.manufacturer).toBe(9000);
    expect(alloc.manufacturerVat).toBe(0);
    // residual 11000 · weights devops:salesman:admin = 1:1:2
    expect(alloc.devops).toBe(2750);
    expect(alloc.salesman).toBe(2750);
    expect(alloc.admin).toBe(5500);
    expect(alloc.manufacturer + alloc.devops + alloc.salesman + alloc.admin).toBe(
      20000,
    );
  });

  test("request spend without salesman: residual uses 20/80 devops/abuts", () => {
    const alloc = resolveRevenueOwnerBaseAllocation({
      spendAmount: 20000,
      hasSalesmanReferrer: false,
      configuredRates: {
        manufacturerRate: 0,
        devopsRate: 0.1,
        salesmanRate: 0.3,
        adminRate: 0.4,
      },
      owners: { ...owners, salesmanAnchorId: null },
      isShippingSpend: false,
      creditSettings,
    });

    expect(alloc.manufacturer).toBe(9000);
    expect(alloc.salesman).toBe(0);
    // residual 11000 · without-salesman 20:80
    expect(alloc.devops).toBe(2200);
    expect(alloc.admin).toBe(8800);
  });

  test("request spend with salesman: residual 30/10/40 weights", () => {
    const alloc = resolveRevenueOwnerBaseAllocation({
      spendAmount: 20000,
      hasSalesmanReferrer: true,
      configuredRates: {
        manufacturerRate: 0,
        devopsRate: 0.1,
        salesmanRate: 0.3,
        adminRate: 0.4,
      },
      owners,
      isShippingSpend: false,
      creditSettings: {
        manufacturerRequestUnitPrice: 8800,
        manufacturerShippingUnitPrice: 3500,
        affiliateVatRate: 0.1,
      },
    });

    expect(alloc.manufacturer).toBe(8800);
    // residual 11200 · weights 30:10:40
    expect(alloc.salesman).toBe(4200);
    expect(alloc.devops).toBe(1400);
    expect(alloc.admin).toBe(5600);
    expect(alloc.manufacturer + alloc.devops + alloc.salesman + alloc.admin).toBe(
      20000,
    );
  });

  test("PTX dentist-origin shipping: no manufacturer unit, residual to admin", () => {
    const alloc = resolveRevenueOwnerBaseAllocation({
      spendAmount: 3500,
      hasSalesmanReferrer: true,
      configuredRates: {},
      owners,
      isShippingSpend: true,
      applyManufacturerUnit: false,
      creditSettings,
    });

    expect(alloc.manufacturer).toBe(0);
    expect(alloc.manufacturerVat).toBe(0);
    expect(alloc.admin).toBe(3500);
  });

  test("shipping spend: manufacturer unit, residual to admin", () => {
    const alloc = resolveRevenueOwnerBaseAllocation({
      spendAmount: 3500,
      hasSalesmanReferrer: true,
      configuredRates: {},
      owners,
      isShippingSpend: true,
      creditSettings,
    });

    expect(alloc.manufacturer).toBe(3500);
    expect(alloc.manufacturerVat).toBe(0);
    expect(alloc.devops).toBe(0);
    expect(alloc.salesman).toBe(0);
    expect(alloc.admin).toBe(0);
  });

  test("spend below unit: manufacturer capped to spend", () => {
    const alloc = resolveRevenueOwnerBaseAllocation({
      spendAmount: 6500,
      hasSalesmanReferrer: true,
      configuredRates: {},
      owners,
      isShippingSpend: false,
      creditSettings,
    });

    expect(alloc.manufacturer).toBe(6500);
    expect(alloc.manufacturerVat).toBe(0);
    expect(alloc.devops + alloc.salesman + alloc.admin).toBe(0);
  });
});

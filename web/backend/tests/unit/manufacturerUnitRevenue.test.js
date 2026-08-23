// related files:
// - web/backend/services/creditRevenuePolicy.service.js
// change-log:
// - 2026-08-23: 제조사=일반과세. 매입가(부가세 포함)→공급가 분해.
// - 2026-08-18: (철회) 제조사 면세.
// - 2026-08-17: 어벗 qty·플랫폼수수료/기공소배송 제외 테스트.
import {
  resolveManufacturerUnitApply,
  resolveManufacturerUnitEarn,
  resolveRevenueOwnerBaseAllocation,
  splitManufacturerInclusiveUnitPrice,
} from "../../services/creditRevenuePolicy.service.js";

describe("manufacturer fixed unit + residual allocation", () => {
  const owners = {
    manufacturerAnchorId: "mfg",
    devopsAnchorId: "dev",
    salesmanAnchorId: "sales",
    adminAnchorId: "admin",
  };

  const creditSettings = {
    // 부가세 포함 매입가
    manufacturerRequestUnitPrice: 8800,
    manufacturerShippingUnitPrice: 3500,
    affiliateVatRate: 0.1,
    salesmanSharePercent: 30,
    devopsSharePercent: 10,
    abutsSharePercent: 40,
    regularSalesmanSharePercent: 0,
    regularDevopsSharePercent: 20,
    regularAbutsSharePercent: 80,
  };

  test("splitManufacturerInclusiveUnitPrice: 8800 → 8000+800", () => {
    expect(splitManufacturerInclusiveUnitPrice(8800, 0.1)).toEqual({
      supply: 8000,
      vat: 800,
      total: 8800,
      vatRate: 0.1,
    });
  });

  test("resolveManufacturerUnitEarn: request and shipping taxable", () => {
    const request = resolveManufacturerUnitEarn({
      isShippingSpend: false,
      creditSettings,
    });
    expect(request).toEqual({
      supply: 8000,
      vat: 800,
      total: 8800,
      vatRate: 0.1,
      qty: 1,
    });

    const shipping = resolveManufacturerUnitEarn({
      isShippingSpend: true,
      creditSettings,
    });
    expect(shipping).toEqual({
      supply: 3182,
      vat: 318,
      total: 3500,
      vatRate: 0.1,
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

  test("qty 2 abutments: manufacturer supply 16000 + VAT", () => {
    const earn = resolveManufacturerUnitEarn({
      isShippingSpend: false,
      creditSettings,
      qty: 2,
    });
    expect(earn).toEqual({
      supply: 16000,
      vat: 1600,
      total: 17600,
      vatRate: 0.1,
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

    expect(alloc.manufacturer).toBe(8000);
    expect(alloc.manufacturerVat).toBe(800);
    // residual 12000 · weights 30:10:40
    expect(alloc.salesman).toBe(4500);
    expect(alloc.devops).toBe(1500);
    expect(alloc.admin).toBe(6000);
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

    expect(alloc.manufacturer).toBe(8000);
    expect(alloc.salesman).toBe(0);
    // residual 12000 · without-salesman 20:80
    expect(alloc.devops).toBe(2400);
    expect(alloc.admin).toBe(9600);
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
        salesmanSharePercent: 30,
        devopsSharePercent: 10,
        abutsSharePercent: 40,
      },
    });

    expect(alloc.manufacturer).toBe(8000);
    // residual 12000 · weights 30:10:40
    expect(alloc.salesman).toBe(4500);
    expect(alloc.devops).toBe(1500);
    expect(alloc.admin).toBe(6000);
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

    expect(alloc.manufacturer).toBe(3182);
    expect(alloc.manufacturerVat).toBe(318);
    expect(alloc.admin).toBe(318);
  });

  test("remake: manufacturer unit not applied", () => {
    expect(
      resolveManufacturerUnitApply({
        source: "abutment_retail",
        displayKind: "abuts_share",
        abutmentQty: 1,
        isRemake: true,
      }),
    ).toBe(false);
    expect(
      resolveManufacturerUnitApply({
        isShippingSpend: true,
        isRemake: true,
      }),
    ).toBe(true);
  });

  test("free credit paidCap: manufacturer unit only from paid portion", () => {
    const alloc = resolveRevenueOwnerBaseAllocation({
      spendAmount: 20000,
      hasSalesmanReferrer: true,
      configuredRates: {},
      owners,
      isShippingSpend: false,
      creditSettings,
      manufacturerPaidCap: 0,
    });
    expect(alloc.manufacturer).toBe(0);
    expect(alloc.manufacturerVat).toBe(0);
    expect(alloc.salesman + alloc.devops + alloc.admin).toBe(20000);
  });

  test("mixed free+paid: manufacturer capped by paid", () => {
    const alloc = resolveRevenueOwnerBaseAllocation({
      spendAmount: 20000,
      hasSalesmanReferrer: true,
      configuredRates: {},
      owners,
      isShippingSpend: false,
      creditSettings,
      manufacturerPaidCap: 5000,
    });
    expect(alloc.manufacturer).toBe(5000);
    expect(
      alloc.manufacturer + alloc.devops + alloc.salesman + alloc.admin,
    ).toBe(20000);
  });
});


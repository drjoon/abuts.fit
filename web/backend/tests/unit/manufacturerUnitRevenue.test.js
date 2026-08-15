// related files:
// - web/backend/services/creditRevenuePolicy.service.js
import {
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
    manufacturerRequestUnitPrice: 8000,
    manufacturerShippingUnitPrice: 3500,
    affiliateVatRate: 0.1,
  };

  test("resolveManufacturerUnitEarn: request and shipping with VAT", () => {
    const request = resolveManufacturerUnitEarn({
      isShippingSpend: false,
      creditSettings,
    });
    expect(request).toEqual({
      supply: 8000,
      vat: 800,
      total: 8800,
      vatRate: 0.1,
    });

    const shipping = resolveManufacturerUnitEarn({
      isShippingSpend: true,
      creditSettings,
    });
    expect(shipping).toEqual({
      supply: 3500,
      vat: 350,
      total: 3850,
      vatRate: 0.1,
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
    // residual 12000 · weights devops:salesman:admin = 1:1:2
    expect(alloc.devops).toBe(3000);
    expect(alloc.salesman).toBe(3000);
    expect(alloc.admin).toBe(6000);
    expect(alloc.manufacturer + alloc.devops + alloc.salesman + alloc.admin).toBe(
      20000,
    );
  });

  test("request spend without salesman: salesman share → admin", () => {
    const alloc = resolveRevenueOwnerBaseAllocation({
      spendAmount: 20000,
      hasSalesmanReferrer: false,
      configuredRates: {
        manufacturerRate: 0.6,
        devopsRate: 0.1,
        salesmanRate: 0.1,
        adminRate: 0.2,
      },
      owners: { ...owners, salesmanAnchorId: null },
      isShippingSpend: false,
      creditSettings,
    });

    expect(alloc.manufacturer).toBe(8000);
    expect(alloc.salesman).toBe(0);
    // residual weights devops:admin = 0.1 : (0.2+0.1) = 1:3 of 12000
    expect(alloc.devops).toBe(3000);
    expect(alloc.admin).toBe(9000);
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
    expect(alloc.manufacturerVat).toBe(350);
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
    expect(alloc.manufacturerVat).toBe(650);
    expect(alloc.devops + alloc.salesman + alloc.admin).toBe(0);
  });
});

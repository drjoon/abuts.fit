// related files:
// - web/backend/controllers/requests/signupFreeTest.utils.js
import {
  SIGNUP_FREE_TEST_LIMIT,
  applySignupFreeTestPricingToBatch,
  buildSignupFreeTestPrice,
  getSignupFreeTestQuota,
  isSignupFreeTestEligibleBusinessType,
  isSignupFreeTestPriceRule,
} from "../../controllers/requests/signupFreeTest.utils.js";

describe("signupFreeTestQuota (abolished)", () => {
  test("eligible business types are disabled for new grants", () => {
    expect(isSignupFreeTestEligibleBusinessType("requestor")).toBe(false);
    expect(isSignupFreeTestEligibleBusinessType("manufacturer")).toBe(false);
    expect(isSignupFreeTestEligibleBusinessType("admin")).toBe(false);
    expect(isSignupFreeTestEligibleBusinessType("")).toBe(false);
  });

  test("quota always returns remaining 0", async () => {
    const quota = await getSignupFreeTestQuota({
      requestorOrgId: "507f1f77bcf86cd799439011",
    });
    expect(quota.eligible).toBe(false);
    expect(quota.remaining).toBe(0);
    expect(quota.limit).toBe(SIGNUP_FREE_TEST_LIMIT);
    expect(SIGNUP_FREE_TEST_LIMIT).toBe(0);
  });

  test("buildSignupFreeTestPrice still labels legacy rule for old docs", () => {
    const price = buildSignupFreeTestPrice({
      baseUnitPrice: 15000,
      used: 0,
      remaining: 1,
    });
    expect(price.amount).toBe(0);
    expect(isSignupFreeTestPriceRule(price.rule)).toBe(true);
    expect(price.discountMeta.abolished).toBe(true);
  });

  test("applySignupFreeTestPricingToBatch is no-op", () => {
    const items = [
      { computedPrice: { amount: 15000, baseAmount: 15000 } },
      { computedPrice: { amount: 15000, baseAmount: 15000 } },
    ];
    const result = applySignupFreeTestPricingToBatch(items, {
      remaining: 2,
      used: 0,
      baseUnitPrice: 15000,
    });
    expect(result.applied).toBe(0);
    expect(isSignupFreeTestPriceRule(items[0].computedPrice?.rule)).toBe(false);
    expect(items[0].computedPrice.amount).toBe(15000);
  });
});

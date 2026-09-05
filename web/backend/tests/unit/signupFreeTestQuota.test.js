// related files:
// - web/backend/controllers/requests/signupFreeTest.utils.js
import { describe, expect, test } from "@jest/globals";
import {
  SIGNUP_FREE_TEST_LIMIT,
  applySignupFreeTestPricingToBatch,
  buildSignupFreeTestPrice,
  isSignupFreeTestEligibleBusinessType,
  isSignupFreeTestPriceRule,
} from "../../controllers/requests/signupFreeTest.utils.js";

describe("signup free test pure helpers", () => {
  test("practice and lab requestor types are eligible; manufacturer is not", () => {
    expect(isSignupFreeTestEligibleBusinessType("requestor")).toBe(true);
    expect(isSignupFreeTestEligibleBusinessType("manufacturer")).toBe(false);
    expect(isSignupFreeTestEligibleBusinessType("admin")).toBe(false);
    expect(isSignupFreeTestEligibleBusinessType("")).toBe(false);
  });

  test("buildSignupFreeTestPrice is 0 with signup_free_test_2 rule", () => {
    const price = buildSignupFreeTestPrice({
      baseUnitPrice: 15000,
      used: 0,
      remaining: 2,
    });
    expect(price.amount).toBe(0);
    expect(isSignupFreeTestPriceRule(price.rule)).toBe(true);
    expect(price.discountMeta.signupFreeTestLimit).toBe(SIGNUP_FREE_TEST_LIMIT);
  });

  test("applySignupFreeTestPricingToBatch assigns until remaining is 0", () => {
    const items = [{ computedPrice: { baseAmount: 15000 } }, { computedPrice: { baseAmount: 15000 } }, { computedPrice: { baseAmount: 15000 } }];
    const { applied, remaining } = applySignupFreeTestPricingToBatch(items, {
      remaining: 2,
      used: 0,
      baseUnitPrice: 15000,
    });
    expect(applied).toBe(2);
    expect(remaining).toBe(0);
    expect(isSignupFreeTestPriceRule(items[0].computedPrice.rule)).toBe(true);
    expect(isSignupFreeTestPriceRule(items[1].computedPrice.rule)).toBe(true);
    expect(isSignupFreeTestPriceRule(items[2].computedPrice?.rule)).toBe(false);
  });
});

// related files:
// - web/backend/controllers/requests/creation.helpers.controller.js
import {
  buildInsufficientCreditSubmissionAdvice,
  countAffordableRequestSubmissions,
} from "../../controllers/requests/creation.helpers.controller.js";

describe("countAffordableRequestSubmissions", () => {
  const case15k = (n) =>
    Array.from({ length: n }, () => ({
      computedPrice: { amount: 15000, rule: "base_price" },
      caseInfos: { productMode: "custom_abutment", tooth: "16" },
      shippingMode: "normal",
    }));

  test("40,000원 잔액이면 15,000원짜리 4건 중 2건만 가능", () => {
    expect(
      countAffordableRequestSubmissions({
        cases: case15k(4),
        totalAvailable: 40_000,
        totalShippingFee: 0,
      }),
    ).toBe(2);
  });

  test("배송비를 먼저 빼고 건수를 센다", () => {
    expect(
      countAffordableRequestSubmissions({
        cases: case15k(2),
        totalAvailable: 20_000,
        totalShippingFee: 5_000,
      }),
    ).toBe(1);
  });
});

describe("buildInsufficientCreditSubmissionAdvice", () => {
  test("제출 건수 초과 시 건수 줄이기 안내", () => {
    const msg = buildInsufficientCreditSubmissionAdvice({
      requestCount: 4,
      affordableRequestCount: 2,
      totalAvailable: 40_000,
    });
    expect(msg).toContain("2건까지");
    expect(msg).toContain("4건");
    expect(msg).toContain("2건 이하");
  });
});

// related files:
// - web/backend/utils/creditSettingsDefaults.js
// - web/backend/controllers/requests/utils.js
import { resolveCustomAbutmentRequestUnitPrice } from "../../utils/creditSettingsDefaults.js";

describe("custom abutment request unit price", () => {
  test("플랫폼 설정 minCreditForRequest를 쓴다", () => {
    expect(
      resolveCustomAbutmentRequestUnitPrice({
        minCreditForRequest: 15000,
        membershipProductionPrice: 15000,
      }),
    ).toBe(15000);
  });

  test("minCredit가 없으면 멤버십 생산가(플랫폼 고시)를 쓴다", () => {
    expect(
      resolveCustomAbutmentRequestUnitPrice({
        membershipProductionPrice: 15000,
      }),
    ).toBe(15000);
  });
});

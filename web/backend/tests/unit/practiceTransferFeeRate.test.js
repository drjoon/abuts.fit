// related files:
// - web/backend/services/creditRevenuePolicy.service.js
import {
  DEFAULT_PLATFORM_FEE_RATE,
  resolvePlatformFeeRate,
  resolvePracticeTransferFeeRate,
} from "../../services/creditRevenuePolicy.service.js";

describe("resolvePracticeTransferFeeRate", () => {
  test("지정 기공소 의뢰는 0%", () => {
    expect(
      resolvePracticeTransferFeeRate({
        matchingMode: "direct",
        payoutRates: { platformFeeRate: 0.2 },
      }),
    ).toBe(0);
  });

  test("자동 매칭은 platformFeeRate를 쓴다", () => {
    expect(
      resolvePracticeTransferFeeRate({
        matchingMode: "auto",
        payoutRates: { platformFeeRate: 0.2, partnerFeeRate: 0, nonPartnerFeeRate: 0.25 },
      }),
    ).toBe(0.2);
  });

  test("등록/미등록 관계와 무관하다", () => {
    const rates = { platformFeeRate: 0.15, partnerFeeRate: 0, nonPartnerFeeRate: 0.4 };
    expect(
      resolvePracticeTransferFeeRate({ matchingMode: "auto", payoutRates: rates }),
    ).toBe(0.15);
  });

  test("platformFeeRate가 없으면 nonPartnerFeeRate로 fallback", () => {
    expect(resolvePlatformFeeRate({ nonPartnerFeeRate: 0.3 })).toBe(0.3);
    expect(resolvePlatformFeeRate({})).toBe(DEFAULT_PLATFORM_FEE_RATE);
  });
});

// related files:
// - web/backend/services/creditRevenuePolicy.service.js
import {
  DEFAULT_DIRECT_PLATFORM_FEE_RATE,
  DEFAULT_PLATFORM_FEE_RATE,
  resolveDirectPlatformFeeRate,
  resolvePlatformFeeRate,
  resolvePracticeTransferFeeRate,
} from "../../services/creditRevenuePolicy.service.js";

describe("resolvePracticeTransferFeeRate", () => {
  test("지정 거래는 directPlatformFeeRate(기본 5%)", () => {
    expect(
      resolvePracticeTransferFeeRate({
        matchingMode: "direct",
        payoutRates: { platformFeeRate: 0.2 },
      }),
    ).toBe(DEFAULT_DIRECT_PLATFORM_FEE_RATE);
    expect(
      resolvePracticeTransferFeeRate({
        matchingMode: "direct",
        payoutRates: { platformFeeRate: 0.2, directPlatformFeeRate: 0.05 },
      }),
    ).toBe(0.05);
  });

  test("매칭 거래는 platformFeeRate를 쓴다", () => {
    expect(
      resolvePracticeTransferFeeRate({
        matchingMode: "auto",
        payoutRates: {
          platformFeeRate: 0.2,
          directPlatformFeeRate: 0.05,
          partnerFeeRate: 0,
          nonPartnerFeeRate: 0.25,
        },
      }),
    ).toBe(0.2);
  });

  test("등록/미등록 관계와 무관하다", () => {
    const rates = {
      platformFeeRate: 0.15,
      directPlatformFeeRate: 0.05,
      partnerFeeRate: 0,
      nonPartnerFeeRate: 0.4,
    };
    expect(
      resolvePracticeTransferFeeRate({ matchingMode: "auto", payoutRates: rates }),
    ).toBe(0.15);
  });

  test("platformFeeRate가 없으면 nonPartnerFeeRate로 fallback", () => {
    expect(resolvePlatformFeeRate({ nonPartnerFeeRate: 0.3 })).toBe(0.3);
    expect(resolvePlatformFeeRate({})).toBe(DEFAULT_PLATFORM_FEE_RATE);
  });

  test("directPlatformFeeRate 미설정 시 기본 5%", () => {
    expect(resolveDirectPlatformFeeRate({})).toBe(
      DEFAULT_DIRECT_PLATFORM_FEE_RATE,
    );
  });
});

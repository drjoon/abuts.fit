// related files:
// - web/backend/services/creditRevenuePolicy.service.js
import {
  DEFAULT_DIRECT_PLATFORM_FEE_RATE,
  DEFAULT_PLATFORM_FEE_RATE,
  isDirectPlatformFeeEnabled,
  resolveDirectPlatformFeeRate,
  resolveDirectPlatformFeeRateConfigured,
  resolvePlatformFeeRate,
  resolvePracticeTransferFeeRate,
} from "../../services/creditRevenuePolicy.service.js";

describe("resolvePracticeTransferFeeRate", () => {
  test("지정 거래는 적용 off(기본)면 0(무료)", () => {
    expect(
      resolvePracticeTransferFeeRate({
        matchingMode: "direct",
        payoutRates: { platformFeeRate: 0.2, directPlatformFeeRate: 0.05 },
      }),
    ).toBe(0);
    expect(
      isDirectPlatformFeeEnabled({
        directPlatformFeeEnabled: false,
        directPlatformFeeRate: 0.05,
      }),
    ).toBe(false);
  });

  test("지정 거래 적용 on이면 directPlatformFeeRate", () => {
    expect(
      resolvePracticeTransferFeeRate({
        matchingMode: "direct",
        payoutRates: {
          platformFeeRate: 0.2,
          directPlatformFeeEnabled: true,
          directPlatformFeeRate: 0.05,
        },
      }),
    ).toBe(0.05);
  });

  test("매칭 거래는 platformFeeRate를 쓴다", () => {
    expect(
      resolvePracticeTransferFeeRate({
        matchingMode: "auto",
        payoutRates: {
          platformFeeRate: 0.2,
          directPlatformFeeEnabled: true,
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
      directPlatformFeeEnabled: true,
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

  test("설정 요율은 적용 off여도 유지되고 실효는 0", () => {
    expect(resolveDirectPlatformFeeRateConfigured({})).toBe(
      DEFAULT_DIRECT_PLATFORM_FEE_RATE,
    );
    expect(resolveDirectPlatformFeeRate({})).toBe(0);
    expect(
      resolveDirectPlatformFeeRate({
        directPlatformFeeEnabled: true,
        directPlatformFeeRate: 0.08,
      }),
    ).toBe(0.08);
  });
});

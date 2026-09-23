// related files:
// - web/backend/services/creditRevenuePolicy.service.js
import {
  DEFAULT_DIRECT_PLATFORM_FEE_ENABLED,
  DEFAULT_DIRECT_PLATFORM_FEE_RATE,
  DEFAULT_PLATFORM_FEE_RATE,
  DEFAULT_SUBCONTRACT_FEE_RATE,
  isDirectPlatformFeeEnabled,
  resolveDirectPlatformFeeRate,
  resolveDirectPlatformFeeRateConfigured,
  resolvePlatformFeeRate,
  resolvePracticeTransferFeeRate,
  resolvePracticeTransferFeeRateForViewer,
} from "../../services/creditRevenuePolicy.service.js";

describe("resolvePracticeTransferFeeRate", () => {
  test("지정 거래 기본(미설정)은 없음(실효 0%)", () => {
    expect(
      resolvePracticeTransferFeeRate({
        matchingMode: "direct",
        payoutRates: {},
      }),
    ).toBe(0);
    expect(isDirectPlatformFeeEnabled({})).toBe(false);
    expect(DEFAULT_DIRECT_PLATFORM_FEE_ENABLED).toBe(false);
    expect(DEFAULT_DIRECT_PLATFORM_FEE_RATE).toBe(0);
    expect(resolveDirectPlatformFeeRateConfigured({})).toBe(0);
  });

  test("지정 거래 명시적 off면 0", () => {
    expect(
      resolvePracticeTransferFeeRate({
        matchingMode: "direct",
        payoutRates: {
          platformFeeRate: 0.2,
          directPlatformFeeEnabled: false,
          directPlatformFeeRate: 0.03,
        },
      }),
    ).toBe(0);
    expect(
      isDirectPlatformFeeEnabled({
        directPlatformFeeEnabled: false,
        directPlatformFeeRate: 0.03,
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

  test("하청이면 지정 on이어도 subcontractFeeRate", () => {
    expect(
      resolvePracticeTransferFeeRate({
        matchingMode: "direct",
        subcontracted: true,
        payoutRates: {
          platformFeeRate: 0.2,
          subcontractFeeRate: 0.05,
          directPlatformFeeEnabled: true,
          directPlatformFeeRate: 0.02,
        },
      }),
    ).toBe(0.05);
  });

  test("협력(subcontracted=false)은 지정 on이어도 0(direct off)·또는 direct rate", () => {
    expect(
      resolvePracticeTransferFeeRate({
        matchingMode: "direct",
        subcontracted: false,
        payoutRates: {
          subcontractFeeRate: 0.05,
          directPlatformFeeEnabled: false,
          directPlatformFeeRate: 0.02,
        },
      }),
    ).toBe(0);
  });

  test("하청 수행은 subcontractFeeRate(기본 5%)", () => {
    expect(DEFAULT_SUBCONTRACT_FEE_RATE).toBe(0.05);
    expect(
      resolvePracticeTransferFeeRate({
        matchingMode: "auto",
        subcontracted: true,
        payoutRates: {},
      }),
    ).toBe(0.05);
    expect(
      resolvePracticeTransferFeeRate({
        matchingMode: "auto",
        subcontracted: true,
        payoutRates: { subcontractFeeRate: 0.2, platformFeeRate: 0.1 },
      }),
    ).toBe(0.2);
  });

  test("하청 후 원청 견적은 전액 수주(0), 하청은 subcontractFeeRate", () => {
    expect(
      resolvePracticeTransferFeeRateForViewer({
        matchingMode: "auto",
        subcontracted: true,
        viewerIsPrimeContractor: true,
        payoutRates: { subcontractFeeRate: 0.05 },
      }),
    ).toBe(0);
    expect(
      resolvePracticeTransferFeeRateForViewer({
        matchingMode: "auto",
        subcontracted: true,
        viewerIsPrimeContractor: false,
        payoutRates: { subcontractFeeRate: 0.05 },
      }),
    ).toBe(0.05);
  });

  test("platformFeeRate가 없으면 nonPartnerFeeRate로 fallback", () => {
    expect(resolvePlatformFeeRate({ nonPartnerFeeRate: 0.3 })).toBe(0.3);
    expect(resolvePlatformFeeRate({})).toBe(DEFAULT_PLATFORM_FEE_RATE);
  });

  test("설정 요율은 적용 off여도 유지되고 실효는 0", () => {
    expect(
      resolveDirectPlatformFeeRateConfigured({
        directPlatformFeeEnabled: false,
        directPlatformFeeRate: 0.08,
      }),
    ).toBe(0.08);
    expect(
      resolveDirectPlatformFeeRate({
        directPlatformFeeEnabled: false,
        directPlatformFeeRate: 0.08,
      }),
    ).toBe(0);
    expect(
      resolveDirectPlatformFeeRate({
        directPlatformFeeEnabled: true,
        directPlatformFeeRate: 0.08,
      }),
    ).toBe(0.08);
  });
});

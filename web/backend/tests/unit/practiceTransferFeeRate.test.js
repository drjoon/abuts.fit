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
  resolveLabPlatformFeeRate,
  resolvePlatformFeeRate,
  resolvePracticeTransferFeeRate,
  resolvePracticeTransferFeeRateForViewer,
  snapshottedPracticeTransferFeeRate,
} from "../../services/creditRevenuePolicy.service.js";

const FEE_ON = { directPlatformFeeEnabled: true, directPlatformFeeRate: 0.02 };
const FEE_EVENT = {
  directPlatformFeeEnabled: false,
  directPlatformFeeRate: 0.02,
};

describe("resolvePracticeTransferFeeRate", () => {
  test("기본(미설정)은 정책 2%·이벤트 면제(실효 0%)", () => {
    expect(
      resolvePracticeTransferFeeRate({
        matchingMode: "direct",
        payoutRates: {},
      }),
    ).toBe(0);
    expect(isDirectPlatformFeeEnabled({})).toBe(false);
    expect(DEFAULT_DIRECT_PLATFORM_FEE_ENABLED).toBe(false);
    expect(DEFAULT_DIRECT_PLATFORM_FEE_RATE).toBe(0.02);
    expect(resolveDirectPlatformFeeRateConfigured({})).toBe(0.02);
  });

  test("저장된 요율은 그대로 유지(자동 승격 없음)·이벤트면 실효 0", () => {
    expect(
      resolveDirectPlatformFeeRateConfigured({
        directPlatformFeeEnabled: false,
        directPlatformFeeRate: 0.05,
      }),
    ).toBe(0.05);
    expect(
      resolveDirectPlatformFeeRateConfigured({
        directPlatformFeeEnabled: false,
        directPlatformFeeRate: 0,
      }),
    ).toBe(0);
    expect(
      resolveDirectPlatformFeeRate({
        directPlatformFeeEnabled: false,
        directPlatformFeeRate: 0.05,
      }),
    ).toBe(0);
    expect(resolveDirectPlatformFeeRate(FEE_ON)).toBe(0.02);
  });

  test("협력은 적용 on이면 플랫폼 사용료, 이벤트면 0", () => {
    expect(
      resolvePracticeTransferFeeRate({
        matchingMode: "direct",
        payoutRates: FEE_ON,
      }),
    ).toBe(0.02);
    expect(
      resolvePracticeTransferFeeRate({
        matchingMode: "direct",
        payoutRates: FEE_EVENT,
      }),
    ).toBe(0);
  });

  test("하청은 subcontractFeeRate + 플랫폼 사용료, 이벤트면 하청 요율만", () => {
    expect(DEFAULT_SUBCONTRACT_FEE_RATE).toBe(0.1);
    expect(
      resolvePracticeTransferFeeRate({
        matchingMode: "direct",
        subcontracted: true,
        payoutRates: { ...FEE_ON, subcontractFeeRate: 0.1 },
      }),
    ).toBeCloseTo(0.12);
    expect(
      resolvePracticeTransferFeeRate({
        matchingMode: "auto",
        subcontracted: true,
        payoutRates: { ...FEE_EVENT, subcontractFeeRate: 0.1 },
      }),
    ).toBe(0.1);
    expect(
      resolvePracticeTransferFeeRate({
        matchingMode: "auto",
        subcontracted: true,
        payoutRates: {},
      }),
    ).toBe(0.1);
  });

  test("어벗츠기공소 수행은 적용 on이어도 항상 면제", () => {
    expect(
      resolveLabPlatformFeeRate({
        payoutRates: FEE_ON,
        performerIsInternal: true,
      }),
    ).toBe(0);
    expect(
      resolvePracticeTransferFeeRate({
        matchingMode: "direct",
        performerIsInternal: true,
        payoutRates: FEE_ON,
      }),
    ).toBe(0);
  });

  test("학습 이용 동의는 요율에 반영하지 않는다", () => {
    for (const aiTrainingConsent of [true, false, undefined]) {
      expect(
        resolvePracticeTransferFeeRate({
          matchingMode: "direct",
          aiTrainingConsent,
          payoutRates: FEE_ON,
        }),
      ).toBe(0.02);
    }
  });

  test("레거시 자동매칭(하청 아님)은 0", () => {
    expect(
      resolvePracticeTransferFeeRate({
        matchingMode: "auto",
        payoutRates: FEE_ON,
      }),
    ).toBe(0);
  });

  test("하청 후 원청 견적은 전액 수주(0), 하청은 하청 요율+사용료", () => {
    expect(
      resolvePracticeTransferFeeRateForViewer({
        matchingMode: "auto",
        subcontracted: true,
        viewerIsPrimeContractor: true,
        payoutRates: { ...FEE_ON, subcontractFeeRate: 0.05 },
      }),
    ).toBe(0);
    expect(
      resolvePracticeTransferFeeRateForViewer({
        matchingMode: "auto",
        subcontracted: true,
        viewerIsPrimeContractor: false,
        payoutRates: { ...FEE_ON, subcontractFeeRate: 0.05 },
      }),
    ).toBeCloseTo(0.07);
  });

  test("작업시작으로 박힌 요율은 스위치를 바꿔도 다시 계산하지 않는다", () => {
    const billing = { billedAt: new Date(), feeRateApplied: 0 };
    expect(snapshottedPracticeTransferFeeRate(billing)).toBe(0);
    expect(
      resolvePracticeTransferFeeRateForViewer({
        matchingMode: "direct",
        subcontracted: false,
        billing,
        payoutRates: FEE_ON,
      }),
    ).toBe(0);
  });

  test("platformFeeRate가 없으면 nonPartnerFeeRate로 fallback", () => {
    expect(resolvePlatformFeeRate({ nonPartnerFeeRate: 0.3 })).toBe(0.3);
    expect(resolvePlatformFeeRate({})).toBe(DEFAULT_PLATFORM_FEE_RATE);
  });
});

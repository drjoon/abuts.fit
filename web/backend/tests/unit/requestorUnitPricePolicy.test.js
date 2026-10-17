// related files:
// - web/backend/utils/requestorUnitPricePolicy.js
// - web/backend/services/openBankingAdapter.service.js
import {
  resolveRequestorUnitPrice,
  validateDealerUnitPrice,
  computeDealerCommission,
  dealerCommissionFromQuotedPrice,
  isPracticeDepositGuidanceRequired,
} from "../../utils/requestorUnitPricePolicy.js";
import {
  registerLongTermConsent,
  verifyBiometricReauth,
  executeBatchWithdrawal,
} from "../../services/openBankingAdapter.service.js";

describe("requestorUnitPricePolicy", () => {
  test("딜러가 없으면 기본 1.5만 단일가", () => {
    expect(resolveRequestorUnitPrice({})).toMatchObject({ unitPrice: 15000, rule: "base_price" });
  });

  test("딜러 설정가는 1.2~1.5만만 허용", () => {
    expect(validateDealerUnitPrice(12000).ok).toBe(true);
    expect(validateDealerUnitPrice(15000).ok).toBe(true);
    expect(validateDealerUnitPrice(11999).ok).toBe(false);
    expect(validateDealerUnitPrice(15001).ok).toBe(false);
    expect(validateDealerUnitPrice(13000.5).ok).toBe(false);
    expect(validateDealerUnitPrice("abc").ok).toBe(false);
  });

  test("범위 밖 저장값은 무시하고 기본가", () => {
    expect(resolveRequestorUnitPrice({ dealerUnitPrice: 9000 }).unitPrice).toBe(15000);
    expect(resolveRequestorUnitPrice({ dealerUnitPrice: 13000 })).toMatchObject({
      unitPrice: 13000,
      rule: "dealer_price",
    });
  });

  test("딜러 수수료 = 판매가 − 1만원", () => {
    expect(computeDealerCommission(13000)).toBe(3000);
    expect(computeDealerCommission(15000)).toBe(5000);
  });

  test("견적 수수료는 생산 판매가와 수량으로 계산한다", () => {
    expect(dealerCommissionFromQuotedPrice({ amount: 13500 })).toBe(3500);
    expect(
      dealerCommissionFromQuotedPrice({ amount: 27000, abutmentQty: 2 }),
    ).toBe(7000);
    expect(
      dealerCommissionFromQuotedPrice({
        amount: 18500,
        designFee: 5000,
        expressFee: 0,
      }),
    ).toBe(3500);
    expect(
      dealerCommissionFromQuotedPrice({
        amount: 15500,
        expressFee: 2000,
        expressFeeStatus: "charged",
      }),
    ).toBe(3500);
    expect(dealerCommissionFromQuotedPrice({ amount: 10000 })).toBe(0);
    expect(
      dealerCommissionFromQuotedPrice({ paidAmount: null, amount: 12000 }),
    ).toBe(2000);
  });

  test("월 이용 금액이 1천만원을 넘는 치과만 보증금 안내 대상이다", () => {
    expect(isPracticeDepositGuidanceRequired(10_000_000)).toBe(false);
    expect(isPracticeDepositGuidanceRequired(10_000_001)).toBe(true);
    expect(isPracticeDepositGuidanceRequired(0)).toBe(false);
  });
});

describe("openBankingAdapter", () => {
  test("장기동의 등록 시 90일 유효기한과 마스킹 계좌를 반환하고 일괄출금 및 생체 재인증을 처리한다", async () => {
    const now = new Date("2026-10-01T00:00:00.000Z");
    const consent = await registerLongTermConsent({
      practiceAnchorId: "66f000000000000000000001",
      bankCode: "088",
      bankName: "신한은행",
      accountNumber: "110123456789",
      accountHolder: "서울치과",
      now,
    });

    expect(consent.fintechUseNum).toMatch(/^OB-088-/);
    expect(consent.accountNumberMasked).toBe("110-*****-6789");
    expect(
      Math.round(
        (consent.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
      ),
    ).toBe(90);

    const reauth = await verifyBiometricReauth({
      consent: { ...consent, passkeyCounter: 1 },
      passkeyAssertion: { credentialId: consent.passkeyCredentialId },
      now: new Date("2026-12-25T00:00:00.000Z"),
    });
    expect(reauth.ok).toBe(true);
    expect(reauth.nextCounter).toBe(2);

    const lines = [
      { _id: "line1", amount: 1_200_000, transferStatus: "PENDING" },
      { _id: "line2", amount: 800_000, transferStatus: "PENDING" },
    ];
    const batchOk = await executeBatchWithdrawal({
      fintechUseNum: consent.fintechUseNum,
      monthlyCapAmount: 5_000_000,
      lines,
      now,
    });
    expect(batchOk.allSucceeded).toBe(true);

    const batchFail = await executeBatchWithdrawal({
      fintechUseNum: consent.fintechUseNum,
      monthlyCapAmount: 5_000_000,
      lines,
      options: { simulateInsufficientFunds: true },
      now,
    });
    expect(batchFail.allSucceeded).toBe(false);
    expect(batchFail.results[0].transferStatus).toBe("FAILED");
  });
});

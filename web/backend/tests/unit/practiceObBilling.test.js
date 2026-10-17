// related files:
// - web/backend/services/practiceObBilling.service.js
// - web/backend/jobs/monthlyPracticeObSettlementWorker.js
// - web/backend/utils/creditLock.util.js
// - web/backend/models/businessAnchor.model.js
// - web/backend/models/practiceMonthlySettlement.model.js
import BusinessAnchor from "../../models/businessAnchor.model.js";
import {
  aggregatePracticeMonthUsage,
  confirmPracticeMonthlySettlement,
  getPracticeObBillingOverview,
  reauthenticatePracticeOpenBanking,
  runPracticeMonthlySettlementTransfer,
  setupPracticeOpenBankingConsent,
  transferPracticeLabDeposit,
  listPracticeLabDeposits,
} from "../../services/practiceObBilling.service.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import Request from "../../models/request.model.js";
import { Types } from "mongoose";
import {
  checkCreditLock,
  checkPracticeSettlementLock,
} from "../../utils/creditLock.util.js";

describe("practiceObBilling & checkCreditLock", () => {
  test("aggregatePracticeMonthUsage — 기공물은 수행 기공소, 커스텀어벗만 법인", async () => {
    const practice = await BusinessAnchor.create({
      businessNumberNormalized: "5234567890",
      businessType: "requestor",
      requestorKind: "practice",
      name: "집계치과",
    });
    const internalLab = await BusinessAnchor.create({
      businessNumberNormalized: "5234567891",
      businessType: "internalLab",
      name: "어벗츠기공소",
      payoutAccount: {
        bankName: "국민은행",
        accountNumber: "110-111-111111",
        holderName: "어벗츠기공소",
      },
    });
    const partnerLab = await BusinessAnchor.create({
      businessNumberNormalized: "5234567892",
      businessType: "requestor",
      requestorKind: "lab",
      name: "협력기공소",
      payoutAccount: {
        bankName: "국민은행",
        accountNumber: "110-222-222222",
        holderName: "협력기공소",
      },
    });
    await BusinessAnchor.create({
      businessNumberNormalized: "5234567893",
      businessType: "admin",
      name: "어벗츠 주식회사",
      payoutAccount: {
        bankName: "신한은행",
        accountNumber: "140-999-888777",
        holderName: "주식회사 어벗츠",
      },
    });
    const createdAt = new Date("2026-09-15T10:00:00+09:00");
    const userId = new Types.ObjectId();
    await PracticeTransfer.create({
      transferId: "ptx-ob-1",
      practiceUserId: userId,
      practiceBusinessAnchorId: practice._id,
      targetLabAnchorId: internalLab._id,
      assigneeLabAnchorId: partnerLab._id,
      assigneeKind: "cooperation",
      status: "accepted",
      createdAt,
      billing: { labFeeTotal: 100_000, abutmentTotal: 30_000 },
    });
    await PracticeTransfer.create({
      transferId: "ptx-ob-2",
      practiceUserId: userId,
      practiceBusinessAnchorId: practice._id,
      targetLabAnchorId: internalLab._id,
      status: "accepted",
      createdAt,
      billing: { labFeeTotal: 200_000, abutmentTotal: 50_000 },
    });
    await Request.create({
      businessAnchorId: practice._id,
      requestor: userId,
      requestCategory: "order",
      manufacturerStage: "준비",
      createdAt,
      price: { amount: 45_000, paidAmount: 45_000 },
    });
    const usage = await aggregatePracticeMonthUsage({
      practiceAnchorId: practice._id,
      yearMonth: "2026-09",
    });
    expect(usage.directLabTotal).toBe(300_000);
    expect(usage.abutsCorpTotal).toBe(125_000);
    const directLines = usage.lines.filter((l) => l.payeeKind === "direct_lab");
    expect(directLines).toHaveLength(2);
    const corpLine = usage.lines.find((l) => l.payeeKind === "abuts_corp");
    expect(corpLine?.payeeName).toBe("어벗츠 주식회사");
    expect(corpLine?.amount).toBe(125_000);
  });

  test("현금 보증금 없이 한도 없이 OB 장기동의 등록 → 정산일 자동이체 실패 시 즉시 Hold → Face ID 1탭 재이체 및 90일 재인증 시 해제", async () => {
    const practice = await BusinessAnchor.create({
      businessNumberNormalized: "1234567890",
      businessType: "requestor",
      requestorKind: "practice",
      name: "테스트치과",
    });

    // 1. 오픈뱅킹 장기동의 등록 + 패스키 연결
    const consent = await setupPracticeOpenBankingConsent({
      practiceAnchorId: practice._id,
      bankCode: "088",
      bankName: "신한은행",
      accountNumber: "110123456789",
      accountHolder: "테스트치과",
      passkeyCredentialId: "pk-test-1",
    });
    expect(consent.status).toBe("active");
    expect(consent.monthlyCapAmount).toBe(0);

    // 정상 상태에서 잠금 없음
    const lockBefore = await checkPracticeSettlementLock(practice._id);
    expect(lockBefore.isLocked).toBe(false);

    // 2. 매월 1일 정산서 확정 생성 (직거래 기공소 150만 + 어벗츠 법인 50만 = 200만)
    const settlement = await confirmPracticeMonthlySettlement({
      practiceAnchorId: practice._id,
      yearMonth: "2026-09",
      overrideLines: [
        {
          payeeKind: "direct_lab",
          payeeName: "일등기공소",
          bankCode: "004",
          bankName: "국민은행",
          accountNumber: "111-222-333",
          holderName: "일등기공소",
          amount: 1_500_000,
          transferStatus: "PENDING",
        },
        {
          payeeKind: "abuts_corp",
          payeeName: "어벗츠 주식회사(기공사업부)",
          bankCode: "088",
          bankName: "신한은행",
          accountNumber: "140-000-111",
          holderName: "주식회사 어벗츠",
          amount: 500_000,
          transferStatus: "PENDING",
        },
      ],
    });
    expect(settlement.status).toBe("CONFIRMED");
    expect(settlement.totalAmount).toBe(2_000_000);

    // 3. 매월 5일 09:00 자동이체 실행 — 잔액 부족 실패 시뮬레이션
    const failedAt = new Date("2026-10-05T00:00:00.000Z");
    const afterFail = await runPracticeMonthlySettlementTransfer({
      settlementId: settlement._id,
      options: { simulateInsufficientFunds: true },
      now: failedAt,
    });
    expect(afterFail.status).toBe("FAILED");

    // 실패 즉시 신규 의뢰 Hold 작동 확인
    const lockOnFail = await checkPracticeSettlementLock(practice._id);
    expect(lockOnFail.isLocked).toBe(true);
    expect(lockOnFail.reason).toContain("잔액 부족");
    // 선불 크레딧 주문(커스텀어벗)은 기존 잠금만 적용되어 막히지 않는다
    expect((await checkCreditLock(practice._id)).isLocked).toBe(false);

    const overviewOnFail = await getPracticeObBillingOverview({
      practiceAnchorId: practice._id,
    });
    expect(overviewOnFail.depositGuidance.required).toBe(false);
    expect(overviewOnFail.openBankingConsent.paymentHold.isHeld).toBe(true);

    // 4. 치과 앱에서 Face ID 1탭 재이체 성공 시 Hold 즉시 해제
    const afterRetry = await runPracticeMonthlySettlementTransfer({
      settlementId: settlement._id,
      options: { biometricVerified: true },
      now: new Date("2026-10-06T00:00:00.000Z"),
    });
    expect(afterRetry.status).toBe("COMPLETED");

    const lockAfterRetry = await checkPracticeSettlementLock(practice._id);
    expect(lockAfterRetry.isLocked).toBe(false);

    // 5. 90일 경과 시 재인증 만료로 Hold → Face ID 재인증 시 해제
    const expiredCheck = await checkPracticeSettlementLock(
      practice._id,
      new Date(Date.now() + 95 * 24 * 60 * 60 * 1000),
    );
    expect(expiredCheck.isLocked).toBe(true);
    expect(expiredCheck.reason).toContain("90일");

    const reauthRes = await reauthenticatePracticeOpenBanking({
      practiceAnchorId: practice._id,
      passkeyAssertion: { credentialId: "pk-test-1" },
      now: new Date(Date.now() + 95 * 24 * 60 * 60 * 1000),
    });
    expect(reauthRes.status).toBe("active");

    const lockAfterReauth = await checkPracticeSettlementLock(
      practice._id,
      new Date(Date.now() + 96 * 24 * 60 * 60 * 1000),
    );
    expect(lockAfterReauth.isLocked).toBe(false);
  });

  test("정산 예정일이 지나도 입금되지 않으면 다음 기공의뢰가 즉시 제한된다", async () => {
    const practice = await BusinessAnchor.create({
      businessNumberNormalized: "2234567890",
      businessType: "requestor",
      requestorKind: "practice",
      name: "미납치과",
    });
    await confirmPracticeMonthlySettlement({
      practiceAnchorId: practice._id,
      yearMonth: "2026-08",
      overrideLines: [
        {
          payeeKind: "direct_lab",
          payeeName: "일등기공소",
          bankCode: "004",
          bankName: "국민은행",
          accountNumber: "111-222-333",
          holderName: "일등기공소",
          amount: 300_000,
          transferStatus: "PENDING",
        },
      ],
    });
    const before = await checkPracticeSettlementLock(
      practice._id,
      new Date("2026-09-04T00:00:00.000Z"),
    );
    expect(before.isLocked).toBe(false);
    const after = await checkPracticeSettlementLock(
      practice._id,
      new Date("2026-09-06T00:00:00.000Z"),
    );
    expect(after.isLocked).toBe(true);
    expect(after.reason).toContain("2026-08");
  });

  test("보증금은 Face ID 인증 후 개별 기공소로 직접 이체되고 100만원 단위만 허용한다", async () => {
    const practice = await BusinessAnchor.create({
      businessNumberNormalized: "3234567890",
      businessType: "requestor",
      requestorKind: "practice",
      name: "대형치과",
    });
    const lab = await BusinessAnchor.create({
      businessNumberNormalized: "4234567890",
      businessType: "internalLab",
      name: "어벗츠기공소",
    });
    await setupPracticeOpenBankingConsent({
      practiceAnchorId: practice._id,
      bankCode: "088",
      bankName: "신한은행",
      accountNumber: "110123456789",
      accountHolder: "대형치과",
      passkeyCredentialId: "pk-test-2",
    });
    await expect(
      transferPracticeLabDeposit({
        practiceAnchorId: practice._id,
        labAnchorId: lab._id,
        amount: 1_500_000,
      }),
    ).rejects.toThrow("100만원 단위");
    await expect(
      transferPracticeLabDeposit({
        practiceAnchorId: practice._id,
        labAnchorId: lab._id,
        amount: 10_000_000,
        passkeyAssertion: { simulateFail: true },
      }),
    ).rejects.toThrow("생체인증");
    const deposit = await transferPracticeLabDeposit({
      practiceAnchorId: practice._id,
      labAnchorId: lab._id,
      amount: 10_000_000,
    });
    expect(deposit.status).toBe("TRANSFERRED");
    const list = await listPracticeLabDeposits({
      practiceAnchorId: practice._id,
    });
    expect(list).toHaveLength(1);
    expect(list[0].labName).toBe("어벗츠기공소");
  });
});

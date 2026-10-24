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
  markPracticeSettlementLabPayout,
  markPracticeSettlementPaymentReceived,
  setupPracticeOpenBankingConsent,
  transferPracticeLabDeposit,
  listPracticeLabDeposits,
} from "../../services/practiceObBilling.service.js";
import PracticeTransfer from "../../models/practiceTransfer.model.js";
import Request from "../../models/request.model.js";
import StoreOrder from "../../models/storeOrder.model.js";
import { Types } from "mongoose";
import {
  checkCreditLock,
  checkPracticeSettlementLock,
} from "../../utils/creditLock.util.js";

describe("practiceObBilling & checkCreditLock", () => {
  test("aggregatePracticeMonthUsage — 외부 기공물은 수행 기공소, 어벗츠 기공사업부·커스텀어벗·스토어는 법인", async () => {
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
      status: "active",
      createdAt,
      billing: { labFeeTotal: 100_000, abutmentRetailTotal: 30_000 },
    });
    await PracticeTransfer.create({
      transferId: "ptx-ob-2",
      practiceUserId: userId,
      practiceBusinessAnchorId: practice._id,
      targetLabAnchorId: internalLab._id,
      status: "active",
      createdAt,
      billing: { labFeeTotal: 200_000, abutmentRetailTotal: 50_000 },
    });
    await Request.create({
      businessAnchorId: practice._id,
      requestor: userId,
      requestCategory: "order",
      manufacturerStage: "준비",
      createdAt,
      price: { amount: 45_000, paidAmount: 45_000 },
    });
    await StoreOrder.create({
      businessAnchorId: practice._id,
      userId,
      depositCode: "ST01",
      depositorName: "ST01",
      status: "PAID",
      paymentMethod: "OB",
      paidAt: createdAt,
      fulfillmentStatus: "READY",
      items: [
        {
          productId: "grip-driver",
          name: "Grip Driver",
          qty: 1,
          unitPriceInclusive: 20_000,
          supplyAmount: 18_182,
          vatAmount: 1_818,
          lineTotalInclusive: 20_000,
        },
      ],
      supplyAmount: 18_182,
      vatAmount: 1_818,
      amountTotal: 20_000,
      itemsAmountTotal: 20_000,
      expiresAt: new Date("2026-09-20T00:00:00+09:00"),
    });
    const usage = await aggregatePracticeMonthUsage({
      practiceAnchorId: practice._id,
      yearMonth: "2026-09",
    });
    expect(usage.directLabTotal).toBe(100_000);
    expect(usage.labDivisionAmount).toBe(200_000);
    expect(usage.abutsCorpTotal).toBe(345_000);
    expect(usage.storeTotalAmount).toBe(20_000);
    expect(usage.storeSupplyAmount).toBe(18_182);
    expect(usage.storeVatAmount).toBe(1_818);
    expect(usage.abutmentAmount).toBe(125_000);
    const directLines = usage.lines.filter((l) => l.payeeKind === "direct_lab");
    expect(directLines).toHaveLength(1);
    expect(String(directLines[0].payeeAnchorId)).toBe(String(partnerLab._id));
    const corpLine = usage.lines.find((l) => l.payeeKind === "abuts_corp");
    expect(corpLine?.payeeName).toBe("어벗츠 주식회사");
    expect(corpLine?.accountNumber).toBe("140-999-888777");
    expect(corpLine?.amount).toBe(345_000);
  });

  test("수기 정산 — 2차 기한 다음 날부터 신규 의뢰를 멈추고, 전액 입금 확인 후 기공소 지급을 기록한다", async () => {
    const practice = await BusinessAnchor.create({
      businessNumberNormalized: "1234567890",
      businessType: "requestor",
      requestorKind: "practice",
      name: "테스트치과",
    });

    const lockBefore = await checkPracticeSettlementLock(practice._id);
    expect(lockBefore.isLocked).toBe(false);

    const settlement = await confirmPracticeMonthlySettlement({
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
          amount: 1_500_000,
          transferStatus: "PENDING",
        },
        {
          payeeKind: "abuts_corp",
          payeeName: "어벗츠 주식회사",
          bankCode: "081",
          bankName: "하나은행",
          accountNumber: "806-910009-00004",
          holderName: "어벗츠 주식회사",
          amount: 500_000,
          transferStatus: "PENDING",
        },
      ],
    });
    expect(settlement.status).toBe("CONFIRMED");
    expect(settlement.totalAmount).toBe(2_000_000);
    expect(settlement.firstDueYmd).toBe("2026-09-07");
    expect(settlement.secondDueYmd).toBe("2026-09-10");
    expect(settlement.labPayoutOnYmd).toBe("2026-09-08");

    const duringGrace = await checkPracticeSettlementLock(
      practice._id,
      new Date("2026-09-10T23:00:00.000Z"),
    );
    expect(duringGrace.isLocked).toBe(false);

    const paused = await checkPracticeSettlementLock(
      practice._id,
      new Date("2026-09-11T00:00:00.000Z"),
    );
    expect(paused.isLocked).toBe(true);
    expect(paused.reason).toContain("2026-08");
    expect(paused.reason).toContain("확인되는 대로");
    expect((await checkCreditLock(practice._id)).isLocked).toBe(false);

    await expect(
      markPracticeSettlementLabPayout({ settlementId: settlement._id }),
    ).rejects.toThrow("치과 입금");

    const received = await markPracticeSettlementPaymentReceived({
      settlementId: settlement._id,
      now: new Date("2026-09-03T10:00:00+09:00"),
    });
    expect(received.status).toBe("COMPLETED");
    expect(received.labPayoutDueYmd).toBe("2026-09-08");
    expect(
      received.lines.find((line) => line.payeeKind === "abuts_corp")
        ?.transferStatus,
    ).toBe("SUCCESS");
    expect(
      received.lines.find((line) => line.payeeKind === "direct_lab")
        ?.transferStatus,
    ).toBe("PENDING");

    const lockAfterPay = await checkPracticeSettlementLock(
      practice._id,
      new Date("2026-09-12T00:00:00+09:00"),
    );
    expect(lockAfterPay.isLocked).toBe(false);

    const paidOut = await markPracticeSettlementLabPayout({
      settlementId: settlement._id,
      now: new Date("2026-09-08T10:00:00+09:00"),
    });
    expect(paidOut.labPayoutMarkedAt).toBeTruthy();
    expect(
      paidOut.lines.find((line) => line.payeeKind === "direct_lab")
        ?.transferStatus,
    ).toBe("SUCCESS");

    const later = await checkPracticeSettlementLock(
      practice._id,
      new Date(Date.now() + 95 * 24 * 60 * 60 * 1000),
    );
    expect(later.isLocked).toBe(false);

    const overview = await getPracticeObBillingOverview({
      practiceAnchorId: practice._id,
    });
    expect(overview.depositAccount.bankName).toBeTruthy();
    expect(overview.depositGuidance.required).toBe(false);
  });

  test("2차 입금일 다음 날부터 입금이 확인되지 않으면 신규 기공의뢰를 멈춘다", async () => {
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
      new Date("2026-09-11T00:00:00.000Z"),
    );
    expect(after.isLocked).toBe(true);
    expect(after.reason).toContain("2026-08");
    expect(after.reason).toContain("진행 중인 의뢰는 그대로");
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

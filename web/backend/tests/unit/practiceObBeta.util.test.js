// related files:
// - web/backend/utils/practiceObBeta.util.js
// - web/backend/utils/practiceObPostpaid.util.js
import BusinessAnchor from "../../models/businessAnchor.model.js";
import {
  isPracticeObPostpaidActive,
  isPracticeOnlyObPostpaidActive,
} from "../../utils/practiceObPostpaid.util.js";
import {
  isLabCustomAbutmentFreeCreditOnly,
  isLabObAutopayPrepaidTestAnchor,
  isObAutopayEnforcedBusinessName,
  isPracticeBetaUnlimitedPostpaid,
  isPracticeObLaunchBetaActive,
  resolvePtxCaInsufficientCreditClientMessage,
} from "../../utils/practiceObBeta.util.js";
import { checkPracticeSettlementLock } from "../../utils/creditLock.util.js";

describe("practiceObBeta (런칭 전)", () => {
  test("무료크레딧 잔액 402는 충전 안내로 바꾸지 않는다", () => {
    const canonical =
      "커스텀어벗은 충전된 크레딧으로 결제됩니다.\n충전 후 다시 업로드해 주세요.";
    expect(
      resolvePtxCaInsufficientCreditClientMessage(
        {
          message:
            "커스텀어벗 의뢰는 무료 크레딧이 있어야 합니다. (잔액 9,300원 / 필요 15,000원)",
          payload: { reason: "insufficient_credit_for_custom_abutment" },
        },
        canonical,
      ),
    ).toBe(
      "커스텀어벗 의뢰는 무료 크레딧이 있어야 합니다.\n잔액 9,300원 / 필요 15,000원",
    );
    expect(
      resolvePtxCaInsufficientCreditClientMessage(
        {
          message: "크레딧이 부족합니다.",
          payload: { reason: "insufficient_credit_for_custom_abutment" },
        },
        canonical,
      ),
    ).toBe(canonical);
  });

  test("OB 자동정산 적용 대상은 테스트치과·테스트기공소만", () => {
    expect(isObAutopayEnforcedBusinessName("테스트치과")).toBe(true);
    expect(isObAutopayEnforcedBusinessName("테스트기공소")).toBe(true);
    expect(isObAutopayEnforcedBusinessName("향기로운치과")).toBe(false);
  });

  test("향기로운치과는 OB 없이 후불·PTX 잠금 없음", async () => {
    const practice = await BusinessAnchor.create({
      businessNumberNormalized: "9999999001",
      businessType: "requestor",
      requestorKind: "practice",
      name: "향기로운치과",
    });
    expect(await isPracticeBetaUnlimitedPostpaid(practice._id)).toBe(true);
    expect(await isPracticeObPostpaidActive(practice._id)).toBe(true);
    const lock = await checkPracticeSettlementLock(practice._id);
    expect(lock.isLocked).toBe(false);
  });

  test("테스트치과도 계좌 연결 없이 후불이고, 정산서가 없으면 주문을 멈추지 않는다", async () => {
    const practice = await BusinessAnchor.create({
      businessNumberNormalized: "9999999002",
      businessType: "requestor",
      requestorKind: "practice",
      name: "테스트치과",
    });
    expect(await isPracticeBetaUnlimitedPostpaid(practice._id)).toBe(false);
    expect(await isPracticeObPostpaidActive(practice._id)).toBe(true);
    const lock = await checkPracticeSettlementLock(practice._id);
    expect(lock.isLocked).toBe(false);
  });

  test("일반 기공소 CA는 무료크레딧만, 테스트기공소는 선불(자동정산 테스트)", async () => {
    const lab = await BusinessAnchor.create({
      businessNumberNormalized: "9999999003",
      businessType: "requestor",
      requestorKind: "lab",
      name: "향기로운기공소",
    });
    const testLab = await BusinessAnchor.create({
      businessNumberNormalized: "9999999004",
      businessType: "requestor",
      requestorKind: "lab",
      name: "테스트기공소",
    });
    expect(await isLabCustomAbutmentFreeCreditOnly(lab._id)).toBe(true);
    expect(await isLabCustomAbutmentFreeCreditOnly(testLab._id)).toBe(false);
    expect(await isLabObAutopayPrepaidTestAnchor(testLab._id)).toBe(true);
    expect(await isLabObAutopayPrepaidTestAnchor(lab._id)).toBe(false);
  });

  test("PRACTICE_OB_LAUNCH_BETA=false면 beta bypass·무료크레딧-only 모두 꺼짐", async () => {
    const prev = process.env.PRACTICE_OB_LAUNCH_BETA;
    process.env.PRACTICE_OB_LAUNCH_BETA = "false";
    try {
      expect(isPracticeObLaunchBetaActive()).toBe(false);
      const practice = await BusinessAnchor.create({
        businessNumberNormalized: "9999999010",
        businessType: "requestor",
        requestorKind: "practice",
        name: "향기로운치과",
      });
      const lab = await BusinessAnchor.create({
        businessNumberNormalized: "9999999011",
        businessType: "requestor",
        requestorKind: "lab",
        name: "향기로운기공소",
      });
      expect(await isPracticeBetaUnlimitedPostpaid(practice._id)).toBe(false);
      expect(await isLabCustomAbutmentFreeCreditOnly(lab._id)).toBe(false);
      expect(await isPracticeObPostpaidActive(practice._id)).toBe(true);
      expect(await isPracticeObPostpaidActive(lab._id)).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.PRACTICE_OB_LAUNCH_BETA;
      else process.env.PRACTICE_OB_LAUNCH_BETA = prev;
    }
  });

  test("베타 종료 후 OB active여도 기공소 Request CA는 isPracticeOnlyObPostpaidActive=false", async () => {
    const prev = process.env.PRACTICE_OB_LAUNCH_BETA;
    process.env.PRACTICE_OB_LAUNCH_BETA = "false";
    try {
      const lab = await BusinessAnchor.create({
        businessNumberNormalized: "9999999012",
        businessType: "requestor",
        requestorKind: "lab",
        name: "향기로운기공소2",
        openBankingConsent: {
          status: "active",
          paymentHold: { isHeld: false },
        },
      });
      expect(await isPracticeObPostpaidActive(lab._id)).toBe(true);
      expect(await isPracticeOnlyObPostpaidActive(lab._id)).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.PRACTICE_OB_LAUNCH_BETA;
      else process.env.PRACTICE_OB_LAUNCH_BETA = prev;
    }
  });
});

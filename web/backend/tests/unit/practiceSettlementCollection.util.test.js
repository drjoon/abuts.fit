// related files:
// - web/backend/utils/practiceSettlementCollection.util.js
// - web/backend/utils/creditLock.util.js
import BusinessAnchor from "../../models/businessAnchor.model.js";
import PracticeMonthlySettlement from "../../models/practiceMonthlySettlement.model.js";
import { checkPracticeSettlementLock } from "../../utils/creditLock.util.js";
import { isPracticeMonthlySettlementCollectionEnabled } from "../../utils/practiceSettlementCollection.util.js";
import { notePracticeLaunchLive } from "../../utils/practiceObBeta.util.js";

describe("practiceSettlementCollection (월 기공료 입금 중단)", () => {
  const prevCollection = process.env.PRACTICE_MONTHLY_SETTLEMENT_COLLECTION_ENABLED;
  const prevBeta = process.env.PRACTICE_OB_LAUNCH_BETA;

  afterEach(() => {
    if (prevCollection === undefined) {
      delete process.env.PRACTICE_MONTHLY_SETTLEMENT_COLLECTION_ENABLED;
    } else {
      process.env.PRACTICE_MONTHLY_SETTLEMENT_COLLECTION_ENABLED = prevCollection;
    }
    if (prevBeta === undefined) delete process.env.PRACTICE_OB_LAUNCH_BETA;
    else process.env.PRACTICE_OB_LAUNCH_BETA = prevBeta;
    notePracticeLaunchLive(false);
  });

  test("기본(미설정)은 수집 OFF", () => {
    delete process.env.PRACTICE_MONTHLY_SETTLEMENT_COLLECTION_ENABLED;
    expect(isPracticeMonthlySettlementCollectionEnabled()).toBe(false);
  });

  test("true 일 때만 수집 ON", () => {
    process.env.PRACTICE_MONTHLY_SETTLEMENT_COLLECTION_ENABLED = "true";
    expect(isPracticeMonthlySettlementCollectionEnabled()).toBe(true);
    process.env.PRACTICE_MONTHLY_SETTLEMENT_COLLECTION_ENABLED = "false";
    expect(isPracticeMonthlySettlementCollectionEnabled()).toBe(false);
  });

  test("수집 OFF면 실사용·미납이어도 신규 PTX를 막지 않는다", async () => {
    delete process.env.PRACTICE_MONTHLY_SETTLEMENT_COLLECTION_ENABLED;
    process.env.PRACTICE_OB_LAUNCH_BETA = "false";
    notePracticeLaunchLive(true);

    const practice = await BusinessAnchor.create({
      businessNumberNormalized: "9999999030",
      businessType: "requestor",
      requestorKind: "practice",
      name: "입금중단치과",
    });
    await PracticeMonthlySettlement.create({
      practiceAnchorId: practice._id,
      yearMonth: "2026-08",
      status: "CONFIRMED",
      totalAmount: 300_000,
      paymentReceivedAt: null,
      scheduledTransferAt: new Date("2026-09-11T00:00:00.000Z"),
    });

    const lock = await checkPracticeSettlementLock(
      practice._id,
      new Date("2026-09-12T00:00:00.000Z"),
    );
    expect(lock.isLocked).toBe(false);
  });
});

// related files:
// - web/backend/services/practiceLaunch.service.js
// - web/backend/utils/creditLock.util.js
// - web/backend/utils/practiceObBeta.util.js
import BusinessAnchor from "../../models/businessAnchor.model.js";
import PracticeMonthlySettlement from "../../models/practiceMonthlySettlement.model.js";
import {
  PRACTICE_LAUNCH_ADMIN_TASKS,
  PRACTICE_LAUNCH_PLATFORM_TASKS,
  getPracticeLaunchState,
  switchPracticeLaunchToLive,
} from "../../services/practiceLaunch.service.js";
import { checkPracticeSettlementLock } from "../../utils/creditLock.util.js";
import { isLabCustomAbutmentFreeCreditOnly } from "../../utils/practiceObBeta.util.js";

const PAST_DUE = new Date("2026-09-12T00:00:00.000Z");

describe("practiceLaunch 실사용 전환", () => {
  test("베타에서는 미납이어도 신규 기공의뢰를 막지 않고, 전환 후 막으며 할 일을 남긴다", async () => {
    const practice = await BusinessAnchor.create({
      businessNumberNormalized: "9999999020",
      businessType: "requestor",
      requestorKind: "practice",
      name: "베타미납치과",
    });
    await PracticeMonthlySettlement.create({
      practiceAnchorId: practice._id,
      yearMonth: "2026-08",
      status: "CONFIRMED",
      totalAmount: 300_000,
      paymentReceivedAt: null,
      scheduledTransferAt: new Date("2026-09-11T00:00:00.000Z"),
    });

    const before = await getPracticeLaunchState();
    expect(before.status).toBe("beta");
    expect(before.platformTasks.map((task) => task.id)).toEqual(
      PRACTICE_LAUNCH_PLATFORM_TASKS.map((task) => task.id),
    );
    expect(before.adminTasks.map((task) => task.id)).toEqual(
      PRACTICE_LAUNCH_ADMIN_TASKS.map((task) => task.id),
    );

    const duringBeta = await checkPracticeSettlementLock(practice._id, PAST_DUE);
    expect(duringBeta.isLocked).toBe(false);

    const lab = await BusinessAnchor.create({
      businessNumberNormalized: "9999999021",
      businessType: "requestor",
      requestorKind: "lab",
      name: "일반기공소",
    });
    expect(await isLabCustomAbutmentFreeCreditOnly(lab._id)).toBe(true);

    const switched = await switchPracticeLaunchToLive({ userName: "관리자" });
    expect(switched.status).toBe("live");
    expect(switched.switchedByName).toBe("관리자");
    expect(switched.switchedAt).toBeTruthy();
    expect(switched.platformTasks).toEqual(
      PRACTICE_LAUNCH_PLATFORM_TASKS.map((task) => ({
        id: task.id,
        text: task.text,
      })),
    );
    expect(switched.adminTasks[0].text).toContain("입금 확인");

    const after = await checkPracticeSettlementLock(practice._id, PAST_DUE);
    expect(after.isLocked).toBe(true);
    expect(after.reason).toContain("2026-08");
    expect(await isLabCustomAbutmentFreeCreditOnly(lab._id)).toBe(false);

    await expect(switchPracticeLaunchToLive({ userName: "관리자" })).rejects.toThrow(
      "이미 실사용",
    );
  });
});

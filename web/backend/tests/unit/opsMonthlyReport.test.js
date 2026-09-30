// related files:
// - web/backend/services/opsMonthlyReport.core.js
import {
  OPS_CONTRACT,
  assembleOpsMonthlyReport,
  buildWorkSummary,
  kstMonthBounds,
  splitVatInclusive,
  summarizeActivity,
  viewerParty,
} from "../../services/opsMonthlyReport.core.js";

describe("ops monthly report contract", () => {
  test("월 운영비 550만원은 공급가액 500만원과 부가세 50만원이다", () => {
    expect(splitVatInclusive(OPS_CONTRACT.monthlyFeeInclusive)).toEqual({
      inclusive: 5_500_000,
      supply: 5_000_000,
      vat: 500_000,
    });
    expect(OPS_CONTRACT.termYears).toBe(2);
    expect(OPS_CONTRACT.renewable).toBe(true);
  });

  test("조회 주체는 갑 어벗츠 또는 을 메이븐이다", () => {
    expect(viewerParty("admin")).toMatchObject({
      side: "갑",
      name: "어벗츠 주식회사",
    });
    expect(viewerParty("devops")).toMatchObject({
      side: "을",
      name: "메이븐 주식회사",
    });
    expect(viewerParty("requestor")).toBeNull();
  });
});

describe("kst month bounds", () => {
  test("2026-09는 KST 1일 0시부터 다음 달 1일 0시 전이다", () => {
    const bounds = kstMonthBounds("2026-09");
    expect(bounds.start.toISOString()).toBe("2026-08-31T15:00:00.000Z");
    expect(bounds.endExclusive.toISOString()).toBe("2026-09-30T15:00:00.000Z");
    expect(bounds.days).toBe(30);
    expect(bounds.endYmd).toBe("2026-09-30");
  });

  test("윤년 2월은 29일이다", () => {
    expect(kstMonthBounds("2024-02")?.days).toBe(29);
    expect(kstMonthBounds("2024-02")?.endYmd).toBe("2024-02-29");
  });

  test("월이 아니면 null", () => {
    expect(kstMonthBounds("2026-13")).toBeNull();
    expect(kstMonthBounds("september")).toBeNull();
  });
});

describe("activity fold", () => {
  test("로그인 성공·실패와 고위험을 나눈다", () => {
    expect(
      summarizeActivity([
        { _id: "LOGIN_SUCCESS", count: 3, highOrCritical: 0, blocked: 0 },
        {
          _id: "LOGIN_FAILED_BAD_PASSWORD",
          count: 2,
          highOrCritical: 1,
          blocked: 1,
        },
        { _id: "FILE_UPLOADED", count: 4, highOrCritical: 0, blocked: 0 },
      ]),
    ).toEqual({
      loginSuccess: 3,
      loginFailed: 2,
      highOrCritical: 1,
      blocked: 1,
    });
  });

  test("빈 달도 일자 행과 약정 금액을 채운다", () => {
    const bounds = kstMonthBounds("2026-09");
    const report = assembleOpsMonthlyReport({
      bounds,
      now: new Date("2026-10-02T01:00:00.000Z"),
      stats: {
        distinctUsers: 0,
        accessUserDays: 0,
        usersByRole: [],
        accessByYmd: {},
        transferByYmd: { "2026-09-03": 2 },
        newUsers: 0,
        transfersCreated: 2,
        workStarted: 1,
        workCanceled: 0,
        filesUploaded: 0,
        backupCompleted: 1,
        backupFailed: 0,
        backupSkipped: 0,
        lastBackupCompletedAt: null,
        activityRows: [],
        adminActions: 0,
        topAdminActions: [],
        mailSent: 0,
        smsSent: 0,
      },
    });
    expect(report.contract.monthlyFeeInclusive).toBe(5_500_000);
    expect(report.period.inProgress).toBe(false);
    expect(report.daily).toHaveLength(30);
    expect(report.daily[2]).toEqual({
      ymd: "2026-09-03",
      accessUsers: 0,
      transfersCreated: 2,
    });
    expect(report.transfers.created).toBe(2);
    expect(buildWorkSummary({
      activeDays: 0,
      loginSuccess: 0,
      loginFailed: 0,
      highOrCritical: 0,
      blocked: 0,
      backupCompleted: 1,
      backupFailed: 0,
      backupSkipped: 0,
      transfersCreated: 2,
      workStarted: 1,
      workCanceled: 0,
      adminActions: 0,
      filesUploaded: 0,
      mailSent: 0,
      smsSent: 0,
    })[1].lines[0]).toContain("성공 1건");
  });
});

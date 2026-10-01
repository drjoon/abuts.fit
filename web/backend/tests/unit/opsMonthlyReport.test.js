// related files:
// - web/backend/services/opsMonthlyReport.core.js
import {
  OPS_CONTRACT,
  assembleOpsMonthlyReport,
  buildWorkSummary,
  contractFeePhase,
  estimateDevEffort,
  formatEffortMinutes,
  kstMonthBounds,
  parseGitLogRecords,
  splitVatInclusive,
  summarizeActivity,
  viewerParty,
} from "../../services/opsMonthlyReport.core.js";

describe("ops monthly report contract", () => {
  test("월 개발·운영비 550만원은 공급가액 500만원과 부가세 50만원이다", () => {
    expect(splitVatInclusive(OPS_CONTRACT.monthlyFeeInclusive)).toEqual({
      inclusive: 5_500_000,
      supply: 5_000_000,
      vat: 500_000,
    });
    expect(OPS_CONTRACT.termYears).toBe(1);
    expect(OPS_CONTRACT.termStartYmd).toBe("2026-09-01");
    expect(OPS_CONTRACT.termEndYmd).toBe("2027-08-31");
    expect(OPS_CONTRACT.autoRenewYears).toBe(1);
    expect(OPS_CONTRACT.nonRenewalNoticeMonths).toBe(3);
    expect(OPS_CONTRACT.transitionMonths).toBe(6);
    expect(OPS_CONTRACT.firstTermFeeInclusive).toBe(66_000_000);
    expect(OPS_CONTRACT.paymentCount).toBe(12);
    expect(OPS_CONTRACT.usageFeeAppliesDuringFirstTerm).toBe(false);
    expect(OPS_CONTRACT.fixedFeeAppliesDuringExtension).toBe(false);
    expect(OPS_CONTRACT.usageFeeRatePercent).toBe(5);
    expect(OPS_CONTRACT.usageFeeMonthlyMinimumInclusive).toBe(5_500_000);
    expect(OPS_CONTRACT.usageFees.map((row) => row.ratePercent)).toEqual([
      5, 5, 5,
    ]);
    expect(contractFeePhase("2026-08-01")).toBe("before");
    expect(contractFeePhase("2026-09-01")).toBe("firstTerm");
    expect(contractFeePhase("2027-08-01")).toBe("firstTerm");
    expect(contractFeePhase("2027-09-01")).toBe("extension");
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
    expect(report.contract.feePhase).toBe("firstTerm");
    expect(report.contract.usageFeeRatePercent).toBe(5);
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
      development: {
        available: true,
        commits: 0,
        sessions: 0,
        minutes: 0,
      },
    })[1].lines[0]).toContain("성공 1건");
  });
});

describe("dev effort from commits", () => {
  test("2시간 이내 커밋은 한 작업이고 앞에 30분을 더한다", () => {
    const effort = estimateDevEffort([
      {
        name: "Joonho",
        email: "a@b.c",
        at: "2026-09-03T01:00:00.000Z",
        subject: "하나",
      },
      {
        name: "Joonho",
        email: "a@b.c",
        at: "2026-09-03T02:00:00.000Z",
        subject: "둘",
      },
      {
        name: "Joonho",
        email: "A@b.c",
        at: "2026-09-03T05:00:00.000Z",
        subject: "셋",
      },
    ]);
    expect(effort.commits).toBe(3);
    expect(effort.sessions).toBe(2);
    expect(effort.minutes).toBe(120);
    expect(effort.authors).toHaveLength(1);
    expect(effort.days).toEqual([
      {
        ymd: "2026-09-03",
        minutes: 120,
        commits: 3,
        subjects: ["하나", "둘", "셋"],
      },
    ]);
    expect(formatEffortMinutes(120)).toBe("2시간 0분");
  });

  test("기기 로컬 메일은 이름이 같은 작성자에 합친다", () => {
    const effort = estimateDevEffort([
      {
        name: "Joonho",
        email: "drjoon@gmail.com",
        at: "2026-09-03T01:00:00.000Z",
        subject: "본",
      },
      {
        name: "Joonho Lee",
        email: "joonholee@MacBook-Air.local",
        at: "2026-09-03T01:20:00.000Z",
        subject: "로컬",
      },
    ]);
    expect(effort.authors).toHaveLength(1);
    expect(effort.authors[0].name).toBe("Joonho");
    expect(effort.authors[0].commits).toBe(2);
    expect(effort.sessions).toBe(1);
    expect(effort.minutes).toBe(50);
  });

  test("간격이 2시간을 넘으면 작업을 나눈다", () => {
    const effort = estimateDevEffort([
      { name: "A", email: "a@b.c", at: "2026-09-01T00:00:00.000Z", subject: "앞" },
      { name: "A", email: "a@b.c", at: "2026-09-01T02:00:01.000Z", subject: "뒤" },
    ]);
    expect(effort.sessions).toBe(2);
    expect(effort.minutes).toBe(60);
  });

  test("git log 레코드를 커밋으로 읽는다", () => {
    const rows = parseGitLogRecords(
      "Joonho\u001fa@b.c\u001f2026-09-03T01:00:00+09:00\u001f제목\u001e",
    );
    expect(rows).toEqual([
      {
        name: "Joonho",
        email: "a@b.c",
        at: "2026-09-03T01:00:00+09:00",
        subject: "제목",
      },
    ]);
  });
});

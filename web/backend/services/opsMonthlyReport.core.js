// related files:
// - web/backend/services/opsMonthlyReport.service.js
// - web/backend/tests/unit/opsMonthlyReport.test.js
// 메이븐(을)이 소유·운영하고 어벗츠(갑)가 전속 사용하는 플랫폼의 월간 운영 증빙.
// 금액은 운영·유지보수 약정만 담는다. 개발 수수료는 이 문서에 넣지 않는다.

export const OPS_CONTRACT = {
  clientName: "어벗츠 주식회사",
  clientRole: "갑",
  providerName: "메이븐 주식회사",
  providerRole: "을",
  termYears: 2,
  renewable: true,
  /** 부가세 포함 월 운영비 (원) */
  monthlyFeeInclusive: 5_500_000,
  scope: "플랫폼 운영·유지보수",
};

const LOGIN_SUCCESS = new Set(["USER_LOGGED_IN", "LOGIN_SUCCESS"]);

export function splitVatInclusive(inclusive) {
  const amount = Math.round(Number(inclusive) || 0);
  const supply = Math.round(amount / 1.1);
  return { inclusive: amount, supply, vat: amount - supply };
}

export function currentKstMonth(now = new Date()) {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return ymd.slice(0, 7);
}

export function currentKstYmd(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** @returns {null | { month: string, year: number, monthNumber: number, start: Date, endExclusive: Date, startYmd: string, endYmd: string, days: number }} */
export function kstMonthBounds(ym) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(ym || "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (!year || monthNumber < 1 || monthNumber > 12) return null;
  const start = new Date(Date.UTC(year, monthNumber - 1, 1, -9, 0, 0, 0));
  const endExclusive = new Date(Date.UTC(year, monthNumber, 1, -9, 0, 0, 0));
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const mm = String(monthNumber).padStart(2, "0");
  return {
    month: `${year}-${mm}`,
    year,
    monthNumber,
    start,
    endExclusive,
    startYmd: `${year}-${mm}-01`,
    endYmd: `${year}-${mm}-${String(days).padStart(2, "0")}`,
    days,
  };
}

export function eachYmdInMonth(startYmd, days) {
  const [year, month, day] = String(startYmd).split("-").map(Number);
  const out = [];
  for (let i = 0; i < days; i += 1) {
    const date = new Date(Date.UTC(year, month - 1, day + i));
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, "0");
    const d = String(date.getUTCDate()).padStart(2, "0");
    out.push(`${y}-${m}-${d}`);
  }
  return out;
}

function isLoginFailure(action) {
  return (
    action.startsWith("LOGIN_FAILED") ||
    action.startsWith("PRACTICE_LOGIN_FAILED") ||
    action === "AUTH_FAILURE"
  );
}

export function summarizeActivity(rows) {
  let loginSuccess = 0;
  let loginFailed = 0;
  let highOrCritical = 0;
  let blocked = 0;
  for (const row of rows || []) {
    const action = String(row?._id || "");
    const count = Number(row?.count || 0);
    if (LOGIN_SUCCESS.has(action)) loginSuccess += count;
    if (isLoginFailure(action)) loginFailed += count;
    highOrCritical += Number(row?.highOrCritical || 0);
    blocked += Number(row?.blocked || 0);
  }
  return { loginSuccess, loginFailed, highOrCritical, blocked };
}

export function buildDailyRows(bounds, accessByYmd, transferByYmd) {
  return eachYmdInMonth(bounds.startYmd, bounds.days).map((ymd) => ({
    ymd,
    accessUsers: Number(accessByYmd?.[ymd] || 0),
    transfersCreated: Number(transferByYmd?.[ymd] || 0),
  }));
}

export function buildWorkSummary(stats) {
  return [
    {
      category: "모니터링",
      lines: [
        `접속 기록이 있는 날은 ${stats.activeDays}일입니다.`,
        `로그인 성공은 ${stats.loginSuccess}건입니다.`,
      ],
    },
    {
      category: "백업",
      lines: [
        `백업 실행은 성공 ${stats.backupCompleted}건, 실패 ${stats.backupFailed}건, 건너뜀 ${stats.backupSkipped}건입니다.`,
      ],
    },
    {
      category: "보안",
      lines: [
        `로그인 실패는 ${stats.loginFailed}건입니다.`,
        `고위험 기록은 ${stats.highOrCritical}건, 차단 기록은 ${stats.blocked}건입니다.`,
      ],
    },
    {
      category: "의뢰 가동",
      lines: [
        `기공의뢰 접수는 ${stats.transfersCreated}건입니다.`,
        `작업시작은 ${stats.workStarted}건, 작업취소는 ${stats.workCanceled}건입니다.`,
      ],
    },
    {
      category: "유지보수",
      lines: [
        `관리자 변경 기록은 ${stats.adminActions}건입니다.`,
        `파일 저장 기록은 ${stats.filesUploaded}건입니다.`,
      ],
    },
    {
      category: "안내 발송",
      lines: [
        `보낸 메일은 ${stats.mailSent}건, 보낸 문자는 ${stats.smsSent}건입니다.`,
      ],
    },
  ];
}

export function viewerParty(role) {
  if (role === "admin") {
    return {
      role: "admin",
      side: OPS_CONTRACT.clientRole,
      name: OPS_CONTRACT.clientName,
    };
  }
  if (role === "devops") {
    return {
      role: "devops",
      side: OPS_CONTRACT.providerRole,
      name: OPS_CONTRACT.providerName,
    };
  }
  return null;
}

export function assembleOpsMonthlyReport({ bounds, now, stats }) {
  const fee = splitVatInclusive(OPS_CONTRACT.monthlyFeeInclusive);
  const today = currentKstYmd(now);
  const daily = buildDailyRows(
    bounds,
    stats.accessByYmd,
    stats.transferByYmd,
  );
  const activeDays = daily.filter((row) => row.accessUsers > 0).length;
  const activity = summarizeActivity(stats.activityRows);
  const work = buildWorkSummary({
    activeDays,
    loginSuccess: activity.loginSuccess,
    loginFailed: activity.loginFailed,
    highOrCritical: activity.highOrCritical,
    blocked: activity.blocked,
    backupCompleted: stats.backupCompleted,
    backupFailed: stats.backupFailed,
    backupSkipped: stats.backupSkipped,
    transfersCreated: stats.transfersCreated,
    workStarted: stats.workStarted,
    workCanceled: stats.workCanceled,
    adminActions: stats.adminActions,
    filesUploaded: stats.filesUploaded,
    mailSent: stats.mailSent,
    smsSent: stats.smsSent,
  });

  return {
    title: "월간 운영보고서",
    generatedAt: now.toISOString(),
    contract: {
      clientName: OPS_CONTRACT.clientName,
      clientRole: OPS_CONTRACT.clientRole,
      providerName: OPS_CONTRACT.providerName,
      providerRole: OPS_CONTRACT.providerRole,
      exclusiveUse: true,
      termYears: OPS_CONTRACT.termYears,
      renewable: OPS_CONTRACT.renewable,
      scope: OPS_CONTRACT.scope,
      monthlyFeeInclusive: fee.inclusive,
      monthlyFeeSupply: fee.supply,
      monthlyFeeVat: fee.vat,
    },
    period: {
      month: bounds.month,
      startYmd: bounds.startYmd,
      endYmd: bounds.endYmd,
      days: bounds.days,
      inProgress: today >= bounds.startYmd && today <= bounds.endYmd,
    },
    service: {
      distinctUsers: stats.distinctUsers,
      accessUserDays: stats.accessUserDays,
      activeDays,
      newUsers: stats.newUsers,
      usersByRole: stats.usersByRole,
    },
    transfers: {
      created: stats.transfersCreated,
      workStarted: stats.workStarted,
      workCanceled: stats.workCanceled,
    },
    filesUploaded: stats.filesUploaded,
    backup: {
      completed: stats.backupCompleted,
      failed: stats.backupFailed,
      skipped: stats.backupSkipped,
      lastCompletedAt: stats.lastBackupCompletedAt,
    },
    security: activity,
    maintenance: {
      adminActions: stats.adminActions,
      topActions: stats.topAdminActions,
    },
    channels: {
      mailSent: stats.mailSent,
      smsSent: stats.smsSent,
    },
    work,
    daily,
  };
}

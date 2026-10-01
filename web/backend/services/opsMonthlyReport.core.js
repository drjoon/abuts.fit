// related files:
// - web/backend/services/opsMonthlyReport.service.js
// - web/backend/tests/unit/opsMonthlyReport.test.js
// 플랫폼 전속 사용 및 서버 운영 계약 (2026-09-01 ~ 2027-08-31).
// 최초 계약기간의 정액 개발·운영비는 제6조. 연장 기간의 플랫폼 사용료는 제7조.
// 개발 투입 공수는 제5조 제4항. 커밋 간격으로 추정한다.

export const OPS_CONTRACT = {
  clientName: "어벗츠 주식회사",
  clientRole: "갑",
  providerName: "메이븐 주식회사",
  providerRole: "을",
  termStartYmd: "2026-09-01",
  termEndYmd: "2027-08-31",
  termYears: 1,
  autoRenewYears: 1,
  nonRenewalNoticeMonths: 3,
  /** 제16조. 종료일 다음날부터 같은 조건으로 쓰는 개월 수. */
  transitionMonths: 6,
  /** 부가세 포함 월 개발·운영비 (원). 제6조. 최초 계약기간만. */
  monthlyFeeInclusive: 5_500_000,
  /** 최초 계약기간 개발·운영비 합계 (부가세 포함, 원) */
  firstTermFeeInclusive: 66_000_000,
  paymentCount: 12,
  firstPaymentYmd: "2026-09-30",
  lastPaymentYmd: "2027-08-31",
  scope: "서버 운영 및 지속적 개발",
  /** 제7조. 연장 기간만. 모든 판매 항목 동일 요율. 산정액에 부가세가 포함된다. */
  usageFeeRatePercent: 5,
  /** 연장 기간 월 최소 사용료 (부가세 포함, 원). 산정액이 이 금액에 미달하면 이 금액을 지급. */
  usageFeeMonthlyMinimumInclusive: 5_500_000,
  usageFeeAppliesDuringFirstTerm: false,
  fixedFeeAppliesDuringExtension: false,
  usageFees: [
    { item: "스토어(기성품)", ratePercent: 5 },
    { item: "커스텀 어벗먼트", ratePercent: 5 },
    { item: "기공 서비스(기공사업부)", ratePercent: 5 },
  ],
};

/** 보고 월에 적용되는 대가. 최초 기간은 정액, 그 다음부터는 사용료. */
export function contractFeePhase(startYmd) {
  const ymd = String(startYmd || "");
  if (ymd < OPS_CONTRACT.termStartYmd) return "before";
  if (ymd > OPS_CONTRACT.termEndYmd) return "extension";
  return "firstTerm";
}

/** 같은 작성자의 커밋 간격이 이 값 이하면 한 작업. 각 작업의 첫 커밋 앞에 준비 시간을 더한다. */
export const DEV_EFFORT_RULE = {
  sessionGapMinutes: 120,
  leadMinutes: 30,
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

function kstYmdFromInstant(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function isMachineEmail(email) {
  const host = String(email || "").split("@")[1] || "";
  return !email || host === "localhost" || host.endsWith(".local");
}

function nameToken(name) {
  return String(name || "").trim().toLowerCase().split(/\s+/)[0] || "";
}

/**
 * 같은 작성자(이메일)의 커밋을 시간순으로 묶어 투입 시간을 추정한다.
 * 기기 로컬 메일(*.local)은 이름이 같은 작성자에 합친다.
 * 간격이 sessionGapMinutes 이하면 한 작업.
 * 작업 시간 = 마지막 커밋 − 첫 커밋 + leadMinutes.
 * 커밋이 하나인 작업은 leadMinutes.
 * 자정을 넘기면 마지막 커밋의 KST 날짜에 넣는다.
 * @param {{ name?: string, email?: string, at: string|Date, subject?: string }[]} commits
 */
export function estimateDevEffort(commits, rule = DEV_EFFORT_RULE) {
  const gapMs = Number(rule.sessionGapMinutes) * 60 * 1000;
  const leadMinutes = Number(rule.leadMinutes) || 0;
  const byAuthor = new Map();

  for (const raw of commits || []) {
    const at = new Date(raw?.at);
    if (Number.isNaN(at.getTime())) continue;
    const email = String(raw.email || "").trim().toLowerCase();
    const name = String(raw.name || "").trim() || email || "작성자 미상";
    const key = email || name;
    if (!byAuthor.has(key)) {
      byAuthor.set(key, { name, email, machine: isMachineEmail(email), commits: [] });
    }
    const bucket = byAuthor.get(key);
    if (name.length > bucket.name.length) bucket.name = name;
    const subject = String(raw.subject || "").split("\n")[0].trim();
    bucket.commits.push({ at, subject });
  }

  const authors = [];
  const dayMap = new Map();
  const buckets = [...byAuthor.values()];
  const people = buckets.filter((bucket) => !bucket.machine);
  for (const machine of buckets.filter((bucket) => bucket.machine)) {
    const token = nameToken(machine.name);
    const host = people.find((bucket) => nameToken(bucket.name) === token);
    if (host) host.commits.push(...machine.commits);
    else people.push(machine);
  }

  for (const bucket of people) {
    bucket.commits.sort((a, b) => a.at - b.at);
    let sessions = 0;
    let minutes = 0;
    let index = 0;
    const list = bucket.commits;
    while (index < list.length) {
      let end = list[index];
      const subjects = [];
      let next = index;
      while (next < list.length) {
        if (next > index && list[next].at - list[next - 1].at > gapMs) break;
        end = list[next];
        if (list[next].subject) subjects.push(list[next].subject);
        next += 1;
      }
      sessions += 1;
      const spanMinutes = (end.at.getTime() - list[index].at.getTime()) / 60000;
      const sessionMinutes = Math.round(spanMinutes + leadMinutes);
      minutes += sessionMinutes;
      const ymd = kstYmdFromInstant(end.at);
      if (!dayMap.has(ymd)) {
        dayMap.set(ymd, { ymd, minutes: 0, commits: 0, subjects: [] });
      }
      const day = dayMap.get(ymd);
      day.minutes += sessionMinutes;
      day.commits += next - index;
      for (const subject of subjects) {
        if (!day.subjects.includes(subject)) day.subjects.push(subject);
      }
      index = next;
    }
    authors.push({
      name: bucket.name,
      commits: list.length,
      sessions,
      minutes,
    });
  }

  authors.sort(
    (a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name, "ko"),
  );
  const days = [...dayMap.values()]
    .sort((a, b) => a.ymd.localeCompare(b.ymd))
    .map((day) => ({ ...day, minutes: Math.round(day.minutes) }));

  return {
    sessionGapMinutes: Number(rule.sessionGapMinutes),
    leadMinutes,
    commits: authors.reduce((sum, row) => sum + row.commits, 0),
    sessions: authors.reduce((sum, row) => sum + row.sessions, 0),
    minutes: authors.reduce((sum, row) => sum + row.minutes, 0),
    authors,
    days,
  };
}

export function parseGitLogRecords(text) {
  return String(text || "")
    .split("\u001e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [name, email, at, subject] = record.split("\u001f");
      return { name, email, at, subject };
    })
    .filter((row) => row.at);
}

export function emptyDevEffort(rule = DEV_EFFORT_RULE) {
  return estimateDevEffort([], rule);
}

export function buildWorkSummary(stats) {
  const dev = stats.development;
  const devLines = !dev?.available
    ? ["이 달의 커밋 기록을 읽지 못해 투입 시간을 계산하지 못했습니다."]
    : dev.commits === 0
      ? ["이 달에 개발 커밋이 없습니다."]
      : [
          `커밋 ${dev.commits}건을 ${dev.sessions}개 작업으로 묶었습니다.`,
          `추정 투입 시간은 ${formatEffortMinutes(dev.minutes)}입니다.`,
        ];
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
        `관리자 권한·작업 기록은 ${stats.adminActions}건입니다.`,
        `파일 저장 기록은 ${stats.filesUploaded}건입니다.`,
      ],
    },
    {
      category: "개발",
      lines: devLines,
    },
    {
      category: "안내 발송",
      lines: [
        `보낸 메일은 ${stats.mailSent}건, 보낸 문자는 ${stats.smsSent}건입니다.`,
      ],
    },
  ];
}

export function formatEffortMinutes(minutes) {
  const total = Math.max(0, Math.round(Number(minutes) || 0));
  const hours = Math.floor(total / 60);
  const remain = total % 60;
  return `${hours}시간 ${remain}분`;
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
    development: stats.development,
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
      termStartYmd: OPS_CONTRACT.termStartYmd,
      termEndYmd: OPS_CONTRACT.termEndYmd,
      termYears: OPS_CONTRACT.termYears,
      autoRenewYears: OPS_CONTRACT.autoRenewYears,
      nonRenewalNoticeMonths: OPS_CONTRACT.nonRenewalNoticeMonths,
      scope: OPS_CONTRACT.scope,
      monthlyFeeInclusive: fee.inclusive,
      monthlyFeeSupply: fee.supply,
      monthlyFeeVat: fee.vat,
      firstTermFeeInclusive: OPS_CONTRACT.firstTermFeeInclusive,
      paymentCount: OPS_CONTRACT.paymentCount,
      firstPaymentYmd: OPS_CONTRACT.firstPaymentYmd,
      lastPaymentYmd: OPS_CONTRACT.lastPaymentYmd,
      transitionMonths: OPS_CONTRACT.transitionMonths,
      usageFeeRatePercent: OPS_CONTRACT.usageFeeRatePercent,
      usageFeeMonthlyMinimumInclusive: OPS_CONTRACT.usageFeeMonthlyMinimumInclusive,
      usageFeeAppliesDuringFirstTerm: OPS_CONTRACT.usageFeeAppliesDuringFirstTerm,
      fixedFeeAppliesDuringExtension: OPS_CONTRACT.fixedFeeAppliesDuringExtension,
      usageFees: OPS_CONTRACT.usageFees,
      feePhase: contractFeePhase(bounds.startYmd),
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
    development: stats.development || emptyDevEffort(),
  };
}

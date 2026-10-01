// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/backend/controllers/admin/opsMonthlyReport.controller.js
// - .cursor/rules/ui-copy-concise.mdc
// - 2026-10-01: 인쇄는 본문을 body로 옮겨 전 페이지가 나오게 함. 약정·집계 문구는 한 번만.
// - 2026-10-01: 계약 개정 — 최초 기간 정액 개발·운영비, 연장 기간 사용료 전 항목 5%·월 최소 550만 원.
// - 2026-09-30: 관리자·개발운영(메이븐) 월간 운영보고서.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminPageShell } from "@/pages/admin/adminUi";
import { apiFetch } from "@/shared/api/apiClient";
import { toKstYmd } from "@/shared/date/kst";
import { getAppUserRoleLabel } from "@/shared/types/role";
import { useAuthStore } from "@/store/useAuthStore";

type WorkRow = { category: string; lines: string[] };
type DailyRow = { ymd: string; accessUsers: number; transfersCreated: number };
type RoleRow = { role: string; users: number; userDays: number };
type UsageFee = { item: string; ratePercent: number };
type DevAuthor = { name: string; commits: number; sessions: number; minutes: number };
type DevDay = { ymd: string; minutes: number; commits: number; subjects: string[] };

type OpsReport = {
  title: string;
  generatedAt: string;
  viewer: { side: string; name: string } | null;
  contract: {
    clientName: string;
    clientRole: string;
    providerName: string;
    providerRole: string;
    termStartYmd: string;
    termEndYmd: string;
    termYears: number;
    autoRenewYears: number;
    nonRenewalNoticeMonths: number;
    scope: string;
    monthlyFeeInclusive: number;
    monthlyFeeSupply: number;
    monthlyFeeVat: number;
    firstTermFeeInclusive: number;
    paymentCount: number;
    firstPaymentYmd: string;
    lastPaymentYmd: string;
    transitionMonths: number;
    usageFeeRatePercent: number;
    usageFeeMonthlyMinimumInclusive: number;
    usageFees: UsageFee[];
    feePhase: "before" | "firstTerm" | "extension";
  };
  period: {
    month: string;
    startYmd: string;
    endYmd: string;
    days: number;
    inProgress: boolean;
  };
  service: {
    distinctUsers: number;
    accessUserDays: number;
    activeDays: number;
    newUsers: number;
    usersByRole: RoleRow[];
  };
  transfers: { created: number; workStarted: number; workCanceled: number };
  filesUploaded: number;
  backup: {
    completed: number;
    failed: number;
    skipped: number;
    lastCompletedAt: string | null;
  };
  security: {
    loginSuccess: number;
    loginFailed: number;
    highOrCritical: number;
    blocked: number;
  };
  maintenance: { adminActions: number; topActions: { action: string; count: number }[] };
  channels: { mailSent: number; smsSent: number };
  work: WorkRow[];
  daily: DailyRow[];
  development: {
    available: boolean;
    source: string;
    sessionGapMinutes: number;
    leadMinutes: number;
    commits: number;
    sessions: number;
    minutes: number;
    authors: DevAuthor[];
    days: DevDay[];
  };
};

type DailyDisplay =
  | { kind: "day"; ymd: string; accessUsers: number; transfersCreated: number }
  | { kind: "idle"; from: string; to: string; days: number };

const SUBJECTS_SHOWN = 8;
const PRINT_ROOT_ID = "ops-report-print-root";

function won(amount: number) {
  return `${new Intl.NumberFormat("ko-KR").format(amount)}원`;
}

function count(n: number) {
  return new Intl.NumberFormat("ko-KR").format(n);
}

function formatKstDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function effortLabel(minutes: number) {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const remain = total % 60;
  const manDays = (total / 60 / 8).toLocaleString("ko-KR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${hours}시간 ${remain}분 (${manDays}인일)`;
}

function ymdLabel(ymd: string) {
  const [year, month, day] = ymd.split("-");
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

function periodLabel(period: OpsReport["period"]) {
  const [year, month] = period.month.split("-");
  const startDay = period.startYmd.slice(8);
  const endDay = period.endYmd.slice(8);
  return `${year}년 ${Number(month)}월 (${Number(startDay)}일 ~ ${Number(endDay)}일)`;
}

/** 접속·접수가 없는 연속 날짜는 한 줄로 묶는다. */
function compressDaily(rows: DailyRow[]): DailyDisplay[] {
  const out: DailyDisplay[] = [];
  let idleFrom = "";
  let idleTo = "";
  let idleCount = 0;
  const flush = () => {
    if (!idleFrom) return;
    if (idleCount === 1) {
      out.push({ kind: "day", ymd: idleFrom, accessUsers: 0, transfersCreated: 0 });
    } else {
      out.push({ kind: "idle", from: idleFrom, to: idleTo, days: idleCount });
    }
    idleFrom = "";
    idleTo = "";
    idleCount = 0;
  };
  for (const row of rows) {
    if (row.accessUsers === 0 && row.transfersCreated === 0) {
      if (!idleFrom) idleFrom = row.ymd;
      idleTo = row.ymd;
      idleCount += 1;
    } else {
      flush();
      out.push({ kind: "day", ...row });
    }
  }
  flush();
  return out;
}

function Lines({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <p className="text-sm leading-6 text-slate-600">
      {items.map((line, index) => (
        <span key={`${index}-${line}`}>
          {index > 0 ? <br /> : null}
          {line}
        </span>
      ))}
    </p>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="ops-stat rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200/80">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums leading-5 text-slate-900">{value}</p>
      {detail ? <p className="mt-0.5 text-xs leading-5 text-slate-500">{detail}</p> : null}
    </div>
  );
}

function Section({
  index,
  title,
  children,
}: {
  index: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="ops-section overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-slate-100 px-1.5 text-xs font-semibold tabular-nums text-slate-600">
          {index}
        </span>
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      </header>
      <div className="space-y-4 p-4 sm:p-5">{children}</div>
    </section>
  );
}

function TableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200/80">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

const thClass = "px-3 py-2 text-left text-xs font-medium text-slate-500";
const tdClass = "border-t border-slate-100 px-3 py-2 align-top text-slate-800";

function contractNotes(contract: OpsReport["contract"]) {
  const phase =
    contract.feePhase === "firstTerm"
      ? ["이번 달은 최초 기간입니다.", "정액만 지급하고, 사용료는 없습니다."]
      : contract.feePhase === "extension"
        ? ["이번 달은 연장 기간입니다.", "사용료만 지급하고, 정액은 없습니다."]
        : ["이번 달은 계약 전입니다."];
  return [
    ...phase,
    `만료 ${contract.nonRenewalNoticeMonths}개월 전까지 서면으로 알리지 않으면 ${contract.autoRenewYears}년씩 이어집니다.`,
    "지급일이 휴일이면 직전 영업일입니다.",
    "클라우드 요금은 당월 대가에 포함됩니다.",
    "서버를 늘리거나 사용량이 크게 늘면 추가 비용은 따로 협의합니다.",
    `계약이 끝나면 ${contract.transitionMonths}개월은 같은 조건으로 이어집니다.`,
  ];
}

function usageNotes(contract: OpsReport["contract"]) {
  return [
    `연장 뒤에는 판매 항목 모두 정산 기준금액의 ${contract.usageFeeRatePercent}%입니다.`,
    "부가세가 포함됩니다.",
    `월 ${won(contract.usageFeeMonthlyMinimumInclusive)}보다 적으면 그 금액을 냅니다.`,
    "기준금액은 판매금액(부가세 제외, 취소·환불 차감)에서 협력 매입 전액과 하청 매입의 90%를 뺀 금액입니다.",
    "협력은 갑의 몫이 없고, 하청은 갑이 10%만 갖습니다.",
    "크레딧은 실제 사용 시점에 봅니다.",
    "전월 금액은 매월 10일까지 알립니다.",
    "세금계산서 뒤 말일까지 지급합니다.",
  ];
}

const PRINT_STYLE = `
@media print {
  @page { size: A4 portrait; margin: 12mm 14mm; }
  html.ops-printing,
  html.ops-printing body {
    height: auto !important;
    min-height: 0 !important;
    overflow: visible !important;
    background: #fff !important;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
  html.ops-printing body > *:not(#${PRINT_ROOT_ID}) {
    display: none !important;
  }
  #${PRINT_ROOT_ID} {
    display: block !important;
    position: static !important;
    width: 100% !important;
    height: auto !important;
    overflow: visible !important;
    background: #fff !important;
  }
  #${PRINT_ROOT_ID} .ops-section,
  #${PRINT_ROOT_ID} header.ops-sheet-head {
    overflow: visible !important;
    box-shadow: none !important;
    break-inside: auto;
    page-break-inside: auto;
  }
  #${PRINT_ROOT_ID} h2,
  #${PRINT_ROOT_ID} .ops-section > header {
    break-after: avoid;
    page-break-after: avoid;
  }
  #${PRINT_ROOT_ID} tr,
  #${PRINT_ROOT_ID} .ops-stat {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  #${PRINT_ROOT_ID} thead {
    display: table-header-group;
  }
}
`;

export default function OpsMonthlyReportPage() {
  const { token } = useAuthStore();
  const maxMonth = useMemo(
    () => (toKstYmd(new Date()) || "").slice(0, 7),
    [],
  );
  const [month, setMonth] = useState(maxMonth);

  const query = useQuery({
    queryKey: ["ops-monthly-report", month],
    enabled: Boolean(token && month),
    queryFn: async () => {
      const res = await apiFetch<{ success: boolean; data?: OpsReport; message?: string }>({
        path: `/api/ops-report/monthly?month=${encodeURIComponent(month)}`,
        token,
      });
      if (!res.ok || !res.data?.success || !res.data.data) {
        throw new Error(res.data?.message || "운영보고서를 불러오지 못했습니다.");
      }
      return res.data.data;
    },
  });

  const report = query.data;
  const dailyRows = useMemo(
    () => (report ? compressDaily(report.daily) : []),
    [report],
  );
  const sameUsageRate = Boolean(
    report?.contract.usageFees.length &&
      report.contract.usageFees.every(
        (row) => row.ratePercent === report.contract.usageFeeRatePercent,
      ),
  );

  useEffect(() => {
    const style = document.createElement("style");
    style.setAttribute("data-ops-print", "1");
    style.textContent = PRINT_STYLE;
    document.head.appendChild(style);

    let previousTitle = "";
    const mountPrintRoot = () => {
      const source = document.getElementById("ops-monthly-report");
      if (!source) return;
      document.getElementById(PRINT_ROOT_ID)?.remove();
      const host = document.createElement("div");
      host.id = PRINT_ROOT_ID;
      host.appendChild(source.cloneNode(true));
      document.body.appendChild(host);
      document.documentElement.classList.add("ops-printing");
      previousTitle = document.title;
      const title = source.getAttribute("data-print-title");
      if (title) document.title = title;
    };
    const unmountPrintRoot = () => {
      document.getElementById(PRINT_ROOT_ID)?.remove();
      document.documentElement.classList.remove("ops-printing");
      if (previousTitle) {
        document.title = previousTitle;
        previousTitle = "";
      }
    };
    window.addEventListener("beforeprint", mountPrintRoot);
    window.addEventListener("afterprint", unmountPrintRoot);
    return () => {
      window.removeEventListener("beforeprint", mountPrintRoot);
      window.removeEventListener("afterprint", unmountPrintRoot);
      unmountPrintRoot();
      style.remove();
    };
  }, []);

  return (
    <AdminPageShell
      flush
      className="max-w-4xl"
      actions={
        <div className="ops-report-no-print flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            보고 월
            <input
              type="month"
              value={month}
              max={maxMonth}
              onChange={(event) => setMonth(event.target.value)}
              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
            />
          </label>
          <Button type="button" variant="outline" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" />
            출력
          </Button>
        </div>
      }
    >
      {query.isLoading ? (
        <p className="text-sm text-slate-500">보고서를 불러오는 중입니다.</p>
      ) : null}
      {query.isError ? (
        <p className="text-sm text-red-600">
          {query.error instanceof Error
            ? query.error.message
            : "운영보고서를 불러오지 못했습니다."}
        </p>
      ) : null}

      {report ? (
        <article
          id="ops-monthly-report"
          data-print-title={report.title}
          className="ops-sheet space-y-4 text-slate-900"
        >
          <header className="ops-sheet-head space-y-2 rounded-2xl border border-slate-200/80 bg-white px-4 py-4 shadow-sm sm:px-5">
            <h1 className="text-xl font-semibold tracking-tight">{report.title}</h1>
            <p className="text-sm leading-6 text-slate-600">
              {periodLabel(report.period)}
              <br />
              서버 운영·개발 투입 기록입니다.
              <br />
              다음 달 10일까지 제출합니다.
            </p>
            <p className="text-sm leading-6 text-slate-500">
              {report.viewer
                ? `${report.viewer.side} ${report.viewer.name}`
                : "당사자"}
              {" · "}
              {formatKstDateTime(report.generatedAt)}
              {report.period.inProgress ? (
                <>
                  <br />
                  이 달은 아직 진행 중입니다. 조회 시각까지 집계했습니다.
                </>
              ) : null}
            </p>
          </header>

          <Section index="1" title="약정">
            <div className="grid gap-2 sm:grid-cols-2">
              <Stat
                label={`${report.contract.clientRole} · 전속 사용`}
                value={report.contract.clientName}
              />
              <Stat
                label={`${report.contract.providerRole} · 소유·운영`}
                value={report.contract.providerName}
              />
              <Stat
                label="계약 기간"
                value={`${ymdLabel(report.contract.termStartYmd)} ~ ${ymdLabel(report.contract.termEndYmd)}`}
              />
              <Stat
                label="월 개발·운영비"
                value={won(report.contract.monthlyFeeInclusive)}
                detail={`공급가액 ${won(report.contract.monthlyFeeSupply)} · 부가세 ${won(report.contract.monthlyFeeVat)}`}
              />
              <Stat
                label="최초 기간 합계"
                value={won(report.contract.firstTermFeeInclusive)}
                detail={`${count(report.contract.paymentCount)}회`}
              />
              <Stat
                label="지급"
                value="매월 말일"
                detail={`${ymdLabel(report.contract.firstPaymentYmd)} ~ ${ymdLabel(report.contract.lastPaymentYmd)}`}
              />
            </div>
            <Lines items={contractNotes(report.contract)} />
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500">연장 기간 사용료</p>
              {sameUsageRate ? (
                <p className="text-sm text-slate-800">
                  {report.contract.usageFees.map((row) => row.item).join(" · ")}
                </p>
              ) : (
                <TableShell>
                  <thead className="bg-slate-50">
                    <tr>
                      <th className={thClass}>판매 항목</th>
                      <th className={thClass}>요율</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.contract.usageFees.map((row) => (
                      <tr key={row.item}>
                        <td className={tdClass}>{row.item}</td>
                        <td className={`${tdClass} tabular-nums`}>{row.ratePercent}%</td>
                      </tr>
                    ))}
                  </tbody>
                </TableShell>
              )}
              <Lines items={usageNotes(report.contract)} />
            </div>
          </Section>

          <Section index="2" title="이번 달 가동">
            <div className="grid gap-2 sm:grid-cols-3">
              <Stat label="접속 계정" value={`${count(report.service.distinctUsers)}명`} />
              <Stat label="접속이 있던 날" value={`${count(report.service.activeDays)}일`} />
              <Stat label="신규 가입" value={`${count(report.service.newUsers)}명`} />
              <Stat label="기공의뢰" value={`${count(report.transfers.created)}건`} />
              <Stat label="작업시작" value={`${count(report.transfers.workStarted)}건`} />
              <Stat label="작업취소" value={`${count(report.transfers.workCanceled)}건`} />
            </div>
            {report.service.usersByRole.length ? (
              <TableShell>
                <thead className="bg-slate-50">
                  <tr>
                    <th className={thClass}>역할</th>
                    <th className={thClass}>접속 계정</th>
                    <th className={thClass}>접속 일수</th>
                  </tr>
                </thead>
                <tbody>
                  {report.service.usersByRole.map((row) => (
                    <tr key={row.role || "none"}>
                      <td className={tdClass}>
                        {row.role ? getAppUserRoleLabel(row.role) : "미분류"}
                      </td>
                      <td className={`${tdClass} tabular-nums`}>{count(row.users)}</td>
                      <td className={`${tdClass} tabular-nums`}>{count(row.userDays)}</td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            ) : (
              <p className="text-sm text-slate-600">이 달에 접속 기록이 없습니다.</p>
            )}
          </Section>

          <Section index="3" title="서버 운영">
            <div className="grid gap-2 sm:grid-cols-3">
              <Stat label="로그인 성공" value={`${count(report.security.loginSuccess)}건`} />
              <Stat label="로그인 실패" value={`${count(report.security.loginFailed)}건`} />
              <Stat label="고위험" value={`${count(report.security.highOrCritical)}건`} />
              <Stat label="차단" value={`${count(report.security.blocked)}건`} />
              <Stat label="백업 성공" value={`${count(report.backup.completed)}건`} />
              <Stat label="백업 실패" value={`${count(report.backup.failed)}건`} />
              <Stat label="백업 건너뜀" value={`${count(report.backup.skipped)}건`} />
              <Stat label="관리자 작업" value={`${count(report.maintenance.adminActions)}건`} />
              <Stat label="파일 저장" value={`${count(report.filesUploaded)}건`} />
              <Stat label="메일" value={`${count(report.channels.mailSent)}건`} />
              <Stat label="문자" value={`${count(report.channels.smsSent)}건`} />
            </div>
            {report.backup.lastCompletedAt ? (
              <p className="text-sm text-slate-600">
                마지막 백업 {formatKstDateTime(report.backup.lastCompletedAt)}
              </p>
            ) : null}
            {report.maintenance.topActions.length ? (
              <p className="text-sm leading-6 text-slate-600">
                관리자 작업{" "}
                {report.maintenance.topActions
                  .map((row) => `${row.action} ${count(row.count)}건`)
                  .join(", ")}
              </p>
            ) : null}
          </Section>

          <Section index="4" title="개발 투입">
            {report.development.available ? (
              <>
                <Lines
                  items={[
                    "출퇴근이 아니라 커밋 간격으로 추정합니다.",
                    `${report.development.sessionGapMinutes / 60}시간 안에 이어지면 한 작업이고, 앞에 ${report.development.leadMinutes}분을 더합니다.`,
                    `커밋이 하나면 ${report.development.leadMinutes}분입니다.`,
                    "1인일은 8시간입니다.",
                    "자정을 넘기면 마지막 커밋 날짜에 넣습니다.",
                    report.development.source === "github"
                      ? "이 서버에 git 기록이 없어 GitHub 커밋으로 계산했습니다."
                      : "이 서버의 git 기록으로 계산했습니다.",
                  ]}
                />
                <div className="grid gap-2 sm:grid-cols-3">
                  <Stat label="추정 투입" value={effortLabel(report.development.minutes)} />
                  <Stat label="커밋" value={`${count(report.development.commits)}건`} />
                  <Stat label="작업" value={`${count(report.development.sessions)}건`} />
                </div>
                {report.development.authors.length ? (
                  <TableShell>
                    <thead className="bg-slate-50">
                      <tr>
                        <th className={thClass}>작성자</th>
                        <th className={thClass}>커밋</th>
                        <th className={thClass}>작업</th>
                        <th className={thClass}>투입</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.development.authors.map((row) => (
                        <tr key={`${row.name}-${row.commits}-${row.minutes}`}>
                          <td className={tdClass}>{row.name}</td>
                          <td className={`${tdClass} tabular-nums`}>{count(row.commits)}</td>
                          <td className={`${tdClass} tabular-nums`}>{count(row.sessions)}</td>
                          <td className={tdClass}>{effortLabel(row.minutes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </TableShell>
                ) : (
                  <p className="text-sm text-slate-600">이 달에 개발 커밋이 없습니다.</p>
                )}
                {report.development.days.length ? (
                  <TableShell>
                    <thead className="bg-slate-50">
                      <tr>
                        <th className={thClass}>일자</th>
                        <th className={thClass}>투입</th>
                        <th className={thClass}>작업 내역</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.development.days.map((row) => {
                        const shown = row.subjects.slice(0, SUBJECTS_SHOWN);
                        const rest = row.subjects.length - shown.length;
                        return (
                          <tr key={row.ymd}>
                            <td className={`${tdClass} whitespace-nowrap tabular-nums`}>
                              {row.ymd}
                            </td>
                            <td className={`${tdClass} whitespace-nowrap`}>
                              {effortLabel(row.minutes)}
                              <br />
                              커밋 {count(row.commits)}건
                            </td>
                            <td className={`${tdClass} leading-6`}>
                              {shown.map((subject, index) => (
                                <span key={`${row.ymd}-${index}`}>
                                  {index > 0 ? <br /> : null}
                                  {subject}
                                </span>
                              ))}
                              {rest > 0 ? (
                                <>
                                  <br />
                                  외 {count(rest)}건
                                </>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </TableShell>
                ) : null}
              </>
            ) : (
              <p className="text-sm leading-6 text-slate-600">
                이 달의 커밋 기록을 읽지 못해 투입 시간을 계산하지 못했습니다.
              </p>
            )}
          </Section>

          <Section index="5" title="날짜별 기록">
            {dailyRows.every((row) => row.kind === "idle") ? (
              <p className="text-sm text-slate-600">이 달에 접속과 접수가 없습니다.</p>
            ) : (
              <TableShell>
                <thead className="bg-slate-50">
                  <tr>
                    <th className={thClass}>일자</th>
                    <th className={thClass}>접속 계정</th>
                    <th className={thClass}>접수 의뢰</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyRows.map((row) =>
                    row.kind === "idle" ? (
                      <tr key={`${row.from}-${row.to}`}>
                        <td className={`${tdClass} tabular-nums`}>
                          {ymdLabel(row.from)} ~ {ymdLabel(row.to)}
                        </td>
                        <td className={tdClass} colSpan={2}>
                          {count(row.days)}일은 접속·접수가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      <tr key={row.ymd}>
                        <td className={`${tdClass} tabular-nums`}>{row.ymd}</td>
                        <td className={`${tdClass} tabular-nums`}>{count(row.accessUsers)}</td>
                        <td className={`${tdClass} tabular-nums`}>
                          {count(row.transfersCreated)}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </TableShell>
            )}
          </Section>

          <Section index="6" title="따로 보관">
            <Lines
              items={[
                "세금계산서, 입금 내역, 클라우드 청구서는 이 보고서로 대신하지 않습니다.",
                "사용료 기준은 관리자 재무-정산 화면입니다.",
                "청구서 원본은 을이 보관하고, 요청하면 보여 줍니다.",
                "국세 증빙은 5년 보관합니다.",
              ]}
            />
          </Section>
        </article>
      ) : null}
    </AdminPageShell>
  );
}

// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/backend/controllers/admin/opsMonthlyReport.controller.js
// - 2026-10-01: 계약 개정 — 최초 기간 정액 개발·운영비, 연장 기간 사용료 전 항목 5%·월 최소 550만 원.
// - 2026-09-30: 관리자·개발운영(메이븐) 월간 운영보고서.
import { useMemo, useState } from "react";
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

const SUBJECTS_SHOWN = 8;

function periodLabel(period: OpsReport["period"]) {
  const [year, month] = period.month.split("-");
  const startDay = period.startYmd.slice(8);
  const endDay = period.endYmd.slice(8);
  return `${year}년 ${Number(month)}월 (${Number(startDay)}일 ~ ${Number(endDay)}일)`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

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
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #ops-monthly-report, #ops-monthly-report * { visibility: visible !important; }
          #ops-monthly-report {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white;
          }
          .ops-report-no-print { display: none !important; }
        }
      `}</style>

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
          className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 sm:p-6"
        >
          <header className="space-y-2 border-b border-slate-200 pb-4">
            <h1 className="text-xl font-semibold">{report.title}</h1>
            <p className="text-sm leading-6">
              {report.contract.providerName}이 개발·운영하고 소유한 플랫폼을{" "}
              {report.contract.clientName}이 전속 사용합니다.
              <br />
              이 보고서는 해당 월의 서버 운영 기록과 개발 투입 공수를 정리한
              자료입니다.
              <br />
              을은 개발 투입 공수와 작업 내역을 개발 완료 보고서로 정리하여
              다음 달 10일까지 갑에게 제출합니다.
            </p>
            <p className="text-sm text-slate-600">
              보고 기간 {periodLabel(report.period)}
              <br />
              조회 {report.viewer ? `${report.viewer.side} ${report.viewer.name}` : "당사자"}
              {" · "}
              조회 시각 {formatKstDateTime(report.generatedAt)}
            </p>
            {report.period.inProgress ? (
              <p className="text-sm text-slate-600">
                이번 달은 아직 끝나지 않았습니다.
                <br />
                아래 수치는 조회 시각까지 남은 기록입니다.
              </p>
            ) : null}
          </header>

          <section className="space-y-3">
            <h2 className="text-base font-semibold">1. 약정</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              <Stat
                label={`${report.contract.clientRole} (전속 사용)`}
                value={report.contract.clientName}
              />
              <Stat
                label={`${report.contract.providerRole} (소유·운영)`}
                value={report.contract.providerName}
              />
              <Stat
                label="계약 기간"
                value={`${ymdLabel(report.contract.termStartYmd)} ~ ${ymdLabel(report.contract.termEndYmd)}`}
              />
              <Stat
                label="월 개발·운영비"
                value={`${won(report.contract.monthlyFeeInclusive)} (부가세 포함)`}
              />
              <Stat
                label="공급가액"
                value={won(report.contract.monthlyFeeSupply)}
              />
              <Stat label="부가세" value={won(report.contract.monthlyFeeVat)} />
              <Stat
                label="최초 기간 개발·운영비"
                value={`${won(report.contract.firstTermFeeInclusive)} / ${report.contract.paymentCount}회`}
              />
              <Stat
                label="지급기일"
                value={`${ymdLabel(report.contract.firstPaymentYmd)} ~ ${ymdLabel(report.contract.lastPaymentYmd)}`}
              />
            </div>
            {report.contract.feePhase === "firstTerm" ? (
              <p className="text-sm leading-6">
                이 보고 월은 최초 계약기간입니다.
                <br />
                정액 개발·운영비를 지급하고, 플랫폼 사용료는 지급하지 않습니다.
              </p>
            ) : null}
            {report.contract.feePhase === "extension" ? (
              <p className="text-sm leading-6">
                이 보고 월은 연장 기간입니다.
                <br />
                플랫폼 사용료를 지급하고, 정액 개발·운영비는 지급하지 않습니다.
              </p>
            ) : null}
            {report.contract.feePhase === "before" ? (
              <p className="text-sm leading-6">
                이 보고 월은 최초 계약기간 전입니다.
              </p>
            ) : null}
            <p className="text-sm leading-6">
              최초 계약기간은 {report.contract.termYears}년입니다.
              <br />
              만료 {report.contract.nonRenewalNoticeMonths}개월 전까지 서면으로
              갱신하지 않겠다고 통지하지 않으면 {report.contract.autoRenewYears}
              년씩 연장됩니다.
              <br />
              연장 기간에는 제7조의 플랫폼 사용료가 적용되고, 제6조의 정액
              개발·운영비는 적용되지 않습니다.
              <br />
              월 개발·운영비는 {won(report.contract.monthlyFeeInclusive)}
              (부가세 포함)이며, 최초 계약기간의 서버 운영과 지속적 개선·개발의
              대가입니다.
              <br />
              매월 말일에 지급하고, 그 날이 은행 휴무일이면 직전 영업일에
              지급합니다.
              <br />
              클라우드 이용료는 이 개발·운영비에 포함되며 을이 부담합니다.
              <br />
              갑의 요청으로 서버를 늘리거나 이용량이 크게 늘면, 추가 비용은 따로
              협의합니다.
              <br />
              계약이 끝나면 종료일 다음날부터 {report.contract.transitionMonths}
              개월은 전환 기간입니다.
              <br />
              전환 기간에도 종료 직전에 적용되던 대금을 같은 조건으로
              지급합니다.
            </p>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-1.5 pr-3 font-medium">판매 항목</th>
                  <th className="py-1.5 font-medium">
                    플랫폼 사용료 요율 (연장 기간)
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.contract.usageFees.map((row) => (
                  <tr key={row.item} className="border-b border-slate-100">
                    <td className="py-1.5 pr-3">{row.item}</td>
                    <td className="py-1.5">{row.ratePercent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-sm leading-6">
              플랫폼 사용료는 연장 기간에 지급합니다.
              <br />
              요율은 모든 판매 항목에 대하여 정산 기준금액의{" "}
              {report.contract.usageFeeRatePercent}%이며, 부가세가 포함된
              금액입니다.
              <br />
              전속 사용, 지속적인 기능 업데이트, 서버 운영의 대가입니다.
              <br />
              산정액이 월{" "}
              {won(report.contract.usageFeeMonthlyMinimumInclusive)}(부가세
              포함)에 미달하면, 그 금액을 월 최소 사용료로 지급합니다.
              <br />
              정산 기준금액은 판매금액(부가세 제외, 취소·환불 차감)에서 협력
              매입액 전액과 하청 매입액의 90%를 뺀 금액입니다.
              <br />
              협력 매입액은 치과로부터 받은 금액 전체를 협력 기공소에 지급하여
              갑의 몫이 없는 거래입니다.
              <br />
              하청 매입액의 90%는 갑이 10%만 수수료로 취하는 거래에서 갑의
              몫이 아닌 부분입니다.
              <br />
              금액은 관리자 대시보드 재무-정산에서 판매 항목별로 산정합니다.
              <br />
              크레딧 등 선불은 충전 시점이 아니라 실제 사용(차감)된 시점에
              봅니다.
              <br />
              갑은 매월 10일까지 전월 판매 항목별 정산 기준금액(관리자 정산
              화면 출력본을 포함)을 을에게 알립니다.
              <br />
              을은 세금계산서를 발행하고, 갑은 그 달 말일까지 사용료를
              지급합니다.
              <br />
              연장 기간의 클라우드 이용료는 플랫폼 사용료에 포함되며 을이
              부담합니다.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold">2. 당월 서비스 가동</h2>
            <div className="grid gap-2 sm:grid-cols-3">
              <Stat label="접속 계정" value={`${count(report.service.distinctUsers)}명`} />
              <Stat label="접속이 있던 날" value={`${count(report.service.activeDays)}일`} />
              <Stat label="신규 가입" value={`${count(report.service.newUsers)}명`} />
              <Stat label="기공의뢰 접수" value={`${count(report.transfers.created)}건`} />
              <Stat label="작업시작" value={`${count(report.transfers.workStarted)}건`} />
              <Stat label="작업취소" value={`${count(report.transfers.workCanceled)}건`} />
            </div>
            {report.service.usersByRole.length ? (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-1.5 pr-3 font-medium">역할</th>
                    <th className="py-1.5 pr-3 font-medium">접속 계정</th>
                    <th className="py-1.5 font-medium">접속 일수</th>
                  </tr>
                </thead>
                <tbody>
                  {report.service.usersByRole.map((row) => (
                    <tr key={row.role || "none"} className="border-b border-slate-100">
                      <td className="py-1.5 pr-3">
                        {row.role ? getAppUserRoleLabel(row.role) : "미분류"}
                      </td>
                      <td className="py-1.5 pr-3">{count(row.users)}</td>
                      <td className="py-1.5">{count(row.userDays)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-slate-600">이 달에 접속 기록이 없습니다.</p>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold">3. 수행 업무 요약</h2>
            <p className="text-sm leading-6 text-slate-600">
              아래는 플랫폼이 해당 월에 남긴 서버 운영 기록입니다.
              <br />
              개발 투입 공수는 다음 절에 커밋으로 계산해 적습니다.
            </p>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="w-28 py-1.5 pr-3 font-medium">구분</th>
                  <th className="py-1.5 font-medium">내용</th>
                </tr>
              </thead>
              <tbody>
                {report.work.map((row) => (
                  <tr key={row.category} className="border-b border-slate-100 align-top">
                    <td className="py-2 pr-3 font-medium">{row.category}</td>
                    <td className="py-2 leading-6">
                      {row.lines.map((line, index) => (
                        <span key={line}>
                          {index > 0 ? <br /> : null}
                          {line}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {report.backup.lastCompletedAt ? (
              <p className="text-sm text-slate-600">
                당월 마지막 백업 성공 {formatKstDateTime(report.backup.lastCompletedAt)}
              </p>
            ) : null}
            {report.maintenance.topActions.length ? (
              <p className="text-sm leading-6 text-slate-600">
                관리자 작업 상위:{" "}
                {report.maintenance.topActions
                  .map((row) => `${row.action} ${count(row.count)}건`)
                  .join(", ")}
              </p>
            ) : null}
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold">4. 개발 투입</h2>
            {report.development.available ? (
              <>
                <p className="text-sm leading-6">
                  투입 시간은 출퇴근 기록이 아니라 커밋 간격으로 추정한
                  값입니다.
                  <br />
                  같은 작성자의 커밋이 {report.development.sessionGapMinutes / 60}시간 안에
                  이어지면 한 작업입니다.
                  <br />
                  작업 시간은 첫 커밋과 마지막 커밋 사이에, 첫 커밋 앞{" "}
                  {report.development.leadMinutes}분을 더한 시간입니다.
                  <br />
                  커밋이 하나인 작업은 {report.development.leadMinutes}분입니다.
                  <br />
                  자정을 넘긴 작업은 마지막 커밋의 날짜에 넣습니다.
                  <br />
                  1인일은 8시간입니다.
                  <br />
                  {report.development.source === "github"
                    ? "이 서버에는 git 기록이 없어 GitHub의 같은 저장소 커밋으로 계산했습니다."
                    : "이 서버의 git 기록으로 계산했습니다."}
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  <Stat
                    label="추정 투입"
                    value={effortLabel(report.development.minutes)}
                  />
                  <Stat label="커밋" value={`${count(report.development.commits)}건`} />
                  <Stat label="작업" value={`${count(report.development.sessions)}건`} />
                </div>
                {report.development.authors.length ? (
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="py-1.5 pr-3 font-medium">작성자</th>
                        <th className="py-1.5 pr-3 font-medium">커밋</th>
                        <th className="py-1.5 pr-3 font-medium">작업</th>
                        <th className="py-1.5 font-medium">투입</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.development.authors.map((row) => (
                        <tr
                          key={`${row.name}-${row.commits}-${row.minutes}`}
                          className="border-b border-slate-100"
                        >
                          <td className="py-1.5 pr-3">{row.name}</td>
                          <td className="py-1.5 pr-3">{count(row.commits)}</td>
                          <td className="py-1.5 pr-3">{count(row.sessions)}</td>
                          <td className="py-1.5">{effortLabel(row.minutes)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-slate-600">이 달에 개발 커밋이 없습니다.</p>
                )}
                {report.development.days.length ? (
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500">
                        <th className="py-1.5 pr-3 font-medium">일자</th>
                        <th className="py-1.5 pr-3 font-medium">투입</th>
                        <th className="py-1.5 font-medium">작업 내역</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.development.days.map((row) => {
                        const shown = row.subjects.slice(0, SUBJECTS_SHOWN);
                        const rest = row.subjects.length - shown.length;
                        return (
                          <tr key={row.ymd} className="border-b border-slate-100 align-top">
                            <td className="whitespace-nowrap py-2 pr-3">{row.ymd}</td>
                            <td className="whitespace-nowrap py-2 pr-3">
                              {effortLabel(row.minutes)}
                              <br />
                              커밋 {count(row.commits)}건
                            </td>
                            <td className="py-2 leading-6">
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
                  </table>
                ) : null}
              </>
            ) : (
              <p className="text-sm leading-6">
                이 달의 커밋 기록을 읽지 못해 투입 시간을 계산하지 못했습니다.
              </p>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-base font-semibold">5. 일자별 기록</h2>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-1.5 pr-3 font-medium">일자</th>
                  <th className="py-1.5 pr-3 font-medium">접속 계정</th>
                  <th className="py-1.5 font-medium">접수 의뢰</th>
                </tr>
              </thead>
              <tbody>
                {report.daily.map((row) => (
                  <tr key={row.ymd} className="border-b border-slate-100">
                    <td className="py-1 pr-3">{row.ymd}</td>
                    <td className="py-1 pr-3">{count(row.accessUsers)}</td>
                    <td className="py-1">{count(row.transfersCreated)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="space-y-2 border-t border-slate-200 pt-4 text-sm leading-6">
            <h2 className="text-base font-semibold">6. 이 보고서 밖에 보관할 원본</h2>
            <p>
              세금계산서와 개발·운영비·플랫폼 사용료 입금 내역은 별도 원본으로
              보관합니다.
              <br />
              플랫폼 사용료의 정산 기준금액은 관리자 대시보드 재무-정산 화면
              출력본을 따릅니다.
              <br />
              클라우드 사업자 청구서와 결제 전표도 이 수치로 대신하지 않습니다.
              <br />
              그 청구서 원본은 을 명의로 보관하고, 갑이 요청하면 제시합니다.
              <br />
              국세 관련 증빙은 통상 5년 보관합니다.
            </p>
          </section>
        </article>
      ) : null}
    </AdminPageShell>
  );
}

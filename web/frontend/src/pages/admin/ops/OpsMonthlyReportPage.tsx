// related files:
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/backend/controllers/admin/opsMonthlyReport.controller.js
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

type OpsReport = {
  title: string;
  generatedAt: string;
  viewer: { side: string; name: string } | null;
  contract: {
    clientName: string;
    clientRole: string;
    providerName: string;
    providerRole: string;
    termYears: number;
    renewable: boolean;
    scope: string;
    monthlyFeeInclusive: number;
    monthlyFeeSupply: number;
    monthlyFeeVat: number;
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
              {report.contract.providerName}이 개발·소유한 플랫폼을{" "}
              {report.contract.clientName}이 전속 사용합니다.
              <br />
              이 보고서는 그 계약의 {report.contract.scope}가 해당 월에 제공된
              사실을 플랫폼 기록으로 정리한 자료입니다.
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
                value={`${report.contract.termYears}년, 합의 시 연장`}
              />
              <Stat
                label="약정 월 운영비"
                value={`${won(report.contract.monthlyFeeInclusive)} (부가세 포함)`}
              />
              <Stat
                label="공급가액"
                value={won(report.contract.monthlyFeeSupply)}
              />
              <Stat label="부가세" value={won(report.contract.monthlyFeeVat)} />
            </div>
            <p className="text-sm leading-6">
              계약 기간은 {report.contract.termYears}년이며, 당사자 합의로 연장할
              수 있습니다.
              <br />
              기산일은 체결된 계약의 시작일을 따릅니다.
              <br />
              월 운영비는 {won(report.contract.monthlyFeeInclusive)}
              (부가세 포함)이며, 플랫폼 운영·유지보수 대가입니다.
              <br />
              신규 개발은 이 월 운영비에 포함되지 않습니다.
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
              투입 시간과 인력 성명은 이 화면에 적지 않습니다.
              <br />
              아래는 플랫폼이 해당 월에 남긴 수행 기록입니다.
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
            <h2 className="text-base font-semibold">4. 일자별 기록</h2>
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
            <h2 className="text-base font-semibold">5. 이 보고서 밖에 보관할 원본</h2>
            <p>
              세금계산서와 운영비 입금 내역은 별도 원본으로 보관합니다.
              <br />
              클라우드 사업자 청구서와 결제 전표도 이 수치로 대신하지 않습니다.
              <br />
              국세 관련 증빙은 통상 5년 보관합니다.
            </p>
          </section>
        </article>
      ) : null}
    </AdminPageShell>
  );
}

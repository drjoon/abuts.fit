// related files:
// - web/frontend/src/pages/admin/dashboard/AdminDashboardPage.tsx
// - web/backend/services/platformGrowthStats.service.js
// - web/backend/controllers/admin/admin.dashboard.controller.js
import { useQuery } from "@tanstack/react-query";
import { MultiActionDialog } from "@/features/support/components/MultiActionDialog";
import { apiFetch } from "@/shared/api/apiClient";
import { getAppUserRoleLabel } from "@/shared/types/role";
import type { PeriodFilterValue } from "@/shared/ui/PeriodFilter";

export type PlatformGrowthMetric =
  | "todayAccess"
  | "monthAccess"
  | "totalUsers"
  | "periodRequests"
  | "periodRevenue";

type AccessItem = {
  userId?: string;
  name?: string;
  email?: string;
  business?: string;
  role?: string;
  active?: boolean;
  firstAt?: string | null;
  lastAt?: string | null;
  dayCount?: number;
  createdAt?: string | null;
};

type RequestItem = {
  requestMongoId?: string;
  requestId?: string;
  title?: string;
  status?: string;
  shippingMode?: string;
  createdAt?: string | null;
  paidAmount?: number;
  requestor?: {
    _id?: string;
    name?: string;
    email?: string;
    business?: string;
    role?: string;
  } | null;
};

type RevenueItem = {
  userId?: string;
  name?: string;
  email?: string;
  business?: string;
  role?: string;
  orders?: number;
  revenue?: number;
  avgUnitPrice?: number;
};

type GrowthDetailData = {
  metric?: PlatformGrowthMetric;
  total?: number;
  totalRevenue?: number;
  range?: {
    fromYmd?: string | null;
    toYmd?: string | null;
    startDate?: string;
    endDate?: string;
  } | null;
  items?: Array<AccessItem | RequestItem | RevenueItem>;
};

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  message?: string;
};

const METRIC_TITLE: Record<PlatformGrowthMetric, string> = {
  todayAccess: "오늘 접속 내역",
  monthAccess: "월간 유저 내역",
  totalUsers: "총 유저 내역",
  periodRequests: "이용건수 내역",
  periodRevenue: "매출 내역",
};

const METRIC_HINT: Record<PlatformGrowthMetric, string> = {
  todayAccess: "KST 오늘 로그인·접속한 사용자입니다.",
  monthAccess: "KST 이번 달 접속한 고유 사용자입니다.",
  totalUsers: "전체 가입 사용자입니다. (최근 가입순 · 최대 500명)",
  periodRequests: "선택한 기간에 생성된 의뢰입니다. (최신순 · 최대 500건)",
  periodRevenue: "선택한 기간의 유료 주문액(사용자별). 추적관리 단계 · 샘플 제외.",
};

function formatKstDateTime(value?: string | Date | null): string {
  if (!value) return "-";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function formatKstDate(value?: string | Date | null): string {
  if (!value) return "-";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
}

type Props = {
  open: boolean;
  metric: PlatformGrowthMetric | null;
  period: PeriodFilterValue;
  token: string | null | undefined;
  onClose: () => void;
};

export function PlatformGrowthDetailDialog({
  open,
  metric,
  period,
  token,
  onClose,
}: Props) {
  const activeMetric = metric;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["admin-growth-detail", activeMetric, period],
    enabled: Boolean(open && activeMetric && token),
    staleTime: 30 * 1000,
    queryFn: async () => {
      if (!activeMetric) throw new Error("metric이 없습니다.");
      const qs = new URLSearchParams({
        metric: activeMetric,
        period: String(period || "30d"),
      });
      const res = await apiFetch<ApiEnvelope<GrowthDetailData>>({
        path: `/api/admin/dashboard/growth-detail?${qs.toString()}`,
        method: "GET",
        token,
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(
          res.data?.message || "세부 내역을 불러오지 못했습니다.",
        );
      }
      return res.data.data;
    },
  });

  const title = activeMetric ? METRIC_TITLE[activeMetric] : "세부 내역";
  const hint = activeMetric ? METRIC_HINT[activeMetric] : "";
  const items = Array.isArray(data?.items) ? data.items : [];
  const total = Number(data?.total || 0);
  const totalRevenue = Number(data?.totalRevenue || 0);

  const rangeLabel = (() => {
    if (!data?.range) return null;
    if (data.range.fromYmd && data.range.toYmd) {
      if (data.range.fromYmd === data.range.toYmd) return data.range.fromYmd;
      return `${data.range.fromYmd} ~ ${data.range.toYmd}`;
    }
    if (data.range.startDate && data.range.endDate) {
      return `${formatKstDate(data.range.startDate)} ~ ${formatKstDate(data.range.endDate)}`;
    }
    return null;
  })();

  return (
    <MultiActionDialog
      open={open}
      onClose={onClose}
      panelClassName="!w-[min(1100px,calc(100vw-2rem))] !max-w-[calc(100vw-2rem)] !h-[80vh]"
      descriptionClassName="h-full"
      descriptionScrollable={false}
      title={title}
      description={
        <div className="flex h-full min-h-0 flex-col gap-3">
          <div className="text-sm text-slate-600">
            {hint}
            {rangeLabel ? (
              <span className="ml-1 text-slate-500">({rangeLabel})</span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
            <span>
              {activeMetric === "periodRevenue"
                ? `주문 ${total.toLocaleString()}건 · 매출 ₩${totalRevenue.toLocaleString()}`
                : activeMetric === "periodRequests"
                  ? `총 ${total.toLocaleString()}건`
                  : `총 ${total.toLocaleString()}명`}
            </span>
            {items.length < total ? (
              <span className="text-xs text-muted-foreground">
                표시 {items.length.toLocaleString()} / {total.toLocaleString()}
              </span>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-md border border-slate-200 bg-white">
            {isLoading ? (
              <div className="p-6 text-sm text-muted-foreground">불러오는 중…</div>
            ) : isError ? (
              <div className="p-6 text-sm text-destructive">
                {error instanceof Error
                  ? error.message
                  : "세부 내역을 불러오지 못했습니다."}
              </div>
            ) : items.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">내역이 없습니다.</div>
            ) : activeMetric === "periodRequests" ? (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-600">
                  <tr className="border-b">
                    <th className="px-3 py-2 font-medium">의뢰번호</th>
                    <th className="px-3 py-2 font-medium">의뢰자</th>
                    <th className="px-3 py-2 font-medium">상태</th>
                    <th className="px-3 py-2 font-medium">금액</th>
                    <th className="px-3 py-2 font-medium">생성일</th>
                  </tr>
                </thead>
                <tbody>
                  {(items as RequestItem[]).map((row) => (
                    <tr
                      key={row.requestMongoId || row.requestId}
                      className="border-b last:border-0"
                    >
                      <td className="px-3 py-2">
                        <div className="font-medium">{row.requestId || "-"}</div>
                        {row.title ? (
                          <div className="text-xs text-muted-foreground line-clamp-1">
                            {row.title}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">
                          {row.requestor?.business ||
                            row.requestor?.name ||
                            "-"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {row.requestor?.name || row.requestor?.email || ""}
                        </div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {row.status || "-"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                        ₩{Number(row.paidAmount || 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-600">
                        {formatKstDateTime(row.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : activeMetric === "periodRevenue" ? (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-600">
                  <tr className="border-b">
                    <th className="px-3 py-2 font-medium">사용자</th>
                    <th className="px-3 py-2 font-medium">역할</th>
                    <th className="px-3 py-2 font-medium">주문</th>
                    <th className="px-3 py-2 font-medium">매출</th>
                    <th className="px-3 py-2 font-medium">평균 단가</th>
                  </tr>
                </thead>
                <tbody>
                  {(items as RevenueItem[]).map((row) => (
                    <tr key={row.userId} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        <div className="font-medium">
                          {row.business || row.name || row.userId || "-"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {[row.name, row.email].filter(Boolean).join(" · ")}
                        </div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {getAppUserRoleLabel(String(row.role || ""))}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {Number(row.orders || 0).toLocaleString()}건
                      </td>
                      <td className="px-3 py-2 tabular-nums font-medium">
                        ₩{Number(row.revenue || 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        ₩{Number(row.avgUnitPrice || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-600">
                  <tr className="border-b">
                    <th className="px-3 py-2 font-medium">사용자</th>
                    <th className="px-3 py-2 font-medium">역할</th>
                    {activeMetric === "totalUsers" ? (
                      <th className="px-3 py-2 font-medium">가입일</th>
                    ) : (
                      <>
                        <th className="px-3 py-2 font-medium">접속일수</th>
                        <th className="px-3 py-2 font-medium">최초</th>
                        <th className="px-3 py-2 font-medium">최근</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(items as AccessItem[]).map((row) => (
                    <tr key={row.userId} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        <div className="font-medium">
                          {row.business || row.name || row.userId || "-"}
                          {row.active === false ? (
                            <span className="ml-1 text-[11px] text-muted-foreground">
                              (비활성)
                            </span>
                          ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {[row.name, row.email].filter(Boolean).join(" · ")}
                        </div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {getAppUserRoleLabel(String(row.role || ""))}
                      </td>
                      {activeMetric === "totalUsers" ? (
                        <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-600">
                          {formatKstDateTime(row.createdAt)}
                        </td>
                      ) : (
                        <>
                          <td className="px-3 py-2 tabular-nums">
                            {Number(row.dayCount || 0).toLocaleString()}일
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-600">
                            {formatKstDateTime(row.firstAt)}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-600">
                            {formatKstDateTime(row.lastAt)}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      }
      actions={[
        {
          label: "닫기",
          variant: "secondary",
          onClick: onClose,
        },
      ]}
    />
  );
}

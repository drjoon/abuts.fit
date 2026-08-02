// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/realtime/useAppEventDebouncedReload.ts
// - web/backend/utils/creditRealtime.js
// - web/frontend/src/shared/realtime/useAppEventDebouncedReload.ts
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { usePeriodStore, periodToRangeQuery } from "@/store/usePeriodStore";
import { useToast } from "@/shared/hooks/use-toast";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search } from "lucide-react";
import { useAppEventDebouncedReload } from "@/shared/realtime/useAppEventDebouncedReload";

const HISTORY_MONTHS = 6;

/**
 * AdminPaymentsPage - 관리자 정산 페이지
 *
 * SSOT 원칙 (rules.md 1.0):
 * - businessType은 BusinessAnchor.businessType만 사용 (fallback 금지)
 * - 정산 금액은 백엔드 집계값을 그대로 표시 (frontend 재계산 최소화)
 */

type SalesmanRow = {
  userId: string;
  name: string;
  email: string;
  role?: string;
  active: boolean;
  businessAnchorId: string;
  businessAnchor: {
    id: string;
    name: string;
    businessType: string;
    representativeName?: string;
    email?: string;
    phoneNumber?: string;
  };
  wallet?: {
    balanceAmountPeriod?: number;
    freeRequestAmountPeriod?: number;
    freeRequestCountPeriod?: number;
    freeShippingAmountPeriod?: number;
    freeShippingCountPeriod?: number;
    freeAmountPeriod?: number;
  };
  performance30d?: {
    commissionAmount?: number;
    revenueAmount?: number;
    introducedCount?: number;
  };
};

type MonthlyHistoryRow = {
  label: string;
  paidAmount: number;
  freeRequestAmount: number;
  freeRequestCount: number;
  freeShippingAmount: number;
  freeShippingCount: number;
  freeTotalAmount: number;
};

type ManufacturerSummary = {
  anchorCount?: number;
  periodEarnedAmount?: number;
  periodPaidOutAmount?: number;
  periodBalanceAmount?: number;
  totalBalanceAmount?: number;
  periodFreeRequestAmount?: number;
  periodFreeRequestCount?: number;
  periodFreeShippingAmount?: number;
  periodFreeShippingCount?: number;
  periodPaidRequestAmount?: number;
  periodPaidRequestCount?: number;
  periodPaidShippingAmount?: number;
  periodPaidShippingCount?: number;
  periodShippingAmount?: number;
  periodFreeAmount?: number;
};

const formatMoney = (value?: number) =>
  typeof value === "number" ? value.toLocaleString("ko-KR") : "0";

type AnchorGroup = {
  businessAnchorId: string;
  businessType: string;
  name: string;
  representativeName?: string;
  email?: string;
  phoneNumber?: string;
  memberCount: number;
  activeMemberCount: number;
  revenueAmount: number;
  commissionAmount: number;
  balanceAmount: number;
  freeRequestAmount: number;
  freeShippingAmount: number;
  freeAmount: number;
  introducedCount: number;
};

type AdminCreditRow = {
  adminUserId: string;
  businessAnchorId?: string | null;
  name: string;
  email: string;
  active: boolean;
  wallet?: {
    earnedAmount?: number;
    paidOutAmount?: number;
    adjustedAmount?: number;
    balanceAmount?: number;
    earnedAmountPeriod?: number;
    paidOutAmountPeriod?: number;
    adjustedAmountPeriod?: number;
    balanceAmountPeriod?: number;
    freeRequestAmount?: number;
    freeRequestCount?: number;
    freeShippingAmount?: number;
    freeShippingCount?: number;
    freeAmount?: number;
    freeRequestAmountPeriod?: number;
    freeRequestCountPeriod?: number;
    freeShippingAmountPeriod?: number;
    freeShippingCountPeriod?: number;
    freeAmountPeriod?: number;
  };
};

/** 역할별 정산 카드 */
function SettlementCard({ group }: { group: AnchorGroup }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{group.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">대표자</span>
          <span>{group.representativeName || "-"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">연락처</span>
          <span>{group.email || group.phoneNumber || "-"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">활성 멤버</span>
          <span>
            {group.activeMemberCount}/{group.memberCount}명
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">소개한 사업자</span>
          <span>{group.introducedCount}개</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">기간 매출</span>
          <span>{formatMoney(group.revenueAmount)}원</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">기간 수수료</span>
          <span>{formatMoney(group.commissionAmount)}원</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">미정산 잔액</span>
          <span className="font-semibold text-blue-600">
            {formatMoney(group.balanceAmount)}원
          </span>
        </div>
      </CardContent>
    </Card>
  );
}



/** 정책/요약 카드 */
function SummaryCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string;
  description: string;
}) {
  return (
    <Card className="min-h-[116px]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground break-keep">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-lg sm:text-xl md:text-2xl font-bold tabular-nums">{value}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </CardContent>
    </Card>
  );
}

function SummaryBreakdownCard({
  title,
  totalValue,
  requestValue,
  shippingValue,
  requestCount,
  shippingCount,
  description,
}: {
  title: string;
  totalValue: string;
  requestValue: string;
  shippingValue: string;
  requestCount?: number;
  shippingCount?: number;
  description?: string;
}) {
  return (
    <Card className="min-h-[116px]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground break-keep">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-lg sm:text-xl md:text-2xl font-bold tabular-nums text-violet-700 leading-tight">
          {totalValue}
        </div>
        <div className="space-y-0.5 text-xs text-muted-foreground tabular-nums leading-tight">
          <div>
            의뢰 {requestValue}
            {Number.isFinite(Number(requestCount))
              ? ` (${Number(requestCount).toLocaleString()})`
              : ""}
          </div>
          <div>
            배송 {shippingValue}
            {Number.isFinite(Number(shippingCount))
              ? ` (${Number(shippingCount).toLocaleString()})`
              : ""}
          </div>
        </div>
        {description ? (
          <div className="text-xs text-muted-foreground">{description}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}

/** 역할별 요약 섹션 */
function MonthlyHistorySection({
  title,
  rows,
  isLoading,
}: {
  title: string;
  rows: MonthlyHistoryRow[];
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground break-keep">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">월별 내역을 불러오는 중입니다.</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">표시할 월별 내역이 없습니다.</div>
        ) : (
          <div className="space-y-1">
            {rows.map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-1 gap-1 rounded border p-2 text-xs sm:grid-cols-2 lg:grid-cols-4"
              >
                <div className="font-medium">{row.label}</div>
                <div>유료 {formatMoney(row.paidAmount)}원</div>
                <div>
                  무료 의뢰 {formatMoney(row.freeRequestAmount)}원 ({row.freeRequestCount.toLocaleString()})
                </div>
                <div>
                  무료 배송 {formatMoney(row.freeShippingAmount)}원 ({row.freeShippingCount.toLocaleString()})
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RoleSummarySection({
  title,
  rate,
  groups,
  displayGroups,
  summaryData,
  extraCard,
  cardGridClassName,
  bottomContent,
}: {
  title: string;
  rate: string;
  groups: AnchorGroup[];
  displayGroups?: AnchorGroup[];
  summaryData?: {
    count?: number;
    earned?: number;
    balance?: number;
    paidOut?: number;
    freeRequest?: number;
    freeShipping?: number;
    freeTotal?: number;
    requestDetailCount?: number;
    shippingDetailCount?: number;
  };
  extraCard?: ReactNode;
  cardGridClassName?: string;
  bottomContent?: ReactNode;
}) {
  const fallbackBalanceTotal = groups.reduce(
    (sum, g) => sum + Number(g.balanceAmount || 0),
    0,
  );

  const fallbackFreeRequestTotal = groups.reduce(
    (sum, g) => sum + Number(g.freeRequestAmount || 0),
    0,
  );
  const fallbackFreeShippingTotal = groups.reduce(
    (sum, g) => sum + Number(g.freeShippingAmount || 0),
    0,
  );
  const fallbackFreeTotal = groups.reduce(
    (sum, g) => sum + Number(g.freeAmount || 0),
    0,
  );
  const fallbackRequestDetailCount = groups.filter(
    (g) => Number(g.freeRequestAmount || 0) !== 0,
  ).length;
  const fallbackShippingDetailCount = groups.filter(
    (g) => Number(g.freeShippingAmount || 0) !== 0,
  ).length;
  const renderGroups = displayGroups ?? groups;

  return (
    <div className="space-y-4">
      <div className={cardGridClassName || "grid gap-3 sm:grid-cols-2 xl:grid-cols-4"}>
        <SummaryCard
          title={`${title} 배분율`}
          value={rate}
          description="유료의뢰비 기준"
        />
        <SummaryCard
          title="사업자 수"
          value={`${summaryData?.count ?? groups.length}개`}
          description="BusinessAnchor 기준"
        />
        <SummaryCard
          title="유료 미정산액 합계"
          value={`${formatMoney(summaryData?.balance ?? fallbackBalanceTotal)}원`}
          description="누적 미지급 잔액"
        />
        <SummaryBreakdownCard
          title="무료 미정산액 합계"
          totalValue={`${formatMoney(summaryData?.freeTotal ?? fallbackFreeTotal)}원`}
          requestValue={`${formatMoney(summaryData?.freeRequest ?? fallbackFreeRequestTotal)}원`}
          shippingValue={`${formatMoney(summaryData?.freeShipping ?? fallbackFreeShippingTotal)}원`}
          requestCount={summaryData?.requestDetailCount ?? fallbackRequestDetailCount}
          shippingCount={summaryData?.shippingDetailCount ?? fallbackShippingDetailCount}
        />
        {extraCard}
      </div>
      {bottomContent ? (
        bottomContent
      ) : renderGroups.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {renderGroups.map((group) => (
            <SettlementCard key={group.businessAnchorId} group={group} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function AdminPaymentsPage() {
  const { token, user } = useAuthStore();
  const { period, customStartDate, customEndDate } = usePeriodStore();
  const { toast } = useToast();
  const [rows, setRows] = useState<SalesmanRow[]>([]);
  const [manufacturerSummary, setManufacturerSummary] =
    useState<ManufacturerSummary | null>(null);
  const [adminRows, setAdminRows] = useState<AdminCreditRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("manufacturer");
  const [searchQuery, setSearchQuery] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [monthlyHistory, setMonthlyHistory] = useState<{
    manufacturer: MonthlyHistoryRow[];
    salesman: MonthlyHistoryRow[];
    devops: MonthlyHistoryRow[];
    admin: MonthlyHistoryRow[];
  }>({ manufacturer: [], salesman: [], devops: [], admin: [] });

  const loadSettlementSummary = useCallback(
    async ({ withLoading = true }: { withLoading?: boolean } = {}) => {
      if (!token) return;
      if (withLoading) setIsLoading(true);

      const rangeQuery = periodToRangeQuery(period, {
        customStartDate,
        customEndDate,
      }).replace(/^\?/, "&");

      try {
        const [rowsRes, mfgRes, adminRes] = await Promise.all([
          request<{
            success?: boolean;
            data?: { items?: SalesmanRow[] };
            message?: string;
          }>({
            path: `/api/admin/credits/salesmen?limit=200&skip=0${rangeQuery}`,
            method: "GET",
            token,
          }),
          request<{
            success?: boolean;
            data?: ManufacturerSummary;
            message?: string;
          }>({
            path: `/api/admin/credits/manufacturer/summary?period=${encodeURIComponent(period)}${rangeQuery}`,
            method: "GET",
            token,
          }),
          request<{
            success?: boolean;
            data?: { items?: AdminCreditRow[] };
            message?: string;
          }>({
            path: `/api/admin/credits/admins?limit=200&skip=0${rangeQuery}`,
            method: "GET",
            token,
          }),
        ]);

        if (rowsRes.ok && rowsRes.data?.success) {
          setRows(
            Array.isArray(rowsRes.data.data?.items)
              ? rowsRes.data.data.items
              : [],
          );
        }
        if (mfgRes.ok && mfgRes.data?.success) {
          setManufacturerSummary(mfgRes.data.data || null);
        }
        if (adminRes.ok && adminRes.data?.success) {
          setAdminRows(
            Array.isArray(adminRes.data.data?.items)
              ? adminRes.data.data.items
              : [],
          );
        }
      } catch (error: unknown) {
        toast({
          title: "정산 조회 실패",
          description:
            error instanceof Error ? error.message : "다시 시도해주세요.",
          variant: "destructive",
        });
      } finally {
        if (withLoading) setIsLoading(false);
      }
    },
    [customEndDate, customStartDate, period, toast, token],
  );

  useEffect(() => {
    void loadSettlementSummary({ withLoading: true });
  }, [loadSettlementSummary]);

  // 웹소켓 실시간 업데이트: CAM 승인/공정 이동/크레딧 변동 시
  // 관리자 정산 화면을 무플리커로 동기화한다.
  useAppEventDebouncedReload({
    enabled: Boolean(token) && user?.role === "admin",
    eventTypes: [
      "request:stage-changed",
      "credit:balance-updated",
      "request:delivery-updated",
      "request:delivery-updated-batch",
    ],
    delayMs: 120,
    deferWhenEditing: false,
    onMatch: () => {
      void loadSettlementSummary({ withLoading: false });
    },
  });

  useEffect(() => {
    if (!token) return;
    let mounted = true;

    const monthRanges = Array.from({ length: HISTORY_MONTHS }).map((_, idx) => {
      const d = new Date();
      d.setMonth(d.getMonth() - idx);
      const y = d.getFullYear();
      const m = d.getMonth();
      const start = new Date(y, m, 1, 0, 0, 0, 0);
      const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
      return {
        label: `${y}-${String(m + 1).padStart(2, "0")}`,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      };
    });

    const loadMonthlyHistory = async () => {
      setHistoryLoading(true);
      try {
        const rows = await Promise.all(
          monthRanges.map(async (month) => {
            const [salesmenRes, adminsRes, manufacturerRes] = await Promise.all([
              request<{ success?: boolean; data?: { items?: SalesmanRow[] } }>({
                path: `/api/admin/credits/salesmen?limit=500&skip=0&startDate=${encodeURIComponent(month.startDate)}&endDate=${encodeURIComponent(month.endDate)}`,
                method: "GET",
                token,
              }),
              request<{ success?: boolean; data?: { items?: AdminCreditRow[] } }>({
                path: `/api/admin/credits/admins?limit=500&skip=0&startDate=${encodeURIComponent(month.startDate)}&endDate=${encodeURIComponent(month.endDate)}`,
                method: "GET",
                token,
              }),
              request<{ success?: boolean; data?: ManufacturerSummary }>({
                path: `/api/admin/credits/manufacturer/summary?period=custom&startDate=${encodeURIComponent(month.startDate)}&endDate=${encodeURIComponent(month.endDate)}`,
                method: "GET",
                token,
              }),
            ]);

            const salesmenItems =
              salesmenRes.ok && salesmenRes.data?.success
                ? Array.isArray(salesmenRes.data.data?.items)
                  ? salesmenRes.data.data.items
                  : []
                : [];

            const adminItems =
              adminsRes.ok && adminsRes.data?.success
                ? Array.isArray(adminsRes.data.data?.items)
                  ? adminsRes.data.data.items
                  : []
                : [];

            const buildFromSalesRows = (role: "salesman" | "devops") => {
              const roleRows = salesmenItems.filter((r) => r.role === role);
              const dedupMap = new Map<string, SalesmanRow>();
              for (const r of roleRows) {
                const key = String(r.businessAnchorId || r.userId || "").trim();
                if (!key) continue;
                if (!dedupMap.has(key)) dedupMap.set(key, r);
              }
              const roleFinanceRows = Array.from(dedupMap.values());

              const paidAmount = roleFinanceRows.reduce(
                (sum, r) => sum + Number(r.wallet?.balanceAmountPeriod || 0),
                0,
              );
              const freeRequestAmount = roleFinanceRows.reduce(
                (sum, r) => sum + Number(r.wallet?.freeRequestAmountPeriod || 0),
                0,
              );
              const freeRequestCount = roleFinanceRows.reduce(
                (sum, r) => sum + Number(r.wallet?.freeRequestCountPeriod || 0),
                0,
              );
              const freeShippingAmount = roleFinanceRows.reduce(
                (sum, r) => sum + Number(r.wallet?.freeShippingAmountPeriod || 0),
                0,
              );
              const freeShippingCount = roleFinanceRows.reduce(
                (sum, r) => sum + Number(r.wallet?.freeShippingCountPeriod || 0),
                0,
              );
              return {
                label: month.label,
                paidAmount,
                freeRequestAmount,
                freeRequestCount,
                freeShippingAmount,
                freeShippingCount,
                freeTotalAmount: freeRequestAmount + freeShippingAmount,
              } satisfies MonthlyHistoryRow;
            };

            const manufacturer =
              manufacturerRes.ok && manufacturerRes.data?.success
                ? manufacturerRes.data.data || null
                : null;

            const adminFinanceMap = new Map<string, AdminCreditRow>();
            for (const row of adminItems) {
              const key = String(row.businessAnchorId || row.adminUserId || "").trim();
              if (!key) continue;
              if (!adminFinanceMap.has(key)) adminFinanceMap.set(key, row);
            }
            const adminFinanceItems = Array.from(adminFinanceMap.values());

            const adminPaidAmount = adminFinanceItems.reduce(
              (sum, r) => sum + Number(r.wallet?.balanceAmountPeriod || 0),
              0,
            );
            const adminFreeRequestAmount = adminFinanceItems.reduce(
              (sum, r) => sum + Number(r.wallet?.freeRequestAmountPeriod || 0),
              0,
            );
            const adminFreeRequestCount = adminFinanceItems.reduce(
              (sum, r) => sum + Number(r.wallet?.freeRequestCountPeriod || 0),
              0,
            );
            const adminFreeShippingAmount = adminFinanceItems.reduce(
              (sum, r) => sum + Number(r.wallet?.freeShippingAmountPeriod || 0),
              0,
            );
            const adminFreeShippingCount = adminFinanceItems.reduce(
              (sum, r) => sum + Number(r.wallet?.freeShippingCountPeriod || 0),
              0,
            );

            return {
              manufacturer: {
                label: month.label,
                paidAmount: Number(manufacturer?.periodBalanceAmount || 0),
                freeRequestAmount: Number(manufacturer?.periodFreeRequestAmount || 0),
                freeRequestCount: Number(manufacturer?.periodFreeRequestCount || 0),
                freeShippingAmount: Number(manufacturer?.periodFreeShippingAmount || 0),
                freeShippingCount: Number(manufacturer?.periodFreeShippingCount || 0),
                freeTotalAmount: Number(manufacturer?.periodFreeAmount || 0),
              } satisfies MonthlyHistoryRow,
              salesman: buildFromSalesRows("salesman"),
              devops: buildFromSalesRows("devops"),
              admin: {
                label: month.label,
                paidAmount: adminPaidAmount,
                freeRequestAmount: adminFreeRequestAmount,
                freeRequestCount: adminFreeRequestCount,
                freeShippingAmount: adminFreeShippingAmount,
                freeShippingCount: adminFreeShippingCount,
                freeTotalAmount: adminFreeRequestAmount + adminFreeShippingAmount,
              } satisfies MonthlyHistoryRow,
            };
          }),
        );

        if (!mounted) return;
        setMonthlyHistory({
          manufacturer: rows.map((r) => r.manufacturer),
          salesman: rows.map((r) => r.salesman),
          devops: rows.map((r) => r.devops),
          admin: rows.map((r) => r.admin),
        });
      } catch {
        if (!mounted) return;
        setMonthlyHistory({ manufacturer: [], salesman: [], devops: [], admin: [] });
      } finally {
        if (mounted) setHistoryLoading(false);
      }
    };

    void loadMonthlyHistory();
    return () => {
      mounted = false;
    };
  }, [token]);

  /**
   * BusinessAnchor 기준 그룹화
   * - SSOT: businessAnchorId, businessType은 BusinessAnchor 값만 사용
   * - 집계: sum (Math.max 오류 수정)
   */
  const anchorGroups = useMemo((): AnchorGroup[] => {
    // 1) 먼저 businessAnchorId 기준으로 행을 그룹화한다.
    const rowsByAnchor = new Map<string, SalesmanRow[]>();
    for (const row of rows) {
      const anchorId = String(row.businessAnchorId || "").trim();
      const businessType = String(row.businessAnchor?.businessType || "").trim();
      if (!anchorId || !businessType) continue;
      const bucket = rowsByAnchor.get(anchorId) || [];
      bucket.push(row);
      rowsByAnchor.set(anchorId, bucket);
    }

    // 2) 그룹 단위로 요약값을 만든다.
    const groups: AnchorGroup[] = [];
    for (const [anchorId, groupedRows] of rowsByAnchor.entries()) {
      if (!groupedRows.length) continue;

      const first = groupedRows[0];
      const businessType = String(first.businessAnchor?.businessType || "").trim();
      if (!businessType) continue;

      const memberCount = groupedRows.length;
      const activeMemberCount = groupedRows.filter((r) => Boolean(r.active)).length;

      // 정산 금액/건수는 anchor 스냅샷이므로 user 행 합산이 아닌 단일값 기준으로 사용
      // (동일 anchor에 사용자 여러 명이어도 중복 가산 방지)
      const balanceAmount = Number(first.wallet?.balanceAmountPeriod || 0);
      const freeRequestAmount = Number(first.wallet?.freeRequestAmountPeriod || 0);
      const freeShippingAmount = Number(first.wallet?.freeShippingAmountPeriod || 0);
      const freeAmount = Number(first.wallet?.freeAmountPeriod || 0);
      const revenueAmount = Number(first.performance30d?.revenueAmount || 0);
      const commissionAmount = Number(first.performance30d?.commissionAmount || 0);
      const introducedCount = Number(first.performance30d?.introducedCount || 0);

      groups.push({
        businessAnchorId: anchorId,
        businessType,
        name: first.businessAnchor?.name?.trim() || first.name?.trim() || "-",
        representativeName: first.businessAnchor?.representativeName?.trim(),
        email: first.businessAnchor?.email?.trim() || first.email?.trim(),
        phoneNumber: first.businessAnchor?.phoneNumber?.trim(),
        memberCount,
        activeMemberCount,
        revenueAmount,
        commissionAmount,
        balanceAmount,
        freeRequestAmount,
        freeShippingAmount,
        freeAmount,
        introducedCount,
      });
    }

    return groups.sort(
      (a, b) =>
        b.balanceAmount - a.balanceAmount ||
        b.commissionAmount - a.commissionAmount ||
        a.name.localeCompare(b.name, "ko"),
    );
  }, [rows]);

  const groupsByType = useMemo(() => {
    const byType = (type: string) =>
      anchorGroups.filter((g) => g.businessType === type);
    return {
      manufacturer: byType("manufacturer"),
      salesman: byType("salesman"),
      devops: byType("devops"),
    };
  }, [anchorGroups]);

  const adminFinanceRows = useMemo(() => {
    const map = new Map<string, AdminCreditRow>();
    for (const row of adminRows) {
      const key = String(row.businessAnchorId || row.adminUserId || "").trim();
      if (!key) continue;
      if (!map.has(key)) map.set(key, row);
    }
    return Array.from(map.values());
  }, [adminRows]);

  const roleFinanceRows = useMemo(() => {
    const map = new Map<string, SalesmanRow>();
    for (const row of rows) {
      const anchorId = String(row.businessAnchorId || "").trim();
      const role = String(row.role || "").trim();
      if (!anchorId || (role !== "salesman" && role !== "devops")) continue;
      const key = `${role}:${anchorId}`;
      if (!map.has(key)) map.set(key, row);
    }

    const values = Array.from(map.values());
    return {
      salesman: values.filter((r) => r.role === "salesman"),
      devops: values.filter((r) => r.role === "devops"),
    };
  }, [rows]);

  const filteredBySearch = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return {
        manufacturer: groupsByType.manufacturer,
        salesman: groupsByType.salesman,
        devops: groupsByType.devops,
      };
    }

    const matchGroup = (group: AnchorGroup) => {
      const haystack = [
        group.name,
        group.representativeName,
        group.email,
        group.phoneNumber,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    };

    return {
      manufacturer: groupsByType.manufacturer.filter(matchGroup),
      salesman: groupsByType.salesman.filter(matchGroup),
      devops: groupsByType.devops.filter(matchGroup),
    };
  }, [groupsByType, searchQuery]);

  const totals = useMemo(() => {
    const paidRequestRevenue = Number(
      manufacturerSummary?.periodPaidRequestAmount || 0,
    );

    const manufacturerPaid = Number(manufacturerSummary?.periodBalanceAmount || 0);
    const salesmanPaid = roleFinanceRows.salesman.reduce(
      (sum, row) => sum + Number(row.wallet?.balanceAmountPeriod || 0),
      0,
    );
    const devopsPaid = roleFinanceRows.devops.reduce(
      (sum, row) => sum + Number(row.wallet?.balanceAmountPeriod || 0),
      0,
    );
    const adminPaid = adminFinanceRows.reduce(
      (sum, row) => sum + Number(row.wallet?.balanceAmountPeriod || 0),
      0,
    );

    const manufacturerFreeRequest = Number(
      manufacturerSummary?.periodFreeRequestAmount || 0,
    );
    const manufacturerFreeShipping = Number(
      manufacturerSummary?.periodFreeShippingAmount || 0,
    );
    const salesmanFreeRequest = roleFinanceRows.salesman.reduce(
      (sum, row) => sum + Number(row.wallet?.freeRequestAmountPeriod || 0),
      0,
    );
    const salesmanFreeShipping = roleFinanceRows.salesman.reduce(
      (sum, row) => sum + Number(row.wallet?.freeShippingAmountPeriod || 0),
      0,
    );
    const devopsFreeRequest = roleFinanceRows.devops.reduce(
      (sum, row) => sum + Number(row.wallet?.freeRequestAmountPeriod || 0),
      0,
    );
    const devopsFreeShipping = roleFinanceRows.devops.reduce(
      (sum, row) => sum + Number(row.wallet?.freeShippingAmountPeriod || 0),
      0,
    );
    const adminFreeRequest = adminFinanceRows.reduce(
      (sum, row) => sum + Number(row.wallet?.freeRequestAmountPeriod || 0),
      0,
    );
    const adminFreeShipping = adminFinanceRows.reduce(
      (sum, row) => sum + Number(row.wallet?.freeShippingAmountPeriod || 0),
      0,
    );

    const freeRequestTotal =
      manufacturerFreeRequest +
      salesmanFreeRequest +
      devopsFreeRequest +
      adminFreeRequest;
    const freeShippingTotal =
      manufacturerFreeShipping +
      salesmanFreeShipping +
      devopsFreeShipping +
      adminFreeShipping;

    const manufacturerCount = Number(
      manufacturerSummary?.anchorCount || groupsByType.manufacturer.length,
    );
    const salesmanCount = groupsByType.salesman.length;
    const devopsCount = groupsByType.devops.length;
    const adminCount = adminRows.length;

    const manufacturerPaidCount = Number(manufacturerPaid !== 0 ? manufacturerCount : 0);
    const salesmanPaidCount = roleFinanceRows.salesman.filter(
      (row) => Number(row.wallet?.balanceAmountPeriod || 0) !== 0,
    ).length;
    const devopsPaidCount = roleFinanceRows.devops.filter(
      (row) => Number(row.wallet?.balanceAmountPeriod || 0) !== 0,
    ).length;
    const adminPaidCount = adminFinanceRows.filter(
      (row) => Number(row.wallet?.balanceAmountPeriod || 0) !== 0,
    ).length;

    const manufacturerRequestDetailCount = Number(
      manufacturerSummary?.periodFreeRequestCount || 0,
    );
    const salesmanRequestDetailCount = roleFinanceRows.salesman.reduce(
      (sum, row) => sum + Number(row.wallet?.freeRequestCountPeriod || 0),
      0,
    );
    const devopsRequestDetailCount = roleFinanceRows.devops.reduce(
      (sum, row) => sum + Number(row.wallet?.freeRequestCountPeriod || 0),
      0,
    );
    const adminRequestDetailCount = adminFinanceRows.reduce(
      (sum, row) => sum + Number(row.wallet?.freeRequestCountPeriod || 0),
      0,
    );

    const manufacturerShippingDetailCount = Number(
      manufacturerSummary?.periodFreeShippingCount || 0,
    );
    const salesmanShippingDetailCount = roleFinanceRows.salesman.reduce(
      (sum, row) => sum + Number(row.wallet?.freeShippingCountPeriod || 0),
      0,
    );
    const devopsShippingDetailCount = roleFinanceRows.devops.reduce(
      (sum, row) => sum + Number(row.wallet?.freeShippingCountPeriod || 0),
      0,
    );
    const adminShippingDetailCount = adminFinanceRows.reduce(
      (sum, row) => sum + Number(row.wallet?.freeShippingCountPeriod || 0),
      0,
    );

    const paidRequestCount = Number(
      manufacturerSummary?.periodPaidRequestCount || 0,
    );

    const manufacturerPaidShippingAmount = Number(
      manufacturerSummary?.periodPaidShippingAmount || 0,
    );
    const manufacturerPaidShippingCount = Number(
      manufacturerSummary?.periodPaidShippingCount || 0,
    );
    const manufacturerShippingAmount = Number(
      manufacturerSummary?.periodShippingAmount ||
        manufacturerPaidShippingAmount + manufacturerFreeShipping,
    );

    const uniqueRequestDetailCount = Number(
      manufacturerSummary?.periodFreeRequestCount || 0,
    );
    const uniqueShippingDetailCount = Number(
      manufacturerSummary?.periodFreeShippingCount || 0,
    );

    return {
      settlementTargetRoleCount: 4,
      paidRequestRevenue,
      paidRequestCount,
      paidShippingRevenue: manufacturerPaidShippingAmount,
      paidShippingCount: manufacturerPaidShippingCount,
      paidRevenueTotal: paidRequestRevenue + manufacturerPaidShippingAmount,
      unpaidBalance: manufacturerPaid + salesmanPaid + devopsPaid + adminPaid,
      manufacturerPaid,
      salesmanPaid,
      devopsPaid,
      adminPaid,
      manufacturerFreeRequest,
      manufacturerFreeShipping,
      salesmanFreeRequest,
      salesmanFreeShipping,
      devopsFreeRequest,
      devopsFreeShipping,
      adminFreeRequest,
      adminFreeShipping,
      manufacturerPaidCount,
      salesmanPaidCount,
      devopsPaidCount,
      adminPaidCount,
      freeRequestTotal,
      freeShippingTotal,
      freeTotal: freeRequestTotal + freeShippingTotal,
      manufacturerCount,
      salesmanCount,
      devopsCount,
      adminCount,
      manufacturerRequestDetailCount,
      salesmanRequestDetailCount,
      devopsRequestDetailCount,
      adminRequestDetailCount,
      manufacturerShippingDetailCount,
      salesmanShippingDetailCount,
      devopsShippingDetailCount,
      adminShippingDetailCount,
      manufacturerPaidShippingAmount,
      manufacturerPaidShippingCount,
      manufacturerShippingAmount,
      // 상단 총건수는 role 라인 합산이 아닌, 요청 유니크 기준(GL 제조사 commit)으로 표시
      requestDetailCount: uniqueRequestDetailCount,
      shippingDetailCount: uniqueShippingDetailCount,
    };
  }, [adminFinanceRows, adminRows, groupsByType, manufacturerSummary, roleFinanceRows]);

  if (!user || user.role !== "admin") return null;

  return (
    <DashboardShell
      title="정산"
      subtitle="유료의뢰비 기준 수익 배분 및 정산 현황"
      headerRight={undefined}
      statsGridClassName="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
      stats={
        <>
          <Card className="min-h-[116px]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground break-keep">
                유료 의뢰비/배송비 총액
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="text-lg sm:text-xl md:text-2xl font-bold tabular-nums">
                {isLoading ? "-" : `${formatMoney(totals.paidRevenueTotal)}원`}
              </div>
              <div className="space-y-0.5 text-xs text-muted-foreground tabular-nums leading-tight">
                <div>
                  의뢰비 {isLoading ? "-" : `${formatMoney(totals.paidRequestRevenue)}원`} ({isLoading ? "-" : totals.paidRequestCount.toLocaleString()})
                </div>
                <div>
                  배송비 {isLoading ? "-" : `${formatMoney(totals.paidShippingRevenue)}원`} ({isLoading ? "-" : totals.paidShippingCount.toLocaleString()})
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="min-h-[116px]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground break-keep">
                유료 미정산액 합계
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-start justify-between gap-3">
                <div className="text-lg sm:text-xl md:text-2xl font-bold tabular-nums text-blue-700 leading-tight">
                  {isLoading ? "-" : `${formatMoney(totals.unpaidBalance)}원`}
                </div>
                <div className="space-y-0.5 text-right text-xs text-muted-foreground tabular-nums leading-tight">
                  <div>
                    제조사 {isLoading ? "-" : `${formatMoney(totals.manufacturerPaid)}원`} ({isLoading ? "-" : totals.manufacturerPaidCount.toLocaleString()})
                  </div>
                  <div>
                    영업자 {isLoading ? "-" : `${formatMoney(totals.salesmanPaid)}원`} ({isLoading ? "-" : totals.salesmanPaidCount.toLocaleString()})
                  </div>
                  <div>
                    개발운영사 {isLoading ? "-" : `${formatMoney(totals.devopsPaid)}원`} ({isLoading ? "-" : totals.devopsPaidCount.toLocaleString()})
                  </div>
                  <div>
                    관리자 {isLoading ? "-" : `${formatMoney(totals.adminPaid)}원`} ({isLoading ? "-" : totals.adminPaidCount.toLocaleString()})
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          <SummaryBreakdownCard
            title="무료 미정산액 합계"
            totalValue={isLoading ? "-" : `${formatMoney(totals.freeTotal)}원`}
            requestValue={isLoading ? "-" : `${formatMoney(totals.freeRequestTotal)}원`}
            shippingValue={isLoading ? "-" : `${formatMoney(totals.freeShippingTotal)}원`}
            requestCount={isLoading ? undefined : totals.requestDetailCount}
            shippingCount={isLoading ? undefined : totals.shippingDetailCount}
          />
        </>
      }
      mainLeft={
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <TabsList>
              <TabsTrigger value="manufacturer">제조사</TabsTrigger>
              <TabsTrigger value="salesman">영업자</TabsTrigger>
              <TabsTrigger value="devops">개발운영사</TabsTrigger>
              <TabsTrigger value="admin">관리자</TabsTrigger>
            </TabsList>
            <div className="relative w-full md:w-[320px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="이름 / 대표자 / 연락처 검색"
                className="h-9 pl-9"
              />
            </div>
          </div>

          <TabsContent value="manufacturer">
            <RoleSummarySection
              title="제조사"
              rate="60% / 65%"
              groups={groupsByType.manufacturer}
              displayGroups={filteredBySearch.manufacturer}
              summaryData={{
                count:
                  manufacturerSummary?.anchorCount ??
                  groupsByType.manufacturer.length,
                balance: manufacturerSummary?.periodBalanceAmount,
                freeRequest: manufacturerSummary?.periodFreeRequestAmount,
                freeShipping: manufacturerSummary?.periodFreeShippingAmount,
                freeTotal: manufacturerSummary?.periodFreeAmount,
                requestDetailCount: totals.manufacturerRequestDetailCount,
                shippingDetailCount: totals.manufacturerShippingDetailCount,
              }}
              cardGridClassName="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
              bottomContent={
                <MonthlyHistorySection
                  title="월단위 과거 내역 (제조사)"
                  rows={monthlyHistory.manufacturer}
                  isLoading={historyLoading}
                />
              }
              extraCard={
                <Card className="min-h-[116px]">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground break-keep">
                      배송비 합계액
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <div className="text-lg sm:text-xl md:text-2xl font-bold tabular-nums">
                      {formatMoney(totals.manufacturerShippingAmount)}원
                    </div>
                    <div className="space-y-0.5 text-xs text-muted-foreground tabular-nums leading-tight">
                      <div>
                        유료 배송비 {formatMoney(totals.manufacturerPaidShippingAmount)}원 ({totals.manufacturerPaidShippingCount.toLocaleString()})
                      </div>
                      <div>
                        무료 배송비 {formatMoney(manufacturerSummary?.periodFreeShippingAmount || 0)}원 ({totals.manufacturerShippingDetailCount.toLocaleString()})
                      </div>
                    </div>
                  </CardContent>
                </Card>
              }
            />
          </TabsContent>

          <TabsContent value="salesman">
            <RoleSummarySection
              title="영업자"
              rate="10%"
              groups={groupsByType.salesman}
              displayGroups={filteredBySearch.salesman}
              summaryData={{
                count: totals.salesmanCount,
                balance: totals.salesmanPaid,
                freeRequest: totals.salesmanFreeRequest,
                freeShipping: totals.salesmanFreeShipping,
                freeTotal: totals.salesmanFreeRequest + totals.salesmanFreeShipping,
                requestDetailCount: totals.salesmanRequestDetailCount,
                shippingDetailCount: totals.salesmanShippingDetailCount,
              }}
              bottomContent={
                <MonthlyHistorySection
                  title="월단위 과거 내역 (영업자)"
                  rows={monthlyHistory.salesman}
                  isLoading={historyLoading}
                />
              }
            />
          </TabsContent>

          <TabsContent value="devops">
            <RoleSummarySection
              title="개발운영사"
              rate="10%"
              groups={groupsByType.devops}
              displayGroups={filteredBySearch.devops}
              summaryData={{
                count: totals.devopsCount,
                balance: totals.devopsPaid,
                freeRequest: totals.devopsFreeRequest,
                freeShipping: totals.devopsFreeShipping,
                freeTotal: totals.devopsFreeRequest + totals.devopsFreeShipping,
                requestDetailCount: totals.devopsRequestDetailCount,
                shippingDetailCount: totals.devopsShippingDetailCount,
              }}
              bottomContent={
                <MonthlyHistorySection
                  title="월단위 과거 내역 (개발운영사)"
                  rows={monthlyHistory.devops}
                  isLoading={historyLoading}
                />
              }
            />
          </TabsContent>

          <TabsContent value="admin">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard
                  title="관리자 배분율"
                  value="20% / 25%"
                  description="유료의뢰비 기준 (영업자 미연결 시 25%)"
                />
                <SummaryCard
                  title="기간 정산 완료"
                  value={`${formatMoney(
                    adminFinanceRows.reduce(
                      (sum, row) =>
                        sum + Number(row.wallet?.paidOutAmountPeriod || 0),
                      0,
                    ),
                  )}원`}
                  description="AdminCreditLedger PAYOUT 합계"
                />
                <SummaryCard
                  title="유료 미정산액 합계"
                  value={`${formatMoney(
                    adminFinanceRows.reduce(
                      (sum, row) =>
                        sum + Number(row.wallet?.balanceAmountPeriod || 0),
                      0,
                    ),
                  )}원`}
                  description="누적 미지급 잔액"
                />
                <SummaryBreakdownCard
                  title="무료 미정산액 합계"
                  totalValue={`${formatMoney(
                    adminFinanceRows.reduce(
                      (sum, row) =>
                        sum + Number(row.wallet?.freeAmountPeriod || 0),
                      0,
                    ),
                  )}원`}
                  requestValue={`${formatMoney(
                    adminFinanceRows.reduce(
                      (sum, row) =>
                        sum + Number(row.wallet?.freeRequestAmountPeriod || 0),
                      0,
                    ),
                  )}원`}
                  shippingValue={`${formatMoney(
                    adminFinanceRows.reduce(
                      (sum, row) =>
                        sum + Number(row.wallet?.freeShippingAmountPeriod || 0),
                      0,
                    ),
                  )}원`}
                  requestCount={totals.adminRequestDetailCount}
                  shippingCount={totals.adminShippingDetailCount}
                />
              </div>

              <MonthlyHistorySection
                title="월단위 과거 내역 (관리자)"
                rows={monthlyHistory.admin}
                isLoading={historyLoading}
              />
            </div>
          </TabsContent>
        </Tabs>
      }
      mainRight={null}
    />
  );
}

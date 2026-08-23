// change-log:
// - 2026-08-20: 제조사 지급은 유료/무료 구분 없이 약정 단가 전액(말일 일괄, 미정산 적립).
// - 2026-08-19: 치과 월 구독료 사업 축 제거(멤버십 폐지).
// - 2026-08-18: 제조사는 기공소(면세) — 과세 대상에서 제외.
// - 2026-08-17: 기간 필터 + 영업자·개발운영사 과세(세금계산서) / 제조사·어벗츠·고객 경로 면세(계산서).
// - 2026-08-16: 어벗츠 4사업 축 API 와이어링 + 선택형 상세·모던 UI 리팩터.
// related files:
// - web/frontend/rules.md
// - web/backend/controllers/admin/adminCredit.controller.js
// - web/frontend/src/pages/admin/credits/creditPageUi.tsx
// - web/frontend/src/shared/ui/dashboard/DashboardShell.tsx
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  Factory,
  HandCoins,
  Percent,
  Search,
} from "lucide-react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { usePeriodStore, periodToRangeQuery } from "@/store/usePeriodStore";
import { useToast } from "@/shared/hooks/use-toast";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppEventDebouncedReload } from "@/shared/realtime/useAppEventDebouncedReload";
import { cn } from "@/shared/ui/cn";
import {
  CreditPanel,
  CreditSectionHeader,
  CreditStatTile,
} from "@/pages/admin/credits/creditPageUi";
import {
  SETTLEMENT_EXEMPT_INVOICE_LABEL,
  SETTLEMENT_TAXABLE_INVOICE_LABEL,
  splitAffiliateVat,
  vatPctLabel,
} from "@/shared/settlement/affiliateVat";

const HISTORY_MONTHS = 6;

type BusinessAxisId = "customAbut" | "autoMatchFee" | "internalLab";

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
  periodRequestSupply?: number;
  periodRequestVat?: number;
  periodShippingSupply?: number;
  periodShippingVat?: number;
  manufacturerRequestUnitPrice?: number;
  manufacturerShippingUnitPrice?: number;
  affiliateVatRate?: number;
};

type SettlementBusinessOverview = {
  customAbut?: {
    periodPaidSpend?: number;
    periodPaidSpendRequest?: number;
    periodPaidSpendShipping?: number;
    periodPaidSpendRequestCount?: number;
    periodPaidSpendShippingCount?: number;
    manufacturerEarn?: number;
    manufacturerPaidEarn?: number;
    manufacturerPaidRequest?: number;
    manufacturerPaidShipping?: number;
    manufacturerRequestUnitPrice?: number;
    manufacturerShippingUnitPrice?: number;
    affiliateVatRate?: number;
  };
  autoMatchFee?: {
    periodFeeAmount?: number;
    periodReleaseCount?: number;
    platformFeeRate?: number;
  };
  internalLab?: {
    periodSettlementEarn?: number;
    periodLineCount?: number;
    anchorCount?: number;
  };
  practiceMembership?: {
    periodFeeAmount?: number;
    periodChargeCount?: number;
    activeMemberCount?: number;
    monthlyFee?: number;
  };
};

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
    earnedAmountPeriod?: number;
    paidOutAmountPeriod?: number;
    balanceAmountPeriod?: number;
    freeRequestAmountPeriod?: number;
    freeRequestCountPeriod?: number;
    freeShippingAmountPeriod?: number;
    freeShippingCountPeriod?: number;
    freeAmountPeriod?: number;
  };
};

const formatMoney = (value?: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("ko-KR")
    : "0";

const formatWon = (value?: number) => `${formatMoney(value)}원`;

function BusinessAxisCard({
  index,
  title,
  value,
  hints,
  icon: Icon,
  selected,
  onSelect,
  loading,
}: {
  index: number;
  title: string;
  value: string;
  hints: ReactNode;
  icon: LucideIcon;
  selected: boolean;
  onSelect: () => void;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group min-h-[132px] rounded-2xl border bg-white p-4 text-left shadow-sm transition-all",
        selected
          ? "border-slate-900 ring-2 ring-slate-900/10"
          : "border-slate-200/80 hover:border-slate-300 hover:shadow-md",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl ring-1",
              selected
                ? "bg-slate-900 text-white ring-slate-900"
                : "bg-slate-50 text-slate-600 ring-slate-200",
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              {index}. 사업
            </div>
            <div className="text-sm font-semibold tracking-tight text-slate-900 break-keep">
              {title}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3 text-2xl font-bold tabular-nums tracking-tight text-slate-900">
        {loading ? "—" : value}
      </div>
      <div className="mt-1.5 space-y-0.5 text-xs leading-relaxed text-muted-foreground">
        {hints}
      </div>
    </button>
  );
}

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
    <CreditPanel>
      <div className="border-b border-slate-100 px-4 py-3">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
      </div>
      <div className="min-w-0 p-4">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">
            월별 내역을 불러오는 중입니다.
          </div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            표시할 월별 내역이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500">
                  <th className="pb-2 font-medium">월</th>
                  <th className="pb-2 font-medium">유료</th>
                  <th className="pb-2 font-medium">무료 의뢰</th>
                  <th className="pb-2 font-medium">무료 배송</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.label}
                    className="border-b border-slate-50 last:border-0"
                  >
                    <td className="py-2.5 font-medium tabular-nums text-slate-900">
                      {row.label}
                    </td>
                    <td className="py-2.5 tabular-nums">
                      {formatWon(row.paidAmount)}
                    </td>
                    <td className="py-2.5 tabular-nums text-muted-foreground">
                      {formatWon(row.freeRequestAmount)} (
                      {row.freeRequestCount.toLocaleString()})
                    </td>
                    <td className="py-2.5 tabular-nums text-muted-foreground">
                      {formatWon(row.freeShippingAmount)} (
                      {row.freeShippingCount.toLocaleString()})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </CreditPanel>
  );
}

function AffiliateGroupCard({ group }: { group: AnchorGroup }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <div className="text-sm font-semibold text-slate-900">{group.name}</div>
      <div className="mt-3 space-y-1.5 text-sm">
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">대표자</span>
          <span>{group.representativeName || "-"}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">활성 멤버</span>
          <span>
            {group.activeMemberCount}/{group.memberCount}명
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">기간 수수료</span>
          <span className="tabular-nums">{formatWon(group.commissionAmount)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">미정산 잔액</span>
          <span className="font-semibold tabular-nums text-slate-900">
            {formatWon(group.balanceAmount)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function AdminPaymentsPage() {
  const { token, user } = useAuthStore();
  const { period, setPeriod, customStartDate, customEndDate } = usePeriodStore();
  const { toast } = useToast();
  const [rows, setRows] = useState<SalesmanRow[]>([]);
  const [manufacturerSummary, setManufacturerSummary] =
    useState<ManufacturerSummary | null>(null);
  const [businessOverview, setBusinessOverview] =
    useState<SettlementBusinessOverview | null>(null);
  const [adminRows, setAdminRows] = useState<AdminCreditRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAxis, setSelectedAxis] =
    useState<BusinessAxisId>("customAbut");
  const [affiliateTab, setAffiliateTab] = useState("salesman");
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
        const [rowsRes, mfgRes, adminRes, overviewRes] = await Promise.all([
          request<{
            success?: boolean;
            data?: { items?: SalesmanRow[] };
          }>({
            path: `/api/admin/credits/salesmen?limit=200&skip=0${rangeQuery}`,
            method: "GET",
            token,
          }),
          request<{
            success?: boolean;
            data?: ManufacturerSummary;
          }>({
            path: `/api/admin/credits/manufacturer/summary?period=${encodeURIComponent(period)}${rangeQuery}`,
            method: "GET",
            token,
          }),
          request<{
            success?: boolean;
            data?: { items?: AdminCreditRow[] };
          }>({
            path: `/api/admin/credits/admins?limit=200&skip=0${rangeQuery}`,
            method: "GET",
            token,
          }),
          request<{
            success?: boolean;
            data?: SettlementBusinessOverview;
          }>({
            path: `/api/admin/credits/settlement-business-overview?period=${encodeURIComponent(period)}${rangeQuery}`,
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
        if (overviewRes.ok && overviewRes.data?.success) {
          setBusinessOverview(overviewRes.data.data || null);
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
        const historyRows = await Promise.all(
          monthRanges.map(async (month) => {
            const [salesmenRes, adminsRes, manufacturerRes] = await Promise.all([
              request<{ success?: boolean; data?: { items?: SalesmanRow[] } }>({
                path: `/api/admin/credits/salesmen?limit=500&skip=0&startDate=${encodeURIComponent(month.startDate)}&endDate=${encodeURIComponent(month.endDate)}`,
                method: "GET",
                token,
              }),
              request<{
                success?: boolean;
                data?: { items?: AdminCreditRow[] };
              }>({
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

            const manufacturer =
              manufacturerRes.ok && manufacturerRes.data?.success
                ? manufacturerRes.data.data
                : null;

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
                (sum, r) =>
                  sum + Number(r.wallet?.freeRequestAmountPeriod || 0),
                0,
              );
              const freeRequestCount = roleFinanceRows.reduce(
                (sum, r) => sum + Number(r.wallet?.freeRequestCountPeriod || 0),
                0,
              );
              const freeShippingAmount = roleFinanceRows.reduce(
                (sum, r) =>
                  sum + Number(r.wallet?.freeShippingAmountPeriod || 0),
                0,
              );
              const freeShippingCount = roleFinanceRows.reduce(
                (sum, r) =>
                  sum + Number(r.wallet?.freeShippingCountPeriod || 0),
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

            const adminFinanceMap = new Map<string, AdminCreditRow>();
            for (const row of adminItems) {
              const key = String(
                row.businessAnchorId || row.adminUserId || "",
              ).trim();
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
                freeRequestAmount: Number(
                  manufacturer?.periodFreeRequestAmount || 0,
                ),
                freeRequestCount: Number(
                  manufacturer?.periodFreeRequestCount || 0,
                ),
                freeShippingAmount: Number(
                  manufacturer?.periodFreeShippingAmount || 0,
                ),
                freeShippingCount: Number(
                  manufacturer?.periodFreeShippingCount || 0,
                ),
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
                freeTotalAmount:
                  adminFreeRequestAmount + adminFreeShippingAmount,
              } satisfies MonthlyHistoryRow,
            };
          }),
        );

        if (!mounted) return;
        setMonthlyHistory({
          manufacturer: historyRows.map((r) => r.manufacturer),
          salesman: historyRows.map((r) => r.salesman),
          devops: historyRows.map((r) => r.devops),
          admin: historyRows.map((r) => r.admin),
        });
      } catch {
        if (!mounted) return;
        setMonthlyHistory({
          manufacturer: [],
          salesman: [],
          devops: [],
          admin: [],
        });
      } finally {
        if (mounted) setHistoryLoading(false);
      }
    };

    void loadMonthlyHistory();
    return () => {
      mounted = false;
    };
  }, [token]);

  const anchorGroups = useMemo((): AnchorGroup[] => {
    const rowsByAnchor = new Map<string, SalesmanRow[]>();
    for (const row of rows) {
      const anchorId = String(row.businessAnchorId || "").trim();
      const businessType = String(row.businessAnchor?.businessType || "").trim();
      if (!anchorId || !businessType) continue;
      const bucket = rowsByAnchor.get(anchorId) || [];
      bucket.push(row);
      rowsByAnchor.set(anchorId, bucket);
    }

    const groups: AnchorGroup[] = [];
    for (const [anchorId, groupedRows] of rowsByAnchor.entries()) {
      if (!groupedRows.length) continue;
      const first = groupedRows[0];
      const businessType = String(first.businessAnchor?.businessType || "").trim();
      if (!businessType) continue;

      groups.push({
        businessAnchorId: anchorId,
        businessType,
        name: first.businessAnchor?.name?.trim() || first.name?.trim() || "-",
        representativeName: first.businessAnchor?.representativeName?.trim(),
        email: first.businessAnchor?.email?.trim() || first.email?.trim(),
        phoneNumber: first.businessAnchor?.phoneNumber?.trim(),
        memberCount: groupedRows.length,
        activeMemberCount: groupedRows.filter((r) => Boolean(r.active)).length,
        balanceAmount: Number(first.wallet?.balanceAmountPeriod || 0),
        freeRequestAmount: Number(first.wallet?.freeRequestAmountPeriod || 0),
        freeShippingAmount: Number(first.wallet?.freeShippingAmountPeriod || 0),
        freeAmount: Number(first.wallet?.freeAmountPeriod || 0),
        revenueAmount: Number(first.performance30d?.revenueAmount || 0),
        commissionAmount: Number(first.performance30d?.commissionAmount || 0),
        introducedCount: Number(first.performance30d?.introducedCount || 0),
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
    const matchGroup = (group: AnchorGroup) => {
      if (!q) return true;
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
      salesman: groupsByType.salesman.filter(matchGroup),
      devops: groupsByType.devops.filter(matchGroup),
    };
  }, [groupsByType, searchQuery]);

  const customAbut = businessOverview?.customAbut;
  const autoMatch = businessOverview?.autoMatchFee;
  const internalLab = businessOverview?.internalLab;

  const feeRatePct = Math.round(Number(autoMatch?.platformFeeRate ?? 0.1) * 100);
  const salesmanUnpaidSupply = roleFinanceRows.salesman.reduce(
    (sum, r) => sum + Number(r.wallet?.balanceAmountPeriod || 0),
    0,
  );
  const salesmanUnpaidVat = splitAffiliateVat(salesmanUnpaidSupply);
  const devopsUnpaidSupply = roleFinanceRows.devops.reduce(
    (sum, r) => sum + Number(r.wallet?.balanceAmountPeriod || 0),
    0,
  );
  const devopsUnpaidVat = splitAffiliateVat(devopsUnpaidSupply);

  if (!user || user.role !== "admin") return null;

  return (
    <DashboardShell
      title="정산"
      subtitle="어벗츠 3사업 · 기간 집계"
      headerRight={
        <PeriodFilter value={period} onChange={setPeriod} />
      }
      statsGridClassName="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
      stats={
        <>
          <BusinessAxisCard
            index={1}
            title="커스텀 어벗 생산·공급"
            icon={Factory}
            selected={selectedAxis === "customAbut"}
            onSelect={() => setSelectedAxis("customAbut")}
            loading={isLoading}
            value={formatWon(customAbut?.periodPaidSpend)}
            hints={
              <>
                <div>기공소 디자인 → 애크로덴트 → 치과 납품</div>
                <div className="tabular-nums">
                  하청 {formatWon(customAbut?.manufacturerEarn ?? customAbut?.manufacturerPaidEarn)} · 미정산{" "}
                  {formatWon(manufacturerSummary?.periodBalanceAmount)}
                </div>
              </>
            }
          />
          <BusinessAxisCard
            index={2}
            title="자동매칭 수수료"
            icon={Percent}
            selected={selectedAxis === "autoMatchFee"}
            onSelect={() => setSelectedAxis("autoMatchFee")}
            loading={isLoading}
            value={formatWon(autoMatch?.periodFeeAmount)}
            hints={
              <>
                <div>
                  기공비의 platformFeeRate {feeRatePct}%
                </div>
                <div className="tabular-nums">
                  기간 해제 {(autoMatch?.periodReleaseCount || 0).toLocaleString()}
                  건
                </div>
              </>
            }
          />
          <BusinessAxisCard
            index={3}
            title="기공소 직접 운영"
            icon={Building2}
            selected={selectedAxis === "internalLab"}
            onSelect={() => setSelectedAxis("internalLab")}
            loading={isLoading}
            value={formatWon(internalLab?.periodSettlementEarn)}
            hints={
              <>
                <div>어벗츠기공소 기공료 수취</div>
                <div className="tabular-nums">
                  앵커 {(internalLab?.anchorCount || 0).toLocaleString()} · 적립{" "}
                  {(internalLab?.periodLineCount || 0).toLocaleString()}건
                </div>
              </>
            }
          />
        </>
      }
      mainLeft={
        <div className="space-y-4">
          {selectedAxis === "customAbut" ? (
            <CreditPanel>
              <div className="space-y-4 p-4">
                <CreditSectionHeader
                  icon={Factory}
                  title="커스텀 어벗 · 제조사 하청"
                  description="원청(어벗츠)–하청(애크로덴트) 고정단가. 고객 유료·무료 크레딧과 무관하게 모든 의뢰에 약정 단가를 지급하며, 말일 일괄 지급 전까지 미정산으로 적립(면세 · 계산서)."
                />
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <CreditStatTile
                    label="유료 매출(의뢰자)"
                    value={formatWon(customAbut?.periodPaidSpend)}
                    tone="accent"
                    hint={
                      <>
                        <div>
                          의뢰 {formatWon(customAbut?.periodPaidSpendRequest)} (
                          {(
                            customAbut?.periodPaidSpendRequestCount || 0
                          ).toLocaleString()}
                          )
                        </div>
                        <div>
                          배송 {formatWon(customAbut?.periodPaidSpendShipping)} (
                          {(
                            customAbut?.periodPaidSpendShippingCount || 0
                          ).toLocaleString()}
                          )
                        </div>
                      </>
                    }
                  />
                  <CreditStatTile
                    label="하청 단가"
                    value={`${formatMoney(
                      customAbut?.manufacturerRequestUnitPrice ??
                        manufacturerSummary?.manufacturerRequestUnitPrice ??
                        9000,
                    )} / ${formatMoney(
                      customAbut?.manufacturerShippingUnitPrice ??
                        manufacturerSummary?.manufacturerShippingUnitPrice ??
                        3500,
                    )}`}
                    hint="면세 · 어벗 1개 / 박스당"
                  />
                  <CreditStatTile
                    label="하청 미정산"
                    value={formatWon(manufacturerSummary?.periodBalanceAmount)}
                    hint={`사업자 ${Number(
                      manufacturerSummary?.anchorCount || 0,
                    ).toLocaleString()}곳 · 말일 일괄`}
                  />
                  <CreditStatTile
                    label="하청 적립"
                    value={formatWon(
                      Number(manufacturerSummary?.periodRequestSupply || 0) +
                        Number(manufacturerSummary?.periodShippingSupply || 0),
                    )}
                    hint={
                      <>
                        <div>
                          의뢰{" "}
                          {formatWon(
                            manufacturerSummary?.periodRequestSupply,
                          )}{" "}
                          (
                          {Number(
                            manufacturerSummary?.periodPaidRequestCount || 0,
                          ) +
                            Number(
                              manufacturerSummary?.periodFreeRequestCount || 0,
                            )}
                          )
                        </div>
                        <div>
                          배송{" "}
                          {formatWon(
                            manufacturerSummary?.periodShippingSupply,
                          )}{" "}
                          (
                          {Number(
                            manufacturerSummary?.periodPaidShippingCount || 0,
                          ) +
                            Number(
                              manufacturerSummary?.periodFreeShippingCount || 0,
                            )}
                          )
                        </div>
                      </>
                    }
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <CreditStatTile
                    label="의뢰 하청(면세)"
                    value={formatWon(manufacturerSummary?.periodRequestSupply)}
                    hint={`${(
                      Number(manufacturerSummary?.periodPaidRequestCount || 0) +
                      Number(manufacturerSummary?.periodFreeRequestCount || 0)
                    ).toLocaleString()}건 · ${SETTLEMENT_EXEMPT_INVOICE_LABEL}`}
                  />
                  <CreditStatTile
                    label="배송 하청(면세)"
                    value={formatWon(manufacturerSummary?.periodShippingSupply)}
                    hint={`${(
                      Number(manufacturerSummary?.periodPaidShippingCount || 0) +
                      Number(manufacturerSummary?.periodFreeShippingCount || 0)
                    ).toLocaleString()}건 · ${SETTLEMENT_EXEMPT_INVOICE_LABEL}`}
                  />
                </div>
                <MonthlyHistorySection
                  title="월단위 과거 내역 (제조사)"
                  rows={monthlyHistory.manufacturer}
                  isLoading={historyLoading}
                />
              </div>
            </CreditPanel>
          ) : null}

          {selectedAxis === "autoMatchFee" ? (
            <CreditPanel>
              <div className="space-y-4 p-4">
                <CreditSectionHeader
                  icon={Percent}
                  title="자동매칭 수수료"
                  description="자동 매칭 작업완료(에스크로 해제) 시 기공비에 platformFeeRate를 적용한 어벗츠 수수료. 치과–기공소–어벗츠 경로는 면세 · 계산서."
                />
                <div className="grid gap-3 sm:grid-cols-3">
                  <CreditStatTile
                    label="기간 수수료"
                    value={formatWon(autoMatch?.periodFeeAmount)}
                    tone="accent"
                  />
                  <CreditStatTile
                    label="해제 건수"
                    value={`${Number(
                      autoMatch?.periodReleaseCount || 0,
                    ).toLocaleString()}건`}
                  />
                  <CreditStatTile
                    label="적용 요율"
                    value={`${feeRatePct}%`}
                    hint="지정 거래는 directPlatformFeeEnabled + directPlatformFeeRate"
                  />
                </div>
              </div>
            </CreditPanel>
          ) : null}

          {selectedAxis === "internalLab" ? (
            <CreditPanel>
              <div className="space-y-4 p-4">
                <CreditSectionHeader
                  icon={Building2}
                  title="기공소 직접 운영"
                  description="어벗츠기공소(internalLab)가 치과 의뢰를 직접 처리하고 수취한 기공정산크레딧. 면세 · 계산서."
                />
                <div className="grid gap-3 sm:grid-cols-3">
                  <CreditStatTile
                    label="기간 기공료 수취"
                    value={formatWon(internalLab?.periodSettlementEarn)}
                    tone="accent"
                  />
                  <CreditStatTile
                    label="적립 건수"
                    value={`${Number(
                      internalLab?.periodLineCount || 0,
                    ).toLocaleString()}건`}
                  />
                  <CreditStatTile
                    label="기공소 앵커"
                    value={`${Number(
                      internalLab?.anchorCount || 0,
                    ).toLocaleString()}곳`}
                  />
                </div>
              </div>
            </CreditPanel>
          ) : null}

          <CreditPanel>
            <div className="space-y-4 p-4">
              <CreditSectionHeader
                icon={HandCoins}
                title="관계사 잔여 분배"
                description="커스텀 어벗 잔여·매칭 수수료 재분배. 딜러사·개발운영사 지급은 과세(세금계산서), 제조사·어벗츠는 면세(계산서)."
                trailing={
                  <div className="relative w-full sm:w-[260px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="이름 / 대표자 / 연락처"
                      className="h-9 rounded-xl pl-9"
                    />
                  </div>
                }
              />

              <Tabs value={affiliateTab} onValueChange={setAffiliateTab}>
                <TabsList className="h-11 rounded-xl bg-slate-100/80 p-1">
                  <TabsTrigger value="salesman" className="rounded-lg px-4">
                    딜러사
                  </TabsTrigger>
                  <TabsTrigger value="devops" className="rounded-lg px-4">
                    개발운영사
                  </TabsTrigger>
                  <TabsTrigger value="admin" className="rounded-lg px-4">
                    어벗츠
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="salesman" className="mt-4 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <CreditStatTile
                      label="사업자 수"
                      value={`${filteredBySearch.salesman.length.toLocaleString()}곳`}
                    />
                    <CreditStatTile
                      label="유료 미정산 공급가"
                      value={formatWon(salesmanUnpaidSupply)}
                      tone="accent"
                      hint={`지급 시 +부가세 ${vatPctLabel()} → ${formatWon(salesmanUnpaidVat.total)} · ${SETTLEMENT_TAXABLE_INVOICE_LABEL}`}
                    />
                    <CreditStatTile
                      label="무료(참고)"
                      value={formatWon(
                        roleFinanceRows.salesman.reduce(
                          (sum, r) =>
                            sum + Number(r.wallet?.freeAmountPeriod || 0),
                          0,
                        ),
                      )}
                    />
                  </div>
                  {filteredBySearch.salesman.length > 0 ? (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {filteredBySearch.salesman.map((group) => (
                        <AffiliateGroupCard
                          key={group.businessAnchorId}
                          group={group}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-muted-foreground">
                      표시할 딜러사가 없습니다.
                    </div>
                  )}
                  <MonthlyHistorySection
                    title="월단위 과거 내역 (딜러사)"
                    rows={monthlyHistory.salesman}
                    isLoading={historyLoading}
                  />
                </TabsContent>

                <TabsContent value="devops" className="mt-4 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <CreditStatTile
                      label="사업자 수"
                      value={`${filteredBySearch.devops.length.toLocaleString()}곳`}
                    />
                    <CreditStatTile
                      label="유료 미정산 공급가"
                      value={formatWon(devopsUnpaidSupply)}
                      tone="accent"
                      hint={`지급 시 +부가세 ${vatPctLabel()} → ${formatWon(devopsUnpaidVat.total)} · ${SETTLEMENT_TAXABLE_INVOICE_LABEL}`}
                    />
                    <CreditStatTile
                      label="무료(참고)"
                      value={formatWon(
                        roleFinanceRows.devops.reduce(
                          (sum, r) =>
                            sum + Number(r.wallet?.freeAmountPeriod || 0),
                          0,
                        ),
                      )}
                    />
                  </div>
                  {filteredBySearch.devops.length > 0 ? (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {filteredBySearch.devops.map((group) => (
                        <AffiliateGroupCard
                          key={group.businessAnchorId}
                          group={group}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-muted-foreground">
                      표시할 개발운영사가 없습니다.
                    </div>
                  )}
                  <MonthlyHistorySection
                    title="월단위 과거 내역 (개발운영사)"
                    rows={monthlyHistory.devops}
                    isLoading={historyLoading}
                  />
                </TabsContent>

                <TabsContent value="admin" className="mt-4 space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <CreditStatTile
                      label="기간 정산 완료"
                      value={formatWon(
                        adminFinanceRows.reduce(
                          (sum, row) =>
                            sum + Number(row.wallet?.paidOutAmountPeriod || 0),
                          0,
                        ),
                      )}
                    />
                    <CreditStatTile
                      label="유료 미정산"
                      value={formatWon(
                        adminFinanceRows.reduce(
                          (sum, row) =>
                            sum + Number(row.wallet?.balanceAmountPeriod || 0),
                          0,
                        ),
                      )}
                      tone="accent"
                      hint={`면세 · ${SETTLEMENT_EXEMPT_INVOICE_LABEL}`}
                    />
                    <CreditStatTile
                      label="무료(참고)"
                      value={formatWon(
                        adminFinanceRows.reduce(
                          (sum, row) =>
                            sum + Number(row.wallet?.freeAmountPeriod || 0),
                          0,
                        ),
                      )}
                    />
                  </div>
                  <MonthlyHistorySection
                    title="월단위 과거 내역 (어벗츠)"
                    rows={monthlyHistory.admin}
                    isLoading={historyLoading}
                  />
                </TabsContent>
              </Tabs>
            </div>
          </CreditPanel>
        </div>
      }
      mainRight={null}
    />
  );
}

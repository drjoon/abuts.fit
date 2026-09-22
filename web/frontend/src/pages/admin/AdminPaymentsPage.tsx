// change-log:
// - 2026-09-23: 제조사 월별=의뢰·배송 합산(마이그레이션 PAID fallback 오인 방지).
// - 2026-09-23: 월별 내역에 유료 배송 열(제조사 periodPaidShipping*).
// - 2026-09-23: SettlementStatCard·정산규칙 모달·분배비율(설정) 반영. 매출−지출=분배 UX.
// - 2026-09-23: 3사업 축을 스토어·커스텀어벗·기공사업부로 재편(매출·지출·분배).
// - 2026-09-20: 사업 축 요약 카드 여백 — DashboardShell stats p-0.5(선택 ring 클리핑 방지).
// - 2026-09-01: fillHeight 작업영역 — workspace-nested-scroll로 카드 오른쪽 끝 수직 스크롤.
// - 2026-08-20: 제조사 지급은 유료/무료 구분 없이 약정 단가 전액(말일 일괄, 미정산 적립).
// - 2026-08-19: 치과 월 구독료 사업 축 제거(멤버십 폐지).
// - 2026-08-23: 제조사=일반과세 — 과세 대상(세금계산서).
// - 2026-08-18: (철회) 제조사 면세.
// - 2026-08-17: 기간 필터 + 영업자·개발운영사 과세(세금계산서) / 기공소·어벗츠·고객 경로 면세(계산서).
// - 2026-08-16: 어벗츠 4사업 축 API 와이어링 + 선택형 상세·모던 UI 리팩터.
// related files:
// - web/frontend/rules.md
// - web/backend/controllers/admin/adminCredit.controller.js
// - web/frontend/src/shared/settlement/settlementUi.tsx
// - web/frontend/src/pages/admin/credits/creditPageUi.tsx
// - web/frontend/src/shared/ui/dashboard/DashboardShell.tsx
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Factory, FlaskConical, HandCoins, Search, Store } from "lucide-react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { usePeriodStore, periodToRangeQuery } from "@/store/usePeriodStore";
import { useToast } from "@/shared/hooks/use-toast";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import {
  isSettlementPeriodValue,
  SETTLEMENT_DEFAULT_PERIOD,
  SETTLEMENT_PERIOD_PRESETS,
} from "@/shared/ui/periodFilterValues";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppEventDebouncedReload } from "@/shared/realtime/useAppEventDebouncedReload";
import {
  CreditPanel,
  CreditSectionHeader,
  CreditStatTile,
} from "@/pages/admin/credits/creditPageUi";
import {
  SETTLEMENT_EXEMPT_INVOICE_LABEL,
  SETTLEMENT_TAXABLE_INVOICE_LABEL,
  formatWonWithUnit,
  splitInclusiveVat,
} from "@/shared/settlement/affiliateVat";
import {
  SettlementEquationOperator,
  SettlementPolicyDialog,
  SettlementPolicySection,
  SettlementStatCard,
} from "@/shared/settlement/settlementUi";

const HISTORY_MONTHS = 6;

type BusinessAxisId = "store" | "customAbut" | "labDivision";

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
  paidRequestCount: number;
  paidShippingAmount: number;
  paidShippingCount: number;
  freeRequestAmount: number;
  freeRequestCount: number;
  freeShippingAmount: number;
  freeShippingCount: number;
  freeTotalAmount: number;
  /** 제조사: 유료/무료 합산(약정 단가 전액). */
  requestSupplyAmount?: number;
  requestCount?: number;
  shippingSupplyAmount?: number;
  shippingCount?: number;
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
  periodRequestCount?: number;
  periodShippingCount?: number;
  manufacturerRequestUnitPrice?: number;
  manufacturerShippingUnitPrice?: number;
  affiliateVatRate?: number;
};

type ShareRates = {
  store?: {
    manufacturerPercent?: number;
    salesmanPercent?: number;
    devopsPercent?: number;
    abutsPercent?: number;
  };
  customAbut?: {
    manufacturerPercent?: number;
    salesmanPercent?: number;
    devopsPercent?: number;
    abutsPercent?: number;
  };
  labDivision?: {
    bizPercent?: number;
    salesTeamPercent?: number;
    devopsPercent?: number;
    abutsPercent?: number;
  };
};

type SettlementBusinessOverview = {
  shareRates?: ShareRates;
  store?: {
    periodGrossInclusive?: number;
    periodSupply?: number;
    periodVat?: number;
    periodSaleCount?: number;
    periodRefundCount?: number;
    plannedManufacturerSupply?: number;
    plannedSalesmanSupply?: number;
    plannedDevopsSupply?: number;
    plannedAbutsSupply?: number;
  };
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
    residualSalesmanSupply?: number;
    residualDevopsSupply?: number;
    residualAdminSupply?: number;
    residualSalesmanInclusive?: number;
    residualDevopsInclusive?: number;
    residualTotalSupply?: number;
  };
  labDivision?: {
    periodSettlementEarn?: number;
    periodLineCount?: number;
    anchorCount?: number;
    subcontractPurchaseAmount?: number;
    subcontractPurchaseLineCount?: number;
    subcontractFeeAmount?: number;
    subcontractFeeReleaseCount?: number;
    subcontractFeeRate?: number;
    periodRevenue?: number;
    plannedBizSupply?: number;
    plannedSalesTeamSupply?: number;
    plannedDevopsSupply?: number;
    plannedAbutsSupply?: number;
  };
  /** @deprecated 레거시 키 — labDivision으로 대체 */
  autoMatchFee?: {
    periodFeeAmount?: number;
    periodReleaseCount?: number;
    platformFeeRate?: number;
    subcontractFeeRate?: number;
  };
  /** @deprecated 레거시 키 — labDivision으로 대체 */
  internalLab?: {
    periodSettlementEarn?: number;
    periodLineCount?: number;
    anchorCount?: number;
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

function pctLabel(value?: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—%";
  return `${Math.round(n * 10) / 10}%`;
}

function ShareRateHint({
  parts,
}: {
  parts: Array<{ label: string; pct?: number }>;
}) {
  return (
    <div className="tabular-nums">
      {parts.map((p, i) => (
        <span key={p.label}>
          {i > 0 ? " · " : null}
          {p.label} {pctLabel(p.pct)}
        </span>
      ))}
    </div>
  );
}

function EquationRow({
  revenue,
  expense,
  distribution,
}: {
  revenue: ReactNode;
  expense: ReactNode;
  distribution: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
      <div className="min-w-0 flex-1">{revenue}</div>
      <SettlementEquationOperator symbol="−" className="hidden sm:flex" />
      <div className="min-w-0 flex-1">{expense}</div>
      <SettlementEquationOperator symbol="=" className="hidden sm:flex" />
      <div className="min-w-0 flex-1">{distribution}</div>
    </div>
  );
}

function MonthlyHistorySection({
  title,
  rows,
  isLoading,
  variant = "affiliate",
}: {
  title: string;
  rows: MonthlyHistoryRow[];
  isLoading: boolean;
  /** manufacturer: 의뢰·배송 합산(유료/무료 구분 없음). */
  variant?: "manufacturer" | "affiliate";
}) {
  const isManufacturer = variant === "manufacturer";
  return (
    <CreditPanel>
      <div className="border-b border-slate-100 px-4 py-3">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        {isManufacturer ? (
          <div className="mt-0.5 text-xs text-muted-foreground">
            약정 단가 전액 · 유료/무료 구분 없음
          </div>
        ) : null}
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
        ) : isManufacturer ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500">
                  <th className="pb-2 font-medium">월</th>
                  <th className="pb-2 font-medium">의뢰</th>
                  <th className="pb-2 font-medium">배송</th>
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
                      {formatWonWithUnit(row.requestSupplyAmount)} (
                      {Number(row.requestCount || 0).toLocaleString()})
                    </td>
                    <td className="py-2.5 tabular-nums">
                      {formatWonWithUnit(row.shippingSupplyAmount)} (
                      {Number(row.shippingCount || 0).toLocaleString()})
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-500">
                  <th className="pb-2 font-medium">월</th>
                  <th className="pb-2 font-medium">유료 의뢰</th>
                  <th className="pb-2 font-medium">유료 배송</th>
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
                      {formatWonWithUnit(row.paidAmount)} (
                      {row.paidRequestCount.toLocaleString()})
                    </td>
                    <td className="py-2.5 tabular-nums">
                      {formatWonWithUnit(row.paidShippingAmount)} (
                      {row.paidShippingCount.toLocaleString()})
                    </td>
                    <td className="py-2.5 tabular-nums text-muted-foreground">
                      {formatWonWithUnit(row.freeRequestAmount)} (
                      {row.freeRequestCount.toLocaleString()})
                    </td>
                    <td className="py-2.5 tabular-nums text-muted-foreground">
                      {formatWonWithUnit(row.freeShippingAmount)} (
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
          <span className="tabular-nums">
            {formatWonWithUnit(group.commissionAmount)}
          </span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">미정산 잔액</span>
          <span className="font-semibold tabular-nums text-slate-900">
            {formatWonWithUnit(group.balanceAmount)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function AdminPaymentsPage({
  embedded = false,
}: {
  embedded?: boolean;
} = {}) {
  const { token, user } = useAuthStore();
  const { period, setPeriod, customStartDate, customEndDate } = usePeriodStore();
  const { toast } = useToast();

  useEffect(() => {
    if (!isSettlementPeriodValue(period)) {
      setPeriod(SETTLEMENT_DEFAULT_PERIOD);
    }
  }, [period, setPeriod]);

  const settlementPeriod = isSettlementPeriodValue(period)
    ? period
    : SETTLEMENT_DEFAULT_PERIOD;
  const [rows, setRows] = useState<SalesmanRow[]>([]);
  const [manufacturerSummary, setManufacturerSummary] =
    useState<ManufacturerSummary | null>(null);
  const [businessOverview, setBusinessOverview] =
    useState<SettlementBusinessOverview | null>(null);
  const [adminRows, setAdminRows] = useState<AdminCreditRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedAxis, setSelectedAxis] = useState<BusinessAxisId>("store");
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

      const rangeQuery = periodToRangeQuery(settlementPeriod, {
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
            path: `/api/admin/credits/manufacturer/summary?period=${encodeURIComponent(settlementPeriod)}${rangeQuery}`,
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
            path: `/api/admin/credits/settlement-business-overview?period=${encodeURIComponent(settlementPeriod)}${rangeQuery}`,
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
    [customEndDate, customStartDate, settlementPeriod, toast, token],
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
                paidRequestCount: 0,
                paidShippingAmount: 0,
                paidShippingCount: 0,
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
                paidAmount: Number(manufacturer?.periodPaidRequestAmount || 0),
                paidRequestCount: Number(
                  manufacturer?.periodPaidRequestCount || 0,
                ),
                paidShippingAmount: Number(
                  manufacturer?.periodPaidShippingAmount || 0,
                ),
                paidShippingCount: Number(
                  manufacturer?.periodPaidShippingCount || 0,
                ),
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
                requestSupplyAmount: Number(
                  manufacturer?.periodRequestSupply || 0,
                ),
                requestCount: Number(
                  manufacturer?.periodRequestCount ||
                    Number(manufacturer?.periodPaidRequestCount || 0) +
                      Number(manufacturer?.periodFreeRequestCount || 0),
                ),
                shippingSupplyAmount: Number(
                  manufacturer?.periodShippingSupply || 0,
                ),
                shippingCount: Number(
                  manufacturer?.periodShippingCount ||
                    Number(manufacturer?.periodPaidShippingCount || 0) +
                      Number(manufacturer?.periodFreeShippingCount || 0),
                ),
              } satisfies MonthlyHistoryRow,
              salesman: buildFromSalesRows("salesman"),
              devops: buildFromSalesRows("devops"),
              admin: {
                label: month.label,
                paidAmount: adminPaidAmount,
                paidRequestCount: 0,
                paidShippingAmount: 0,
                paidShippingCount: 0,
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

  const store = businessOverview?.store;
  const customAbut = businessOverview?.customAbut;
  const shareRates = businessOverview?.shareRates;
  const labDivision = businessOverview?.labDivision ?? {
    periodSettlementEarn: businessOverview?.internalLab?.periodSettlementEarn,
    periodLineCount: businessOverview?.internalLab?.periodLineCount,
    anchorCount: businessOverview?.internalLab?.anchorCount,
    subcontractFeeAmount: businessOverview?.autoMatchFee?.periodFeeAmount,
    subcontractFeeReleaseCount:
      businessOverview?.autoMatchFee?.periodReleaseCount,
    subcontractFeeRate: businessOverview?.autoMatchFee?.subcontractFeeRate,
    periodRevenue: undefined,
  };

  const subcontractFeePct = Math.round(
    Number(labDivision?.subcontractFeeRate ?? 0.05) * 100,
  );
  const salesmanUnpaidInclusive = roleFinanceRows.salesman.reduce(
    (sum, r) => sum + Number(r.wallet?.balanceAmountPeriod || 0),
    0,
  );
  const salesmanUnpaidSplit = splitInclusiveVat(salesmanUnpaidInclusive);
  const devopsUnpaidInclusive = roleFinanceRows.devops.reduce(
    (sum, r) => sum + Number(r.wallet?.balanceAmountPeriod || 0),
    0,
  );
  const devopsUnpaidSplit = splitInclusiveVat(devopsUnpaidInclusive);

  const storeRates = shareRates?.store;
  const customRates = shareRates?.customAbut;
  const labRates = shareRates?.labDivision;

  const labRevenue =
    labDivision?.periodRevenue ??
    Number(labDivision?.periodSettlementEarn || 0) -
      Number(labDivision?.subcontractPurchaseAmount || 0);

  const manufacturerEarn = Number(
    customAbut?.manufacturerEarn ?? customAbut?.manufacturerPaidEarn ?? 0,
  );

  if (!user || user.role !== "admin") return null;

  const dash = isLoading ? "—" : undefined;

  return (
    <div
      className={
        embedded
          ? "custom-scrollbar workspace-nested-scroll h-full min-h-0 overflow-auto pt-2"
          : "custom-scrollbar workspace-nested-scroll h-full min-h-0 overflow-auto"
      }
    >
      <DashboardShell
        title="정산"
        subtitle="스토어 · 커스텀어벗 · 기공사업부"
        headerRight={
          <div className="flex w-full flex-wrap items-center gap-2">
            <PeriodFilter
              value={settlementPeriod}
              onChange={setPeriod}
              presets={SETTLEMENT_PERIOD_PRESETS}
            />
            <SettlementPolicyDialog
              title="정산 규칙"
              description="스토어 · 커스텀어벗 · 기공사업부"
            >
              <SettlementPolicySection title="스토어">
                <p>
                  기성품(심플웨이 등) 과세 매출입니다.
                  <br />
                  고객 표시는 부가세 포함가이며, 월말 합산 세금계산서입니다.
                </p>
                <p>
                  분배는 재무 › 설정 › 분배비율(스토어) 기준입니다.
                  <br />
                  판매가 대비 제조사 · 딜러 · 개발운영 · 어벗츠 비율입니다.
                </p>
              </SettlementPolicySection>
              <SettlementPolicySection title="커스텀어벗">
                <p>
                  기공소 디자인 → 애크로덴트 생산 → 치과 납품입니다.
                  <br />
                  매입가(부가세 포함)는 판매가 × 제조사 분배비율입니다.
                </p>
                <p>
                  유료·무료와 무관하게 약정 단가를 지급하고, 잔여를 딜러 ·
                  개발운영 · 어벗츠에 분배합니다.
                  <br />
                  배송비는 분배 재원에서 제외합니다.
                </p>
              </SettlementPolicySection>
              <SettlementPolicySection title="기공사업부">
                <p>
                  어벗츠기공소 기공료와 인증 기공소 하청 수수료입니다.
                  <br />
                  면세 · 계산서입니다.
                </p>
                <p>
                  배송비를 선차감한 뒤 기공사업부 · 영업팀 · 개발운영 · 어벗츠
                  비율로 분배합니다.
                  <br />
                  지정·자동매칭 플랫폼 수수료는 없습니다.
                </p>
              </SettlementPolicySection>
            </SettlementPolicyDialog>
          </div>
        }
        statsGridClassName="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
        stats={
          <>
            <SettlementStatCard
              label="1. 스토어"
              value={dash ?? Number(store?.periodGrossInclusive || 0)}
              selected={selectedAxis === "store"}
              onClick={() => setSelectedAxis("store")}
              hint="기성품 · 과세"
              hintTooltip="부가세 포함 매출. 분배는 설정 › 분배비율(스토어)."
              footer={
                <ShareRateHint
                  parts={[
                    { label: "제조", pct: storeRates?.manufacturerPercent },
                    { label: "딜러", pct: storeRates?.salesmanPercent },
                    { label: "개발", pct: storeRates?.devopsPercent },
                    { label: "어벗츠", pct: storeRates?.abutsPercent },
                  ]}
                />
              }
            />
            <SettlementStatCard
              label="2. 커스텀어벗"
              value={dash ?? Number(customAbut?.periodPaidSpend || 0)}
              selected={selectedAxis === "customAbut"}
              onClick={() => setSelectedAxis("customAbut")}
              hint="생산·공급"
              hintTooltip="의뢰자 유료 소비. 하청은 제조사 약정 단가."
              footer={
                isLoading ? null : (
                  <div className="space-y-0.5 text-[11px] leading-relaxed text-slate-500 sm:text-xs">
                    <div className="tabular-nums">
                      하청 {formatWonWithUnit(manufacturerEarn)} · 미정산{" "}
                      {formatWonWithUnit(
                        manufacturerSummary?.periodBalanceAmount,
                      )}
                    </div>
                    <ShareRateHint
                      parts={[
                        {
                          label: "제조",
                          pct: customRates?.manufacturerPercent,
                        },
                        { label: "딜러", pct: customRates?.salesmanPercent },
                        { label: "개발", pct: customRates?.devopsPercent },
                        { label: "어벗츠", pct: customRates?.abutsPercent },
                      ]}
                    />
                  </div>
                )
              }
            />
            <SettlementStatCard
              label="3. 기공사업부"
              value={dash ?? Number(labRevenue || 0)}
              selected={selectedAxis === "labDivision"}
              onClick={() => setSelectedAxis("labDivision")}
              hint="원청 기공료 · 하청 매입 · 수수료"
              hintTooltip="어벗츠기공소 원청 기공료(매출) − 하청 매입 = 분배 재원. 하청 수수료는 매입 공제분. 면세 계산서."
              footer={
                isLoading ? null : (
                  <div className="space-y-0.5 text-[11px] leading-relaxed text-slate-500 sm:text-xs">
                    <div className="tabular-nums">
                      원청{" "}
                      {formatWonWithUnit(labDivision?.periodSettlementEarn)} ·
                      매입{" "}
                      {formatWonWithUnit(
                        labDivision?.subcontractPurchaseAmount,
                      )}{" "}
                      · 수수료{" "}
                      {formatWonWithUnit(labDivision?.subcontractFeeAmount)}
                    </div>
                    <ShareRateHint
                      parts={[
                        { label: "기공", pct: labRates?.bizPercent },
                        { label: "영업", pct: labRates?.salesTeamPercent },
                        { label: "개발", pct: labRates?.devopsPercent },
                        { label: "어벗츠", pct: labRates?.abutsPercent },
                      ]}
                    />
                  </div>
                )
              }
            />
          </>
        }
        mainLeft={
          <div className="space-y-4">
            {selectedAxis === "store" ? (
              <CreditPanel>
                <div className="space-y-4 p-4">
                  <CreditSectionHeader
                    icon={Store}
                    title="스토어 · 기성품"
                    description="과세 매출 · 분배비율(판매가 대비)"
                  />
                  <EquationRow
                    revenue={
                      <SettlementStatCard
                        label="매출"
                        value={dash ?? Number(store?.periodGrossInclusive || 0)}
                        tone="primary"
                        hint={`${SETTLEMENT_TAXABLE_INVOICE_LABEL} · ${(
                          store?.periodSaleCount || 0
                        ).toLocaleString()}건`}
                        hintTooltip="부가세 포함가. 공급가·VAT는 아래 타일."
                        compact
                      />
                    }
                    expense={
                      <SettlementStatCard
                        label="지출(제조사)"
                        value={
                          dash ?? Number(store?.plannedManufacturerSupply || 0)
                        }
                        hint={`${pctLabel(storeRates?.manufacturerPercent)} · 설정 기준`}
                        hintTooltip="기간 공급가 × 스토어 제조사 분배비율(재무 › 설정 › 분배비율)."
                        compact
                      />
                    }
                    distribution={
                      <SettlementStatCard
                        label="분배"
                        value={
                          dash ??
                          Number(store?.plannedSalesmanSupply || 0) +
                            Number(store?.plannedDevopsSupply || 0) +
                            Number(store?.plannedAbutsSupply || 0)
                        }
                        hint="딜러 · 개발운영 · 어벗츠"
                        hintTooltip="판매가 대비 설정 비율. 장부 귀속은 월말 세금계산서(어벗츠)와 별도 확인."
                        compact
                      />
                    }
                  />
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <CreditStatTile
                      label="공급가"
                      value={formatWonWithUnit(store?.periodSupply)}
                      hint={`부가세 ${formatWonWithUnit(store?.periodVat)}`}
                    />
                    <CreditStatTile
                      label={`딜러 ${pctLabel(storeRates?.salesmanPercent)}`}
                      value={formatWonWithUnit(store?.plannedSalesmanSupply)}
                      hint="설정 분배(참고)"
                    />
                    <CreditStatTile
                      label={`개발운영 ${pctLabel(storeRates?.devopsPercent)}`}
                      value={formatWonWithUnit(store?.plannedDevopsSupply)}
                      hint="설정 분배(참고)"
                    />
                    <CreditStatTile
                      label={`어벗츠 ${pctLabel(storeRates?.abutsPercent)}`}
                      value={formatWonWithUnit(store?.plannedAbutsSupply)}
                      hint="설정 분배(참고)"
                    />
                  </div>
                  {(store?.periodRefundCount || 0) > 0 ? (
                    <CreditStatTile
                      label="기간 취소(REFUND)"
                      value={`${Number(
                        store?.periodRefundCount || 0,
                      ).toLocaleString()}건`}
                      hint="매출 합계에 상계 반영"
                    />
                  ) : null}
                </div>
              </CreditPanel>
            ) : null}

            {selectedAxis === "customAbut" ? (
              <CreditPanel>
                <div className="space-y-4 p-4">
                  <CreditSectionHeader
                    icon={Factory}
                    title="커스텀어벗 · 생산·공급"
                    description="고정 매입(제조사%) · 잔여 분배"
                  />
                  <EquationRow
                    revenue={
                      <SettlementStatCard
                        label="매출"
                        value={dash ?? Number(customAbut?.periodPaidSpend || 0)}
                        tone="primary"
                        hint={
                          <>
                            의뢰{" "}
                            {formatWonWithUnit(
                              customAbut?.periodPaidSpendRequest,
                            )}{" "}
                            · 배송{" "}
                            {formatWonWithUnit(
                              customAbut?.periodPaidSpendShipping,
                            )}
                          </>
                        }
                        hintTooltip="의뢰자 유료 소비(의뢰+배송). 잔여 분배는 배송 제외."
                        compact
                      />
                    }
                    expense={
                      <SettlementStatCard
                        label="지출(하청)"
                        value={dash ?? manufacturerEarn}
                        hint={`${pctLabel(
                          customRates?.manufacturerPercent,
                        )} · 미정산 ${formatWonWithUnit(
                          manufacturerSummary?.periodBalanceAmount,
                        )}`}
                        hintTooltip={`단가 ${Number(
                          customAbut?.manufacturerRequestUnitPrice ??
                            manufacturerSummary?.manufacturerRequestUnitPrice ??
                            8800,
                        ).toLocaleString()} / ${Number(
                          customAbut?.manufacturerShippingUnitPrice ??
                            manufacturerSummary?.manufacturerShippingUnitPrice ??
                            3500,
                        ).toLocaleString()} (어벗/박스) · ${SETTLEMENT_TAXABLE_INVOICE_LABEL}`}
                        compact
                      />
                    }
                    distribution={
                      <SettlementStatCard
                        label="분배(잔여)"
                        value={
                          dash ?? Number(customAbut?.residualTotalSupply || 0)
                        }
                        hint={`딜러 ${pctLabel(
                          customRates?.salesmanPercent,
                        )} · 개발 ${pctLabel(
                          customRates?.devopsPercent,
                        )} · 어벗츠 ${pctLabel(customRates?.abutsPercent)}`}
                        hintTooltip="판매가 − 매입 공급가 잔여. 장부 실적(공급가)."
                        compact
                      />
                    }
                  />
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <CreditStatTile
                      label="딜러(잔여)"
                      value={formatWonWithUnit(
                        customAbut?.residualSalesmanSupply,
                      )}
                      tone="accent"
                      hint={`${SETTLEMENT_TAXABLE_INVOICE_LABEL} · 포함 ${formatWonWithUnit(
                        customAbut?.residualSalesmanInclusive,
                      )}`}
                    />
                    <CreditStatTile
                      label="개발운영(잔여)"
                      value={formatWonWithUnit(
                        customAbut?.residualDevopsSupply,
                      )}
                      hint={`${SETTLEMENT_TAXABLE_INVOICE_LABEL} · 포함 ${formatWonWithUnit(
                        customAbut?.residualDevopsInclusive,
                      )}`}
                    />
                    <CreditStatTile
                      label="어벗츠(잔여)"
                      value={formatWonWithUnit(customAbut?.residualAdminSupply)}
                      hint={`면세 · ${SETTLEMENT_EXEMPT_INVOICE_LABEL}`}
                    />
                    <CreditStatTile
                      label="하청 적립(공급가)"
                      value={formatWonWithUnit(
                        Number(manufacturerSummary?.periodRequestSupply || 0) +
                          Number(manufacturerSummary?.periodShippingSupply || 0),
                      )}
                      hint={
                        <>
                          의뢰{" "}
                          {formatWonWithUnit(
                            manufacturerSummary?.periodRequestSupply,
                          )}{" "}
                          · 배송{" "}
                          {formatWonWithUnit(
                            manufacturerSummary?.periodShippingSupply,
                          )}
                        </>
                      }
                    />
                  </div>
                  <MonthlyHistorySection
                    title="월단위 과거 내역 (제조사)"
                    rows={monthlyHistory.manufacturer}
                    isLoading={historyLoading}
                    variant="manufacturer"
                  />
                </div>
              </CreditPanel>
            ) : null}

            {selectedAxis === "labDivision" ? (
              <CreditPanel>
                <div className="space-y-4 p-4">
                  <CreditSectionHeader
                    icon={FlaskConical}
                    title="기공사업부"
                    description="기공료 · 하청 수수료 · 분배비율"
                  />
                  <EquationRow
                    revenue={
                      <SettlementStatCard
                        label="매출"
                        value={dash ?? Number(labRevenue || 0)}
                        tone="primary"
                        hint={`기공료 ${formatWonWithUnit(
                          labDivision?.periodSettlementEarn,
                        )} · 하청 ${formatWonWithUnit(
                          labDivision?.subcontractFeeAmount,
                        )}`}
                        hintTooltip={`${SETTLEMENT_EXEMPT_INVOICE_LABEL} · 하청 요율 ${subcontractFeePct}%`}
                        compact
                      />
                    }
                    expense={
                      <SettlementStatCard
                        label="지출"
                        value="배송비 선차감"
                        hint="분배 재원에서 배송비 먼저 차감"
                        hintTooltip="사업영역 · 기공사업 설정과 동일. 배송은 분배 UI에 기재하지 않습니다."
                        compact
                      />
                    }
                    distribution={
                      <SettlementStatCard
                        label="분배"
                        value={
                          dash ??
                          Number(labDivision?.plannedBizSupply || 0) +
                            Number(labDivision?.plannedSalesTeamSupply || 0) +
                            Number(labDivision?.plannedDevopsSupply || 0) +
                            Number(labDivision?.plannedAbutsSupply || 0)
                        }
                        hint="기공 · 영업 · 개발 · 어벗츠"
                        hintTooltip="기공비 대비 설정 분배비율(참고). 내부 면세 / 개발운영 +VAT."
                        compact
                      />
                    }
                  />
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <CreditStatTile
                      label={`기공사업부 ${pctLabel(labRates?.bizPercent)}`}
                      value={formatWonWithUnit(labDivision?.plannedBizSupply)}
                      tone="accent"
                      hint={`적립 ${(
                        labDivision?.periodLineCount || 0
                      ).toLocaleString()}건`}
                    />
                    <CreditStatTile
                      label={`영업팀 ${pctLabel(labRates?.salesTeamPercent)}`}
                      value={formatWonWithUnit(
                        labDivision?.plannedSalesTeamSupply,
                      )}
                      hint="설정 분배(참고)"
                    />
                    <CreditStatTile
                      label={`개발운영 ${pctLabel(labRates?.devopsPercent)}`}
                      value={formatWonWithUnit(
                        labDivision?.plannedDevopsSupply,
                      )}
                      hint="설정 분배(참고) · +VAT"
                    />
                    <CreditStatTile
                      label={`어벗츠 ${pctLabel(labRates?.abutsPercent)}`}
                      value={formatWonWithUnit(labDivision?.plannedAbutsSupply)}
                      hint={`앵커 ${(
                        labDivision?.anchorCount || 0
                      ).toLocaleString()}곳 · ${SETTLEMENT_EXEMPT_INVOICE_LABEL}`}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <CreditStatTile
                      label="하청 수수료"
                      value={formatWonWithUnit(
                        labDivision?.subcontractFeeAmount,
                      )}
                      hint={`요율 ${subcontractFeePct}% · 해제 ${(
                        labDivision?.subcontractFeeReleaseCount || 0
                      ).toLocaleString()}건`}
                    />
                    <CreditStatTile
                      label="기공료 수취"
                      value={formatWonWithUnit(
                        labDivision?.periodSettlementEarn,
                      )}
                      hint={`${SETTLEMENT_EXEMPT_INVOICE_LABEL}`}
                    />
                  </div>
                </div>
              </CreditPanel>
            ) : null}

            {selectedAxis === "customAbut" ? (
              <CreditPanel>
                <div className="space-y-4 p-4">
                  <CreditSectionHeader
                    icon={HandCoins}
                    title="관계사 잔여 분배"
                    description="커스텀어벗 잔여 · 과세(제조·딜러·개발) / 면세(어벗츠)"
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
                          label="유료 미정산"
                          value={formatWonWithUnit(salesmanUnpaidInclusive)}
                          tone="accent"
                          hint={`공급 ${formatWonWithUnit(
                            salesmanUnpaidSplit.supply,
                          )} · ${SETTLEMENT_TAXABLE_INVOICE_LABEL}`}
                        />
                        <CreditStatTile
                          label="무료(참고)"
                          value={formatWonWithUnit(
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
                          label="유료 미정산"
                          value={formatWonWithUnit(devopsUnpaidInclusive)}
                          tone="accent"
                          hint={`공급 ${formatWonWithUnit(
                            devopsUnpaidSplit.supply,
                          )} · ${SETTLEMENT_TAXABLE_INVOICE_LABEL}`}
                        />
                        <CreditStatTile
                          label="무료(참고)"
                          value={formatWonWithUnit(
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
                          value={formatWonWithUnit(
                            adminFinanceRows.reduce(
                              (sum, row) =>
                                sum +
                                Number(row.wallet?.paidOutAmountPeriod || 0),
                              0,
                            ),
                          )}
                        />
                        <CreditStatTile
                          label="유료 미정산"
                          value={formatWonWithUnit(
                            adminFinanceRows.reduce(
                              (sum, row) =>
                                sum +
                                Number(row.wallet?.balanceAmountPeriod || 0),
                              0,
                            ),
                          )}
                          tone="accent"
                          hint={`면세 · ${SETTLEMENT_EXEMPT_INVOICE_LABEL}`}
                        />
                        <CreditStatTile
                          label="무료(참고)"
                          value={formatWonWithUnit(
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
            ) : null}
          </div>
        }
        mainRight={null}
      />
    </div>
  );
}

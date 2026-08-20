// related files:
// - web/frontend/src/pages/requestor/credits/RequestorCreditsPage.tsx
// - web/frontend/src/pages/manufacturer/payments/PaymentsPage.tsx
// - web/frontend/src/features/settings/tabs/LabTradingPartnersTab.tsx
// - web/frontend/src/shared/settlement/settlementUi.tsx
// - web/frontend/src/shared/settlement/affiliateVat.ts
// - web/backend/controllers/credits/credit.controller.js
// change-log:
// - 2026-08-17: 공통 정산 UI + 면세 계산서 안내.
// - 2026-08-13: 잔액/지급 동폭 클릭 카드로 탭 전환. 정산규칙은 검색줄 우측.

// - 2026-08-11: 요약 5열(액션 버튼 세로). 일자 입력 제거·검색 상단 이동. 전체/거래처/비거래처를 필터 행으로.
// - 2026-08-11: 요약 카드 — 하단 보조행 제거, 금액 옆 (N건), 높이 축소·중앙 정렬.
// - 2026-08-11: 정산 요청 버튼 제거(매월 자동 지급). 안내는 정산규칙 모달에만 표시.
// - 2026-08-11: 제조사 정산 페이지와 동일 UX(요약 카드·기간·일별/입금·정산규칙).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, request } from "@/shared/api/apiClient";
import { toKstYmd } from "@/shared/date/kst";
import { usePeriodStore, periodToRange } from "@/store/usePeriodStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import { Input } from "@/components/ui/input";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  BookOpenText,
  Building2,
  CalendarClock,
  HandCoins,
  Landmark,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  SETTLEMENT_EXEMPT_INVOICE_LABEL,
  SETTLEMENT_VAT_POLICY,
  formatWon,
} from "@/shared/settlement/affiliateVat";
import {
  SettlementPolicyDialog,
  SettlementPolicySection,
  SettlementSortIcon,
  SettlementStatCard,
  SettlementTableFrame,
} from "@/shared/settlement/settlementUi";

type PayoutItem = {
  _id: string;
  amount: number;
  createdAt?: string;
  paidAt?: string | null;
  status: "CONFIRMED" | "PENDING" | "EXCLUDED_NO_ACCOUNT" | "PAID" | "CANCELLED";
  batchId?: {
    periodStart?: string;
    periodEnd?: string;
    status?: string;
  };
  note?: string;
  externalId?: string;
};

type LabDailySnapshotRow = {
  ymd: string;
  earnPartnerAmount: number;
  earnPartnerCount: number;
  earnNonPartnerAmount: number;
  earnNonPartnerCount: number;
  earnAmount: number;
  earnCount: number;
  payoutAmount: number;
  adjustAmount: number;
  netAmount: number;
};

type ApiEnvelope<T> = {
  success?: boolean;
  message?: string;
  data?: T;
};

const PAGE_SIZE = 50;

type SortDirection = "asc" | "desc";
type SnapshotSortKey =
  | "ymd"
  | "earn"
  | "deduction"
  | "net";
type PayoutSortKey = "occurredAt" | "status" | "amount" | "note";

const formatDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const statusLabel = (s: string) => {
  if (s === "CONFIRMED") return "확정";
  if (s === "PENDING") return "대기";
  if (s === "EXCLUDED_NO_ACCOUNT") return "계좌 확인 필요";
  if (s === "PAID") return "지급완료";
  if (s === "CANCELLED") return "취소";
  return s;
};

const statusColor = (s: string) => {
  if (s === "CONFIRMED") return "text-primary-strong";
  if (s === "PENDING") return "text-accent-strong";
  if (s === "PAID") return "text-primary-strong";
  if (s === "CANCELLED") return "text-destructive";
  return "";
};

const periodToYmdRange = (
  period: PeriodFilterValue,
): { from: string; to: string } | null => {
  const range = periodToRange(period);
  if (!range) return null;
  const from = toKstYmd(new Date(range.startDate));
  const to = toKstYmd(new Date(range.endDate));
  if (!from || !to) return null;
  return { from, to };
};

const pctLabel = (rate: number) => `${Math.round(Number(rate || 0) * 100)}%`;

export const LabSettlementPayoutTab = () => {
  const { token } = useAuthStore();
  const { toast } = useToast();

  const [tab, setTab] = useState<"snapshot" | "payments">("snapshot");
  const { period, setPeriod, customStartDate, customEndDate } = usePeriodStore();
  const [q, setQ] = useState("");
  const [snapshotSort, setSnapshotSort] = useState<{
    key: SnapshotSortKey;
    direction: SortDirection;
  }>({ key: "ymd", direction: "desc" });
  const [payoutSort, setPayoutSort] = useState<{
    key: PayoutSortKey;
    direction: SortDirection;
  }>({ key: "occurredAt", direction: "desc" });

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<PayoutItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const [snapLoading, setSnapLoading] = useState(false);
  const [snapItems, setSnapItems] = useState<LabDailySnapshotRow[]>([]);
  const anyLoading = loading || snapLoading;

  const [settlementCredit, setSettlementCredit] = useState(0);
  const [platformFeeRate, setPlatformFeeRate] = useState(0.1);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const platformFeePct = pctLabel(platformFeeRate);

  const loadBalance = useCallback(async () => {
    if (!token) return;
    try {
      const res = await request<{
        data?: { settlementCredit?: number };
      }>({
        path: "/api/credits/balance",
        method: "GET",
        token,
      });
      if (!res.ok) return;
      setSettlementCredit(Number(res.data?.data?.settlementCredit || 0));
    } catch {
      // ignore — summary card stays at last known value
    }
  }, [token]);

  const loadFeeRates = useCallback(async () => {
    if (!token) return;
    try {
      const res = await request<{
        data?: {
          window?: {
            feeRates?: {
              platformFeeRate?: number;
              nonPartnerFeeRate?: number;
            };
          };
        };
      }>({
        path: "/api/lab-trading-partners",
        method: "GET",
        token,
      });
      if (!res.ok) return;
      const rates = res.data?.data?.window?.feeRates;
      const next = Number(
        rates?.platformFeeRate ?? rates?.nonPartnerFeeRate ?? 0.1,
      );
      if (Number.isFinite(next)) setPlatformFeeRate(next);
    } catch {
      // keep default
    }
  }, [token]);

  useEffect(() => {
    void loadBalance();
    void loadFeeRates();
  }, [loadBalance, loadFeeRates]);

  const buildQueryParams = useCallback(
    (p: number) => {
      const params = new URLSearchParams({
        page: String(p),
        limit: String(PAGE_SIZE),
      });
      const range = periodToYmdRange(period);
      if (range) {
        params.set("from", range.from);
        params.set("to", range.to);
      }
      if (q.trim()) params.set("q", q.trim());
      return params.toString();
    },
    [period, q, customStartDate, customEndDate],
  );

  const loadPayouts = useCallback(
    async (p: number, reset: boolean) => {
      if (!token) return;
      setLoading(true);
      try {
        const res = await apiFetch<ApiEnvelope<PayoutItem[]>>({
          path: `/api/credits/settlement/payouts?${buildQueryParams(p)}`,
          method: "GET",
          token,
        });
        if (!res.ok || !res.data?.success) {
          throw new Error(res.data?.message || "조회 실패");
        }
        const fetched: PayoutItem[] = Array.isArray(res.data.data)
          ? res.data.data
          : [];
        setItems((prev) => (reset ? fetched : [...prev, ...fetched]));
        setHasMore(false);
        setPage(p);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "조회 실패";
        toast({
          title: "조회 실패",
          description: message,
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    },
    [token, buildQueryParams, toast],
  );

  const buildSnapshotParams = useCallback(() => {
    const params = new URLSearchParams({ limit: "60" });
    const range = periodToYmdRange(period);
    if (range) {
      params.set("fromYmd", range.from);
      params.set("toYmd", range.to);
    }
    return params.toString();
  }, [period, customStartDate, customEndDate]);

  const loadSnapshots = useCallback(async () => {
    if (!token) return;
    setSnapLoading(true);
    try {
      const res = await apiFetch<ApiEnvelope<LabDailySnapshotRow[]>>({
        path: `/api/credits/settlement/daily-summary?${buildSnapshotParams()}`,
        method: "GET",
        token,
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.message || "조회 실패");
      }
      const fetched: LabDailySnapshotRow[] = Array.isArray(res.data.data)
        ? res.data.data
        : [];
      setSnapItems(fetched);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "조회 실패";
      toast({
        title: "조회 실패",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSnapLoading(false);
    }
  }, [token, buildSnapshotParams, toast]);

  useEffect(() => {
    if (tab === "payments") {
      setPage(1);
      setHasMore(true);
      void loadPayouts(1, true);
      return;
    }
    void loadSnapshots();
  }, [tab, period, q, loadPayouts, loadSnapshots]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root || !hasMore || loading || tab !== "payments") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && hasMore && !loading) {
          void loadPayouts(page + 1, false);
        }
      },
      { root, rootMargin: "200px", threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [hasMore, loading, page, tab, loadPayouts]);

  const handleTabChange = (v: string) => {
    if (v === "snapshot" || v === "payments") setTab(v);
  };

  const snapshotTotals = useMemo(() => {
    let earnTotal = 0;
    let earnCount = 0;
    let payoutTotal = 0;
    let payoutCount = 0;

    for (const row of snapItems) {
      earnTotal +=
        Number(row.earnPartnerAmount || 0) +
        Number(row.earnNonPartnerAmount || 0);
      earnCount +=
        Number(row.earnPartnerCount || 0) +
        Number(row.earnNonPartnerCount || 0);
      const pa = Number(row.payoutAmount || 0);
      payoutTotal += Math.abs(pa);
      if (pa !== 0) payoutCount += 1;
    }

    return {
      earnTotal,
      earnCount,
      payoutTotal,
      payoutCount,
    };
  }, [snapItems]);

  const toggleSnapshotSort = (key: SnapshotSortKey) => {
    setSnapshotSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "ymd" ? "desc" : "asc" },
    );
  };

  const togglePayoutSort = (key: PayoutSortKey) => {
    setPayoutSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "occurredAt" ? "desc" : "asc" },
    );
  };

  const sortedSnapItems = useMemo(() => {
    const earnOf = (r: LabDailySnapshotRow) =>
      Number(r.earnPartnerAmount || 0) + Number(r.earnNonPartnerAmount || 0);
    const deductionOf = (r: LabDailySnapshotRow) =>
      Number(r.payoutAmount || 0) + Number(r.adjustAmount || 0);
    const netOf = (r: LabDailySnapshotRow) => Number(r.netAmount || 0);

    const sorted = [...snapItems].sort((a, b) => {
      if (snapshotSort.key === "ymd") {
        const av = String(a.ymd || "").localeCompare(String(b.ymd || ""));
        return snapshotSort.direction === "asc" ? av : -av;
      }
      let av = 0;
      let bv = 0;
      if (snapshotSort.key === "earn") {
        av = earnOf(a);
        bv = earnOf(b);
      } else if (snapshotSort.key === "deduction") {
        av = deductionOf(a);
        bv = deductionOf(b);
      } else {
        av = netOf(a);
        bv = netOf(b);
      }
      return snapshotSort.direction === "asc" ? av - bv : bv - av;
    });
    return sorted;
  }, [snapItems, snapshotSort]);

  const sortedPayoutItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (payoutSort.key === "occurredAt") {
        const av = new Date(a.paidAt || a.createdAt || 0).getTime();
        const bv = new Date(b.paidAt || b.createdAt || 0).getTime();
        return payoutSort.direction === "asc" ? av - bv : bv - av;
      }
      if (payoutSort.key === "status") {
        const av = String(a.status || "");
        const bv = String(b.status || "");
        return payoutSort.direction === "asc"
          ? av.localeCompare(bv, "ko")
          : bv.localeCompare(av, "ko");
      }
      if (payoutSort.key === "amount") {
        const av = Number(a.amount || 0);
        const bv = Number(b.amount || 0);
        return payoutSort.direction === "asc" ? av - bv : bv - av;
      }
      const av = String(a.note || a.externalId || "");
      const bv = String(b.note || b.externalId || "");
      return payoutSort.direction === "asc"
        ? av.localeCompare(bv, "ko")
        : bv.localeCompare(av, "ko");
    });
  }, [items, payoutSort]);

  const renderSortIcon = (active: boolean, direction: SortDirection) => (
    <SettlementSortIcon active={active} direction={direction} />
  );

  return (
    <DashboardShell
      title="기공크레딧"
      subtitle=""
      statsGridClassName="grid grid-cols-1 gap-3 sm:grid-cols-2"
      stats={
        <>
          <SettlementStatCard
            label="기공크레딧 잔액"
            value={settlementCredit}
            tone="primary"
            selected={tab === "snapshot"}
            onClick={() => setTab("snapshot")}
            footer={
              <div className="text-[11px] tabular-nums text-slate-600 sm:text-xs">
                <span className="text-slate-400">기간 적립</span>{" "}
                <span className="font-medium text-slate-800">
                  {formatWon(snapshotTotals.earnTotal)}
                </span>
                <span className="ml-0.5 text-slate-400">
                  ({snapshotTotals.earnCount}건)
                </span>
              </div>
            }
          />
          <SettlementStatCard
            label="지급 합계"
            value={snapshotTotals.payoutTotal}
            selected={tab === "payments"}
            onClick={() => setTab("payments")}
            footer={
              <div className="text-xs text-muted-foreground">
                {snapshotTotals.payoutCount}건 · 면세 {SETTLEMENT_EXEMPT_INVOICE_LABEL}
              </div>
            }
          />
        </>
      }
      mainLeft={
        <div className="space-y-4">
          <Tabs value={tab} onValueChange={handleTabChange}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <PeriodFilter value={period} onChange={setPeriod} />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="검색 (계좌/저널ID)"
                className="h-9 w-full rounded-xl border-slate-200 sm:w-[280px]"
              />
              <SettlementPolicyDialog
                title="기공크레딧 정산 규칙"
                description="적립 · 분리 · 지급 기준을 한눈에 확인하세요."
              >
                <SettlementPolicySection title="기공의뢰 적립">
                  <div className="flex gap-2.5">
                    <HandCoins className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <p>
                      치과가 유료/무료크레딧으로 지불한 기공비에서, 자동
                      매칭 성공 시 플랫폼 수수료({platformFeePct})를 제외한
                      금액이{" "}
                      <span className="font-semibold text-slate-900">
                        기공크레딧
                      </span>
                      으로 적립됩니다. 지정 기공소 의뢰에는 플랫폼 수수료가
                      없습니다. 무료 프로모션 비용은 플랫폼이 부담합니다.
                    </p>
                  </div>
                </SettlementPolicySection>
                <SettlementPolicySection title="유료/무료크레딧 · 기공크레딧">
                  <div className="flex gap-2.5">
                    <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <p>
                      충전(선입금)·무료 지급과 기공크레딧 적립 경로는 따로
                      표시·관리됩니다. 앱 내 주문 차감은{" "}
                      <span className="font-semibold text-slate-900">
                        무료 → 기공 → 유료
                      </span>{" "}
                      순이며, 기공크레딧 사용분은 월 정산에서 상계됩니다.
                    </p>
                  </div>
                </SettlementPolicySection>
                <SettlementPolicySection title="면세 · 계산서">
                  <div className="flex gap-2.5">
                    <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <p>{SETTLEMENT_VAT_POLICY.exempt}</p>
                  </div>
                </SettlementPolicySection>
                <SettlementPolicySection title="매월 자동 지급">
                  <div className="flex gap-2.5">
                    <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <p>
                      기공크레딧 잔액은 사업자에 등록된 입금 계좌로 매월
                      자동 지급됩니다. 별도 정산 요청은 필요하지 않습니다.
                    </p>
                  </div>
                </SettlementPolicySection>
                <SettlementPolicySection title="일별 정산 집계">
                  <div className="flex gap-2.5">
                    <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <p>원장 기준 KST 일자별 실시간 집계</p>
                  </div>
                </SettlementPolicySection>
                <SettlementPolicySection title="롤백">
                  <div className="flex gap-2.5">
                    <BookOpenText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <p>기공의뢰 취소·롤백 시 해당 적립은 삭제형으로 정리</p>
                  </div>
                </SettlementPolicySection>
              </SettlementPolicyDialog>
            </div>

            <TabsContent value="snapshot" className="mt-0">
              <SettlementTableFrame>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[110px] text-center">
                        <button
                          type="button"
                          className="mx-auto inline-flex items-center gap-1 whitespace-nowrap text-xs sm:text-sm"
                          onClick={() => toggleSnapshotSort("ymd")}
                        >
                          일자
                          {renderSortIcon(
                            snapshotSort.key === "ymd",
                            snapshotSort.direction,
                          )}
                        </button>
                      </TableHead>
                      <TableHead className="min-w-[140px] text-center">
                        <button
                          type="button"
                          className="mx-auto inline-flex items-center gap-1 whitespace-nowrap text-xs sm:text-sm"
                          onClick={() => toggleSnapshotSort("earn")}
                        >
                          기공의뢰
                          {renderSortIcon(
                            snapshotSort.key === "earn",
                            snapshotSort.direction,
                          )}
                        </button>
                      </TableHead>
                      <TableHead className="min-w-[120px] text-center">
                        <button
                          type="button"
                          className="mx-auto inline-flex items-center gap-1 whitespace-nowrap text-xs sm:text-sm"
                          onClick={() => toggleSnapshotSort("deduction")}
                        >
                          차감
                          {renderSortIcon(
                            snapshotSort.key === "deduction",
                            snapshotSort.direction,
                          )}
                        </button>
                      </TableHead>
                      <TableHead className="w-[130px] text-center">
                        <button
                          type="button"
                          className="mx-auto inline-flex items-center gap-1 whitespace-nowrap text-xs sm:text-sm"
                          onClick={() => toggleSnapshotSort("net")}
                        >
                          순액
                          {renderSortIcon(
                            snapshotSort.key === "net",
                            snapshotSort.direction,
                          )}
                        </button>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedSnapItems.map((r) => {
                      const earnAmount =
                        Number(r.earnPartnerAmount || 0) +
                        Number(r.earnNonPartnerAmount || 0);
                      const earnCount =
                        Number(r.earnPartnerCount || 0) +
                        Number(r.earnNonPartnerCount || 0);
                      const payoutRaw = Number(r.payoutAmount || 0);
                      const payoutAmountAbs = Math.abs(payoutRaw);
                      const adjustAmount = Number(r.adjustAmount || 0);

                      const earnText =
                        earnAmount > 0 || earnCount > 0
                          ? `₩${earnAmount.toLocaleString()}(${earnCount})`
                          : "-";

                      const deductionParts: string[] = [];
                      if (payoutRaw !== 0) {
                        deductionParts.push(
                          `지급 ₩${payoutAmountAbs.toLocaleString()}`,
                        );
                      }
                      if (adjustAmount !== 0) {
                        deductionParts.push(
                          `조정 ₩${adjustAmount.toLocaleString()}`,
                        );
                      }
                      const deductionText = deductionParts.length
                        ? deductionParts.join(" / ")
                        : "-";

                      const netText = `₩${Number(r.netAmount || 0).toLocaleString()}`;

                      return (
                        <TableRow key={r.ymd}>
                          <TableCell className="text-center text-xs tabular-nums whitespace-nowrap">
                            {r.ymd}
                          </TableCell>
                          <TableCell className="text-center text-[11px] tabular-nums whitespace-nowrap">
                            {earnText}
                          </TableCell>
                          <TableCell className="text-center text-[11px] tabular-nums text-accent-strong whitespace-nowrap">
                            {deductionText}
                          </TableCell>
                          <TableCell className="text-center text-xs font-semibold tabular-nums text-primary-strong whitespace-nowrap">
                            {netText}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {snapLoading && (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="py-4 text-center text-sm text-muted-foreground"
                        >
                          불러오는 중...
                        </TableCell>
                      </TableRow>
                    )}
                    {!snapLoading && snapItems.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="py-8 text-center text-sm text-muted-foreground"
                        >
                          조회 결과가 없습니다.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </SettlementTableFrame>
            </TabsContent>

            <TabsContent value="payments" className="mt-0">
              <SettlementTableFrame
                scrollRef={scrollRef}
                className="max-h-[60vh] overflow-y-auto"
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[190px] text-center">
                        <button
                          type="button"
                          className="mx-auto inline-flex items-center gap-1 text-xs sm:text-sm"
                          onClick={() => togglePayoutSort("occurredAt")}
                        >
                          일시
                          {renderSortIcon(
                            payoutSort.key === "occurredAt",
                            payoutSort.direction,
                          )}
                        </button>
                      </TableHead>
                      <TableHead className="w-[100px] text-center">
                        <button
                          type="button"
                          className="mx-auto inline-flex items-center gap-1 text-xs sm:text-sm"
                          onClick={() => togglePayoutSort("status")}
                        >
                          상태
                          {renderSortIcon(
                            payoutSort.key === "status",
                            payoutSort.direction,
                          )}
                        </button>
                      </TableHead>
                      <TableHead className="w-[140px] text-center">
                        <button
                          type="button"
                          className="mx-auto inline-flex items-center gap-1 text-xs sm:text-sm"
                          onClick={() => togglePayoutSort("amount")}
                        >
                          금액
                          {renderSortIcon(
                            payoutSort.key === "amount",
                            payoutSort.direction,
                          )}
                        </button>
                      </TableHead>
                      <TableHead className="min-w-[260px] text-center">
                        <button
                          type="button"
                          className="mx-auto inline-flex items-center gap-1 text-xs sm:text-sm"
                          onClick={() => togglePayoutSort("note")}
                        >
                          메모
                          {renderSortIcon(
                            payoutSort.key === "note",
                            payoutSort.direction,
                          )}
                        </button>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedPayoutItems.map((r) => (
                      <TableRow key={r._id}>
                        <TableCell className="text-center text-xs whitespace-nowrap">
                          {formatDate(String(r.paidAt || r.createdAt || ""))}
                        </TableCell>
                        <TableCell
                          className={`text-center text-xs font-medium whitespace-nowrap ${statusColor(r.status)}`}
                        >
                          {statusLabel(r.status)}
                        </TableCell>
                        <TableCell className="text-center text-xs font-semibold text-primary-strong tabular-nums whitespace-nowrap">
                          ₩{Number(r.amount || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground">
                          {r.batchId?.periodStart
                            ? `${toKstYmd(new Date(r.batchId.periodStart))} 정산`
                            : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {loading && (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="py-4 text-center text-sm text-muted-foreground"
                        >
                          불러오는 중...
                        </TableCell>
                      </TableRow>
                    )}
                    {!loading && items.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="py-8 text-center text-sm text-muted-foreground"
                        >
                          조회 결과가 없습니다.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                {hasMore && !loading && (
                  <div ref={sentinelRef} className="h-8" />
                )}
              </SettlementTableFrame>
            </TabsContent>
          </Tabs>
        </div>
      }
    />
  );
};

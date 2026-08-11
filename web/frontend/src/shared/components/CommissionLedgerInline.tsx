// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import { periodToRange } from "@/store/usePeriodStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SalesmanLedgerType } from "./SalesmanLedgerModal";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { LedgerTableRowsSkeleton } from "@/shared/ui/skeletons/DashboardSectionSkeletons";

type LedgerItem = {
  _id: string;
  type: SalesmanLedgerType;
  amount: number;
  refType?: string;
  refId?: string | null;
  uniqueKey: string;
  createdAt: string;
  balanceAfter?: number;
};

type CommissionLedgerListResponse = {
  items?: LedgerItem[];
};

type ApiEnvelope<T> = {
  success?: boolean;
  message?: string;
  data?: T;
};

export type CommissionLedgerInlineProps = {
  salesmanId?: string | null;
  mode?: "admin" | "self";
  /** 외부에서 period를 제어할 때 사용. 제공 시 내부 PeriodFilter 미표시. */
  period?: PeriodFilterValue;
};

const PAGE_SIZE = 50;

type SortDirection = "asc" | "desc";
type LedgerSortKey = "createdAt" | "type" | "amount" | "balanceAfter" | "ref";

const formatDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatShortCode = (value: string) => {
  const raw = String(value || "");
  if (!raw) return "-";
  const tail = raw.replace(/[^a-zA-Z0-9]/g, "");
  return tail.slice(-4).toUpperCase() || "-";
};

const typeLabel = (t: SalesmanLedgerType) => {
  if (t === "EARN") return "적립";
  if (t === "PAYOUT") return "정산";
  return "조정";
};

const refTypeLabel = (refType?: string) => {
  const t = String(refType || "").trim();
  if (!t) return "-";
  if (t === "COMMISSION") return "수수료";
  if (t === "ADMIN_PAYOUT") return "관리자 정산";
  if (t === "ADJUST") return "조정";
  return t;
};

export const CommissionLedgerInline = ({
  salesmanId,
  mode,
  period: externalPeriod,
}: CommissionLedgerInlineProps) => {
  const { token } = useAuthStore();
  const { toast } = useToast();

  const [internalPeriod, setInternalPeriod] =
    useState<PeriodFilterValue>("30d");
  const period = externalPeriod ?? internalPeriod;
  const [type, setType] = useState<"all" | SalesmanLedgerType>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<LedgerItem[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: LedgerSortKey; direction: SortDirection }>({
    key: "createdAt",
    direction: "desc",
  });

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const resetFilters = () => {
    if (!externalPeriod) setInternalPeriod("30d");
    setType("all");
    setFrom("");
    setTo("");
    setQ("");
  };

  const buildQs = useCallback((p: number) => {
    const qs = new URLSearchParams({
      page: String(p),
      pageSize: String(PAGE_SIZE),
    });
    const hasManualRange = Boolean(from || to);
    if (!hasManualRange) {
      if (period === "thisMonth" || period === "lastMonth") {
        const range = periodToRange(period);
        if (range?.startDate) qs.set("from", range.startDate);
        if (range?.endDate) qs.set("to", range.endDate);
      } else if (period) {
        qs.set("period", period);
      }
    }
    if (type !== "all") qs.set("type", type);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    if (q.trim()) qs.set("q", q.trim());
    return qs.toString();
  }, [period, type, from, to, q]);

  const loadPage = useCallback(async (p: number, reset = false) => {
    if (!token) return;
    setLoading(true);
    try {
      const effectiveMode: "admin" | "self" = mode
        ? mode
        : salesmanId
          ? "admin"
          : "self";
      if (effectiveMode === "admin" && !salesmanId) return;

      const path =
        effectiveMode === "self"
          ? `/api/salesman/ledger?${buildQs(p)}`
          : `/api/admin/credits/salesmen/${salesmanId}/ledger?${buildQs(p)}`;
      const res = await request<ApiEnvelope<CommissionLedgerListResponse>>({
        path,
        method: "GET",
        token,
      });
      if (!res.ok) throw new Error(res.data?.message || "조회 실패");
      const data = res.data?.data;
      const fetched: LedgerItem[] = Array.isArray(data?.items)
        ? data.items
        : [];
      setItems((prev) => (reset ? fetched : [...prev, ...fetched]));
      setHasMore(fetched.length >= PAGE_SIZE);
      setPage(p);
    } catch (err: unknown) {
      toast({
        title: "조회 실패",
        description: err instanceof Error ? err.message : "조회 실패",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [token, mode, salesmanId, buildQs, toast]);

  useEffect(() => {
    const effectiveMode: "admin" | "self" = mode
      ? mode
      : salesmanId
        ? "admin"
        : "self";
    if (effectiveMode === "admin" && !salesmanId) return;
    setItems([]);
    setHasMore(true);
    loadPage(1, true);
  }, [salesmanId, mode, period, type, from, to, q, loadPage]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root || !hasMore || loading) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && hasMore && !loading) {
          loadPage(page + 1, false);
        }
      },
      { root, rootMargin: "200px", threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [hasMore, loading, page, salesmanId, loadPage]);

  const toggleSort = (key: LedgerSortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "createdAt" ? "desc" : "asc" },
    );
  };

  const renderSortIcon = (active: boolean, direction: SortDirection) => {
    if (!active) return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />;
    return direction === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 text-foreground" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-foreground" />
    );
  };

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (sort.key === "createdAt") {
        const av = new Date(a.createdAt || 0).getTime();
        const bv = new Date(b.createdAt || 0).getTime();
        return sort.direction === "asc" ? av - bv : bv - av;
      }
      if (sort.key === "type") {
        const av = typeLabel(a.type);
        const bv = typeLabel(b.type);
        return sort.direction === "asc"
          ? av.localeCompare(bv, "ko")
          : bv.localeCompare(av, "ko");
      }
      if (sort.key === "amount") {
        const av = Number(a.amount || 0);
        const bv = Number(b.amount || 0);
        return sort.direction === "asc" ? av - bv : bv - av;
      }
      if (sort.key === "balanceAfter") {
        const av = Number(a.balanceAfter ?? Number.NEGATIVE_INFINITY);
        const bv = Number(b.balanceAfter ?? Number.NEGATIVE_INFINITY);
        return sort.direction === "asc" ? av - bv : bv - av;
      }
      const av = `${formatShortCode(String(a.uniqueKey || ""))} ${refTypeLabel(a.refType)}`;
      const bv = `${formatShortCode(String(b.uniqueKey || ""))} ${refTypeLabel(b.refType)}`;
      return sort.direction === "asc"
        ? av.localeCompare(bv, "ko")
        : bv.localeCompare(av, "ko");
    });
  }, [items, sort]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {!externalPeriod && (
          <div className="flex flex-wrap items-center gap-2">
            <PeriodFilter value={internalPeriod} onChange={setInternalPeriod} useStoreCustomRange={false} />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 w-[140px]"
          />
          <span className="text-xs text-muted-foreground">~</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 w-[140px]"
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="검색 (참조/코드/refId)"
            className="h-9 min-w-[160px] flex-1"
          />
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs focus:outline-none focus:ring-1 focus:ring-ring"
            value={type}
            onChange={(e) => {
              const next = e.target.value;
              if (
                next === "all" ||
                next === "EARN" ||
                next === "PAYOUT" ||
                next === "ADJUST"
              ) {
                setType(next);
              }
            }}
          >
            <option value="all">전체</option>
            <option value="EARN">적립</option>
            <option value="PAYOUT">정산</option>
            <option value="ADJUST">조정</option>
          </select>
          <Button
            type="button"
            variant="outline"
            className="h-9 shrink-0"
            onClick={resetFilters}
          >
            초기화
          </Button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="max-h-[480px] overflow-y-auto overflow-x-auto rounded-md border"
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[190px] text-center">
                <button
                  type="button"
                  className="mx-auto inline-flex items-center gap-1 text-xs sm:text-sm"
                  onClick={() => toggleSort("createdAt")}
                >
                  일시
                  {renderSortIcon(sort.key === "createdAt", sort.direction)}
                </button>
              </TableHead>
              <TableHead className="w-[110px] text-center">
                <button
                  type="button"
                  className="mx-auto inline-flex items-center gap-1 text-xs sm:text-sm"
                  onClick={() => toggleSort("type")}
                >
                  유형
                  {renderSortIcon(sort.key === "type", sort.direction)}
                </button>
              </TableHead>
              <TableHead className="w-[130px] text-center">
                <button
                  type="button"
                  className="mx-auto inline-flex items-center gap-1 text-xs sm:text-sm"
                  onClick={() => toggleSort("amount")}
                >
                  금액
                  {renderSortIcon(sort.key === "amount", sort.direction)}
                </button>
              </TableHead>
              <TableHead className="w-[130px] text-center">
                <button
                  type="button"
                  className="mx-auto inline-flex items-center gap-1 text-xs sm:text-sm"
                  onClick={() => toggleSort("balanceAfter")}
                >
                  잔액
                  {renderSortIcon(sort.key === "balanceAfter", sort.direction)}
                </button>
              </TableHead>
              <TableHead className="min-w-[180px] text-center">
                <button
                  type="button"
                  className="mx-auto inline-flex items-center gap-1 text-xs sm:text-sm"
                  onClick={() => toggleSort("ref")}
                >
                  참조
                  {renderSortIcon(sort.key === "ref", sort.direction)}
                </button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedItems.map((r) => {
              const amount = Number(r.amount || 0);
              const balanceAfter =
                r.balanceAfter !== undefined ? Number(r.balanceAfter) : null;
              return (
                <TableRow key={r._id}>
                  <TableCell className="text-center text-xs whitespace-nowrap">
                    {formatDate(String(r.createdAt || ""))}
                  </TableCell>
                  <TableCell className="text-center text-xs font-medium whitespace-nowrap">
                    {typeLabel(r.type)}
                  </TableCell>
                  <TableCell
                    className={`text-center text-xs font-semibold tabular-nums whitespace-nowrap ${amount < 0 ? "text-rose-600" : "text-blue-700"}`}
                  >
                    {amount.toLocaleString()}원
                  </TableCell>
                  <TableCell className="text-center text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                    {balanceAfter !== null
                      ? `${balanceAfter.toLocaleString()}원`
                      : "-"}
                  </TableCell>
                  <TableCell className="text-center text-xs">
                    <div className="flex flex-col items-center leading-4">
                      <span className="font-mono text-xs font-semibold">
                        {formatShortCode(String(r.uniqueKey || ""))}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {refTypeLabel(r.refType)}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {!loading && items.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  조회 결과가 없습니다.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div ref={sentinelRef} className="h-6" />
        {loading && items.length === 0 ? (
          <div className="p-2">
            <LedgerTableRowsSkeleton rows={6} />
          </div>
        ) : null}
        {loading && items.length > 0 ? (
          <div className="py-3 text-center text-sm text-muted-foreground">
            더 불러오는 중...
          </div>
        ) : null}
      </div>
    </div>
  );
};

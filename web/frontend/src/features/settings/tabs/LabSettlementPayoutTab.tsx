// related files:
// - web/frontend/src/pages/requestor/credits/RequestorCreditsPage.tsx
// - web/frontend/src/pages/manufacturer/payments/PaymentsPage.tsx
// - web/backend/controllers/credits/credit.controller.js
// change-log:
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BookOpenText,
  Building2,
  CalendarClock,
  HandCoins,
  Landmark,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
  earnReferredAmount: number;
  earnReferredCount: number;
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
  | "partner"
  | "referred"
  | "nonPartner"
  | "deduction"
  | "net";
type RelationshipFilter = "all" | "partner" | "referred" | "nonPartner";
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
  const range = periodToRange(period, { customStartDate: "", customEndDate: "" });
  if (!range) return null;
  const from = toKstYmd(new Date(range.startDate));
  const to = toKstYmd(new Date(range.endDate));
  if (!from || !to) return null;
  return { from, to };
};

export const LabSettlementPayoutTab = () => {
  const { token } = useAuthStore();
  const { toast } = useToast();

  const [tab, setTab] = useState<"snapshot" | "payments">("snapshot");
  const { period, setPeriod } = usePeriodStore();
  const [q, setQ] = useState("");
  const [partnerFilter, setPartnerFilter] = useState<RelationshipFilter>("all");
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

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    void loadBalance();
  }, [loadBalance]);

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
    [period, q],
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
  }, [period]);

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
    let partnerTotal = 0;
    let partnerCount = 0;
    let referredTotal = 0;
    let referredCount = 0;
    let nonPartnerTotal = 0;
    let nonPartnerCount = 0;
    let payoutTotal = 0;
    let payoutCount = 0;

    for (const row of snapItems) {
      partnerTotal += Number(row.earnPartnerAmount || 0);
      partnerCount += Number(row.earnPartnerCount || 0);
      referredTotal += Number(row.earnReferredAmount || 0);
      referredCount += Number(row.earnReferredCount || 0);
      nonPartnerTotal += Number(row.earnNonPartnerAmount || 0);
      nonPartnerCount += Number(row.earnNonPartnerCount || 0);
      const pa = Number(row.payoutAmount || 0);
      payoutTotal += Math.abs(pa);
      if (pa !== 0) payoutCount += 1;
    }

    return {
      partnerTotal,
      partnerCount,
      referredTotal,
      referredCount,
      nonPartnerTotal,
      nonPartnerCount,
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
    const partnerOf = (r: LabDailySnapshotRow) =>
      Number(r.earnPartnerAmount || 0);
    const referredOf = (r: LabDailySnapshotRow) =>
      Number(r.earnReferredAmount || 0);
    const nonPartnerOf = (r: LabDailySnapshotRow) =>
      Number(r.earnNonPartnerAmount || 0);
    const deductionOf = (r: LabDailySnapshotRow) =>
      Number(r.payoutAmount || 0) + Number(r.adjustAmount || 0);
    const netOf = (r: LabDailySnapshotRow) => {
      if (partnerFilter === "partner") return partnerOf(r);
      if (partnerFilter === "referred") return referredOf(r);
      if (partnerFilter === "nonPartner") return nonPartnerOf(r);
      return Number(r.netAmount || 0);
    };

    const sorted = [...snapItems].sort((a, b) => {
      if (snapshotSort.key === "ymd") {
        const av = String(a.ymd || "").localeCompare(String(b.ymd || ""));
        return snapshotSort.direction === "asc" ? av : -av;
      }
      let av = 0;
      let bv = 0;
      if (snapshotSort.key === "partner") {
        av = partnerOf(a);
        bv = partnerOf(b);
      } else if (snapshotSort.key === "referred") {
        av = referredOf(a);
        bv = referredOf(b);
      } else if (snapshotSort.key === "nonPartner") {
        av = nonPartnerOf(a);
        bv = nonPartnerOf(b);
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
  }, [snapItems, partnerFilter, snapshotSort]);

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

  const renderSortIcon = (active: boolean, direction: SortDirection) => {
    if (!active)
      return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />;
    return direction === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 text-foreground" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-foreground" />
    );
  };

  return (
    <DashboardShell
      title="기공크레딧 정산"
      subtitle=""
      statsGridClassName="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
      stats={
        <>
          <Card>
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-center text-sm font-medium text-muted-foreground break-keep">
                기공크레딧 잔액
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-center text-lg font-semibold text-primary-strong tabular-nums sm:text-xl">
                ₩{settlementCredit.toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-center text-sm font-medium text-muted-foreground break-keep">
                기존 치과 (0%)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-center text-lg font-semibold text-primary-strong tabular-nums sm:text-xl">
                ₩{snapshotTotals.partnerTotal.toLocaleString()}
                <span className="ml-1 text-sm font-medium text-muted-foreground">
                  ({snapshotTotals.partnerCount}건)
                </span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-center text-sm font-medium text-muted-foreground break-keep">
                소개 치과 (10%)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-center text-lg font-semibold text-primary-strong tabular-nums sm:text-xl">
                ₩{snapshotTotals.referredTotal.toLocaleString()}
                <span className="ml-1 text-sm font-medium text-muted-foreground">
                  ({snapshotTotals.referredCount}건)
                </span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-center text-sm font-medium text-muted-foreground break-keep">
                일반 치과 (25%)
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-center text-lg font-semibold text-primary-strong tabular-nums sm:text-xl">
                ₩{snapshotTotals.nonPartnerTotal.toLocaleString()}
                <span className="ml-1 text-sm font-medium text-muted-foreground">
                  ({snapshotTotals.nonPartnerCount}건)
                </span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-center text-sm font-medium text-muted-foreground break-keep">
                지급 합계
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="text-center text-lg font-semibold tabular-nums sm:text-xl">
                ₩{snapshotTotals.payoutTotal.toLocaleString()}
                <span className="ml-1 text-sm font-medium text-muted-foreground">
                  ({snapshotTotals.payoutCount}건)
                </span>
              </div>
            </CardContent>
          </Card>
          <div className="flex flex-col justify-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={tab === "snapshot" ? "default" : "outline"}
              className="h-8 w-full"
              onClick={() => setTab("snapshot")}
            >
              일별 정산
            </Button>
            <Button
              type="button"
              size="sm"
              variant={tab === "payments" ? "default" : "outline"}
              className="h-8 w-full"
              onClick={() => setTab("payments")}
            >
              입금 내역
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 w-full"
                >
                  정산규칙
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>기공소 기공크레딧 정산 규칙</DialogTitle>
                </DialogHeader>
                <div className="grid gap-2 text-sm">
                  <div className="flex items-start gap-3 rounded-lg border p-3">
                    <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">
                      01
                    </span>
                    <HandCoins className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="font-medium">기공의뢰 적립</div>
                      <div className="text-muted-foreground">
                        치과가 유료크레딧으로 지불한 기공비에서, 등록 치과(기본
                        0%)·미등록 치과(기본 25%)는 플랫폼 수수료를 제외한
                        금액이 기공크레딧으로 적립됩니다
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-lg border p-3">
                    <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">
                      02
                    </span>
                    <Building2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="font-medium">유료크레딧 · 기공크레딧 분리</div>
                      <div className="text-muted-foreground">
                        유료크레딧은 기공소가 입금·충전한 잔액(생산의뢰·배송 소비).
                        기공크레딧은 치과에서 받은 정산 대기액으로 완전 분리 관리
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-lg border p-3">
                    <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">
                      03
                    </span>
                    <Landmark className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="font-medium">매월 자동 지급</div>
                      <div className="text-muted-foreground">
                        기공크레딧 잔액은 사업자에 등록된 입금 계좌로 매월 자동
                        지급됩니다. 별도 정산 요청은 필요하지 않습니다.
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-lg border p-3">
                    <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">
                      04
                    </span>
                    <CalendarClock className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="font-medium">일별 정산 집계</div>
                      <div className="text-muted-foreground">
                        원장 기준 KST 일자별 실시간 집계
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-lg border p-3">
                    <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">
                      05
                    </span>
                    <BookOpenText className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="font-medium">롤백</div>
                      <div className="text-muted-foreground">
                        기공의뢰 취소·롤백 시 해당 적립은 삭제형으로 정리
                      </div>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </>
      }
      mainLeft={
        <div className="space-y-4">
          <Tabs value={tab} onValueChange={handleTabChange}>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <PeriodFilter value={period} onChange={setPeriod} />
              <div className="inline-flex items-center rounded-md border bg-background p-0.5">
                <Button
                  type="button"
                  size="sm"
                  variant={partnerFilter === "all" ? "default" : "ghost"}
                  className="h-7 px-2"
                  onClick={() => setPartnerFilter("all")}
                  disabled={anyLoading}
                >
                  전체
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={partnerFilter === "partner" ? "default" : "ghost"}
                  className="h-7 px-2"
                  onClick={() => setPartnerFilter("partner")}
                  disabled={anyLoading}
                >
                  기존 치과
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={partnerFilter === "referred" ? "default" : "ghost"}
                  className="h-7 px-2"
                  onClick={() => setPartnerFilter("referred")}
                  disabled={anyLoading}
                >
                  소개 치과
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={
                    partnerFilter === "nonPartner" ? "default" : "ghost"
                  }
                  className="h-7 px-2"
                  onClick={() => setPartnerFilter("nonPartner")}
                  disabled={anyLoading}
                >
                  일반 치과
                </Button>
              </div>
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="검색 (계좌/저널ID)"
                className="h-9 w-full sm:w-[280px]"
              />
            </div>

            <TabsContent value="snapshot" className="mt-0">
              <div className="overflow-x-auto rounded-md border">
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
                          onClick={() => toggleSnapshotSort("partner")}
                        >
                          기존 치과 (0%)
                          {renderSortIcon(
                            snapshotSort.key === "partner",
                            snapshotSort.direction,
                          )}
                        </button>
                      </TableHead>
                      <TableHead className="min-w-[140px] text-center">
                        <button
                          type="button"
                          className="mx-auto inline-flex items-center gap-1 whitespace-nowrap text-xs sm:text-sm"
                          onClick={() => toggleSnapshotSort("referred")}
                        >
                          소개 치과 (10%)
                          {renderSortIcon(
                            snapshotSort.key === "referred",
                            snapshotSort.direction,
                          )}
                        </button>
                      </TableHead>
                      <TableHead className="min-w-[140px] text-center">
                        <button
                          type="button"
                          className="mx-auto inline-flex items-center gap-1 whitespace-nowrap text-xs sm:text-sm"
                          onClick={() => toggleSnapshotSort("nonPartner")}
                        >
                          일반 치과 (25%)
                          {renderSortIcon(
                            snapshotSort.key === "nonPartner",
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
                      const partnerAmount = Number(r.earnPartnerAmount || 0);
                      const partnerCount = Number(r.earnPartnerCount || 0);
                      const referredAmount = Number(r.earnReferredAmount || 0);
                      const referredCount = Number(r.earnReferredCount || 0);
                      const nonPartnerAmount = Number(
                        r.earnNonPartnerAmount || 0,
                      );
                      const nonPartnerCount = Number(
                        r.earnNonPartnerCount || 0,
                      );
                      const payoutRaw = Number(r.payoutAmount || 0);
                      const payoutAmountAbs = Math.abs(payoutRaw);
                      const adjustAmount = Number(r.adjustAmount || 0);

                      const fmtEarn = (amount: number, count: number) =>
                        amount > 0 || count > 0
                          ? `₩${amount.toLocaleString()}(${count})`
                          : "-";

                      let partnerText = fmtEarn(partnerAmount, partnerCount);
                      let referredText = fmtEarn(referredAmount, referredCount);
                      let nonPartnerText = fmtEarn(
                        nonPartnerAmount,
                        nonPartnerCount,
                      );

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
                      let deductionText = deductionParts.length
                        ? deductionParts.join(" / ")
                        : "-";

                      let netText = `₩${Number(r.netAmount || 0).toLocaleString()}`;

                      if (partnerFilter === "partner") {
                        referredText = "-";
                        nonPartnerText = "-";
                        deductionText = "-";
                        netText = `₩${partnerAmount.toLocaleString()}`;
                      } else if (partnerFilter === "referred") {
                        partnerText = "-";
                        nonPartnerText = "-";
                        deductionText = "-";
                        netText = `₩${referredAmount.toLocaleString()}`;
                      } else if (partnerFilter === "nonPartner") {
                        partnerText = "-";
                        referredText = "-";
                        deductionText = "-";
                        netText = `₩${nonPartnerAmount.toLocaleString()}`;
                      }

                      return (
                        <TableRow key={r.ymd}>
                          <TableCell className="text-center text-xs tabular-nums whitespace-nowrap">
                            {r.ymd}
                          </TableCell>
                          <TableCell className="text-center text-[11px] tabular-nums whitespace-nowrap">
                            {partnerText}
                          </TableCell>
                          <TableCell className="text-center text-[11px] tabular-nums whitespace-nowrap">
                            {referredText}
                          </TableCell>
                          <TableCell className="text-center text-[11px] tabular-nums whitespace-nowrap">
                            {nonPartnerText}
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
                          colSpan={6}
                          className="py-4 text-center text-sm text-muted-foreground"
                        >
                          불러오는 중...
                        </TableCell>
                      </TableRow>
                    )}
                    {!snapLoading && snapItems.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-8 text-center text-sm text-muted-foreground"
                        >
                          조회 결과가 없습니다.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="payments" className="mt-0">
              <div
                ref={scrollRef}
                className="max-h-[60vh] overflow-x-auto overflow-y-auto rounded-md border"
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
              </div>
            </TabsContent>
          </Tabs>
        </div>
      }
    />
  );
};

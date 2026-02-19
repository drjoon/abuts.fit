import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BookOpenText,
  CalendarClock,
  HandCoins,
  ReceiptText,
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

type PaymentItem = {
  _id: string;
  amount: number;
  occurredAt: string;
  status: "CONFIRMED" | "PENDING" | "CANCELLED";
  note?: string;
  externalId?: string;
  printedContent?: string;
};

type ManufacturerLedgerRow = {
  _id: string;
  manufacturerOrganization: string;
  manufacturerId?: string | null;
  type: "EARN" | "REFUND" | "PAYOUT" | "ADJUST";
  amount: number;
  refType?: string;
  refId?: string | null;
  uniqueKey: string;
  occurredAt: string;
};

type ManufacturerDailySnapshotRow = {
  _id: string;
  ymd: string;
  manufacturerOrganization: string;
  earnRequestAmount: number;
  earnRequestCount: number;
  earnShippingAmount: number;
  earnShippingCount: number;
  refundAmount: number;
  payoutAmount: number;
  adjustAmount: number;
  netAmount: number;
  computedAt?: string;
};

type ManufacturerDailySnapshotStatus = {
  lastComputedAt: string | null;
  baseYmd: string;
  baseMidnightUtc: string;
  snapshotYmd: string;
  snapshotMissing?: boolean;
};

const PAGE_SIZE = 50;

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

const statusLabel = (s: string) => {
  if (s === "CONFIRMED") return "확정";
  if (s === "PENDING") return "대기";
  if (s === "CANCELLED") return "취소";
  return s;
};

const statusColor = (s: string) => {
  if (s === "CONFIRMED") return "text-blue-700";
  if (s === "PENDING") return "text-yellow-600";
  if (s === "CANCELLED") return "text-rose-600";
  return "";
};

const periodToDays = (period: PeriodFilterValue): number | null => {
  if (period === "7d") return 7;
  if (period === "30d") return 30;
  if (period === "90d") return 90;
  return null;
};

export const ManufacturerPaymentPage = () => {
  const { token, user } = useAuthStore();
  const { toast } = useToast();

  const [tab, setTab] = useState<"snapshot" | "ledger" | "payments">(
    "snapshot",
  );

  const [period, setPeriod] = useState<PeriodFilterValue>("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<PaymentItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalAmount, setTotalAmount] = useState(0);

  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerItems, setLedgerItems] = useState<ManufacturerLedgerRow[]>([]);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerHasMore, setLedgerHasMore] = useState(true);

  const [snapLoading, setSnapLoading] = useState(false);
  const [snapItems, setSnapItems] = useState<ManufacturerDailySnapshotRow[]>(
    [],
  );
  const [snapshotStatus, setSnapshotStatus] =
    useState<ManufacturerDailySnapshotStatus | null>(null);
  const [snapshotRecalcLoading, setSnapshotRecalcLoading] = useState(false);

  const anyLoading = loading || ledgerLoading || snapLoading;

  const snapshotRecalcDisabled = (() => {
    const baseMidnightUtc = snapshotStatus?.baseMidnightUtc;
    const last = snapshotStatus?.lastComputedAt;
    if (!baseMidnightUtc || !last) return false;
    const base = new Date(baseMidnightUtc);
    const computed = new Date(last);
    if (Number.isNaN(base.getTime()) || Number.isNaN(computed.getTime()))
      return false;
    return computed.getTime() >= base.getTime();
  })();

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const ledgerScrollRef = useRef<HTMLDivElement | null>(null);
  const ledgerSentinelRef = useRef<HTMLDivElement | null>(null);

  if (!user || user.role !== "manufacturer") return null;

  const resetFilters = () => {
    setPeriod("30d");
    setFrom("");
    setTo("");
    setQ("");
  };

  const buildParams = (p: number) => {
    const params = new URLSearchParams({
      page: String(p),
      limit: String(PAGE_SIZE),
    });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const days = periodToDays(period);
    if (days && !from && !to) {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      params.set("from", cutoff.toISOString().slice(0, 10));
    }
    if (q.trim()) params.set("q", q.trim());
    return params.toString();
  };

  const loadPayments = async (p: number, reset: boolean) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiFetch<any>({
        path: `/api/manufacturer/payments?${buildParams(p)}`,
        method: "GET",
        token,
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.message || "조회 실패");
      }
      const fetched: PaymentItem[] = Array.isArray(res.data.data)
        ? res.data.data
        : [];
      setItems((prev) => (reset ? fetched : [...prev, ...fetched]));
      setHasMore(fetched.length >= PAGE_SIZE);
      setPage(p);
      if (reset) {
        const sum = fetched
          .filter((x) => x.status === "CONFIRMED")
          .reduce((acc, x) => acc + Number(x.amount || 0), 0);
        setTotalAmount(sum);
      }
    } catch (err: any) {
      toast({
        title: "조회 실패",
        description: err?.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadSnapshotStatus = async () => {
    if (!token) return;
    try {
      const res = await apiFetch<any>({
        path: `/api/manufacturer/credits/daily-snapshots/status`,
        method: "GET",
        token,
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.message || "조회 실패");
      }
      setSnapshotStatus(res.data.data || null);
    } catch (err: any) {
      toast({
        title: "조회 실패",
        description: err?.message,
        variant: "destructive",
      });
    }
  };

  const recalcSnapshots = async () => {
    if (!token) return;
    setSnapshotRecalcLoading(true);
    try {
      const res = await apiFetch<any>({
        path: `/api/manufacturer/credits/daily-snapshots/recalc`,
        method: "POST",
        token,
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.message || "재계산 실패");
      }
      await loadSnapshotStatus();
      await loadSnapshots();
    } catch (err: any) {
      toast({
        title: "재계산 실패",
        description: err?.message,
        variant: "destructive",
      });
    } finally {
      setSnapshotRecalcLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    loadSnapshotStatus();
  }, [token]);

  const buildLedgerParams = (p: number) => {
    const params = new URLSearchParams({
      page: String(p),
      limit: String(PAGE_SIZE),
    });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const days = periodToDays(period);
    if (days && !from && !to) {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      params.set("from", cutoff.toISOString().slice(0, 10));
    }
    if (q.trim()) params.set("q", q.trim());
    return params.toString();
  };

  const loadLedger = async (p: number, reset: boolean) => {
    if (!token) return;
    setLedgerLoading(true);
    try {
      const res = await apiFetch<any>({
        path: `/api/manufacturer/credits/ledger?${buildLedgerParams(p)}`,
        method: "GET",
        token,
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.message || "조회 실패");
      }
      const fetched: ManufacturerLedgerRow[] = Array.isArray(res.data.data)
        ? res.data.data
        : [];
      setLedgerItems((prev) => (reset ? fetched : [...prev, ...fetched]));
      setLedgerHasMore(fetched.length >= PAGE_SIZE);
      setLedgerPage(p);
    } catch (err: any) {
      toast({
        title: "조회 실패",
        description: err?.message,
        variant: "destructive",
      });
    } finally {
      setLedgerLoading(false);
    }
  };

  const buildSnapshotParams = () => {
    const params = new URLSearchParams({ limit: "60" });
    const days = periodToDays(period);
    if (days && !from && !to) {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      params.set("fromYmd", cutoff.toISOString().slice(0, 10));
    }
    if (from) params.set("fromYmd", from);
    if (to) params.set("toYmd", to);
    return params.toString();
  };

  const loadSnapshots = async () => {
    if (!token) return;
    setSnapLoading(true);
    try {
      const res = await apiFetch<any>({
        path: `/api/manufacturer/credits/daily-snapshots?${buildSnapshotParams()}`,
        method: "GET",
        token,
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.message || "조회 실패");
      }
      const fetched: ManufacturerDailySnapshotRow[] = Array.isArray(
        res.data.data,
      )
        ? res.data.data
        : [];
      setSnapItems(fetched);
    } catch (err: any) {
      toast({
        title: "조회 실패",
        description: err?.message,
        variant: "destructive",
      });
    } finally {
      setSnapLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "payments") {
      setPage(1);
      setHasMore(true);
      loadPayments(1, true);
      return;
    }
    if (tab === "ledger") {
      setLedgerPage(1);
      setLedgerHasMore(true);
      loadLedger(1, true);
      return;
    }
    if (tab === "snapshot") {
      loadSnapshots();
    }
  }, [period, from, to, q, token, tab]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root || !hasMore || loading) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && hasMore && !loading) {
          loadPayments(page + 1, false);
        }
      },
      { root, rootMargin: "200px", threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [hasMore, loading, page]);

  useEffect(() => {
    const sentinel = ledgerSentinelRef.current;
    const root = ledgerScrollRef.current;
    if (!sentinel || !root || !ledgerHasMore || ledgerLoading) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (
          entries.some((e) => e.isIntersecting) &&
          ledgerHasMore &&
          !ledgerLoading
        ) {
          loadLedger(ledgerPage + 1, false);
        }
      },
      { root, rootMargin: "200px", threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [ledgerHasMore, ledgerLoading, ledgerPage]);

  return (
    <DashboardShell
      title="정산 내역"
      subtitle="제조사 정산 스냅샷과 원장, 입금 내역을 확인하세요."
      stats={null}
      mainLeft={
        <div className="space-y-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <div className="flex flex-col gap-2 mb-2">
              <div className="flex flex-wrap items-center gap-2">
                <PeriodFilter value={period} onChange={setPeriod} />
                <TabsList className="h-9">
                  <TabsTrigger value="snapshot">일별 정산</TabsTrigger>
                  <TabsTrigger value="ledger">정산 원장</TabsTrigger>
                  <TabsTrigger value="payments">입금 내역</TabsTrigger>
                </TabsList>

                <Dialog>
                  <DialogTrigger asChild>
                    <Button type="button" variant="outline" className="h-9">
                      정산규칙
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>제조사 정산 규칙</DialogTitle>
                    </DialogHeader>

                    <div className="grid gap-2 text-sm">
                      <div className="flex items-start gap-3 rounded-lg border p-3">
                        <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">
                          01
                        </span>
                        <HandCoins className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="font-medium">CAM 승인 적립</div>
                          <div className="text-muted-foreground">
                            가공 시작 시 제조사 적립 +6,500원 (재제작 포함)
                          </div>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 rounded-lg border p-3">
                        <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">
                          02
                        </span>
                        <ReceiptText className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="font-medium">배송비 적립</div>
                          <div className="text-muted-foreground">
                            발송 패키지 1박스당 +3,500원
                          </div>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 rounded-lg border p-3">
                        <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">
                          03
                        </span>
                        <BookOpenText className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="font-medium">롤백 시 환불</div>
                          <div className="text-muted-foreground">
                            CAM 단계 이후 취소/롤백 시 적립분은 REFUND 처리
                          </div>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 rounded-lg border p-3">
                        <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">
                          04
                        </span>
                        <CalendarClock className="mt-0.5 h-4 w-4 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="font-medium">일별 정산 스냅샷</div>
                          <div className="text-muted-foreground">
                            매일 KST 자정에 전일분으로 자동 생성
                          </div>
                        </div>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

                <Button
                  type="button"
                  variant="outline"
                  className="h-9"
                  disabled={
                    snapshotRecalcLoading ||
                    !snapshotStatus ||
                    snapshotRecalcDisabled
                  }
                  onClick={() => void recalcSnapshots()}
                >
                  스냅샷
                </Button>

                <div className="grow" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-9 w-[150px]"
                />
                <span className="text-xs text-muted-foreground">~</span>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-9 w-[150px]"
                />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="검색 (메모/외부ID)"
                  className="h-9 w-full sm:w-[280px]"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-9"
                  onClick={resetFilters}
                  disabled={anyLoading}
                >
                  초기화
                </Button>
              </div>
            </div>

            <TabsContent value="snapshot" className="mt-0">
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[110px]">일자</TableHead>
                      <TableHead className="w-[120px] text-right">
                        요청
                      </TableHead>
                      <TableHead className="w-[120px] text-right">
                        배송
                      </TableHead>
                      <TableHead className="w-[120px] text-right">
                        환불
                      </TableHead>
                      <TableHead className="w-[120px] text-right">
                        순액
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {snapItems.map((r) => (
                      <TableRow key={r._id}>
                        <TableCell className="text-xs tabular-nums">
                          {r.ymd}
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          ₩{Number(r.earnRequestAmount || 0).toLocaleString()} (
                          {Number(r.earnRequestCount || 0)})
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums">
                          ₩{Number(r.earnShippingAmount || 0).toLocaleString()}{" "}
                          ({Number(r.earnShippingCount || 0)})
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums text-rose-700">
                          ₩{Number(r.refundAmount || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold tabular-nums text-blue-700">
                          ₩{Number(r.netAmount || 0).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                    {snapLoading && (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center text-sm text-muted-foreground py-4"
                        >
                          불러오는 중...
                        </TableCell>
                      </TableRow>
                    )}
                    {!snapLoading && snapItems.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center text-sm text-muted-foreground py-8"
                        >
                          조회 결과가 없습니다.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="ledger" className="mt-0">
              <div
                ref={ledgerScrollRef}
                className="overflow-y-auto overflow-x-auto rounded-md border max-h-[60vh]"
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[160px]">일시</TableHead>
                      <TableHead className="w-[90px]">구분</TableHead>
                      <TableHead className="w-[140px] text-right">
                        금액
                      </TableHead>
                      <TableHead>키</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledgerItems.map((r) => (
                      <TableRow key={r._id}>
                        <TableCell className="text-xs">
                          {formatDate(String(r.occurredAt || r._id))}
                        </TableCell>
                        <TableCell className="text-xs font-medium">
                          {r.type}
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold text-blue-700 tabular-nums">
                          ₩{Number(r.amount || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.uniqueKey}
                        </TableCell>
                      </TableRow>
                    ))}
                    {ledgerLoading && (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="text-center text-sm text-muted-foreground py-4"
                        >
                          불러오는 중...
                        </TableCell>
                      </TableRow>
                    )}
                    {!ledgerLoading && ledgerItems.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="text-center text-sm text-muted-foreground py-8"
                        >
                          조회 결과가 없습니다.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                {ledgerHasMore && !ledgerLoading && (
                  <div ref={ledgerSentinelRef} className="h-8" />
                )}
              </div>
            </TabsContent>

            <TabsContent value="payments" className="mt-0">
              <div
                ref={scrollRef}
                className="overflow-y-auto overflow-x-auto rounded-md border max-h-[60vh]"
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[160px]">일시</TableHead>
                      <TableHead className="w-[80px]">상태</TableHead>
                      <TableHead className="w-[130px] text-right">
                        금액
                      </TableHead>
                      <TableHead>메모</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((r) => (
                      <TableRow key={r._id}>
                        <TableCell className="text-xs">
                          {formatDate(String(r.occurredAt || r._id))}
                        </TableCell>
                        <TableCell
                          className={`text-xs font-medium ${statusColor(r.status)}`}
                        >
                          {statusLabel(r.status)}
                        </TableCell>
                        <TableCell className="text-right text-xs font-semibold text-blue-700 tabular-nums">
                          ₩{Number(r.amount || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {r.note || r.printedContent || r.externalId || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {loading && (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="text-center text-sm text-muted-foreground py-4"
                        >
                          불러오는 중...
                        </TableCell>
                      </TableRow>
                    )}
                    {!loading && items.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="text-center text-sm text-muted-foreground py-8"
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

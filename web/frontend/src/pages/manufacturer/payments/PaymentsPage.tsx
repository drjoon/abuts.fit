import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { toKstYmd } from "@/shared/date/kst";
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

type PaymentItem = {
  _id: string;
  amount: number;
  occurredAt: string;
  status: "CONFIRMED" | "PENDING" | "CANCELLED";
  note?: string;
  externalId?: string;
  printedContent?: string;
};

type ManufacturerDailySnapshotRow = {
  ymd: string;
  earnRequestAmount: number;
  earnRequestCount: number;
  earnRequestPaidAmount?: number;
  earnRequestPaidCount?: number;
  earnRequestFreeAmount?: number;
  earnRequestFreeCount?: number;
  earnShippingAmount: number;
  earnShippingCount: number;
  earnShippingPaidAmount?: number;
  earnShippingPaidCount?: number;
  earnShippingFreeAmount?: number;
  earnShippingFreeCount?: number;
  refundAmount: number;
  payoutAmount: number;
  adjustAmount: number;
  netAmount: number;
};

const PAGE_SIZE = 50;

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

  const [tab, setTab] = useState<"snapshot" | "payments">("snapshot");

  const [period, setPeriod] = useState<PeriodFilterValue>("30d");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [requestSettlementFilter, setRequestSettlementFilter] = useState<
    "all" | "paid" | "free"
  >("all");

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<PaymentItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalAmount, setTotalAmount] = useState(0);

  const [snapLoading, setSnapLoading] = useState(false);
  const [snapItems, setSnapItems] = useState<ManufacturerDailySnapshotRow[]>(
    [],
  );
  const anyLoading = loading || snapLoading;

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  if (!user || user.role !== "manufacturer") return null;

  const resetFilters = () => {
    setPeriod("30d");
    setFrom("");
    setTo("");
    setQ("");
    setRequestSettlementFilter("all");
  };

  const buildQueryParams = (p: number) => {
    const params = new URLSearchParams({
      page: String(p),
      limit: String(PAGE_SIZE),
    });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const days = periodToDays(period);
    if (days && !from && !to) {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      params.set("from", toKstYmd(cutoff) || "");
    }
    if (q.trim()) params.set("q", q.trim());

    return params.toString();
  };

  const loadPayments = async (p: number, reset: boolean) => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiFetch<any>({
        path: `/api/manufacturer/payments?${buildQueryParams(p)}`,
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

  const buildSnapshotParams = () => {
    const params = new URLSearchParams({ limit: "60" });
    const days = periodToDays(period);
    if (days && !from && !to) {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      params.set("fromYmd", toKstYmd(cutoff) || "");
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
        path: `/api/manufacturer/credits/daily-summary?${buildSnapshotParams()}`,
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

  return (
    <DashboardShell
      title="정산 내역"
      subtitle="일별 정산 집계와 입금 내역을 확인하세요."
      stats={null}
      mainLeft={
        <div className="space-y-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <div className="flex flex-col gap-2 mb-2">
              <div className="flex flex-wrap items-center gap-2">
                <PeriodFilter value={period} onChange={setPeriod} />
                <TabsList className="h-9">
                  <TabsTrigger value="snapshot">일별 정산</TabsTrigger>
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
                            유료 의뢰비 기준 제조사 분배율 적용 (기본 60%,
                            영업자 미연결 시 65%) + VAT 10%
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
                          <div className="font-medium">일별 정산 집계</div>
                          <div className="text-muted-foreground">
                            원장 기준 KST 일자별 실시간 집계
                          </div>
                        </div>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>

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
                  placeholder="검색 (메모/외부ID/키)"
                  className="h-9 w-full sm:w-[280px]"
                />
                <div className="inline-flex items-center rounded-md border bg-background p-0.5">
                  <Button
                    type="button"
                    size="sm"
                    variant={
                      requestSettlementFilter === "all" ? "default" : "ghost"
                    }
                    className="h-7 px-2"
                    onClick={() => setRequestSettlementFilter("all")}
                    disabled={anyLoading}
                  >
                    전체
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={
                      requestSettlementFilter === "paid" ? "default" : "ghost"
                    }
                    className="h-7 px-2"
                    onClick={() => setRequestSettlementFilter("paid")}
                    disabled={anyLoading}
                  >
                    유료(의뢰+배송)
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={
                      requestSettlementFilter === "free" ? "default" : "ghost"
                    }
                    className="h-7 px-2"
                    onClick={() => setRequestSettlementFilter("free")}
                    disabled={anyLoading}
                  >
                    무료(의뢰+배송)
                  </Button>
                </div>
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
                      <TableHead className="w-[90px]">타입</TableHead>
                      <TableHead className="w-[150px] text-right">
                        의뢰
                      </TableHead>
                      <TableHead className="w-[150px] text-right">
                        배송
                      </TableHead>
                      <TableHead className="w-[120px] text-right">
                        환불
                      </TableHead>
                      <TableHead className="w-[120px] text-right">
                        지급
                      </TableHead>
                      <TableHead className="w-[120px] text-right">
                        순액
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {snapItems.map((r) => {
                      const paidAmount = Number(
                        r.earnRequestPaidAmount ?? r.earnRequestAmount ?? 0,
                      );
                      const paidCount = Number(
                        r.earnRequestPaidCount ?? r.earnRequestCount ?? 0,
                      );
                      const freeCount = Number(r.earnRequestFreeCount ?? 0);

                      const shippingPaidAmount = Number(
                        r.earnShippingPaidAmount ?? r.earnShippingAmount ?? 0,
                      );
                      const shippingPaidCount = Number(
                        r.earnShippingPaidCount ?? r.earnShippingCount ?? 0,
                      );
                      const shippingFreeAmount = Number(
                        r.earnShippingFreeAmount ?? 0,
                      );
                      const shippingFreeCount = Number(
                        r.earnShippingFreeCount ?? 0,
                      );

                      let typeText = "전체";
                      let requestText = `유료 ₩${paidAmount.toLocaleString()} (${paidCount}) / 무료 ₩0 (${freeCount})`;
                      let shippingText = `유료 ₩${shippingPaidAmount.toLocaleString()} (${shippingPaidCount}) / 무료 ₩${shippingFreeAmount.toLocaleString()} (${shippingFreeCount})`;
                      let refundText =
                        Number(r.refundAmount || 0) !== 0
                          ? `₩${Number(r.refundAmount).toLocaleString()}`
                          : "-";
                      let payoutText =
                        Number(r.payoutAmount || 0) !== 0
                          ? `₩${Number(r.payoutAmount).toLocaleString()}`
                          : "-";
                      let netText = `₩${Number(r.netAmount || 0).toLocaleString()}`;

                      if (requestSettlementFilter === "paid") {
                        typeText = "유료";
                        requestText = `₩${paidAmount.toLocaleString()} (${paidCount})`;
                        shippingText = `₩${shippingPaidAmount.toLocaleString()} (${shippingPaidCount})`;
                      }

                      if (requestSettlementFilter === "free") {
                        typeText = "무료";
                        requestText = `₩0 (${freeCount})`;
                        shippingText = `₩${shippingFreeAmount.toLocaleString()} (${shippingFreeCount})`;
                        refundText = "-";
                        payoutText = "-";
                        netText = "-";
                      }

                      return (
                        <TableRow key={r.ymd}>
                          <TableCell className="text-xs tabular-nums">
                            {r.ymd}
                          </TableCell>
                          <TableCell className="text-xs">{typeText}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">
                            {requestText}
                          </TableCell>
                          <TableCell className="text-right text-xs tabular-nums">
                            {shippingText}
                          </TableCell>
                          <TableCell className="text-right text-xs tabular-nums text-rose-700">
                            {refundText}
                          </TableCell>
                          <TableCell className="text-right text-xs tabular-nums text-rose-700">
                            {payoutText}
                          </TableCell>
                          <TableCell className="text-right text-xs font-semibold tabular-nums text-blue-700">
                            {netText}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {snapLoading && (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="text-center text-sm text-muted-foreground py-4"
                        >
                          불러오는 중...
                        </TableCell>
                      </TableRow>
                    )}
                    {!snapLoading && snapItems.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={7}
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
                          {formatDate(String(r.occurredAt || ""))}
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

export default ManufacturerPaymentPage;

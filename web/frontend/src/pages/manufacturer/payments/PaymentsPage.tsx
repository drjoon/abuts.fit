// related files:
// - web/frontend/rules.md
// - web/backend/controllers/manufacturers/manufacturer.controller.js
// - web/backend/modules/manufacturers/manufacturer.routes.js
// - web/frontend/src/shared/date/kst.ts
import { useCallback, useEffect, useRef, useState } from "react";
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
  refundAmount: number; // legacy 표시 호환(정책상 신규 REFUND 적재 금지, 일반적으로 0)
  payoutAmount: number;
  adjustAmount: number;
  netAmount: number;
};

type SnapshotValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

type ApiEnvelope<T> = {
  success?: boolean;
  message?: string;
  data?: T;
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

const validateSnapshotRow = (
  r: ManufacturerDailySnapshotRow,
): SnapshotValidationResult => {
  const paidAmountRaw = r.earnRequestPaidAmount;
  const paidCountRaw = r.earnRequestPaidCount;
  const freeAmountRaw = r.earnRequestFreeAmount;
  const freeCountRaw = r.earnRequestFreeCount;
  const shippingPaidAmountRaw = r.earnShippingPaidAmount;
  const shippingPaidCountRaw = r.earnShippingPaidCount;
  const shippingFreeAmountRaw = r.earnShippingFreeAmount;
  const shippingFreeCountRaw = r.earnShippingFreeCount;

  if (
    paidAmountRaw === undefined ||
    paidCountRaw === undefined ||
    freeAmountRaw === undefined ||
    freeCountRaw === undefined ||
    shippingPaidAmountRaw === undefined ||
    shippingPaidCountRaw === undefined ||
    shippingFreeAmountRaw === undefined ||
    shippingFreeCountRaw === undefined
  ) {
    return { valid: false, reason: "필수 정산 분해 필드 누락" };
  }

  const paidAmount = Number(paidAmountRaw || 0);
  const paidCount = Number(paidCountRaw || 0);
  const freeAmount = Number(freeAmountRaw || 0);
  const freeCount = Number(freeCountRaw || 0);
  const requestTotalAmount = Number(r.earnRequestAmount || 0);
  const requestTotalCount = Number(r.earnRequestCount || 0);

  const shippingPaidAmount = Number(shippingPaidAmountRaw || 0);
  const shippingPaidCount = Number(shippingPaidCountRaw || 0);
  const shippingFreeAmount = Number(shippingFreeAmountRaw || 0);
  const shippingFreeCount = Number(shippingFreeCountRaw || 0);
  const shippingTotalAmount = Number(r.earnShippingAmount || 0);
  const shippingTotalCount = Number(r.earnShippingCount || 0);

  const refundAmount = Number(r.refundAmount || 0);
  const payoutAmount = Number(r.payoutAmount || 0);
  const adjustAmount = Number(r.adjustAmount || 0);
  const netAmount = Number(r.netAmount || 0);

  const numericValues = [
    paidAmount,
    paidCount,
    freeAmount,
    freeCount,
    requestTotalAmount,
    requestTotalCount,
    shippingPaidAmount,
    shippingPaidCount,
    shippingFreeAmount,
    shippingFreeCount,
    shippingTotalAmount,
    shippingTotalCount,
    refundAmount,
    payoutAmount,
    adjustAmount,
    netAmount,
  ];
  if (numericValues.some((v) => !Number.isFinite(v))) {
    return { valid: false, reason: "비정상 숫자 필드 존재" };
  }

  if (
    paidAmount < 0 ||
    paidCount < 0 ||
    freeCount < 0 ||
    freeAmount < 0 ||
    shippingPaidAmount < 0 ||
    shippingPaidCount < 0 ||
    shippingFreeAmount < 0 ||
    shippingFreeCount < 0
  ) {
    return { valid: false, reason: "음수 분해값 존재" };
  }

  // 정책: 화면 총액/총건수는 paid 분해값만 반영한다.
  if (requestTotalAmount !== paidAmount) {
    return { valid: false, reason: "의뢰 총금액이 paid 분해값과 불일치" };
  }
  if (requestTotalCount !== paidCount) {
    return { valid: false, reason: "의뢰 총건수가 paid 분해값과 불일치" };
  }
  if (shippingTotalAmount !== shippingPaidAmount) {
    return { valid: false, reason: "배송 총금액이 paid 분해값과 불일치" };
  }
  if (shippingTotalCount !== shippingPaidCount) {
    return { valid: false, reason: "배송 총건수가 paid 분해값과 불일치" };
  }

  const expectedNet =
    requestTotalAmount + shippingTotalAmount + refundAmount + payoutAmount + adjustAmount;
  if (expectedNet !== netAmount) {
    return { valid: false, reason: "순액 계산값 불일치" };
  }

  return { valid: true };
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
  const [snapshotAnomalyMessage, setSnapshotAnomalyMessage] = useState("");
  const anyLoading = loading || snapLoading;

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const isManufacturer = Boolean(user && user.role === "manufacturer");

  const resetFilters = () => {
    setPeriod("30d");
    setFrom("");
    setTo("");
    setQ("");
    setRequestSettlementFilter("all");
  };

  const buildQueryParams = useCallback(
    (p: number) => {
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
    },
    [from, to, period, q],
  );

  const loadPayments = useCallback(
    async (p: number, reset: boolean) => {
      if (!token) return;
      setLoading(true);
      try {
        const res = await apiFetch<ApiEnvelope<PaymentItem[]>>({
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
    const days = periodToDays(period);
    if (days && !from && !to) {
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      params.set("fromYmd", toKstYmd(cutoff) || "");
    }
    if (from) params.set("fromYmd", from);
    if (to) params.set("toYmd", to);
    return params.toString();
  }, [period, from, to]);

  const loadSnapshots = useCallback(async () => {
    if (!token) return;
    setSnapLoading(true);
    try {
      const res = await apiFetch<ApiEnvelope<ManufacturerDailySnapshotRow[]>>({
        path: `/api/manufacturer/credits/daily-summary?${buildSnapshotParams()}`,
        method: "GET",
        token,
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.message || "조회 실패");
      }
      const fetched: ManufacturerDailySnapshotRow[] = Array.isArray(res.data.data)
        ? res.data.data
        : [];

      const invalidRows = fetched
        .map((row) => ({ row, validation: validateSnapshotRow(row) }))
        .filter((it) => !it.validation.valid);

      if (invalidRows.length > 0) {
        const first = invalidRows[0];
        let reason = "원인 불명";
        if ("reason" in first.validation) {
          reason = first.validation.reason;
        }
        const msg = `정산 데이터 이상 ${invalidRows.length}건 (${first.row.ymd}: ${reason})`;
        setSnapshotAnomalyMessage(msg);
        toast({
          title: "정산 데이터 이상 감지",
          description: msg,
          variant: "destructive",
        });
      } else {
        setSnapshotAnomalyMessage("");
      }

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
    if (!isManufacturer) return;
    if (tab === "payments") {
      setPage(1);
      setHasMore(true);
      void loadPayments(1, true);
      return;
    }
    if (tab === "snapshot") {
      void loadSnapshots();
    }
  }, [isManufacturer, tab, period, from, to, q, loadPayments, loadSnapshots]);

  useEffect(() => {
    if (!isManufacturer) return;
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root || !hasMore || loading || tab !== "payments") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && hasMore && !loading) {
          void loadPayments(page + 1, false);
        }
      },
      { root, rootMargin: "200px", threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [isManufacturer, hasMore, loading, page, tab, loadPayments]);

  const handleTabChange = (v: string) => {
    if (v === "snapshot" || v === "payments") {
      setTab(v);
    }
  };

  if (!isManufacturer) return null;

  return (
    <DashboardShell
      title="정산 내역"
      subtitle="일별 정산 집계와 입금 내역을 확인하세요."
      stats={null}
      mainLeft={
        <div className="space-y-4">
          <Tabs value={tab} onValueChange={handleTabChange}>
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
                            가공·포장 롤백 시 기존 소비/적립 커밋 내역은 삭제형 롤백으로 정리
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
              {snapshotAnomalyMessage ? (
                <div className="mb-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {snapshotAnomalyMessage}
                </div>
              ) : null}
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
                        조정
                      </TableHead>
                      <TableHead className="w-[120px] text-right">
                        순액
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {snapItems.map((r) => {
                      const paidAmount = Number(r.earnRequestPaidAmount ?? 0);
                      const paidCount = Number(r.earnRequestPaidCount ?? 0);
                      const freeAmount = Number(r.earnRequestFreeAmount ?? 0);
                      const freeCount = Number(r.earnRequestFreeCount ?? 0);

                      const shippingPaidAmount = Number(
                        r.earnShippingPaidAmount ?? 0,
                      );
                      const shippingPaidCount = Number(
                        r.earnShippingPaidCount ?? 0,
                      );
                      const shippingFreeAmount = Number(
                        r.earnShippingFreeAmount ?? 0,
                      );
                      const shippingFreeCount = Number(
                        r.earnShippingFreeCount ?? 0,
                      );

                      let typeText = "전체";
                      let requestText = `유료 ₩${paidAmount.toLocaleString()} (${paidCount}) / 무료 ₩${freeAmount.toLocaleString()} (${freeCount})`;
                      let shippingText = `유료 ₩${shippingPaidAmount.toLocaleString()} (${shippingPaidCount}) / 무료 ₩${shippingFreeAmount.toLocaleString()} (${shippingFreeCount})`;
                      // 정책상 롤백은 REFUND가 아니라 COMMIT 삭제이므로 refundAmount는 보통 0이다.
                      // 기존 스냅샷 스키마/컬럼 호환을 위해 표시만 유지한다.
                      let refundText =
                        Number(r.refundAmount || 0) !== 0
                          ? `₩${Number(r.refundAmount).toLocaleString()}`
                          : "-";
                      let payoutText =
                        Number(r.payoutAmount || 0) !== 0
                          ? `₩${Number(r.payoutAmount).toLocaleString()}`
                          : "-";
                      let adjustText =
                        Number(r.adjustAmount || 0) !== 0
                          ? `₩${Number(r.adjustAmount).toLocaleString()}`
                          : "-";
                      let netText = `₩${Number(r.netAmount || 0).toLocaleString()}`;

                      if (requestSettlementFilter === "paid") {
                        typeText = "유료";
                        requestText = `₩${paidAmount.toLocaleString()} (${paidCount})`;
                        shippingText = `₩${shippingPaidAmount.toLocaleString()} (${shippingPaidCount})`;
                      }

                      if (requestSettlementFilter === "free") {
                        typeText = "무료";
                        requestText = `₩${freeAmount.toLocaleString()} (${freeCount})`;
                        shippingText = `₩${shippingFreeAmount.toLocaleString()} (${shippingFreeCount})`;
                        refundText = "-";
                        payoutText = "-";
                        adjustText = "-";
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
                          <TableCell className="text-right text-xs tabular-nums text-amber-700">
                            {adjustText}
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
                          colSpan={8}
                          className="text-center text-sm text-muted-foreground py-4"
                        >
                          불러오는 중...
                        </TableCell>
                      </TableRow>
                    )}
                    {!snapLoading && snapItems.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={8}
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

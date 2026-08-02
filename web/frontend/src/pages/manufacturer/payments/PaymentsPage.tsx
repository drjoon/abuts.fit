// related files:
// - web/frontend/rules.md
// - web/backend/controllers/manufacturers/manufacturer.controller.js
// - web/backend/modules/manufacturers/manufacturer.routes.js
// - web/frontend/src/shared/date/kst.ts
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { toKstYmd } from "@/shared/date/kst";
import { periodToRange } from "@/store/usePeriodStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import { isPeriodFilterValue } from "@/shared/ui/periodFilterValues";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
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
  netPaidAmount?: number;
  netFreeRequestAmount?: number;
  netFreeShippingAmount?: number;
  netFreeAmount?: number;
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

type SortDirection = "asc" | "desc";
type SnapshotSortKey =
  | "ymd"
  | "request"
  | "shipping"
  | "deduction"
  | "paidNet"
  | "freeNet";
type PaymentSortKey = "occurredAt" | "status" | "amount" | "note";

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

const PERIOD_STORAGE_KEY = "abuts.manufacturer.payments.period";

const readStoredPeriod = (): PeriodFilterValue => {
  if (typeof window === "undefined") return "30d";
  const raw = window.localStorage.getItem(PERIOD_STORAGE_KEY);
  return isPeriodFilterValue(raw) ? raw : "30d";
};

const periodToYmdRange = (period: PeriodFilterValue): { from: string; to: string } | null => {
  const range = periodToRange(period);
  if (!range) return null;
  const from = toKstYmd(new Date(range.startDate));
  const to = toKstYmd(new Date(range.endDate));
  if (!from || !to) return null;
  return { from, to };
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
  const netPaidAmountRaw = r.netPaidAmount;
  const netFreeRequestAmountRaw = r.netFreeRequestAmount;
  const netFreeShippingAmountRaw = r.netFreeShippingAmount;
  const netFreeAmountRaw = r.netFreeAmount;

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
    netPaidAmountRaw === undefined ? 0 : Number(netPaidAmountRaw || 0),
    netFreeRequestAmountRaw === undefined ? 0 : Number(netFreeRequestAmountRaw || 0),
    netFreeShippingAmountRaw === undefined ? 0 : Number(netFreeShippingAmountRaw || 0),
    netFreeAmountRaw === undefined ? 0 : Number(netFreeAmountRaw || 0),
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
    return { valid: false, reason: "유료 순액 계산값 불일치" };
  }

  if (netPaidAmountRaw !== undefined && Number(netPaidAmountRaw || 0) !== expectedNet) {
    return { valid: false, reason: "netPaidAmount 불일치" };
  }

  const expectedFreeRequest = freeAmount;
  const expectedFreeShipping = shippingFreeAmount;
  const expectedFreeTotal = expectedFreeRequest + expectedFreeShipping;

  if (
    netFreeRequestAmountRaw !== undefined &&
    Number(netFreeRequestAmountRaw || 0) !== expectedFreeRequest
  ) {
    return { valid: false, reason: "netFreeRequestAmount 불일치" };
  }
  if (
    netFreeShippingAmountRaw !== undefined &&
    Number(netFreeShippingAmountRaw || 0) !== expectedFreeShipping
  ) {
    return { valid: false, reason: "netFreeShippingAmount 불일치" };
  }
  if (netFreeAmountRaw !== undefined && Number(netFreeAmountRaw || 0) !== expectedFreeTotal) {
    return { valid: false, reason: "netFreeAmount 불일치" };
  }

  return { valid: true };
};

export const ManufacturerPaymentPage = () => {
  const { token, user } = useAuthStore();
  const { toast } = useToast();

  const [tab, setTab] = useState<"snapshot" | "payments">("snapshot");

  const [period, setPeriod] = useState<PeriodFilterValue>(() => readStoredPeriod());
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [requestSettlementFilter, setRequestSettlementFilter] = useState<
    "all" | "paid" | "free"
  >("all");
  const [snapshotSort, setSnapshotSort] = useState<{
    key: SnapshotSortKey;
    direction: SortDirection;
  }>({ key: "ymd", direction: "desc" });
  const [paymentSort, setPaymentSort] = useState<{
    key: PaymentSortKey;
    direction: SortDirection;
  }>({ key: "occurredAt", direction: "desc" });

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
      if (!from && !to) {
        const range = periodToYmdRange(period);
        if (range) {
          params.set("from", range.from);
          params.set("to", range.to);
        }
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
    if (from) params.set("fromYmd", from);
    if (to) params.set("toYmd", to);
    if (!from && !to) {
      const range = periodToYmdRange(period);
      if (range) {
        params.set("fromYmd", range.from);
        params.set("toYmd", range.to);
      }
    }
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
    if (typeof window !== "undefined") {
      window.localStorage.setItem(PERIOD_STORAGE_KEY, period);
    }
  }, [period]);

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

  const snapshotTotals = useMemo(() => {
    let paidUnsettledTotal = 0;
    let freeRequestTotal = 0;
    let freeShippingTotal = 0;
    let payoutTotal = 0;

    for (const row of snapItems) {
      paidUnsettledTotal += Number(row.netPaidAmount ?? row.netAmount ?? 0);
      freeRequestTotal += Number(
        row.netFreeRequestAmount ?? row.earnRequestFreeAmount ?? 0,
      );
      freeShippingTotal += Number(
        row.netFreeShippingAmount ?? row.earnShippingFreeAmount ?? 0,
      );
      payoutTotal += Number(row.payoutAmount || 0);
    }

    const freeUnsettledTotal = freeRequestTotal + freeShippingTotal;

    return {
      paidUnsettledTotal,
      freeRequestTotal,
      freeShippingTotal,
      freeUnsettledTotal,
      payoutTotal,
    };
  }, [snapItems]);

  const toggleSnapshotSort = (key: SnapshotSortKey) => {
    setSnapshotSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "ymd" ? "desc" : "asc" },
    );
  };

  const togglePaymentSort = (key: PaymentSortKey) => {
    setPaymentSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "occurredAt" ? "desc" : "asc" },
    );
  };

  const sortedSnapItems = useMemo(() => {
    const requestValueOf = (r: ManufacturerDailySnapshotRow) => {
      const paid = Number(r.earnRequestPaidAmount ?? 0);
      const free = Number(r.earnRequestFreeAmount ?? 0);
      if (requestSettlementFilter === "paid") return paid;
      if (requestSettlementFilter === "free") return free;
      return paid + free;
    };
    const shippingValueOf = (r: ManufacturerDailySnapshotRow) => {
      const paid = Number(r.earnShippingPaidAmount ?? 0);
      const free = Number(r.earnShippingFreeAmount ?? 0);
      if (requestSettlementFilter === "paid") return paid;
      if (requestSettlementFilter === "free") return free;
      return paid + free;
    };
    const deductionValueOf = (r: ManufacturerDailySnapshotRow) =>
      Number(r.refundAmount || 0) +
      Number(r.payoutAmount || 0) +
      Number(r.adjustAmount || 0);
    const paidNetValueOf = (r: ManufacturerDailySnapshotRow) =>
      Number(r.netPaidAmount ?? r.netAmount ?? 0);
    const freeNetValueOf = (r: ManufacturerDailySnapshotRow) =>
      Number(r.netFreeAmount ?? 0) ||
      Number(r.earnRequestFreeAmount ?? 0) + Number(r.earnShippingFreeAmount ?? 0);

    const sorted = [...snapItems].sort((a, b) => {
      let av = 0;
      let bv = 0;
      if (snapshotSort.key === "ymd") {
        av = String(a.ymd || "").localeCompare(String(b.ymd || ""));
        return snapshotSort.direction === "asc" ? av : -av;
      }
      if (snapshotSort.key === "request") {
        av = requestValueOf(a);
        bv = requestValueOf(b);
      } else if (snapshotSort.key === "shipping") {
        av = shippingValueOf(a);
        bv = shippingValueOf(b);
      } else if (snapshotSort.key === "deduction") {
        av = deductionValueOf(a);
        bv = deductionValueOf(b);
      } else if (snapshotSort.key === "paidNet") {
        av = paidNetValueOf(a);
        bv = paidNetValueOf(b);
      } else {
        av = freeNetValueOf(a);
        bv = freeNetValueOf(b);
      }
      return snapshotSort.direction === "asc" ? av - bv : bv - av;
    });
    return sorted;
  }, [snapItems, requestSettlementFilter, snapshotSort]);

  const sortedPaymentItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (paymentSort.key === "occurredAt") {
        const av = new Date(a.occurredAt || 0).getTime();
        const bv = new Date(b.occurredAt || 0).getTime();
        return paymentSort.direction === "asc" ? av - bv : bv - av;
      }
      if (paymentSort.key === "status") {
        const av = String(a.status || "");
        const bv = String(b.status || "");
        return paymentSort.direction === "asc"
          ? av.localeCompare(bv, "ko")
          : bv.localeCompare(av, "ko");
      }
      if (paymentSort.key === "amount") {
        const av = Number(a.amount || 0);
        const bv = Number(b.amount || 0);
        return paymentSort.direction === "asc" ? av - bv : bv - av;
      }
      const av = String(a.note || a.printedContent || a.externalId || "");
      const bv = String(b.note || b.printedContent || b.externalId || "");
      return paymentSort.direction === "asc"
        ? av.localeCompare(bv, "ko")
        : bv.localeCompare(av, "ko");
    });
  }, [items, paymentSort]);

  const renderSortIcon = (active: boolean, direction: SortDirection) => {
    if (!active) return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />;
    return direction === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 text-foreground" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 text-foreground" />
    );
  };

  if (!isManufacturer) return null;

  return (
    <DashboardShell
      title="정산 내역"
      subtitle="일별 정산 집계와 입금 내역을 확인하세요."
      statsGridClassName="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
      stats={
        <>
          <Card className="min-h-[116px]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground break-keep">
                유료 미정산액 합계
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-xl md:text-2xl font-semibold text-blue-700 tabular-nums">
                ₩{snapshotTotals.paidUnsettledTotal.toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card className="min-h-[116px]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground break-keep">
                무료 미정산액 합계
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-xl md:text-2xl font-semibold text-violet-700 tabular-nums leading-tight">
                ₩{snapshotTotals.freeUnsettledTotal.toLocaleString()}
              </div>
              <div className="mt-1 text-xs text-muted-foreground tabular-nums leading-tight">
                의뢰 ₩{snapshotTotals.freeRequestTotal.toLocaleString()} / 배송 ₩{snapshotTotals.freeShippingTotal.toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card className="min-h-[116px]">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground break-keep">
                지급 합계
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-lg sm:text-xl md:text-2xl font-semibold tabular-nums">
                ₩{snapshotTotals.payoutTotal.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </>
      }
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
                      <TableHead className="w-[110px] text-center">
                        <button
                          type="button"
                          className="mx-auto inline-flex items-center gap-1 whitespace-nowrap text-xs sm:text-sm"
                          onClick={() => toggleSnapshotSort("ymd")}
                        >
                          일자
                          {renderSortIcon(snapshotSort.key === "ymd", snapshotSort.direction)}
                        </button>
                      </TableHead>

                      <TableHead className="min-w-[200px] text-center">
                        <button
                          type="button"
                          className="mx-auto inline-flex items-center gap-1 whitespace-nowrap text-xs sm:text-sm"
                          onClick={() => toggleSnapshotSort("request")}
                        >
                          의뢰
                          {renderSortIcon(snapshotSort.key === "request", snapshotSort.direction)}
                        </button>
                      </TableHead>
                      <TableHead className="min-w-[200px] text-center">
                        <button
                          type="button"
                          className="mx-auto inline-flex items-center gap-1 whitespace-nowrap text-xs sm:text-sm"
                          onClick={() => toggleSnapshotSort("shipping")}
                        >
                          배송
                          {renderSortIcon(snapshotSort.key === "shipping", snapshotSort.direction)}
                        </button>
                      </TableHead>
                      <TableHead className="min-w-[120px] text-center">
                        <button
                          type="button"
                          className="mx-auto inline-flex items-center gap-1 whitespace-nowrap text-xs sm:text-sm"
                          onClick={() => toggleSnapshotSort("deduction")}
                        >
                          차감
                          {renderSortIcon(snapshotSort.key === "deduction", snapshotSort.direction)}
                        </button>
                      </TableHead>
                      <TableHead className="w-[130px] text-center">
                        <button
                          type="button"
                          className="mx-auto inline-flex items-center gap-1 whitespace-nowrap text-xs sm:text-sm"
                          onClick={() => toggleSnapshotSort("paidNet")}
                        >
                          유료 순액
                          {renderSortIcon(snapshotSort.key === "paidNet", snapshotSort.direction)}
                        </button>
                      </TableHead>
                      <TableHead className="min-w-[170px] text-center">
                        <button
                          type="button"
                          className="mx-auto inline-flex items-center gap-1 whitespace-nowrap text-xs sm:text-sm"
                          onClick={() => toggleSnapshotSort("freeNet")}
                        >
                          무료순액
                          {renderSortIcon(snapshotSort.key === "freeNet", snapshotSort.direction)}
                        </button>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedSnapItems.map((r) => {
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

                      let requestText = `유료₩${paidAmount.toLocaleString()}(${paidCount}) / 무료₩${freeAmount.toLocaleString()}(${freeCount})`;
                      let shippingText = `유료₩${shippingPaidAmount.toLocaleString()}(${shippingPaidCount}) / 무료₩${shippingFreeAmount.toLocaleString()}(${shippingFreeCount})`;
                      // 정책상 롤백은 REFUND가 아니라 COMMIT 삭제이므로 refundAmount는 보통 0이다.
                      // 기존 스냅샷 스키마/컬럼 호환을 위해 표시만 유지한다.
                      const deductionParts: string[] = [];
                      const refundAmount = Number(r.refundAmount || 0);
                      const payoutAmount = Number(r.payoutAmount || 0);
                      const adjustAmount = Number(r.adjustAmount || 0);
                      if (refundAmount !== 0) deductionParts.push(`환불 ₩${refundAmount.toLocaleString()}`);
                      if (payoutAmount !== 0) deductionParts.push(`지급 ₩${payoutAmount.toLocaleString()}`);
                      if (adjustAmount !== 0) deductionParts.push(`조정 ₩${adjustAmount.toLocaleString()}`);
                      let deductionText = deductionParts.length ? deductionParts.join(" / ") : "-";
                      const paidNetValue = Number(
                        (r.netPaidAmount ?? r.netAmount ?? 0),
                      );
                      let paidNetText = `₩${paidNetValue.toLocaleString()}`;
                      let freeNetText = `의뢰₩${freeAmount.toLocaleString()} / 배송₩${shippingFreeAmount.toLocaleString()}`;

                      if (requestSettlementFilter === "paid") {
                        requestText = `₩${paidAmount.toLocaleString()}(${paidCount})`;
                        shippingText = `₩${shippingPaidAmount.toLocaleString()}(${shippingPaidCount})`;
                        freeNetText = "-";
                      }

                      if (requestSettlementFilter === "free") {
                        requestText = `₩${freeAmount.toLocaleString()}(${freeCount})`;
                        shippingText = `₩${shippingFreeAmount.toLocaleString()}(${shippingFreeCount})`;
                        deductionText = "-";
                        paidNetText = "-";
                      }

                      return (
                        <TableRow key={r.ymd}>
                          <TableCell className="text-center text-xs tabular-nums whitespace-nowrap">
                            {r.ymd}
                          </TableCell>

                          <TableCell className="text-center text-[11px] tabular-nums whitespace-nowrap">
                            {requestText}
                          </TableCell>
                          <TableCell className="text-center text-[11px] tabular-nums whitespace-nowrap">
                            {shippingText}
                          </TableCell>
                          <TableCell className="text-center text-[11px] tabular-nums text-amber-700 whitespace-nowrap">
                            {deductionText}
                          </TableCell>
                          <TableCell className="text-center text-xs font-semibold tabular-nums text-blue-700 whitespace-nowrap">
                            {paidNetText}
                          </TableCell>
                          <TableCell className="text-center text-[11px] tabular-nums text-violet-700 whitespace-nowrap">
                            {freeNetText}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {snapLoading && (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="text-center text-sm text-muted-foreground py-4"
                        >
                          불러오는 중...
                        </TableCell>
                      </TableRow>
                    )}
                    {!snapLoading && snapItems.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={6}
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
                      <TableHead className="w-[190px] text-center">
                        <button
                          type="button"
                          className="mx-auto inline-flex items-center gap-1 text-xs sm:text-sm"
                          onClick={() => togglePaymentSort("occurredAt")}
                        >
                          일시
                          {renderSortIcon(paymentSort.key === "occurredAt", paymentSort.direction)}
                        </button>
                      </TableHead>
                      <TableHead className="w-[100px] text-center">
                        <button
                          type="button"
                          className="mx-auto inline-flex items-center gap-1 text-xs sm:text-sm"
                          onClick={() => togglePaymentSort("status")}
                        >
                          상태
                          {renderSortIcon(paymentSort.key === "status", paymentSort.direction)}
                        </button>
                      </TableHead>
                      <TableHead className="w-[140px] text-center">
                        <button
                          type="button"
                          className="mx-auto inline-flex items-center gap-1 text-xs sm:text-sm"
                          onClick={() => togglePaymentSort("amount")}
                        >
                          금액
                          {renderSortIcon(paymentSort.key === "amount", paymentSort.direction)}
                        </button>
                      </TableHead>
                      <TableHead className="min-w-[260px] text-center">
                        <button
                          type="button"
                          className="mx-auto inline-flex items-center gap-1 text-xs sm:text-sm"
                          onClick={() => togglePaymentSort("note")}
                        >
                          메모
                          {renderSortIcon(paymentSort.key === "note", paymentSort.direction)}
                        </button>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedPaymentItems.map((r) => (
                      <TableRow key={r._id}>
                        <TableCell className="text-center text-xs whitespace-nowrap">
                          {formatDate(String(r.occurredAt || ""))}
                        </TableCell>
                        <TableCell
                          className={`text-center text-xs font-medium whitespace-nowrap ${statusColor(r.status)}`}
                        >
                          {statusLabel(r.status)}
                        </TableCell>
                        <TableCell className="text-center text-xs font-semibold text-blue-700 tabular-nums whitespace-nowrap">
                          ₩{Number(r.amount || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground">
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

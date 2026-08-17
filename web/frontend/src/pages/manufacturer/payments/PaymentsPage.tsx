// related files:
// - web/frontend/rules.md
// - web/backend/controllers/manufacturers/manufacturer.controller.js
// - web/backend/modules/manufacturers/manufacturer.routes.js
// - web/frontend/src/shared/date/kst.ts
// - web/frontend/src/features/settings/tabs/LabSettlementPayoutTab.tsx
// change-log:
// - 2026-08-17: 정산 내역을 의뢰자 크레딧과 같은 거래 원장으로 표시. VAT는 지급 안내 한 줄.
// - 2026-08-11: 기공소 기공크레딧 정산과 동일 UX — 요약 카드 축소·(N건), 일자 제거, 액션 세로열, 초기화 제거.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/shared/api/apiClient";
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
  CalendarClock,
  HandCoins,
  ReceiptText,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/shared/ui/cn";
import {
  SETTLEMENT_TAXABLE_INVOICE_LABEL,
  SETTLEMENT_VAT_PAYOUT_NOTICE,
  SETTLEMENT_VAT_POLICY,
  formatWon,
} from "@/shared/settlement/affiliateVat";
import {
  SettlementFilterChip,
  SettlementPolicyDialog,
  SettlementPolicySection,
  SettlementSortIcon,
  SettlementStatCard,
  SettlementTableFrame,
  SettlementVatNotice,
} from "@/shared/settlement/settlementUi";

type LedgerItem = {
  _id: string;
  type: "EARN" | "ADJUST" | "PAYOUT";
  amount: number;
  creditKind?: string | null;
  eventType?: string;
  displayLabel?: string;
  usageKind?: string;
  refType?: string;
  uniqueKey?: string;
  createdAt?: string;
  occurredAt?: string;
  balanceAfter?: number;
};

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
  earnRequestVat?: number;
  earnRequestTotal?: number;
  earnRequestPaidAmount?: number;
  earnRequestPaidVat?: number;
  earnRequestPaidTotal?: number;
  earnRequestPaidCount?: number;
  earnRequestFreeAmount?: number;
  earnRequestFreeVat?: number;
  earnRequestFreeTotal?: number;
  earnRequestFreeCount?: number;
  earnShippingAmount: number;
  earnShippingCount: number;
  earnShippingVat?: number;
  earnShippingTotal?: number;
  earnShippingPaidAmount?: number;
  earnShippingPaidVat?: number;
  earnShippingPaidTotal?: number;
  earnShippingPaidCount?: number;
  earnShippingFreeAmount?: number;
  earnShippingFreeVat?: number;
  earnShippingFreeTotal?: number;
  earnShippingFreeCount?: number;
  refundAmount: number; // legacy 표시 호환(정책상 신규 REFUND 적재 금지, 일반적으로 0)
  payoutAmount: number;
  adjustAmount: number;
  netAmount: number;
  netPayoutAmount?: number;
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
type PaymentSortKey = "occurredAt" | "status" | "amount" | "note";

const manufacturerTypeLabel = (row: LedgerItem) => {
  const label = String(row.displayLabel || "").trim();
  if (label) return label;
  if (row.type === "PAYOUT") return "지급";
  if (row.type === "ADJUST") return "조정";
  const event = String(row.eventType || "");
  if (event === "SHIPPING_SPEND_COMMIT") return "배송";
  if (event === "REQUEST_SPEND_COMMIT") return "의뢰";
  if (event === "PRACTICE_TRANSFER_SPEND_COMMIT") return "기공의뢰";
  return "적립";
};

const manufacturerPayoutBadge = (row: LedgerItem) => {
  if (row.type === "PAYOUT") {
    return {
      label: "지급 완료",
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    };
  }
  const kind = String(row.creditKind || "");
  if (kind === "FREE_REQUEST" || kind === "FREE_SHIPPING") {
    return {
      label: "지급 0",
      className: "border-slate-200 bg-slate-50 text-slate-600",
    };
  }
  if (row.type === "EARN") {
    return {
      label: "미지급",
      className: "border-sky-200 bg-sky-50 text-sky-800",
    };
  }
  return null;
};

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
  if (s === "CONFIRMED") return "text-primary-strong";
  if (s === "PENDING") return "text-accent-strong";
  if (s === "CANCELLED") return "text-destructive";
  return "";
};

const periodToYmdRange = (period: PeriodFilterValue): { from: string; to: string } | null => {
  // 제조사 정산 페이지는 PeriodFilter period → KST YMD 범위로 조회한다.
  // 관리자 전역 커스텀 날짜 필터의 간접 영향을 받지 않도록 옵션을 명시적으로 비운다.
  const range = periodToRange(period, { customStartDate: "", customEndDate: "" });
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

  // 하청: 총액/총건수 = 유료+무료 공급가 합
  if (requestTotalAmount !== paidAmount + freeAmount) {
    return { valid: false, reason: "의뢰 총금액이 paid+free 분해값과 불일치" };
  }
  if (requestTotalCount !== paidCount + freeCount) {
    return { valid: false, reason: "의뢰 총건수가 paid+free 분해값과 불일치" };
  }
  if (shippingTotalAmount !== shippingPaidAmount + shippingFreeAmount) {
    return { valid: false, reason: "배송 총금액이 paid+free 분해값과 불일치" };
  }
  if (shippingTotalCount !== shippingPaidCount + shippingFreeCount) {
    return { valid: false, reason: "배송 총건수가 paid+free 분해값과 불일치" };
  }

  const requestTotalWithVat =
    Number(r.earnRequestPaidTotal ?? 0) ||
    paidAmount + Number(r.earnRequestPaidVat || 0);
  const shippingTotalWithVat =
    Number(r.earnShippingPaidTotal ?? 0) ||
    shippingPaidAmount + Number(r.earnShippingPaidVat || 0);
  const expectedPayoutNet =
    requestTotalWithVat +
    shippingTotalWithVat +
    refundAmount +
    payoutAmount +
    adjustAmount;
  if (expectedPayoutNet !== netAmount) {
    return { valid: false, reason: "지급 순액(유료·VAT 포함) 계산값 불일치" };
  }

  if (
    r.netPayoutAmount !== undefined &&
    Number(r.netPayoutAmount || 0) !== expectedPayoutNet
  ) {
    return { valid: false, reason: "netPayoutAmount 불일치" };
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

  const [tab, setTab] = useState<"ledger" | "payments">("ledger");

  const { period, setPeriod } = usePeriodStore();
  const [q, setQ] = useState("");
  const [requestSettlementFilter, setRequestSettlementFilter] = useState<
    "all" | "paid" | "free"
  >("all");
  const [paymentSort, setPaymentSort] = useState<{
    key: PaymentSortKey;
    direction: SortDirection;
  }>({ key: "occurredAt", direction: "desc" });

  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerItems, setLedgerItems] = useState<LedgerItem[]>([]);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerHasMore, setLedgerHasMore] = useState(true);
  const [ledgerSort, setLedgerSort] = useState<{
    key: "createdAt" | "type" | "amount" | "balanceAfter" | "detail";
    direction: SortDirection;
  }>({ key: "createdAt", direction: "desc" });

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
  const anyLoading = loading || snapLoading || ledgerLoading;

  const ledgerScrollRef = useRef<HTMLDivElement | null>(null);
  const paymentScrollRef = useRef<HTMLDivElement | null>(null);
  const ledgerSentinelRef = useRef<HTMLDivElement | null>(null);
  const paymentSentinelRef = useRef<HTMLDivElement | null>(null);
  const isManufacturer = Boolean(user && user.role === "manufacturer");

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

  const buildLedgerParams = useCallback(
    (p: number) => {
      const params = new URLSearchParams({
        page: String(p),
        limit: String(PAGE_SIZE),
        requestSettlement: requestSettlementFilter,
      });
      const range = periodToYmdRange(period);
      if (range) {
        params.set("from", range.from);
        params.set("to", range.to);
      }
      if (q.trim()) params.set("q", q.trim());
      return params.toString();
    },
    [period, q, requestSettlementFilter],
  );

  const loadLedger = useCallback(
    async (p: number, reset: boolean) => {
      if (!token) return;
      setLedgerLoading(true);
      try {
        const res = await apiFetch<
          ApiEnvelope<LedgerItem[]> & {
            pagination?: { total?: number; totalPages?: number };
          }
        >({
          path: `/api/manufacturer/credits/ledger?${buildLedgerParams(p)}`,
          method: "GET",
          token,
        });
        if (!res.ok || !res.data?.success) {
          throw new Error(res.data?.message || "조회 실패");
        }
        const fetched: LedgerItem[] = Array.isArray(res.data.data)
          ? res.data.data
          : [];
        setLedgerItems((prev) => (reset ? fetched : [...prev, ...fetched]));
        setLedgerHasMore(fetched.length >= PAGE_SIZE);
        setLedgerPage(p);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "조회 실패";
        toast({
          title: "조회 실패",
          description: message,
          variant: "destructive",
        });
      } finally {
        setLedgerLoading(false);
      }
    },
    [token, buildLedgerParams, toast],
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
    void loadSnapshots();
  }, [isManufacturer, period, loadSnapshots]);

  useEffect(() => {
    if (!isManufacturer) return;
    if (tab === "payments") {
      setPage(1);
      setHasMore(true);
      void loadPayments(1, true);
      return;
    }
    setLedgerPage(1);
    setLedgerHasMore(true);
    void loadLedger(1, true);
  }, [
    isManufacturer,
    tab,
    period,
    q,
    requestSettlementFilter,
    loadPayments,
    loadLedger,
  ]);

  useEffect(() => {
    if (!isManufacturer) return;
    const sentinel =
      tab === "payments" ? paymentSentinelRef.current : ledgerSentinelRef.current;
    const root =
      tab === "payments" ? paymentScrollRef.current : ledgerScrollRef.current;
    if (!sentinel || !root) return;
    const loadingMore = tab === "payments" ? loading : ledgerLoading;
    const hasMoreRows = tab === "payments" ? hasMore : ledgerHasMore;
    if (!hasMoreRows || loadingMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        if (tab === "payments") {
          if (hasMore && !loading) void loadPayments(page + 1, false);
          return;
        }
        if (ledgerHasMore && !ledgerLoading) void loadLedger(ledgerPage + 1, false);
      },
      { root, rootMargin: "200px", threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [
    isManufacturer,
    hasMore,
    loading,
    page,
    tab,
    loadPayments,
    ledgerHasMore,
    ledgerLoading,
    ledgerPage,
    loadLedger,
  ]);

  const handleTabChange = (v: string) => {
    if (v === "ledger" || v === "payments") {
      setTab(v);
    }
  };

  const snapshotTotals = useMemo(() => {
    let payoutEligibleTotal = 0;
    let requestSupplyTotal = 0;
    let requestVatTotal = 0;
    let requestTotalWithVat = 0;
    let requestCountTotal = 0;
    let shippingSupplyTotal = 0;
    let shippingVatTotal = 0;
    let shippingTotalWithVat = 0;
    let shippingCountTotal = 0;

    let paidRequestTotal = 0;
    let paidRequestCountTotal = 0;
    let paidShippingTotal = 0;
    let paidShippingCountTotal = 0;

    let freeRequestTotal = 0;
    let freeRequestCountTotal = 0;
    let freeShippingTotal = 0;
    let freeShippingCountTotal = 0;

    let payoutTotal = 0;
    let payoutCount = 0;

    for (const row of snapItems) {
      payoutEligibleTotal += Number(
        row.netPayoutAmount ?? row.netAmount ?? 0,
      );

      // 지급 카드: 유료 의뢰/배송만
      requestSupplyTotal += Number(row.earnRequestPaidAmount || 0);
      requestVatTotal += Number(row.earnRequestPaidVat || 0);
      requestTotalWithVat += Number(
        row.earnRequestPaidTotal ??
          Number(row.earnRequestPaidAmount || 0) +
            Number(row.earnRequestPaidVat || 0),
      );
      requestCountTotal += Number(row.earnRequestPaidCount || 0);

      shippingSupplyTotal += Number(row.earnShippingPaidAmount || 0);
      shippingVatTotal += Number(row.earnShippingPaidVat || 0);
      shippingTotalWithVat += Number(
        row.earnShippingPaidTotal ??
          Number(row.earnShippingPaidAmount || 0) +
            Number(row.earnShippingPaidVat || 0),
      );
      shippingCountTotal += Number(row.earnShippingPaidCount || 0);

      paidRequestTotal += Number(row.earnRequestPaidAmount ?? 0);
      paidRequestCountTotal += Number(row.earnRequestPaidCount ?? 0);
      paidShippingTotal += Number(row.earnShippingPaidAmount ?? 0);
      paidShippingCountTotal += Number(row.earnShippingPaidCount ?? 0);

      freeRequestTotal += Number(
        row.netFreeRequestAmount ?? row.earnRequestFreeAmount ?? 0,
      );
      freeRequestCountTotal += Number(row.earnRequestFreeCount ?? 0);

      freeShippingTotal += Number(
        row.netFreeShippingAmount ?? row.earnShippingFreeAmount ?? 0,
      );
      freeShippingCountTotal += Number(row.earnShippingFreeCount ?? 0);

      const payoutAmount = Number(row.payoutAmount || 0);
      payoutTotal += payoutAmount;
      if (payoutAmount !== 0) payoutCount += 1;
    }

    return {
      payoutEligibleTotal,
      requestSupplyTotal,
      requestVatTotal,
      requestTotalWithVat,
      requestCountTotal,
      shippingSupplyTotal,
      shippingVatTotal,
      shippingTotalWithVat,
      shippingCountTotal,
      paidUnsettledTotal: paidRequestTotal + paidShippingTotal,
      paidRequestTotal,
      paidRequestCountTotal,
      paidShippingTotal,
      paidShippingCountTotal,
      freeRequestTotal,
      freeRequestCountTotal,
      freeShippingTotal,
      freeShippingCountTotal,
      freeUnsettledTotal: freeRequestTotal + freeShippingTotal,
      payoutTotal,
      payoutCount,
    };
  }, [snapItems]);

  const togglePaymentSort = (key: PaymentSortKey) => {
    setPaymentSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "occurredAt" ? "desc" : "asc" },
    );
  };

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

  const toggleLedgerSort = (
    key: "createdAt" | "type" | "amount" | "balanceAfter" | "detail",
  ) => {
    setLedgerSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "createdAt" ? "desc" : "asc" },
    );
  };

  const sortedLedgerItems = useMemo(() => {
    return [...ledgerItems].sort((a, b) => {
      if (ledgerSort.key === "createdAt") {
        const av = new Date(a.createdAt || a.occurredAt || 0).getTime();
        const bv = new Date(b.createdAt || b.occurredAt || 0).getTime();
        return ledgerSort.direction === "asc" ? av - bv : bv - av;
      }
      if (ledgerSort.key === "type") {
        const av = manufacturerTypeLabel(a);
        const bv = manufacturerTypeLabel(b);
        return ledgerSort.direction === "asc"
          ? av.localeCompare(bv, "ko")
          : bv.localeCompare(av, "ko");
      }
      if (ledgerSort.key === "amount") {
        const av = Number(a.amount || 0);
        const bv = Number(b.amount || 0);
        return ledgerSort.direction === "asc" ? av - bv : bv - av;
      }
      if (ledgerSort.key === "balanceAfter") {
        const av = Number(a.balanceAfter ?? Number.NEGATIVE_INFINITY);
        const bv = Number(b.balanceAfter ?? Number.NEGATIVE_INFINITY);
        return ledgerSort.direction === "asc" ? av - bv : bv - av;
      }
      const av = String(a.uniqueKey || a.refType || "");
      const bv = String(b.uniqueKey || b.refType || "");
      return ledgerSort.direction === "asc"
        ? av.localeCompare(bv, "ko")
        : bv.localeCompare(av, "ko");
    });
  }, [ledgerItems, ledgerSort]);

  const renderSortIcon = (active: boolean, direction: SortDirection) => (
    <SettlementSortIcon active={active} direction={direction} />
  );

  if (!isManufacturer) return null;

  return (
    <DashboardShell
      title="정산 내역"
      subtitle=""
      statsGridClassName="grid grid-cols-1 gap-3 sm:grid-cols-3"
      stats={
        <>
          <SettlementStatCard
            label="유료 미지급"
            value={snapshotTotals.paidUnsettledTotal}
            tone="primary"
            selected={tab === "ledger" && requestSettlementFilter !== "free"}
            onClick={() => {
              setRequestSettlementFilter("paid");
              setTab("ledger");
            }}
            hint="공급가"
            hintTooltip={SETTLEMENT_VAT_PAYOUT_NOTICE}
            footer={
              <div className="space-y-0.5 text-[11px] tabular-nums text-slate-600 sm:text-xs">
                <div>
                  의뢰 {formatWon(snapshotTotals.paidRequestTotal)} (
                  {snapshotTotals.paidRequestCountTotal}건)
                </div>
                <div>
                  배송 {formatWon(snapshotTotals.paidShippingTotal)} (
                  {snapshotTotals.paidShippingCountTotal}건)
                </div>
              </div>
            }
          />
          <SettlementStatCard
            label="무료 미정산"
            value={snapshotTotals.freeUnsettledTotal}
            selected={tab === "ledger" && requestSettlementFilter === "free"}
            onClick={() => {
              setRequestSettlementFilter("free");
              setTab("ledger");
            }}
            hint="참고 · 지급 0"
            footer={
              <div className="space-y-0.5 text-[11px] tabular-nums text-slate-600 sm:text-xs">
                <div>
                  의뢰 {formatWon(snapshotTotals.freeRequestTotal)} (
                  {snapshotTotals.freeRequestCountTotal}건)
                </div>
                <div>
                  배송 {formatWon(snapshotTotals.freeShippingTotal)} (
                  {snapshotTotals.freeShippingCountTotal}건)
                </div>
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
                {snapshotTotals.payoutCount}건 · {SETTLEMENT_TAXABLE_INVOICE_LABEL}
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
              <div className="flex items-center gap-1">
                <SettlementFilterChip
                  active={requestSettlementFilter === "all"}
                  onClick={() => setRequestSettlementFilter("all")}
                  disabled={anyLoading}
                >
                  전체
                </SettlementFilterChip>
                <SettlementFilterChip
                  active={requestSettlementFilter === "paid"}
                  onClick={() => setRequestSettlementFilter("paid")}
                  disabled={anyLoading}
                >
                  유료
                </SettlementFilterChip>
                <SettlementFilterChip
                  active={requestSettlementFilter === "free"}
                  onClick={() => setRequestSettlementFilter("free")}
                  disabled={anyLoading}
                >
                  무료
                </SettlementFilterChip>
              </div>
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="검색 (메모/외부ID/키)"
                className="h-9 w-full rounded-xl border-slate-200 sm:w-[280px]"
              />
              <SettlementPolicyDialog
                title="제조사 정산 규칙"
                description="하청 고정단가 · 부가세 · 세금계산서"
              >
                <SettlementPolicySection title="가공 승인 적립 (하청)">
                  <div className="flex gap-2.5">
                    <HandCoins className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <p>
                      의뢰 1건당 공급가 9,000원 + 부가세 10%(합 9,900원).
                      유료·무료 모두 적립하되, 지급은 유료만(무료 지급 0).
                    </p>
                  </div>
                </SettlementPolicySection>
                <SettlementPolicySection title="배송비 적립 (하청)">
                  <div className="flex gap-2.5">
                    <ReceiptText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <p>
                      발송 패키지 1박스당 공급가 3,500원 + 부가세 10%(합
                      3,850원).
                    </p>
                  </div>
                </SettlementPolicySection>
                <SettlementPolicySection title="부가세 · 세금계산서">
                  <div className="flex gap-2.5">
                    <ReceiptText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <p>{SETTLEMENT_VAT_POLICY.taxable}</p>
                  </div>
                </SettlementPolicySection>
                <SettlementPolicySection title="롤백">
                  <div className="flex gap-2.5">
                    <BookOpenText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <p>
                      가공·포장 롤백 시 기존 소비/적립 커밋 내역은 삭제형
                      롤백으로 정리합니다.
                    </p>
                  </div>
                </SettlementPolicySection>
                <SettlementPolicySection title="일별 정산 집계">
                  <div className="flex gap-2.5">
                    <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <p>
                      원장 기준 KST 일자별 실시간 집계. 월 지급은 부가세
                      포함액이며 {SETTLEMENT_TAXABLE_INVOICE_LABEL}를
                      수취합니다.
                    </p>
                  </div>
                </SettlementPolicySection>
              </SettlementPolicyDialog>
            </div>

            <SettlementVatNotice />

            <TabsContent value="ledger" className="mt-0">
              {snapshotAnomalyMessage ? (
                <div className="mb-2 rounded-md border border-destructive/80 bg-destructive-soft px-3 py-2 text-xs text-destructive">
                  {snapshotAnomalyMessage}
                </div>
              ) : null}
              <SettlementTableFrame
                scrollRef={ledgerScrollRef}
                className="max-h-[60vh] overflow-y-auto"
              >
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[190px] text-center">
                        <button
                          type="button"
                          className="mx-auto inline-flex items-center gap-1 whitespace-nowrap text-xs sm:text-sm"
                          onClick={() => toggleLedgerSort("createdAt")}
                        >
                          일시
                          {renderSortIcon(ledgerSort.key === "createdAt", ledgerSort.direction)}
                        </button>
                      </TableHead>
                      <TableHead className="w-[140px] text-center">
                        <button
                          type="button"
                          className="mx-auto inline-flex items-center gap-1 whitespace-nowrap text-xs sm:text-sm"
                          onClick={() => toggleLedgerSort("type")}
                        >
                          유형
                          {renderSortIcon(ledgerSort.key === "type", ledgerSort.direction)}
                        </button>
                      </TableHead>
                      <TableHead className="w-[110px] text-center">
                        <span className="whitespace-nowrap text-xs sm:text-sm">
                          지급 상태
                        </span>
                      </TableHead>
                      <TableHead className="min-w-[140px] text-center">
                        <button
                          type="button"
                          className="mx-auto inline-flex items-center gap-1 whitespace-nowrap text-xs sm:text-sm"
                          onClick={() => toggleLedgerSort("amount")}
                        >
                          금액
                          {renderSortIcon(ledgerSort.key === "amount", ledgerSort.direction)}
                        </button>
                      </TableHead>
                      <TableHead className="w-[140px] text-center">
                        <button
                          type="button"
                          className="mx-auto inline-flex items-center gap-1 whitespace-nowrap text-xs sm:text-sm"
                          onClick={() => toggleLedgerSort("balanceAfter")}
                        >
                          잔액
                          {renderSortIcon(
                            ledgerSort.key === "balanceAfter",
                            ledgerSort.direction,
                          )}
                        </button>
                      </TableHead>
                      <TableHead className="min-w-[200px] text-center">
                        <button
                          type="button"
                          className="mx-auto inline-flex items-center gap-1 whitespace-nowrap text-xs sm:text-sm"
                          onClick={() => toggleLedgerSort("detail")}
                        >
                          거래내역
                          {renderSortIcon(ledgerSort.key === "detail", ledgerSort.direction)}
                        </button>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedLedgerItems.map((r) => {
                      const amount = Number(r.amount || 0);
                      const isMinus = amount < 0 || r.type === "PAYOUT";
                      const badge = manufacturerPayoutBadge(r);
                      const signed = r.type === "PAYOUT" ? -Math.abs(amount) : amount;
                      return (
                        <TableRow key={r._id}>
                          <TableCell className="whitespace-nowrap text-center text-xs">
                            {formatDate(String(r.createdAt || r.occurredAt || ""))}
                          </TableCell>
                          <TableCell className="text-center text-xs font-medium">
                            {manufacturerTypeLabel(r)}
                          </TableCell>
                          <TableCell className="text-center">
                            {badge ? (
                              <span
                                className={cn(
                                  "inline-flex whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none",
                                  badge.className,
                                )}
                              >
                                {badge.label}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-center font-medium tabular-nums",
                              isMinus ? "text-destructive" : "text-primary-strong",
                            )}
                          >
                            {signed > 0 ? "+" : ""}
                            {signed.toLocaleString()}원
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-center text-xs tabular-nums text-muted-foreground">
                            {r.balanceAfter !== undefined
                              ? `${Number(r.balanceAfter).toLocaleString()}원`
                              : "-"}
                          </TableCell>
                          <TableCell className="text-center text-xs text-muted-foreground">
                            {String(r.uniqueKey || "").replace(/^gl:/, "") ||
                              r.refType ||
                              "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {ledgerLoading && (
                      <TableRow>
                        <TableCell
                          colSpan={6}
                          className="py-4 text-center text-sm text-muted-foreground"
                        >
                          불러오는 중...
                        </TableCell>
                      </TableRow>
                    )}
                    {!ledgerLoading && ledgerItems.length === 0 && (
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
                <div ref={ledgerSentinelRef} className="h-8" />
              </SettlementTableFrame>
            </TabsContent>

            <TabsContent value="payments" className="mt-0">
              <SettlementTableFrame
                scrollRef={paymentScrollRef}
                className="max-h-[60vh] overflow-y-auto"
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
                        <TableCell className="text-center text-xs font-semibold text-primary-strong tabular-nums whitespace-nowrap">
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
                  <div ref={paymentSentinelRef} className="h-8" />
                )}
              </SettlementTableFrame>
            </TabsContent>
          </Tabs>
        </div>
      }
    />
  );
};

export default ManufacturerPaymentPage;

// related files:
// - web/frontend/rules.md
// - web/backend/controllers/manufacturers/manufacturer.controller.js
// - web/backend/modules/manufacturers/manufacturer.routes.js
// - web/frontend/src/pages/manufacturer/payments/ManufacturerDailyLedgerDetailDialog.tsx
// - web/frontend/src/shared/date/kst.ts
// - web/frontend/src/features/settings/tabs/LabSettlementPayoutTab.tsx
// change-log:
// - 2026-08-20: 같은 날 조정을 1행으로 묶고 클릭 시 의뢰 상세.
// - 2026-08-20: 유료/무료 구분 제거. 약정 단가 전액이 미정산으로 쌓이고 말일 일괄 지급. 요약 2칸·높이 축소.
// - 2026-08-20: PeriodFilter 달력 좌·우 chevron 커스텀 기간을 조회에 반영.
// - 2026-08-17: 테이블이 남은 높이를 채워 바깥 스크롤을 없애고 표 스크롤만 남김.
// - 2026-08-17: 유형 열 생략(모두 커스텀어벗 생산+배송비). 상세 모달은 의뢰/배송 분리.
// - 2026-08-17: 생산·배송 원장을 KST 하루로 묶고, 클릭 시 수취자(우편함)별 상세.
// - 2026-08-18: 어벗 1개당 9,000(면세). 기공의뢰 생산도 같은 라벨.
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
  SETTLEMENT_EXEMPT_INVOICE_LABEL,
  SETTLEMENT_EXEMPT_PAYOUT_NOTICE,
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
import {
  ManufacturerDailyLedgerDetailDialog,
  type ManufacturerDailyLedgerDetail,
  type ManufacturerLedgerMailboxGroup,
} from "./ManufacturerDailyLedgerDetailDialog";

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
  groupKind?: "daily" | "adjust-daily" | "single";
  ymd?: string;
  requestAmount?: number;
  requestCount?: number;
  shippingAmount?: number;
  shippingCount?: number;
  paidAmount?: number;
  freeAmount?: number;
  mailboxGroups?: ManufacturerLedgerMailboxGroup[] | null;
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
type LedgerSortKey = "createdAt" | "amount" | "balanceAfter" | "detail";

const manufacturerPayoutBadge = (row: LedgerItem) => {
  if (row.type === "PAYOUT") {
    return {
      label: "지급 완료",
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    };
  }
  if (row.groupKind === "daily" || row.type === "EARN") {
    return {
      label: "미정산",
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

const formatDay = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

const dailyDetailLabel = (row: LedgerItem) => {
  const requestCount = Number(row.requestCount || 0);
  const shippingCount = Number(row.shippingCount || 0);
  const parts: string[] = [];
  if (requestCount > 0) parts.push(`의뢰 ${requestCount}건`);
  if (shippingCount > 0) parts.push(`발송 ${shippingCount}건`);
  return parts.join(" · ") || "상세";
};

const ledgerDetailLabel = (row: LedgerItem) => {
  if (row.groupKind === "daily") return dailyDetailLabel(row);
  if (row.groupKind === "adjust-daily") {
    const n = Number(row.requestCount || 0);
    return n > 0 ? `조정 ${n}건` : "조정";
  }
  if (row.type === "PAYOUT") return "지급";
  if (row.type === "ADJUST") return "조정";
  return (
    String(row.uniqueKey || "").replace(/^gl:/, "") || row.refType || "—"
  );
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
  // PeriodFilter 표시 범위와 동일. 달력·chevron 월 이동 커스텀 기간을 포함한다.
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
    r.earnRequestTotal !== undefined
      ? Number(r.earnRequestTotal || 0)
      : Number(r.earnRequestPaidTotal || 0) +
        Number(r.earnRequestFreeTotal || 0) ||
        paidAmount +
          freeAmount +
          Number(r.earnRequestPaidVat || 0) +
          Number(r.earnRequestFreeVat || 0);
  const shippingTotalWithVat =
    r.earnShippingTotal !== undefined
      ? Number(r.earnShippingTotal || 0)
      : Number(r.earnShippingPaidTotal || 0) +
        Number(r.earnShippingFreeTotal || 0) ||
        shippingPaidAmount +
          shippingFreeAmount +
          Number(r.earnShippingPaidVat || 0) +
          Number(r.earnShippingFreeVat || 0);
  const expectedPayoutNet =
    requestTotalWithVat +
    shippingTotalWithVat +
    refundAmount +
    payoutAmount +
    adjustAmount;
  if (expectedPayoutNet !== netAmount) {
    return { valid: false, reason: "지급 순액 계산값 불일치" };
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

  const { period, setPeriod, customStartDate, customEndDate } = usePeriodStore();
  const [q, setQ] = useState("");
  const [paymentSort, setPaymentSort] = useState<{
    key: PaymentSortKey;
    direction: SortDirection;
  }>({ key: "occurredAt", direction: "desc" });

  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerItems, setLedgerItems] = useState<LedgerItem[]>([]);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerHasMore, setLedgerHasMore] = useState(true);
  const [dailyDetail, setDailyDetail] =
    useState<ManufacturerDailyLedgerDetail | null>(null);
  const [ledgerSort, setLedgerSort] = useState<{
    key: LedgerSortKey;
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
    [period, q, customStartDate, customEndDate],
  );

  const buildLedgerParams = useCallback(
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
  }, [period, customStartDate, customEndDate]);

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
    let unsettledTotal = 0;
    let requestSupplyTotal = 0;
    let requestCountTotal = 0;
    let shippingSupplyTotal = 0;
    let shippingCountTotal = 0;
    let payoutTotal = 0;
    let payoutCount = 0;

    for (const row of snapItems) {
      unsettledTotal += Number(row.netPayoutAmount ?? row.netAmount ?? 0);
      requestSupplyTotal += Number(row.earnRequestAmount || 0);
      requestCountTotal += Number(row.earnRequestCount || 0);
      shippingSupplyTotal += Number(row.earnShippingAmount || 0);
      shippingCountTotal += Number(row.earnShippingCount || 0);
      const payoutAmount = Number(row.payoutAmount || 0);
      payoutTotal += Math.abs(payoutAmount);
      if (payoutAmount !== 0) payoutCount += 1;
    }

    return {
      unsettledTotal: Math.max(0, unsettledTotal),
      requestSupplyTotal,
      requestCountTotal,
      shippingSupplyTotal,
      shippingCountTotal,
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

  const toggleLedgerSort = (key: LedgerSortKey) => {
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
      const av = ledgerDetailLabel(a);
      const bv = ledgerDetailLabel(b);
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
    <>
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
    <DashboardShell
      title="정산 내역"
      subtitle=""
      fillHeight
      statsGridClassName="grid grid-cols-1 gap-3 sm:grid-cols-2"
      stats={
        <>
          <SettlementStatCard
            compact
            label="미정산"
            value={snapshotTotals.unsettledTotal}
            tone="primary"
            selected={tab === "ledger"}
            onClick={() => setTab("ledger")}
            hint="말일 일괄 지급 · 면세"
            hintTooltip={SETTLEMENT_EXEMPT_PAYOUT_NOTICE}
            footer={
              <div className="text-[11px] tabular-nums text-slate-600">
                의뢰 {formatWon(snapshotTotals.requestSupplyTotal)} (
                {snapshotTotals.requestCountTotal}건) · 배송{" "}
                {formatWon(snapshotTotals.shippingSupplyTotal)} (
                {snapshotTotals.shippingCountTotal}건)
              </div>
            }
          />
          <SettlementStatCard
            compact
            label="지급 합계"
            value={snapshotTotals.payoutTotal}
            selected={tab === "payments"}
            onClick={() => setTab("payments")}
            footer={
              <div className="text-[11px] text-muted-foreground">
                {snapshotTotals.payoutCount}건 · 면세 {SETTLEMENT_EXEMPT_INVOICE_LABEL}
              </div>
            }
          />
        </>
      }
      mainLeft={
        <div className="flex h-full min-h-0 flex-col">
          <Tabs
            value={tab}
            onValueChange={handleTabChange}
            className="flex min-h-0 flex-1 flex-col gap-2"
          >
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <PeriodFilter value={period} onChange={setPeriod} />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="검색 (메모/외부ID/키)"
                className="h-9 w-full rounded-xl border-slate-200 sm:w-[280px]"
              />
              <SettlementPolicyDialog
                title="제조사 정산 규칙"
                description="하청 고정단가 · 면세 · 계산서"
              >
                <SettlementPolicySection title="가공 승인 적립 (하청)">
                  <div className="flex gap-2.5">
                    <HandCoins className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <p>
                      어벗 1개당 9,000원(면세). 고객이 유료·무료 크레딧 중 무엇으로
                      결제했는지는 구분하지 않으며, 모든 의뢰건에 약정 단가를
                      지급합니다.
                    </p>
                  </div>
                </SettlementPolicySection>
                <SettlementPolicySection title="배송비 적립 (하청)">
                  <div className="flex gap-2.5">
                    <ReceiptText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <p>
                      발송 패키지 1박스당 3,500원(면세). 유료·무료 구분 없이 약정
                      단가를 지급합니다. 고객(치과·기공소)→어벗츠 배송비는 면세
                      수취 후, 제조사에는 배송비(어벗츠→제조사)로 지급합니다.
                    </p>
                  </div>
                </SettlementPolicySection>
                <SettlementPolicySection title="월 지급">
                  <div className="flex gap-2.5">
                    <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <p>
                      KST 매달 말일 기준으로 지난달 원장을 일괄 지급합니다. 지급
                      전까지 적립액은 미정산 잔액으로 쌓입니다.
                    </p>
                  </div>
                </SettlementPolicySection>
                <SettlementPolicySection title="면세 · 계산서">
                  <div className="flex gap-2.5">
                    <ReceiptText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <p>{SETTLEMENT_VAT_POLICY.manufacturerEarn}</p>
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
                      원장 기준 KST 일자별 실시간 집계. 월 지급은 면세 공급가이며{" "}
                      {SETTLEMENT_EXEMPT_INVOICE_LABEL}를 발행합니다.
                    </p>
                  </div>
                </SettlementPolicySection>
              </SettlementPolicyDialog>
            </div>

            <TabsContent
              value="ledger"
              className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
            >
              {snapshotAnomalyMessage ? (
                <div className="mb-2 shrink-0 rounded-md border border-destructive/80 bg-destructive-soft px-3 py-2 text-xs text-destructive">
                  {snapshotAnomalyMessage}
                </div>
              ) : null}
              <SettlementTableFrame
                scrollRef={ledgerScrollRef}
                className="min-h-0 flex-1 overflow-y-auto"
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
                      const isDaily = r.groupKind === "daily";
                      const isAdjustDaily = r.groupKind === "adjust-daily";
                      const canOpenDetail =
                        (isDaily || isAdjustDaily) &&
                        Array.isArray(r.mailboxGroups);
                      return (
                        <TableRow
                          key={r._id}
                          className={
                            canOpenDetail
                              ? "cursor-pointer hover:bg-slate-50/80"
                              : undefined
                          }
                          onClick={() => {
                            if (!canOpenDetail) return;
                            setDailyDetail({
                              ymd: String(r.ymd || ""),
                              amount,
                              requestAmount: Number(r.requestAmount || 0),
                              requestCount: Number(r.requestCount || 0),
                              shippingAmount: Number(r.shippingAmount || 0),
                              shippingCount: Number(r.shippingCount || 0),
                              mailboxGroups: r.mailboxGroups || [],
                              kind: isAdjustDaily ? "adjust" : "earn",
                            });
                          }}
                        >
                          <TableCell className="whitespace-nowrap text-center text-xs">
                            {isDaily || isAdjustDaily
                              ? formatDay(String(r.createdAt || r.occurredAt || ""))
                              : formatDate(String(r.createdAt || r.occurredAt || ""))}
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
                            {ledgerDetailLabel(r)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {ledgerLoading && (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="py-4 text-center text-sm text-muted-foreground"
                        >
                          불러오는 중...
                        </TableCell>
                      </TableRow>
                    )}
                    {!ledgerLoading && ledgerItems.length === 0 && (
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
                <div ref={ledgerSentinelRef} className="h-8" />
              </SettlementTableFrame>
            </TabsContent>

            <TabsContent
              value="payments"
              className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
            >
              <SettlementTableFrame
                scrollRef={paymentScrollRef}
                className="min-h-0 flex-1 overflow-y-auto"
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
    </div>
    <ManufacturerDailyLedgerDetailDialog
      detail={dailyDetail}
      onOpenChange={(open) => {
        if (!open) setDailyDetail(null);
      }}
    />
    </>
  );
};

export default ManufacturerPaymentPage;

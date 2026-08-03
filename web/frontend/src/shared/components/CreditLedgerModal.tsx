// change-log:
// - 2026-08-03: Credit ledger detail row의 공정 배지 표시를 normalizeStageLabel 기반으로 정규화(의뢰 -> 준비). (display-only)
// related files:
// - web/frontend/rules.md
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/requestor/dashboard/RequestorDashboardPage.tsx
// - web/frontend/src/pages/admin/credits/AdminCreditPage.tsx
// - web/frontend/src/shared/realtime/useAppEventDebouncedReload.ts
// - web/frontend/src/shared/realtime/creditBalanceEvent.ts
// - web/backend/controllers/admin/adminCredit.controller.js
// change-log:
// - 2026-08-03: CreditLedgerModal: normalize manufacturer stage display labels (의뢰 -> 준비) in transaction rows. (display-only)
import { useEffect, useMemo, useRef, useState } from "react";
import { getNormalizedStageLabelSafe } from "@/utils/stage";
import { useAppEventDebouncedReload } from "@/shared/realtime/useAppEventDebouncedReload";
import { isCreditEventForBusiness } from "@/shared/realtime/creditBalanceEvent";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { generateModelNumber } from "@/utils/modelNumber";
import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import { periodToRange } from "@/store/usePeriodStore";
import { cn } from "@/shared/ui/cn";
import {
  RequestDetailDialog,
  type RequestDetailDialogRequest,
} from "@/features/requests/components/RequestDetailDialog";

type CreditLedgerType =
  | "CHARGE_PAID"
  | "CHARGE_FREE_REQUEST"
  | "CHARGE_FREE_SHIPPING"
  | "SPEND_PAID"
  | "SPEND_FREE_REQUEST"
  | "SPEND_FREE_SHIPPING"
  | "ADJUST";

type CreditLedgerItem = {
  _id: string;
  type: CreditLedgerType;
  amount: number;
  spentPaidAmount?: number | null;
  spentFreeAmount?: number | null;
  refType?: string;
  refId?: string | null;
  refRequestId?: string;
  uniqueKey: string;
  createdAt: string;
  balanceAfter?: number;
  patientName?: string;
  tooth?: string;
  clinicName?: string;
  manufacturerStage?: string;
  freeReason?: string;
  trackingNumbers?: string[];
  lotNumber?: {
    value?: string;
  } | null;
  refRequestSummary?: {
    requestId?: string;
    manufacturerStage?: string;
    patientName?: string;
    tooth?: string;
    clinicName?: string;
    lotNumber?: {
      value?: string;
    } | null;
  } | null;
  caseInfos?: {
    clinicName?: string;
    patientName?: string;
    tooth?: string;
    implantManufacturer?: string;
    implantBrand?: string;
    implantFamily?: string;
    implantType?: string;
    maxDiameter?: number | null;
    connectionDiameter?: number | null;
  } | null;
};

type CreditBalanceSnapshot = {
  balance: number;
  paidCredit: number;
  freeRequestCredit?: number;
  freeShippingCredit?: number;
  updatedAt?: string | null;
};

export type CreditLedgerModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 관리자가 특정 조직의 원장을 볼 때 사용. 없으면 로그인 유저 기준 */
  businessAnchorId?: string;
  /** 모달 제목 suffix (예: "· org-001") */
  titleSuffix?: string;
  /** 충전하기 버튼 클릭 시 이동할 경로. 없으면 버튼 숨김 */
  chargeNavPath?: string;
};

const PAGE_SIZE = 50;

type SortDirection = "asc" | "desc";
type LedgerSortKey = "createdAt" | "type" | "amount" | "balanceAfter" | "detail";

const typeLabel = (t: CreditLedgerType) => {
  if (t === "CHARGE_PAID") return "유료충전";
  if (t === "CHARGE_FREE_REQUEST") return "무료충전(의뢰)";
  if (t === "CHARGE_FREE_SHIPPING") return "무료충전(배송)";
  if (t === "SPEND_PAID") return "사용(유료)";
  if (t === "SPEND_FREE_REQUEST") return "사용(무료·의뢰)";
  if (t === "SPEND_FREE_SHIPPING") return "사용(무료·배송)";
  return "조정";
};

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
  const s = tail.slice(-4).toUpperCase();
  return s || "-";
};

const REF_TYPE_LABELS: Record<string, string> = {
  SHIPPING_PACKAGE: "택배비",
  REQUEST: "의뢰",
  FREE_REQUEST_CREDIT: "환영 무료 의뢰크레딧",
  FREE_SHIPPING_CREDIT: "환영 무료 배송크레딧",
  SHIPPING_FREE_CREDIT: "환영 무료 배송크레딧",
  SEED_REQUESTOR_CHARGE: "시드 초기 충전",
};

const refTypeLabel = (refType?: string) => {
  const t = String(refType || "").trim();
  if (!t) return "-";
  return REF_TYPE_LABELS[t] || t;
};

const formatTrackingNumbers = (trackingNumbers?: string[]) => {
  const values = Array.isArray(trackingNumbers)
    ? trackingNumbers.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  if (values.length === 0) return "-";
  if (values.length === 1) return values[0];
  return `${values[0]} 외 ${values.length - 1}건`;
};

const hashToBase36 = (input: string) => {
  const str = String(input || "");
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).toUpperCase();
};

const formatRequestIdSafe = (requestId?: string, seed?: string) => {
  const raw = String(requestId || "").trim();
  const m = raw.match(/^(\d{8})-(\d{6})$/);
  if (!m) return raw;
  const datePart = m[1];
  const code = hashToBase36(`${String(seed || raw)}|abuts|requestId`)
    .padStart(6, "0")
    .slice(-6);
  return `${datePart}-${code}`;
};

const renderTransactionDetail = ({
  item,
  safeRef,
  onOpenRequestDetail,
}: {
  item: CreditLedgerItem;
  safeRef: string;
  onOpenRequestDetail: () => void;
}) => {
  const refType = String(item.refType || "");
  const requestSummary = item.refRequestSummary;
  const shortCode = safeRef || formatShortCode(String(item.uniqueKey || ""));

  if (refType === "REQUEST") {
    const manufacturerStageRaw =
      item.manufacturerStage || requestSummary?.manufacturerStage || "의뢰";
    const manufacturerStage = getNormalizedStageLabelSafe({ manufacturerStage: manufacturerStageRaw }) || String(manufacturerStageRaw);

    return (
      <>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
            {manufacturerStage}
          </Badge>
          <span className="font-mono text-xs font-semibold text-slate-900">
            {shortCode}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-1 text-[11px] text-slate-700">
          <span>
            {requestSummary?.clinicName || item.clinicName || "-"} /{" "}
            {requestSummary?.patientName || item.patientName || "-"} /{" "}
            {requestSummary?.tooth || item.tooth || "-"}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-5 px-1.5 text-[10px]"
            onClick={onOpenRequestDetail}
          >
            자세히 보기
          </Button>
        </div>
      </>
    );
  }

  if (refType === "SHIPPING_PACKAGE") {
    return (
      <>
        <span className="text-[11px] text-muted-foreground">
          {refTypeLabel(refType)}
        </span>
        <span className="pt-1 font-mono text-xs font-semibold text-slate-900">
          {shortCode}
        </span>
        <span className="pt-1 text-[11px] text-slate-700">
          송장번호 {formatTrackingNumbers(item.trackingNumbers)}
        </span>
      </>
    );
  }

  if (
    item.type === "CHARGE_FREE_REQUEST" ||
    item.type === "CHARGE_FREE_SHIPPING"
  ) {
    const reason = String(item.freeReason || "").trim();
    return (
      <>
        <span className="text-[11px] text-slate-700">
          {reason || refTypeLabel(refType)}
        </span>
        <span className="pt-1 font-mono text-xs font-semibold text-slate-900">
          {shortCode}
        </span>
      </>
    );
  }

  return (
    <>
      <span className="text-[11px] text-muted-foreground">
        {refTypeLabel(refType)}
      </span>
      <span className="pt-1 font-mono text-xs font-semibold text-slate-900">
        {shortCode}
      </span>
    </>
  );
};

export const CreditLedgerModal = ({
  open,
  onOpenChange,
  businessAnchorId,
  titleSuffix,
  chargeNavPath,
}: CreditLedgerModalProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { token, user } = useAuthStore();

  const [period, setPeriod] = useState<PeriodFilterValue>("30d");
  const [type, setType] = useState<"all" | CreditLedgerType>("all");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<CreditLedgerItem[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ key: LedgerSortKey; direction: SortDirection }>({
    key: "createdAt",
    direction: "desc",
  });
  const [selectedDetail, setSelectedDetail] =
    useState<RequestDetailDialogRequest | null>(null);
  const [currentBalanceSnapshot, setCurrentBalanceSnapshot] =
    useState<CreditBalanceSnapshot | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef(page);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(false);

  // page 상태 변경 시 ref 동기화
  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  const resetFilters = () => {
    setPeriod("30d");
    setType("all");
    setQ("");
    setFrom("");
    setTo("");
  };

  const buildPath = (pageNum: number) => {
    const params = new URLSearchParams();
    const hasManualRange = Boolean(from || to);
    if (!hasManualRange) {
      if (period === "thisMonth" || period === "lastMonth") {
        const range = periodToRange(period);
        if (range?.startDate) params.set("from", range.startDate);
        if (range?.endDate) params.set("to", range.endDate);
      } else if (period) {
        params.set("period", period);
      }
    }
    if (type && type !== "all") params.set("type", type);
    if (q.trim()) params.set("q", q.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    params.set("page", String(pageNum));
    params.set("pageSize", String(PAGE_SIZE));

    if (businessAnchorId) {
      return `/api/admin/credits/businesses/${businessAnchorId}/ledger?${params.toString()}`;
    }
    return `/api/credits/ledger?${params.toString()}`;
  };

  const load = async (pageNum: number, reset: boolean) => {
    if (!token) return;
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const res = await apiFetch<{
        success: boolean;
        data: {
          items: CreditLedgerItem[];
          total: number;
          page: number;
          pageSize: number;
          currentBalanceSnapshot?: CreditBalanceSnapshot;
        };
        message?: string;
      }>({
        path: buildPath(pageNum),
        method: "GET",
        token,
      });

      if (!res.ok || !res.data?.success) {
        const message =
          res.data && typeof res.data === "object" && "message" in res.data
            ? String((res.data as { message?: string }).message || "")
            : "";
        throw new Error(message || "크레딧 내역 조회에 실패했습니다.");
      }

      const data = res.data.data;
      const fetched = Array.isArray(data?.items) ? data.items : [];
      const total = Number(data?.total ?? 0);
      if (reset) {
        setCurrentBalanceSnapshot(data?.currentBalanceSnapshot || null);
      }
      setItems((prev) => {
        const next = reset ? fetched : [...prev, ...fetched];
        const more = next.length < total;
        setHasMore(more);
        hasMoreRef.current = more;
        return next;
      });
    } catch (e: unknown) {
      if (reset) {
        setItems([]);
        setCurrentBalanceSnapshot(null);
      }
      setHasMore(false);
      hasMoreRef.current = false;
      toast({
        title: "크레딧 내역 조회 실패",
        description:
          e instanceof Error ? e.message : "다시 시도해주세요.",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  };

  // 필터 변경 시 초기화
  useEffect(() => {
    if (!open) return;
    setPage(1);
    pageRef.current = 1;
    setHasMore(true);
    hasMoreRef.current = true;
    load(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, period, type, q, from, to, businessAnchorId]);

  // 무한 스크롤
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = scrollRef.current;
    if (!sentinel || !root || !open) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        if (loadingRef.current || !hasMoreRef.current) return;
        const nextPage = pageRef.current + 1;
        setPage(nextPage);
        load(nextPage, false);
      },
      { root, rootMargin: "200px", threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 웹소켓 실시간 업데이트: 모달이 열린 상태를 유지한 채
  // 동일 모달 내 데이터(목록/잔액 스냅샷)만 갱신한다.
  useAppEventDebouncedReload({
    enabled: Boolean(open && token),
    eventTypes: ["credit:balance-updated"],
    delayMs: 80,
    deferWhenEditing: false,
    shouldHandle: (evt) =>
      isCreditEventForBusiness(evt, businessAnchorId || user?.businessAnchorId),
    onMatch: () => {
      setPage(1);
      pageRef.current = 1;
      setHasMore(true);
      hasMoreRef.current = true;
      void load(1, true);
    },
  });

  const rows = useMemo(() => (Array.isArray(items) ? items : []), [items]);

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

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
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
      const av = `${String(a.refType || "")} ${String(a.refRequestId || a.refId || "")}`;
      const bv = `${String(b.refType || "")} ${String(b.refRequestId || b.refId || "")}`;
      return sort.direction === "asc"
        ? av.localeCompare(bv, "ko")
        : bv.localeCompare(av, "ko");
    });
  }, [rows, sort]);

  const canCharge =
    chargeNavPath && (user?.role === "requestor" || user?.role === "admin");

  const toRequestDetail = (
    item: CreditLedgerItem,
  ): RequestDetailDialogRequest => ({
    requestId: item.refRequestId || item.refRequestSummary?.requestId || "",
    manufacturerStage:
      item.manufacturerStage || item.refRequestSummary?.manufacturerStage || "",
    createdAt: item.createdAt,
    caseInfos: {
      clinicName:
        item.caseInfos?.clinicName ||
        item.clinicName ||
        item.refRequestSummary?.clinicName ||
        "",
      patientName:
        item.caseInfos?.patientName ||
        item.patientName ||
        item.refRequestSummary?.patientName ||
        "",
      tooth:
        item.caseInfos?.tooth ||
        item.tooth ||
        item.refRequestSummary?.tooth ||
        "",
      implantManufacturer: item.caseInfos?.implantManufacturer || "",
      implantBrand: item.caseInfos?.implantBrand || "",
      implantFamily: item.caseInfos?.implantFamily || "",
      implantType: item.caseInfos?.implantType || "",
      maxDiameter: item.caseInfos?.maxDiameter ?? null,
      connectionDiameter: item.caseInfos?.connectionDiameter ?? null,
    },
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[92vw] max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="pb-2">
            <div className="flex items-center justify-start gap-2">
              <DialogTitle className="text-lg">
                크레딧 내역{titleSuffix ? ` · ${titleSuffix}` : ""}
              </DialogTitle>
              {canCharge && (
                <Button
                  type="button"
                  size="sm"
                  className="h-8"
                  onClick={() => {
                    onOpenChange(false);
                    navigate(chargeNavPath!);
                  }}
                  disabled={loading}
                >
                  충전하기
                </Button>
              )}
            </div>
          </DialogHeader>

          <div className="flex flex-col gap-3 min-h-0 flex-1">
            {currentBalanceSnapshot ? (
              <div className="rounded-md border bg-muted/30 px-3 py-2">
                <div className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2 lg:grid-cols-4">
                  <div className="tabular-nums">
                    <span className="text-muted-foreground">현재 잔액</span>{" "}
                    <span className="font-semibold text-slate-900">
                      {Number(currentBalanceSnapshot.balance || 0).toLocaleString()}원
                    </span>
                  </div>
                  <div className="tabular-nums">
                    <span className="text-muted-foreground">유료</span>{" "}
                    <span className="font-semibold text-slate-900">
                      {Number(currentBalanceSnapshot.paidCredit || 0).toLocaleString()}원
                    </span>
                  </div>
                  <div className="tabular-nums">
                    <span className="text-muted-foreground">무료·의뢰</span>{" "}
                    <span className="font-semibold text-slate-900">
                      {Number(
                        currentBalanceSnapshot.freeRequestCredit ?? 0,
                      ).toLocaleString()}
                      원
                    </span>
                  </div>
                  <div className="tabular-nums">
                    <span className="text-muted-foreground">무료·배송</span>{" "}
                    <span className="font-semibold text-slate-900">
                      {Number(
                        currentBalanceSnapshot.freeShippingCredit ?? 0,
                      ).toLocaleString()}
                      원
                    </span>
                  </div>
                </div>
              </div>
            ) : null}
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 py-0.5">
                  <PeriodFilter value={period} onChange={setPeriod} />

                  <div className="w-[140px]">
                    <Select
                      value={type}
                      onValueChange={(v) =>
                        setType(v as CreditLedgerType | "all")
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="전체" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">전체</SelectItem>
                        <SelectItem value="SPEND_PAID">사용(유료)</SelectItem>
                        <SelectItem value="SPEND_FREE_REQUEST">
                          사용(무료·의뢰)
                        </SelectItem>
                        <SelectItem value="SPEND_FREE_SHIPPING">
                          사용(무료·배송)
                        </SelectItem>
                        <SelectItem value="CHARGE_PAID">유료충전</SelectItem>
                        <SelectItem value="CHARGE_FREE_REQUEST">
                          무료충전(의뢰)
                        </SelectItem>
                        <SelectItem value="CHARGE_FREE_SHIPPING">
                          무료충전(배송)
                        </SelectItem>
                        <SelectItem value="ADJUST">조정</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="h-9"
                    onClick={resetFilters}
                    disabled={loading}
                  >
                    초기화
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 py-0.5">
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
                  placeholder="검색 (거래내역/코드/refId)"
                  className="h-9 w-full sm:w-[320px]"
                />
              </div>
            </div>

            <div
              ref={scrollRef}
              className="flex-1 min-h-0 overflow-y-auto overflow-x-auto rounded-md border"
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
                    <TableHead className="min-w-[160px] text-center">
                      <button
                        type="button"
                        className="mx-auto inline-flex items-center gap-1 text-xs sm:text-sm"
                        onClick={() => toggleSort("amount")}
                      >
                        금액
                        {renderSortIcon(sort.key === "amount", sort.direction)}
                      </button>
                    </TableHead>
                    <TableHead className="w-[150px] text-center">
                      <button
                        type="button"
                        className="mx-auto inline-flex items-center gap-1 text-xs sm:text-sm"
                        onClick={() => toggleSort("balanceAfter")}
                      >
                        행 시점 잔액
                        {renderSortIcon(sort.key === "balanceAfter", sort.direction)}
                      </button>
                    </TableHead>
                    <TableHead className="min-w-[240px] text-center">
                      <button
                        type="button"
                        className="mx-auto inline-flex items-center gap-1 text-xs sm:text-sm"
                        onClick={() => toggleSort("detail")}
                      >
                        거래내역
                        {renderSortIcon(sort.key === "detail", sort.direction)}
                      </button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRows.map((r) => {
                    const amount = Number(r.amount || 0);
                    const isMinus = amount < 0;
                    const spentPaid = Number(r.spentPaidAmount || 0);
                    const spentFree = Number(r.spentFreeAmount ?? 0);
                    const showSplit =
                      (String(r.type) === "SPEND_PAID" ||
                        String(r.type) === "SPEND_FREE_REQUEST" ||
                        String(r.type) === "SPEND_FREE_SHIPPING") &&
                      (spentPaid > 0 || spentFree > 0);
                    const safeRef = r.refRequestId
                      ? formatRequestIdSafe(
                          r.refRequestId,
                          `${String(r.refId || "")}::${String(r.uniqueKey || "")}`,
                        )
                      : "";
                    const freeSpendLabel = (() => {
                      if (r.type === "SPEND_FREE_REQUEST") return "무료(의뢰)";
                      if (r.type === "SPEND_FREE_SHIPPING") return "무료(배송)";
                      const refType = String(r.refType || "");
                      if (refType === "REQUEST") return "무료(의뢰)";
                      if (refType === "SHIPPING_PACKAGE") return "무료(배송)";
                      return "무료";
                    })();
                    return (
                      <TableRow key={r._id}>
                        <TableCell className="text-center text-xs whitespace-nowrap">
                          {formatDate(String(r.createdAt || ""))}
                        </TableCell>
                        <TableCell className="text-center text-xs font-medium whitespace-nowrap">
                          {typeLabel(r.type)}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-center font-medium tabular-nums",
                            isMinus ? "text-rose-600" : "text-blue-700",
                          )}
                        >
                          {showSplit ? (
                            <div className="flex flex-col items-center leading-4">
                              {spentPaid > 0 && (
                                <div className="tabular-nums text-xs">
                                  유료 -{spentPaid.toLocaleString()}원
                                </div>
                              )}
                              {spentFree > 0 && (
                                <div className="tabular-nums text-xs">
                                  {freeSpendLabel} -{spentFree.toLocaleString()}원
                                </div>
                              )}
                            </div>
                          ) : (
                            `${amount.toLocaleString()}원`
                          )}
                        </TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                          {r.balanceAfter !== undefined
                            ? `${Number(r.balanceAfter).toLocaleString()}원`
                            : "-"}
                        </TableCell>
                        <TableCell className="text-center text-xs">
                          <div className="flex flex-col items-center leading-4">
                            {renderTransactionDetail({
                              item: r,
                              safeRef,
                              onOpenRequestDetail: () =>
                                setSelectedDetail(toRequestDetail(r)),
                            })}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}

                  {loading && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center text-sm text-muted-foreground py-4"
                      >
                        불러오는 중...
                      </TableCell>
                    </TableRow>
                  )}

                  {!loading && rows.length === 0 && (
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

              {hasMore && !loading && (
                <div ref={sentinelRef} className="h-8" aria-hidden="true" />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <RequestDetailDialog
        open={Boolean(selectedDetail)}
        onOpenChange={(next) => {
          if (!next) setSelectedDetail(null);
        }}
        request={selectedDetail}
        rows={rows}
      />
    </>
  );
};

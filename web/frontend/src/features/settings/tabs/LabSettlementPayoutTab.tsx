// related files:
// - web/frontend/src/pages/requestor/credits/RequestorCreditsPage.tsx
// - web/frontend/src/pages/manufacturer/payments/PaymentsPage.tsx
// - web/frontend/src/features/settings/tabs/LabTradingPartnersTab.tsx
// - web/frontend/src/shared/settlement/settlementUi.tsx
// - web/frontend/src/shared/settlement/affiliateVat.ts
// - web/backend/controllers/credits/credit.controller.js
// change-log:
// - 2026-09-26: 정산규칙 — 수수료 제목·협력·하청 문장.
// - 2026-09-24: 정산규칙 — 플랫폼 사용료 정책 2% · 이벤트 0% 복원.
// - 2026-09-20: 정산규칙 — 하청 % · 작업시작 적립 시 공제 안내.
// - 2026-09-16: 지급 표 로딩 — 텍스트 대신 4열 행 스켈레톤.
// - 2026-09-20: 정산규칙 — 커스텀어벗은 STL·생산비 지급 뒤에만 적립·지급.
// - 2026-09-16: 정산규칙 모달 — 작업완료 적립·통장사본 이월·월 지급 유보 50만원 기준 간단 정리.
// - 2026-09-16: 상태=지급+계산서. 통장사본 미등록 일 1회 안내·1개월 이월 강조.
// - 2026-09-16: 일별→월별 집계. 필수열(정산월·적립·지급·상태). 충전과 동일 max-w-4xl.
// - 2026-09-16: 요약 카드용 일별 스냅샷은 탭과 무관하게 기간 변경 시 항상 로드. 지급 목록은 기간·검색 클라이언트 필터.
// - 2026-09-16: 크레딧「지급」탭 임베드 — fillHeight·compact 카드·표 잔여높이(제조사 정산 UX).
// - 2026-08-17: 공통 정산 UI + 면세 계산서 안내.
// - 2026-08-13: 잔액/지급 동폭 클릭 카드로 탭 전환. 정산규칙은 검색줄 우측.
// - 2026-08-11: 요약 5열(액션 버튼 세로). 일자 입력 제거·검색 상단 이동. 전체/거래처/비거래처를 필터 행으로.
// - 2026-08-11: 요약 카드 — 하단 보조행 제거, 금액 옆 (N건), 높이 축소·중앙 정렬.
// - 2026-08-11: 정산 요청 버튼 제거(매월 자동 지급). 안내는 정산규칙 모달에만 표시.
// - 2026-08-11: 제조사 정산 페이지와 동일 UX(요약 카드·기간·일별/입금·정산규칙).
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, request } from "@/shared/api/apiClient";
import { toKstYmd, kstEndOfMonth } from "@/shared/date/kst";
import { usePeriodStore, periodToRange } from "@/store/usePeriodStore";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import {
  isSettlementPeriodValue,
  SETTLEMENT_DEFAULT_PERIOD,
  SETTLEMENT_PERIOD_PRESETS,
} from "@/shared/ui/periodFilterValues";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import {
  Building2,
  CalendarClock,
  HandCoins,
  Landmark,
  Percent,
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  LAB_PAYOUT_BANKBOOK_DELAY_NOTICE,
  LAB_PAYOUT_SETTINGS_PATH,
  LAB_CUSTOM_ABUTMENT_SETTLEMENT_NOTICE,
  LAB_SETTLEMENT_PAYOUT_RESERVE_NOTICE,
  isLabPayoutReady,
  type LabPayoutAccountSnapshot,
} from "@/shared/settlement/labPayoutBankbook";
import { LabDirectPlatformFeeNotice } from "@/shared/settlement/LabDirectPlatformFeeNotice";
import { useLabPayoutBankbookReminder } from "@/shared/settlement/useLabPayoutBankbookReminder";
import { useLabTradingPartnerWindow } from "@/shared/lab/useLabTradingPartnerWindow";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  loadBusinessMeCached,
} from "@/shared/components/business/settings/business/businessMeCache";
import { resolveBusinessType } from "@/shared/utils/resolveBusinessType";

type InvoiceDraftRef = {
  _id?: string;
  status?: string;
  taxType?: string;
} | null;

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
  invoiceDraftId?: InvoiceDraftRef;
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

type MonthlyRow = {
  ym: string;
  label: string;
  earnAmount: number;
  earnCount: number;
  payoutAmount: number;
  status: PayoutItem["status"] | null;
  invoiceStatus: string | null;
};

type ApiEnvelope<T> = {
  success?: boolean;
  message?: string;
  data?: T;
};

type SortDirection = "asc" | "desc";
type MonthlySortKey = "ym" | "earn" | "payout" | "status";

type ViewMode = "all" | "payouts";

const statusLabel = (s: string) => {
  if (s === "CONFIRMED") return "지급확정";
  if (s === "PENDING") return "지급보류";
  if (s === "EXCLUDED_NO_ACCOUNT") return "계좌 확인 필요";
  if (s === "PAID") return "지급완료";
  if (s === "CANCELLED") return "취소";
  return s;
};

const invoiceStatusLabel = (s: string | null | undefined) => {
  if (!s) return null;
  if (s === "SENT") return "계산서발행";
  if (s === "PENDING_APPROVAL") return "계산서대기";
  if (s === "APPROVED") return "계산서승인";
  if (s === "FAILED") return "계산서실패";
  if (s === "REJECTED") return "계산서반려";
  if (s === "CANCELLED") return "계산서취소";
  return s;
};

const formatStatusCell = (
  payout: PayoutItem["status"] | null,
  invoice: string | null,
) => {
  const parts: string[] = [];
  if (payout) parts.push(statusLabel(payout));
  const inv = invoiceStatusLabel(invoice);
  if (inv) parts.push(inv);
  return parts.length ? parts.join(" · ") : "—";
};

const statusColor = (s: string) => {
  if (s === "CONFIRMED" || s === "PAID") return "text-primary-strong";
  if (s === "PENDING") return "text-accent-strong";
  if (s === "EXCLUDED_NO_ACCOUNT") return "text-accent-strong";
  if (s === "CANCELLED") return "text-destructive";
  return "text-muted-foreground";
};

/** 같은 월에 여러 배치가 있으면 사용자에게 더 급한 상태를 우선. */
const STATUS_PRIORITY: Record<string, number> = {
  EXCLUDED_NO_ACCOUNT: 5,
  PENDING: 4,
  CONFIRMED: 3,
  PAID: 2,
  CANCELLED: 1,
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

const ymdToYm = (ymd: string | null | undefined): string | null => {
  const raw = String(ymd || "").trim();
  if (!/^\d{4}-\d{2}/.test(raw)) return null;
  return raw.slice(0, 7);
};

const formatYmLabel = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return `${y}년 ${m}월`;
};

const payoutYmOf = (row: PayoutItem): string | null => {
  if (row.batchId?.periodStart) {
    return ymdToYm(toKstYmd(new Date(row.batchId.periodStart)));
  }
  return ymdToYm(toKstYmd(new Date(row.paidAt || row.createdAt || 0)));
};

export const LabSettlementPayoutTab = () => {
  const { token, user } = useAuthStore();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { dialog: bankbookRemindDialog } = useLabPayoutBankbookReminder({
    forceOnMount: true,
  });
  const { windowInfo: labFeeWindow } = useLabTradingPartnerWindow();
  const subcontractFeePct = Math.round(
    Number(labFeeWindow?.feeRates?.subcontractFeeRate ?? 0.1) * 100,
  );
  const [payoutReady, setPayoutReady] = useState(true);

  const [view, setView] = useState<ViewMode>("all");
  const { period, setPeriod, customStartDate, customEndDate } = usePeriodStore();

  useEffect(() => {
    if (!isSettlementPeriodValue(period)) {
      setPeriod(SETTLEMENT_DEFAULT_PERIOD);
    }
  }, [period, setPeriod]);

  const settlementPeriod = isSettlementPeriodValue(period)
    ? period
    : SETTLEMENT_DEFAULT_PERIOD;
  const [sort, setSort] = useState<{
    key: MonthlySortKey;
    direction: SortDirection;
  }>({ key: "ym", direction: "desc" });

  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutItems, setPayoutItems] = useState<PayoutItem[]>([]);
  const [snapLoading, setSnapLoading] = useState(false);
  const [snapItems, setSnapItems] = useState<LabDailySnapshotRow[]>([]);
  const [settlementCredit, setSettlementCredit] = useState(0);

  const loading = snapLoading || payoutLoading;

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

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void (async () => {
      try {
        const businessType = resolveBusinessType(user?.role, "requestor");
        const data = await loadBusinessMeCached({
          token,
          businessType,
          force: false,
        });
        if (cancelled) return;
        setPayoutReady(
          isLabPayoutReady(data?.payoutAccount as LabPayoutAccountSnapshot),
        );
      } catch {
        // keep last
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, user?.role]);

  const buildSnapshotParams = useCallback(() => {
    const params = new URLSearchParams({ limit: "366" });
    const range = periodToYmdRange(settlementPeriod);
    if (range) {
      params.set("fromYmd", range.from);
      params.set("toYmd", range.to);
    }
    return params.toString();
  }, [settlementPeriod, customStartDate, customEndDate]);

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

  const loadPayouts = useCallback(async () => {
    if (!token) return;
    setPayoutLoading(true);
    try {
      const res = await apiFetch<ApiEnvelope<PayoutItem[]>>({
        path: "/api/credits/settlement/payouts",
        method: "GET",
        token,
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.message || "조회 실패");
      }
      const fetched: PayoutItem[] = Array.isArray(res.data.data)
        ? res.data.data
        : [];
      setPayoutItems(fetched);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "조회 실패";
      toast({
        title: "조회 실패",
        description: message,
        variant: "destructive",
      });
    } finally {
      setPayoutLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    void loadSnapshots();
  }, [loadSnapshots]);

  useEffect(() => {
    void loadPayouts();
  }, [loadPayouts]);

  const monthlyRows = useMemo(() => {
    const byYm = new Map<string, MonthlyRow>();

    const ensure = (ym: string): MonthlyRow => {
      let row = byYm.get(ym);
      if (!row) {
        row = {
          ym,
          label: formatYmLabel(ym),
          earnAmount: 0,
          earnCount: 0,
          payoutAmount: 0,
          status: null,
          invoiceStatus: null,
        };
        byYm.set(ym, row);
      }
      return row;
    };

    for (const day of snapItems) {
      const ym = ymdToYm(day.ymd);
      if (!ym) continue;
      const row = ensure(ym);
      row.earnAmount +=
        Number(day.earnPartnerAmount || 0) +
        Number(day.earnNonPartnerAmount || 0);
      row.earnCount +=
        Number(day.earnPartnerCount || 0) +
        Number(day.earnNonPartnerCount || 0);
      // 원장 일별 payout은 참고용 — 월 지급 SSOT는 배치 항목.
      row.payoutAmount += Math.abs(Number(day.payoutAmount || 0));
    }

    // 배치 지급이 있으면 그 달 지급액·상태를 덮어쓴다(월 정산 SSOT).
    const payoutByYm = new Map<
      string,
      {
        amount: number;
        status: PayoutItem["status"] | null;
        invoiceStatus: string | null;
      }
    >();
    for (const item of payoutItems) {
      const ym = payoutYmOf(item);
      if (!ym) continue;
      const prev = payoutByYm.get(ym) || {
        amount: 0,
        status: null,
        invoiceStatus: null,
      };
      prev.amount += Number(item.amount || 0);
      const nextPri = STATUS_PRIORITY[item.status] || 0;
      const prevPri = prev.status ? STATUS_PRIORITY[prev.status] || 0 : 0;
      if (nextPri >= prevPri) {
        prev.status = item.status;
        const draft = item.invoiceDraftId;
        prev.invoiceStatus =
          draft && typeof draft === "object"
            ? String(draft.status || "") || null
            : null;
      }
      payoutByYm.set(ym, prev);
    }

    for (const [ym, payout] of payoutByYm) {
      const row = ensure(ym);
      row.payoutAmount = payout.amount;
      row.status = payout.status;
      row.invoiceStatus = payout.invoiceStatus;
    }

    return Array.from(byYm.values());
  }, [snapItems, payoutItems]);

  const snapshotTotals = useMemo(() => {
    let earnTotal = 0;
    let earnCount = 0;
    let payoutTotal = 0;
    let payoutCount = 0;

    for (const row of monthlyRows) {
      earnTotal += row.earnAmount;
      earnCount += row.earnCount;
      if (row.payoutAmount > 0) {
        payoutTotal += row.payoutAmount;
        payoutCount += 1;
      }
    }

    return { earnTotal, earnCount, payoutTotal, payoutCount };
  }, [monthlyRows]);

  const sortedRows = useMemo(() => {
    const range = periodToYmdRange(settlementPeriod);
    const filtered = monthlyRows.filter((row) => {
      if (view === "payouts" && row.payoutAmount <= 0) return false;
      if (!range) return true;
      const monthStart = `${row.ym}-01`;
      const monthEnd = kstEndOfMonth(monthStart) || `${row.ym}-28`;
      return monthEnd >= range.from && monthStart <= range.to;
    });

    return [...filtered].sort((a, b) => {
      if (sort.key === "ym") {
        const av = a.ym.localeCompare(b.ym);
        return sort.direction === "asc" ? av : -av;
      }
      if (sort.key === "earn") {
        return sort.direction === "asc"
          ? a.earnAmount - b.earnAmount
          : b.earnAmount - a.earnAmount;
      }
      if (sort.key === "payout") {
        return sort.direction === "asc"
          ? a.payoutAmount - b.payoutAmount
          : b.payoutAmount - a.payoutAmount;
      }
      const av = a.status || "";
      const bv = b.status || "";
      return sort.direction === "asc"
        ? av.localeCompare(bv, "ko")
        : bv.localeCompare(av, "ko");
    });
  }, [monthlyRows, settlementPeriod, view, sort, customStartDate, customEndDate]);

  const toggleSort = (key: MonthlySortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "ym" ? "desc" : "asc" },
    );
  };

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-4xl flex-col overflow-hidden">
      {bankbookRemindDialog}
      {!payoutReady ? (
        <div className="mx-3 mt-3 shrink-0 rounded-2xl border border-amber-200/80 bg-amber-50/90 px-3 py-2.5 sm:mx-3">
          <p className="text-[13px] font-medium text-amber-950">
            통장 사본·입금 계좌가 필요합니다
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-900/90">
            {LAB_PAYOUT_BANKBOOK_DELAY_NOTICE}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-2 h-8 border-amber-300 bg-white text-amber-950 hover:bg-amber-100 hover:text-amber-950"
            onClick={() => navigate(LAB_PAYOUT_SETTINGS_PATH)}
          >
            설정 · 사업자에서 등록
          </Button>
        </div>
      ) : null}
      <DashboardShell
        title="지급"
        subtitle=""
        fillHeight
        statsGridClassName="grid grid-cols-1 gap-3 sm:grid-cols-2"
        stats={
          <>
            <SettlementStatCard
              compact
              label="기공크레딧 잔액"
              value={settlementCredit}
              tone="primary"
              selected={view === "all"}
              onClick={() => setView("all")}
              hint="면세"
              hintTooltip={`${SETTLEMENT_VAT_POLICY.exempt} 기간 적립 ${formatWon(snapshotTotals.earnTotal)} · ${snapshotTotals.earnCount}건`}
              footer={
                <div className="text-[11px] tabular-nums text-slate-600">
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
              compact
              label="기간 지급"
              value={snapshotTotals.payoutTotal}
              selected={view === "payouts"}
              onClick={() => setView("payouts")}
              footer={
                <div className="text-[11px] text-muted-foreground">
                  {snapshotTotals.payoutCount}개월 · 면세{" "}
                  {SETTLEMENT_EXEMPT_INVOICE_LABEL}
                </div>
              }
            />
          </>
        }
        mainLeft={
          <div className="flex h-full min-h-0 min-w-0 flex-col gap-2">
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <PeriodFilter
                value={settlementPeriod}
                onChange={setPeriod}
                presets={SETTLEMENT_PERIOD_PRESETS}
              />
              <SettlementPolicyDialog
                title="기공크레딧 정산 규칙"
                description="적립 · 지급 · 계산서 기준"
              >
                <SettlementPolicySection title="적립">
                  <div className="flex gap-2.5">
                    <HandCoins className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <p>
                      보철은 작업시작 시{" "}
                      <span className="font-semibold text-slate-900">
                        기공크레딧
                      </span>
                      으로 적립됩니다. {LAB_CUSTOM_ABUTMENT_SETTLEMENT_NOTICE}{" "}
                      치과 무료 크레딧 결제분도 동일하며 비용은 플랫폼이
                      부담합니다. 취소·롤백 시 해당 적립은 삭제됩니다.
                    </p>
                  </div>
                </SettlementPolicySection>
                <SettlementPolicySection title="수수료">
                  <div className="flex gap-2.5">
                    <Percent className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <p>
                      <LabDirectPlatformFeeNotice
                        subcontractRatePct={subcontractFeePct}
                      />
                    </p>
                  </div>
                </SettlementPolicySection>
                <SettlementPolicySection title="사용 · 상계">
                  <div className="flex gap-2.5">
                    <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <p>
                      앱 내 주문 차감은{" "}
                      <span className="font-semibold text-slate-900">
                        무료 → 기공 → 유료
                      </span>{" "}
                      순입니다. 기공크레딧 사용분은 월 정산에서 상계됩니다.
                    </p>
                  </div>
                </SettlementPolicySection>
                <SettlementPolicySection title="월 지급">
                  <div className="flex gap-2.5">
                    <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <p>
                      KST 월별 집계 후 등록 계좌로 매월 자동 지급됩니다. 별도
                      요청은 필요 없습니다.{" "}
                      {LAB_SETTLEMENT_PAYOUT_RESERVE_NOTICE}{" "}
                      {LAB_PAYOUT_BANKBOOK_DELAY_NOTICE}
                    </p>
                  </div>
                </SettlementPolicySection>
                <SettlementPolicySection title="면세 · 계산서">
                  <div className="flex gap-2.5">
                    <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <p>{SETTLEMENT_VAT_POLICY.exempt}</p>
                  </div>
                </SettlementPolicySection>
              </SettlementPolicyDialog>
            </div>

            <SettlementTableFrame className="min-h-0 min-w-0 flex-1 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[120px] text-center">
                      <button
                        type="button"
                        className="mx-auto inline-flex items-center gap-1 whitespace-nowrap text-xs sm:text-sm"
                        onClick={() => toggleSort("ym")}
                      >
                        정산월
                        <SettlementSortIcon
                          active={sort.key === "ym"}
                          direction={sort.direction}
                        />
                      </button>
                    </TableHead>
                    <TableHead className="text-center">
                      <button
                        type="button"
                        className="mx-auto inline-flex items-center gap-1 whitespace-nowrap text-xs sm:text-sm"
                        onClick={() => toggleSort("earn")}
                      >
                        적립
                        <SettlementSortIcon
                          active={sort.key === "earn"}
                          direction={sort.direction}
                        />
                      </button>
                    </TableHead>
                    <TableHead className="text-center">
                      <button
                        type="button"
                        className="mx-auto inline-flex items-center gap-1 whitespace-nowrap text-xs sm:text-sm"
                        onClick={() => toggleSort("payout")}
                      >
                        지급
                        <SettlementSortIcon
                          active={sort.key === "payout"}
                          direction={sort.direction}
                        />
                      </button>
                    </TableHead>
                    <TableHead className="w-[120px] text-center">
                      <button
                        type="button"
                        className="mx-auto inline-flex items-center gap-1 whitespace-nowrap text-xs sm:text-sm"
                        onClick={() => toggleSort("status")}
                      >
                        상태
                        <SettlementSortIcon
                          active={sort.key === "status"}
                          direction={sort.direction}
                        />
                      </button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedRows.map((r) => {
                    const earnText =
                      r.earnAmount > 0 || r.earnCount > 0
                        ? `${formatWon(r.earnAmount)}(${r.earnCount})`
                        : "—";
                    const payoutText =
                      r.payoutAmount > 0 ? formatWon(r.payoutAmount) : "—";
                    const statusText = formatStatusCell(
                      r.status,
                      r.invoiceStatus,
                    );

                    return (
                      <TableRow key={r.ym}>
                        <TableCell className="text-center text-xs font-medium tabular-nums whitespace-nowrap">
                          {r.label}
                        </TableCell>
                        <TableCell className="text-center text-xs tabular-nums whitespace-nowrap">
                          {earnText}
                        </TableCell>
                        <TableCell className="text-center text-xs font-semibold tabular-nums text-primary-strong whitespace-nowrap">
                          {payoutText}
                        </TableCell>
                        <TableCell
                          className={`text-center text-[11px] font-medium leading-snug ${
                            r.status ? statusColor(r.status) : "text-muted-foreground"
                          }`}
                        >
                          {statusText}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {loading && sortedRows.length === 0
                    ? Array.from({ length: 6 }).map((_, idx) => (
                        <TableRow key={`payout-skel-${idx}`}>
                          <TableCell className="py-3">
                            <Skeleton className="mx-auto h-4 w-16" />
                          </TableCell>
                          <TableCell className="py-3">
                            <Skeleton className="mx-auto h-4 w-20" />
                          </TableCell>
                          <TableCell className="py-3">
                            <Skeleton className="mx-auto h-4 w-20" />
                          </TableCell>
                          <TableCell className="py-3">
                            <Skeleton className="mx-auto h-4 w-14" />
                          </TableCell>
                        </TableRow>
                      ))
                    : null}
                  {loading && sortedRows.length > 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="py-4 text-center text-sm text-muted-foreground"
                      >
                        불러오는 중...
                      </TableCell>
                    </TableRow>
                  ) : null}
                  {!loading && sortedRows.length === 0 && (
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
          </div>
        }
      />
    </div>
  );
};

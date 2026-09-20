/**
 * 딜러(salesman)·영업팀(salesTeam) 대시보드.
 * 영업팀은 딜러 화면을 그대로 사용한다.
 *
 * 딜러십: 기본 10% · 이벤트 15/20%. 요율 변경 예약 시 해당일 0시(KST)부터 적용.
 * 의뢰자는 가입 당시 요율 적용. 배송비는 수신자(치과·기공소) 부담.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { Button } from "@/components/ui/button";
import { useToast } from "@/shared/hooks/use-toast";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import {
  SETTLEMENT_DEFAULT_PERIOD,
  SETTLEMENT_PERIOD_PRESETS,
} from "@/shared/ui/periodFilterValues";
import {
  Copy,
  BadgeCheck,
  CalendarClock,
  Layers,
  Percent,
  Truck,
  Building2,
} from "lucide-react";
import { SalesmanLedgerModal } from "@/shared/components/SalesmanLedgerModal";
import { PricingPolicyDialog } from "@/shared/ui/PricingPolicyDialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useCommissionDashboard,
  formatMoney,
  summarizeDealershipRateBuckets,
  dealershipRateBucketTip,
  DEALERSHIP_COMMISSION_RATE_PCT_OPTIONS,
} from "@/features/commission/useCommissionDashboard";
import {
  NoOrderAlertBanner,
  useNoOrderAlerts,
} from "@/shared/noOrderAlerts";
import { SettlementStatCard } from "@/shared/settlement/settlementUi";
import { cn } from "@/shared/ui/cn";
import { formatKstYmdToKo, toKstYmd } from "@/shared/date/kst";

export const SalesmanDashboardPage = () => {
  const { user } = useAuthStore();
  const { toast } = useToast();

  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const [ledgerMode, setLedgerMode] = useState<"unpaid" | "paid">("unpaid");
  const [policyOpen, setPolicyOpen] = useState(false);
  const [salesmanPolicyOpen, setSalesmanPolicyOpen] = useState(false);
  const [period, setPeriod] = useState<PeriodFilterValue>(
    SETTLEMENT_DEFAULT_PERIOD,
  );

  const openLedger = (mode: "unpaid" | "paid") => {
    setLedgerMode(mode);
    setCreditModalOpen(true);
  };

  const { data, loading } = useCommissionDashboard(period);
  const {
    data: noOrderAlertsData,
    isLoading: noOrderAlertsLoading,
  } = useNoOrderAlerts(
    "/api/salesman/no-order-alerts",
    "salesman-no-order-alerts",
  );

  if (!user) return null;

  const referralCode = String(data?.referralCode || user.referralCode || "")
    .trim()
    .toUpperCase();
  const normalizedReferralCode = /^[A-Z0-9]{3}$/.test(referralCode)
    ? referralCode
    : "";
  const referralLink =
    typeof window !== "undefined" && normalizedReferralCode
      ? `${window.location.origin}/signup/referral?ref=${encodeURIComponent(normalizedReferralCode)}`
      : "";

  const overview = (data?.overview || {}) as NonNullable<
    ReturnType<typeof useCommissionDashboard>["data"]
  >["overview"];

  const basePct = Math.round(
    Number(data?.dealershipBaseCommissionRate ?? 0.1) * 100,
  );
  const eventPct = Math.round(
    Number(data?.dealershipEventCommissionRate ?? 0.2) * 100,
  );
  const eventEnabled = data?.dealershipEventCommissionEnabled !== false;
  const effectivePct = Math.round(
    Number(data?.commissionRate ?? (eventEnabled ? eventPct : basePct) / 100) *
      100,
  );
  const rateChangeMessage = formatDealershipRateChangeMessage({
    scheduledAt: data?.dealershipRateChangeScheduledAt,
    scheduledRate: data?.dealershipRateChangeScheduledRate,
  });

  const directBusinessCount = Number(
    overview.directBusinessCount || overview.directOrganizationCount || 0,
  );
  const payableGross = Number(
    overview.payableGrossCommissionAmount ||
      overview.totalCommissionAmount ||
      overview.monthCommissionAmount ||
      0,
  );
  const paidNet = Number(overview.paidNetCommissionAmount || 0);
  const practiceCount = Number(overview.practiceOrganizationCount || 0);
  const labCount = Number(overview.labOrganizationCount || 0);
  const rateOpts = {
    eventPct: eventPct || 20,
    basePct: basePct || 10,
    eventEnabled,
  };
  const rateBuckets = summarizeDealershipRateBuckets(data?.organizations);
  const paidRateBuckets = DEALERSHIP_COMMISSION_RATE_PCT_OPTIONS.map((pct) => ({
    pct,
    commissionAmount: 0,
  }));

  return (
    <TooltipProvider>
      <DashboardShell
        title="딜러 대시보드"
        subtitle=""
        headerRight={
          <div className="flex w-full flex-col gap-3">
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <PeriodFilter
                value={period}
                onChange={setPeriod}
                presets={SETTLEMENT_PERIOD_PRESETS}
                useStoreCustomRange={false}
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button asChild size="sm" variant="outline" className="h-8">
                  <Link to="/#pitch">
                    <Layers className="mr-1.5 h-3.5 w-3.5" />
                    소개·피치
                  </Link>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => setPolicyOpen(true)}
                >
                  의뢰자 정책
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => setSalesmanPolicyOpen(true)}
                >
                  딜러십 정책
                </Button>
              </div>
            </div>
            <DealershipTermsCard
              basePct={basePct || 10}
              eventPct={eventPct || 20}
              eventEnabled={eventEnabled}
              effectivePct={effectivePct || (eventEnabled ? 20 : 10)}
              rateChangeMessage={rateChangeMessage}
            />
          </div>
        }
        statsGridClassName="grid grid-cols-1 gap-3 sm:grid-cols-3"
        stats={
          <>
            <div className="flex min-h-[7.25rem] flex-col rounded-2xl border-2 border-primary/60 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex cursor-help items-center gap-1.5 text-sm font-semibold text-slate-900">
                      <BadgeCheck className="h-4 w-4 text-primary" />
                      내 소개 코드
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    의뢰자 가입 시 입력하는 내 코드
                  </TooltipContent>
                </Tooltip>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 border-primary text-primary-strong hover:bg-primary-soft"
                  disabled={!referralLink}
                  onClick={async () => {
                    try {
                      if (!referralLink) return;
                      await navigator.clipboard.writeText(referralLink);
                      toast({
                        title: "URL 복사됨",
                        description: referralLink,
                        duration: 2000,
                      });
                    } catch {
                      toast({
                        title: "복사 실패",
                        description: "브라우저 권한을 확인해주세요.",
                        variant: "destructive",
                        duration: 3000,
                      });
                    }
                  }}
                >
                  <Copy className="h-3.5 w-3.5" />
                  가입 링크 복사
                </Button>
              </div>
              <div className="flex flex-1 items-center justify-center font-mono text-5xl font-bold tracking-[0.2em] text-slate-900 sm:text-6xl">
                {normalizedReferralCode || (loading ? "…" : "—")}
              </div>
            </div>

            <SettlementStatCard
              label="미정산 수수료"
              value={payableGross}
              tone="primary"
              onClick={() => openLedger("unpaid")}
              footer={
                <div className="space-y-0.5 text-xs text-muted-foreground">
                  {rateBuckets.map((b) => (
                    <div key={b.pct}>
                      {b.pct}% · {formatMoney(b.commissionAmount)}원
                    </div>
                  ))}
                </div>
              }
            />

            <SettlementStatCard
              label="지급 완료 수수료"
              value={paidNet}
              onClick={() => openLedger("paid")}
              footer={
                <div className="space-y-0.5 text-xs text-muted-foreground">
                  {paidRateBuckets.map((b) => (
                    <div key={b.pct}>
                      {b.pct}% · {formatMoney(b.commissionAmount)}원
                    </div>
                  ))}
                </div>
              }
            />
          </>
        }
        topSection={
          <div className="space-y-3 px-0.5">
            {rateChangeMessage ? (
              <div className="flex items-start gap-2.5 rounded-2xl border border-amber-200/80 bg-amber-50/60 px-3.5 py-3 shadow-sm sm:px-4">
                <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                  <CalendarClock className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-amber-950">
                    요율 변경 예정
                  </div>
                  <p className="mt-0.5 text-sm leading-relaxed text-amber-900/80">
                    {rateChangeMessage}
                  </p>
                </div>
              </div>
            ) : null}
            <NoOrderAlertBanner
              data={noOrderAlertsData}
              loading={noOrderAlertsLoading}
            />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SummaryTile
                icon={Building2}
                label="소개 의뢰자"
                primary={`${directBusinessCount.toLocaleString()}개소`}
                secondary={`치과 ${practiceCount} · 기공소 ${labCount}`}
                tip="내가 소개한 의뢰자 사업자(1단계)"
              />
              {rateBuckets.map((b) => (
                <SummaryTile
                  key={b.pct}
                  icon={Percent}
                  label={`${b.pct}%`}
                  primary={`${b.orgCount.toLocaleString()}개소`}
                  secondary={`수수료 ${formatMoney(b.commissionAmount)}원`}
                  tip={dealershipRateBucketTip(b.pct, rateOpts)}
                />
              ))}
            </div>
          </div>
        }
        mainLeft={null}
        mainRight={null}
      />

      <SalesmanLedgerModal
        key={ledgerMode}
        open={creditModalOpen}
        onOpenChange={setCreditModalOpen}
        mode="self"
        title={ledgerMode === "paid" ? "지급 완료 수수료" : "미정산 수수료"}
        initialType={ledgerMode === "paid" ? "PAYOUT" : "all"}
      />
      <PricingPolicyDialog
        open={policyOpen}
        onOpenChange={setPolicyOpen}
        variant="default"
      />
      <PricingPolicyDialog
        open={salesmanPolicyOpen}
        onOpenChange={setSalesmanPolicyOpen}
        variant="salesman"
        dealershipBasePct={basePct || 10}
        dealershipEventPct={eventPct || 20}
        dealershipEventEnabled={eventEnabled}
      />
    </TooltipProvider>
  );
};

function formatDealershipRateChangeMessage({
  scheduledAt,
  scheduledRate,
}: {
  scheduledAt?: string | Date | null;
  scheduledRate?: number | null;
}): string | null {
  if (!scheduledAt || scheduledRate == null) return null;
  const ymd = toKstYmd(scheduledAt);
  if (!ymd) return null;
  const applyAt = new Date(`${ymd}T00:00:00+09:00`);
  if (Number.isNaN(applyAt.getTime()) || Date.now() >= applyAt.getTime()) {
    return null;
  }
  const pct = Math.round(Number(scheduledRate) * 100);
  if (!Number.isFinite(pct) || pct < 0) return null;
  const dateLabel = formatKstYmdToKo(ymd).replace(/\.$/, "");
  return `${dateLabel} 0시부터 영업 수수료가 ${pct}%로 변경됩니다.`;
}

function DealershipTermsCard({
  basePct,
  eventPct,
  eventEnabled,
  effectivePct,
  rateChangeMessage,
}: {
  basePct: number;
  eventPct: number;
  eventEnabled: boolean;
  effectivePct: number;
  rateChangeMessage?: string | null;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-4 py-4 text-white shadow-sm sm:px-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-4">
        <div className="shrink-0 sm:w-[7.5rem]">
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/55">
            딜러십
          </div>
          <h2 className="mt-1 text-base font-semibold tracking-tight sm:text-lg">
            파트너 조건
          </h2>
        </div>
        <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <div className="flex items-start gap-2.5 rounded-xl bg-white/5 px-3 py-2.5">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10">
              <Percent className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold">
                영업 수수료 {effectivePct}%
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-white/70">
                심플웨이 · 커스텀어벗 판매가 대비({effectivePct}%). 배송비 제외.
              </p>
              {rateChangeMessage ? (
                <p className="mt-1.5 text-[11px] leading-relaxed text-amber-200/95">
                  {rateChangeMessage}
                </p>
              ) : eventEnabled ? (
                <p className="mt-1.5 text-[11px] leading-relaxed text-emerald-200/90">
                  이벤트 기간인 지금은 {eventPct}%. 추후 15%·10%으로 조정될 수
                  있음.
                </p>
              ) : (
                <p className="mt-1.5 text-[11px] leading-relaxed text-white/65">
                  현재 표준 요율 {basePct}%. 이벤트 유치 요율은 {eventPct}%.
                </p>
              )}
            </div>
          </div>
          <div className="flex items-start gap-2.5 rounded-xl bg-white/5 px-3 py-2.5">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10">
              <Truck className="h-3.5 w-3.5" />
            </span>
            <div>
              <div className="text-sm font-semibold">배송비 수신자 부담</div>
              <p className="mt-0.5 text-xs leading-relaxed text-white/70">
                치과 또는 기공소가 부담합니다
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  primary,
  secondary,
  tip,
}: {
  icon: typeof Building2;
  label: string;
  primary: string;
  secondary: string;
  tip: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "cursor-help rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm",
          )}
        >
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Icon className="h-3.5 w-3.5" />
            {label}
          </div>
          <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
            {primary}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">{secondary}</div>
        </div>
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

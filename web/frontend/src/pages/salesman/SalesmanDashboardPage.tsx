/**
 * 딜러(salesman) 대시보드 — 수수료·소개 코드.
 *
 * 딜러 수수료: 거래처 판매가(1.2~1.5만) − 1만원. 판매가는 거래처 페이지에서 정한다.
 * 지급 완료는 기간 장부 지급액이다.
 * 90일 무주문이면 소개 코드 리셋. 누구든 다시 영업 가능.
 * 의뢰자 정책: 치과·기공소 공통(기공소 리메이크 안내, 단일가 1.5만).
 */

import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Layers,
  Percent,
  Building2,
  Factory,
  RefreshCw,
} from "lucide-react";
import { SalesmanLedgerModal } from "@/shared/components/SalesmanLedgerModal";
import { PricingPolicyDialog } from "@/shared/ui/PricingPolicyDialog";
import { DealerSettlementRulesContent } from "@/features/commission/DealerSettlementRulesContent";
import {
  DEALERSHIP_DASHBOARD_BAND_LINE,
  DEALERSHIP_SETTLEMENT_RULE_DIALOG_LEAD,
  REFERRAL_OWNERSHIP_RESET_ANYONE_SHORT,
  REFERRAL_OWNERSHIP_RESET_POLICY_SHORT,
} from "@/shared/sales/dealershipPolicyCopy";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useCommissionDashboard,
  summarizeRequestorKindStats,
} from "@/features/commission/useCommissionDashboard";
import {
  NoOrderAlertBanner,
  useNoOrderAlerts,
} from "@/shared/noOrderAlerts";
import {
  GUIDE_DIALOG_BODY_CLASS,
  GUIDE_DIALOG_CONTENT_CLASS,
  GUIDE_DIALOG_HEADER_CLASS,
  SettlementStatCard,
} from "@/shared/settlement/settlementUi";
import { ProductCommissionLines } from "@/features/commission/ProductCommissionLines";
import { cn } from "@/shared/ui/cn";

/** 소개 코드·수수료·의뢰자 카드를 같은 칸으로 맞춘다. */
const DASHBOARD_CARD_GRID_CLASS =
  "grid w-full grid-cols-1 items-stretch gap-3 lg:grid-cols-3";

const DASHBOARD_STAT_CARD_CLASS =
  "h-full min-h-[9.25rem] w-full max-w-none px-4 py-4 sm:min-h-[9.75rem] sm:px-5";

export const SalesmanDashboardPage = () => {
  const { user } = useAuthStore();
  const { toast } = useToast();

  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const [ledgerMode, setLedgerMode] = useState<"unpaid" | "paid">("unpaid");
  const [policyOpen, setPolicyOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
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

  const payableGross = Number(
    overview.payableGrossCommissionAmount ||
      overview.totalCommissionAmount ||
      overview.monthCommissionAmount ||
      0,
  );
  const paidNet = Number(overview.paidNetCommissionAmount || 0);
  const practiceCount = Number(overview.practiceOrganizationCount || 0);
  const labCount = Number(overview.labOrganizationCount || 0);
  const kindStats = summarizeRequestorKindStats(data?.organizations);
  const practiceTileCount = data?.organizations
    ? kindStats.practice.count
    : practiceCount;
  const labTileCount = data?.organizations ? kindStats.lab.count : labCount;
  const totalTileCount = data?.organizations
    ? kindStats.total.count
    : practiceTileCount + labTileCount;
  const payoutDay = Number(data?.payoutDayOfMonth || 0);
  const practiceOrders = Number(kindStats.practice.orderCount || 0);
  const labOrders = Number(kindStats.lab.orderCount || 0);
  const totalOrders = Number(kindStats.total.orderCount || 0);

  return (
    <TooltipProvider>
      <DashboardShell
        title="딜러 대시보드"
        subtitle=""
        headerRight={
          <div className="flex w-full flex-col gap-3 px-1">
            <div className="flex w-full min-w-0 flex-nowrap items-center gap-2">
              <PeriodFilter
                value={period}
                onChange={setPeriod}
                presets={SETTLEMENT_PERIOD_PRESETS}
                useStoreCustomRange={false}
                className="shrink-0"
              />
              <div className="flex shrink-0 flex-wrap items-center gap-2">
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
              </div>
            </div>
            <DealershipTermsCard onOpenSplit={() => setSplitOpen(true)} />
          </div>
        }
        statsGridClassName={DASHBOARD_CARD_GRID_CLASS}
        stats={
          <>
            <div className="flex h-full min-h-[9.25rem] w-full flex-col rounded-2xl border-2 border-primary/55 bg-white p-5 shadow-sm sm:min-h-[9.75rem]">
              <div className="flex flex-wrap items-center justify-between gap-2">
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
              <div className="flex flex-1 items-center justify-center pl-[0.12em] font-mono text-5xl font-bold tracking-[0.16em] text-slate-900 xl:text-6xl xl:tracking-[0.18em]">
                {normalizedReferralCode || (loading ? "…" : "—")}
              </div>
            </div>

            <SettlementStatCard
              className={DASHBOARD_STAT_CARD_CLASS}
              label="미정산 수수료"
              value={payableGross}
              tone="primary"
              onClick={() => openLedger("unpaid")}
            />

            <SettlementStatCard
              className={DASHBOARD_STAT_CARD_CLASS}
              label="지급 완료 수수료"
              value={paidNet}
              onClick={() => openLedger("paid")}
            />
          </>
        }
        topSection={
          <div className="space-y-3 px-1">
            <NoOrderAlertBanner
              data={noOrderAlertsData}
              loading={noOrderAlertsLoading}
            />
            <div className={DASHBOARD_CARD_GRID_CLASS}>
              <SummaryTile
                icon={Building2}
                tone="practice"
                label="치과"
                primary={`${practiceTileCount.toLocaleString()}개소`}
                secondary={
                  <KindTileMeta
                    commission={kindStats.practice.customAbutmentCommissionAmount}
                    orders={practiceOrders}
                  />
                }
                tip="내가 소개한 치과의 기간 수수료와 주문"
              />
              <SummaryTile
                icon={Factory}
                tone="lab"
                label="기공소"
                primary={`${labTileCount.toLocaleString()}개소`}
                secondary={
                  <KindTileMeta
                    commission={kindStats.lab.customAbutmentCommissionAmount}
                    orders={labOrders}
                  />
                }
                tip="내가 소개한 기공소의 기간 수수료와 주문"
              />
              <SummaryTile
                icon={Layers}
                tone="total"
                label="전체"
                primary={`${totalTileCount.toLocaleString()}개소`}
                secondary={
                  <KindTileMeta
                    commission={kindStats.total.customAbutmentCommissionAmount}
                    orders={totalOrders}
                  />
                }
                tip="소개한 치과·기공소의 기간 수수료와 주문 합계"
              />
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
        variant="requestor"
      />
      <Dialog open={splitOpen} onOpenChange={setSplitOpen}>
        <DialogContent
          className={cn(GUIDE_DIALOG_CONTENT_CLASS, "sm:max-w-md")}
        >
          <DialogHeader className={GUIDE_DIALOG_HEADER_CLASS}>
            <DialogTitle className="text-xl font-semibold tracking-tight text-slate-900">
              딜러 정산 규칙
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              {DEALERSHIP_SETTLEMENT_RULE_DIALOG_LEAD}
            </DialogDescription>
          </DialogHeader>
          <div className={GUIDE_DIALOG_BODY_CLASS}>
            <DealerSettlementRulesContent
              payoutDayOfMonth={payoutDay > 0 ? payoutDay : 1}
            />
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};

function DealershipTermsCard({
  onOpenSplit,
}: {
  onOpenSplit: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 px-4 py-5 text-white shadow-sm sm:px-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch sm:gap-5">
        <div className="flex shrink-0 flex-col justify-center sm:w-[7.5rem]">
          <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/55">
            딜러십
          </div>
          <h2 className="mt-1 text-base font-semibold tracking-tight sm:text-lg">
            계약 내용
          </h2>
        </div>
        <div className="grid min-w-0 flex-1 items-stretch gap-3 sm:grid-cols-2">
          <TermsItem
            title="커스텀어벗 영업 수수료"
            onClick={onOpenSplit}
            body={DEALERSHIP_DASHBOARD_BAND_LINE}
          />
          <TermsItem
            icon={RefreshCw}
            title="소개 리셋"
            body={
              <>
                {REFERRAL_OWNERSHIP_RESET_POLICY_SHORT}
                <br />
                {REFERRAL_OWNERSHIP_RESET_ANYONE_SHORT}
              </>
            }
          />
        </div>
      </div>
    </div>
  );
}

function TermsItem({
  icon: Icon = Percent,
  title,
  body,
  onClick,
  actionLabel,
}: {
  icon?: typeof Percent;
  title: string;
  body: ReactNode;
  onClick?: () => void;
  actionLabel?: string;
}) {
  const className = cn(
    "flex h-full min-h-[6.25rem] w-full items-start gap-3 rounded-xl px-3.5 py-3.5 text-left",
    onClick
      ? "cursor-pointer bg-white/[0.07] transition-colors hover:bg-white/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
      : "bg-white/5",
  );
  const inner = (
    <>
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">{title}</div>
          {actionLabel ? (
            <span className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-medium text-sky-100">
              {actionLabel}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-white/75">{body}</p>
      </div>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {inner}
      </button>
    );
  }
  return <div className={className}>{inner}</div>;
}

const SUMMARY_TONE_CLASS = {
  practice: "bg-sky-50 text-sky-700",
  lab: "bg-violet-50 text-violet-700",
  total: "bg-primary-soft text-primary-strong",
} as const;

function KindTileMeta({
  commission,
  orders,
}: {
  commission: number;
  orders?: number;
}) {
  const orderCount = Number(orders || 0);
  return (
    <>
      <ProductCommissionLines customAbutment={commission} />
      <div className="mt-1">
        기간 주문 {orderCount.toLocaleString("ko-KR")}건
      </div>
    </>
  );
}

function SummaryTile({
  icon: Icon,
  tone,
  label,
  primary,
  secondary,
  tip,
}: {
  icon: typeof Building2;
  tone: keyof typeof SUMMARY_TONE_CLASS;
  label: string;
  primary: string;
  secondary?: ReactNode;
  tip?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex h-full min-h-[8.25rem] cursor-help flex-col justify-between rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2.5 text-sm font-semibold text-slate-900">
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                SUMMARY_TONE_CLASS[tone],
              )}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 truncate">{label}</span>
          </div>
          <div className="mt-4">
            <div className="text-2xl font-semibold tabular-nums tracking-tight text-slate-900">
              {primary}
            </div>
            {secondary ? (
              <div className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                {secondary}
              </div>
            ) : null}
          </div>
        </div>
      </TooltipTrigger>
      {tip ? <TooltipContent className="max-w-xs">{tip}</TooltipContent> : null}
    </Tooltip>
  );
}

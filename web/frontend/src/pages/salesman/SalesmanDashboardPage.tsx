/**
 * 딜러(salesman) 전용 대시보드.
 *
 * 딜러십: 기본 10%(추후 공지) · 이벤트 기간 가입 의뢰자 15%.
 * 배송비는 수신자(치과·기공소) 부담.
 */

import { useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { Button } from "@/components/ui/button";
import { useToast } from "@/shared/hooks/use-toast";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import { PeriodFilter, type PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import {
  Copy,
  BadgeCheck,
  Percent,
  Truck,
  Users,
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
} from "@/features/commission/useCommissionDashboard";
import {
  NoOrderAlertBanner,
  useNoOrderAlerts,
} from "@/shared/noOrderAlerts";
import { SettlementStatCard } from "@/shared/settlement/settlementUi";
import { cn } from "@/shared/ui/cn";

export const SalesmanDashboardPage = () => {
  const { user } = useAuthStore();
  const { toast } = useToast();

  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [salesmanPolicyOpen, setSalesmanPolicyOpen] = useState(false);
  const [period, setPeriod] = useState<PeriodFilterValue>("30d");

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
    Number(data?.dealershipEventCommissionRate ?? 0.15) * 100,
  );
  const eventEnabled = data?.dealershipEventCommissionEnabled !== false;
  const effectivePct = Math.round(
    Number(data?.commissionRate ?? (eventEnabled ? eventPct : basePct) / 100) *
      100,
  );

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
  const referralSalesmanCount = (data?.referralSalesmen || []).length;
  const directOrders = (data?.organizations || []).reduce(
    (sum, b) => sum + Number(b?.monthOrderCount || 0),
    0,
  );
  const eventOrgCount = Number(overview.eventOrganizationCount || 0);
  const baseOrgCount = Number(overview.baseOrganizationCount || 0);
  const eventCommission = Number(overview.eventCommissionAmount || 0);
  const baseCommission = Number(overview.baseCommissionAmount || 0);
  const practiceCount = Number(overview.practiceOrganizationCount || 0);
  const labCount = Number(overview.labOrganizationCount || 0);

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
                useStoreCustomRange={false}
              />
              <div className="flex flex-wrap items-center gap-2">
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
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8"
                  onClick={() => setCreditModalOpen(true)}
                >
                  보유 크레딧 {formatMoney(payableGross)}원
                </Button>
              </div>
            </div>
            <DealershipTermsCard
              basePct={basePct || 10}
              eventPct={eventPct || 15}
              eventEnabled={eventEnabled}
              effectivePct={effectivePct || (eventEnabled ? 15 : 10)}
            />
          </div>
        }
        statsGridClassName="grid grid-cols-1 gap-3 sm:grid-cols-3"
        stats={
          <>
            <div className="rounded-2xl border-2 border-primary/60 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex cursor-help items-center gap-1.5 text-sm font-semibold text-slate-900">
                      <BadgeCheck className="h-4 w-4 text-primary" />
                      내 소개 코드
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    의뢰자·딜러 가입 시 입력하는 내 코드
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
                  링크 복사
                </Button>
              </div>
              <div className="font-mono text-3xl font-bold tracking-[0.2em] text-slate-900 sm:text-4xl">
                {normalizedReferralCode || (loading ? "…" : "—")}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                내 코드로 가입한 딜러사{" "}
                {referralSalesmanCount.toLocaleString()}개소
              </p>
            </div>

            <SettlementStatCard
              label="영업 수수료 합계"
              value={payableGross}
              tone="primary"
              onClick={() => setCreditModalOpen(true)}
              hint="미정산"
              hintTooltip="유치 시점별 요율(이벤트/기본)을 적용한 기간 수수료 합계"
              footer={
                <div className="space-y-0.5 text-xs text-muted-foreground">
                  <div>
                    이벤트 {eventPct}% · {formatMoney(eventCommission)}원
                  </div>
                  <div>
                    기본 {basePct}% · {formatMoney(baseCommission)}원
                  </div>
                </div>
              }
            />

            <SettlementStatCard
              label="지급 완료"
              value={paidNet}
              onClick={() => setCreditModalOpen(true)}
              hint="세후 입금"
              hintTooltip="선택한 기간에 이미 지급된 수수료"
            />
          </>
        }
        topSection={
          <div className="space-y-3 px-0.5">
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
              <SummaryTile
                icon={Percent}
                label={`이벤트 ${eventPct}%`}
                primary={`${eventOrgCount.toLocaleString()}개소`}
                secondary={`수수료 ${formatMoney(eventCommission)}원`}
                tip="이벤트 기간 내 유치(가입)한 치과·기공소"
              />
              <SummaryTile
                icon={Percent}
                label={`기본 ${basePct}%`}
                primary={`${baseOrgCount.toLocaleString()}개소`}
                secondary={`수수료 ${formatMoney(baseCommission)}원`}
                tip="이벤트 기간 외 유치(가입)한 치과·기공소"
              />
              <SummaryTile
                icon={Users}
                label="소개 딜러사"
                primary={`${referralSalesmanCount.toLocaleString()}개소`}
                secondary={`기간 의뢰 ${directOrders.toLocaleString()}건`}
                tip="내가 소개한 딜러사 수"
              />
            </div>
          </div>
        }
        mainLeft={null}
        mainRight={null}
      />

      <SalesmanLedgerModal
        open={creditModalOpen}
        onOpenChange={setCreditModalOpen}
        mode="self"
        titleSuffix="보유 크레딧 (미지급 수수료)"
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
        dealershipEventPct={eventPct || 15}
        dealershipEventEnabled={eventEnabled}
      />
    </TooltipProvider>
  );
};

function DealershipTermsCard({
  basePct,
  eventPct,
  eventEnabled,
  effectivePct,
}: {
  basePct: number;
  eventPct: number;
  eventEnabled: boolean;
  effectivePct: number;
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
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm font-semibold">
                {eventEnabled ? (
                  <>
                    <span className="text-white/45 line-through decoration-white/50">
                      {basePct}%
                    </span>
                    <span>영업 수수료 {effectivePct}%</span>
                  </>
                ) : (
                  <span>영업 수수료 {effectivePct}%</span>
                )}
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-white/70">
                심플웨이 · 커스텀어벗 판매가 대비 비율. 배송비 제외.
              </p>
              {eventEnabled ? (
                <p className="mt-1.5 text-[11px] leading-relaxed text-emerald-200/90 whitespace-nowrap">
                  이벤트 기간 내 유치(가입) 고객 {eventPct}% · 추후 공지 후{" "}
                  {basePct}%로 변경될 예정.
                </p>
              ) : (
                <p className="mt-1.5 text-[11px] leading-relaxed text-white/65">
                  유치 시점에 따라 이벤트 {eventPct}% / 기본 {basePct}%가
                  구분 적용됩니다
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

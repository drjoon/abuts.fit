// change-log:
// - 2026-08-17: 영업자·개발운영사 모두 지급 시 VAT·세금계산서. 관리자(어벗츠)만 면세.
// related files:
// - web/frontend/src/pages/salesman/SalesmanPaymentsPage.tsx
// - web/frontend/src/pages/devops/DevopsPaymentsPage.tsx
// - web/frontend/src/features/commission/useCommissionDashboard.ts
// - web/frontend/src/shared/settlement/affiliateVat.ts
import { useMemo, useState } from "react";
import { Landmark, Percent, CalendarClock } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { usePeriodStore } from "@/store/usePeriodStore";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { CommissionLedgerInline } from "@/shared/components/CommissionLedgerInline";
import {
  useCommissionDashboard,
  formatMoney,
} from "@/features/commission/useCommissionDashboard";
import {
  SETTLEMENT_TAXABLE_INVOICE_LABEL,
  SETTLEMENT_VAT_POLICY,
  splitAffiliateVat,
  vatPctLabel,
} from "@/shared/settlement/affiliateVat";
import {
  SettlementPolicyDialog,
  SettlementPolicySection,
  SettlementStatCard,
  SettlementVatNotice,
} from "@/shared/settlement/settlementUi";

export type CommissionPaymentsVariant = "salesman" | "devops";

export function CommissionPaymentsPage({
  variant,
}: {
  variant: CommissionPaymentsVariant;
}) {
  const { user } = useAuthStore();
  const { period, setPeriod } = usePeriodStore();
  const [tab, setTab] = useState<"businesses" | "ledger">("businesses");
  const { data, loading } = useCommissionDashboard(period);

  const isSalesman = variant === "salesman";
  const overview = data?.overview;
  const payableSupply = Number(overview?.payableGrossCommissionAmount || 0);
  const paidSupply = Number(overview?.paidNetCommissionAmount || 0);
  const freeNet = Number(overview?.freeNetAmount || 0);
  const paidVat = splitAffiliateVat(paidSupply);
  const ratePct = Math.round(Number(data?.commissionRate || 0) * 100);
  const payoutPolicy = isSalesman
    ? SETTLEMENT_VAT_POLICY.salesmanPayout
    : SETTLEMENT_VAT_POLICY.devopsPayout;

  const organizations = useMemo(
    () => (Array.isArray(data?.organizations) ? data.organizations : []),
    [data?.organizations],
  );

  const title = isSalesman ? "딜러 정산" : "개발운영사 정산";

  if (!user) return null;

  return (
    <DashboardShell
      title={title}
      subtitle=""
      statsGridClassName="grid grid-cols-1 gap-3 sm:grid-cols-3"
      stats={
        <>
          <SettlementStatCard
            label="유료 미정산 공급가"
            value={payableSupply}
            tone="primary"
            selected={tab === "businesses"}
            onClick={() => setTab("businesses")}
            hint={`지급 시 +부가세 ${vatPctLabel()}`}
            hintTooltip={payoutPolicy}
          />
          <SettlementStatCard
            label="지급 합계(부가세 포함)"
            value={paidVat.total}
            selected={tab === "ledger"}
            onClick={() => setTab("ledger")}
            footer={
              <div className="text-xs text-muted-foreground">
                {SETTLEMENT_TAXABLE_INVOICE_LABEL}
              </div>
            }
          />
          <SettlementStatCard
            label="무료 미정산"
            value={freeNet}
            hint="참고 · 지급 0"
            footer={
              <div className="text-[11px] tabular-nums text-slate-600 sm:text-xs">
                의뢰 {formatMoney(overview?.freeNetRequestAmount)}원 / 배송{" "}
                {formatMoney(overview?.freeNetShippingAmount)}원
              </div>
            }
          />
        </>
      }
      mainLeft={
        <div className="space-y-4">
          <Tabs
            value={tab}
            onValueChange={(v) => {
              if (v === "businesses" || v === "ledger") setTab(v);
            }}
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <PeriodFilter value={period} onChange={setPeriod} />
              <SettlementVatNotice />
              <SettlementPolicyDialog
                title={`${title} 규칙`}
                description={
                  isSalesman
                    ? "소개 수수료 공급가 · 지급 시 부가세 · 세금계산서"
                    : "잔여 분배 공급가 · 지급 시 부가세 · 세금계산서"
                }
              >
                <SettlementPolicySection title="수수료율">
                  <div className="flex gap-2.5">
                    <Percent className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <p>
                      {isSalesman ? "소개 수수료" : "잔여 분배"} {ratePct}%. 정산은
                      사업자(`businessAnchorId`) 단위이며 매월{" "}
                      {Number(data?.payoutDayOfMonth || 1)}일에 지급합니다.
                    </p>
                  </div>
                </SettlementPolicySection>
                <SettlementPolicySection title="부가세 · 세금계산서">
                  <div className="flex gap-2.5">
                    <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <p>{payoutPolicy}</p>
                  </div>
                </SettlementPolicySection>
                <SettlementPolicySection title="무료 수익">
                  <div className="flex gap-2.5">
                    <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <p>
                      무료 의뢰·배송 수익은 확인용이며 지급 대상이 아닙니다.
                    </p>
                  </div>
                </SettlementPolicySection>
              </SettlementPolicyDialog>
            </div>

            <TabsContent value="businesses" className="mt-0">
              {loading ? (
                <div className="rounded-2xl border border-slate-200/80 bg-white/70 px-4 py-10 text-center text-sm text-muted-foreground">
                  불러오는 중...
                </div>
              ) : organizations.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-10 text-center text-sm text-muted-foreground">
                  선택한 기간에 표시할 정산 대상 사업자가 없습니다.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {organizations.map((org) => (
                    <div
                      key={String(org.businessAnchorId || org.name)}
                      className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm"
                    >
                      <div className="text-sm font-semibold text-slate-900">
                        {org.name || "-"}
                      </div>
                      <div className="mt-3 space-y-1.5 text-sm">
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground">소개 단계</span>
                          <span>
                            {org.referralLevel === "unaffiliated"
                              ? "딜러사 미설정"
                              : "소개"}
                          </span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground">기간 매출</span>
                          <span className="tabular-nums">
                            {formatMoney(org.monthRevenueAmount)}원
                          </span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground">기간 주문</span>
                          <span className="tabular-nums">
                            {Number(org.monthOrderCount || 0).toLocaleString()}건
                          </span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground">
                            기간 정산 공급가
                          </span>
                          <span className="font-semibold tabular-nums">
                            {formatMoney(org.monthCommissionAmount)}원
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="ledger" className="mt-0">
              <CommissionLedgerInline mode="self" period={period} />
            </TabsContent>
          </Tabs>
        </div>
      }
    />
  );
}

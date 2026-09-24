// change-log:
// - 2026-09-24: 딜러 정산 — 월 매출 누진 슬라이스 footer.
// - 2026-09-21: 메인 상단 VAT 안내 문구 제거(정산규칙 모달만 유지).
// - 2026-09-20: 지급 합계 — 20%·15%·10% 세로 3줄(대시보드 지급 완료와 동일).
// - 2026-09-20: 유료 미정산 — 20%·15%·10% 세로 3줄, 「현재/추후」 접두 제거.
// - 2026-09-20: 딜러 정산 — 이벤트/기본 → 현재/추후 요율 라벨, 정책 카피 정리.
// - 2026-09-06: 미정산=부가세 포함가. 지급 재가산 없음.
// - 2026-08-17: 영업자·개발운영사 모두 지급 시 VAT·세금계산서. 관리자(어벗츠)만 면세.
// related files:
// - web/frontend/src/pages/salesman/SalesmanPaymentsPage.tsx
// - web/frontend/src/pages/devops/DevopsPaymentsPage.tsx
// - web/frontend/src/features/commission/useCommissionDashboard.ts
// - web/frontend/src/shared/settlement/affiliateVat.ts
import { useEffect, useMemo, useState } from "react";
import { Landmark, Percent, CalendarClock } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { usePeriodStore } from "@/store/usePeriodStore";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import {
  isSettlementPeriodValue,
  SETTLEMENT_DEFAULT_PERIOD,
  SETTLEMENT_PERIOD_PRESETS,
} from "@/shared/ui/periodFilterValues";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { CommissionLedgerInline } from "@/shared/components/CommissionLedgerInline";
import {
  useCommissionDashboard,
  formatMoney,
  formatCommissionRatePct,
  requestorKindLabel,
  summarizeDealershipRateBuckets,
  DEALERSHIP_COMMISSION_RATE_PCT_OPTIONS,
} from "@/features/commission/useCommissionDashboard";
import {
  SETTLEMENT_TAXABLE_INVOICE_LABEL,
  SETTLEMENT_VAT_POLICY,
  splitInclusiveVat,
} from "@/shared/settlement/affiliateVat";
import {
  SettlementPolicyDialog,
  SettlementPolicySection,
  SettlementStatCard,
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

  useEffect(() => {
    if (!isSettlementPeriodValue(period)) {
      setPeriod(SETTLEMENT_DEFAULT_PERIOD);
    }
  }, [period, setPeriod]);

  const settlementPeriod = isSettlementPeriodValue(period)
    ? period
    : SETTLEMENT_DEFAULT_PERIOD;
  const { data, loading } = useCommissionDashboard(settlementPeriod);

  const isSalesman = variant === "salesman";
  const overview = data?.overview;
  const payableInclusive = Number(overview?.payableGrossCommissionAmount || 0);
  const paidInclusive = Number(overview?.paidNetCommissionAmount || 0);
  const freeNet = Number(overview?.freeNetAmount || 0);
  const payableSplit = splitInclusiveVat(payableInclusive);
  const ratePct = Math.round(Number(data?.commissionRate || 0) * 100);
  const payoutPolicy = isSalesman
    ? SETTLEMENT_VAT_POLICY.salesmanPayout
    : SETTLEMENT_VAT_POLICY.devopsPayout;

  const organizations = useMemo(
    () => (Array.isArray(data?.organizations) ? data.organizations : []),
    [data?.organizations],
  );
  const rateBuckets = useMemo(
    () => summarizeDealershipRateBuckets(organizations),
    [organizations],
  );
  const paidRateBuckets = useMemo(
    () =>
      DEALERSHIP_COMMISSION_RATE_PCT_OPTIONS.map((pct) => ({
        pct,
        commissionAmount: 0,
        orgCount: 0,
      })),
    [],
  );

  const title = isSalesman ? "딜러 정산" : "개발운영사 정산";

  if (!user) return null;

  return (
    <DashboardShell
      title={title}
      subtitle=""
      statsGridClassName="grid grid-cols-1 gap-3 md:grid-cols-3"
      stats={
        <>
          <SettlementStatCard
            label="유료 미정산"
            value={payableInclusive}
            tone="primary"
            selected={tab === "businesses"}
            onClick={() => setTab("businesses")}
            hint="부가세 포함"
            hintTooltip={`${payoutPolicy} 공급가 ${payableSplit.supply.toLocaleString("ko-KR")}원 · VAT ${payableSplit.vat.toLocaleString("ko-KR")}원`}
            footer={
              isSalesman ? (
                <div className="space-y-0.5 text-[11px] tabular-nums text-muted-foreground sm:text-xs">
                  {rateBuckets.map((b) => (
                    <div key={b.pct}>
                      {b.pct}% · {formatMoney(b.commissionAmount)}원
                    </div>
                  ))}
                </div>
              ) : undefined
            }
          />
          <SettlementStatCard
            label="지급 합계"
            value={paidInclusive}
            selected={tab === "ledger"}
            onClick={() => setTab("ledger")}
            hint={isSalesman ? SETTLEMENT_TAXABLE_INVOICE_LABEL : undefined}
            footer={
              isSalesman ? (
                <div className="space-y-0.5 text-[11px] tabular-nums text-muted-foreground sm:text-xs">
                  {paidRateBuckets.map((b) => (
                    <div key={b.pct}>
                      {b.pct}% · {formatMoney(b.commissionAmount)}원
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  {SETTLEMENT_TAXABLE_INVOICE_LABEL}
                </div>
              )
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
              <PeriodFilter
                value={settlementPeriod}
                onChange={setPeriod}
                presets={SETTLEMENT_PERIOD_PRESETS}
              />
              <SettlementPolicyDialog
                title={`${title} 규칙`}
                description={
                  isSalesman
                    ? "유치 시점 요율 고정(신규 기본 20% · 관리자 인하 15%/10%) · 배송비 수신자 부담 · 부가세 포함·세금계산서"
                    : "잔여 분배 부가세 포함 · 세금계산서"
                }
              >
                <SettlementPolicySection title="수수료율">
                  <div className="flex gap-2.5">
                    <Percent className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <p>
                      {isSalesman ? (
                        <>
                          영업 수수료는 심플웨이·커스텀어벗 판매가(배송비 제외)
                          기준입니다. 의뢰자 유치(가입·재귀속) 당시 요율이
                          계속 적용됩니다. 관리자가 신규 유치 요율을 인하해도
                          기존 유치 건은 유지됩니다. 3개월(90일) 무주문으로
                          소개 귀속이 리셋된 뒤 재유치하면 그 시점 요율이
                          새로 적용됩니다. 정산은 사업자 단위이며 매월{" "}
                          {Number(data?.payoutDayOfMonth || 1)}일에 지급합니다.
                        </>
                      ) : (
                        <>
                          잔여 분배 {ratePct}%. 정산은 사업자(
                          `businessAnchorId`) 단위이며 매월{" "}
                          {Number(data?.payoutDayOfMonth || 1)}일에 지급합니다.
                        </>
                      )}
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
                  {organizations.map((org) => {
                    const ratePctForOrg =
                      org.commissionRate != null
                        ? Math.round(Number(org.commissionRate) * 100)
                        : null;
                    const acquiredLabel = org.acquiredAt
                      ? new Intl.DateTimeFormat("ko-KR", {
                          timeZone: "Asia/Seoul",
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                        }).format(new Date(org.acquiredAt))
                      : "-";
                    return (
                      <div
                        key={String(org.businessAnchorId || org.name)}
                        className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-900">
                              {org.name || "-"}
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {requestorKindLabel(org.requestorKind)} · 유치{" "}
                              {acquiredLabel}
                            </div>
                          </div>
                          {ratePctForOrg != null ? (
                            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                              {formatCommissionRatePct(org.commissionRate)}
                            </span>
                          ) : null}
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
                          {!isSalesman || org.monthCommissionAmount > 0 ? (
                            <div className="flex justify-between gap-3">
                              <span className="text-muted-foreground">
                                기간 수수료(
                                {formatCommissionRatePct(org.commissionRate)})
                              </span>
                              <span className="font-semibold tabular-nums">
                                {formatMoney(org.monthCommissionAmount)}원
                              </span>
                            </div>
                          ) : (
                            <div className="flex justify-between gap-3">
                              <span className="text-muted-foreground">
                                유치 요율
                              </span>
                              <span className="font-semibold tabular-nums">
                                {formatCommissionRatePct(org.commissionRate)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="ledger" className="mt-0">
              <CommissionLedgerInline mode="self" period={settlementPeriod} />
            </TabsContent>
          </Tabs>
        </div>
      }
    />
  );
}

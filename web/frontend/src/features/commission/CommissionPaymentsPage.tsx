// change-log:
// - 2026-10-05: 개발운영 정산 규칙 — 딜러와 같은 칩·표. 의뢰비 5%(어벗츠 몫).
// - 2026-10-05: 딜러 정산 규칙 모달 — 커스텀어벗만. 중복 안내 제거 · 칩·카드.
// - 2026-10-05: 딜러 정산 규칙 — 커스텀어벗 구간·누적 분배비.
// - 2026-09-27: 정산 카드 하단 — 20%·15%·10% 대신 심플웨이 10% · 커스텀어벗 20%.
// - 2026-09-27: 딜러 정산 규칙 — 심플웨이 10% · 커스텀어벗 20% · 기공 제외 · 소개 코드 리셋.
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
import { useAuthStore } from "@/store/useAuthStore";
import { usePeriodStore } from "@/store/usePeriodStore";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import {
  DashboardNoticeAlert,
  DASHBOARD_NOTICE_HEADER_CLASS,
} from "@/shared/notices/DashboardNoticeAlert";
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
  requestorKindLabel,
} from "@/features/commission/useCommissionDashboard";
import { ProductCommissionLines } from "@/features/commission/ProductCommissionLines";
import {
  SETTLEMENT_TAXABLE_INVOICE_LABEL,
  SETTLEMENT_VAT_POLICY,
  splitInclusiveVat,
} from "@/shared/settlement/affiliateVat";
import {
  DEALERSHIP_SETTLEMENT_RULE_DIALOG_LEAD,
  REFERRAL_OWNERSHIP_INACTIVE_DAYS,
  REFERRAL_OWNERSHIP_RESET_ANYONE_LINE,
} from "@/shared/sales/dealershipPolicyCopy";
import {
  GUIDE_FACT_GRID_CLASS,
  SettlementPolicyDialog,
  SettlementPolicyFact,
  SETTLEMENT_STAT_CARD_WIDTH_CLASS,
  SETTLEMENT_STAT_ROW_CLASS,
  SettlementStatCard,
} from "@/shared/settlement/settlementUi";
import {
  CustomAbutmentDealerSplitTable,
  CustomAbutmentDevopsSplitTable,
} from "@/shared/settlement/CustomAbutmentSplitPolicyTables";
import { DEVOPS_FROM_ABUTS_SHARE_PCT } from "@/shared/settlement/customAbutmentSplitPolicy";

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
  const payoutPolicy = isSalesman
    ? SETTLEMENT_VAT_POLICY.salesmanPayout
    : SETTLEMENT_VAT_POLICY.devopsPayout;

  const organizations = useMemo(
    () => (Array.isArray(data?.organizations) ? data.organizations : []),
    [data?.organizations],
  );
  const customAbutmentCommission = Number(
    overview?.customAbutmentCommissionAmount || 0,
  );

  const title = isSalesman ? "딜러 정산" : "개발운영사 정산";

  if (!user) return null;

  return (
    <DashboardShell
      title={title}
      subtitle=""
      statsGridClassName={SETTLEMENT_STAT_ROW_CLASS}
      stats={
        <>
          <SettlementStatCard
            className={SETTLEMENT_STAT_CARD_WIDTH_CLASS}
            label="유료 미정산"
            value={payableInclusive}
            tone="primary"
            selected={tab === "businesses"}
            onClick={() => setTab("businesses")}
            hint="부가세 포함"
            hintTooltip={`${payoutPolicy} 공급가 ${payableSplit.supply.toLocaleString("ko-KR")}원 · VAT ${payableSplit.vat.toLocaleString("ko-KR")}원`}
            footer={
              <ProductCommissionLines
                customAbutment={customAbutmentCommission}
                rateLabel={
                  isSalesman
                    ? undefined
                    : `${DEVOPS_FROM_ABUTS_SHARE_PCT}%`
                }
                className="text-[11px] text-muted-foreground sm:text-xs"
              />
            }
          />
          <SettlementStatCard
            className={SETTLEMENT_STAT_CARD_WIDTH_CLASS}
            label="지급 합계"
            value={paidInclusive}
            selected={tab === "ledger"}
            onClick={() => setTab("ledger")}
            hint={SETTLEMENT_TAXABLE_INVOICE_LABEL}
            footer={
              <ProductCommissionLines
                customAbutment={0}
                rateLabel={
                  isSalesman
                    ? undefined
                    : `${DEVOPS_FROM_ABUTS_SHARE_PCT}%`
                }
                className="text-[11px] text-muted-foreground sm:text-xs"
              />
            }
          />
          <SettlementStatCard
            className={SETTLEMENT_STAT_CARD_WIDTH_CLASS}
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
            <div className="mb-2 flex min-w-0 flex-nowrap items-center gap-2">
              <PeriodFilter
                value={settlementPeriod}
                onChange={setPeriod}
                presets={SETTLEMENT_PERIOD_PRESETS}
                className="shrink-0"
              />
              <DashboardNoticeAlert
                placement="inline"
                className={DASHBOARD_NOTICE_HEADER_CLASS}
              />
              <SettlementPolicyDialog
                title={`${title} 규칙`}
                description={DEALERSHIP_SETTLEMENT_RULE_DIALOG_LEAD}
                contentClassName="sm:max-w-3xl"
              >
                <div className="space-y-4">
                  {isSalesman ? (
                    <CustomAbutmentDealerSplitTable />
                  ) : (
                    <CustomAbutmentDevopsSplitTable />
                  )}
                  <div className={GUIDE_FACT_GRID_CLASS}>
                    {isSalesman ? (
                      <>
                        <SettlementPolicyFact label="제외">
                          기공 · 스토어 · 배송비 · 월정액
                        </SettlementPolicyFact>
                        <SettlementPolicyFact label="소개 코드">
                          {REFERRAL_OWNERSHIP_INACTIVE_DAYS}일 무주문이면
                          리셋됩니다.
                          <br />
                          {REFERRAL_OWNERSHIP_RESET_ANYONE_LINE}
                        </SettlementPolicyFact>
                      </>
                    ) : (
                      <>
                        <SettlementPolicyFact label="분배">
                          의뢰비 대비 {DEVOPS_FROM_ABUTS_SHARE_PCT}%입니다.
                          <br />
                          어벗츠 몫에서 뗍니다.
                        </SettlementPolicyFact>
                        <SettlementPolicyFact label="제외">
                          기공 · 스토어 · 배송비
                        </SettlementPolicyFact>
                      </>
                    )}
                    <SettlementPolicyFact label="세금계산서">
                      지급은 잔액 그대로입니다.
                      <br />
                      ÷1.1로 공급가·세액을 나눕니다.
                    </SettlementPolicyFact>
                    <SettlementPolicyFact label="지급">
                      사업자 단위 · 매월{" "}
                      {Number(data?.payoutDayOfMonth || 1)}일
                      <br />
                      무료 의뢰·배송은 지급 대상이 아닙니다.
                    </SettlementPolicyFact>
                  </div>
                </div>
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
                          <ProductCommissionLines
                            customAbutment={Number(
                              org.monthCustomAbutmentCommissionAmount ??
                                org.monthCommissionAmount ??
                                0,
                            )}
                            rateLabel={
                              isSalesman
                                ? undefined
                                : `${DEVOPS_FROM_ABUTS_SHARE_PCT}%`
                            }
                            className="pt-1 text-sm text-slate-900"
                          />
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

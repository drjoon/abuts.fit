// change-log:
// - 2026-08-13: 영업자 크레딧 탭 스타일·카피 모던화.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/pages/admin/credits/AdminCreditPage.tsx
// - web/frontend/src/pages/admin/credits/creditPageUi.tsx
import type { RefObject } from "react";
import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TabsContent } from "@/components/ui/tabs";
import type { SalesmanCreditRow } from "../adminCredit.types";
import {
  CreditPanel,
  CreditSectionHeader,
  CreditStatTile,
} from "../creditPageUi";

type SalesmanSummary = {
  totalSalesmen: number;
  totalBalance: number;
  totalEarned: number;
  totalPaidOut: number;
  totalReferredRevenue30d: number;
  totalReferredBonus30d: number;
};

type SalesmanCreditTabProps = {
  loadingSalesmanOverview: boolean;
  salesmanSummary: SalesmanSummary;
  salesmanSortKey: "balance" | "commission" | "revenue" | "name";
  setSalesmanSortKey: (
    value: "balance" | "commission" | "revenue" | "name",
  ) => void;
  loadingSalesmen: boolean;
  salesmen: SalesmanCreditRow[];
  salesmanScrollRef: RefObject<HTMLDivElement | null>;
  salesmanSentinelRef: RefObject<HTMLDivElement | null>;
  onOpenLedger: (row: SalesmanCreditRow) => void;
};

function won(n: number) {
  return `${n.toLocaleString()}원`;
}

export function SalesmanCreditTab({
  loadingSalesmanOverview,
  salesmanSortKey,
  setSalesmanSortKey,
  loadingSalesmen,
  salesmen,
  salesmanScrollRef,
  salesmanSentinelRef,
  onOpenLedger,
}: SalesmanCreditTabProps) {
  const salesmanRows = salesmen.filter((s) => {
    const role = String(s.role || "").trim();
    if (!role) return true;
    return role === "salesman" || role === "devops";
  });

  const summaryForView = {
    totalSalesmen: salesmanRows.length,
    totalBalance: salesmanRows.reduce(
      (acc, s) => acc + Number(s?.wallet?.balanceAmountPeriod || 0),
      0,
    ),
    totalEarned: salesmanRows.reduce(
      (acc, s) => acc + Number(s?.performance30d?.commissionAmount ?? 0),
      0,
    ),
    totalPaidOut: salesmanRows.reduce(
      (acc, s) => acc + Number(s?.wallet?.paidOutAmountPeriod || 0),
      0,
    ),
    totalReferredRevenue30d: salesmanRows.reduce(
      (acc, s) => acc + Number(s?.performance30d?.revenueAmount || 0),
      0,
    ),
    totalReferredBonus30d: salesmanRows.reduce(
      (acc, s) => acc + Number(s?.performance30d?.bonusAmount || 0),
      0,
    ),
  };

  const loading = loadingSalesmanOverview;
  const commissionRate = (() => {
    const base = Number(summaryForView.totalReferredRevenue30d || 0);
    const comm = Number(summaryForView.totalEarned || 0);
    if (base <= 0) return "-";
    return `${((comm / base) * 100).toFixed(1)}%`;
  })();

  return (
    <TabsContent value="salesman" className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <CreditStatTile
          label="딜러"
          value={loading ? "…" : summaryForView.totalSalesmen.toLocaleString()}
        />
        <CreditStatTile
          label="소개 매출"
          value={
            loading
              ? "…"
              : won(
                  Number(summaryForView.totalReferredRevenue30d || 0) +
                    Number(summaryForView.totalReferredBonus30d || 0),
                )
          }
          hint={
            <>
              <div>
                유료 {won(Number(summaryForView.totalReferredRevenue30d || 0))}
              </div>
              <div>
                무료 {won(Number(summaryForView.totalReferredBonus30d || 0))}
              </div>
            </>
          }
        />
        <CreditStatTile
          label="수수료"
          value={loading ? "…" : won(summaryForView.totalEarned)}
          hint={<>수수료율 {commissionRate}</>}
        />
        <CreditStatTile
          label="기간 잔액"
          value={loading ? "…" : won(summaryForView.totalBalance)}
        />
        <CreditStatTile
          label="정산"
          value={loading ? "…" : won(summaryForView.totalPaidOut)}
        />
      </div>

      <CreditPanel>
        <div className="space-y-5 p-5 sm:p-6">
          <CreditSectionHeader
            icon={Users}
            title="딜러 크레딧"
            description="기간 잔액·수수료·소개 매출입니다. 카드를 누르면 원장을 엽니다."
            trailing={
              <select
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                value={salesmanSortKey}
                onChange={(e) =>
                  setSalesmanSortKey(
                    e.target.value as
                      | "balance"
                      | "commission"
                      | "revenue"
                      | "name",
                  )
                }
              >
                <option value="balance">잔액순</option>
                <option value="commission">수수료순</option>
                <option value="revenue">매출순</option>
                <option value="name">이름순</option>
              </select>
            }
          />

          {loadingSalesmen && salesmanRows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              불러오는 중…
            </div>
          ) : salesmanRows.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              딜러 데이터가 없습니다.
            </div>
          ) : (
            <div ref={salesmanScrollRef}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {[...salesmanRows]
                  .sort((a, b) => {
                    if (salesmanSortKey === "balance") {
                      return (
                        Number(b.wallet?.balanceAmountPeriod || 0) -
                        Number(a.wallet?.balanceAmountPeriod || 0)
                      );
                    }
                    if (salesmanSortKey === "commission") {
                      return (
                        Number(b.performance30d?.commissionAmount || 0) -
                        Number(a.performance30d?.commissionAmount || 0)
                      );
                    }
                    if (salesmanSortKey === "revenue") {
                      return (
                        Number(b.performance30d?.revenueAmount || 0) -
                        Number(a.performance30d?.revenueAmount || 0)
                      );
                    }
                    return String(a.name || "").localeCompare(
                      String(b.name || ""),
                      "ko",
                    );
                  })
                  .map((s) => (
                    <button
                      key={s.salesmanId}
                      type="button"
                      onClick={() => onOpenLedger(s)}
                      className="rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50/60"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900">
                            {s.name}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {s.email}
                          </div>
                          <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                            {s.referralCode || "-"}
                          </div>
                        </div>
                        <Badge variant={s.active ? "default" : "secondary"}>
                          {s.active ? "활성" : "비활성"}
                        </Badge>
                      </div>

                      <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-slate-50/80 px-2.5 py-2">
                        <div>
                          <div className="text-[10px] text-muted-foreground">
                            잔액
                          </div>
                          <div className="text-xs font-semibold tabular-nums">
                            {Number(
                              s.wallet?.balanceAmountPeriod || 0,
                            ).toLocaleString()}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground">
                            적립
                          </div>
                          <div className="text-xs font-medium tabular-nums">
                            {Number(
                              s.wallet?.earnedAmountPeriod || 0,
                            ).toLocaleString()}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground">
                            정산
                          </div>
                          <div className="text-xs font-medium tabular-nums">
                            {Number(
                              s.wallet?.paidOutAmountPeriod || 0,
                            ).toLocaleString()}
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 space-y-1 text-xs">
                        <div className="flex justify-between gap-2 text-muted-foreground">
                          <span>소개 조직 / 딜러</span>
                          <span className="font-medium text-slate-700">
                            {Number(s.performance30d?.referredOrgCount || 0)} /{" "}
                            {Number(s.referredSalesmanCount || 0)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2 text-muted-foreground">
                          <span>소개 매출</span>
                          <span className="tabular-nums text-slate-700">
                            {Number(
                              s.performance30d?.revenueAmount || 0,
                            ).toLocaleString()}
                            원
                            {Number(s.performance30d?.bonusAmount || 0) > 0
                              ? ` (+무료 ${Number(s.performance30d?.bonusAmount || 0).toLocaleString()})`
                              : ""}
                          </span>
                        </div>
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">수수료</span>
                          <span className="font-semibold tabular-nums text-primary-strong">
                            {Number(
                              s.performance30d?.commissionAmount ?? 0,
                            ).toLocaleString()}
                            원
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
              </div>
              <div ref={salesmanSentinelRef} className="h-10" />
            </div>
          )}
        </div>
      </CreditPanel>
    </TabsContent>
  );
}

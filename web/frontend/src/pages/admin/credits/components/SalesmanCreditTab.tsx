import type { RefObject } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import type { SalesmanCreditRow } from "../adminCredit.types";

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

export function SalesmanCreditTab({
  loadingSalesmanOverview,
  salesmanSummary,
  salesmanSortKey,
  setSalesmanSortKey,
  loadingSalesmen,
  salesmen,
  salesmanScrollRef,
  salesmanSentinelRef,
  onOpenLedger,
}: SalesmanCreditTabProps) {
  const salesmanRows = salesmen.filter(
    (s) => String(s.role || "").trim() === "salesman",
  );

  const summaryForView = {
    totalSalesmen: salesmanRows.length,
    totalBalance: salesmanRows.reduce(
      (acc, s) => acc + Number(s?.wallet?.balanceAmountPeriod || 0),
      0,
    ),
    totalEarned: salesmanRows.reduce(
      (acc, s) =>
        acc +
        Number(
          (s?.performance30d?.myCommissionAmount ?? 0) +
            (s?.performance30d?.level1CommissionAmount ?? 0),
        ),
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

  return (
    <TabsContent value="salesman" className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">총 영업자 수</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingSalesmanOverview
                ? "..."
                : summaryForView.totalSalesmen.toLocaleString()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              소개 매출 (기간)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingSalesmanOverview
                ? "..."
                : `${(
                    Number(summaryForView.totalReferredRevenue30d || 0) +
                    Number(summaryForView.totalReferredBonus30d || 0)
                  ).toLocaleString()}원`}
            </div>
            <div className="text-xs text-muted-foreground">
              유료{" "}
              {Number(
                summaryForView.totalReferredRevenue30d || 0,
              ).toLocaleString()}
              원
            </div>
            <div className="text-xs text-muted-foreground">
              무료{" "}
              {Number(
                summaryForView.totalReferredBonus30d || 0,
              ).toLocaleString()}
              원
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">수수료</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingSalesmanOverview
                ? "..."
                : `${summaryForView.totalEarned.toLocaleString()}원`}
            </div>
            <div className="text-xs text-muted-foreground">
              수수료율{" "}
              {(() => {
                const base = Number(
                  summaryForView.totalReferredRevenue30d || 0,
                );
                const comm = Number(summaryForView.totalEarned || 0);
                if (base <= 0) return "-";
                return `${((comm / base) * 100).toFixed(1)}%`;
              })()}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">기간 잔액</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingSalesmanOverview
                ? "..."
                : `${summaryForView.totalBalance.toLocaleString()}원`}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">총 정산</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loadingSalesmanOverview
                ? "..."
                : `${summaryForView.totalPaidOut.toLocaleString()}원`}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle>영업자 크레딧</CardTitle>
            </div>
            <div className="w-[170px]">
              <select
                className="h-9 w-full rounded-md border border-input bg-muted/40 px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={salesmanSortKey}
                onChange={(e) => setSalesmanSortKey(e.target.value as any)}
              >
                <option value="balance">정렬: 잔액순</option>
                <option value="commission">정렬: 수수료순</option>
                <option value="revenue">정렬: 매출순</option>
                <option value="name">정렬: 이름순</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingSalesmen ? (
            <div className="text-center py-8 text-muted-foreground">
              불러오는 중...
            </div>
          ) : salesmanRows.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              영업자 데이터가 없습니다.
            </div>
          ) : (
            <div
              ref={salesmanScrollRef}
              className="h-[60vh] overflow-y-auto pr-1"
            >
              <div className="grid gap-4 md:grid-cols-3">
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
                    <Card
                      key={s.salesmanId}
                      className="border-muted cursor-pointer"
                      onClick={() => onOpenLedger(s)}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <CardTitle className="text-base">
                              {s.name}
                            </CardTitle>
                            <div className="space-y-1 text-sm text-muted-foreground">
                              <div>{s.email}</div>
                              <div className="font-mono">
                                code: {s.referralCode || "-"}
                              </div>
                            </div>
                          </div>
                          <Badge variant={s.active ? "default" : "secondary"}>
                            {s.active ? "활성" : "비활성"}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm">
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <div className="text-muted-foreground text-xs">
                              기간 잔액
                            </div>
                            <div className="font-semibold">
                              {Number(
                                s.wallet?.balanceAmountPeriod || 0,
                              ).toLocaleString()}
                              원
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground text-xs">
                              기간 적립
                            </div>
                            <div className="font-medium">
                              {Number(
                                s.wallet?.earnedAmountPeriod || 0,
                              ).toLocaleString()}
                              원
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground text-xs">
                              기간 정산
                            </div>
                            <div className="font-medium">
                              {Number(
                                s.wallet?.paidOutAmountPeriod || 0,
                              ).toLocaleString()}
                              원
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <div className="text-muted-foreground text-xs">
                              소개 조직수
                            </div>
                            <div className="font-medium">
                              {Number(s.performance30d?.referredOrgCount || 0)}
                              직접 /{" "}
                              {Number(s.performance30d?.level1OrgCount || 0)}
                              간접
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground text-xs">
                              소개 영업자수
                            </div>
                            <div className="font-medium">
                              {Number(s.referredSalesmanCount || 0)}
                            </div>
                          </div>
                        </div>
                        <div className="rounded-md bg-muted/40 px-3 py-2 space-y-0.5">
                          <div className="text-xs font-semibold text-muted-foreground mb-1">
                            직접 수수료
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">
                              직접 유료 매출{" "}
                              {Number(
                                s.performance30d?.directRevenueAmount || 0,
                              ).toLocaleString()}
                              원
                              {Number(
                                s.performance30d?.directBonusAmount || 0,
                              ) > 0 && (
                                <span className="text-muted-foreground/70">
                                  {" "}
                                  (무료{" "}
                                  {Number(
                                    s.performance30d?.directBonusAmount || 0,
                                  ).toLocaleString()}
                                  원)
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">
                              직접 소개 수수료
                            </span>
                            <span className="font-semibold text-blue-700">
                              {Number(
                                s.performance30d?.myCommissionAmount ?? 0,
                              ).toLocaleString()}
                              원
                              <span className="text-muted-foreground font-normal ml-1">
                                (매출 × 5%)
                              </span>
                            </span>
                          </div>
                        </div>
                        <div className="rounded-md bg-muted/40 px-3 py-2 space-y-0.5">
                          <div className="text-xs font-semibold text-muted-foreground mb-1">
                            간접 수수료
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">
                              간접 유료 매출{" "}
                              {Number(
                                s.performance30d?.level1RevenueAmount || 0,
                              ).toLocaleString()}
                              원
                              {Number(
                                s.performance30d?.level1BonusAmount || 0,
                              ) > 0 && (
                                <span className="text-muted-foreground/70">
                                  {" "}
                                  (무료{" "}
                                  {Number(
                                    s.performance30d?.level1BonusAmount || 0,
                                  ).toLocaleString()}
                                  원)
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">
                              간접 소개 수수료
                            </span>
                            <span className="font-semibold text-blue-700">
                              {Number(
                                s.performance30d?.level1CommissionAmount ?? 0,
                              ).toLocaleString()}
                              원
                              <span className="text-muted-foreground font-normal ml-1">
                                (매출 × 2.5%)
                              </span>
                            </span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </div>
              <div ref={salesmanSentinelRef} className="h-10" />
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}

// related files:
// - web/frontend/rules.md
// - web/frontend/src/pages/admin/credits/components/RequestorCreditTab.tsx
// - web/frontend/src/pages/admin/credits/adminCredit.types.ts
// - web/frontend/src/components/ui/card.tsx
import type { RefObject } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import type { BusinessCredit } from "../adminCredit.types";

type RequestorOrganizationsTabProps = {
  orgSortKey: "paidBalance" | "freeBalance" | "spentPaid" | "name";
  setOrgSortKey: (
    value: "paidBalance" | "freeBalance" | "spentPaid" | "name",
  ) => void;
  loadingOrgs: boolean;
  businesses: BusinessCredit[];
  orgScrollRef: RefObject<HTMLDivElement | null>;
  orgSentinelRef: RefObject<HTMLDivElement | null>;
  onOpenLedger: (business: BusinessCredit) => void;
};

export function RequestorOrganizationsTab({
  orgSortKey,
  setOrgSortKey,
  loadingOrgs,
  businesses,
  orgScrollRef,
  orgSentinelRef,
  onOpenLedger,
}: RequestorOrganizationsTabProps) {
  const requestorBusinesses = businesses.filter((business) => {
    if (typeof business.isFreeCreditEligible === "boolean") {
      return business.isFreeCreditEligible;
    }
    return String(business.businessType || "").trim() === "requestor";
  });

  return (
    <TabsContent value="organizations" className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle>의뢰자 크레딧</CardTitle>
            <div className="w-[180px]">
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={orgSortKey}
                onChange={(e) =>
                  setOrgSortKey(
                    e.target.value as
                      | "paidBalance"
                      | "freeBalance"
                      | "spentPaid"
                      | "name",
                  )
                }
              >
                <option value="paidBalance">정렬: 유료잔액순</option>
                <option value="freeBalance">정렬: 무료잔액순</option>
                <option value="spentPaid">정렬: 유료사용순</option>
                <option value="name">정렬: 이름순</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingOrgs ? (
            <div className="text-center py-8 text-muted-foreground">
              불러오는 중...
            </div>
          ) : (
            <div ref={orgScrollRef} className="h-[60vh] overflow-y-auto pr-1">
              {requestorBusinesses.length === 0 && !loadingOrgs ? (
                <div className="text-center py-8 text-muted-foreground">
                  의뢰자가 없습니다.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {[...requestorBusinesses]
                    .sort((a, b) => {
                      if (orgSortKey === "paidBalance") {
                        return (
                          Number(b.paidCredit ?? b.paidBalance ?? 0) -
                          Number(a.paidCredit ?? a.paidBalance ?? 0)
                        );
                      }
                      if (orgSortKey === "freeBalance") {
                        const bFreeBalance = Number(b.freeBalance ?? 0);
                        const aFreeBalance = Number(a.freeBalance ?? 0);
                        return bFreeBalance - aFreeBalance;
                      }
                      if (orgSortKey === "spentPaid") {
                        return (
                          Number(b.spentPaidAmount || 0) -
                          Number(a.spentPaidAmount || 0)
                        );
                      }
                      return String(a.name || "").localeCompare(
                        String(b.name || ""),
                        "ko",
                      );
                    })
                    .map((business) => {
                      const paidCredit = Number(business.paidCredit || 0);
                      const freeRequestCredit = Number(
                        business.freeRequestCredit ?? 0,
                      );
                      const freeShippingCredit = Number(
                        business.freeShippingCredit ?? 0,
                      );
                      const chargedPaid = Number(business.chargedPaidAmount || 0);
                      const chargedFreeRequest = Number(
                        business.chargedFreeRequestAmount ?? 0,
                      );
                      const chargedFreeShipping = Number(
                        business.chargedFreeShippingAmount ?? 0,
                      );
                      const spentPaid = Number(business.spentPaidAmount || 0);
                      const spentFreeRequest = Number(
                        business.spentFreeRequestAmount ?? 0,
                      );
                      const spentFreeShipping = Number(
                        business.spentFreeShippingAmount ?? 0,
                      );

                      return (
                        <Card
                          key={business._id}
                          className="border-muted cursor-pointer"
                          onClick={() => onOpenLedger(business)}
                        >
                          <CardHeader className="space-y-1 px-4 pb-2 pt-4">
                            <CardTitle className="text-base leading-5">
                              {business.name}
                            </CardTitle>
                            <div className="text-xs text-muted-foreground">
                              {business.ownerName || "-"} · {business.ownerEmail || "-"}
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-2 px-4 pb-4 pt-0 text-sm">
                            <div className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-2 rounded-md border border-muted/60 px-2 py-1.5">
                              <div className="text-xs font-semibold text-muted-foreground">
                                잔여
                              </div>
                              <div className="grid grid-cols-2 grid-rows-2 gap-x-2 gap-y-0.5">
                                <div className="text-[10px] text-muted-foreground">유료</div>
                                <div className="text-[10px] text-muted-foreground">무료</div>
                                <div className="text-xs font-semibold">
                                  {paidCredit.toLocaleString()}원
                                </div>
                                <div className="text-xs font-semibold">
                                  {(
                                    freeRequestCredit + freeShippingCredit
                                  ).toLocaleString()}
                                  원
                                </div>
                              </div>
                            </div>
                            <div className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-2 rounded-md border border-muted/60 px-2 py-1.5">
                              <div className="text-xs font-semibold text-muted-foreground">
                                충전
                              </div>
                              <div className="grid grid-cols-2 grid-rows-2 gap-x-2 gap-y-0.5">
                                <div className="text-[10px] text-muted-foreground">유료</div>
                                <div className="text-[10px] text-muted-foreground">무료</div>
                                <div className="text-xs font-medium">
                                  {chargedPaid.toLocaleString()}원
                                </div>
                                <div className="text-xs font-medium">
                                  {(
                                    chargedFreeRequest + chargedFreeShipping
                                  ).toLocaleString()}
                                  원
                                </div>
                              </div>
                            </div>
                            <div className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-2 rounded-md border border-muted/60 px-2 py-1.5">
                              <div className="text-xs font-semibold text-muted-foreground">
                                사용
                              </div>
                              <div className="grid grid-cols-2 grid-rows-2 gap-x-2 gap-y-0.5">
                                <div className="text-[10px] text-muted-foreground">유료</div>
                                <div className="text-[10px] text-muted-foreground">무료</div>
                                <div className="text-xs font-medium">
                                  {spentPaid.toLocaleString()}원
                                </div>
                                <div className="text-xs font-medium">
                                  {(
                                    spentFreeRequest + spentFreeShipping
                                  ).toLocaleString()}
                                  원
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                </div>
              )}
              <div ref={orgSentinelRef} className="h-6" />
              {loadingOrgs && businesses.length > 0 && (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  불러오는 중...
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  );
}

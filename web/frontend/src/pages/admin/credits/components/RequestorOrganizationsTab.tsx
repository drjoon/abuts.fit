import type { RefObject } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TabsContent } from "@/components/ui/tabs";
import type { BusinessCredit } from "../adminCredit.types";

type RequestorOrganizationsTabProps = {
  orgSortKey: "paidBalance" | "bonusBalance" | "spentPaid" | "name";
  setOrgSortKey: (
    value: "paidBalance" | "bonusBalance" | "spentPaid" | "name",
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
  const requestorBusinesses = businesses.filter(
    (b) => b.businessType === "requestor",
  );

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
                onChange={(e) => setOrgSortKey(e.target.value as any)}
              >
                <option value="paidBalance">정렬: 유료잔액순</option>
                <option value="bonusBalance">정렬: 무료잔액순</option>
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
                <div className="grid gap-4 md:grid-cols-2">
                  {[...requestorBusinesses]
                    .sort((a, b) => {
                      if (orgSortKey === "paidBalance") {
                        return (
                          Number(b.paidBalance || 0) -
                          Number(a.paidBalance || 0)
                        );
                      }
                      if (orgSortKey === "bonusBalance") {
                        return (
                          Number(b.bonusBalance || 0) -
                          Number(a.bonusBalance || 0)
                        );
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
                      const bonusRequestCredit = Number(
                        business.bonusRequestCredit || 0,
                      );
                      const bonusShippingCredit = Number(
                        business.bonusShippingCredit || 0,
                      );
                      const chargedPaid = Number(
                        business.chargedPaidAmount || 0,
                      );
                      const chargedBonusRequest = Number(
                        business.chargedBonusRequestAmount || 0,
                      );
                      const chargedBonusShipping = Number(
                        business.chargedBonusShippingAmount || 0,
                      );
                      const spentPaid = Number(business.spentPaidAmount || 0);
                      const spentBonusRequest = Number(
                        business.spentBonusRequestAmount || 0,
                      );
                      const spentBonusShipping = Number(
                        business.spentBonusShippingAmount || 0,
                      );

                      return (
                        <Card
                          key={business._id}
                          className="border-muted cursor-pointer"
                          onClick={() => onOpenLedger(business)}
                        >
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base">
                              {business.name}
                            </CardTitle>
                            <div className="space-y-1 text-sm text-muted-foreground">
                              <div>{business.companyName || "-"}</div>
                              <div className="font-mono text-xs">
                                {business.businessNumber || "-"}
                              </div>
                              <div className="font-mono text-[11px] text-muted-foreground">
                                anchor: {business.businessAnchorId || "-"}
                              </div>
                              <div className="text-xs">
                                {business.ownerName || "-"} ·{" "}
                                {business.ownerEmail || "-"}
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-4 text-sm">
                            <div>
                              <div className="text-xs font-semibold text-muted-foreground mb-2">
                                잔여 크레딧
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <div className="text-[11px] text-muted-foreground">
                                    유료
                                  </div>
                                  <div className="font-semibold">
                                    {paidCredit.toLocaleString()}원
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[11px] text-muted-foreground">
                                    무료·의뢰
                                  </div>
                                  <div className="font-semibold">
                                    {bonusRequestCredit.toLocaleString()}원
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[11px] text-muted-foreground">
                                    무료·배송
                                  </div>
                                  <div className="font-semibold">
                                    {bonusShippingCredit.toLocaleString()}원
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold text-muted-foreground mb-2">
                                충전 크레딧
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <div className="text-[11px] text-muted-foreground">
                                    유료
                                  </div>
                                  <div className="font-medium">
                                    {chargedPaid.toLocaleString()}원
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[11px] text-muted-foreground">
                                    무료·의뢰
                                  </div>
                                  <div className="font-medium">
                                    {chargedBonusRequest.toLocaleString()}원
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[11px] text-muted-foreground">
                                    무료·배송
                                  </div>
                                  <div className="font-medium">
                                    {chargedBonusShipping.toLocaleString()}원
                                  </div>
                                </div>
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold text-muted-foreground mb-2">
                                사용 크레딧
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <div className="text-[11px] text-muted-foreground">
                                    유료
                                  </div>
                                  <div className="font-medium">
                                    {spentPaid.toLocaleString()}원
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[11px] text-muted-foreground">
                                    무료·의뢰
                                  </div>
                                  <div className="font-medium">
                                    {spentBonusRequest.toLocaleString()}원
                                  </div>
                                </div>
                                <div>
                                  <div className="text-[11px] text-muted-foreground">
                                    무료·배송
                                  </div>
                                  <div className="font-medium">
                                    {spentBonusShipping.toLocaleString()}원
                                  </div>
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

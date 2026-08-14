// change-log:
// - 2026-08-14: 섹션 제목을 「치과 · 기공소 크레딧」으로 표기.
// - 2026-08-13: 무료 잔액 통합 표시, 카드 스타일 모던화.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/pages/admin/credits/components/RequestorCreditTab.tsx
// - web/frontend/src/pages/admin/credits/creditPageUi.tsx
// - web/frontend/src/shared/components/CreditLedgerModal.tsx
import type { RefObject } from "react";
import { Building2 } from "lucide-react";
import { TabsContent } from "@/components/ui/tabs";
import type { BusinessCredit } from "../adminCredit.types";
import {
  CreditPanel,
  CreditSectionHeader,
} from "../creditPageUi";

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

function getFreeBalance(business: BusinessCredit) {
  const freeCredit = Number(business.freeCredit ?? NaN);
  if (Number.isFinite(freeCredit)) return freeCredit;
  const freeBalance = Number(business.freeBalance ?? NaN);
  if (Number.isFinite(freeBalance)) return freeBalance;
  return (
    Number(business.freeRequestCredit ?? 0) +
    Number(business.freeShippingCredit ?? 0)
  );
}

function getChargedFree(business: BusinessCredit) {
  const charged = Number(business.chargedFreeAmount ?? NaN);
  if (Number.isFinite(charged) && charged > 0) return charged;
  return (
    Number(business.chargedFreeRequestAmount ?? 0) +
    Number(business.chargedFreeShippingAmount ?? 0)
  );
}

function getSpentFree(business: BusinessCredit) {
  const spent = Number(business.spentFreeAmount ?? NaN);
  if (Number.isFinite(spent) && spent > 0) return spent;
  return (
    Number(business.spentFreeRequestAmount ?? 0) +
    Number(business.spentFreeShippingAmount ?? 0)
  );
}

function MetricRow({
  label,
  paid,
  free,
}: {
  label: string;
  paid: number;
  free: number;
}) {
  return (
    <div className="grid grid-cols-[48px_1fr] items-center gap-2 rounded-xl bg-slate-50/80 px-2.5 py-2">
      <div className="text-[11px] font-semibold text-slate-500">{label}</div>
      <div className="grid grid-cols-2 gap-2 text-right">
        <div>
          <div className="text-[10px] text-muted-foreground">유료</div>
          <div className="text-xs font-semibold tabular-nums">
            {paid.toLocaleString()}원
          </div>
        </div>
        <div>
          <div className="text-[10px] text-muted-foreground">무료</div>
          <div className="text-xs font-semibold tabular-nums">
            {free.toLocaleString()}원
          </div>
        </div>
      </div>
    </div>
  );
}

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
      <CreditPanel>
        <div className="space-y-5 p-5 sm:p-6">
          <CreditSectionHeader
            icon={Building2}
            title="치과 · 기공소 크레딧"
            description="유료·무료 잔액과 충전·사용 현황입니다. 카드를 누르면 원장을 엽니다."
            trailing={
              <select
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm"
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
                <option value="paidBalance">유료잔액순</option>
                <option value="freeBalance">무료잔액순</option>
                <option value="spentPaid">유료사용순</option>
                <option value="name">이름순</option>
              </select>
            }
          />

          {loadingOrgs && requestorBusinesses.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              불러오는 중…
            </div>
          ) : requestorBusinesses.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              치과·기공소가 없습니다.
            </div>
          ) : (
            <div ref={orgScrollRef}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {[...requestorBusinesses]
                  .sort((a, b) => {
                    if (orgSortKey === "paidBalance") {
                      return (
                        Number(b.paidCredit ?? b.paidBalance ?? 0) -
                        Number(a.paidCredit ?? a.paidBalance ?? 0)
                      );
                    }
                    if (orgSortKey === "freeBalance") {
                      return getFreeBalance(b) - getFreeBalance(a);
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
                    const freeCredit = getFreeBalance(business);
                    const chargedPaid = Number(business.chargedPaidAmount || 0);
                    const spentPaid = Number(business.spentPaidAmount || 0);

                    return (
                      <button
                        key={business._id}
                        type="button"
                        onClick={() => onOpenLedger(business)}
                        className="rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50/60"
                      >
                        <div className="space-y-0.5">
                          <div className="text-sm font-semibold text-slate-900">
                            {business.name}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {business.ownerName || "-"} ·{" "}
                            {business.ownerEmail || "-"}
                          </div>
                        </div>
                        <div className="mt-3 space-y-1.5">
                          <MetricRow
                            label="잔여"
                            paid={paidCredit}
                            free={freeCredit}
                          />
                          <MetricRow
                            label="충전"
                            paid={chargedPaid}
                            free={getChargedFree(business)}
                          />
                          <MetricRow
                            label="사용"
                            paid={spentPaid}
                            free={getSpentFree(business)}
                          />
                        </div>
                      </button>
                    );
                  })}
              </div>
              <div ref={orgSentinelRef} className="h-6" />
              {loadingOrgs && businesses.length > 0 ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  불러오는 중…
                </div>
              ) : null}
            </div>
          )}
        </div>
      </CreditPanel>
    </TabsContent>
  );
}

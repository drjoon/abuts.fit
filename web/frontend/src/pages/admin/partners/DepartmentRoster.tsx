// change-log:
// - 2026-08-17: 사업영역 구성원 명단을 한 카드 안 컴팩트 행으로 정리.
// related files:
// - web/frontend/src/pages/admin/partners/AdminPartnersPage.tsx
// - web/frontend/src/pages/admin/partners/PartnerShareContext.tsx
import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";
import { useBusinessAreaShare } from "./PartnerShareContext";
import {
  createDepartment,
  formatPercent,
  formatWon,
  memberShareAmount,
  partnerRoleLabel,
  payoutWithVat,
  sumDepartmentPercents,
  sumMemberPercents,
  type AreaKey,
  type Department,
  type ShareKind,
} from "./partnerShare";
import { AccountPicker, BusinessPicker } from "./AccountPicker";

export function ShareRoster({
  area,
  allowedShareKinds,
  departmentAmount,
  noteFor,
}: {
  area: AreaKey;
  allowedShareKinds: ShareKind[];
  departmentAmount: (dept: Department) => number;
  noteFor?: (dept: Department) => string | null;
}) {
  const {
    state,
    addDepartment,
    updateDepartment,
    removeDepartment,
    addMember,
    updateMember,
    removeMember,
  } = useBusinessAreaShare();
  const departments = state[area].departments;
  const usedPercent = sumDepartmentPercents(departments);
  const showPercent = allowedShareKinds.includes("percent");
  const overflow = usedPercent > 100;
  const defaultShareKind = allowedShareKinds[0] || "percent";
  const linkedIds = useMemo(
    () =>
      new Set(
        departments
          .map((item) => item.businessAnchorId)
          .filter((id): id is string => Boolean(id)),
      ),
    [departments],
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <span>구성원</span>
          {showPercent ? (
            <span
              className={`tabular-nums ${overflow ? "font-semibold text-destructive" : ""}`}
            >
              {formatPercent(usedPercent)}
              {overflow ? " 초과" : ""}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <BusinessPicker
            excludedIds={linkedIds}
            compact
            onPick={(business) =>
              addDepartment(
                area,
                createDepartment({
                  name: business.name,
                  businessAnchorId: business.id,
                  businessNumber: business.businessNumber,
                  shareKind: defaultShareKind,
                  taxable:
                    business.businessType === "devops" ||
                    business.businessType === "manufacturer" ||
                    business.businessType === "salesman",
                }),
              )
            }
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 rounded-lg border-slate-200 px-2.5 text-[12px]"
            onClick={() =>
              addDepartment(
                area,
                createDepartment({
                  name: "새 구성원",
                  shareKind: defaultShareKind,
                  taxable: area === "abutment",
                }),
              )
            }
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            추가
          </Button>
        </div>
      </div>

      <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/80 bg-white">
        {departments.length === 0 ? (
          <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">
            구성원을 추가하세요.
          </p>
        ) : (
          departments.map((dept) => {
            const amount = departmentAmount(dept);
            const payout = payoutWithVat(amount, dept.taxable);
            const note = noteFor?.(dept) || null;
            const memberUsed = sumMemberPercents(dept.members);
            const selectedIds = new Set(dept.members.map((item) => item.userId));
            return (
              <div key={dept.id} className="px-3 py-2.5 sm:px-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    value={dept.name}
                    onChange={(event) =>
                      updateDepartment(area, dept.id, { name: event.target.value })
                    }
                    className="h-8 min-w-[7rem] flex-1 rounded-lg border-slate-200 bg-slate-50/70 px-2 text-[13px] font-semibold sm:max-w-[10rem]"
                    aria-label="구성원 이름"
                  />
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      dept.taxable
                        ? "bg-primary-soft text-primary-strong"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {dept.taxable
                      ? "외부 · +VAT"
                      : area === "lab"
                        ? "내부 · 인센티브"
                        : "면세"}
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    {dept.shareKind === "remainder" ? (
                      <span className="text-[11px] text-muted-foreground">잔여</span>
                    ) : dept.shareKind === "percent" ? (
                      <div className="relative w-[4.75rem]">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          className="h-8 rounded-lg border-slate-200 bg-slate-50/70 pr-6 text-right text-[13px] font-semibold tabular-nums"
                          value={dept.sharePercent}
                          onChange={(event) =>
                            updateDepartment(area, dept.id, {
                              sharePercent: Number(event.target.value),
                            })
                          }
                          aria-label={`${dept.name} 배분비`}
                        />
                        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
                          %
                        </span>
                      </div>
                    ) : (
                      <div className="relative w-[6.5rem]">
                        <Input
                          type="number"
                          min="0"
                          step="100"
                          className="h-8 rounded-lg border-slate-200 bg-slate-50/70 pr-6 text-right text-[13px] font-semibold tabular-nums"
                          value={dept.perCaseAmount}
                          onChange={(event) =>
                            updateDepartment(area, dept.id, {
                              perCaseAmount: Number(event.target.value),
                            })
                          }
                          aria-label={`${dept.name} 건당 금액`}
                        />
                        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
                          원
                        </span>
                      </div>
                    )}
                    <div className="min-w-[5.5rem] text-right">
                      <div className="text-[13px] font-semibold tabular-nums text-slate-900">
                        {formatWon(payout.total)}
                      </div>
                      {dept.taxable ? (
                        <div className="text-[10px] tabular-nums text-muted-foreground">
                          {formatWon(payout.supply)}+VAT
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeDepartment(area, dept.id)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      aria-label={`${dept.name} 삭제`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {note ? (
                  <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                    {note}
                  </p>
                ) : null}

                <div className="mt-1.5 space-y-1">
                  {dept.members.map((member) => {
                    const share = memberShareAmount(amount, member.sharePercent);
                    return (
                      <div
                        key={member.userId}
                        className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50/80 px-2 py-1"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="text-[12px] font-medium text-slate-800">
                            {member.name}
                          </span>
                          <span className="ml-1.5 text-[11px] text-muted-foreground">
                            {partnerRoleLabel(member.role)}
                          </span>
                        </div>
                        <div className="relative w-[4.5rem]">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            className="h-7 rounded-md border-slate-200 bg-white pr-5 text-right text-[12px] font-semibold tabular-nums"
                            value={member.sharePercent}
                            onChange={(event) =>
                              updateMember(area, dept.id, member.userId, {
                                sharePercent: Number(event.target.value),
                              })
                            }
                            aria-label={`${member.name} 배분비`}
                          />
                          <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
                            %
                          </span>
                        </div>
                        <span className="w-16 text-right text-[12px] tabular-nums text-slate-700">
                          {formatWon(share)}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            removeMember(area, dept.id, member.userId)
                          }
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-white hover:text-slate-700"
                          aria-label={`${member.name} 제거`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1 sm:max-w-xs">
                      <AccountPicker
                        excludedIds={selectedIds}
                        compact
                        label="팀원 추가"
                        onPick={(user) =>
                          addMember(area, dept.id, {
                            userId: user.id,
                            name: user.name,
                            email: user.email,
                            role: user.role,
                            sharePercent: 0,
                          })
                        }
                      />
                    </div>
                    {dept.members.length > 0 ? (
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {formatPercent(memberUsed)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

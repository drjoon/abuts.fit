// change-log:
// - 2026-08-17: 사업영역 부서·팀원 추가/수정/삭제.
// related files:
// - web/frontend/src/pages/admin/partners/AdminPartnersPage.tsx
// - web/frontend/src/pages/admin/partners/PartnerShareContext.tsx
import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Building2, Plus, Users, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
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
import { FieldHelp, initials } from "./shareUi";

function shareKindLabel(kind: ShareKind) {
  if (kind === "perCase") return "건당 금액";
  if (kind === "remainder") return "판매가 잔여";
  return "비율";
}

export function DepartmentRoster({
  area,
  allowedShareKinds,
  departmentAmount,
  emptyHint,
}: {
  area: AreaKey;
  allowedShareKinds: ShareKind[];
  departmentAmount: (dept: Department) => number;
  emptyHint: string;
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
  const showPercentTotal = allowedShareKinds.includes("percent");
  const overflow = usedPercent > 100;
  const linkedIds = useMemo(
    () =>
      new Set(
        departments
          .map((item) => item.businessAnchorId)
          .filter((id): id is string => Boolean(id)),
      ),
    [departments],
  );

  const defaultShareKind = allowedShareKinds[0] || "percent";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900">부서 · 팀원</h3>
          {showPercentTotal ? (
            <span
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold tabular-nums ring-1 ${
                overflow
                  ? "bg-destructive-soft text-destructive ring-destructive/30"
                  : "bg-slate-100 text-slate-600 ring-slate-200"
              }`}
            >
              부서 합계 {formatPercent(usedPercent)}
              {overflow ? " · 100% 초과" : ""}
            </span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BusinessPicker
            excludedIds={linkedIds}
            onPick={(business) =>
              addDepartment(
                area,
                createDepartment({
                  name: business.name,
                  businessAnchorId: business.id,
                  businessNumber: business.businessNumber,
                  shareKind: defaultShareKind,
                  taxable: business.businessType === "devops" ||
                    business.businessType === "manufacturer" ||
                    business.businessType === "salesman",
                }),
              )
            }
          />
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-xl border-slate-200"
            onClick={() =>
              addDepartment(
                area,
                createDepartment({
                  name: "새 부서",
                  shareKind: defaultShareKind,
                }),
              )
            }
          >
            <Plus className="mr-1.5 h-4 w-4" />
            부서 추가
          </Button>
        </div>
      </div>

      {departments.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-10 text-center">
          <Building2 className="mb-2 h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">아직 부서가 없습니다</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{emptyHint}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {departments.map((dept) => {
            const amount = departmentAmount(dept);
            const memberUsed = sumMemberPercents(dept.members);
            const memberOverflow = memberUsed > 100;
            const selectedIds = new Set(dept.members.map((item) => item.userId));
            const payout = payoutWithVat(amount, dept.taxable);
            return (
              <Card
                key={dept.id}
                className="app-glass-card app-glass-card--lg overflow-hidden"
              >
                <CardContent className="space-y-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-2">
                      <Input
                        value={dept.name}
                        onChange={(event) =>
                          updateDepartment(area, dept.id, {
                            name: event.target.value,
                          })
                        }
                        className="h-10 max-w-sm rounded-xl border-slate-200 bg-white text-sm font-semibold"
                        aria-label="부서명"
                      />
                      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
                        {dept.businessNumber ? (
                          <span>사업자 {dept.businessNumber}</span>
                        ) : (
                          <span>사업자 미연결 · 이름만 지정된 부서</span>
                        )}
                        {dept.salesmanFallback ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                            영업자BA 없으면 어벗츠 몫
                          </span>
                        ) : null}
                        {dept.taxable ? (
                          <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary-strong">
                            지급 시 부가세 별도
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                            면세
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeDepartment(area, dept.id)}
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      aria-label={`${dept.name} 삭제`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    {allowedShareKinds.length > 1 ? (
                      <div>
                        <Label className="mb-1.5 block text-[11px] font-medium text-slate-500">
                          배분 방식
                        </Label>
                        <Select
                          value={dept.shareKind}
                          onValueChange={(next) =>
                            updateDepartment(area, dept.id, {
                              shareKind: next as ShareKind,
                            })
                          }
                        >
                          <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-slate-50/60">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {allowedShareKinds.map((kind) => (
                              <SelectItem key={kind} value={kind}>
                                {shareKindLabel(kind)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}

                    {dept.shareKind === "percent" ? (
                      <div>
                        <Label
                          htmlFor={`dept-pct-${dept.id}`}
                          className="mb-1.5 block text-[11px] font-medium text-slate-500"
                        >
                          부서 배분비
                        </Label>
                        <div className="relative">
                          <Input
                            id={`dept-pct-${dept.id}`}
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            className="h-10 rounded-xl border-slate-200 bg-slate-50/60 pr-9 text-right font-semibold tabular-nums"
                            value={dept.sharePercent}
                            onChange={(event) =>
                              updateDepartment(area, dept.id, {
                                sharePercent: Number(event.target.value),
                              })
                            }
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">
                            %
                          </span>
                        </div>
                      </div>
                    ) : null}

                    {area === "abutment" && dept.shareKind === "perCase" ? (
                      <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200/70">
                        <span className="text-[12px] text-slate-600">
                          영업자BA 없으면 어벗츠
                        </span>
                        <Switch
                          checked={dept.salesmanFallback}
                          onCheckedChange={(next) =>
                            updateDepartment(area, dept.id, {
                              salesmanFallback: next,
                            })
                          }
                          aria-label="영업자 없으면 어벗츠 몫"
                        />
                      </div>
                    ) : null}

                    {dept.shareKind === "perCase" ? (
                      <div>
                        <Label
                          htmlFor={`dept-amt-${dept.id}`}
                          className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-slate-500"
                        >
                          건당 공급가
                          <FieldHelp text="판매가에서 차감되는 공급가입니다. 과세 부서는 지급 시 부가세 10%를 별도로 붙입니다." />
                        </Label>
                        <div className="relative">
                          <Input
                            id={`dept-amt-${dept.id}`}
                            type="number"
                            min="0"
                            step="100"
                            className="h-10 rounded-xl border-slate-200 bg-slate-50/60 pr-9 text-right font-semibold tabular-nums"
                            value={dept.perCaseAmount}
                            onChange={(event) =>
                              updateDepartment(area, dept.id, {
                                perCaseAmount: Number(event.target.value),
                              })
                            }
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">
                            원
                          </span>
                        </div>
                      </div>
                    ) : null}

                    <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200/70">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[11px] text-slate-500">부서 배분액</div>
                        <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
                          부가세
                          <Switch
                            checked={dept.taxable}
                            onCheckedChange={(next) =>
                              updateDepartment(area, dept.id, { taxable: next })
                            }
                            aria-label={`${dept.name} 부가세`}
                          />
                        </label>
                      </div>
                      <div className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">
                        {formatWon(payout.supply)}
                      </div>
                      {dept.taxable ? (
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          +VAT {formatWon(payout.vat)} → 지급 {formatWon(payout.total)}
                        </div>
                      ) : (
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          면세
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-[13px] font-medium text-slate-800">
                        <Users className="h-4 w-4 text-slate-400" />
                        팀원
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                            memberOverflow
                              ? "bg-destructive-soft text-destructive"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {formatPercent(memberUsed)}
                        </span>
                      </div>
                    </div>

                    {dept.members.length === 0 ? (
                      <p className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-2.5 text-[13px] text-muted-foreground">
                        아직 팀원이 없습니다. 개인 계정을 검색해 추가하세요.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {dept.members.map((member) => {
                          const share = memberShareAmount(amount, member.sharePercent);
                          const memberPayout = payoutWithVat(share, dept.taxable);
                          return (
                            <div
                              key={member.userId}
                              className="rounded-xl border border-slate-200/80 bg-white p-3"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-2.5">
                                  <Avatar className="h-8 w-8">
                                    <AvatarFallback className="bg-slate-100 text-xs font-semibold text-slate-600">
                                      {initials(member.name)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-medium text-slate-900">
                                      {member.name}
                                    </div>
                                    <div className="truncate text-[11px] text-muted-foreground">
                                      {partnerRoleLabel(member.role)}
                                      {member.email ? ` · ${member.email}` : ""}
                                    </div>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    removeMember(area, dept.id, member.userId)
                                  }
                                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                  aria-label={`${member.name} 제거`}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                <div>
                                  <Label
                                    htmlFor={`mem-pct-${dept.id}-${member.userId}`}
                                    className="mb-1 block text-[11px] font-medium text-slate-500"
                                  >
                                    부서 내 배분비
                                  </Label>
                                  <div className="relative">
                                    <Input
                                      id={`mem-pct-${dept.id}-${member.userId}`}
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="0.1"
                                      className="h-9 rounded-xl border-slate-200 bg-slate-50/60 pr-8 text-right text-sm font-semibold tabular-nums"
                                      value={member.sharePercent}
                                      onChange={(event) =>
                                        updateMember(area, dept.id, member.userId, {
                                          sharePercent: Number(event.target.value),
                                        })
                                      }
                                    />
                                    <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">
                                      %
                                    </span>
                                  </div>
                                </div>
                                <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200/70">
                                  <div className="text-[11px] text-slate-500">팀원 배분액</div>
                                  <div className="text-sm font-semibold tabular-nums text-slate-900">
                                    {formatWon(memberPayout.supply)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <AccountPicker
                      excludedIds={selectedIds}
                      label="팀원 계정 검색 후 추가…"
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
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

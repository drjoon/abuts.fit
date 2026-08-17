// change-log:
// - 2026-08-17: 기공사업 탭 — 어벗츠기공소 매출을 부서·팀원 비율로 분배.
// related files:
// - web/frontend/src/pages/admin/partners/AdminPartnersPage.tsx
// - web/frontend/src/pages/admin/partners/DepartmentRoster.tsx
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Scale, Truck, Wallet } from "lucide-react";
import { useBusinessAreaShare } from "./PartnerShareContext";
import {
  departmentPoolAmount,
  formatPercent,
  remainingPercent,
  sumDepartmentPercents,
} from "./partnerShare";
import { DepartmentRoster } from "./DepartmentRoster";
import { FieldHelp, SectionHeader } from "./shareUi";

export function LabBusinessTab() {
  const { state, setPreviewPool } = useBusinessAreaShare();
  const { previewPool, departments } = state.lab;
  const used = sumDepartmentPercents(departments);
  const remain = remainingPercent(departments.map((item) => item.sharePercent));

  return (
    <div className="space-y-5">
      <Card className="app-glass-card app-glass-card--lg overflow-hidden">
        <CardContent className="space-y-4 p-5 sm:p-6">
          <SectionHeader
            icon={Scale}
            title="분배 재원"
            description="어벗츠기공소에 들어온 주문건을 처리해 발생한 매출을 참여 부서(사업자)와 부서 내 팀원(개인 계정)에게 나눕니다."
          />
          <div className="max-w-sm">
            <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 ring-1 ring-slate-200/80">
                  <Wallet className="h-4 w-4 text-slate-600" />
                </span>
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  <Label htmlFor="labPreviewPool" className="text-sm font-medium text-slate-800">
                    미리보기 매출
                  </Label>
                  <FieldHelp text="실제 지급은 어벗츠기공소 주문 매출을 기준으로 합니다. 배송비는 이 재원에 넣지 않고 룰에 정한 흐름으로 지급합니다." />
                </div>
              </div>
              <div className="relative">
                <Input
                  id="labPreviewPool"
                  type="number"
                  min="0"
                  step="1000"
                  className="h-11 rounded-xl border-slate-200 bg-slate-50/60 pr-10 text-right text-base font-semibold tabular-nums tracking-tight"
                  value={previewPool}
                  onChange={(event) => setPreviewPool("lab", Number(event.target.value))}
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
                  원
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
              부서 합계 {formatPercent(used)}
            </span>
            <span>잔여 {formatPercent(Math.max(0, remain))}은 미배분입니다.</span>
          </div>
        </CardContent>
      </Card>

      <Card className="app-glass-card app-glass-card--lg overflow-hidden">
        <CardContent className="space-y-3 p-5 sm:p-6">
          <SectionHeader
            icon={Truck}
            title="배송비"
            description="기공사업 매출 분배와 분리합니다. 룰에 정한 출고 흐름으로만 지급합니다."
          />
          <ul className="space-y-1.5 text-[13px] leading-relaxed text-muted-foreground">
            <li>기공소 출발 → 치과 → 기공소 배송비는 해당 기공소 출고(작업완료) 시 지급합니다.</li>
            <li>어벗츠 출발 → 치과 → 어벗츠 배송비는 집하(우편함 비우기) 시 지급합니다.</li>
            <li>커스텀어벗(디자인+생산)만이고 지그 제작이 없으면 기공소 배송은 면제될 수 있습니다.</li>
          </ul>
        </CardContent>
      </Card>

      <DepartmentRoster
        area="lab"
        allowedShareKinds={["percent"]}
        departmentAmount={(dept) => departmentPoolAmount(previewPool, dept.sharePercent)}
        emptyHint="기공팀·영업팀·개발운영사를 넣고, 각 부서에 팀원을 배정하세요."
      />
    </div>
  );
}

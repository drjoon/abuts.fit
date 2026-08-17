// change-log:
// - 2026-08-17: 내부기공소 배당 건은 배송비를 공통 지출로 먼저 차감 후 분배.
// - 2026-08-17: 기공사업 — 한 카드에 내부 부서(면세)·개발운영사(VAT) 분배.
// related files:
// - web/frontend/src/pages/admin/partners/AdminPartnersPage.tsx
// - web/frontend/src/pages/admin/partners/DepartmentRoster.tsx
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FlaskConical } from "lucide-react";
import { useBusinessAreaShare } from "./PartnerShareContext";
import { departmentPoolAmount } from "./partnerShare";
import { ShareRoster } from "./DepartmentRoster";
import { SectionHeader } from "./shareUi";

export function LabBusinessTab() {
  const { state, setPreviewPool } = useBusinessAreaShare();
  const { previewPool } = state.lab;

  return (
    <Card className="app-glass-card app-glass-card--lg overflow-hidden">
      <CardContent className="space-y-3 p-4 sm:p-5">
        <SectionHeader
          icon={FlaskConical}
          title="기공사업"
          description="내부기공소(기공사업부)에 배당된 건만, 배송비를 공통 지출로 먼저 차감한 뒤 나머지를 부서·팀원 인센티브로 나눕니다. 기공팀·영업팀은 내부(면세), 개발운영사는 외부(+VAT)."
          trailing={
            <div className="relative w-36">
              <Input
                id="labPreviewPool"
                type="number"
                min="0"
                step="1000"
                className="h-8 rounded-lg border-slate-200 bg-slate-50/70 pr-7 text-right text-[13px] font-semibold tabular-nums"
                value={previewPool}
                onChange={(event) =>
                  setPreviewPool("lab", Number(event.target.value))
                }
                aria-label="미리보기 매출"
              />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
                원
              </span>
            </div>
          }
        />
        <ShareRoster
          area="lab"
          allowedShareKinds={["percent"]}
          departmentAmount={(dept) =>
            departmentPoolAmount(previewPool, dept.sharePercent)
          }
        />
      </CardContent>
    </Card>
  );
}

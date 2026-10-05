// change-log:
// - 2026-10-05: 플랫폼 사용료·하청 수수료 설명 삭제(미부과).
// - 2026-09-27: 플랫폼 사용료 2%(이벤트 면제 0%) 복원 표시. 어벗츠기공소 면제.
// - 2026-09-26: 플랫폼사업 설명 — 협력·하청 사용료, 하청 영업 수수료, 학습 동의 면제.
// - 2026-09-24: 플랫폼 사용료 정책 2% · 이벤트 off 표시 복원. 하청 % 유지.
// - 2026-08-17: 플랫폼사업 — 한 카드에 어벗츠/개발운영사 비율 분배.
// related files:
// - web/frontend/src/pages/admin/partners/AdminPartnersPage.tsx
// - web/frontend/src/pages/admin/partners/DepartmentRoster.tsx
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Layers } from "lucide-react";
import { useBusinessAreaShare } from "./PartnerShareContext";
import { departmentPoolAmount } from "./partnerShare";
import { ShareRoster } from "./DepartmentRoster";
import { SectionHeader } from "./shareUi";

export function PlatformBusinessTab() {
  const { state, setPreviewPool } = useBusinessAreaShare();
  const { previewPool } = state.platform;

  return (
    <Card className="app-glass-card app-glass-card--lg overflow-hidden">
      <CardContent className="space-y-3 p-4 sm:p-5">
        <SectionHeader
          icon={Layers}
          title="플랫폼사업"
          description="어벗츠 면세, 개발운영사 +VAT."
          trailing={
            <div className="relative w-36">
              <Input
                id="platformPreviewPool"
                type="number"
                min="0"
                step="1000"
                className="h-8 rounded-lg border-slate-200 bg-slate-50/70 pr-7 text-right text-[13px] font-semibold tabular-nums"
                value={previewPool}
                onChange={(event) =>
                  setPreviewPool("platform", Number(event.target.value))
                }
                aria-label="미리보기 재원"
              />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">
                원
              </span>
            </div>
          }
        />
        <ShareRoster
          area="platform"
          allowedShareKinds={["percent"]}
          departmentAmount={(dept) =>
            departmentPoolAmount(previewPool, dept.sharePercent)
          }
        />
      </CardContent>
    </Card>
  );
}

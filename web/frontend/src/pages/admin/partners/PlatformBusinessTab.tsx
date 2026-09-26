// change-log:
// - 2026-09-26: 플랫폼사업 설명 — 협력·하청 사용료, 하청 영업 수수료, 학습 동의 면제.
// - 2026-09-24: 플랫폼 사용료 정책 2% · 이벤트 off 표시 복원. 하청 % 유지.
// - 2026-08-17: 플랫폼사업 — 한 카드에 어벗츠/개발운영사 비율 분배.
// related files:
// - web/frontend/src/pages/admin/partners/AdminPartnersPage.tsx
// - web/frontend/src/pages/admin/partners/DepartmentRoster.tsx
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Layers } from "lucide-react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useBusinessAreaShare } from "./PartnerShareContext";
import {
  departmentPoolAmount,
  formatPercent,
} from "./partnerShare";
import { ShareRoster } from "./DepartmentRoster";
import { SectionHeader } from "./shareUi";

export function PlatformBusinessTab() {
  const { token } = useAuthStore();
  const { state, setPreviewPool } = useBusinessAreaShare();
  const { previewPool } = state.platform;

  const [subcontractRatePct, setSubcontractRatePct] = useState(10);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      const res = await apiFetch<{
        success?: boolean;
        data?: {
          platformFeeSettings?: {
            subcontractFeeRate?: number;
            platformFeeRate?: number;
            directPlatformFeeEnabled?: boolean;
            directPlatformFeeRate?: number;
          };
        };
      }>({
        path: "/api/admin/settings/platform-fees",
        method: "GET",
        token,
      });
      if (!res.ok) return;
      const fees = res.data?.data?.platformFeeSettings;
      const rate = fees?.subcontractFeeRate ?? fees?.platformFeeRate;
      if (rate != null) {
        setSubcontractRatePct(Math.round(Number(rate) * 100));
      }
    })();
  }, [token]);

  return (
    <Card className="app-glass-card app-glass-card--lg overflow-hidden">
      <CardContent className="space-y-3 p-4 sm:p-5">
        <SectionHeader
          icon={Layers}
          title="플랫폼사업"
          description={`하청 영업 수수료 ${formatPercent(subcontractRatePct)}. 협력건은 전액 적립. 어벗츠 면세, 개발운영사 +VAT.`}
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

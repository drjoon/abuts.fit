// change-log:
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
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { useBusinessAreaShare } from "./PartnerShareContext";
import {
  departmentPoolAmount,
  formatPercent,
  formatWon,
} from "./partnerShare";
import { ShareRoster } from "./DepartmentRoster";
import { SectionHeader } from "./shareUi";

export function PlatformBusinessTab() {
  const { token } = useAuthStore();
  const { data: systemSettings } = useSystemSettings();
  const membershipFee = Number(
    systemSettings?.creditSettings?.practiceMembershipMonthlyFee ?? 50000,
  );
  const { state, setPreviewPool } = useBusinessAreaShare();
  const { previewPool } = state.platform;

  const [matchRatePct, setMatchRatePct] = useState(10);
  const [directEnabled, setDirectEnabled] = useState(false);
  const [directRatePct, setDirectRatePct] = useState(5);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      const res = await apiFetch<{
        success?: boolean;
        data?: {
          platformFeeSettings?: {
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
      if (fees?.platformFeeRate != null) {
        setMatchRatePct(Math.round(Number(fees.platformFeeRate) * 100));
      }
      setDirectEnabled(fees?.directPlatformFeeEnabled === true);
      if (fees?.directPlatformFeeRate != null) {
        setDirectRatePct(Math.round(Number(fees.directPlatformFeeRate) * 100));
      }
    })();
  }, [token]);

  return (
    <Card className="app-glass-card app-glass-card--lg overflow-hidden">
      <CardContent className="space-y-3 p-4 sm:p-5">
        <SectionHeader
          icon={Layers}
          title="플랫폼사업"
          description={`치과 멤버십 ${formatWon(membershipFee)} · 자동매칭 ${formatPercent(matchRatePct)} · 지정 ${directEnabled ? formatPercent(directRatePct) : "무료"}. 어벗츠 면세, 개발운영사 +VAT.`}
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

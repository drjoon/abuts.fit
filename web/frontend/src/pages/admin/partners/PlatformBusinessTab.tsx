// change-log:
// - 2026-08-17: 플랫폼사업 탭 — 멤버십·매칭·지정 수수료를 어벗츠/개발운영사 비율로 분배.
// related files:
// - web/frontend/src/pages/admin/partners/AdminPartnersPage.tsx
// - web/frontend/src/pages/admin/partners/DepartmentRoster.tsx
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Landmark } from "lucide-react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { useBusinessAreaShare } from "./PartnerShareContext";
import {
  departmentPoolAmount,
  formatPercent,
  formatWon,
  remainingPercent,
  sumDepartmentPercents,
} from "./partnerShare";
import { DepartmentRoster } from "./DepartmentRoster";
import { FieldHelp, SectionHeader } from "./shareUi";

export function PlatformBusinessTab() {
  const { token } = useAuthStore();
  const { data: systemSettings } = useSystemSettings();
  const membershipFee = Number(
    systemSettings?.creditSettings?.practiceMembershipMonthlyFee ?? 50000,
  );
  const { state, setPreviewPool } = useBusinessAreaShare();
  const { previewPool, departments } = state.platform;
  const used = sumDepartmentPercents(departments);
  const remain = remainingPercent(departments.map((item) => item.sharePercent));

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
    <div className="space-y-5">
      <Card className="app-glass-card app-glass-card--lg overflow-hidden">
        <CardContent className="space-y-4 p-5 sm:p-6">
          <SectionHeader
            icon={Landmark}
            title="플랫폼 매출"
            description="치과 멤버십 구독료, 기공소 자동 매칭 수수료, 기공소 지정 수수료를 어벗츠와 개발운영사에 나눕니다. 기본은 어벗츠 90% · 개발운영사 10%이며 비율은 수정할 수 있습니다."
          />
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 px-3.5 py-2.5 ring-1 ring-slate-200/70">
              <div className="text-[11px] text-slate-500">치과 멤버십 구독료</div>
              <div className="mt-0.5 text-sm font-semibold tabular-nums">
                {formatWon(membershipFee)}
              </div>
              <div className="text-[11px] text-muted-foreground">월 · 면세</div>
            </div>
            <div className="rounded-xl bg-slate-50 px-3.5 py-2.5 ring-1 ring-slate-200/70">
              <div className="text-[11px] text-slate-500">기공소 자동 매칭 수수료</div>
              <div className="mt-0.5 text-sm font-semibold tabular-nums">
                {formatPercent(matchRatePct)}
              </div>
              <div className="text-[11px] text-muted-foreground">기공비 대비</div>
            </div>
            <div className="rounded-xl bg-slate-50 px-3.5 py-2.5 ring-1 ring-slate-200/70">
              <div className="text-[11px] text-slate-500">기공소 지정 수수료</div>
              <div className="mt-0.5 text-sm font-semibold tabular-nums">
                {directEnabled ? formatPercent(directRatePct) : "무료"}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {directEnabled ? "적용 중" : "지금은 무료"}
              </div>
            </div>
          </div>
          <div className="max-w-sm">
            <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm">
              <div className="mb-3 flex items-center gap-1.5">
                <Label htmlFor="platformPreviewPool" className="text-sm font-medium text-slate-800">
                  미리보기 재원
                </Label>
                <FieldHelp text="멤버십·매칭 수수료·지정 수수료를 합친 금액으로 부서 배분을 미리 봅니다." />
              </div>
              <div className="relative">
                <Input
                  id="platformPreviewPool"
                  type="number"
                  min="0"
                  step="1000"
                  className="h-11 rounded-xl border-slate-200 bg-slate-50/60 pr-10 text-right text-base font-semibold tabular-nums"
                  value={previewPool}
                  onChange={(event) =>
                    setPreviewPool("platform", Number(event.target.value))
                  }
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-slate-400">
                  원
                </span>
              </div>
            </div>
          </div>
          <div className="text-[13px] text-muted-foreground">
            부서 합계 {formatPercent(used)}
            {remain > 0 ? ` · 잔여 ${formatPercent(remain)}` : ""}
            {used > 100 ? " · 100% 초과" : ""}
          </div>
        </CardContent>
      </Card>

      <DepartmentRoster
        area="platform"
        allowedShareKinds={["percent"]}
        departmentAmount={(dept) => departmentPoolAmount(previewPool, dept.sharePercent)}
        emptyHint="어벗츠와 개발운영사를 넣고 비율을 정하세요."
      />
    </div>
  );
}

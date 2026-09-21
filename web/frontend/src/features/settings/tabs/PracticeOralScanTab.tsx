// related files:
// - web/frontend/src/pages/requestor/settings/SettingsPage.tsx
// - web/frontend/src/shared/onboarding/wizard/steps/PracticeBusinessProfileStep.tsx
// - web/backend/controllers/users/user.controller.js
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScanLine } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { request } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";

export function PracticeOralScanTab() {
  const { user, token, setUser } = useAuthStore();
  const { toast } = useToast();
  const [usesOralScan, setUsesOralScan] = useState(
    Boolean(user?.practiceProfile?.usesOralScan),
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setUsesOralScan(Boolean(user?.practiceProfile?.usesOralScan));
  }, [user?.practiceProfile?.usesOralScan]);

  const onSave = async () => {
    if (!token || !user) {
      toast({ title: "로그인이 필요합니다", variant: "destructive" });
      return;
    }
    const pp = user.practiceProfile || {};
    const clinicName = String(pp.clinicName || user.companyName || "").trim();
    const directorName = String(pp.directorName || "").trim();
    const staffName = String(pp.staffName || user.name || "").trim();
    const phone = String(pp.phone || "").trim();
    const clinicPhone = String(pp.clinicPhone || "").trim();
    const address = String(pp.address || "").trim();
    const addressDetail = String(pp.addressDetail || "").trim();
    const zipCode = String(pp.zipCode || "").trim();

    if (
      !clinicName ||
      !directorName ||
      !staffName ||
      !phone ||
      !clinicPhone ||
      !address ||
      !zipCode
    ) {
      toast({
        title: "치과 프로필을 먼저 완료해 주세요",
        description: "사업자·계정 탭에서 치과 기본 정보를 저장한 뒤 변경할 수 있습니다.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const res = await request<{ data?: Record<string, unknown> }>({
        path: "/api/users/profile",
        method: "PUT",
        token,
        jsonBody: {
          practiceProfile: {
            clinicName,
            directorName,
            staffName,
            phone,
            clinicPhone,
            address,
            addressDetail,
            zipCode,
            usesOralScan,
          },
        },
      });
      if (!res.ok) {
        const body = (res.data as { message?: string }) || {};
        throw new Error(body.message || "저장에 실패했습니다.");
      }
      const updated = ((res.data as any)?.data || res.data || {}) as Record<
        string,
        unknown
      >;
      const updatedProfile =
        updated.practiceProfile && typeof updated.practiceProfile === "object"
          ? (updated.practiceProfile as Record<string, unknown>)
          : null;
      setUser({
        ...user,
        practiceProfile: {
          ...pp,
          clinicName: String(updatedProfile?.clinicName || clinicName),
          directorName: String(updatedProfile?.directorName || directorName),
          staffName: String(updatedProfile?.staffName || staffName),
          phone: String(updatedProfile?.phone || phone),
          clinicPhone: String(updatedProfile?.clinicPhone || clinicPhone),
          address: String(updatedProfile?.address || address),
          addressDetail: String(
            updatedProfile?.addressDetail || addressDetail,
          ),
          zipCode: String(updatedProfile?.zipCode || zipCode),
          usesOralScan: Boolean(
            updatedProfile?.usesOralScan ?? usesOralScan,
          ),
          updatedAt: String(
            updatedProfile?.updatedAt || new Date().toISOString(),
          ),
        },
      });
      toast({ title: "저장되었습니다" });
    } catch (error) {
      toast({
        title: "저장 실패",
        description:
          error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-slate-200/80 shadow-none">
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-base">
          <ScanLine className="h-4 w-4 text-primary-strong" />
          구강 스캐너
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          구강 스캐너 사용 여부를 알려주시면 스캔바 등 디지털 지원을 안내합니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3.5">
          <Checkbox
            className="mt-0.5"
            checked={usesOralScan}
            onCheckedChange={(v) => setUsesOralScan(v === true)}
          />
          <span className="space-y-0.5">
            <span className="block text-sm font-medium text-slate-900">
              구강 스캐너를 사용하고 있습니다
            </span>
            <span className="block text-xs leading-relaxed text-slate-500">
              변경 후 저장을 눌러 주세요.
            </span>
          </span>
        </label>
        <Button
          type="button"
          onClick={() => void onSave()}
          disabled={saving}
          className="rounded-full"
        >
          {saving ? "저장 중…" : "저장"}
        </Button>
      </CardContent>
    </Card>
  );
}

// related files:
// - web/frontend/src/shared/onboarding/wizard/steps/BusinessStep.tsx
// - web/frontend/src/shared/onboarding/wizard/SettingsWizard.tsx
// - web/frontend/src/features/settings/tabs/PracticeOralScanTab.tsx
// - web/backend/controllers/users/user.controller.js
//
// 치과 대표 온보딩 — 사업자등록 직후 구강 스캔 사용 여부(필수). 직원(member)은 생략.
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { Info, ScanLine } from "lucide-react";
import { cn } from "@/shared/ui/cn";

interface PracticeOralScanStepProps {
  registerGoNextAction?: (action: (() => Promise<boolean>) | null) => void;
  registerBusyState?: (busy: boolean) => void;
  registerValidationState?: (state: {
    passed: boolean;
    validating: boolean;
  }) => void;
}

export const PracticeOralScanStep = ({
  registerGoNextAction,
  registerBusyState,
  registerValidationState,
}: PracticeOralScanStepProps) => {
  const { token, user, setUser } = useAuthStore();
  const { toast } = useToast();
  const [usesOralScan, setUsesOralScan] = useState<boolean | null>(() => {
    const pp = user?.practiceProfile;
    if (pp?.updatedAt != null && typeof pp.usesOralScan === "boolean") {
      return pp.usesOralScan;
    }
    return null;
  });
  const [saving, setSaving] = useState(false);

  const passed = usesOralScan !== null;

  useEffect(() => {
    registerValidationState?.({ passed, validating: false });
  }, [passed, registerValidationState]);

  useEffect(() => {
    registerBusyState?.(saving);
  }, [registerBusyState, saving]);

  const save = useCallback(async () => {
    if (!token) {
      toast({ title: "로그인이 필요합니다", variant: "destructive" });
      return false;
    }
    if (usesOralScan == null) {
      toast({
        title: "구강 스캔 사용 여부를 선택해 주세요",
        description: "사용함 / 사용 안 함 중 하나를 선택해야 합니다.",
        variant: "destructive",
      });
      return false;
    }

    setSaving(true);
    try {
      const res = await request<{ data?: Record<string, unknown> }>({
        path: "/api/users/profile",
        method: "PUT",
        token,
        jsonBody: {
          practiceProfile: {
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
      if (user) {
        setUser({
          ...user,
          practiceProfile: {
            ...(user.practiceProfile || {}),
            usesOralScan: Boolean(
              updatedProfile?.usesOralScan ?? usesOralScan,
            ),
            updatedAt: String(
              updatedProfile?.updatedAt || new Date().toISOString(),
            ),
          },
        });
      }
      return true;
    } catch (error) {
      toast({
        title: "저장 실패",
        description:
          error instanceof Error ? error.message : "잠시 후 다시 시도해 주세요.",
        variant: "destructive",
      });
      return false;
    } finally {
      setSaving(false);
    }
  }, [setUser, toast, token, user, usesOralScan]);

  useEffect(() => {
    registerGoNextAction?.(save);
    return () => registerGoNextAction?.(null);
  }, [registerGoNextAction, save]);

  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-slate-500">
        치과에서 구강 스캐너를 사용 중인지 알려주세요.
        <br />
        대표 계정에서 한 번만 선택하면 됩니다.
      </p>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <ScanLine className="h-4 w-4 text-primary-strong" />
          <span className="text-sm font-medium text-slate-900">
            구강 스캔 사용 여부
          </span>
          <Badge
            variant="secondary"
            className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-800 ring-1 ring-sky-100"
          >
            필수
          </Badge>
        </div>
        <div className="flex gap-2 rounded-xl border border-sky-100 bg-sky-50/80 px-3 py-2 text-sm leading-relaxed text-sky-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
          <p>
            사용 중이면 스캔바 등 디지털 지원을 안내합니다.
            <br />
            설정에서 언제든 변경할 수 있습니다.
          </p>
        </div>
        <RadioGroup
          value={
            usesOralScan == null ? undefined : usesOralScan ? "yes" : "no"
          }
          onValueChange={(v) => setUsesOralScan(v === "yes")}
          className="grid gap-3 sm:grid-cols-2"
        >
          <label
            htmlFor="wizard-oral-scan-yes"
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-2xl border bg-white px-4 py-3.5 transition-colors",
              usesOralScan === true
                ? "border-sky-300 bg-sky-50/80"
                : "border-slate-200",
            )}
          >
            <RadioGroupItem value="yes" id="wizard-oral-scan-yes" />
            <span className="text-sm font-medium text-slate-900">사용함</span>
          </label>
          <label
            htmlFor="wizard-oral-scan-no"
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-2xl border bg-white px-4 py-3.5 transition-colors",
              usesOralScan === false
                ? "border-sky-300 bg-sky-50/80"
                : "border-slate-200",
            )}
          >
            <RadioGroupItem value="no" id="wizard-oral-scan-no" />
            <span className="text-sm font-medium text-slate-900">
              사용 안 함
            </span>
          </label>
        </RadioGroup>
      </div>
    </div>
  );
};

// related files:
// - web/frontend/src/shared/components/business/settings/BusinessTab.tsx
// - web/backend/controllers/businesses/business.controller.js
import { FormEvent, useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import {
  invalidateBusinessMeCache,
  loadBusinessMeCached,
} from "@/shared/components/business/settings/business/businessMeCache";
import { cn } from "@/shared/ui/cn";

type ReferralOwnership = {
  canRegister?: boolean;
  assigned?: boolean;
  salesAssigned?: boolean;
  adminDefault?: boolean;
  withinSelfSetWindow?: boolean;
};

export function ReferralCodeCard({
  businessType = "requestor",
  className,
  embedded = false,
}: {
  businessType?: string;
  className?: string;
  /** 가입 정보 칸 안의 필드로 둔다. */
  embedded?: boolean;
}) {
  const { token } = useAuthStore();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [code, setCode] = useState("");
  const [ownership, setOwnership] = useState<ReferralOwnership | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await loadBusinessMeCached({
        token,
        businessType,
        force: true,
      });
      setOwnership(data?.referralOwnership || null);
    } finally {
      setLoading(false);
    }
  }, [businessType, token]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const next = code.trim();
    if (!token || !next || saving) return;
    setSaving(true);
    try {
      const validateRes = await request<any>({
        path: "/api/auth/referral/validate",
        method: "POST",
        jsonBody: { value: next, signupRole: "requestor" },
      });
      const validateBody: any = validateRes.data || {};
      if (!validateRes.ok || !validateBody?.success) {
        const message = String(validateBody?.message || "").trim();
        toast({
          title: "유효하지 않은 소개 코드",
          description: message || "딜러·영업본부·어벗츠 코드만 등록할 수 있습니다.",
          variant: "destructive",
        });
        return;
      }

      const res = await request<any>({
        path: "/api/businesses/me/apply-referral",
        method: "POST",
        token,
        jsonBody: { referralCode: next },
      });
      if (!res.ok) {
        const message = String((res.data as any)?.message || "").trim();
        toast({
          title: "소개자 코드 등록 실패",
          description: message || "코드를 다시 확인해주세요.",
          variant: "destructive",
        });
        return;
      }
      const closedWindow = Boolean((res.data as any)?.data?.closedWindow);
      toast({
        title: closedWindow
          ? "어벗츠 소개로 고정되었습니다"
          : "소개자 코드가 등록되었습니다",
      });
      setCode("");
      invalidateBusinessMeCache({ token, businessType });
      await load();
    } catch {
      toast({
        title: "소개자 코드 등록 실패",
        description: "네트워크 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const assignedCopy = ownership?.adminDefault ? (
    "어벗츠 소개로 등록되어 있습니다."
  ) : ownership?.salesAssigned ? (
    <>
      등록되어 있습니다.
      <br />
      90일 무주문이면 소개가 리셋됩니다.
    </>
  ) : (
    "등록되어 있습니다."
  );

  if (loading) {
    if (embedded) {
      return (
        <div
          className={cn(
            "rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2.5",
            className,
          )}
        >
          <p className="text-xs text-muted-foreground">소개자 코드</p>
          <p className="mt-1 flex items-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            확인 중…
          </p>
        </div>
      );
    }
    return (
      <div className="flex h-16 items-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        소개자 코드를 확인하는 중…
      </div>
    );
  }

  if (ownership?.assigned && !ownership?.canRegister) {
    if (embedded) {
      return (
        <div
          className={cn(
            "rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2.5",
            className,
          )}
        >
          <p className="text-xs text-muted-foreground">소개자 코드</p>
          <p className="mt-0.5 text-sm font-semibold leading-snug text-slate-900">
            {assignedCopy}
          </p>
        </div>
      );
    }
    return (
      <section
        className={cn(
          "flex h-full flex-col rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 sm:p-5",
          className,
        )}
      >
        <p className="text-sm font-semibold text-slate-900">소개자 코드</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          {assignedCopy}
        </p>
      </section>
    );
  }

  if (embedded) {
    return (
      <form
        className={cn(
          "rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2.5",
          className,
        )}
        onSubmit={handleSubmit}
      >
        <Label
          htmlFor="sales-referral-code"
          className="text-xs font-normal text-muted-foreground"
        >
          소개자 코드
        </Label>
        {ownership?.withinSelfSetWindow ? null : (
          <p className="mt-0.5 text-xs text-muted-foreground">
            대표만 등록할 수 있습니다.
          </p>
        )}
        <div className="mt-1.5 flex gap-2">
          <Input
            id="sales-referral-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="소개자 코드"
            autoComplete="off"
            disabled={saving}
            className="h-9 flex-1 rounded-lg bg-white"
          />
          <Button
            type="submit"
            disabled={saving || !code.trim()}
            className="h-9 shrink-0"
          >
            {saving ? "등록 중..." : "등록"}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <form
      className={cn(
        "flex h-full flex-col gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 sm:p-5",
        className,
      )}
      onSubmit={handleSubmit}
    >
      <div>
        <p className="text-sm font-semibold text-slate-900">소개자 코드</p>
        {ownership?.withinSelfSetWindow ? null : (
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            대표만 등록할 수 있습니다.
          </p>
        )}
      </div>
      <div className="mt-auto flex flex-col gap-2 sm:flex-row">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="sales-referral-code" className="sr-only">
            소개자 코드
          </Label>
          <Input
            id="sales-referral-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="소개자 코드"
            autoComplete="off"
            disabled={saving}
            className="h-10 rounded-xl bg-white"
          />
        </div>
        <Button type="submit" disabled={saving || !code.trim()} className="h-10">
          {saving ? "등록 중..." : "등록"}
        </Button>
      </div>
    </form>
  );
}

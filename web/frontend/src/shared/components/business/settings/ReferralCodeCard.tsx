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

type ReferralOwnership = {
  canRegister?: boolean;
  assigned?: boolean;
  salesAssigned?: boolean;
};

export function ReferralCodeCard({
  businessType = "requestor",
}: {
  businessType?: string;
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
      const res = await request<any>({
        path: "/api/businesses/me/apply-referral",
        method: "POST",
        token,
        jsonBody: { referralCode: next },
      });
      if (!res.ok) {
        const message = String((res.data as any)?.message || "").trim();
        toast({
          title: "영업자 코드 등록 실패",
          description: message || "코드를 다시 확인해주세요.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "영업자 코드가 등록되었습니다" });
      setCode("");
      invalidateBusinessMeCache({ token, businessType });
      await load();
    } catch {
      toast({
        title: "영업자 코드 등록 실패",
        description: "네트워크 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-16 items-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        영업자 코드를 확인하는 중…
      </div>
    );
  }

  if (!ownership?.canRegister && !ownership?.assigned) return null;

  if (ownership?.assigned && !ownership?.canRegister) {
    return (
      <section className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 sm:p-5">
        <p className="text-sm font-semibold text-slate-900">영업자 코드</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          {ownership?.salesAssigned
            ? "등록되어 있습니다. 90일 무주문이면 소개가 리셋됩니다."
            : "등록되어 있습니다."}
        </p>
      </section>
    );
  }

  return (
    <form
      className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 sm:p-5 space-y-3"
      onSubmit={handleSubmit}
    >
      <div>
        <p className="text-sm font-semibold text-slate-900">영업자 코드</p>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
          영업자에게 받은 코드를 등록합니다.
          <br />
          대표만 등록할 수 있고, 90일 무주문이면 소개가 리셋됩니다.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="sales-referral-code" className="sr-only">
            영업자 코드
          </Label>
          <Input
            id="sales-referral-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="영업자 코드"
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

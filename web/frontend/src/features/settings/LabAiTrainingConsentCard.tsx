// 기공소 계정에서 한 번 고르는 학습 이용 허용. 건별 동의가 아니다.
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { useLabTradingPartnerWindow } from "@/shared/lab/useLabTradingPartnerWindow";
import { resolveLabDirectPlatformFeePct } from "@/shared/settlement/labPayoutBankbook";

type ConsentPayload = {
  allowed?: boolean;
  locked?: boolean;
  updatedAt?: string | null;
};

type MeResponse = {
  success?: boolean;
  message?: string;
  data?: ConsentPayload & {
    aiTrainingConsent?: ConsentPayload;
  };
};

export const LabAiTrainingConsentCard = () => {
  const { token, user } = useAuthStore();
  const { toast } = useToast();
  const { windowInfo } = useLabTradingPartnerWindow();
  const [allowed, setAllowed] = useState(true);
  const [locked, setLocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const pct = resolveLabDirectPlatformFeePct(
    windowInfo?.feeRates?.directPlatformFeeRate != null
      ? Number(windowInfo.feeRates.directPlatformFeeRate) * 100
      : undefined,
  );
  useEffect(() => {
    if (user?.role === "internalLab" || !token) {
      setLocked(user?.role === "internalLab");
      setReady(true);
      return;
    }
    let mounted = true;
    const load = async () => {
      const res = await apiFetch<MeResponse>({
        path: "/api/businesses/me",
        method: "GET",
        token,
        skipCache: true,
      });
      if (!mounted || !res.ok) return;
      const consent = res.data?.data?.aiTrainingConsent;
      setAllowed(consent?.allowed !== false);
      setLocked(consent?.locked === true);
      setReady(true);
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [token, user?.role]);

  if (!ready) return null;

  const onChange = async (next: boolean) => {
    setAllowed(next);
    setSaving(true);
    try {
      const res = await apiFetch<MeResponse>({
        path: "/api/businesses/me/ai-training-consent",
        method: "POST",
        token,
        jsonBody: { allowed: next },
      });
      if (!res.ok) {
        setAllowed(!next);
        toast({
          title: "저장 실패",
          description: res.data?.message || "학습 이용 허용을 저장하지 못했습니다.",
          variant: "destructive",
        });
        return;
      }
      const saved = res.data?.data;
      setAllowed(saved?.allowed === true || saved?.aiTrainingConsent?.allowed === true);
      toast({
        title: next ? "학습 이용을 허용했습니다" : "학습 이용을 껐습니다",
        description: next
          ? `이번 의뢰부터 플랫폼 사용료 ${pct}%가 면제됩니다.`
          : `이번 의뢰부터 플랫폼 사용료 ${pct}%가 공제됩니다.`,
      });
    } catch {
      setAllowed(!next);
      toast({
        title: "저장 실패",
        description: "학습 이용 허용을 저장하지 못했습니다.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="app-glass-card">
      <CardContent className="flex flex-wrap items-start justify-between gap-4 px-4 py-4">
        <div className="min-w-0 max-w-xl">
          <p className="text-sm font-semibold text-slate-900">
            보철 디자인 학습 이용
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
            작업 완료 때 올리는 디자인 3d 모델을 학습에 써도 된다고 허용합니다.
            <br />
            허용하면 플랫폼 사용료 {pct}%가 면제됩니다.
          </p>
        </div>
        <Switch
          checked={locked || allowed}
          disabled={saving || locked}
          onCheckedChange={(value) => void onChange(value)}
          aria-label="보철 디자인 학습 이용 허용"
        />
      </CardContent>
    </Card>
  );
};

// 기공소 기공의뢰 첫 진입. 스위치를 기본 on으로 두고 허용 여부를 한 번 확인한다.
// 답을 하면 confirmedAt이 남아 다시 묻지 않는다. 어벗츠기공본부는 항상 허용이라 묻지 않는다.
import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { useLabTradingPartnerWindow } from "@/shared/lab/useLabTradingPartnerWindow";
import { resolveLabDirectPlatformFeePct } from "@/shared/settlement/labPayoutBankbook";

type ConsentPayload = {
  allowed?: boolean;
  locked?: boolean;
  needsPrompt?: boolean;
};

type MeResponse = {
  success?: boolean;
  message?: string;
  data?: ConsentPayload & {
    aiTrainingConsent?: ConsentPayload;
  };
};

export const LabAiTrainingConsentPrompt = () => {
  const { token, user } = useAuthStore();
  const { toast } = useToast();
  const { windowInfo } = useLabTradingPartnerWindow();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const pct = resolveLabDirectPlatformFeePct(
    windowInfo?.feeRates?.directPlatformFeeRate != null
      ? Number(windowInfo.feeRates.directPlatformFeeRate) * 100
      : undefined,
  );

  useEffect(() => {
    if (!token || user?.role === "internalLab") return;
    let mounted = true;
    const load = async () => {
      const res = await apiFetch<MeResponse>({
        path: "/api/businesses/me",
        method: "GET",
        token,
        skipCache: true,
      });
      if (!mounted || !res.ok) return;
      if (res.data?.data?.aiTrainingConsent?.needsPrompt) setOpen(true);
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [token, user?.role]);

  const choose = async (allowed: boolean) => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await apiFetch<MeResponse>({
        path: "/api/businesses/me/ai-training-consent",
        method: "POST",
        token,
        jsonBody: { allowed },
      });
      if (!res.ok) {
        toast({
          title: "저장 실패",
          description:
            res.data?.message || "학습 이용 허용을 저장하지 못했습니다.",
          variant: "destructive",
        });
        return;
      }
      setOpen(false);
      toast({
        title: allowed ? "학습 이용을 허용했습니다" : "학습 이용을 껐습니다",
        description: allowed
          ? `다음 주문부터 플랫폼 사용료 ${pct}%가 면제됩니다.`
          : `다음 주문부터 플랫폼 사용료 ${pct}%가 공제됩니다.`,
      });
    } catch {
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
    <AlertDialog open={open}>
      <AlertDialogContent
        className="z-[400]"
        overlayClassName="z-[400]"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>보철 디자인 학습 이용</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <p>
              작업 완료 때 올리는 디자인 3d 모델을 학습에 써도 된다고
              허용합니다.
              <br />
              허용하면 플랫폼 사용료 {pct}%가 면제됩니다.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => void choose(false)}
          >
            허용 안 함
          </Button>
          <Button
            type="button"
            disabled={saving}
            onClick={() => void choose(true)}
          >
            허용
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

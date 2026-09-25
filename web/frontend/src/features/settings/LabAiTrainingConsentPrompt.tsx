// 기공의뢰 진입 확인은 닫기·나중에로 넘길 수 있다.
// 답을 하기 전에는 첫 의뢰 작업시작만 허용/허용 안 함을 강제한다.
// 어벗츠기공본부는 항상 허용이라 묻지 않는다.
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
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

type PromptStatus = "loading" | "needed" | "done";

export type LabAiTrainingConsentPromptHandle = {
  /** 아직 답을 안 했으면 닫기·나중에 없이 고를 때까지 기다린다. */
  ensureChoice: () => Promise<boolean>;
};

export const LabAiTrainingConsentPrompt = forwardRef<
  LabAiTrainingConsentPromptHandle
>(function LabAiTrainingConsentPrompt(_props, ref) {
  const { token, user } = useAuthStore();
  const { toast } = useToast();
  const { windowInfo } = useLabTradingPartnerWindow();
  const [open, setOpen] = useState(false);
  const [required, setRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const statusRef = useRef<PromptStatus>("loading");
  const loadWaitersRef = useRef<Array<() => void>>([]);
  const choiceWaitersRef = useRef<Array<(ok: boolean) => void>>([]);
  const pct = resolveLabDirectPlatformFeePct(
    windowInfo?.feeRates?.directPlatformFeeRate != null
      ? Number(windowInfo.feeRates.directPlatformFeeRate) * 100
      : undefined,
  );

  const finishLoad = (status: PromptStatus) => {
    statusRef.current = status;
    const waiters = loadWaitersRef.current.splice(0);
    waiters.forEach((resolve) => resolve());
  };

  useEffect(() => {
    if (!token || user?.role === "internalLab") {
      finishLoad("done");
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
      if (!mounted) return;
      const needsPrompt = Boolean(
        res.ok && res.data?.data?.aiTrainingConsent?.needsPrompt,
      );
      finishLoad(needsPrompt ? "needed" : "done");
      if (needsPrompt) setOpen(true);
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [token, user?.role]);

  useEffect(() => {
    return () => {
      const waiters = choiceWaitersRef.current.splice(0);
      waiters.forEach((resolve) => resolve(false));
    };
  }, []);

  const whenLoaded = () => {
    if (statusRef.current !== "loading") return Promise.resolve();
    return new Promise<void>((resolve) => {
      loadWaitersRef.current.push(resolve);
    });
  };

  useImperativeHandle(ref, () => ({
    ensureChoice: async () => {
      await whenLoaded();
      if (statusRef.current !== "needed") return true;
      setRequired(true);
      setOpen(true);
      return new Promise<boolean>((resolve) => {
        choiceWaitersRef.current.push(resolve);
      });
    },
  }));

  const dismiss = () => {
    if (required || saving) return;
    setOpen(false);
  };

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
      statusRef.current = "done";
      setOpen(false);
      setRequired(false);
      const waiters = choiceWaitersRef.current.splice(0);
      waiters.forEach((resolve) => resolve(true));
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
    <AlertDialog open={open} onOpenChange={(next) => {
      if (!next) dismiss();
    }}>
      <AlertDialogContent
        className="z-[400]"
        overlayClassName="z-[400]"
        onEscapeKeyDown={(event) => {
          if (required) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (required) event.preventDefault();
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>보철 디자인 학습 이용</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <p>
              작업 완료 때 올리는 디자인 3d 모델을 학습에 써도 된다고
              허용합니다.
              <br />
              허용하면 플랫폼 사용료 {pct}%가 면제됩니다.
              {required ? (
                <>
                  <br />
                  작업시작 전에 선택해 주세요.
                </>
              ) : null}
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between sm:space-x-0">
          {required ? (
            <span />
          ) : (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={saving}
                onClick={dismiss}
              >
                닫기
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={dismiss}
              >
                나중에
              </Button>
            </div>
          )}
          <div className="flex justify-end gap-2">
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
          </div>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
});

// 기공의뢰 진입 확인은 오른쪽 위 X·바깥 클릭으로 넘길 수 있다.
// 답을 하기 전에는 첫 의뢰 작업시작만 허용/허용 안 함을 강제한다.
// 어벗츠기공본부는 항상 허용이라 묻지 않는다.
// 수수료 줄이기 버튼은 이미 답을 한 뒤에도 같은 동의 창을 다시 연다.
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { useLabTradingPartnerWindow } from "@/shared/lab/useLabTradingPartnerWindow";
import { resolveLabDirectPlatformFeePct } from "@/shared/settlement/labPayoutBankbook";

export const OPEN_LAB_AI_TRAINING_CONSENT_EVENT =
  "abuts:open-ai-training-consent";

export function openLabAiTrainingConsentPrompt(transferId?: string | null) {
  window.dispatchEvent(
    new CustomEvent(OPEN_LAB_AI_TRAINING_CONSENT_EVENT, {
      detail: { transferId: String(transferId || "").trim() },
    }),
  );
}

type ConsentPayload = {
  allowed?: boolean;
  locked?: boolean;
  needsPrompt?: boolean;
  needsFirstWorkStartConfirm?: boolean;
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
  /** 아직 답을 안 했으면 X·바깥 클릭 없이 고를 때까지 기다린다. */
  ensureChoice: () => Promise<boolean>;
  /**
   * 허용 안 함이면 사용료를 안내하고 다시 묻는다.
   * 동의함은 허용으로 저장하고, 동의 안 함은 부동의를 유지한다. 둘 다 작업시작은 진행한다.
   * 닫으면 false.
   */
  confirmDeclinedFee: () => Promise<boolean>;
  /**
   * 기능 도입 이후 첫 작업시작. 예전 의뢰와 관계없이 사업자에 확인을 남긴다.
   * 창을 닫거나 저장에 실패하면 false.
   */
  guardFirstWorkStart: () => Promise<boolean>;
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
  const [feeOpen, setFeeOpen] = useState(false);
  const statusRef = useRef<PromptStatus>("loading");
  const allowedRef = useRef(true);
  const needsFirstWorkStartRef = useRef(false);
  const loadWaitersRef = useRef<Array<() => void>>([]);
  const choiceWaitersRef = useRef<Array<(ok: boolean) => void>>([]);
  const feeWaitersRef = useRef<Array<(ok: boolean) => void>>([]);
  const allowButtonRef = useRef<HTMLButtonElement>(null);
  const agreeButtonRef = useRef<HTMLButtonElement>(null);
  const focusTransferIdRef = useRef("");
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
      needsFirstWorkStartRef.current = false;
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
      const consent = res.ok ? res.data?.data?.aiTrainingConsent : undefined;
      const needsPrompt = Boolean(consent?.needsPrompt);
      allowedRef.current = consent?.allowed !== false;
      needsFirstWorkStartRef.current = Boolean(
        consent?.needsFirstWorkStartConfirm,
      );
      finishLoad(needsPrompt ? "needed" : "done");
      if (needsPrompt) {
        focusTransferIdRef.current = "";
        setOpen(true);
      }
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
      const feeWaiters = feeWaitersRef.current.splice(0);
      feeWaiters.forEach((resolve) => resolve(false));
    };
  }, []);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ transferId?: string }>).detail;
      focusTransferIdRef.current = String(detail?.transferId || "").trim();
      setRequired(false);
      setOpen(true);
    };
    window.addEventListener(OPEN_LAB_AI_TRAINING_CONSENT_EVENT, onOpen);
    return () => {
      window.removeEventListener(OPEN_LAB_AI_TRAINING_CONSENT_EVENT, onOpen);
    };
  }, []);

  const whenLoaded = () => {
    if (statusRef.current !== "loading") return Promise.resolve();
    return new Promise<void>((resolve) => {
      loadWaitersRef.current.push(resolve);
    });
  };

  const settleFee = (ok: boolean) => {
    setFeeOpen(false);
    const waiters = feeWaitersRef.current.splice(0);
    waiters.forEach((resolve) => resolve(ok));
  };

  useImperativeHandle(ref, () => ({
    ensureChoice: async () => {
      focusTransferIdRef.current = "";
      await whenLoaded();
      if (statusRef.current !== "needed") return true;
      setRequired(true);
      setOpen(true);
      return new Promise<boolean>((resolve) => {
        choiceWaitersRef.current.push(resolve);
      });
    },
    confirmDeclinedFee: async () => {
      await whenLoaded();
      if (allowedRef.current !== false) return true;
      setFeeOpen(true);
      return new Promise<boolean>((resolve) => {
        feeWaitersRef.current.push(resolve);
      });
    },
    guardFirstWorkStart: async () => {
      await whenLoaded();
      if (!needsFirstWorkStartRef.current) return true;
      if (statusRef.current === "needed") {
        setRequired(true);
        setOpen(true);
        const chosen = await new Promise<boolean>((resolve) => {
          choiceWaitersRef.current.push(resolve);
        });
        if (!chosen) return false;
      }
      if (allowedRef.current === false) {
        setFeeOpen(true);
        const feeOk = await new Promise<boolean>((resolve) => {
          feeWaitersRef.current.push(resolve);
        });
        if (!feeOk) return false;
      }
      const res = await apiFetch<MeResponse>({
        path: "/api/businesses/me/ai-training-first-work-start",
        method: "POST",
        token,
      });
      if (!res.ok) {
        toast({
          title: "저장 실패",
          description:
            res.data?.message || "첫 작업시작 확인을 저장하지 못했습니다.",
          variant: "destructive",
        });
        return false;
      }
      needsFirstWorkStartRef.current = false;
      return true;
    },
  }));

  const dismiss = () => {
    if (required || saving) return;
    focusTransferIdRef.current = "";
    setOpen(false);
  };

  const persistConsent = async (allowed: boolean) => {
    const res = await apiFetch<MeResponse>({
      path: "/api/businesses/me/ai-training-consent",
      method: "POST",
      token,
      jsonBody: {
        allowed,
        ...(focusTransferIdRef.current
          ? { transferId: focusTransferIdRef.current }
          : {}),
      },
    });
    if (!res.ok) {
      toast({
        title: "저장 실패",
        description:
          res.data?.message || "학습 이용 허용을 저장하지 못했습니다.",
        variant: "destructive",
      });
      return false;
    }
    focusTransferIdRef.current = "";
    statusRef.current = "done";
    allowedRef.current = allowed;
    window.dispatchEvent(new CustomEvent("abuts:ai-training-consent-changed"));
    return true;
  };

  const choose = async (allowed: boolean) => {
    if (saving) return;
    setSaving(true);
    try {
      const saved = await persistConsent(allowed);
      if (!saved) return;
      const wasRequired = required;
      setOpen(false);
      setRequired(false);
      const waiters = choiceWaitersRef.current.splice(0);
      waiters.forEach((resolve) => resolve(true));
      if (wasRequired && !allowed) return;
      toast({
        title: allowed ? "학습 이용을 허용했습니다" : "학습 이용을 껐습니다",
        description: allowed
          ? `이번 의뢰부터 플랫폼 사용료 ${pct}%가 면제됩니다.`
          : `이번 의뢰부터 플랫폼 사용료 ${pct}%가 공제됩니다.`,
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

  const answerFeeConsent = async (allowed: boolean) => {
    if (saving) return;
    setSaving(true);
    try {
      const saved = await persistConsent(allowed);
      if (!saved) return;
      toast({
        title: allowed ? "학습 이용을 허용했습니다" : "학습 이용을 껐습니다",
        description: allowed
          ? `이번 의뢰부터 플랫폼 사용료 ${pct}%가 면제됩니다.`
          : `이번 의뢰부터 플랫폼 사용료 ${pct}%가 공제됩니다.`,
      });
      settleFee(true);
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
    <>
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
    >
      <DialogContent
        className="z-[400] sm:max-w-[calc(32rem+2.5em)]"
        overlayClassName="z-[400]"
        hideClose={required}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          allowButtonRef.current?.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (required) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (required) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (required) event.preventDefault();
        }}
      >
        <DialogHeader className={required ? "space-y-0" : "space-y-0 pr-8"}>
          <DialogTitle>AI 학습 이용 동의</DialogTitle>
          <div className="h-[1lh]" aria-hidden />
          <DialogDescription asChild>
            <p>
              작업 결과를 AI 학습에 이용할 수 있도록 동의하면, 플랫폼 사용료(<strong className="font-semibold text-foreground">{pct}%</strong>)가 면제됩니다.
              <br />
              추후 <strong className="font-semibold text-foreground">설정-AI</strong>에서 변경할 수 있습니다.
              {required ? (
                <>
                  <br />
                  작업시작 전에 선택해 주세요.
                </>
              ) : null}
            </p>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end sm:space-x-0">
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
              ref={allowButtonRef}
              type="button"
              disabled={saving}
              onClick={() => void choose(true)}
            >
              허용
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog
      open={feeOpen}
      onOpenChange={(next) => {
        if (!next && !saving) settleFee(false);
      }}
    >
      <DialogContent
        className="z-[400] sm:max-w-[calc(32rem+2.5em)]"
        overlayClassName="z-[400]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          agreeButtonRef.current?.focus();
        }}
      >
        <DialogHeader className="space-y-0 pr-8">
          <DialogTitle>AI 학습 이용 동의</DialogTitle>
          <div className="h-[1lh]" aria-hidden />
          <DialogDescription asChild>
            <p>
              동의하지 않으면 플랫폼 사용료(<strong className="font-semibold text-foreground">{pct}%</strong>)가 공제됩니다.
              <br />
              AI 학습 이용에 동의하시겠습니까?
            </p>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end sm:space-x-0">
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => void answerFeeConsent(false)}
            >
              동의 안 함
            </Button>
            <Button
              ref={agreeButtonRef}
              type="button"
              disabled={saving}
              onClick={() => void answerFeeConsent(true)}
            >
              동의함
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
});

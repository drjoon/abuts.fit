// related files:
// - web/frontend/src/features/platform/PlatformBenefitsDialog.tsx
// - web/frontend/src/shared/platform/referralShareMessages.ts
// - 2026-08-14: 수수료 면제 소개 문구 제거.
// - 2026-08-12: 안내 문구+링크 클립보드 복사(카톡 미실행).
import { useMemo, useState } from "react";
import { Copy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";
import type { PlatformBenefitsVariant } from "@/shared/platform/platformBenefitsContent";
import {
  buildLabIntroMessage,
  buildPracticeIntroMessage,
  buildReferralSignupLink,
} from "@/shared/platform/referralShareMessages";

type ShareTarget = "practice" | "lab";

type Props = {
  viewerKind: PlatformBenefitsVariant;
};

export const PlatformBenefitsShareButtons = ({ viewerKind: _viewerKind }: Props) => {
  const { toast } = useToast();
  const { user } = useAuthStore();
  const [busyTarget, setBusyTarget] = useState<ShareTarget | null>(null);

  const referralCode = useMemo(
    () =>
      String(user?.referralCode || "")
        .trim()
        .toUpperCase(),
    [user?.referralCode],
  );

  const referralSignupLink = useMemo(
    () => buildReferralSignupLink(referralCode),
    [referralCode],
  );

  const handleCopy = async (target: ShareTarget) => {
    if (!referralCode) {
      toast({
        title: "복사 실패",
        description: "소개 코드를 확인할 수 없습니다.",
        variant: "destructive",
      });
      return;
    }

    setBusyTarget(target);
    try {
      if (!referralSignupLink) {
        throw new Error("소개 링크를 만들 수 없습니다.");
      }
      const message =
        target === "practice"
          ? buildPracticeIntroMessage(referralSignupLink)
          : buildLabIntroMessage(referralSignupLink);

      await navigator.clipboard.writeText(message);
      toast({
        title: "복사 완료",
        description: "안내 문구와 링크를 복사했습니다.",
        duration: 2000,
      });
    } catch (error) {
      toast({
        title: "복사 실패",
        description:
          error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setBusyTarget(null);
    }
  };

  return (
    <div className="space-y-2.5 rounded-xl border border-slate-200/80 bg-white px-4 py-3.5">
      <p className="text-sm font-semibold text-slate-900">
        주변에 어벗츠를 소개해 주세요
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          className="h-10 justify-center gap-2 bg-[#FEE500] text-[13px] font-semibold text-[#3C1E1E] hover:bg-[#FEE500]/90 hover:text-[#3C1E1E]"
          disabled={busyTarget != null}
          onClick={() => void handleCopy("practice")}
        >
          {busyTarget === "practice" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          치과에 소개
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-10 justify-center gap-2 bg-[#FEE500] text-[13px] font-semibold text-[#3C1E1E] hover:bg-[#FEE500]/90 hover:text-[#3C1E1E]"
          disabled={busyTarget != null}
          onClick={() => void handleCopy("lab")}
        >
          {busyTarget === "lab" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
          기공소에 소개
        </Button>
      </div>
    </div>
  );
};

// related files:
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferLabReceiveCard.tsx
// - web/frontend/src/features/settings/tabs/LabTradingPartnersTab.tsx
// - web/backend/controllers/labTradingPartners/labTradingPartner.controller.js
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Loader2, Check } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { cn } from "@/shared/ui/cn";

export const isUnregisteredExternalPractice = (transfer: {
  source?: string | null;
  practiceBusinessAnchorId?: string | null;
}): boolean =>
  String(transfer?.source || "").trim() === "3shape" &&
  !String(transfer?.practiceBusinessAnchorId || "").trim();

type InviteApiBody = {
  success?: boolean;
  message?: string;
  data?: { invitePath?: string };
};

type PracticeExternalInviteCtaProps = {
  clinicName?: string | null;
  clinicEmail?: string | null;
  className?: string;
  compact?: boolean;
};

/**
 * 3Shape 미가입 치과 → 거래처 초대 링크/안내 문구 복사.
 */
export const PracticeExternalInviteCta = ({
  clinicName,
  clinicEmail,
  className,
  compact = false,
}: PracticeExternalInviteCtaProps) => {
  const { toast } = useToast();
  const { token, user } = useAuthStore();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const referralCode = useMemo(
    () =>
      String(user?.referralCode || "")
        .trim()
        .toUpperCase(),
    [user?.referralCode],
  );

  const displayName =
    String(clinicName || "").trim() ||
    String(clinicEmail || "").trim() ||
    "치과";

  const buildInviteUrl = (path: string) => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "";
    const base = `${origin}${path}`;
    if (!referralCode) return base;
    const sep = path.includes("?") ? "&" : "?";
    return `${base}${sep}ref=${encodeURIComponent(referralCode)}`;
  };

  const handleInvite = async () => {
    if (!token || busy) return;
    setBusy(true);
    try {
      const res = await request<InviteApiBody>({
        path: "/api/lab-trading-partners",
        method: "POST",
        token,
        jsonBody: {
          practiceHint: {
            name: String(clinicName || "").trim(),
            memo: String(clinicEmail || "").trim()
              ? `3Shape Communicate: ${String(clinicEmail).trim()}`
              : "3Shape 미가입 치과 초대",
          },
        },
      });
      if (!res.ok) {
        toast({
          title: "초대 생성 실패",
          description: res.data?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
        return;
      }
      const path = String(res.data?.data?.invitePath || "").trim();
      if (!path) {
        toast({
          title: "초대 생성 실패",
          description: "초대 링크를 만들지 못했습니다.",
          variant: "destructive",
        });
        return;
      }
      const url = buildInviteUrl(path);
      const message = `${displayName} 원장님, 안녕하세요 🙂\n어벗츠에 가입하시면 다음부터 기공의뢰·현황을 한곳에서 보실 수 있어요.\n아래 링크로 가입 후 사업자등록증 검증을 완료해 주세요.\n${url}`;
      try {
        await navigator.clipboard.writeText(message);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast({
          title: "가입 안내를 복사했습니다",
          description: "치과에 전달해 주세요.",
          duration: 2500,
        });
      } catch {
        toast({
          title: "복사 실패",
          description: url,
          variant: "destructive",
        });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-950",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className="h-5 shrink-0 border-amber-400 bg-amber-100 px-1.5 text-[11px] leading-none text-amber-900"
        >
          미가입
        </Badge>
        <p className={cn("min-w-0 flex-1", compact ? "text-xs" : "text-sm")}>
          abuts 미가입 치과입니다. 가입을 유도하면 다음 의뢰부터 플랫폼으로
          받을 수 있습니다.
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="mt-2 h-8 border-amber-300 bg-white text-amber-950 hover:bg-amber-100"
        disabled={busy}
        onClick={() => void handleInvite()}
      >
        {busy ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : copied ? (
          <Check className="mr-1.5 h-3.5 w-3.5" />
        ) : (
          <UserPlus className="mr-1.5 h-3.5 w-3.5" />
        )}
        {copied ? "복사됨" : "가입 초대 복사"}
      </Button>
    </div>
  );
};

export const UnregisteredPracticeBadge = ({
  className,
}: {
  className?: string;
}) => (
  <Badge
    variant="outline"
    className={cn(
      "h-5 shrink-0 border-amber-400 bg-amber-50 px-1.5 text-[11px] leading-none text-amber-900",
      className,
    )}
  >
    미가입
  </Badge>
);

// change-log:
// - 2026-08-11: 제목 "오늘의 가격". 치과(practice)는 수치 마스킹·블러, 로그인 비번 확인 후 표시.
// - 2026-08-09: 카드에서 디자인비·출고 +1영업일 안내 행 제거(생산 단가만 유지).
// - 2026-08-09: 카드 제목을 "오늘의 생산 가격"으로 변경.
// - 2026-08-09: 디자인비 행에 출고 +1영업일(묶음·신속) 안내 추가.
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/ui/PricingPolicyDialog.tsx
// - web/frontend/src/shared/business/useRequestorBusinessAccess.ts
// - web/backend/controllers/auth/auth.controller.js
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { PricingPolicyDialog } from "@/shared/ui/PricingPolicyDialog";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";

type PricingReferralStats = {
  myLastMonthOrders?: number;
  myLast30DaysOrders?: number;
  groupTotalOrders?: number;
  selfBusinessOrders?: number;
  referralBusinessOrders?: number;
  baseUnitPrice?: number;
  referralDiscountAmount?: number;
  effectiveUnitPrice?: number;
  rule?: string;
  monthlyRemakeFreeLimit?: number;
  monthlyRemakeUsed?: number;
  monthlyRemakeFreeRemaining?: number;
};

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  message?: string;
  error?: string;
};

const formatCount = (value: number, revealed: boolean) =>
  revealed ? `${value.toLocaleString()}건` : "***건";

const formatWon = (value: number, revealed: boolean) =>
  revealed ? `${value.toLocaleString()}원` : "***원";

export const RequestorPricingReferralPolicyCard = () => {
  const [policyOpen, setPolicyOpen] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const { user, token } = useAuthStore();
  const { toast } = useToast();
  const { kind: requestorKind } = useRequestorBusinessAccess();

  const isPracticeRequestor =
    requestorKind === "practice" ||
    (requestorKind == null && user?.requestorKind === "practice");
  const isHidden = isPracticeRequestor && !revealed;

  const referralCode = String(
    (user as { referralCode?: string } | null)?.referralCode || "",
  )
    .trim()
    .toUpperCase();

  const referralLink = useMemo(() => {
    if (!referralCode) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/signup/referral?ref=${encodeURIComponent(referralCode)}`;
  }, [referralCode]);

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ["requestor-pricing-referral-stats", "v8"],
    queryFn: async () => {
      const res = await apiFetch<ApiEnvelope<PricingReferralStats>>({
        path: "/api/requests/my/pricing-referral-stats",
        method: "GET",
        token,
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(
          res.data?.message ||
            res.data?.error ||
            "가격/소개 통계 조회에 실패했습니다.",
        );
      }
      return res.data.data;
    },
    enabled: Boolean(token && user && user.role === "requestor"),
    retry: false,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  const shouldShowSkeleton = !data && (isLoading || isFetching);

  const openUnlockDialog = () => {
    if (!isHidden) return;
    setPassword("");
    setUnlockOpen(true);
  };

  const handleVerifyPassword = async () => {
    if (!token) return;
    const nextPassword = password.trim();
    if (!nextPassword) {
      toast({
        title: "비밀번호 필요",
        description: "로그인 비밀번호를 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    setUnlocking(true);
    try {
      const res = await apiFetch<{ success?: boolean; message?: string }>({
        path: "/api/auth/verify-password",
        method: "POST",
        token,
        jsonBody: { password: nextPassword },
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.message || "비밀번호가 올바르지 않습니다.");
      }
      setRevealed(true);
      setUnlockOpen(false);
      setPassword("");
      toast({
        title: "표시 해제",
        description: "오늘의 가격을 표시합니다.",
      });
    } catch (err) {
      toast({
        title: "비밀번호 확인 실패",
        description:
          err instanceof Error ? err.message : "비밀번호를 확인하지 못했습니다.",
        variant: "destructive",
      });
    } finally {
      setUnlocking(false);
    }
  };

  if (shouldShowSkeleton) {
    return (
      <Card className="app-glass-card app-glass-card--lg">
        <CardHeader className="pt-6 pb-2">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="mt-2 h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="app-glass-card app-glass-card--lg">
        <CardHeader>
          <CardTitle className="text-base font-semibold">오늘의 가격</CardTitle>
          <CardDescription className="text-sm text-destructive">
            {(error as Error)?.message || "정보를 불러오지 못했습니다."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!data) return null;

  const selfBusinessOrders =
    Number(
      data.selfBusinessOrders ??
        data.myLastMonthOrders ??
        data.myLast30DaysOrders ??
        0,
    ) || 0;
  const totalBusinessOrders = Number(
    data.groupTotalOrders ?? selfBusinessOrders,
  );
  // requestor 응답의 referralBusinessOrders는 그룹 합계일 수 있어,
  // 소개 건수는 합계 - 내 사업자로 계산한다.
  const referralBusinessOrders = Math.max(
    0,
    totalBusinessOrders - selfBusinessOrders,
  );

  const baseUnitPrice = Number(data.baseUnitPrice ?? 15000);
  const referralDiscountAmount = Number(data.referralDiscountAmount ?? 0);
  const effectiveUnitPrice = Number(data.effectiveUnitPrice ?? baseUnitPrice);
  const isNewUserFixedPrice = [
    "new_user_90days_fixed_10000",
    "new_user_180days_fixed_10000", // legacy rule id
  ].includes(String(data.rule || ""));

  const monthlyRemakeFreeLimit = Number(data.monthlyRemakeFreeLimit ?? 3);
  const monthlyRemakeUsed = Number(data.monthlyRemakeUsed ?? 0);
  const monthlyRemakeFreeRemaining = Math.max(
    0,
    Number(
      data.monthlyRemakeFreeRemaining ??
        monthlyRemakeFreeLimit - monthlyRemakeUsed,
    ),
  );

  const copyToClipboardFallback = (text: string) => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  };

  const handleCopyReferralLink = async () => {
    try {
      if (!referralLink) return;

      const canUseClipboardApi =
        typeof window !== "undefined" &&
        window.isSecureContext &&
        typeof navigator !== "undefined" &&
        Boolean(navigator.clipboard?.writeText);

      if (canUseClipboardApi) {
        await navigator.clipboard.writeText(referralLink);
      } else if (!copyToClipboardFallback(referralLink)) {
        throw new Error("fallback copy failed");
      }

      toast({
        title: "복사 완료",
        description: "소개 링크를 클립보드에 복사했습니다.",
      });
    } catch {
      toast({
        title: "복사 실패",
        description:
          "클립보드 복사에 실패했습니다. (브라우저 권한/보안 설정을 확인해주세요)",
        variant: "destructive",
      });
    }
  };

  const sensitiveClass = isHidden
    ? "blur-[5px] select-none pointer-events-none"
    : "";

  return (
    <>
      <Card
        className={`app-glass-card app-glass-card--lg h-full min-w-0${
          isHidden ? " cursor-pointer" : ""
        }`}
        onClick={isHidden ? openUnlockDialog : undefined}
        role={isHidden ? "button" : undefined}
        tabIndex={isHidden ? 0 : undefined}
        onKeyDown={
          isHidden
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openUnlockDialog();
                }
              }
            : undefined
        }
      >
        <CardHeader className="pt-4 pb-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <CardTitle className="text-base font-semibold">오늘의 가격</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border border-slate-300 bg-white text-xs text-foreground hover:bg-slate-100 hover:text-slate-700 px-3 py-1.5 h-9"
                onClick={(event) => {
                  if (isHidden) {
                    event.preventDefault();
                    openUnlockDialog();
                    return;
                  }
                  void handleCopyReferralLink();
                }}
                disabled={!isHidden && !referralLink}
              >
                소개 링크 복사
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border border-slate-300 bg-white text-xs text-foreground hover:bg-slate-100 hover:text-slate-700 px-3 py-1.5 h-9"
                onClick={(event) => {
                  if (isHidden) {
                    event.preventDefault();
                    openUnlockDialog();
                    return;
                  }
                  setPolicyOpen(true);
                }}
              >
                정책
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="relative pt-2 pb-4 gap-2 text-xs text-foreground space-y-1.5">
          {isHidden ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center px-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm backdrop-blur-sm">
                <Lock className="h-3 w-3" />
                클릭 후 로그인 비밀번호로 표시
              </span>
            </div>
          ) : null}

          <div className={`space-y-1 ${sensitiveClass}`}>
            <div className="text-md text-slate-600">
              주문합계(최근 30일, 완료 기준)
            </div>
            <div className="flex flex-wrap items-baseline justify-end gap-x-1.5 gap-y-0.5 text-right tabular-nums">
              <span className="text-lg font-semibold text-foreground">
                {formatCount(selfBusinessOrders, !isHidden)}
                <span className="ml-0.5 text-sm font-medium text-slate-500">
                  (나)
                </span>
              </span>
              <span className="text-sm font-medium text-slate-400">+</span>
              <span className="text-lg font-semibold text-foreground">
                {formatCount(referralBusinessOrders, !isHidden)}
                <span className="ml-0.5 text-sm font-medium text-slate-500">
                  (소개)
                </span>
              </span>
              <span className="text-sm font-medium text-slate-400">=</span>
              <span className="text-lg font-semibold text-foreground">
                {formatCount(totalBusinessOrders, !isHidden)}
              </span>
            </div>
          </div>

          <div className={`mt-1 pt-2 border-t border-slate-200 space-y-1.5 ${sensitiveClass}`}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-md text-slate-600">정가</span>
              <span className="text-lg font-semibold text-foreground">
                {formatWon(baseUnitPrice, !isHidden)}
              </span>
            </div>

            <div className="flex items-baseline justify-between gap-2">
              <span className="text-md text-slate-600">
                할인 금액(30일 주문량 할인)
              </span>
              <span className="text-lg font-semibold text-foreground">
                {formatWon(referralDiscountAmount, !isHidden)}
              </span>
            </div>

            <div className="flex items-baseline justify-between gap-2">
              <span className="text-md text-slate-600">오늘 단가</span>
              <span className="flex items-baseline gap-2">
                {effectiveUnitPrice < baseUnitPrice && (
                  <span className="text-sm text-slate-500 line-through">
                    {formatWon(baseUnitPrice, !isHidden)}
                  </span>
                )}
                <span className="text-xl font-bold text-primary">
                  {formatWon(effectiveUnitPrice, !isHidden)}
                </span>
              </span>
            </div>

            {isNewUserFixedPrice && (
              <p className="text-[11px] text-right">
                {isHidden
                  ? "가입 승인일 기준 90일 이내 고정가 적용 중"
                  : "가입 승인일 기준 90일 이내 고정가(10,000원) 적용 중"}
              </p>
            )}

            <div className="flex items-baseline justify-between gap-2">
              <span className="text-md text-slate-600">
                이번 달 리메이크 무료 잔여
              </span>
              <span className="text-lg font-semibold text-foreground">
                {formatCount(monthlyRemakeFreeRemaining, !isHidden)}
              </span>
            </div>

            <p className="text-md text-slate-600 text-right">
              <b>배송비 별도 · 부가세 없음</b>
            </p>
          </div>
        </CardContent>
      </Card>

      <PricingPolicyDialog open={policyOpen} onOpenChange={setPolicyOpen} />

      <Dialog
        open={unlockOpen}
        onOpenChange={(next) => {
          setUnlockOpen(next);
          if (!next) setPassword("");
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>오늘의 가격 표시</DialogTitle>
            <DialogDescription>
              로그인 비밀번호를 입력하세요.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void handleVerifyPassword();
            }}
          >
            <Input
              type="password"
              autoComplete="current-password"
              placeholder="로그인 비밀번호"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoFocus
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setUnlockOpen(false)}
                disabled={unlocking}
              >
                취소
              </Button>
              <Button type="submit" disabled={unlocking}>
                {unlocking ? "확인 중..." : "표시"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

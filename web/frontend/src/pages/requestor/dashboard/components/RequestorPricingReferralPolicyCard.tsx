import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { PricingPolicyDialog } from "@/shared/ui/PricingPolicyDialog";

type ReferralTreeLite = {
  memberCount?: number;
};

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

export const RequestorPricingReferralPolicyCard = () => {
  const [open, setOpen] = useState(false);
  const { user, token } = useAuthStore();
  const { toast } = useToast();

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

  const {
    data: referralTree,
    isLoading: isTreeLoading,
    isFetching: isTreeFetching,
    isError: isTreeError,
    error: treeError,
  } = useQuery({
    queryKey: ["requestor-referral-tree-member-count", user?.id || ""],
    queryFn: async () => {
      if (!user?.id) throw new Error("사용자 정보를 불러오지 못했습니다.");

      const res = await apiFetch<ApiEnvelope<ReferralTreeLite>>({
        path: `/api/referral-groups/${user.businessAnchorId}/tree?lite=1`,
        method: "GET",
        token,
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(
          res.data?.message ||
            res.data?.error ||
            "소개 트리 조회에 실패했습니다.",
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

  const shouldShowSkeleton =
    isLoading || isFetching || isTreeLoading || isTreeFetching;

  if (shouldShowSkeleton) {
    return (
      <Card className="app-glass-card app-glass-card--lg">
        <CardHeader className="pt-6 pb-2">
          <Skeleton className="h-5 w-40" />
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

  if (isError || isTreeError) {
    return (
      <Card className="app-glass-card app-glass-card--lg">
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            가격 · 소개 정책
          </CardTitle>
          <CardDescription className="text-sm text-destructive">
            {(isError
              ? (error as Error)?.message
              : (treeError as Error)?.message) || "정보를 불러오지 못했습니다."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!data) return null;

  const myLast30DaysOrders =
    Number(data.myLastMonthOrders ?? data.myLast30DaysOrders ?? 0) || 0;
  const groupMemberCount = Number(referralTree?.memberCount || 0);
  const referredBusinessCount = Math.max(0, groupMemberCount - 1);
  const totalBusinessOrders = Number(
    data.groupTotalOrders ??
      Number(data.selfBusinessOrders ?? 0) +
        Number(data.referralBusinessOrders ?? 0),
  );

  const baseUnitPrice = Number(data.baseUnitPrice ?? 15000);
  const referralDiscountAmount = Number(data.referralDiscountAmount ?? 0);
  const effectiveUnitPrice = Number(data.effectiveUnitPrice ?? baseUnitPrice);
  const isNewUserFixedPrice =
    String(data.rule || "") === "new_user_90days_fixed_10000";

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

  return (
    <>
      <Card className="app-glass-card app-glass-card--lg">
        <CardHeader className="pt-4 pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base font-semibold">가격 정책</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border border-slate-300 bg-white text-xs text-foreground hover:bg-slate-100 hover:text-slate-700 px-3 py-1.5 h-9"
                onClick={handleCopyReferralLink}
                disabled={!referralLink}
              >
                소개 링크 복사
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border border-slate-300 bg-white text-xs text-foreground hover:bg-slate-100 hover:text-slate-700 px-3 py-1.5 h-9"
                onClick={() => setOpen(true)}
              >
                정책
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-2 pb-4 gap-2 text-xs text-foreground space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-md text-slate-600">
              내 사업자 주문 수량 (최근 30일)
            </span>
            <span className="text-lg font-semibold text-foreground">
              {myLast30DaysOrders.toLocaleString()}건
            </span>
          </div>

          <div className="flex items-baseline justify-between gap-2">
            <span className="text-md text-slate-600">소개 사업자 수</span>
            <span className="text-lg font-semibold text-foreground">
              {referredBusinessCount}개소
            </span>
          </div>

          <div className="flex items-baseline justify-between gap-2">
            <span className="text-md text-slate-600">
              사업자 주문 합계(내 사업자+소개 사업자)
            </span>
            <span className="text-lg font-semibold text-foreground">
              {totalBusinessOrders.toLocaleString()}건
            </span>
          </div>

          <div className="mt-1 pt-2 border-t border-slate-200 space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-md text-slate-600">정가</span>
              <span className="text-lg font-semibold text-foreground">
                {baseUnitPrice.toLocaleString()}원
              </span>
            </div>

            <div className="flex items-baseline justify-between gap-2">
              <span className="text-md text-slate-600">할인 금액</span>
              <span className="text-lg font-semibold text-foreground">
                {referralDiscountAmount.toLocaleString()}원
              </span>
            </div>

            <div className="flex items-baseline justify-between gap-2">
              <span className="text-md text-slate-600">오늘 단가</span>
              <span className="flex items-baseline gap-2">
                {effectiveUnitPrice < baseUnitPrice && (
                  <span className="text-sm text-slate-500 line-through">
                    {baseUnitPrice.toLocaleString()}원
                  </span>
                )}
                <span className="text-xl font-bold text-primary">
                  {effectiveUnitPrice.toLocaleString()}원
                </span>
              </span>
            </div>

            {isNewUserFixedPrice && (
              <p className="text-[11px]  text-right">
                가입 승인일 기준 90일 이내 고정가(10,000원) 적용 중
              </p>
            )}

            <div className="flex items-baseline justify-between gap-2">
              <span className="text-md text-slate-600">
                이번 달 리메이크 무료 잔여
              </span>
              <span className="text-lg font-semibold text-foreground">
                {monthlyRemakeFreeRemaining.toLocaleString()}건
              </span>
            </div>

            <p className="text-md text-slate-600 text-right">
              <b>부가세·배송비 별도</b>
            </p>
          </div>
        </CardContent>
      </Card>

      <PricingPolicyDialog open={open} onOpenChange={setOpen} />
    </>
  );
};

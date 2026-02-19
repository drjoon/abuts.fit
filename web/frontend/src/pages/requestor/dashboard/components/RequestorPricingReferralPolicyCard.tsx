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
import { Progress } from "@/components/ui/progress";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { PricingPolicyDialog } from "@/shared/ui/PricingPolicyDialog";

export const RequestorPricingReferralPolicyCard = () => {
  const [open, setOpen] = useState(false);
  const { user, token } = useAuthStore();
  const { toast } = useToast();

  const userId = (user as any)?._id || (user as any)?.id || "";
  const referralCode = String((user as any)?.referralCode || "")
    .trim()
    .toUpperCase();

  const referralLink = useMemo(() => {
    if (!referralCode) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/signup?ref=${encodeURIComponent(referralCode)}`;
  }, [referralCode]);

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ["requestor-pricing-referral-stats"],
    queryFn: async () => {
      const res = await apiFetch<any>({
        path: "/api/requests/my/pricing-referral-stats",
        method: "GET",
        token,
        headers: token
          ? {
              "x-mock-role": "requestor",
            }
          : undefined,
      });
      if (!res.ok || !res.data?.success) {
        const errorMsg =
          res.data?.message ||
          res.data?.error ||
          "가격/리퍼럴 통계 조회에 실패했습니다.";
        console.error("[RequestorPricingReferralPolicyCard] API Error:", {
          ok: res.ok,
          status: res.status,
          message: errorMsg,
          data: res.data,
        });
        throw new Error(errorMsg);
      }
      return res.data.data;
    },
    enabled: Boolean(token && user && user.role === "requestor"),
    retry: false,
  });

  const shouldShowSkeleton = (isLoading || isFetching) && !data;

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

  if (isError) {
    return (
      <Card className="app-glass-card app-glass-card--lg">
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            가격 & 리퍼럴 정책
          </CardTitle>
          <CardDescription className="text-sm text-destructive">
            {(error as Error)?.message || "정보를 불러오지 못했습니다."}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!data) {
    return null;
  }

  const myLast30DaysOrders =
    data.myLastMonthOrders ?? data.myLast30DaysOrders ?? 0;
  const groupTotalOrders = data.groupTotalOrders ?? 0;
  const groupMemberCount = data.groupMemberCount ?? 0;

  const totalOrders = groupTotalOrders;
  const targetOrdersForMaxDiscount = 500;
  const progressValue = targetOrdersForMaxDiscount
    ? Math.min(100, (totalOrders / targetOrdersForMaxDiscount) * 100)
    : 0;

  const maxDiscountPerUnit = data.maxDiscountPerUnit ?? 5000;
  const discountPerOrder = data.discountPerOrder ?? 10;
  const totalDiscount = data.discountAmount ?? 0;
  const baseUnitPrice = data.baseUnitPrice ?? 15000;
  const effectiveUnitPrice = data.effectiveUnitPrice ?? baseUnitPrice;

  const shouldHighlightReferral = data.rule === "new_user_90days_fixed_10000";

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
      } else {
        const ok = copyToClipboardFallback(referralLink);
        if (!ok) {
          throw new Error("fallback copy failed");
        }
      }
      toast({
        title: "복사 완료",
        description: "추천 링크를 클립보드에 복사했습니다.",
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
            <CardTitle className="text-base font-semibold">
              가격 & 리퍼럴 정책
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={shouldHighlightReferral ? "default" : "outline"}
                size="sm"
                className={
                  shouldHighlightReferral
                    ? "text-xs px-2 py-1 h-7 shadow-sm ring-1 ring-primary/40"
                    : "border-gray-300 text-xs text-foreground hover:bg-muted/60 hover:text-foreground px-2 py-1 h-7"
                }
                onClick={handleCopyReferralLink}
                disabled={!referralLink}
              >
                내 추천 링크 복사
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-gray-300 text-xs text-foreground hover:bg-muted/60 hover:text-foreground px-2 py-1 h-7"
                onClick={() => setOpen(true)}
              >
                정책
              </Button>
            </div>
          </div>
          <CardDescription className="space-y-1 text-xs text-slate-600">
            최근 30일 집계는 <b>완료</b> 주문 기준입니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2 pb-4 gap-3 text-xs text-foreground">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-md text-slate-600">
                    내 주문 (최근 30일)
                  </span>
                  <span className="text-lg font-semibold text-foreground">
                    {myLast30DaysOrders.toLocaleString()}건
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-md text-slate-600">
                    직계 멤버 수(나 포함)
                  </span>
                  <span className="text-lg font-semibold text-foreground">
                    {groupMemberCount}명
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-2 space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-md text-slate-600">
                  주문 합계(나+직계)
                </span>
                <span className="text-lg font-semibold text-foreground">
                  {totalOrders.toLocaleString()}건
                </span>
              </div>
              <Progress value={progressValue} className="h-2" />
            </div>

            <div className="mt-2 pt-2 space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-md text-slate-600">오늘 주문 단가</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm text-slate-500 line-through">
                    {baseUnitPrice.toLocaleString()}원
                  </span>
                  <span className="text-2xl font-bold text-primary">
                    {effectiveUnitPrice.toLocaleString()}원
                  </span>
                </div>
              </div>
              <p className="text-md text-slate-600 text-right">
                <b>부가세·배송비 별도</b>
              </p>
            </div>
            <div className="mt-1 text-[11px] text-slate-600 text-right">
              이벤트 기간 동안 가입한 기공소는 90일간 10,000원으로 고정됩니다.
            </div>
          </div>
        </CardContent>
      </Card>

      <PricingPolicyDialog open={open} onOpenChange={setOpen} />
    </>
  );
};

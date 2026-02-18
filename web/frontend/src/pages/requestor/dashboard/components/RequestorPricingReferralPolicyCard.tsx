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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

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

  const myLast30DaysOrders = data.myLast30DaysOrders ?? 0;
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
                    내 주문 (지난 30일)
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>가격 & 리퍼럴 정책 안내</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-4 pt-2 text-sm text-muted-foreground">
                <section className="space-y-1">
                  <h3 className="font-semibold text-foreground text-md">
                    1. 기본 가격
                  </h3>
                  <p>커스텀 어벗 1개 주문 건당 기본 가격은 15,000원입니다.</p>
                  <p>
                    동일 환자·동일 치아번호에 대한 재의뢰(리메이크/수정 의뢰)는
                    건당 10,000원으로 고정 제공됩니다.
                  </p>
                  <b>
                    부가가치세(VAT)는 별도이며, 배송비는 1회 발송당
                    3,500원(공급가) 으로 청구됩니다.
                  </b>
                  <p>
                    배송비는 실제 제품 발송 시점에 크레딧에서 차감되며, 한 번의
                    발송에 여러 제품이 포함되더라도 배송비는 1회만 부과됩니다.
                  </p>
                </section>

                <section className="space-y-1">
                  <h3 className="font-semibold text-foreground text-md">
                    2. 무료 크레딧(보너스)
                  </h3>
                  <p>
                    무료 크레딧은 <b>1건당 15,000원 고정</b>으로 차감됩니다.
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>무료 크레딧 잔액이 15,000원 이상일 때만 사용됩니다.</li>
                    <li>
                      신규 가입 90일 고정가(10,000원) 주문 시에도 15,000원이
                      차감됩니다.
                    </li>
                    <li>
                      무료 크레딧이 부족하면 구매 크레딧에서 전액 차감됩니다.
                    </li>
                  </ul>
                </section>

                <section className="space-y-1">
                  <h3 className="font-semibold text-foreground text-md">
                    3. 주문량 할인
                  </h3>
                  <p>
                    최근 30일 동안의 커스텀 어벗 주문 건수에 따라 아래와 같이
                    자동 할인됩니다.
                  </p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>최근 30일 주문 건당 10원이 할인됩니다.</li>
                    <li>
                      최대 5,000원까지 할인되며, 할인 한도 도달 시 개당
                      10,000원이 됩니다.
                    </li>
                    <li>
                      예) 최근 30일 주문 500건 이상 시 커스텀 어벗 단가는
                      10,000원으로 적용됩니다.
                    </li>
                  </ul>
                </section>

                <section className="space-y-1">
                  <h3 className="font-semibold text-foreground text-md">
                    4. 리퍼럴 그룹 기반 주문량 합산
                  </h3>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>
                      본인과 본인이 직접 추천한 기공소(직계 1단계)의 주문량을
                      합산하여 할인 단가를 계산합니다.
                    </li>
                    <li>
                      예) A 기공소 → B 기공소(A의 리퍼럴) → C 기공소(B의
                      리퍼럴)인 경우,
                      <b>A는 A+B</b>의 주문량을 합산하고, <b>B는 B+C</b>의
                      주문량을 합산합니다.
                    </li>
                  </ul>
                </section>

                <section className="space-y-1">
                  <h3 className="font-semibold text-foreground text-md">
                    5. 주문량 집계 시점
                  </h3>
                  <p>
                    주문량 집계는 매일 자정(00:00 기준) 업데이트되며, 적용
                    단가는 업데이트 이후 발생하는 주문부터 반영됩니다.
                  </p>
                </section>

                <section className="space-y-1">
                  <h3 className="font-semibold text-foreground text-md">
                    6. 런칭 이벤트 (신규 기공소)
                  </h3>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>
                      신규 가입 기공소는 가입 승인일로부터 90일 동안 커스텀 어벗
                      단가를 개당 10,000원으로 고정하여 제공합니다.
                    </li>
                    <li>
                      해당 기간 동안에는 주문량 할인 정책과 무관하게 10,000원이
                      우선 적용됩니다.
                    </li>
                    <li>
                      이벤트 종료 시점은 추후 별도 공지를 통해 안내드립니다.
                    </li>
                  </ul>
                </section>

                <section className="space-y-1">
                  <h3 className="font-semibold text-foreground text-md">
                    7. 의뢰 취소
                  </h3>
                  <p>
                    의뢰 취소는 <b>의뢰, CAM</b> 단계에서만 가능합니다.
                    <b>가공 단계부터는</b> 취소할 수 없습니다.
                  </p>
                </section>
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
};

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
import { apiFetch } from "@/lib/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

export const RequestorPricingReferralPolicyCard = () => {
  const [open, setOpen] = useState(false);
  const { user, token } = useAuthStore();
  const { toast } = useToast();

  const userId = (user as any)?._id || (user as any)?.id || "";
  const referralCode = (user as any)?.referralCode || "";

  const referralLink = useMemo(() => {
    if (!referralCode) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/signup?ref=${referralCode}`;
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
        throw new Error("가격/리퍼럴 통계 조회에 실패했습니다.");
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
  const referralLast30DaysOrders = data.referralLast30DaysOrders ?? 0;

  const totalOrders = myLast30DaysOrders + referralLast30DaysOrders;
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
        <CardHeader className="pt-6 pb-2">
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
                    : "border-gray-300 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground px-2 py-1 h-7"
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
                className="border-gray-300 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground px-2 py-1 h-7"
                onClick={() => setOpen(true)}
              >
                정책
              </Button>
            </div>
          </div>
          <CardDescription className="space-y-1 text-xs text-muted-foreground">
            최근 30일 집계는 <b>완료</b> 주문 기준입니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0 pb-6 gap-3 text-xs text-foreground">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 space-y-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-md text-muted-foreground">
                    내 주문 (지난 30일)
                  </span>
                  <span className="text-lg font-semibold">
                    {myLast30DaysOrders.toLocaleString()}건
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-md text-muted-foreground">
                    리퍼럴 주문 (지난 30일)
                  </span>
                  <span className="text-lg font-semibold">
                    {referralLast30DaysOrders.toLocaleString()}건
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-2 space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-md text-muted-foreground">주문 합계</span>
                <span className="text-lg font-semibold">
                  {totalOrders.toLocaleString()}건
                </span>
              </div>
              <Progress value={progressValue} className="h-2" />
            </div>

            <div className="mt-2 pt-2 space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-md text-muted-foreground">
                  오늘 주문 단가
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm text-muted-foreground line-through">
                    {baseUnitPrice.toLocaleString()}원
                  </span>
                  <span className="text-2xl font-bold text-primary">
                    {effectiveUnitPrice.toLocaleString()}원
                  </span>
                </div>
              </div>
              <p className="text-md text-muted-foreground text-right">
                <b>부가세·배송비 별도</b>
              </p>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground text-right">
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
              <div className="space-y-4 pt-2 text-md text-muted-foreground">
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
                    3,500원(공급가)으로 청구됩니다.
                  </b>
                  <p>
                    배송비는 실제 제품 발송 시점에 크레딧에서 차감되며, 한 번의
                    발송에 여러 제품이 포함되더라도 배송비는 1회만 부과됩니다.
                  </p>
                </section>

                <section className="space-y-1">
                  <h3 className="font-semibold text-foreground text-md">
                    2. 주문량 할인
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
                    3. 리퍼럴 합산 기준
                  </h3>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>
                      귀 기공소의 주문량에 더해, 귀사 리퍼럴 코드로 가입한
                      기공소들의 주문량을 합산해 할인 단가를 계산합니다.
                    </li>
                    <li>
                      피소개 기공소(리퍼럴로 가입한 기공소)는 본인 주문량에
                      소개한 기공소의 주문량을 합산하지 않습니다.
                    </li>
                  </ul>
                </section>

                <section className="space-y-1">
                  <h3 className="font-semibold text-foreground text-md">
                    4. 주문량 집계 시점
                  </h3>
                  <p>
                    주문량 집계는 매일 자정(00:00 기준) 업데이트되며, 적용
                    단가는 업데이트 이후 발생하는 주문부터 반영됩니다.
                  </p>
                </section>

                <section className="space-y-1">
                  <h3 className="font-semibold text-foreground text-md">
                    5. 런칭 이벤트 (신규 기공소)
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
                    6. 의뢰 취소
                  </h3>
                  <p>
                    의뢰 취소는 <b>의뢰</b> 단계에서만 가능합니다.{" "}
                    <b>CAM 단계부터는</b>
                    취소할 수 없습니다.
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

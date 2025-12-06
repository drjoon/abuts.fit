import { useState } from "react";
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

export const RequestorPricingReferralPolicyCard = () => {
  const [open, setOpen] = useState(false);

  const myLast30DaysOrders = 0;
  const referralLast30DaysOrders = 0;

  const totalOrders = myLast30DaysOrders + referralLast30DaysOrders;
  const targetOrdersForMaxDiscount = 500;
  const progressValue = targetOrdersForMaxDiscount
    ? Math.min(100, (totalOrders / targetOrdersForMaxDiscount) * 100)
    : 0;

  const maxDiscountPerUnit = 5000;
  const discountPerOrder = 10;
  const totalDiscount = Math.min(
    totalOrders * discountPerOrder,
    maxDiscountPerUnit
  );
  const baseUnitPrice = 15000;
  const effectiveUnitPrice = baseUnitPrice - totalDiscount;

  return (
    <>
      <Card className="relative flex flex-col rounded-2xl border border-gray-200 bg-white/80 shadow-sm transition-all hover:shadow-lg h-full">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base font-semibold">
              가격 & 리퍼럴 정책
            </CardTitle>
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
          <CardDescription className="space-y-1 text-xs text-muted-foreground" />
        </CardHeader>
        <CardContent className="flex-1 flex flex-col justify-between pt-1 gap-3 text-xs text-foreground">
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
              <div className="flex items-center justify-between text-md text-muted-foreground mb-4">
                <span>주문 합계</span>
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
                    10,000원
                  </span>
                </div>
              </div>
              <p className="text-md text-muted-foreground text-right">
                부가세·배송비 별도
              </p>
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground text-right">
              이벤트 기간 동안 가입한 기공소는 90일간 10,000원으로 고정됩니다.
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>가격 & 리퍼럴 정책 안내</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-4 pt-2 text-md text-muted-foreground">
                <section className="space-y-1">
                  <h3 className="font-semibold text-foreground text-md">
                    1. 기본 가격
                  </h3>
                  <p>커스텀 어벗 1개 주문 건당 기본 가격은 15,000원입니다.</p>
                  <p>부가가치세(VAT)와 배송비는 별도 청구됩니다.</p>
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
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
};

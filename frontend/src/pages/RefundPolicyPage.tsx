import { Navigation } from "@/features/layout/Navigation";
import { Footer } from "@/features/landing/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const RefundPolicyPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <div className="container mx-auto px-4 py-24">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">환불정책</h1>
            <p className="text-muted-foreground">
              최종 개정일: 2025년 12월 17일
            </p>
          </div>

          <div className="space-y-8">
            <Card>
              <CardHeader>
                <CardTitle>1. 적용 대상</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-muted-foreground">
                  <p>
                    본 환불정책은 abuts.fit에서 제공하는{" "}
                    <b>유료 크레딧 충전 결제</b>에 적용됩니다.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>2. 환불 가능 범위</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-muted-foreground">
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>
                      환불은 <b>회원 탈퇴(계정 해지)</b> 시점에 한하여
                      진행됩니다.
                    </li>
                    <li>
                      <b>잔여 유료 크레딧(공급가)</b>이 있는 경우, 해당 잔액은
                      <b> 전액 환불</b>됩니다.
                    </li>
                    <li>
                      무료/이벤트로 지급된 크레딧(보너스 크레딧)은 환불 대상에서
                      제외됩니다.
                    </li>
                    <li>
                      이미 사용된 크레딧(서비스 이용료로 차감된 금액)은 환불할
                      수 없습니다.
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>3. 부가가치세(VAT) 환불</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-muted-foreground">
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>
                      환불은 공급가 기준 잔여 유료 크레딧에 대해 진행되며, VAT는
                      잔여 공급가 비율에 따라 <b>비례 환불</b>됩니다.
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>4. 환불 신청 방법</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-muted-foreground">
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>
                      환불은 <b>회원 탈퇴(계정 해지)</b> 절차 진행 시
                      안내됩니다.
                    </li>
                    <li>
                      가상계좌 환불을 위해 은행/계좌번호/예금주 정보가 필요할 수
                      있습니다.
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>5. 처리 기간</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-muted-foreground">
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>
                      환불 접수 후 영업일 기준 <b>3일 이내</b> 처리하는 것을
                      원칙으로 합니다.
                    </li>
                    <li>
                      단, 결제수단/은행 사정 및 확인 절차에 따라 처리 기간이
                      달라질 수 있습니다.
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>6. 입금 전 주문 취소</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-muted-foreground">
                  <p>
                    가상계좌 결제에서 <b>입금 전</b> 상태의 주문은 취소할 수
                    있습니다.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

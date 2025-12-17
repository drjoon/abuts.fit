import { Navigation } from "@/features/layout/Navigation";
import { Footer } from "@/features/landing/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";

export const CreditsPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <div className="container mx-auto px-4 py-24">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">크레딧 충전 안내</h1>
            <p className="text-muted-foreground">
              abuts.fit 서비스 이용을 위한 결제 상품(크레딧) 안내
            </p>
          </div>

          <div className="space-y-8">
            <Card>
              <CardHeader>
                <CardTitle>1. 결제 상품/서비스</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-muted-foreground">
                  <p>
                    결제 상품은 abuts.fit 서비스 이용을 위한 <b>유료 크레딧</b>
                    (공급가 기준)입니다.
                  </p>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>
                      크레딧은 의뢰 진행 과정에서 발생하는 서비스 이용료/제작비
                      정산에 사용됩니다.
                    </li>
                    <li>
                      충전 금액은 <b>공급가</b> 기준이며, 결제 시{" "}
                      <b>부가가치세(VAT)</b>가 포함되어 결제됩니다.
                    </li>
                    <li>
                      크레딧 충전은 회원(기공소) 로그인 후 이용 가능합니다.
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>2. 결제 금액(단건) 및 범위</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-muted-foreground">
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>
                      크레딧 충전 금액(공급가): <b>50만원 ~ 500만원</b>
                    </li>
                    <li>
                      부가가치세(VAT): 공급가의 <b>10%</b>
                    </li>
                    <li>
                      단건 최고 결제 금액: 공급가 <b>5,000,000원</b> + VAT{" "}
                      <b>500,000원</b>= <b>5,500,000원</b>
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>3. 결제 수단</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-muted-foreground">
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>
                      기본 결제수단: <b>계좌이체</b>, <b>가상계좌</b>
                    </li>
                    <li>카드 결제는 사용하지 않습니다.</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>4. 서비스 제공(처리) 기간</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-muted-foreground">
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>
                      결제(입금) 완료 후 크레딧이 자동 충전되며,{" "}
                      <b>즉시~수 분</b> 내 반영됩니다.
                    </li>
                    <li>
                      예외적으로 지연되는 경우에도 <b>최대 1영업일 이내</b>{" "}
                      처리됩니다.
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>5. 환불 정책</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-muted-foreground">
                  <p>환불 정책은 아래 페이지에서 확인할 수 있습니다.</p>
                  <Link
                    to="/refund-policy"
                    className="text-primary underline underline-offset-4"
                  >
                    환불정책 바로가기
                  </Link>
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

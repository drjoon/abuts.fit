import { Navigation } from "@/features/layout/Navigation";
import { Footer } from "@/features/landing/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";

function formatWon(value: number) {
  return `${value.toLocaleString()}원`;
}

export const ServicePage = () => {
  const products = [500000, 1000000, 2000000, 3000000, 5000000].map(
    (supply) => {
      const vat = Math.round(supply * 0.1);
      const total = supply + vat;
      return { supply, vat, total };
    },
  );

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <div className="container mx-auto px-4 py-24">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">서비스/상품 안내</h1>
            <p className="text-muted-foreground">
              abuts.fit 서비스 내용 및 결제 상품(크레딧) 안내
            </p>
          </div>

          <div className="space-y-8">
            <Card>
              <CardHeader>
                <CardTitle>1. 서비스 개요</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-muted-foreground">
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>
                      abuts.fit는 치과기공소가 커스텀 제작 의뢰 및 정산을 관리할
                      수 있는 B2B 플랫폼입니다.
                    </li>
                    <li>
                      회원 가입 및 결제는 사업자(치과기공소)만 가능합니다.
                    </li>
                    <li>
                      제조(제작)는 제조 파트너(애크로덴트)가 담당하며, 플랫폼은
                      의뢰 접수/진행/정산 기능을 제공합니다.
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card id="credits">
              <CardHeader>
                <CardTitle>2. 판매 상품</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-muted-foreground">
                  <p>
                    결제 상품은 abuts.fit 서비스 이용을 위한 <b>유료 크레딧</b>
                    (공급가 기준)입니다.
                  </p>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>
                      크레딧은 플랫폼 내부 결제에만 사용되며, 사용자간{" "}
                      <b>양도</b> 또는 현금 <b>출금</b>은 불가합니다.
                    </li>
                    <li>
                      크레딧에는 별도의 소진기간(사용기한)을 두지 않습니다.
                    </li>
                    <li>
                      환불은 <b>계정 해지</b> 시점에 한하여 진행됩니다.
                    </li>
                    <li>
                      충전 금액은 <b>공급가</b> 기준이며, 결제 시{" "}
                      <b>부가가치세(VAT)</b>가 포함되어 결제됩니다.
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>3. 크레딧 충전 상품(가격)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-muted-foreground">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {products.map((p) => (
                      <div
                        key={p.supply}
                        className="app-surface app-surface--panel p-4"
                      >
                        <div className="text-sm font-medium text-foreground">
                          크레딧 충전{" "}
                          {Math.floor(p.supply / 10000).toLocaleString()}만원
                          (공급가)
                        </div>
                        <div className="mt-2 text-sm">
                          공급가: <b>{formatWon(p.supply)}</b>
                        </div>
                        <div className="text-sm">
                          VAT(10%): <b>{formatWon(p.vat)}</b>
                        </div>
                        <div className="mt-2 text-sm">
                          결제금액(부가세 포함): <b>{formatWon(p.total)}</b>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="text-xs">
                    충전 범위(단건): 공급가 <b>50만원 ~ 500만원</b> (VAT 별도
                    결제)
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>4. 결제 및 사용 경로</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-muted-foreground">
                  <div>
                    <div className="font-medium text-foreground mb-2">
                      충전 경로
                    </div>
                    <ol className="list-decimal list-inside space-y-2 ml-4">
                      <li>
                        <Link
                          to="/login"
                          className="text-primary underline underline-offset-4"
                        >
                          로그인
                        </Link>
                      </li>
                      <li>대시보드 → 설정 → 결제 탭</li>
                      <li>충전 금액 선택 후 계좌이체/가상계좌로 결제</li>
                      <li>
                        결제(입금) 완료 후 크레딧이 자동 충전되며{" "}
                        <b>즉시~수 분</b> 내 반영됩니다.
                      </li>
                    </ol>
                  </div>
                  <div>
                    <div className="font-medium text-foreground mb-2">
                      사용 경로
                    </div>
                    <ol className="list-decimal list-inside space-y-2 ml-4">
                      <li>의뢰 생성 및 진행</li>
                      <li>정산 단계에서 서비스 이용료/제작비 결제</li>
                      <li>결제 시 보유 크레딧에서 자동 차감</li>
                    </ol>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card id="pricing">
              <CardHeader>
                <CardTitle>5. 제작 의뢰 요금 산정 기준</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-muted-foreground">
                  <div>
                    <div className="font-medium text-foreground mb-2">
                      과금 단위
                    </div>
                    <ul className="list-disc list-inside space-y-2 ml-4">
                      <li>
                        판매 서비스는 <b>커스텀 어벗 제작 의뢰</b>이며, 기본
                        과금 단위는
                        <b> 1개(1치아 기준 1의뢰)</b>입니다.
                      </li>
                      <li>
                        임플란트 제조사/시스템/유형 등 제작 사양은 의뢰 내용에
                        포함되나, 현재는 사양/옵션별로 별도 추가금이 부과되지
                        않습니다.
                      </li>
                    </ul>
                  </div>

                  <div>
                    <div className="font-medium text-foreground mb-2">
                      기본 단가 및 특가(고정가)
                    </div>
                    <ul className="list-disc list-inside space-y-2 ml-4">
                      <li>
                        기본 단가: <b>15,000원/개</b>
                      </li>
                      <li>
                        재의뢰(리메이크/수정): 동일 치과·환자·치아 기준으로 최근
                        90일 내 의뢰 이력이 있는 경우 <b>10,000원/개</b>
                      </li>
                      <li>
                        런칭 이벤트(신규 기공소): 가입 승인일로부터 90일 동안
                        <b> 10,000원/개</b> 고정
                      </li>
                      <li>
                        <b>VAT(부가가치세) 및 배송비는 별도</b> 청구됩니다.
                      </li>
                    </ul>
                  </div>

                  <div>
                    <div className="font-medium text-foreground mb-2">
                      주문량/리퍼럴 할인(자동)
                    </div>
                    <ul className="list-disc list-inside space-y-2 ml-4">
                      <li>
                        최근 30일 주문 건수(본인 주문 + 리퍼럴로 가입한
                        기공소들의 주문) 합산 기준으로, <b>주문 1건당 10원</b>씩
                        단가가 자동 할인됩니다.
                      </li>
                      <li>
                        할인 한도는 <b>최대 5,000원</b>이며, 할인 한도 도달 시
                        단가는
                        <b> 10,000원/개</b>입니다.
                      </li>
                      <li>
                        예) 최근 30일 합산 주문 500건 이상 → 15,000 - (500*10) =
                        <b> 10,000원/개</b>
                      </li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card id="refund">
              <CardHeader>
                <CardTitle>6. 환불 정책</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-muted-foreground">
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>
                      환불은 <b>계정 해지</b> 시점에 한하여 진행됩니다.
                    </li>
                    <li>
                      크레딧에는 별도의 소진기간(사용기한)을 두지 않습니다.
                    </li>
                    <li>
                      <b>잔여 유료 크레딧(공급가)</b>이 있는 경우 해당 잔액은{" "}
                      <b>전액 환불</b>
                      됩니다.
                    </li>
                    <li>
                      무료/이벤트로 지급된 크레딧(보너스 크레딧)은 환불 대상에서
                      제외됩니다.
                    </li>
                    <li>
                      VAT는 잔여 공급가 비율에 따라 <b>비례 환불</b>됩니다.
                    </li>
                    <li>
                      가상계좌 환불을 위해 은행/계좌번호/예금주 정보가 필요할 수
                      있으며, 가맹점이 확인 후 환불 계좌로 입금하는 방식으로
                      처리될 수 있습니다.
                    </li>
                  </ul>
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

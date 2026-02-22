import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "react-router-dom";
import {
  PublicPageLayout,
  PUBLIC_CARD_CLASS,
} from "./components/PublicPageLayout";

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
    <PublicPageLayout>
      <div className="space-y-8 max-w-4xl mx-auto">
        <div className="text-center space-y-2">
          <p className="text-xs uppercase tracking-[0.35em] text-white/60">
            service
          </p>
          <h1 className="text-4xl font-semibold text-white">
            서비스/상품 안내
          </h1>
          <p className="text-white/70">
            abuts.fit 서비스 내용 및 결제 상품(크레딧) 안내
          </p>
        </div>

        <div className="space-y-8">
          <Card className={PUBLIC_CARD_CLASS}>
            <CardHeader>
              <CardTitle>1. 서비스 개요</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-slate-600">
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>
                    abuts.fit는 치과기공소가 커스텀 어벗먼트 의뢰 및 정산을
                    관리할 수 있는 B2B 플랫폼입니다.
                  </li>
                  <li>회원 가입 및 결제는 사업자(치과기공소)만 가능합니다.</li>
                  <li>
                    제조는 애크로덴트가 담당하며, 플랫폼은 의뢰 접수·진행·정산
                    기능을 제공합니다.
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card id="credits" className={PUBLIC_CARD_CLASS}>
            <CardHeader>
              <CardTitle>2. 판매 상품</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-slate-600">
                <p>
                  결제 상품은 abuts.fit 서비스 이용을 위한 <b>유료 크레딧</b>
                  (공급가 기준)입니다.
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>
                    크레딧은 플랫폼 내부 결제에만 사용되며, 사용자간 <b>양도</b>{" "}
                    또는 현금 <b>출금</b>은 불가합니다.
                  </li>
                  <li>크레딧에는 별도의 사용기한을 두지 않습니다.</li>
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

          <Card className={PUBLIC_CARD_CLASS}>
            <CardHeader>
              <CardTitle>3. 크레딧 충전 상품(가격)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-slate-600">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {products.map((p) => (
                    <div
                      key={p.supply}
                      className="rounded-2xl border border-white/20 bg-white/85 p-4 text-slate-900"
                    >
                      <div className="text-sm font-medium">
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
                <p className="text-xs text-slate-500">
                  충전 범위(단건): 공급가 <b>50만원 ~ 500만원</b> (VAT 별도
                  결제)
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className={PUBLIC_CARD_CLASS}>
            <CardHeader>
              <CardTitle>4. 결제 및 사용 경로</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-slate-600">
                <div>
                  <div className="font-medium text-slate-900 mb-2">
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
                    <li>충전 금액 선택 후 계좌이체/가상계좌 결제</li>
                    <li>
                      결제(입금) 완료 후 크레딧이 즉시~수 분 내 반영되며{" "}
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
                  </ol>
                </div>
                <div>
                  <div className="font-medium text-slate-900 mb-2">
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

          <Card id="pricing" className={PUBLIC_CARD_CLASS}>
            <CardHeader>
              <CardTitle>5. 제작 의뢰 요금 산정 기준</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-slate-600">
                <div>
                  <div className="font-medium text-slate-900 mb-2">
                    과금 단위
                  </div>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>
                      판매 서비스는 <b>커스텀 어벗먼트 제작 의뢰</b>이며 기본
                      과금 단위는 1개(1치아 기준 1의뢰)입니다.
                    </li>
                    <li>
                      제작 사양은 의뢰 내용에 포함되며 현재는 사양별 추가금이
                      없습니다.
                    </li>
                  </ul>
                </div>
                <div>
                  <div className="font-medium text-slate-900 mb-2">
                    기본 단가 및 특가
                  </div>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>
                      협력 치과기공소/제조사와의 계약에 따라 개별 산정됩니다.
                    </li>
                    <li>
                      조건에 따라 고정 단가 또는 특가 정책이 적용될 수 있습니다.
                    </li>
                  </ul>
                </div>
                <div>
                  <div className="font-medium text-slate-900 mb-2">
                    추가 비용
                  </div>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>배송비는 별도 청구되며 묶음배송을 권장합니다.</li>
                    <li>
                      긴급 제작 또는 특수 소재 요청 시 추가 비용이 발생할 수
                      있습니다.
                    </li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={PUBLIC_CARD_CLASS}>
            <CardHeader>
              <CardTitle>6. 환불 기준 및 절차</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-slate-600">
                <div>
                  <div className="font-medium text-slate-900 mb-2">
                    환불 신청
                  </div>
                  <ol className="list-decimal list-inside space-y-2 ml-4">
                    <li>계정 해지 신청</li>
                    <li>잔여 크레딧 확인</li>
                    <li>환불 계좌 정보 제출</li>
                    <li>확인 완료 후 3영업일 이내 환불</li>
                  </ol>
                </div>
                <div>
                  <div className="font-medium text-slate-900 mb-2">
                    환불 산정 기준
                  </div>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>잔여 유료 크레딧(공급가) 100% 환불</li>
                    <li>무료/이벤트 크레딧 제외</li>
                    <li>부가가치세(VAT)는 공급가 비율로 비례 환불</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PublicPageLayout>
  );
};

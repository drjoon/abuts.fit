import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PublicPageLayout,
  PUBLIC_CARD_CLASS,
} from "./components/PublicPageLayout";

export const TermsPage = () => {
  return (
    <PublicPageLayout>
      <div className="space-y-8 max-w-4xl mx-auto">
        <div className="text-center space-y-2">
          <p className="text-xs uppercase tracking-[0.35em] text-white/60">
            policy
          </p>
          <h1 className="text-4xl font-semibold text-white">이용약관</h1>
          <p className="text-white/70">최종 개정일: 2026년 3월 2일</p>
        </div>

        <div className="space-y-8">
          <Card className={PUBLIC_CARD_CLASS}>
            <CardHeader>
              <CardTitle>제1조 (목적)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600 leading-relaxed">
                이 약관은 어벗츠 주식회사(이하 "회사")가 제공하는 온라인 플랫폼
                서비스 (이하 "서비스")의 이용과 관련하여 회사와 이용자 간의
                권리, 의무 및 책임사항을 규정함을 목적으로 합니다.
              </p>
            </CardContent>
          </Card>

          <Card className={PUBLIC_CARD_CLASS}>
            <CardHeader>
              <CardTitle>제2조 (정의)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-slate-600">
                <p>이 약관에서 사용하는 용어의 정의는 다음과 같습니다.</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>
                    "서비스"란 회사가 제공하는 커스텀 어벗먼트 의뢰 및 진행 관리
                    플랫폼을 의미합니다.
                  </li>
                  <li>
                    "이용자"란 이 약관에 따라 회사가 제공하는 서비스를 받는 자를
                    의미합니다.
                  </li>
                  <li>
                    "회원"이란 회사에 개인정보를 제공하여 회원등록을 한 자로서,
                    회사의 정보를 지속적으로 제공받으며 회사가 제공하는 서비스를
                    계속적으로 이용할 수 있는 자를 의미합니다.
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card className={PUBLIC_CARD_CLASS}>
            <CardHeader>
              <CardTitle>제3조 (약관의 효력 및 변경)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-slate-600">
                <p>
                  1. 이 약관은 서비스 화면에 게시하거나 기타의 방법으로 회원에게
                  공지함으로써 효력을 발생합니다.
                </p>
                <p>
                  2. 회사는 필요하다고 인정되는 경우 이 약관을 변경할 수 있으며,
                  변경된 약관은 공지 또는 통지하여 효력을 발생합니다.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className={PUBLIC_CARD_CLASS}>
            <CardHeader>
              <CardTitle>제4조 (회원가입)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-slate-600">
                <p>
                  1. 이용자는 회사가 정한 가입 양식에 따라 회원정보를 기입한 후
                  이 약관에 동의한다는 의사표시를 함으로써 회원가입을
                  신청합니다.
                </p>
                <p>
                  2. 회사는 신청자가 다음 각 호에 해당하지 않는 한 회원으로
                  등록합니다.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className={PUBLIC_CARD_CLASS}>
            <CardHeader>
              <CardTitle>제5조 (서비스의 제공)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-slate-600">
                <p>회사가 제공하는 서비스는 다음과 같습니다.</p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>커스텀 어벗먼트 의뢰 등록 및 파일 업로드 서비스</li>
                  <li>의뢰 관리 및 진행상황 확인 서비스</li>
                  <li>문의 접수(문의 남기기) 및 이메일 회신 서비스</li>
                  <li>품질 보증 및 분쟁 조정 서비스</li>
                  <li>
                    기타 회사가 추가 개발하거나 제휴계약 등을 통해 제공하는
                    일체의 서비스
                  </li>
                </ul>
                <p className="text-sm text-slate-500">
                  * 현재는 커스텀 어벗먼트 의뢰만 제공하며, 크라운은 제공하지
                  않습니다.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className={PUBLIC_CARD_CLASS}>
            <CardHeader>
              <CardTitle>제6조 (서비스 이용료)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-slate-600">
                <p>
                  1. 제작비(상품 금액)는 서비스 화면에 안내된 기준에 따릅니다.
                </p>
                <p>
                  2. 제작비는 부가가치세(VAT) 및 배송비가 포함되지 않은
                  금액이며, 부가가치세와 배송비는 별도 청구됩니다.
                </p>
                <p>
                  3. 제조는 애크로덴트가 단독으로 담당하며, 이용자는 회사의
                  안내에 따라 서비스를 이용합니다.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className={PUBLIC_CARD_CLASS}>
            <CardHeader>
              <CardTitle>제7조 (크레딧 및 환불)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-slate-600">
                <p>
                  1. 회사는 서비스 이용료 결제를 위해 크레딧(서비스 내부에서만
                  사용 가능한 선결제 잔액)을 제공합니다.
                </p>
                <p>
                  2. 크레딧은 서비스 이용료 정산에 한하여 사용되며, 회원 간 양도
                  또는 현금 출금은 불가합니다.
                </p>
                <p>3. 크레딧에는 별도의 사용기한을 두지 않습니다.</p>
                <p>
                  4. 크레딧 환불은 계정 해지 시점에 한하여 진행되며, 계정 해지
                  이전에는 환불을 신청할 수 없습니다.
                </p>
                <p>
                  5. 환불 금액은 잔여 유료 크레딧(공급가) 기준으로 산정되며,
                  무료/이벤트로 지급된 크레딧은 제외됩니다.
                </p>
                <p>
                  6. 결제 시 포함된 부가가치세(VAT)는 잔여 공급가 비율에 따라
                  비례 환불됩니다.
                </p>
                <p>
                  7. 결제수단 특성에 따라 환불 계좌 정보가 필요할 수 있으며,
                  회사 확인 후 환불 계좌로 입금하는 방식으로 처리될 수 있습니다.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PublicPageLayout>
  );
};

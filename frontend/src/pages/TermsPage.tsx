import { Navigation } from "@/features/layout/Navigation";
import { Footer } from "@/features/landing/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const TermsPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <div className="container mx-auto px-4 py-24">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">이용약관</h1>
            <p className="text-muted-foreground">최종 개정일: 2025년 1월 1일</p>
          </div>

          <div className="space-y-8">
            <Card>
              <CardHeader>
                <CardTitle>제1조 (목적)</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground leading-relaxed">
                  이 약관은 어벗츠 주식회사(이하 "회사")가 제공하는 온라인
                  플랫폼 서비스(이하 "서비스")의 이용과 관련하여 회사와 이용자
                  간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>제2조 (정의)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-muted-foreground">
                  <p>이 약관에서 사용하는 용어의 정의는 다음과 같습니다:</p>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>
                      "서비스"란 회사가 제공하는 커스텀 어벗 의뢰 및 진행 관리
                      플랫폼을 의미합니다.
                    </li>
                    <li>
                      "이용자"란 이 약관에 따라 회사가 제공하는 서비스를 받는
                      자를 의미합니다.
                    </li>
                    <li>
                      "회원"이란 회사에 개인정보를 제공하여 회원등록을 한
                      자로서, 회사의 정보를 지속적으로 제공받으며 회사가
                      제공하는 서비스를 계속적으로 이용할 수 있는 자를
                      의미합니다.
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>제3조 (약관의 효력 및 변경)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-muted-foreground">
                  <p>
                    1. 이 약관은 서비스 화면에 게시하거나 기타의 방법으로
                    회원에게 공지함으로써 효력을 발생합니다.
                  </p>
                  <p>
                    2. 회사는 필요하다고 인정되는 경우 이 약관을 변경할 수
                    있으며, 변경된 약관은 제1항과 같은 방법으로 공지 또는
                    통지함으로써 효력을 발생합니다.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>제4조 (회원가입)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-muted-foreground">
                  <p>
                    1. 이용자는 회사가 정한 가입 양식에 따라 회원정보를 기입한
                    후 이 약관에 동의한다는 의사표시를 함으로써 회원가입을
                    신청합니다.
                  </p>
                  <p>
                    2. 회사는 제1항과 같이 회원으로 가입할 것을 신청한 이용자 중
                    다음 각 호에 해당하지 않는 한 회원으로 등록합니다.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>제5조 (서비스의 제공)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-muted-foreground">
                  <p>회사가 제공하는 서비스는 다음과 같습니다:</p>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>커스텀 어벗 의뢰 등록 및 파일 업로드 서비스</li>
                    <li>의뢰 관리 및 진행상황 확인 서비스</li>
                    <li>문의 접수(문의 남기기) 및 이메일 회신 서비스</li>
                    <li>품질 보증 및 분쟁 조정 서비스</li>
                    <li>
                      기타 회사가 추가 개발하거나 제휴계약 등을 통해 회원들에게
                      제공하는 일체의 서비스
                    </li>
                  </ul>
                  <p>
                    * 현재는 커스텀 어벗 의뢰만 제공하며, 크라운은 제공하지
                    않습니다.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>제6조 (서비스 이용료)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-muted-foreground">
                  <p>
                    1. 제작비(상품 금액)는 서비스 화면에 안내된 기준에 따릅니다.
                  </p>
                  <p>
                    2. 제작비는 <b>부가가치세(VAT)</b> 및 <b>배송비</b>가
                    포함되지 않은 금액이며, 부가가치세(VAT)와 배송비는 별도
                    청구됩니다.
                  </p>
                  <p>
                    3. 제조는 애크로덴트가 단독으로 담당하며, 이용자는 서비스
                    제공사(회사)인 어벗츠 주식회사의 안내에 따라 서비스를
                    이용합니다.
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

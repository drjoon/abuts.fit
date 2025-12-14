import { Navigation } from "@/features/layout/Navigation";
import { Footer } from "@/features/landing/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { COMPANY_PHONE, PRIVACY_EMAIL } from "@/shared/lib/contactInfo";

export const PrivacyPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <div className="container mx-auto px-4 py-24">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">개인정보처리방침</h1>
            <p className="text-muted-foreground">최종 개정일: 2025년 1월 1일</p>
          </div>

          <div className="space-y-8">
            <Card>
              <CardHeader>
                <CardTitle>1. 개인정보의 처리목적</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-muted-foreground">
                  <p>
                    어벗츠 주식회사는 다음의 목적을 위하여 개인정보를
                    처리합니다:
                  </p>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>서비스 제공 및 회원관리</li>
                    <li>치과기공소와 제조사 간의 매칭 서비스 제공</li>
                    <li>고객 상담 및 불만처리</li>
                    <li>서비스 개선 및 신규 서비스 개발</li>
                    <li>법정 의무 이행</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>2. 처리하는 개인정보의 항목</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-muted-foreground">
                  <p>회사는 다음의 개인정보 항목을 처리합니다:</p>
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium text-foreground mb-2">
                        필수항목:
                      </h4>
                      <ul className="list-disc list-inside space-y-1 ml-4">
                        <li>이름, 이메일주소, 전화번호</li>
                        <li>회사명, 사업자등록번호(사업자의 경우)</li>
                        <li>서비스 이용기록, 접속로그</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-medium text-foreground mb-2">
                        선택항목:
                      </h4>
                      <ul className="list-disc list-inside space-y-1 ml-4">
                        <li>프로필 사진, 회사 소개</li>
                        <li>마케팅 수신 동의 정보</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>3. 개인정보의 처리 및 보유기간</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-muted-foreground">
                  <p>
                    회사는 법령에 따른 개인정보 보유·이용기간 또는
                    정보주체로부터 개인정보를 수집 시에 동의받은 개인정보
                    보유·이용기간 내에서 개인정보를 처리·보유합니다.
                  </p>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>회원가입 및 관리: 회원 탈퇴 시까지</li>
                    <li>서비스 제공: 서비스 이용 종료 시까지</li>
                    <li>전자상거래법에 따른 거래기록: 5년</li>
                    <li>소비자 불만 또는 분쟁처리: 3년</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>4. 개인정보의 제3자 제공</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-muted-foreground">
                  <p>
                    회사는 원칙적으로 정보주체의 개인정보를 수집·이용 목적으로
                    명시한 범위 내에서 처리하며, 다음의 경우를 제외하고는
                    정보주체의 사전 동의 없이는 본래의 목적 범위를 초과하여
                    처리하거나 제3자에게 제공하지 않습니다:
                  </p>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>정보주체로부터 별도의 동의를 받은 경우</li>
                    <li>
                      법률에 특별한 규정이 있거나 법령상 의무를 준수하기 위하여
                      불가피한 경우
                    </li>
                    <li>
                      정보주체 또는 그 법정대리인이 의사표시를 할 수 없는 상태에
                      있거나 주소불명 등으로 사전 동의를 받을 수 없는 경우로서
                      명백히 정보주체 또는 제3자의 급박한 생명, 신체, 재산의
                      이익을 위하여 필요하다고 인정되는 경우
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>5. 정보주체의 권리·의무 및 그 행사방법</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-muted-foreground">
                  <p>
                    정보주체는 회사에 대해 언제든지 다음 각 호의 개인정보 보호
                    관련 권리를 행사할 수 있습니다:
                  </p>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>개인정보 처리현황 통지요구</li>
                    <li>개인정보 처리정지 요구</li>
                    <li>개인정보의 정정·삭제 요구</li>
                    <li>손해배상 청구</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>6. 개인정보보호책임자</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-muted-foreground">
                  <p>
                    회사는 개인정보 처리에 관한 업무를 총괄해서 책임지고,
                    개인정보 처리와 관련한 정보주체의 불만처리 및 피해구제 등을
                    위하여 아래와 같이 개인정보보호책임자를 지정하고 있습니다:
                  </p>
                  <div className="bg-muted/50 p-4 rounded-lg">
                    <p>
                      <strong>개인정보보호책임자</strong>
                    </p>
                    <p>이메일: {PRIVACY_EMAIL}</p>
                    <p>전화번호: {COMPANY_PHONE}</p>
                  </div>
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

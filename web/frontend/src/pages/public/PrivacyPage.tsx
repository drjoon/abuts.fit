import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PublicPageLayout,
  PUBLIC_CARD_CLASS,
} from "./components/PublicPageLayout";
import { COMPANY_PHONE, PRIVACY_EMAIL } from "@/shared/lib/contactInfo";

export const PrivacyPage = () => {
  return (
    <PublicPageLayout>
      <div className="space-y-8 max-w-4xl mx-auto">
        <div className="text-center space-y-2">
          <p className="text-xs uppercase tracking-[0.35em] text-white/60">
            privacy
          </p>
          <h1 className="text-4xl font-semibold text-white">
            개인정보처리방침
          </h1>
          <p className="text-white/70">최종 개정일: 2026년 3월 2일</p>
        </div>

        <div className="space-y-8">
          {[1, 2, 3, 4, 5, 6].map((section) => (
            <Card key={section} className={PUBLIC_CARD_CLASS}>
              <CardHeader>
                <CardTitle>
                  {section === 1 && "1. 개인정보의 처리목적"}
                  {section === 2 && "2. 처리하는 개인정보의 항목"}
                  {section === 3 && "3. 개인정보의 처리 및 보유기간"}
                  {section === 4 && "4. 개인정보의 제3자 제공"}
                  {section === 5 && "5. 정보주체의 권리·의무 및 그 행사방법"}
                  {section === 6 && "6. 개인정보보호책임자"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-slate-600">
                  {section === 1 && (
                    <>
                      <p>
                        어벗츠 주식회사는 다음의 목적을 위하여 개인정보를
                        처리합니다:
                      </p>
                      <ul className="list-disc list-inside space-y-1 ml-4">
                        <li>서비스 제공 및 회원관리</li>
                        <li>어벗먼트 매칭 서비스 제공</li>
                        <li>고객 상담 및 불만처리</li>
                        <li>서비스 개선 및 신규 서비스 개발</li>
                        <li>법정 의무 이행</li>
                      </ul>
                    </>
                  )}
                  {section === 2 && (
                    <>
                      <p>회사는 다음의 개인정보 항목을 처리합니다:</p>
                      <div className="space-y-3">
                        <div>
                          <h4 className="font-medium text-slate-900 mb-1">
                            필수항목
                          </h4>
                          <ul className="list-disc list-inside space-y-1 ml-4">
                            <li>이름, 이메일주소, 전화번호</li>
                            <li>회사명, 사업자등록번호(사업자의 경우)</li>
                            <li>서비스 이용기록, 접속로그</li>
                          </ul>
                        </div>
                        <div>
                          <h4 className="font-medium text-slate-900 mb-1">
                            선택항목
                          </h4>
                          <ul className="list-disc list-inside space-y-1 ml-4">
                            <li>프로필 사진, 회사 소개</li>
                            <li>마케팅 수신 동의 정보</li>
                          </ul>
                        </div>
                      </div>
                    </>
                  )}
                  {section === 3 && (
                    <>
                      <p>
                        회사는 법령에 따른 개인정보 보유·이용기간 내에서
                        개인정보를 처리·보유합니다.
                      </p>
                      <ul className="list-disc list-inside space-y-1 ml-4">
                        <li>회원가입 및 관리: 회원 탈퇴 시까지</li>
                        <li>서비스 제공: 서비스 이용 종료 시까지</li>
                        <li>전자상거래법에 따른 거래기록: 5년</li>
                        <li>소비자 불만 또는 분쟁처리: 3년</li>
                      </ul>
                    </>
                  )}
                  {section === 4 && (
                    <>
                      <p>
                        회사는 다음의 경우를 제외하고 정보주체의 동의 없이
                        개인정보를 제3자에게 제공하지 않습니다:
                      </p>
                      <ul className="list-disc list-inside space-y-1 ml-4">
                        <li>정보주체로부터 별도의 동의를 받은 경우</li>
                        <li>
                          법률에 특별한 규정이 있거나 법령상 의무를 준수해야
                          하는 경우
                        </li>
                        <li>
                          정보주체 또는 제3자의 급박한 생명, 신체, 재산의 이익을
                          위해 필요한 경우
                        </li>
                      </ul>
                    </>
                  )}
                  {section === 5 && (
                    <>
                      <p>
                        정보주체는 회사에 대해 다음과 같은 권리를 행사할 수
                        있습니다:
                      </p>
                      <ul className="list-disc list-inside space-y-1 ml-4">
                        <li>개인정보 처리현황 통지요구</li>
                        <li>개인정보 처리정지 요구</li>
                        <li>개인정보의 정정·삭제 요구</li>
                        <li>손해배상 청구</li>
                      </ul>
                    </>
                  )}
                  {section === 6 && (
                    <>
                      <p>
                        회사는 개인정보 처리에 관한 업무를 총괄하고 피해구제를
                        담당할 개인정보보호책임자를 아래와 같이 지정하고
                        있습니다:
                      </p>
                      <div className="rounded-lg bg-slate-900/5 p-4">
                        <p>
                          <strong>개인정보보호책임자</strong>
                        </p>
                        <p>이메일: {PRIVACY_EMAIL}</p>
                        <p>전화번호: {COMPANY_PHONE}</p>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </PublicPageLayout>
  );
};

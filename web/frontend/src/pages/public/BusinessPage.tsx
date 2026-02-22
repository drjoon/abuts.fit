import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PublicPageLayout,
  PUBLIC_CARD_CLASS,
} from "./components/PublicPageLayout";
import { Building, MapPin, Phone, Mail, FileText } from "lucide-react";
import {
  BUSINESS_EMAIL,
  COMPANY_ADDRESS,
  COMPANY_BUSINESS_REGISTRATION_NUMBER,
  COMPANY_CEO_NAME,
  COMPANY_NAME,
  COMPANY_PHONE,
  SUPPORT_EMAIL,
} from "@/shared/lib/contactInfo";

export const BusinessPage = () => {
  return (
    <PublicPageLayout>
      <div className="space-y-10">
        <div className="text-center space-y-3">
          <p className="text-xs uppercase tracking-[0.35em] text-white/60">
            Company info
          </p>
          <h1 className="text-4xl font-semibold text-white">사업자 정보</h1>
          <p className="text-white/70">
            어벗츠.핏을 운영하는 어벗츠 주식회사의 공식 정보입니다.
          </p>
        </div>

        <div className="space-y-8">
          <Card className={PUBLIC_CARD_CLASS}>
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-slate-900">
                <Building className="h-6 w-6 text-primary" />
                회사 정보
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 text-slate-600">
                <div>
                  <h4 className="font-medium text-slate-900 mb-2">상호명</h4>
                  <p>{COMPANY_NAME}</p>
                </div>
                <div>
                  <h4 className="font-medium text-slate-900 mb-2">대표자</h4>
                  <p>{COMPANY_CEO_NAME}</p>
                </div>
                <div>
                  <h4 className="font-medium text-slate-900 mb-2">
                    사업자등록번호
                  </h4>
                  <p>{COMPANY_BUSINESS_REGISTRATION_NUMBER}</p>
                </div>
                <div>
                  <h4 className="font-medium text-slate-900 mb-2">
                    통신판매업신고번호
                  </h4>
                  <p>해당 없음</p>
                </div>
                <div>
                  <h4 className="font-medium text-slate-900 mb-2">
                    법인등록번호
                  </h4>
                  <p>194911-0007687</p>
                </div>
                <div>
                  <h4 className="font-medium text-slate-900 mb-2">
                    개업연월일
                  </h4>
                  <p>2025년 10월 20일</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={PUBLIC_CARD_CLASS}>
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-slate-900">
                <MapPin className="h-6 w-6 text-primary" />
                주소 정보
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-600">{COMPANY_ADDRESS}</p>
            </CardContent>
          </Card>

          <Card className={PUBLIC_CARD_CLASS}>
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-slate-900">
                <Phone className="h-6 w-6 text-primary" />
                연락처 정보
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-6 text-slate-600 md:grid-cols-2">
                <div>
                  <h4 className="font-medium text-slate-900 mb-2">대표 전화</h4>
                  <p>{COMPANY_PHONE}</p>
                </div>
                <div>
                  <h4 className="font-medium text-slate-900 mb-2">고객지원</h4>
                  <p>{SUPPORT_EMAIL}</p>
                </div>
                <div>
                  <h4 className="font-medium text-slate-900 mb-2">사업 문의</h4>
                  <p>{BUSINESS_EMAIL}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={PUBLIC_CARD_CLASS}>
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-slate-900">
                <FileText className="h-6 w-6 text-primary" />
                사업 내용
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 text-slate-600">
              <div>
                <h4 className="font-medium text-slate-900 mb-2">주요 사업</h4>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li>온라인 플랫폼 서비스 제공업</li>
                  <li>치과기공소와 제조사 중개 서비스</li>
                  <li>커스텀 어벗먼트 관련 서비스</li>
                  <li>소프트웨어 개발 및 유지보수</li>
                </ul>
              </div>

              <div>
                <h4 className="font-medium text-slate-900 mb-2">
                  사업자 정보 공시
                </h4>
                <p>
                  본 사업자 정보는 관계 법령에 따라 공시되며, 통신판매업 신고 및
                  관련 행정 절차를 완료했습니다.
                </p>
              </div>

              <div>
                <h4 className="font-medium text-slate-900 mb-2">
                  소비자 분쟁해결
                </h4>
                <p>
                  소비자분쟁해결기준(공정거래위원회 고시)에 따라 피해를 보상받을
                  수 있으며, 분쟁 조정 신청은 소비자분쟁조정위원회 및
                  개인정보보호위원회에 신청 가능합니다.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PublicPageLayout>
  );
};

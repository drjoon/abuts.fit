// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PublicPageLayout,
  PUBLIC_CARD_CLASS,
  PUBLIC_PAGE_EYEBROW,
  PUBLIC_PAGE_TITLE,
  PUBLIC_PAGE_SUBTITLE,
} from "./components/PublicPageLayout";
import { Building, MapPin, Phone, Mail, FileText } from "lucide-react";
import {
  BUSINESS_EMAIL,
  COMPANY_ADDRESS,
  COMPANY_BUSINESS_ITEMS,
  COMPANY_BUSINESS_REGISTRATION_NUMBER,
  COMPANY_BUSINESS_TYPES,
  COMPANY_CEO_KIND,
  COMPANY_CEO_NAME,
  COMPANY_CORP_REGISTRATION_NUMBER,
  COMPANY_HOSTING_LOCATION,
  COMPANY_MAIL_ORDER_REPORT_AUTHORITY,
  COMPANY_MAIL_ORDER_REPORT_AUTHORITY_PHONE,
  COMPANY_MAIL_ORDER_REPORT_NUMBER,
  COMPANY_MEDICAL_DEVICE_SALES_REPORT_AUTHORITY,
  COMPANY_MEDICAL_DEVICE_SALES_REPORT_NUMBER,
  COMPANY_NAME,
  COMPANY_OPENING_DATE_LABEL,
  COMPANY_PHONE,
  COMPANY_SERVICE_DOMAIN,
  CONTACT_EMAIL,
  FTC_MAIL_ORDER_BUSINESS_INFO_URL,
  SUPPORT_EMAIL,
} from "@/shared/lib/contactInfo";

export const BusinessPage = () => {
  return (
    <PublicPageLayout>
      <div className="space-y-10">
        <div className="text-center space-y-3">
          <p className={PUBLIC_PAGE_EYEBROW}>
            Company info
          </p>
          <h1 className={PUBLIC_PAGE_TITLE}>사업자 정보</h1>
          <p className="text-slate-600">
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
                  <p className="mt-1 text-sm text-slate-500">{COMPANY_CEO_KIND}</p>
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
                  <p>{COMPANY_MAIL_ORDER_REPORT_NUMBER}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    신고기관: {COMPANY_MAIL_ORDER_REPORT_AUTHORITY} (
                    {COMPANY_MAIL_ORDER_REPORT_AUTHORITY_PHONE})
                  </p>
                </div>
                <div>
                  <h4 className="font-medium text-slate-900 mb-2">
                    의료기기판매업신고번호
                  </h4>
                  <p>{COMPANY_MEDICAL_DEVICE_SALES_REPORT_NUMBER}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    신고기관: {COMPANY_MEDICAL_DEVICE_SALES_REPORT_AUTHORITY}
                  </p>
                </div>
                <div>
                  <h4 className="font-medium text-slate-900 mb-2">
                    인터넷 도메인
                  </h4>
                  <p>{COMPANY_SERVICE_DOMAIN}</p>
                </div>
                <div>
                  <h4 className="font-medium text-slate-900 mb-2">
                    호스트서버 소재지
                  </h4>
                  <p>{COMPANY_HOSTING_LOCATION}</p>
                </div>
                <div>
                  <h4 className="font-medium text-slate-900 mb-2">
                    전자우편주소
                  </h4>
                  <p>{CONTACT_EMAIL}</p>
                </div>
                <div>
                  <h4 className="font-medium text-slate-900 mb-2">
                    법인등록번호
                  </h4>
                  <p>{COMPANY_CORP_REGISTRATION_NUMBER}</p>
                </div>
                <div>
                  <h4 className="font-medium text-slate-900 mb-2">
                    개업연월일
                  </h4>
                  <p>{COMPANY_OPENING_DATE_LABEL}</p>
                </div>
                <div>
                  <h4 className="font-medium text-slate-900 mb-2">업태</h4>
                  <p>{COMPANY_BUSINESS_TYPES}</p>
                </div>
                <div>
                  <h4 className="font-medium text-slate-900 mb-2">종목</h4>
                  <p>{COMPANY_BUSINESS_ITEMS}</p>
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
                  <li>치과기공소 B2B 기공의뢰·정산 플랫폼</li>
                  <li>커스텀 어벗먼트 제작·납품</li>
                  <li>기공료 선입금(크레딧) 충전 및 정산</li>
                  <li>소프트웨어 개발 및 유지보수</li>
                </ul>
              </div>

              <div>
                <h4 className="font-medium text-slate-900 mb-2">
                  사업자 정보 공시
                </h4>
                <p>본 사업자 정보는 관계 법령에 따라 공시됩니다.</p>
              </div>

              <div>
                <h4 className="font-medium text-slate-900 mb-2">
                  소비자 분쟁해결
                </h4>
                <p>
                  분쟁이 있으면 먼저 고객지원({SUPPORT_EMAIL})으로 연락해 주세요.
                  <br />
                  소비자분쟁해결기준(공정거래위원회 고시)에 따라 피해 보상을
                  받을 수 있습니다.
                  <br />
                  조정 신청: 한국소비자원 소비자분쟁조정위원회(국번 없이 1372),
                  공정거래위원회 전자상거래 민원센터.
                </p>
                <p className="mt-3">
                  <a
                    href={FTC_MAIL_ORDER_BUSINESS_INFO_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-700 underline-offset-2 hover:underline"
                  >
                    공정거래위원회 통신판매사업자 정보 확인
                  </a>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </PublicPageLayout>
  );
};

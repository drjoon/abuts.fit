import { Navigation } from "@/features/layout/Navigation";
import { Footer } from "@/features/landing/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Lock, Eye, FileText } from "lucide-react";
import { COMPANY_PHONE, SECURITY_EMAIL } from "@/shared/lib/contactInfo";

export const SecurityPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <div className="container mx-auto px-4 py-20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">보안 정책</h1>
            <p className="text-muted-foreground">
              어벗츠.핏의 보안 정책과 데이터 보호 방침
            </p>
          </div>

          <div className="space-y-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Shield className="h-6 w-6 text-primary" />
                  데이터 보안
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-muted-foreground">
                  <p>
                    어벗츠.핏은 사용자의 개인정보와 데이터를 안전하게 보호하기
                    위해 다음과 같은 보안 조치를 취하고 있습니다:
                  </p>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>SSL/TLS 암호화를 통한 데이터 전송 보호</li>
                    <li>정기적인 보안 점검 및 취약점 분석</li>
                    <li>접근 권한 관리 및 모니터링</li>
                    <li>데이터베이스 암호화 저장</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Lock className="h-6 w-6 text-primary" />
                  계정 보안
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-muted-foreground">
                  <p>안전한 계정 사용을 위한 권장사항:</p>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>
                      강력한 비밀번호 사용 (8자 이상, 대소문자, 숫자, 특수문자
                      포함)
                    </li>
                    <li>정기적인 비밀번호 변경</li>
                    <li>다른 서비스와 동일한 비밀번호 사용 금지</li>
                    <li>의심스러운 활동 발견시 즉시 신고</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Eye className="h-6 w-6 text-primary" />
                  보안 사고 대응
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-muted-foreground">
                  <p>보안 사고 발생시 다음과 같은 절차를 따릅니다:</p>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>즉시 사고 원인 파악 및 차단</li>
                    <li>영향 범위 조사 및 피해 최소화</li>
                    <li>관련 기관 신고 및 사용자 고지</li>
                    <li>재발 방지를 위한 보안 강화</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <FileText className="h-6 w-6 text-primary" />
                  보안 신고
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-muted-foreground">
                  <p>보안 취약점이나 의심스러운 활동을 발견하신 경우:</p>
                  <div className="bg-muted/50 p-4 rounded-lg">
                    <p>
                      <strong>보안팀 연락처</strong>
                    </p>
                    <p>이메일: {SECURITY_EMAIL}</p>
                    <p>전화: {COMPANY_PHONE}</p>
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

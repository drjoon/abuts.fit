import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Lock, Eye, FileText } from "lucide-react";
import {
  PublicPageLayout,
  PUBLIC_CARD_CLASS,
} from "./components/PublicPageLayout";
import { COMPANY_PHONE, SECURITY_EMAIL } from "@/shared/lib/contactInfo";

export const SecurityPage = () => {
  const sections = [
    {
      title: "데이터 보안",
      icon: Shield,
      content: (
        <>
          <p>
            어벗츠.핏은 사용자의 개인정보와 데이터를 안전하게 보호하기 위해
            다음과 같은 조치를 취합니다.
          </p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>SSL/TLS 암호화로 데이터 전송 보호</li>
            <li>정기적인 보안 점검 및 취약점 분석</li>
            <li>접근 권한 관리 및 실시간 모니터링</li>
            <li>암호화된 데이터베이스 저장</li>
          </ul>
        </>
      ),
    },
    {
      title: "계정 보안",
      icon: Lock,
      content: (
        <>
          <p>안전한 계정 사용을 위한 권장 사항입니다.</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>
              8자 이상, 대소문자·숫자·특수문자를 포함한 강력한 비밀번호 사용
            </li>
            <li>정기적인 비밀번호 변경</li>
            <li>다른 서비스와 동일한 비밀번호 사용 금지</li>
            <li>의심스러운 활동 발견 시 즉시 신고</li>
          </ul>
        </>
      ),
    },
    {
      title: "보안 사고 대응",
      icon: Eye,
      content: (
        <>
          <p>보안 사고가 발생하면 다음 절차를 따릅니다.</p>
          <ul className="list-disc list-inside space-y-1 ml-4">
            <li>즉시 원인 파악 및 차단</li>
            <li>영향 범위 조사 및 피해 최소화</li>
            <li>관계 기관 신고 및 사용자 고지</li>
            <li>재발 방지를 위한 보안 강화</li>
          </ul>
        </>
      ),
    },
    {
      title: "보안 신고",
      icon: FileText,
      content: (
        <>
          <p>
            보안 취약점이나 의심스러운 활동을 발견하신 경우 아래로 신고해
            주세요.
          </p>
          <div className="rounded-lg bg-slate-900/5 p-4">
            <p>
              <strong>보안팀 연락처</strong>
            </p>
            <p>이메일: {SECURITY_EMAIL}</p>
            <p>전화: {COMPANY_PHONE}</p>
          </div>
        </>
      ),
    },
  ];

  return (
    <PublicPageLayout>
      <div className="space-y-8 max-w-4xl mx-auto">
        <div className="text-center space-y-2">
          <p className="text-xs uppercase tracking-[0.35em] text-white/60">
            security
          </p>
          <h1 className="text-4xl font-semibold text-white">보안 정책</h1>
          <p className="text-white/70">
            어벗츠.핏의 보안 정책과 데이터 보호 방침
          </p>
        </div>

        <div className="space-y-8">
          {sections.map(({ title, icon: Icon, content }) => (
            <Card key={title} className={PUBLIC_CARD_CLASS}>
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-slate-900">
                  <Icon className="h-6 w-6 text-primary" />
                  {title}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-slate-600 space-y-4">
                {content}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </PublicPageLayout>
  );
};

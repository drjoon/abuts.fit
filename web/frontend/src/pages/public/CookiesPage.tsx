import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PublicPageLayout,
  PUBLIC_CARD_CLASS,
} from "./components/PublicPageLayout";
import { Cookie, Settings, Info, Shield } from "lucide-react";

export const CookiesPage = () => {
  const sections = [
    {
      title: "쿠키란 무엇인가요?",
      icon: Cookie,
      content:
        "쿠키는 웹사이트가 사용자의 기기에 저장하는 작은 텍스트 파일로, 사용자의 행동과 선호도를 기억하는 데 사용됩니다.",
    },
    {
      title: "어벗츠.핏에서 사용하는 쿠키 유형",
      icon: Settings,
      content: (
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-slate-900 mb-1">필수 쿠키</h4>
            <p className="text-slate-600">
              웹사이트의 기본 기능 제공을 위해 반드시 필요한 쿠키입니다.
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4 text-slate-600">
              <li>로그인 세션 유지</li>
              <li>보안 설정</li>
              <li>언어 설정</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-slate-900 mb-1">기능 쿠키</h4>
            <p className="text-slate-600">
              사용자 경험 향상을 위한 쿠키입니다.
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4 text-slate-600">
              <li>사용자 선호도 저장</li>
              <li>페이지 설정 기억</li>
              <li>검색 기록</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-slate-900 mb-1">분석 쿠키</h4>
            <p className="text-slate-600">
              웹사이트 이용 통계 분석을 위한 쿠키입니다.
            </p>
            <ul className="list-disc list-inside space-y-1 ml-4 text-slate-600">
              <li>방문자 수 집계</li>
              <li>페이지 조회수</li>
              <li>사용 패턴 분석</li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      title: "쿠키 관리 방법",
      icon: Info,
      content: (
        <div className="space-y-4">
          <p className="text-slate-600">
            사용자는 브라우저 설정을 통해 쿠키를 관리할 수 있습니다.
          </p>
          <ul className="list-disc list-inside space-y-1 ml-4 text-slate-600">
            <li>모든 쿠키 허용</li>
            <li>쿠키 허용 여부 확인</li>
            <li>모든 쿠키 차단</li>
            <li>기존 쿠키 삭제</li>
          </ul>
          <p className="text-slate-500 text-sm">
            * 필수 쿠키를 차단할 경우 일부 기능이 정상적으로 작동하지 않을 수
            있습니다.
          </p>
        </div>
      ),
    },
    {
      title: "쿠키 보안",
      icon: Shield,
      content: (
        <div className="space-y-4">
          <p className="text-slate-600">
            어벗츠.핏은 쿠키를 안전하게 관리하기 위해 다음과 같은 조치를
            취합니다.
          </p>
          <ul className="list-disc list-inside space-y-1 ml-4 text-slate-600">
            <li>민감한 정보는 쿠키에 저장하지 않습니다</li>
            <li>암호화된 연결을 통해서만 쿠키를 전송합니다</li>
            <li>쿠키 만료 시간을 적절히 설정합니다</li>
            <li>정기적으로 쿠키 사용을 검토합니다</li>
          </ul>
        </div>
      ),
    },
  ];

  return (
    <PublicPageLayout>
      <div className="space-y-8 max-w-4xl mx-auto">
        <div className="text-center space-y-2">
          <p className="text-xs uppercase tracking-[0.35em] text-white/60">
            cookies
          </p>
          <h1 className="text-4xl font-semibold text-white">쿠키 정책</h1>
          <p className="text-white/70">
            어벗츠.핏의 쿠키 사용 방침 및 관리 방법
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

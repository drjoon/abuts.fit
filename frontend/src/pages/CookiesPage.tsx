import { Navigation } from "@/components/Navigation";
import { Footer } from "@/components/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Cookie, Settings, Info, Shield } from "lucide-react";

export const CookiesPage = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <div className="container mx-auto px-4 py-20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">쿠키 정책</h1>
            <p className="text-muted-foreground">
              어벗츠.핏의 쿠키 사용 방침 및 관리 방법
            </p>
          </div>

          <div className="space-y-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Cookie className="h-6 w-6 text-primary" />
                  쿠키란 무엇인가요?
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-muted-foreground">
                  <p>쿠키는 웹사이트가 사용자의 컴퓨터나 모바일 기기에 저장하는 작은 텍스트 파일입니다. 쿠키를 통해 웹사이트는 사용자의 행동과 선호도를 기억할 수 있습니다.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Settings className="h-6 w-6 text-primary" />
                  어벗츠.핏에서 사용하는 쿠키 유형
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-muted-foreground">
                  <div>
                    <h4 className="font-medium text-foreground mb-2">필수 쿠키</h4>
                    <p>웹사이트의 기본 기능 제공을 위해 반드시 필요한 쿠키입니다.</p>
                    <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
                      <li>로그인 세션 유지</li>
                      <li>보안 설정</li>
                      <li>언어 설정</li>
                    </ul>
                  </div>
                  
                  <div>
                    <h4 className="font-medium text-foreground mb-2">기능 쿠키</h4>
                    <p>사용자 경험 향상을 위한 쿠키입니다.</p>
                    <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
                      <li>사용자 선호도 저장</li>
                      <li>페이지 설정 기억</li>
                      <li>검색 기록</li>
                    </ul>
                  </div>

                  <div>
                    <h4 className="font-medium text-foreground mb-2">분석 쿠키</h4>
                    <p>웹사이트 이용 통계 분석을 위한 쿠키입니다.</p>
                    <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
                      <li>방문자 수 집계</li>
                      <li>페이지 조회수</li>
                      <li>사용 패턴 분석</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Info className="h-6 w-6 text-primary" />
                  쿠키 관리 방법
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-muted-foreground">
                  <p>사용자는 브라우저 설정을 통해 쿠키를 관리할 수 있습니다:</p>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>모든 쿠키 허용</li>
                    <li>쿠키 허용 여부를 묻도록 설정</li>
                    <li>모든 쿠키 차단</li>
                    <li>기존 쿠키 삭제</li>
                  </ul>
                  <p className="mt-4">
                    <strong>주의:</strong> 필수 쿠키를 차단할 경우 웹사이트의 일부 기능이 정상적으로 작동하지 않을 수 있습니다.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <Shield className="h-6 w-6 text-primary" />
                  쿠키 보안
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-muted-foreground">
                  <p>어벗츠.핏은 쿠키를 안전하게 관리하기 위해 다음과 같은 조치를 취합니다:</p>
                  <ul className="list-disc list-inside space-y-2 ml-4">
                    <li>민감한 정보는 쿠키에 저장하지 않습니다</li>
                    <li>암호화된 연결(HTTPS)을 통해서만 쿠키를 전송합니다</li>
                    <li>쿠키 만료 시간을 적절히 설정합니다</li>
                    <li>정기적으로 쿠키 사용을 검토합니다</li>
                  </ul>
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
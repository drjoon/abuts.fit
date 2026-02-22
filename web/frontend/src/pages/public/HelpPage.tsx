import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  PublicPageLayout,
  PUBLIC_CARD_CLASS,
} from "./components/PublicPageLayout";
import {
  Search,
  HelpCircle,
  FileText,
  MessageSquare,
  Users,
  Settings,
} from "lucide-react";
import { SUPPORT_EMAIL } from "@/shared/lib/contactInfo";

export const HelpPage = () => {
  const faqCategories = [
    {
      title: "계정 관리",
      icon: Users,
      articles: [
        "회원가입은 어떻게 하나요?",
        "비밀번호를 잊어버렸어요",
        "프로필 정보 수정하기",
        "계정 탈퇴 방법",
      ],
    },
    {
      title: "의뢰 관리",
      icon: FileText,
      articles: [
        "의뢰서 작성 가이드",
        "의뢰 상태 확인하기",
        "의뢰 취소 및 환불",
        "품질 보증 정책",
      ],
    },
    {
      title: "소통 및 채팅",
      icon: MessageSquare,
      articles: [
        "실시간 채팅 사용법",
        "파일 전송하기",
        "알림 설정 변경",
        "차단 및 신고하기",
      ],
    },
    {
      title: "설정 및 기타",
      icon: Settings,
      articles: [
        "알림 설정 변경",
        "언어 설정",
        "개인정보 보호",
        "자주 묻는 질문",
      ],
    },
  ];

  return (
    <PublicPageLayout>
      <div className="space-y-8 max-w-4xl mx-auto">
        <div className="text-center space-y-2">
          <p className="text-xs uppercase tracking-[0.35em] text-white/60">
            support
          </p>
          <h1 className="text-4xl font-semibold text-white">도움말 센터</h1>
          <p className="text-white/70">
            어벗츠.핏 이용에 대한 모든 것을 알아보세요
          </p>
        </div>

        <Card className={`${PUBLIC_CARD_CLASS} mb-8`}>
          <CardContent className="p-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="궁금한 내용을 검색해보세요..."
                className="w-full pl-10 pr-4 py-3 rounded-lg bg-white/80 text-slate-900 focus:outline-none"
              />
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {faqCategories.map((category, index) => (
            <Card key={index} className={PUBLIC_CARD_CLASS}>
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-slate-900">
                  <category.icon className="h-6 w-6 text-primary" />
                  {category.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-slate-600">
                  {category.articles.map((article, articleIndex) => (
                    <li key={articleIndex}>
                      <a
                        href="#"
                        className="flex items-center gap-2 text-slate-600 hover:text-slate-900"
                      >
                        <HelpCircle className="h-4 w-4" />
                        {article}
                      </a>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className={PUBLIC_CARD_CLASS}>
          <CardHeader>
            <CardTitle className="text-slate-900">
              더 많은 도움이 필요하신가요?
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-lg bg-slate-900/5 p-4 text-center">
                <MessageSquare className="h-8 w-8 mx-auto mb-3 text-primary" />
                <h3 className="font-medium text-slate-900 mb-2">실시간 채팅</h3>
                <p className="text-sm text-slate-600">평일 9:00-18:00</p>
              </div>
              <div className="rounded-lg bg-slate-900/5 p-4 text-center">
                <FileText className="h-8 w-8 mx-auto mb-3 text-primary" />
                <h3 className="font-medium text-slate-900 mb-2">이메일 문의</h3>
                <p className="text-sm text-slate-600">{SUPPORT_EMAIL}</p>
              </div>
              <div className="rounded-lg bg-slate-900/5 p-4 text-center">
                <Users className="h-8 w-8 mx-auto mb-3 text-primary" />
                <h3 className="font-medium text-slate-900 mb-2">커뮤니티</h3>
                <p className="text-sm text-slate-600">사용자 포럼 참여</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PublicPageLayout>
  );
};

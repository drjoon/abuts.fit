import { useState } from "react";
import { Navigation } from "../components/Navigation";
import { HeroSection } from "../components/HeroSection";
import { FeaturesSection } from "../components/FeaturesSection";
import { Footer } from "../components/Footer";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { MessageSquare, Phone, Mail } from "lucide-react";
import { GuestChatModal } from "../components/GuestChatModal";
import { useAuthStore } from "../store/useAuthStore";

// Announcement Section Component
const AnnouncementSection = () => {
  const announcements = [
    {
      id: 1,
      title: "🎉 신규 제작사 파트너 모집",
      description:
        "우수한 치과기공소 제작사분들을 모집하고 있습니다. 지금 가입하시고 많은 의뢰를 받아보세요!",
      type: "new",
      date: "2024-01-15",
    },
    {
      id: 2,
      title: "🔥 이달의 HOT 제작사",
      description:
        "프리미엄 어벗먼트가 높은 품질과 빠른 납기로 고객 만족도 1위를 달성했습니다!",
      type: "hot",
      date: "2024-01-14",
    },
    {
      id: 3,
      title: "📢 서비스 수수료 무료 연장",
      description:
        "더 많은 분들이 서비스를 이용할 수 있도록 당분간 모든 수수료를 면제합니다.",
      type: "notice",
      date: "2024-01-13",
    },
  ];

  const getAnnouncementStyle = (type: string) => {
    switch (type) {
      case "new":
        return "border-green-200 bg-green-50 text-green-800";
      case "hot":
        return "border-red-200 bg-red-50 text-red-800";
      case "notice":
        return "border-blue-200 bg-blue-50 text-blue-800";
      default:
        return "border-gray-200 bg-gray-50 text-gray-800";
    }
  };

  return (
    <section className="py-16 bg-muted/30">
      <div className="max-w-6xl mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold bg-gradient-hero bg-clip-text text-transparent mb-4">
            공지사항 & 업데이트
          </h2>
          <p className="text-muted-foreground text-lg">
            최신 소식과 중요한 알림을 확인하세요
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {announcements.map((announcement) => (
            <Card
              key={announcement.id}
              className={`transition-all hover:shadow-elegant cursor-pointer ${getAnnouncementStyle(
                announcement.type
              )}`}
            >
              <CardHeader>
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg leading-tight">
                    {announcement.title}
                  </CardTitle>
                  <Badge variant="outline" className="text-xs">
                    {announcement.date}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed">
                  {announcement.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

const Index = () => {
  const { isAuthenticated } = useAuthStore();
  const [showGuestChat, setShowGuestChat] = useState(false);

  const handleChatClick = () => {
    if (isAuthenticated) {
      // 로그인한 사용자는 실시간 채팅으로 이동
      // 실제 구현에서는 채팅 페이지로 리다이렉트
      console.log("Redirect to chat");
    } else {
      // 비로그인 사용자는 게스트 채팅 모달 표시
      setShowGuestChat(true);
    }
  };

  const handlePhoneClick = () => {
    window.location.href = "tel:02-1234-5678";
  };

  const handleEmailClick = () => {
    window.open(
      "mailto:support@abuts.fit?subject=어벗츠.핏 문의&body=안녕하세요, 어벗츠.핏에 대해 문의드립니다.",
      "_blank"
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <HeroSection />
      <AnnouncementSection />
      <FeaturesSection />

      {/* Pricing Section */}
      <section id="pricing" className="py-16 bg-muted/30">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold bg-gradient-hero bg-clip-text text-transparent mb-12 text-center">
            요금제
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-stretch">
            {/* 치과기공소 */}
            <div className="flex flex-col items-center h-full">
              <Card className="w-full h-full shadow-elegant min-h-[440px] flex flex-col border-2 border-green-200">
                <CardHeader className="pb-2 flex flex-row items-center gap-2 justify-center">
                  <CardTitle className="text-2xl lg:text-3xl text-green-600 text-center">
                    치과기공소
                  </CardTitle>
                </CardHeader>
                <CardDescription className="inline-block text-center bg-green-100 text-green-700 font-bold text-sm px-3 py-1">
                  플랫폼 모델
                </CardDescription>
                <CardContent className="flex-1 flex flex-col justify-center space-y-8">
                  <div className="text-center">
                    <div className="text-3xl lg:text-4xl font-bold mb-1 text-green-600">
                      무료
                    </div>
                  </div>
                  <ul className="space-y-2 text-base lg:text-lg text-center">
                    <li>• 의뢰 등록 및 관리</li>
                    <li>• 실시간 채팅 상담</li>
                    <li>• 품질 보증 서비스</li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            {/* 플랫폼 모델 */}
            <div className="flex flex-col items-center h-full">
              <Card className="w-full h-full shadow-elegant min-h-[440px] flex flex-col border-2 border-primary/30">
                <CardHeader className="pb-2 flex flex-row items-center gap-2 justify-center">
                  <CardTitle className="text-2xl lg:text-3xl text-primary text-center">
                    어벗먼트 제조사
                  </CardTitle>
                </CardHeader>
                <CardDescription className="inline-block text-center bg-blue-100 text-blue-700 font-bold text-sm px-3 py-1">
                  플랫폼 모델
                </CardDescription>
                <CardContent className="flex-1 flex flex-col justify-center space-y-8">
                  <div className="text-center">
                    <div className="text-3xl lg:text-4xl font-bold text-blue-600 mb-1">
                      5%
                    </div>
                    <p className="text-base lg:text-lg font-semibold">
                      판매 가격 대비 수수료
                    </p>
                  </div>
                  <div>
                    <ul className="space-y-1 text-base lg:text-lg text-center">
                      <li>• 의뢰 접수 및 관리</li>
                      <li>• 안정적인 의뢰 물량</li>
                      <li>• 투명한 정산 시스템</li>
                    </ul>
                    <p className="mt-2 text-blue-800 text-center text-base lg:text-lg font-semibold">
                      🎓 CAM, 기술 교육 등 필요시 추가 비용
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 파트너십 모델 */}
            <div className="flex flex-col items-center h-full">
              <Card className="w-full h-full shadow-elegant min-h-[440px] flex flex-col border-2 border-primary/30">
                <CardHeader className="pb-2 flex flex-row items-center gap-2 justify-center">
                  <CardTitle className="text-2xl lg:text-3xl text-primary text-center">
                    어벗먼트 제조사
                  </CardTitle>
                </CardHeader>
                <CardDescription className="inline-block text-center bg-blue-100 text-blue-700 font-bold text-sm px-3 py-1">
                  파트너십 모델
                </CardDescription>
                <CardContent className="flex-1 flex flex-col justify-center space-y-8">
                  <div className="text-center">
                    <div className="text-3xl lg:text-4xl font-bold text-blue-600 mb-1">
                      50%
                    </div>
                    <p className="text-base lg:text-lg font-semibold">
                      판매 가격 대비 수익 공유
                    </p>
                  </div>
                  <div>
                    <p className="mt-2 text-blue-800 text-center text-base lg:text-lg font-semibold">
                      🚀 플랫폼 모델 + 초기 투자 지원
                    </p>
                    <ul className="space-y-1 text-base lg:text-lg text-center">
                      <li>• 자동선반 복합기 제공</li>
                      <li>• CAM 라이센스 제공</li>
                      <li>• 기술 교육 및 지원</li>
                      <li>• 의뢰건 우선 배정</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Customer Support Section */}
      <section id="support" className="py-16">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold bg-gradient-hero bg-clip-text text-transparent mb-4">
              고객 지원
            </h2>
            <p className="text-muted-foreground text-lg">
              언제든지 도움이 필요하시면 연락주세요
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="text-center hover:shadow-elegant transition-shadow">
              <CardHeader>
                <CardTitle className="flex flex-col items-center gap-3">
                  <MessageSquare className="h-8 w-8 text-primary" />
                  문의 남기기
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  문의 내용을 남기시면 입력하신 이메일로 답변드립니다.
                </p>
                <Button className="w-full" onClick={handleChatClick}>
                  문의 남기기
                </Button>
              </CardContent>
            </Card>

            <Card className="text-center hover:shadow-elegant transition-shadow">
              <CardHeader>
                <CardTitle className="flex flex-col items-center gap-3">
                  <Phone className="h-8 w-8 text-primary" />
                  전화 상담
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  평일 9시-18시 전화 상담 가능
                </p>
                <Button
                  variant="outline"
                  className="w-full font-medium text-lg"
                  onClick={handlePhoneClick}
                >
                  02-1234-5678
                </Button>
              </CardContent>
            </Card>

            <Card className="text-center hover:shadow-elegant transition-shadow">
              <CardHeader>
                <CardTitle className="flex flex-col items-center gap-3">
                  <Mail className="h-8 w-8 text-primary" />
                  이메일 문의
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  24시간 이메일 문의 접수
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleEmailClick}
                >
                  support@abuts.fit
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <Footer />
      <GuestChatModal open={showGuestChat} onOpenChange={setShowGuestChat} />
    </div>
  );
};

export default Index;

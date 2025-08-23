import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, Phone, Mail } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useState } from "react";

export const CustomerSupportSection = () => {
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
                055-314-4607
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
  );
};

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, Phone, Mail } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useNavigate } from "react-router-dom";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { COMPANY_PHONE, SUPPORT_EMAIL } from "@/shared/lib/contactInfo";

interface CustomerSupportSectionProps {
  onOpenGuestChat: () => void;
}

export const CustomerSupportSection = ({
  onOpenGuestChat,
}: CustomerSupportSectionProps) => {
  const { isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleChatClick = () => {
    if (isAuthenticated) {
      navigate("/dashboard");
    } else {
      onOpenGuestChat();
    }
  };

  const handlePhoneClick = () => {
    toast({
      title: "전화 상담 연결",
      description: `${COMPANY_PHONE}로 연결할까요?`,
      duration: 3000,
      action: (
        <ToastAction
          altText="전화 연결"
          onClick={() => {
            window.location.href = `tel:${COMPANY_PHONE}`;
          }}
        >
          연결
        </ToastAction>
      ),
    });
  };

  const handleEmailClick = () => {
    window.open(
      `mailto:${SUPPORT_EMAIL}?subject=어벗츠.핏 문의&body=안녕하세요, 어벗츠.핏에 대해 문의드립니다.`,
      "_blank",
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
          <Card className="app-glass-card app-glass-card--lg text-center">
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

          <Card className="app-glass-card app-glass-card--lg text-center">
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
                {COMPANY_PHONE}
              </Button>
            </CardContent>
          </Card>

          <Card className="app-glass-card app-glass-card--lg text-center">
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
                {SUPPORT_EMAIL}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
};

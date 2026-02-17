import { useState } from "react";
import { Mail } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Navigation } from "@/features/layout/Navigation";
import { Footer } from "@/features/landing/Footer";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { request } from "@/lib/apiClient";

export const ForgotPasswordPage = () => {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email) return;
    setIsSubmitting(true);
    try {
      const res = await request({
        path: "/api/auth/forgot-password",
        method: "POST",
        jsonBody: { email },
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.message || "이메일 전송에 실패했습니다.");
      }
      setIsSent(true);
      toast({
        title: "이메일 전송 완료",
        description: "입력한 주소로 비밀번호 재설정 링크를 전송했습니다.",
      });
    } catch (error: any) {
      toast({
        title: "전송 실패",
        description:
          error?.message || "비밀번호 재설정 메일 발송 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className="pt-24 pb-16 flex items-center justify-center">
        <div className="w-full px-4">
          <div className="max-w-md mx-auto">
            <Card className="shadow-elegant border-border/50">
              <CardHeader className="text-center space-y-2">
                <CardTitle className="text-2xl">비밀번호 재설정</CardTitle>
                <CardDescription>
                  가입한 이메일 주소로 비밀번호 재설정 링크를 보내드립니다.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email">이메일</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="forgot-email"
                        type="email"
                        placeholder="가입한 이메일 주소"
                        className="pl-10"
                        autoComplete="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    variant="hero"
                    className="w-full h-12 text-base"
                    disabled={isSubmitting || isSent}
                  >
                    {isSent ? "이메일이 전송되었습니다" : "재설정 링크 보내기"}
                  </Button>
                </form>
                <div className="mt-6 text-sm text-muted-foreground space-y-2">
                  <p>
                    메일이 도착하지 않았다면 스팸함을 확인하거나, 입력한
                    이메일이 맞는지 다시 확인해주세요.
                  </p>
                  <p>링크는 1시간 동안만 유효합니다.</p>
                </div>
                <div className="mt-8 flex flex-col gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => navigate("/login")}
                    className="w-full"
                  >
                    로그인으로 돌아가기
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => navigate("/signup")}
                    className="w-full"
                  >
                    회원가입
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

import { useState } from "react";
import { Mail } from "lucide-react";
import { useNavigate } from "react-router-dom";
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
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";

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
    <div className="relative min-h-screen overflow-hidden bg-[#030711] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-48 -right-32 h-[28rem] w-[28rem] rounded-full bg-gradient-to-br from-blue-500/40 via-cyan-400/30 to-emerald-300/30 blur-[180px]" />
        <div className="absolute bottom-0 left-[-120px] h-[24rem] w-[24rem] rounded-full bg-gradient-to-br from-purple-500/40 via-pink-500/30 to-orange-400/20 blur-[180px]" />
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.5) 1px, transparent 0)",
            backgroundSize: "90px 90px",
          }}
        />
      </div>

      <main className="relative z-10 mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-4 py-16 text-center">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs uppercase tracking-[0.3em] text-white/70">
            <span>account</span>
            <span className="h-1 w-1 rounded-full bg-emerald-300" />
            <span>support</span>
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold text-white">
              비밀번호 재설정
            </h1>
          </div>
        </div>

        <div className="mt-4 w-full max-w-md">
          <Card className="border-white/12 bg-white/5 text-white shadow-[0_25px_65px_rgba(7,7,19,0.55)] backdrop-blur-2xl">
            <CardContent>
              <form onSubmit={handleSubmit} className="mt-6 space-y-6">
                <div className="space-y-2">
                  <Label
                    htmlFor="forgot-email"
                    className="text-sm font-medium text-white/80"
                  ></Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-white/50" />
                    <Input
                      id="forgot-email"
                      type="email"
                      placeholder="가입한 이메일 주소"
                      className="pl-10 border-white/10 bg-white/5 text-white placeholder:text-white/40"
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
              <div className="mt-6 text-sm text-white/70 space-y-2">
                <p>메일이 도착하지 않았다면 스팸함을 확인해주세요</p>
                <p>링크는 1시간 동안만 유효합니다.</p>
              </div>
              <div className="mt-8 flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="ghost"
                  onClick={() => navigate("/login")}
                  className="w-full text-white/80 hover:text-white"
                >
                  로그인으로 돌아가기
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate("/signup")}
                  className="w-full border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                >
                  회원가입
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

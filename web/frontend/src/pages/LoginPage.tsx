import { useState } from "react";
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
import { useAuthStore } from "@/store/useAuthStore";
import { useNavigate } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Navigation } from "@/features/layout/Navigation";
import { Footer } from "@/features/landing/Footer";

export const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuthStore();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const success = await login(email, password);
      if (success) {
        navigate("/dashboard/new-request", { replace: true });
      } else {
        toast({
          title: "로그인 실패",
          description: "이메일 또는 비밀번호를 확인하세요.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "오류 발생",
        description: "로그인 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="pt-24 pb-16 flex items-center justify-center">
        <div className="w-full px-4">
          <div className="max-w-md mx-auto">
            <Card className="shadow-elegant border-border/50">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">로그인</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Button
                      variant="outline"
                      type="button"
                      className="w-full h-12 flex items-center justify-center text-base"
                      onClick={() => {
                        window.location.href = "/api/auth/oauth/google/start";
                      }}
                    >
                      <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                        <path
                          fill="currentColor"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="currentColor"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="currentColor"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                          fill="currentColor"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                      Google
                    </Button>
                    <Button
                      variant="outline"
                      type="button"
                      className="w-full h-12 flex items-center justify-center text-base"
                      onClick={() => {
                        window.location.href = "/api/auth/oauth/kakao/start";
                      }}
                    >
                      <svg className="mr-1 h-4 w-4" viewBox="0 0 24 24">
                        <path
                          fill="#FEE500"
                          d="M12 3c5.799 0 9 3.25 9 7.5 0 4.326-4.64 8.5-9 8.5-1.12 0-2.25-.16-3.33-.48-.36-.11-.735-.06-1.035.135L5.4 19.8c-.27.18-.63.12-.81-.12-.06-.09-.09-.21-.09-.33v-2.4c0-.33-.18-.63-.45-.78C2.46 15.445 1.5 13.395 1.5 11.25 1.5 6.75 5.85 3 12 3z"
                        />
                      </svg>
                      카카오
                    </Button>
                  </div>
                </div>

                <div className="pt-4 m-4 relative flex justify-center text-sm uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    또는
                  </span>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">이메일</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="이메일을 입력하세요"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                        autoComplete="username"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">비밀번호</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="비밀번호를 입력하세요"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10 pr-10"
                        autoComplete="current-password"
                        required
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <Button
                    type="submit"
                    variant="hero"
                    className="w-full h-12 flex items-center justify-center text-base"
                    disabled={isLoading}
                  >
                    {isLoading ? "로그인 중..." : "로그인"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <div className="mt-8 text-center">
            <Button variant="ghost" onClick={() => navigate("/")}>
              홈으로 돌아가기
            </Button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

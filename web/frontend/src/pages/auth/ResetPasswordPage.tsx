import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Lock } from "lucide-react";
import { Navigation } from "@/features/layout/Navigation";
import { Footer } from "@/features/landing/Footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { request } from "@/lib/apiClient";

const isStrongPassword = (password: string) => {
  const p = password || "";
  if (p.length < 10) return false;
  return /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p);
};

export const ResetPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const token = searchParams.get("token") || "";
  const email = searchParams.get("email") || "";
  const isTokenMissing = useMemo(() => !token, [token]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isTokenMissing) {
      toast({
        title: "잘못된 접근입니다.",
        description: "재설정 링크가 올바른지 확인해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: "비밀번호 불일치",
        description: "새 비밀번호와 확인용 비밀번호가 일치하지 않습니다.",
        variant: "destructive",
      });
      return;
    }

    if (!isStrongPassword(password)) {
      toast({
        title: "비밀번호 정책 안내",
        description:
          "비밀번호는 10자 이상이며 특수문자 1개 이상을 포함해야 합니다.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await request({
        path: `/api/auth/reset-password/${token}`,
        method: "POST",
        jsonBody: { newPassword: password },
      });

      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.message || "비밀번호 재설정에 실패했습니다.");
      }

      toast({
        title: "비밀번호가 변경되었습니다",
        description: "새 비밀번호로 다시 로그인해주세요.",
      });
      navigate("/login", { replace: true });
    } catch (error: any) {
      toast({
        title: "재설정 실패",
        description:
          error?.message || "비밀번호 재설정 중 오류가 발생했습니다.",
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
                <CardTitle className="text-2xl">새 비밀번호 설정</CardTitle>
                {email && (
                  <p className="text-sm text-muted-foreground">
                    {email} 계정의 비밀번호를 재설정합니다.
                  </p>
                )}
                {isTokenMissing && (
                  <p className="text-sm text-destructive">
                    재설정 토큰이 유효하지 않습니다. 이메일 링크를 다시
                    확인해주세요.
                  </p>
                )}
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">새 비밀번호</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="new-password"
                        type="password"
                        autoComplete="new-password"
                        className="pl-10"
                        placeholder="새 비밀번호를 입력하세요"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">새 비밀번호 확인</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="confirm-password"
                        type="password"
                        autoComplete="new-password"
                        className="pl-10"
                        placeholder="다시 한 번 입력해주세요"
                        value={confirmPassword}
                        onChange={(event) =>
                          setConfirmPassword(event.target.value)
                        }
                        required
                      />
                    </div>
                  </div>
                  <Button
                    type="submit"
                    variant="hero"
                    className="w-full h-12 text-base"
                    disabled={isTokenMissing || isSubmitting}
                  >
                    {isSubmitting ? "변경 중..." : "비밀번호 변경"}
                  </Button>
                </form>
                <div className="mt-6 text-sm text-muted-foreground">
                  <p>
                    비밀번호는 10자 이상이며 특수문자 1개 이상을 포함해야
                    합니다.
                  </p>
                </div>
                <div className="mt-8">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => navigate("/login")}
                  >
                    로그인 페이지로 이동
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

import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";

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
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs uppercase tracking-[0.3em] text-white/70">
            <span>account</span>
            <span className="h-1 w-1 rounded-full bg-emerald-300" />
            <span>security</span>
          </div>
          <h1 className="text-3xl font-semibold text-white">
            새 비밀번호 설정
          </h1>
          <p className="text-white/75">
            안전한 비밀번호를 입력하고 다시 로그인하세요. 10자 이상, 특수문자
            1개 이상을 포함해야 합니다.
          </p>
        </div>

        <div className="mt-10 w-full max-w-md text-left">
          <Card className="border-white/12 bg-white/5 text-white shadow-[0_25px_65px_rgba(7,7,19,0.55)] backdrop-blur-2xl">
            <CardHeader className="text-center space-y-2 px-8">
              <CardTitle className="text-2xl text-white">
                비밀번호 재설정
              </CardTitle>
              {email && (
                <p className="text-sm text-white/70">
                  {email} 계정 비밀번호를 변경합니다.
                </p>
              )}
              {isTokenMissing && (
                <p className="text-sm text-amber-300">
                  재설정 토큰이 유효하지 않습니다. 이메일 링크를 다시
                  확인해주세요.
                </p>
              )}
            </CardHeader>
            <CardContent className="px-8 pb-8">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label
                    htmlFor="new-password"
                    className="text-sm font-medium text-white/80"
                  >
                    새 비밀번호
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-white/50" />
                    <Input
                      id="new-password"
                      type="password"
                      autoComplete="new-password"
                      className="pl-10 border-white/10 bg-white/5 text-white placeholder:text-white/40"
                      placeholder="새 비밀번호를 입력하세요"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label
                    htmlFor="confirm-password"
                    className="text-sm font-medium text-white/80"
                  >
                    새 비밀번호 확인
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-white/50" />
                    <Input
                      id="confirm-password"
                      type="password"
                      autoComplete="new-password"
                      className="pl-10 border-white/10 bg-white/5 text-white placeholder:text-white/40"
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
              <div className="mt-6 text-sm text-white/70">
                비밀번호는 10자 이상이며 특수문자 1개 이상을 포함해야 합니다.
              </div>
              <div className="mt-8">
                <Button
                  variant="outline"
                  className="w-full border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                  onClick={() => navigate("/login")}
                >
                  로그인 페이지로 이동
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

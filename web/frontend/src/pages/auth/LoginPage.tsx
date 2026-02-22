import { useLayoutEffect, useRef, useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuthStore } from "@/store/useAuthStore";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/shared/hooks/use-toast";

type DevAccount = {
  label: string;
  email: string;
  password: string;
};

const DEV_ACCOUNTS: DevAccount[] = [
  {
    label: "의뢰자",
    email: "requestor.owner@demo.abuts.fit",
    password: "Rq!8zY#4fQ@7nC5$",
  },
  {
    label: "제조사",
    email: "manufacturer.owner@demo.abuts.fit",
    password: "Mo!7vL#6pR@3sB8$",
  },
  { label: "영업자", email: "s001@gmail.com", password: "Abc!1234" },
  {
    label: "관리자",
    email: "admin.owner@demo.abuts.fit",
    password: "Ao!6fN#9rV@4cH2$",
  },
];
const isDev = import.meta.env.DEV;

export const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"email" | "password">("email");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [columnHeight, setColumnHeight] = useState(0);
  const [devModalOpen, setDevModalOpen] = useState(false);
  const columnRef = useRef<HTMLDivElement>(null);
  const { login } = useAuthStore();
  const navigate = useNavigate();
  const { toast } = useToast();

  useLayoutEffect(() => {
    const measure = () => {
      if (columnRef.current) {
        setColumnHeight(columnRef.current.offsetHeight);
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [step, email, password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step === "email") {
      setStep("password");
      return;
    }
    setIsLoading(true);

    try {
      const success = await login(email, password);
      if (success) {
        navigate("/dashboard", { replace: true });
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

  const handleDevLogin = async (account: DevAccount) => {
    setEmail(account.email);
    setPassword(account.password);
    setStep("password");
    setIsLoading(true);
    try {
      const success = await login(account.email, account.password);
      if (success) {
        navigate("/dashboard", { replace: true });
      } else {
        toast({
          title: "로그인 실패",
          description: `${account.label} 계정 로그인에 실패했습니다.`,
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

      <main className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col justify-center gap-12 px-4 py-16 lg:flex-row lg:items-center">
        <section className="w-full space-y-6 text-center lg:w-1/2 lg:flex-1 lg:text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs uppercase tracking-[0.3em] text-white/70">
            <span>secure access</span>
            <span className="h-1 w-1 rounded-full bg-emerald-300" />
            <span>abuts.fit</span>
          </div>
          <div className="space-y-4">
            <h1 className="text-3xl font-semibold leading-tight text-white md:text-4xl">
              하나의 로그인으로 제조 · 배송까지
              <br />
              전체 제작 프로세스 동기화
            </h1>
            <p className="text-base text-white/80">
              제작 현황, 스케줄, 실시간 트래킹을 모두 한 화면에서 제어하세요.
              2단계 인증 수준의 로그인 경험을 제공합니다.
            </p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/5 p-6 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.4em] text-white/60">
              realtime sync
            </p>
            <p className="text-4xl font-semibold text-white">98.7%</p>
            <p className="text-sm text-white/70">
              동기화 성공률 · 운영팀 SLA 기준
            </p>
          </div>
        </section>

        <section className="w-full lg:w-1/2 lg:flex-1">
          <div className="w-full space-y-6">
            <Card className="border-white/12 bg-white/5 text-white shadow-[0_25px_65px_rgba(7,7,19,0.55)] backdrop-blur-2xl">
              <CardHeader className="text-center">
                <CardTitle className="text-2xl text-white">로그인</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Button
                      variant="outline"
                      type="button"
                      className="w-full h-12 flex items-center justify-center text-base border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
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
                      className="w-full h-12 flex items-center justify-center text-base border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
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

                {/* <div className="pt-4 m-4 relative flex justify-center text-sm uppercase">
                  <span className="bg-white px-2 text-slate-500">또는</span>
                </div> */}

                <form onSubmit={handleSubmit} className="space-y-4 pt-6">
                  <div className="grid gap-4 md:grid-cols-[1fr,auto] md:items-stretch">
                    <div ref={columnRef} className="space-y-3">
                      <div className="space-y-2">
                        {/* <Label htmlFor="email">이메일</Label> */}
                        <div className="relative">
                          <Mail className="absolute left-3 top-3 h-4 w-4 text-white/50" />
                          <Input
                            id="email"
                            type="email"
                            placeholder="이메일을 입력하세요"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="pl-10 border-white/10 bg-white/5 text-white placeholder:text-white/40"
                            autoComplete="username"
                            required
                            disabled={step === "password"}
                          />
                        </div>
                      </div>

                      {step === "password" && (
                        <div className="space-y-2">
                          {/* <Label htmlFor="password">비밀번호</Label> */}
                          <div className="relative">
                            <Lock className="absolute left-3 top-3 h-4 w-4 text-white/50" />
                            <Input
                              id="password"
                              type={showPassword ? "text" : "password"}
                              placeholder="비밀번호를 입력하세요"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              className="pl-10 pr-10 border-white/10 bg-white/5 text-white placeholder:text-white/40"
                              autoComplete="current-password"
                              required
                            />
                            <button
                              type="button"
                              className="absolute right-3 top-3 text-white/50 hover:text-white"
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
                      )}
                    </div>

                    <div
                      className="md:flex md:items-stretch"
                      style={
                        step === "password" && columnHeight
                          ? { height: `${columnHeight}px` }
                          : undefined
                      }
                    >
                      <Button
                        type="submit"
                        variant="hero"
                        className={`w-full md:w-24 flex items-center justify-center text-base ${
                          step === "password"
                            ? "h-[40px] md:h-full"
                            : "h-[40px] md:h-[40px]"
                        }`}
                        disabled={isLoading}
                      >
                        {step === "email"
                          ? "로그인"
                          : isLoading
                            ? "로그인 중..."
                            : "로그인"}
                      </Button>
                    </div>
                  </div>

                  {step === "password" && (
                    <div className="flex items-center justify-between text-sm text-white/70">
                      <button
                        type="button"
                        className="text-white/70 hover:text-white"
                        onClick={() => {
                          setPassword("");
                          setStep("email");
                        }}
                      >
                        이메일 변경
                      </button>
                      <Link
                        to="/forgot-password"
                        className="text-emerald-300 hover:text-emerald-200"
                      >
                        비밀번호를 잊으셨나요?
                      </Link>
                    </div>
                  )}
                </form>

                <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-white/70">
                  <Button
                    variant="ghost"
                    className="text-white/70 hover:text-white"
                    onClick={() => navigate("/")}
                  >
                    홈으로 돌아가기
                  </Button>

                  <Button
                    variant="ghost"
                    asChild
                    className="text-white/70 hover:text-white"
                  >
                    <Link to="/signup">회원가입</Link>
                  </Button>
                </div>

                {isDev && (
                  <div className="mt-6 flex justify-end">
                    <Button
                      type="button"
                      variant="link"
                      className="text-xs uppercase tracking-[0.35em] text-white/60 hover:text-white"
                      onClick={() => setDevModalOpen(true)}
                    >
                      DEV QUICK LOGIN
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      {isDev && (
        <Dialog open={devModalOpen} onOpenChange={setDevModalOpen}>
          <DialogContent className="max-w-lg bg-slate-950/95 text-white backdrop-blur-xl border-white/10">
            <DialogHeader>
              <DialogTitle className="text-center tracking-[0.4em] text-xs text-white/60 uppercase">
                DEV QUICK LOGIN
              </DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              {DEV_ACCOUNTS.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  className="rounded-2xl border border-white/15 bg-white/5 p-4 text-left transition hover:border-emerald-300/60"
                  disabled={isLoading}
                  onClick={() => handleDevLogin(acc)}
                >
                  <p className="text-[11px] uppercase tracking-[0.3em] text-white/60">
                    {acc.label}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-white break-all">
                    {acc.email}
                  </p>
                </button>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

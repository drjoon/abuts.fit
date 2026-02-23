import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useNavigate, useSearchParams } from "react-router-dom";

// 제조사/관리자 전용 간이 가입 페이지
// 요구: 소수 인원 전용, 별도 링크로 접근. UI에 노출하지 않음.
export const SignupStaffPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { loginWithToken } = useAuthStore();
  const [searchParams] = useSearchParams();

  const mode = (searchParams.get("mode") || "").trim();
  const isSocialNewMode = mode === "social_new";

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [role, setRole] = useState<"manufacturer" | "admin">("manufacturer");
  const [isLoading, setIsLoading] = useState(false);

  const [socialInfo, setSocialInfo] = useState<{
    email: string;
    name: string;
    provider: string;
    providerUserId: string;
  } | null>(null);

  const invitedBy = useMemo(() => {
    const v = (searchParams.get("by") || "").trim();
    return v || undefined;
  }, [searchParams]);

  useEffect(() => {
    if (!isSocialNewMode) return;
    const roleParam = String(searchParams.get("role") || "").trim();
    if (roleParam === "manufacturer" || roleParam === "admin") {
      setRole(roleParam);
    }

    const socialToken = sessionStorage.getItem("socialToken");
    if (!socialToken) return;

    try {
      const base64Url = socialToken.split(".")[1] || "";
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(atob(base64));
      const next = {
        email: payload.email || "",
        name: payload.name || "",
        provider: payload.provider || "",
        providerUserId: payload.providerUserId || "",
      };
      setSocialInfo(next);
      setFormData((prev) => ({
        ...prev,
        name: next.name || prev.name,
        email: next.email || prev.email,
      }));
    } catch (e) {
      console.error("socialToken 디코딩 실패:", e);
    }
  }, [isSocialNewMode, searchParams]);

  const oauthStartUrl = useCallback(
    (provider: "google" | "kakao") => {
      const qs = new URLSearchParams({
        intent: "signup",
        role,
      });
      return `/api/auth/oauth/${provider}/start?${qs.toString()}`;
    },
    [role],
  );

  const goSocialSignup = useCallback(
    (provider: "google" | "kakao") => {
      sessionStorage.setItem("oauthIntent", "signup");
      sessionStorage.setItem("oauthReturnTo", "/signup/staff");
      sessionStorage.setItem("oauthSignupRole", role);
      sessionStorage.removeItem("oauthSignupRef");
      window.location.href = oauthStartUrl(provider);
    },
    [oauthStartUrl, role],
  );

  const isStrongPassword = useCallback((password: string) => {
    const p = String(password || "");
    if (p.length < 10) return false;
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p)) return false;
    return true;
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isSocialNewMode) {
      if (!socialInfo?.provider || !socialInfo?.providerUserId) {
        toast({
          variant: "destructive",
          description: "소셜 로그인 정보가 없습니다.",
        });
        return;
      }

      try {
        setIsLoading(true);
        const payload = {
          name: formData.name.trim(),
          email: formData.email.trim(),
          role,
          socialProvider: socialInfo.provider,
          socialProviderUserId: socialInfo.providerUserId,
        };

        const res = await request<any>({
          path: "/api/auth/register",
          method: "POST",
          jsonBody: payload,
        });

        const data: any = res.data || {};
        if (!res.ok || !data?.success) {
          throw new Error(data?.message || "회원가입에 실패했습니다.");
        }

        sessionStorage.removeItem("socialToken");
        toast({
          description:
            data?.message ||
            "가입 신청이 접수되었습니다. 관리자가 승인하면 로그인할 수 있습니다.",
        });
        navigate("/login");
        return;
      } catch (error: any) {
        const message = error?.message || "가입 중 오류가 발생했습니다.";
        toast({ variant: "destructive", description: message });
        return;
      } finally {
        setIsLoading(false);
      }
    }

    if (formData.password !== formData.confirmPassword) {
      toast({
        variant: "destructive",
        description: "비밀번호가 일치하지 않습니다.",
      });
      return;
    }
    if (!isStrongPassword(formData.password)) {
      toast({
        variant: "destructive",
        description: "비밀번호는 10자 이상이며 특수문자를 포함해야 합니다.",
      });
      return;
    }

    try {
      setIsLoading(true);
      const payload = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        password: formData.password,
        role,
        // 참고: backend가 소셜/인증 없이 제조사/관리자 가입을 허용함.
      };

      const res = await request({
        path: "/api/auth/register",
        method: "POST",
        jsonBody: payload,
      });
      const { token, user } = res.data?.data || {};
      if (token && user) {
        await loginWithToken(token);
        toast({ description: "가입이 완료되었습니다." });
        navigate("/dashboard", { replace: true });
      } else {
        toast({
          description:
            res.data?.message ||
            "가입 신청이 접수되었습니다. 관리자가 승인하면 로그인할 수 있습니다.",
        });
        navigate("/login");
      }
    } catch (error: any) {
      const message =
        error?.response?.data?.message || "가입 중 오류가 발생했습니다.";
      toast({ variant: "destructive", description: message });
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

      <main className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-4 py-16 text-center">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs uppercase tracking-[0.3em] text-white/70">
            <span>staff onboarding</span>
            <span className="h-1 w-1 rounded-full bg-emerald-300" />
            <span>abuts.fit</span>
          </div>
          <h1 className="text-3xl font-semibold text-white">
            제조사·관리자 전용 가입
          </h1>
          <p className="text-white/75">
            초대 받은 인원만 접근 가능합니다. 승인 후 대시보드 전체 기능을
            이용할 수 있습니다.
          </p>
        </div>

        <div className="mt-10 w-full max-w-2xl text-left">
          <Card className="border-white/12 bg-white/5 text-white shadow-[0_25px_65px_rgba(7,7,19,0.55)] backdrop-blur-2xl">
            <CardHeader className="space-y-2 text-center px-8">
              <CardTitle className="text-2xl text-white">
                초대 기반 등록
              </CardTitle>
              <p className="text-sm text-white/70">
                링크가 외부에 노출되지 않도록 주의해주세요.
              </p>
              {invitedBy ? (
                <p className="text-xs text-white/60">초대자: {invitedBy}</p>
              ) : null}
            </CardHeader>
            <CardContent className="px-8 pb-8">
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-white/80">역할 선택</p>
                  <div className="grid grid-cols-2 gap-2">
                    {["manufacturer", "admin"].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRole(r as any)}
                        className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                          role === r
                            ? "border-white/20 bg-white/15 text-white"
                            : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                        }`}
                        disabled={isLoading}
                      >
                        {r === "manufacturer" ? "제조사" : "관리자"}
                      </button>
                    ))}
                  </div>
                </div>

                {!isSocialNewMode && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-white/80">
                      소셜 가입
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        className="h-10 rounded-md border border-white/10 bg-white/5 text-sm font-medium text-white/80 hover:bg-white/10 disabled:opacity-50"
                        onClick={() => goSocialSignup("google")}
                        disabled={isLoading}
                      >
                        Google
                      </button>
                      <button
                        type="button"
                        className="h-10 rounded-md border border-white/10 bg-white/5 text-sm font-medium text-white/80 hover:bg-white/10 disabled:opacity-50"
                        onClick={() => goSocialSignup("kakao")}
                        disabled={isLoading}
                      >
                        Kakao
                      </button>
                    </div>
                  </div>
                )}

                {isSocialNewMode && (
                  <div className="rounded-md border border-white/10 bg-white/5 p-3 text-sm text-white/80">
                    소셜 계정으로 가입을 진행합니다.
                  </div>
                )}

                <div className="space-y-1">
                  <label
                    className="text-sm font-medium text-white/80"
                    htmlFor="name"
                  >
                    이름
                  </label>
                  <input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className="h-10 w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/40"
                    placeholder="홍길동"
                    required
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-1">
                  <label
                    className="text-sm font-medium text-white/80"
                    htmlFor="email"
                  >
                    이메일
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="h-10 w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/40"
                    placeholder="staff@example.com"
                    required
                    disabled={isLoading}
                  />
                </div>

                {!isSocialNewMode && (
                  <>
                    <div className="space-y-1">
                      <label
                        className="text-sm font-medium text-white/80"
                        htmlFor="password"
                      >
                        비밀번호 (10자 이상 + 특수문자 포함)
                      </label>
                      <input
                        id="password"
                        name="password"
                        type="password"
                        value={formData.password}
                        onChange={handleChange}
                        className="h-10 w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/40"
                        required
                        disabled={isLoading}
                      />
                    </div>

                    <div className="space-y-1">
                      <label
                        className="text-sm font-medium text-white/80"
                        htmlFor="confirmPassword"
                      >
                        비밀번호 확인
                      </label>
                      <input
                        id="confirmPassword"
                        name="confirmPassword"
                        type="password"
                        value={formData.confirmPassword}
                        onChange={handleChange}
                        className="h-10 w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/40"
                        required
                        disabled={isLoading}
                      />
                    </div>
                  </>
                )}

                <button
                  type="submit"
                  className="h-11 w-full rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-60"
                  disabled={isLoading}
                >
                  {isLoading ? "가입 중..." : "가입하기"}
                </button>

                <button
                  type="button"
                  className="h-11 w-full rounded-md border border-white/10 bg-white/5 text-sm font-medium text-white/80 hover:bg-white/10"
                  onClick={() => navigate("/login")}
                  disabled={isLoading}
                >
                  로그인으로 돌아가기
                </button>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default SignupStaffPage;

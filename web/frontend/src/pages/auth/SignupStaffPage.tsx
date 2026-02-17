import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Footer } from "@/features/landing/Footer";
import { Navigation } from "@/features/layout/Navigation";
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
    <div className="flex min-h-screen flex-col">
      <Navigation />

      <main className="flex-1 bg-muted/20 py-12">
        <div className="mx-auto max-w-xl px-4">
          <Card className="shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl">제조사·관리자 전용 가입</CardTitle>
              <p className="text-sm text-muted-foreground">
                초대 받은 인원만 사용하세요. 링크가 외부에 노출되지 않도록
                주의해주세요.
              </p>
              {invitedBy ? (
                <p className="text-xs text-muted-foreground">
                  초대자: {invitedBy}
                </p>
              ) : null}
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-1">
                  <p className="text-sm font-medium">역할 선택</p>
                  <div className="grid grid-cols-2 gap-2">
                    {["manufacturer", "admin"].map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRole(r as any)}
                        className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                          role === r
                            ? "border-primary bg-primary text-primary-foreground"
                            : "bg-background hover:bg-muted"
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
                    <p className="text-sm font-medium">소셜 가입</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        className="h-10 rounded-md border bg-background text-sm font-medium hover:bg-muted disabled:opacity-60"
                        onClick={() => goSocialSignup("google")}
                        disabled={isLoading}
                      >
                        Google
                      </button>
                      <button
                        type="button"
                        className="h-10 rounded-md border bg-background text-sm font-medium hover:bg-muted disabled:opacity-60"
                        onClick={() => goSocialSignup("kakao")}
                        disabled={isLoading}
                      >
                        Kakao
                      </button>
                    </div>
                  </div>
                )}

                {isSocialNewMode && (
                  <div className="rounded-md border bg-muted/30 p-3 text-sm">
                    소셜 계정으로 가입을 진행합니다.
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-sm font-medium" htmlFor="name">
                    이름
                  </label>
                  <input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    placeholder="홍길동"
                    required
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium" htmlFor="email">
                    이메일
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    placeholder="staff@example.com"
                    required
                    disabled={isLoading}
                  />
                </div>

                {!isSocialNewMode && (
                  <>
                    <div className="space-y-1">
                      <label className="text-sm font-medium" htmlFor="password">
                        비밀번호 (10자 이상 + 특수문자 포함)
                      </label>
                      <input
                        id="password"
                        name="password"
                        type="password"
                        value={formData.password}
                        onChange={handleChange}
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        required
                        disabled={isLoading}
                      />
                    </div>

                    <div className="space-y-1">
                      <label
                        className="text-sm font-medium"
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
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
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
                  className="h-11 w-full rounded-md border bg-background text-sm font-medium hover:bg-muted"
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

      <Footer />
    </div>
  );
};

export default SignupStaffPage;

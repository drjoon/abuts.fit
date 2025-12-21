import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Navigation } from "@/features/layout/Navigation";
import { Footer } from "@/features/landing/Footer";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { request } from "@/lib/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { SignupWizardStep1 } from "./signup/SignupWizardStep1";
import { SignupWizardStep2 } from "./signup/SignupWizardStep2";
import { SignupWizardStep4 } from "./signup/SignupWizardStep4";
import { SignupSocialWizardStep1 } from "./signup/SignupSocialWizardStep1";
import { SignupSocialWizardStep2 } from "./signup/SignupSocialWizardStep3";
import { SignupSocialWizardStep4 } from "./signup/SignupSocialWizardStep4";

export const SignupPage = () => {
  const { token, user, loginWithToken } = useAuthStore();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [selectedMethod, setSelectedMethod] = useState<"email" | null>(null);
  const [emailVerifiedAt, setEmailVerifiedAt] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [emailVerificationSent, setEmailVerificationSent] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const mode = (searchParams.get("mode") || "").trim();
  const isSocialCompleteMode = mode === "social_complete";
  const isSocialNewMode = mode === "social_new";
  const isSocialMode = isSocialCompleteMode || isSocialNewMode;
  const isWizardMode = !isSocialCompleteMode && !isSocialNewMode;
  const [socialInfo, setSocialInfo] = useState<{
    email: string;
    name: string;
    provider: string;
    providerUserId: string;
  } | null>(null);

  const referredByReferralCode = useMemo(() => {
    const ref = searchParams.get("ref");
    return ref && ref.trim().length > 0 ? ref.trim() : undefined;
  }, [searchParams]);

  const referredByUserId = useMemo(() => {
    if (!referredByReferralCode) return undefined;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(referredByReferralCode);
    return isObjectId ? referredByReferralCode : undefined;
  }, [referredByReferralCode]);

  // LocalStorage에서 폼 데이터 및 이메일 인증 정보 복구
  useEffect(() => {
    if (isSocialCompleteMode || isSocialNewMode) return;
    const saved = localStorage.getItem("signupFormData");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setFormData((prev) => ({
          ...prev,
          name: typeof parsed?.name === "string" ? parsed.name : prev.name,
          email: typeof parsed?.email === "string" ? parsed.email : prev.email,
          password:
            typeof parsed?.password === "string"
              ? parsed.password
              : prev.password,
          confirmPassword:
            typeof parsed?.confirmPassword === "string"
              ? parsed.confirmPassword
              : prev.confirmPassword,
        }));
      } catch (e) {
        console.error("폼 데이터 복구 실패:", e);
      }
    }

    const emailVerified = localStorage.getItem("signupEmailVerified");
    if (emailVerified) {
      try {
        const parsed = JSON.parse(emailVerified);
        if (parsed.email && parsed.verifiedAt) {
          setFormData((prev) => ({ ...prev, email: parsed.email }));
          setEmailVerifiedAt(new Date(parsed.verifiedAt));
        }
      } catch (e) {
        console.error("이메일 인증 정보 복구 실패:", e);
      }
    }
  }, [isSocialCompleteMode, isSocialNewMode]);

  // 폼 데이터를 LocalStorage에 저장
  useEffect(() => {
    if (isSocialCompleteMode || isSocialNewMode) return;
    localStorage.setItem("signupFormData", JSON.stringify(formData));
  }, [formData, isSocialCompleteMode, isSocialNewMode]);

  // social_new 모드: sessionStorage에서 socialToken 디코딩
  useEffect(() => {
    if (!isSocialNewMode) return;
    const socialToken = sessionStorage.getItem("socialToken");
    if (!socialToken) return;
    try {
      const base64Url = socialToken.split(".")[1] || "";
      const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(atob(base64));
      setSocialInfo({
        email: payload.email || "",
        name: payload.name || "",
        provider: payload.provider || "",
        providerUserId: payload.providerUserId || "",
      });
      setFormData((prev) => ({
        ...prev,
        name: payload.name || "",
        email: payload.email || "",
      }));
    } catch (e) {
      console.error("socialToken 디코딩 실패:", e);
    }
  }, [isSocialNewMode]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.name === "email") {
      setEmailVerifiedAt(null);
      setEmailVerificationSent(false);
    }
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const isStrongPassword = useCallback((password: string) => {
    const p = String(password || "");
    if (p.length < 10) return false;
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p)) return false;
    return true;
  }, []);

  const isValidEmail = useCallback((email: string) => {
    const e = String(email || "").trim();
    if (!e) return false;
    return /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(e);
  }, []);

  const sendEmailVerification = useCallback(async () => {
    const email = String(formData.email || "")
      .trim()
      .toLowerCase();
    if (!isValidEmail(email)) {
      toast({
        title: "오류",
        description: "이메일 형식을 확인해주세요.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const res = await request<any>({
        path: "/api/auth/signup/email-verification/send",
        method: "POST",
        jsonBody: { email },
      });
      const data: any = res.data || {};
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || "인증 코드 발송에 실패했습니다.");
      }

      setEmailVerificationSent(true);
      toast({
        title: "인증 코드 발송",
        description: "이메일로 인증 코드를 발송했습니다.",
      });
    } catch (err) {
      toast({
        title: "오류",
        description: (err as any)?.message || "다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [formData.email, isValidEmail, toast]);

  const verifyEmailVerification = useCallback(
    async (code: string) => {
      const email = String(formData.email || "")
        .trim()
        .toLowerCase();

      if (!email) {
        toast({
          title: "오류",
          description: "이메일이 필요합니다.",
          variant: "destructive",
        });
        return;
      }

      if (!code || !/^\d{4}$/.test(code)) {
        toast({
          title: "오류",
          description: "인증 코드는 4자리 숫자입니다.",
          variant: "destructive",
        });
        return;
      }

      setIsLoading(true);
      try {
        const res = await request<any>({
          path: "/api/auth/signup/email-verification/verify",
          method: "POST",
          jsonBody: { email, code },
        });
        const data: any = res.data || {};
        if (!res.ok || !data?.success) {
          throw new Error(data?.message || "이메일 인증에 실패했습니다.");
        }
        const verifiedAtRaw = data?.data?.verifiedAt;
        const verifiedAt = verifiedAtRaw ? new Date(verifiedAtRaw) : new Date();
        setEmailVerifiedAt(verifiedAt);
        localStorage.setItem(
          "signupEmailVerified",
          JSON.stringify({ email, verifiedAt })
        );
        toast({
          title: "이메일 인증 완료",
          description: "이메일 인증이 완료되었습니다.",
        });
      } catch (err) {
        toast({
          title: "오류",
          description: (err as any)?.message || "다시 시도해주세요.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    },
    [formData.email, toast]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !isSocialCompleteMode &&
      !isSocialNewMode &&
      formData.password !== formData.confirmPassword
    ) {
      toast({
        title: "오류",
        description: "비밀번호가 일치하지 않습니다.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      // social_new 모드: 소셜 정보로 신규 계정 생성
      if (isSocialNewMode) {
        if (!socialInfo) {
          toast({
            title: "오류",
            description: "소셜 로그인 정보가 없습니다.",
            variant: "destructive",
          });
          navigate("/login", { replace: true });
          return;
        }

        const res = await request<any>({
          path: "/api/auth/register",
          method: "POST",
          jsonBody: {
            name: formData.name,
            email: formData.email,
            password: Math.random().toString(36).slice(-12),
            socialProvider: socialInfo.provider,
            socialProviderUserId: socialInfo.providerUserId,
          },
        });

        const data: any = res.data || {};
        if (!res.ok || !data?.success) {
          throw new Error(data?.message || "회원가입에 실패했습니다.");
        }

        const authToken = data?.data?.token;
        const authRefreshToken = data?.data?.refreshToken;

        if (authToken) {
          sessionStorage.removeItem("socialToken");
          await loginWithToken(authToken, authRefreshToken);
          localStorage.removeItem("signupFormData");
          localStorage.removeItem("signupEmailVerified");
          navigate("/dashboard", { replace: true });
        } else {
          toast({
            title: "회원가입 완료",
            description: "로그인 페이지로 이동합니다.",
          });
          localStorage.removeItem("signupFormData");
          localStorage.removeItem("signupEmailVerified");
          navigate("/login");
        }
        return;
      }

      if (isSocialCompleteMode) {
        if (!token || !user) {
          toast({
            title: "오류",
            description: "로그인이 필요합니다.",
            variant: "destructive",
          });
          navigate("/login", { replace: true });
          return;
        }

        const res = await request<any>({
          path: "/api/auth/oauth/complete-signup",
          method: "POST",
          token,
          jsonBody: {},
        });

        const data: any = res.data || {};
        if (!res.ok || !data?.success) {
          throw new Error(data?.message || "가입 완료 처리에 실패했습니다.");
        }

        await loginWithToken(token);
        localStorage.removeItem("signupFormData");
        localStorage.removeItem("signupEmailVerified");
        navigate("/dashboard", { replace: true });
        return;
      }

      const payload: any = {
        name: formData.name,
        email: formData.email,
        password: formData.password,
      };

      if (referredByUserId) {
        payload.referredByUserId = referredByUserId;
      } else if (referredByReferralCode) {
        payload.referredByReferralCode = referredByReferralCode;
      }

      const res = await request<any>({
        path: "/api/auth/register",
        method: "POST",
        jsonBody: payload,
      });

      const data: any = res.data || {};
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || "회원가입에 실패했습니다.");
      }

      const authToken = data?.data?.token;
      const authRefreshToken = data?.data?.refreshToken;

      if (authToken) {
        await loginWithToken(authToken, authRefreshToken);
        localStorage.removeItem("signupFormData");
        localStorage.removeItem("signupEmailVerified");
        navigate("/dashboard", { replace: true });
      } else {
        toast({
          title: "회원가입 완료",
          description: "성공적으로 가입되었습니다. 로그인 페이지로 이동합니다.",
        });
        navigate("/login");
      }
    } catch (error) {
      toast({
        title: isSocialCompleteMode ? "가입 완료 실패" : "회원가입 실패",
        description: (error as any)?.message || "다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />

      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-md">
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold">회원가입</CardTitle>
              <p className="text-muted-foreground">
                abuts.fit에 오신 것을 환영합니다
              </p>
            </CardHeader>
            <CardContent>
              {isWizardMode ? (
                <>
                  {wizardStep === 1 && (
                    <SignupWizardStep1
                      onEmailClick={() => {
                        setSelectedMethod("email");
                        setWizardStep(2);
                      }}
                    />
                  )}

                  {wizardStep === 2 && (
                    <SignupWizardStep2
                      formData={formData}
                      isLoading={isLoading}
                      emailVerifiedAt={emailVerifiedAt}
                      emailVerificationSent={emailVerificationSent}
                      onFormChange={handleChange}
                      onPrevious={() => setWizardStep(1)}
                      onSendEmailVerification={sendEmailVerification}
                      onVerifyEmailVerification={verifyEmailVerification}
                      onNext={() =>
                        handleSubmit({ preventDefault: () => {} } as any)
                      }
                      isStrongPassword={isStrongPassword}
                      toast={toast}
                    />
                  )}

                  {wizardStep === 3 && (
                    <SignupWizardStep4
                      onNavigate={() =>
                        navigate("/dashboard", { replace: true })
                      }
                    />
                  )}
                </>
              ) : (
                <>
                  {wizardStep === 1 && (
                    <SignupSocialWizardStep1
                      formData={formData}
                      socialInfo={socialInfo}
                      isLoading={isLoading}
                      onFormChange={handleChange}
                      onPrevious={() => navigate("/login")}
                      onNext={() => setWizardStep(2)}
                      toast={toast}
                    />
                  )}

                  {wizardStep === 2 && (
                    <SignupSocialWizardStep2
                      formData={formData}
                      socialInfo={socialInfo}
                      isLoading={isLoading}
                      emailVerifiedAt={emailVerifiedAt}
                      emailVerificationSent={emailVerificationSent}
                      onFormChange={handleChange}
                      onSendEmailVerification={sendEmailVerification}
                      onVerifyEmailVerification={verifyEmailVerification}
                      onPrevious={() => setWizardStep(1)}
                      onSubmit={() => {
                        handleSubmit({ preventDefault: () => {} } as any);
                      }}
                    />
                  )}

                  {wizardStep === 3 && (
                    <SignupSocialWizardStep4
                      onNavigate={() => {
                        navigate("/dashboard", { replace: true });
                      }}
                    />
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
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
  const [signupRole, setSignupRole] = useState<"requestor" | "salesman">(
    "requestor",
  );
  const [refInput, setRefInput] = useState<string>("");
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedMethod, setSelectedMethod] = useState<"email" | null>(null);
  const [pendingSocialProvider, setPendingSocialProvider] = useState<
    "google" | "kakao" | null
  >(null);
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

  const resolvedRefForSignup = useMemo(() => {
    const v = String(refInput || "").trim();
    if (v) return v;
    return referredByReferralCode;
  }, [refInput, referredByReferralCode]);

  const oauthStartUrl = useCallback(
    (provider: "google" | "kakao") => {
      const qs = new URLSearchParams({
        intent: "signup",
        role: signupRole,
        ...(resolvedRefForSignup ? { ref: resolvedRefForSignup } : {}),
      });
      return `/api/auth/oauth/${provider}/start?${qs.toString()}`;
    },
    [resolvedRefForSignup, signupRole],
  );

  const goSocialSignup = useCallback(
    (provider: "google" | "kakao") => {
      sessionStorage.setItem("oauthIntent", "signup");
      sessionStorage.setItem("oauthReturnTo", "/signup");
      sessionStorage.setItem("oauthSignupRole", signupRole);
      if (resolvedRefForSignup) {
        sessionStorage.setItem("oauthSignupRef", resolvedRefForSignup);
      } else {
        sessionStorage.removeItem("oauthSignupRef");
      }
      window.location.href = oauthStartUrl(provider);
    },
    [oauthStartUrl, resolvedRefForSignup, signupRole],
  );

  useEffect(() => {
    if (signupRole === "salesman") {
      setPendingSocialProvider(null);
    }
  }, [signupRole]);

  useEffect(() => {
    if (!isSocialNewMode) return;
    const role = String(searchParams.get("role") || "").trim();
    if (role === "salesman" || role === "requestor") {
      setSignupRole(role);
    }
  }, [isSocialNewMode, searchParams]);

  const shouldAskReferralInput = !referredByReferralCode;

  const shouldShowReferralStepForSocial = true;

  useEffect(() => {
    if (!isWizardMode) return;
    if (wizardStep !== 2) return;
    if (pendingSocialProvider) return;
    if (shouldAskReferralInput) return;
    setWizardStep(3);
  }, [isWizardMode, pendingSocialProvider, shouldAskReferralInput, wizardStep]);

  useEffect(() => {
    if (typeof referredByReferralCode !== "string") return;
    if (refInput.trim().length > 0) return;
    setRefInput(referredByReferralCode);
  }, [referredByReferralCode, refInput]);

  const referredByUserId = useMemo(() => {
    const v = String(refInput || "").trim();
    if (!v) return undefined;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(v);
    return isObjectId ? v : undefined;
  }, [refInput]);

  const referredByCode = useMemo(() => {
    const v = String(refInput || "").trim();
    if (!v) return undefined;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(v);
    return isObjectId ? undefined : v;
  }, [refInput]);

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
          JSON.stringify({ email, verifiedAt }),
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
    [formData.email, toast],
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
            role: signupRole,
            socialProvider: socialInfo.provider,
            socialProviderUserId: socialInfo.providerUserId,
            ...(referredByUserId ? { referredByUserId } : {}),
            ...(referredByCode
              ? { referredByReferralCode: referredByCode }
              : {}),
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
        role: signupRole,
      };

      if (referredByUserId) {
        payload.referredByUserId = referredByUserId;
      } else if (referredByCode) {
        payload.referredByReferralCode = referredByCode;
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

  const showHeroSection = isWizardMode && wizardStep === 1;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#030711] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-24 h-96 w-96 rounded-full bg-gradient-to-br from-emerald-400/40 to-cyan-500/30 blur-[160px]" />
        <div className="absolute top-32 right-[-120px] h-[28rem] w-[28rem] rounded-full bg-gradient-to-br from-indigo-500/40 via-purple-500/30 to-pink-500/30 blur-[180px]" />
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.5) 1px, transparent 0)",
            backgroundSize: "80px 80px",
          }}
        />
      </div>

      <main
        className={`relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col justify-center gap-12 px-4 py-16 ${showHeroSection ? "lg:flex-row lg:items-center" : "items-center"}`}
      >
        {showHeroSection && (
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
        )}

        <section
          className={`w-full ${showHeroSection ? "lg:w-1/2 lg:flex-1" : "max-w-xl"}`}
        >
          <Card className="border-white/12 bg-white/5 text-white shadow-[0_25px_65px_rgba(7,7,19,0.55)] backdrop-blur-2xl">
            <CardHeader className="pb-4 text-center">
              <CardTitle className="text-lg font-medium text-white/90">
                {isWizardMode
                  ? wizardStep === 1
                    ? "회원 가입"
                    : wizardStep === 2
                      ? "추천인 (선택)"
                      : wizardStep === 3
                        ? "계정 정보"
                        : "완료"
                  : isSocialNewMode
                    ? wizardStep === 1 && signupRole === "requestor"
                      ? "추천인 (선택)"
                      : wizardStep === 2
                        ? "기본 정보"
                        : wizardStep === 3
                          ? "이메일 인증"
                          : "완료"
                    : wizardStep === 1
                      ? "기본 정보"
                      : wizardStep === 3
                        ? "이메일 인증"
                        : "완료"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isWizardMode ? (
                <>
                  {wizardStep === 1 && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setSignupRole("requestor")}
                          className={`h-10 rounded-md border text-sm font-medium transition-colors ${
                            signupRole === "requestor"
                              ? "border-white/10 bg-white/15 text-white"
                              : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                          }`}
                        >
                          의뢰자
                        </button>
                        <button
                          type="button"
                          onClick={() => setSignupRole("salesman")}
                          className={`h-10 rounded-md border text-sm font-medium transition-colors ${
                            signupRole === "salesman"
                              ? "border-white/10 bg-white/15 text-white"
                              : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                          }`}
                        >
                          영업자
                        </button>
                      </div>
                      {signupRole === "requestor" && (
                        <p className="text-sm text-white/70">
                          치과기공소 혹은 치과병의원
                        </p>
                      )}
                      {signupRole === "salesman" && (
                        <p className="text-sm text-white/70 text-right">
                          영업하는 개인사업자 혹은 법인
                        </p>
                      )}

                      <SignupWizardStep1
                        googleUrl={oauthStartUrl("google")}
                        kakaoUrl={oauthStartUrl("kakao")}
                        onGoogleClick={() => {
                          setSelectedMethod(null);
                          if (shouldShowReferralStepForSocial) {
                            setPendingSocialProvider("google");
                            setWizardStep(2);
                            return;
                          }
                          goSocialSignup("google");
                        }}
                        onKakaoClick={() => {
                          setSelectedMethod(null);
                          if (shouldShowReferralStepForSocial) {
                            setPendingSocialProvider("kakao");
                            setWizardStep(2);
                            return;
                          }
                          goSocialSignup("kakao");
                        }}
                        onEmailClick={() => {
                          setSelectedMethod("email");
                          setPendingSocialProvider(null);
                          if (shouldAskReferralInput) {
                            setWizardStep(2);
                            return;
                          }
                          setWizardStep(3);
                        }}
                      />
                    </div>
                  )}

                  {wizardStep === 2 && (
                    <div className="space-y-4">
                      <input
                        value={refInput}
                        onChange={(e) => setRefInput(e.target.value)}
                        placeholder="추천인 코드 또는 사용자 계정"
                        className="h-10 w-full rounded-md border border-white/10 bg-white/5 px-3 text-md text-white placeholder:text-white/40"
                      />

                      {!pendingSocialProvider && (
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <button
                            type="button"
                            className="h-10 w-full rounded-md border border-white/10 bg-white/5 text-sm font-medium text-white/80 hover:bg-white/10"
                            onClick={() => setWizardStep(1)}
                          >
                            뒤로가기
                          </button>
                          <button
                            type="button"
                            className="h-10 w-full rounded-md border border-white/10 bg-white/5 text-sm font-medium text-white/80 hover:bg-white/10"
                            onClick={() => setWizardStep(3)}
                          >
                            건너뛰기
                          </button>
                        </div>
                      )}

                      {pendingSocialProvider && (
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <button
                            type="button"
                            className="h-10 w-full rounded-md border border-white/10 bg-white/5 text-sm font-medium text-white/80 hover:bg-white/10"
                            onClick={() => {
                              setPendingSocialProvider(null);
                              setWizardStep(1);
                            }}
                          >
                            뒤로가기
                          </button>
                          <button
                            type="button"
                            className="h-10 w-full rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
                            onClick={() =>
                              goSocialSignup(pendingSocialProvider)
                            }
                          >
                            {pendingSocialProvider === "google"
                              ? "Google로 계속"
                              : "카카오로 계속"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {wizardStep === 3 && (
                    <SignupWizardStep2
                      formData={formData}
                      isLoading={isLoading}
                      emailVerifiedAt={emailVerifiedAt}
                      emailVerificationSent={emailVerificationSent}
                      onFormChange={handleChange}
                      onPrevious={() =>
                        setWizardStep(shouldAskReferralInput ? 2 : 1)
                      }
                      onSendEmailVerification={sendEmailVerification}
                      onVerifyEmailVerification={verifyEmailVerification}
                      onNext={() =>
                        handleSubmit({ preventDefault: () => {} } as any)
                      }
                      isStrongPassword={isStrongPassword}
                      toast={toast}
                    />
                  )}

                  {wizardStep === 4 && (
                    <SignupWizardStep4
                      onNavigate={() =>
                        navigate("/dashboard", { replace: true })
                      }
                    />
                  )}
                </>
              ) : (
                <>
                  {isSocialNewMode &&
                    wizardStep === 1 &&
                    signupRole === "requestor" && (
                      <div className="space-y-4">
                        <input
                          value={refInput}
                          onChange={(e) => setRefInput(e.target.value)}
                          placeholder="추천인 코드 또는 사용자 계정"
                          className="h-10 w-full rounded-md border border-white/10 bg-white/5 px-3 text-md text-white placeholder:text-white/40"
                        />

                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="h-10 flex-1 rounded-md border border-white/10 bg-white/5 text-md font-medium text-white/80 hover:bg-white/10"
                            onClick={() => navigate("/login")}
                          >
                            취소
                          </button>
                          <button
                            type="button"
                            className="h-10 flex-1 rounded-md bg-primary text-primary-foreground text-md font-medium hover:opacity-90"
                            onClick={() => setWizardStep(2)}
                          >
                            다음
                          </button>
                        </div>
                      </div>
                    )}

                  {wizardStep ===
                    (isSocialNewMode && signupRole === "requestor" ? 2 : 1) && (
                    <SignupSocialWizardStep1
                      formData={formData}
                      socialInfo={socialInfo}
                      isLoading={isLoading}
                      onFormChange={handleChange}
                      onPrevious={() => {
                        if (isSocialNewMode && signupRole === "requestor") {
                          setWizardStep(1);
                          return;
                        }
                        navigate("/login");
                      }}
                      onNext={() => setWizardStep(3)}
                      toast={toast}
                    />
                  )}

                  {wizardStep === 3 && (
                    <SignupSocialWizardStep2
                      formData={formData}
                      socialInfo={socialInfo}
                      isLoading={isLoading}
                      emailVerifiedAt={emailVerifiedAt}
                      emailVerificationSent={emailVerificationSent}
                      onFormChange={handleChange}
                      onSendEmailVerification={sendEmailVerification}
                      onVerifyEmailVerification={verifyEmailVerification}
                      onPrevious={() =>
                        setWizardStep(
                          isSocialNewMode && signupRole === "requestor" ? 2 : 1,
                        )
                      }
                      onSubmit={() => {
                        handleSubmit({ preventDefault: () => {} } as any);
                      }}
                    />
                  )}

                  {wizardStep === 4 && (
                    <SignupSocialWizardStep4
                      onNavigate={() => {
                        navigate("/dashboard", { replace: true });
                      }}
                    />
                  )}
                </>
              )}

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
                  <Link to="/login">로그인</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
};

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SignupWizardStep1 } from "./signup/SignupWizardStep1";
import { SignupWizardStep2 } from "./signup/SignupWizardStep2";
import { SignupSocialWizardStep1 } from "./signup/SignupSocialWizardStep1";
import { SignupWizardAccountStep } from "./signup/SignupWizardAccountStep";

export const SignupWithReferralPage = () => {
  const { token, user, loginWithToken, logout } = useAuthStore();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [accountErrors, setAccountErrors] = useState<
    Partial<Record<"name" | "password" | "confirmPassword", string>>
  >({});
  const [accountFocusField, setAccountFocusField] = useState<
    "name" | "password" | "confirmPassword" | null
  >(null);
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
  const [isEmailStatusChecking, setIsEmailStatusChecking] = useState(false);
  const [lastEmailVerificationSentAt, setLastEmailVerificationSentAt] =
    useState<Date | null>(null);
  const [showSetupConfirm, setShowSetupConfirm] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [signupSessionId] = useState(() => {
    const existing = sessionStorage.getItem("signupSessionId");
    if (existing) return existing;
    const next = `signup-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    sessionStorage.setItem("signupSessionId", next);
    return next;
  });
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

  const markSetupWizardRequired = useCallback(
    (role?: string | null) => {
      if (role !== "requestor" && role !== "salesman") return false;
      setShowSetupConfirm(true);
      navigate("/dashboard/wizard?mode=account", { replace: true });
      return true;
    },
    [navigate],
  );

  const handleConfirmSetup = useCallback(() => {
    setShowSetupConfirm(false);
    navigate("/dashboard/wizard?mode=account", { replace: true });
  }, [navigate]);

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
    [signupRole, resolvedRefForSignup],
  );

  const goSocialSignup = useCallback(
    (provider: "google" | "kakao") => {
      const url = oauthStartUrl(provider);
      window.location.href = url;
    },
    [oauthStartUrl],
  );

  useEffect(() => {
    if (!token) return;
    if (user) {
      markSetupWizardRequired(user.role);
      return;
    }
    loginWithToken(token).then((ok) => {
      if (ok && user) {
        markSetupWizardRequired(user.role);
      }
    });
  }, [token, user, loginWithToken, markSetupWizardRequired]);

  useEffect(() => {
    if (!isSocialNewMode) return;
    const socialToken = sessionStorage.getItem("socialToken");
    if (!socialToken) return;

    const decodeJwtPayload = (token: string) => {
      try {
        const base64Url = token.split(".")[1] || "";
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        const binary = atob(base64);
        const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
        const decoded = new TextDecoder().decode(bytes);
        return JSON.parse(decoded);
      } catch (error) {
        console.error("socialToken 디코딩 실패:", error);
        return null;
      }
    };

    const payload = decodeJwtPayload(socialToken);
    if (!payload) return;

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
  }, [isSocialNewMode]);

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
        if (parsed.sessionId !== signupSessionId) {
          localStorage.removeItem("signupEmailVerified");
          return;
        }
        if (parsed.email && parsed.verifiedAt) {
          setFormData((prev) => ({ ...prev, email: parsed.email }));
          setEmailVerifiedAt(new Date(parsed.verifiedAt));
        }
      } catch (e) {
        console.error("이메일 인증 정보 복구 실패:", e);
      }
    }
  }, [isSocialCompleteMode, isSocialNewMode, signupSessionId]);

  useEffect(() => {
    if (isSocialCompleteMode || isSocialNewMode) return;
    localStorage.setItem("signupFormData", JSON.stringify(formData));
  }, [formData, isSocialCompleteMode, isSocialNewMode]);

  const shouldAskReferralInput = !referredByReferralCode && !isSocialNewMode;
  const shouldShowReferralStepForSocial = true;
  const socialHasReferralStep = false;
  const socialInfoStepIndex: 1 | 2 = 1;

  const cardTitle = useMemo(() => {
    if (isWizardMode) {
      switch (wizardStep) {
        case 1:
          return "회원 가입";
        case 2:
          return "추천인 (선택)";
        case 3:
          return "계정 정보";
        case 4:
          return "이메일 인증";
        default:
          return "완료";
      }
    }

    if (isSocialNewMode) {
      if (socialHasReferralStep && wizardStep === 1) {
        return "추천인 (선택)";
      }
      return "기본 정보";
    }

    if (wizardStep === 1) return "기본 정보";
    if (wizardStep === 3) return "계정 정보";
    if (wizardStep === 4) return "이메일 인증";
    return "완료";
  }, [
    isSocialNewMode,
    isWizardMode,
    socialHasReferralStep,
    socialInfoStepIndex,
    wizardStep,
  ]);

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

  const referredByEmail = useMemo(() => {
    const v = String(refInput || "").trim();
    if (!v) return undefined;
    if (/^[0-9a-fA-F]{24}$/.test(v)) return undefined;
    return /@/.test(v) ? v.toLowerCase() : undefined;
  }, [refInput]);

  const referredByCode = useMemo(() => {
    const v = String(refInput || "").trim();
    if (!v) return undefined;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(v);
    if (isObjectId) return undefined;
    if (/@/.test(v)) return undefined;
    return v;
  }, [refInput]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const field = e.target.name as
      | "name"
      | "email"
      | "password"
      | "confirmPassword";
    if (e.target.name === "email") {
      setEmailVerifiedAt(null);
      setEmailVerificationSent(false);
      setLastEmailVerificationSentAt(null);
      setIsEmailStatusChecking(false);
      localStorage.removeItem("signupEmailVerified");
    }
    if (field && accountErrors[field]) {
      setAccountErrors((prev) => ({ ...prev, [field]: undefined }));
      if (accountFocusField === field) {
        setAccountFocusField(null);
      }
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

  const normalizedEmail = useMemo(
    () =>
      String(formData.email || "")
        .trim()
        .toLowerCase(),
    [formData.email],
  );
  const isEmailValidValue = useMemo(
    () => isValidEmail(normalizedEmail),
    [isValidEmail, normalizedEmail],
  );

  const sendEmailVerification = useCallback(async (): Promise<boolean> => {
    const email = normalizedEmail;
    if (!isValidEmail(email)) {
      toast({
        title: "오류",
        description: "이메일 형식을 확인해주세요.",
        variant: "destructive",
      });
      return false;
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
        throw new Error(data?.message || "인증 메일 발송에 실패했습니다.");
      }

      setEmailVerificationSent(true);
      setLastEmailVerificationSentAt(new Date());
      toast({
        title: "가입 확인 메일 발송",
        description: "메일 받은 편지함에서 '가입 확인' 버튼을 눌러주세요.",
      });
      return true;
    } catch (err) {
      toast({
        title: "오류",
        description:
          (err as any)?.message || "메일 발송 중 오류가 발생했습니다.",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isValidEmail, normalizedEmail, toast]);

  const validateAccountInfo = useCallback(() => {
    const name = String(formData.name || "").trim();
    const password = String(formData.password || "");
    const confirm = String(formData.confirmPassword || "");
    const nextErrors: Partial<
      Record<"name" | "password" | "confirmPassword", string>
    > = {};

    if (!name) {
      nextErrors.name = "이름을 입력해주세요";
    }

    if (!password) {
      nextErrors.password = "비밀번호를 입력해주세요";
    } else if (!isStrongPassword(password)) {
      nextErrors.password = "10자 이상, 특수문자 포함";
    }

    if (!confirm) {
      nextErrors.confirmPassword = "비밀번호를 다시 입력해주세요";
    } else if (password !== confirm) {
      nextErrors.confirmPassword = "비밀번호가 일치하지 않습니다";
    }

    const orderedFields: Array<"name" | "password" | "confirmPassword"> = [
      "name",
      "password",
      "confirmPassword",
    ];
    const firstInvalid = orderedFields.find((key) => nextErrors[key]);

    setAccountErrors(nextErrors);
    setAccountFocusField(firstInvalid || null);

    return !firstInvalid;
  }, [
    formData.confirmPassword,
    formData.name,
    formData.password,
    isStrongPassword,
  ]);

  const handleGoEmailStep = useCallback(() => {
    if (!validateAccountInfo()) return;
    setWizardStep(4);
  }, [validateAccountInfo]);

  const handleReferralNext = useCallback(async () => {
    const value = String(refInput || "").trim();
    if (!value) {
      setWizardStep(3);
      return;
    }

    setIsLoading(true);
    try {
      const res = await request<any>({
        path: "/api/auth/referral/validate",
        method: "POST",
        jsonBody: { value },
      });
      const payload = res.data || {};
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.message || "추천인을 찾을 수 없습니다.");
      }
      setWizardStep(3);
    } catch (err) {
      toast({
        title: "오류",
        description: (err as any)?.message || "추천인을 확인할 수 없습니다.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [refInput, request, toast]);

  const handleReferralInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      void handleReferralNext();
    },
    [handleReferralNext],
  );

  useEffect(() => {
    if (!isWizardMode) return;
    if (wizardStep !== 2) return;
    if (pendingSocialProvider) return;
    if (refInput.trim().length > 0) return;

    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Enter") return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "BUTTON"].includes(target.tagName)) {
        return;
      }
      event.preventDefault();
      void handleReferralNext();
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [
    handleReferralNext,
    isWizardMode,
    pendingSocialProvider,
    refInput,
    wizardStep,
  ]);

  const submitSignup = useCallback(async () => {
    if (!isSocialCompleteMode && !isSocialNewMode) {
      if (!validateAccountInfo()) return;
    }

    if (isLoading) return;

    setIsLoading(true);

    try {
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
            ...(referredByEmail ? { referredByEmail } : {}),
            ...(referredByCode
              ? { referredByReferralCode: referredByCode }
              : {}),
          },
        });

        const body: any = res.data || {};
        if (!res.ok || !body?.success) {
          throw new Error(body?.message || "회원가입에 실패했습니다.");
        }

        const userData = body.data?.user;
        const newToken = body.data?.token;
        const newRefreshToken = body.data?.refreshToken;

        if (newToken && newRefreshToken) {
          localStorage.setItem("abuts_auth_token", newToken);
          localStorage.setItem("abuts_auth_refresh_token", newRefreshToken);
          await loginWithToken(newToken);
        }

        sessionStorage.removeItem("socialToken");
        localStorage.removeItem("signupFormData");
        localStorage.removeItem("signupEmailVerified");

        toast({
          title: "가입 완료",
          description: "환영합니다!",
        });

        if (userData && markSetupWizardRequired(userData.role)) {
          return;
        }

        navigate("/dashboard", { replace: true });
        return;
      }

      const res = await request<any>({
        path: "/api/auth/register",
        method: "POST",
        jsonBody: {
          name: formData.name,
          email: formData.email,
          password: formData.password,
          role: signupRole,
          ...(referredByUserId ? { referredByUserId } : {}),
          ...(referredByEmail ? { referredByEmail } : {}),
          ...(referredByCode ? { referredByReferralCode: referredByCode } : {}),
        },
      });

      const body: any = res.data || {};
      if (!res.ok || !body?.success) {
        throw new Error(body?.message || "회원가입에 실패했습니다.");
      }

      const userData = body.data?.user;
      const newToken = body.data?.token;
      const newRefreshToken = body.data?.refreshToken;

      if (newToken && newRefreshToken) {
        localStorage.setItem("abuts_auth_token", newToken);
        localStorage.setItem("abuts_auth_refresh_token", newRefreshToken);
        await loginWithToken(newToken);
      }

      localStorage.removeItem("signupFormData");
      localStorage.removeItem("signupEmailVerified");

      toast({
        title: "가입 완료",
        description: "환영합니다!",
      });

      if (userData && markSetupWizardRequired(userData.role)) {
        return;
      }

      navigate("/dashboard", { replace: true });
    } catch (error) {
      console.error("[submitSignup] failed", error);
      toast({
        title: "오류",
        description:
          (error as any)?.message || "회원가입 중 오류가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [
    isSocialCompleteMode,
    isSocialNewMode,
    validateAccountInfo,
    isLoading,
    socialInfo,
    formData,
    signupRole,
    referredByUserId,
    referredByEmail,
    referredByCode,
    loginWithToken,
    markSetupWizardRequired,
    navigate,
    toast,
  ]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md border-slate-200 shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl">{cardTitle}</CardTitle>
        </CardHeader>

        <CardContent className="space-y-6">
          {wizardStep === 1 && (
            <div className="space-y-8">
              <div>
                <p className="text-sm text-slate-600 mb-4">
                  {signupRole === "requestor"
                    ? "치과기공소 혹은 치과병의원"
                    : "영업하는 개인사업자 혹은 법인"}
                </p>

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
            </div>
          )}

          {wizardStep === 2 && (
            <div className="space-y-8">
              <input
                value={refInput}
                onChange={(e) => setRefInput(e.target.value)}
                onKeyDown={handleReferralInputKeyDown}
                placeholder="추천인 이메일 또는 코드"
                className="h-10 w-full rounded-md border border-white/10 bg-white/5 px-3 text-md text-white placeholder:text-white/40"
              />

              {!pendingSocialProvider && (
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
                    onClick={() => setWizardStep(1)}
                  >
                    이전
                  </Button>
                  <Button
                    type="button"
                    variant="hero"
                    className="h-11 w-full"
                    onClick={handleReferralNext}
                  >
                    {refInput.trim().length > 0 ? "입력하기" : "건너뛰기"}
                  </Button>
                </div>
              )}

              {pendingSocialProvider && (
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
                    onClick={() => {
                      setPendingSocialProvider(null);
                      setWizardStep(1);
                    }}
                  >
                    이전
                  </Button>
                  <Button
                    type="button"
                    variant="hero"
                    className="h-11 w-full"
                    onClick={() => goSocialSignup(pendingSocialProvider)}
                  >
                    다음
                  </Button>
                </div>
              )}
            </div>
          )}

          {wizardStep === 3 && (
            <SignupWizardAccountStep
              formData={formData}
              errors={accountErrors}
              focusField={accountFocusField}
              isLoading={isLoading}
              onFormChange={handleChange}
              onPrevious={() => setWizardStep(shouldAskReferralInput ? 2 : 1)}
              onNext={handleGoEmailStep}
            />
          )}

          {wizardStep === 4 && (
            <SignupWizardStep2
              formData={formData}
              isLoading={isLoading}
              emailVerifiedAt={emailVerifiedAt}
              emailVerificationSent={emailVerificationSent}
              isEmailValid={isEmailValidValue}
              isEmailStatusChecking={isEmailStatusChecking}
              lastEmailVerificationSentAt={lastEmailVerificationSentAt}
              onFormChange={handleChange}
              onPrevious={() => setWizardStep(3)}
              onNext={submitSignup}
              onSendEmailVerification={sendEmailVerification}
              onVerifyCode={async () => {}}
              onEditEmail={() => {}}
            />
          )}
        </CardContent>
      </Card>

      <AlertDialog open={showSetupConfirm} onOpenChange={setShowSetupConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>계정 설정</AlertDialogTitle>
            <AlertDialogDescription>
              계정 설정을 완료해주세요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowSetupConfirm(false)}
            >
              나중에
            </Button>
            <AlertDialogAction onClick={handleConfirmSetup}>
              설정하기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

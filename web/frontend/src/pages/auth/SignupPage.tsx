import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

export const SignupPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const referralCode = useMemo(() => {
    const ref = searchParams.get("ref");
    const code = ref && ref.trim().length > 0 ? ref.trim() : undefined;
    return code;
  }, [searchParams]);

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
  const { toast } = useToast();
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
  const [referrerInfo, setReferrerInfo] = useState<{
    name?: string;
    business?: string;
  } | null>(null);
  const [loadingReferrer, setLoadingReferrer] = useState(false);

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

  const oauthStartUrl = useCallback(
    (provider: "google" | "kakao") => {
      const qs = new URLSearchParams({
        intent: "signup",
        role: signupRole,
      });
      return `/api/auth/oauth/${provider}/start?${qs.toString()}`;
    },
    [signupRole],
  );

  const goSocialSignup = useCallback(
    (provider: "google" | "kakao") => {
      sessionStorage.setItem("oauthIntent", "signup");
      sessionStorage.setItem("oauthReturnTo", "/signup");
      sessionStorage.setItem("oauthSignupRole", signupRole);
      window.location.href = oauthStartUrl(provider);
    },
    [oauthStartUrl, signupRole],
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

  const cardTitle = useMemo(() => {
    if (isWizardMode) {
      switch (wizardStep) {
        case 1:
          return "회원 가입";
        case 3:
          return "계정 정보";
        case 4:
          return "이메일 인증";
        default:
          return "완료";
      }
    }

    if (isSocialNewMode) {
      return "기본 정보";
    }

    if (wizardStep === 1) return "기본 정보";
    if (wizardStep === 3) return "계정 정보";
    if (wizardStep === 4) return "이메일 인증";
    return "완료";
  }, [isSocialNewMode, isWizardMode, wizardStep]);

  // referralCode를 refInput에 설정
  useEffect(() => {
    if (typeof referralCode !== "string") return;
    if (refInput.trim().length > 0) return;
    setRefInput(referralCode);
  }, [referralCode, refInput]);

  // 소개자 정보 조회
  useEffect(() => {
    if (typeof referralCode !== "string") {
      setReferrerInfo(null);
      return;
    }

    setLoadingReferrer(true);
    request<any>({
      path: "/api/auth/referral/validate",
      method: "POST",
      jsonBody: { value: referralCode },
    })
      .then((res) => {
        const body: any = res.data || {};
        if (res.ok && body?.success && body?.data) {
          setReferrerInfo({
            name: body.data.name,
            business: body.data.businessName,
          });
        } else {
          setReferrerInfo(null);
        }
      })
      .catch(() => {
        setReferrerInfo(null);
      })
      .finally(() => setLoadingReferrer(false));
  }, [referralCode]);

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
          },
        });

        const data: any = res.data || {};
        if (!res.ok || !data?.success) {
          throw new Error(data?.message || "회원가입에 실패했습니다.");
        }

        const authToken = data?.data?.token;
        const authRefreshToken = data?.data?.refreshToken;

        sessionStorage.removeItem("socialToken");
        localStorage.removeItem("signupFormData");
        localStorage.removeItem("signupEmailVerified");

        if (authToken) {
          await loginWithToken(authToken, authRefreshToken);
          const resolvedRole = signupRole || useAuthStore.getState().user?.role;
          if (markSetupWizardRequired(resolvedRole)) {
            return;
          }
          navigate("/dashboard", { replace: true });
        } else {
          toast({
            title: "회원가입 완료",
            description: "가입이 완료되었습니다. 로그인 페이지로 이동합니다.",
          });
          navigate("/login", { replace: true });
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
        const resolvedRole = useAuthStore.getState().user?.role;
        if (markSetupWizardRequired(resolvedRole)) {
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
        },
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
        const resolvedRole = signupRole || useAuthStore.getState().user?.role;
        if (markSetupWizardRequired(resolvedRole)) {
          return;
        }
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
  }, [
    formData.confirmPassword,
    formData.email,
    formData.name,
    formData.password,
    isLoading,
    isSocialCompleteMode,
    isSocialNewMode,
    loginWithToken,
    navigate,
    signupRole,
    socialInfo,
    token,
    toast,
    user,
  ]);

  useEffect(() => {
    if (!isWizardMode) return;
    if (wizardStep !== 3 && wizardStep !== 4) return;

    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Enter") return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "BUTTON"].includes(target.tagName)) {
        return;
      }
      event.preventDefault();
      if (wizardStep === 3) {
        handleGoEmailStep();
        return;
      }
      if (emailVerifiedAt) {
        void submitSignup();
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [
    emailVerifiedAt,
    handleGoEmailStep,
    isWizardMode,
    submitSignup,
    wizardStep,
  ]);

  const verifyEmailCode = useCallback(
    async (code: string) => {
      if (!isEmailValidValue) {
        toast({
          title: "오류",
          description: "유효한 이메일을 입력해주세요.",
          variant: "destructive",
        });
        return;
      }

      try {
        const res = await request({
          method: "POST",
          path: "/api/auth/signup/email-verification/verify",
          jsonBody: { email: normalizedEmail, code },
        });

        const payload = res.data as {
          success?: boolean;
          message?: string;
        } | null;
        if (res.ok && payload?.success) {
          setEmailVerifiedAt(new Date());
          localStorage.setItem(
            "signupEmailVerified",
            JSON.stringify({
              email: normalizedEmail,
              verifiedAt: new Date(),
              sessionId: signupSessionId,
            }),
          );
          toast({
            title: "인증 완료",
            description: "이메일 인증이 완료되었습니다.",
          });
          await submitSignup();
        } else {
          toast({
            title: "오류",
            description: payload?.message || "인증 코드가 일치하지 않습니다.",
            variant: "destructive",
          });
        }
      } catch (err) {
        toast({
          title: "오류",
          description:
            (err as any)?.message || "인증 처리 중 문제가 발생했습니다.",
          variant: "destructive",
        });
      }
    },
    [isEmailValidValue, normalizedEmail, submitSignup, toast],
  );

  const refreshEmailVerificationStatus = useCallback(async () => {
    const email = normalizedEmail;
    if (!isEmailValidValue) {
      toast({
        title: "오류",
        description: "먼저 올바른 이메일을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    setIsEmailStatusChecking(true);
    try {
      const res = await request<any>({
        path: `/api/auth/signup/email-verification/status?email=${encodeURIComponent(email)}`,
        method: "GET",
      });
      const payload: any = res.data?.data;
      if (!res.ok || !payload) {
        throw new Error(res.data?.message || "상태를 확인할 수 없습니다.");
      }

      if (payload.verified) {
        const verifiedAt = payload.verifiedAt
          ? new Date(payload.verifiedAt)
          : new Date();
        setEmailVerifiedAt(verifiedAt);
        localStorage.setItem(
          "signupEmailVerified",
          JSON.stringify({
            email,
            verifiedAt,
            sessionId: signupSessionId,
          }),
        );
        toast({
          title: "이메일 인증 완료",
          description: "이제 다음 단계로 이동하실 수 있습니다.",
        });
      } else {
        toast({
          title: "이메일 확인 필요",
          description: "메일의 '가입 확인' 버튼을 누른 뒤 다시 확인해주세요.",
        });
      }
    } catch (err) {
      toast({
        title: "오류",
        description:
          (err as any)?.message || "인증 상태 조회 중 문제가 발생했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsEmailStatusChecking(false);
    }
  }, [isEmailValidValue, normalizedEmail, toast]);

  const handleEditEmail = useCallback(() => {
    setEmailVerifiedAt(null);
    setEmailVerificationSent(false);
    setIsEmailStatusChecking(false);
    setLastEmailVerificationSentAt(null);
    localStorage.removeItem("signupEmailVerified");
  }, []);

  const prevEmailRef = useRef<string>("");

  useEffect(() => {
    const current = normalizedEmail;
    if (!prevEmailRef.current) {
      prevEmailRef.current = current;
      return;
    }
    if (prevEmailRef.current !== current) {
      handleEditEmail();
      prevEmailRef.current = current;
    }
  }, [handleEditEmail, normalizedEmail]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await submitSignup();
  };

  const showHeroSection = isWizardMode && wizardStep === 1;

  const handleLogout = useCallback(() => {
    logout();
    navigate("/");
  }, [logout, navigate]);

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
          <section className="w-full space-y-6 text-center lg:w-1/2 lg:flex-1 lg:text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs uppercase tracking-[0.3em] text-white/70">
              <span>secure access</span>
              <span className="h-1 w-1 rounded-full bg-emerald-300" />
              <span>abuts.fit</span>
            </div>
            {referrerInfo ? (
              <div className="space-y-4">
                <h1 className="text-3xl font-semibold leading-tight text-white md:text-4xl">
                  환영합니다.
                </h1>
                <h2 className="text-base text-white/80">
                  <span className="font-semibold text-emerald-300">
                    {referrerInfo.business || referrerInfo.name || "소개자"}
                  </span>
                  에서 소개받으셨군요!
                </h2>
              </div>
            ) : (
              <div className="space-y-4">
                <h1 className="text-3xl font-semibold leading-tight text-white md:text-4xl">
                  하나의 로그인으로 제조 · 배송까지
                </h1>
                <p className="text-base text-white/80">
                  제작 현황, 스케줄, 실시간 트래킹을 모두 한 화면에서
                  제어하세요.
                </p>
              </div>
            )}
            {!referrerInfo && (
              <div className="rounded-2xl border border-white/15 bg-white/5 p-6 backdrop-blur">
                <p className="text-xs uppercase tracking-[0.4em] text-white/60">
                  realtime sync
                </p>
                <p className="text-4xl font-semibold text-white">98.7%</p>
                <p className="text-sm text-white/70">
                  동기화 성공률 · 운영팀 SLA 기준
                </p>
              </div>
            )}
          </section>
        )}

        <section
          className={`w-full ${showHeroSection ? "lg:w-1/2 lg:flex-1" : "max-w-xl"}`}
        >
          <Card className="border-white/12 bg-white/5 text-white shadow-[0_25px_65px_rgba(7,7,19,0.55)] backdrop-blur-2xl">
            <CardHeader className="pb-4 text-center px-8">
              <CardTitle className="text-lg font-medium text-white/90">
                {cardTitle}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-8 pb-8">
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
                          goSocialSignup("google");
                        }}
                        onKakaoClick={() => {
                          setSelectedMethod(null);
                          goSocialSignup("kakao");
                        }}
                        onEmailClick={() => {
                          setSelectedMethod("email");
                          setPendingSocialProvider(null);
                          setWizardStep(3);
                        }}
                      />
                    </div>
                  )}

                  {wizardStep === 3 && (
                    <SignupWizardAccountStep
                      formData={formData}
                      errors={accountErrors}
                      focusField={accountFocusField}
                      isLoading={isLoading}
                      onFormChange={handleChange}
                      onPrevious={() => setWizardStep(1)}
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
                      onVerifyCode={verifyEmailCode}
                      onEditEmail={handleEditEmail}
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
                      onNext={submitSignup}
                    />
                  )}
                </>
              )}

              {wizardStep === 1 && (
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-white/70">
                  <Button
                    variant="ghost"
                    className="text-white/70 hover:text-white"
                    onClick={() => navigate("/")}
                  >
                    홈으로 돌아가기
                  </Button>
                  {user?.id ? (
                    <Button
                      variant="ghost"
                      className="text-white/70 hover:text-white"
                      onClick={handleLogout}
                    >
                      로그아웃
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      className="text-white/70 hover:text-white"
                      onClick={() => navigate("/login")}
                    >
                      로그인
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </section>
      </main>

      <AlertDialog
        open={showSetupConfirm}
        onOpenChange={(open) => !open && setShowSetupConfirm(false)}
      >
        <AlertDialogContent className="border-white/15 bg-[#060b18]/95 text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>계정 · 조직 정보를 등록해주세요</AlertDialogTitle>
            <AlertDialogDescription className="text-white/70">
              가입이 완료되었습니다. <br />
              서비스를 사용하려면 계정 정보와 사업자 정보를 입력해야 합니다.
              <br />
              지금 바로 설정 화면으로 이동할게요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              className="bg-white/90 text-slate-900 hover:bg-white"
              onClick={handleConfirmSetup}
            >
              설정으로 이동
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

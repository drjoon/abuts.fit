import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useNavigate, useSearchParams } from "react-router-dom";

const STEP_ITEMS: Array<{ id: 1 | 2 | 3; label: string }> = [
  { id: 1, label: "역할 선택" },
  { id: 2, label: "계정 정보" },
  { id: 3, label: "이메일 인증" },
];

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
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);
  const [selectedMethod, setSelectedMethod] = useState<
    "email" | "google" | "kakao" | null
  >("email");
  const [isLoading, setIsLoading] = useState(false);

  const [socialInfo, setSocialInfo] = useState<{
    email: string;
    name: string;
    provider: string;
    providerUserId: string;
  } | null>(null);
  const [accountErrors, setAccountErrors] = useState<
    Partial<Record<"name" | "password" | "confirmPassword", string>>
  >({});
  const [emailVerificationSent, setEmailVerificationSent] = useState(false);
  const [lastEmailVerificationSentAt, setLastEmailVerificationSentAt] =
    useState<Date | null>(null);
  const [emailVerifiedAt, setEmailVerifiedAt] = useState<Date | null>(null);
  const [isEmailStatusChecking, setIsEmailStatusChecking] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");

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
      setSelectedMethod(provider);
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const field = e.target.name as keyof typeof formData;
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    if (accountErrors[field as keyof typeof accountErrors]) {
      setAccountErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    if (field === "email") {
      setEmailVerifiedAt(null);
      setEmailVerificationSent(false);
      setVerificationCode("");
      setLastEmailVerificationSentAt(null);
    }
  };

  const validateAccountInfo = useCallback(() => {
    const nextErrors: Partial<
      Record<"name" | "password" | "confirmPassword", string>
    > = {};
    const name = String(formData.name || "").trim();
    const password = String(formData.password || "");
    const confirm = String(formData.confirmPassword || "");

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

    setAccountErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [formData, isStrongPassword]);

  const sendEmailVerification = useCallback(async (): Promise<boolean> => {
    const email = normalizedEmail;
    if (!isValidEmail(email)) {
      toast({
        variant: "destructive",
        description: "올바른 이메일을 입력해주세요.",
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
        title: "인증 메일 발송",
        description: "메일함에서 '가입 확인' 버튼을 눌러주세요.",
      });
      return true;
    } catch (err) {
      toast({
        variant: "destructive",
        description:
          (err as any)?.message || "메일 발송 중 오류가 발생했습니다.",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isValidEmail, normalizedEmail, toast]);

  const submitStaffSignup = useCallback(async () => {
    if (!emailVerifiedAt) {
      toast({
        variant: "destructive",
        description: "이메일 인증을 완료해주세요.",
      });
      return;
    }
    const payload = {
      name: formData.name.trim(),
      email: normalizedEmail,
      password: formData.password,
      role,
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

    const authToken = data?.data?.token;
    const refreshToken = data?.data?.refreshToken;
    if (authToken) {
      const ok = await loginWithToken(authToken, refreshToken);
      if (!ok) {
        toast({
          variant: "destructive",
          description: "로그인에 실패했습니다. 잠시 후 다시 시도해주세요.",
        });
        return;
      }
      navigate("/wizard", { replace: true });
    } else {
      toast({
        description:
          data?.message ||
          "가입 신청이 접수되었습니다. 승인 후 로그인 가능합니다.",
      });
      navigate("/login", { replace: true });
    }
  }, [
    emailVerifiedAt,
    formData.name,
    formData.password,
    loginWithToken,
    navigate,
    normalizedEmail,
    role,
    toast,
  ]);

  const verifyEmailCode = useCallback(
    async (code: string) => {
      if (!code) {
        toast({
          variant: "destructive",
          description: "인증 코드를 입력해주세요.",
        });
        return;
      }
      if (!isValidEmail(normalizedEmail)) {
        toast({
          variant: "destructive",
          description: "유효한 이메일을 먼저 입력해주세요.",
        });
        return;
      }

      setIsLoading(true);
      try {
        const res = await request<any>({
          method: "POST",
          path: "/api/auth/signup/email-verification/verify",
          jsonBody: { email: normalizedEmail, code },
        });
        const payload = res.data || {};
        if (!res.ok || !payload?.success) {
          throw new Error(payload?.message || "인증 코드가 일치하지 않습니다.");
        }
        const verifiedAt = new Date();
        setEmailVerifiedAt(verifiedAt);
        toast({
          title: "이메일 인증 완료",
          description: "계정 생성을 진행합니다.",
        });
        await submitStaffSignup();
      } catch (err) {
        toast({
          variant: "destructive",
          description:
            (err as any)?.message || "인증 처리 중 오류가 발생했습니다.",
        });
      } finally {
        setIsLoading(false);
      }
    },
    [isValidEmail, normalizedEmail, submitStaffSignup, toast],
  );

  const refreshEmailVerificationStatus = useCallback(async () => {
    if (!isValidEmail(normalizedEmail)) {
      toast({
        variant: "destructive",
        description: "올바른 이메일을 입력한 뒤 다시 시도해주세요.",
      });
      return;
    }
    setIsEmailStatusChecking(true);
    try {
      const res = await request<any>({
        path: `/api/auth/signup/email-verification/status?email=${encodeURIComponent(normalizedEmail)}`,
        method: "GET",
      });
      const payload = res.data?.data;
      if (!res.ok || !payload) {
        throw new Error(res.data?.message || "상태를 확인할 수 없습니다.");
      }
      if (payload.verified) {
        setEmailVerifiedAt(new Date(payload.verifiedAt || Date.now()));
        toast({ description: "이메일 인증이 확인되었습니다." });
        await submitStaffSignup();
      } else {
        toast({
          description: "메일의 '가입 확인' 버튼을 누른 뒤 다시 시도해주세요.",
        });
      }
    } catch (err) {
      toast({
        variant: "destructive",
        description:
          (err as any)?.message || "인증 상태 조회 중 문제가 발생했습니다.",
      });
    } finally {
      setIsEmailStatusChecking(false);
    }
  }, [isValidEmail, normalizedEmail, submitStaffSignup, toast]);

  const handleAccountStepSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!validateAccountInfo()) return;
      const ok = await sendEmailVerification();
      if (ok) {
        setWizardStep(3);
      }
    },
    [sendEmailVerification, validateAccountInfo],
  );

  const handleVerificationSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      await verifyEmailCode(verificationCode.trim());
    },
    [verificationCode, verifyEmailCode],
  );

  const handleSocialSignupSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!isSocialNewMode) return;
      if (!socialInfo?.provider || !socialInfo?.providerUserId) {
        toast({
          variant: "destructive",
          description: "소셜 로그인 정보가 없습니다.",
        });
        return;
      }

      setIsLoading(true);
      try {
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
        navigate("/login", { replace: true });
      } catch (err) {
        toast({
          variant: "destructive",
          description: (err as any)?.message || "가입 중 오류가 발생했습니다.",
        });
      } finally {
        setIsLoading(false);
      }
    },
    [
      formData.email,
      formData.name,
      isSocialNewMode,
      navigate,
      role,
      socialInfo,
      toast,
    ],
  );

  const roleCards = [
    {
      id: "manufacturer" as const,
      title: "제조사 임직원",
      description: "워크시트, 생산장비, 출하 관리 권한을 제공합니다.",
    },
    {
      id: "admin" as const,
      title: "본사 관리자",
      description: "요청 모니터링, 정산, 조직 관리 기능을 포함합니다.",
    },
  ];

  const showHeroSection = !isSocialNewMode && wizardStep === 1;

  const renderStepIndicator = !isSocialNewMode ? (
    <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-white/70">
      {STEP_ITEMS.map((step, index) => (
        <div className="flex items-center gap-2" key={step.id}>
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold ${
              wizardStep === step.id
                ? "bg-primary text-primary-foreground"
                : wizardStep > step.id
                  ? "bg-white/20 text-white"
                  : "bg-white/10 text-white/60"
            }`}
          >
            {step.id}
          </span>
          <span
            className={`text-[11px] tracking-wide ${
              wizardStep === step.id ? "text-white" : "text-white/60"
            }`}
          >
            {step.label}
          </span>
          {index < STEP_ITEMS.length - 1 && (
            <span className="hidden h-px w-8 bg-white/15 sm:block" />
          )}
        </div>
      ))}
    </div>
  ) : null;

  const renderRoleStep = (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        {roleCards.map((card) => (
          <button
            type="button"
            key={card.id}
            onClick={() => setRole(card.id)}
            className={`rounded-2xl border px-4 py-5 text-left transition ${
              role === card.id
                ? "border-white/25 bg-white/15 text-white"
                : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
            }`}
          >
            <p className="text-sm font-semibold">{card.title}</p>
            <p className="mt-1 text-xs text-white/70">{card.description}</p>
          </button>
        ))}
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left text-xs text-white/70">
        선택한 역할은 검증 후 변경됩니다. 초대 링크가 외부로 공유되지 않도록
        주의해주세요.
      </div>
      <div className="space-y-3 text-left">
        <p className="text-sm font-medium text-white/80">가입 방법</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => {
              setSelectedMethod("email");
              setWizardStep(2);
            }}
            className={`h-11 rounded-md border text-sm font-semibold transition ${
              selectedMethod === "email"
                ? "border-white/20 bg-white/15 text-white"
                : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
            }`}
          >
            이메일로 계속
          </button>
          <button
            type="button"
            onClick={() => goSocialSignup("google")}
            className={`h-11 rounded-md border text-sm font-semibold transition ${
              selectedMethod === "google"
                ? "border-white/20 bg-white/15 text-white"
                : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
            }`}
            disabled={isLoading}
          >
            Google
          </button>
          <button
            type="button"
            onClick={() => goSocialSignup("kakao")}
            className={`h-11 rounded-md border text-sm font-semibold transition ${
              selectedMethod === "kakao"
                ? "border-white/20 bg-white/15 text-white"
                : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
            }`}
            disabled={isLoading}
          >
            Kakao
          </button>
        </div>
      </div>
    </div>
  );

  const renderAccountStep = (
    <form className="space-y-4" onSubmit={handleAccountStepSubmit}>
      <div>
        <label className="text-sm font-medium text-white/80" htmlFor="name">
          이름
        </label>
        <input
          id="name"
          name="name"
          value={formData.name}
          onChange={handleChange}
          className="mt-1 h-11 w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-300"
          placeholder="홍길동"
          disabled={isLoading}
        />
        {accountErrors.name ? (
          <p className="mt-1 text-xs text-red-300">{accountErrors.name}</p>
        ) : null}
      </div>
      <div>
        <label className="text-sm font-medium text-white/80" htmlFor="email">
          이메일
        </label>
        <input
          id="email"
          name="email"
          type="email"
          value={formData.email}
          onChange={handleChange}
          className="mt-1 h-11 w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-300"
          placeholder="staff@example.com"
          disabled={isLoading}
        />
      </div>
      <div>
        <label className="text-sm font-medium text-white/80" htmlFor="password">
          비밀번호 (10자 이상 + 특수문자 포함)
        </label>
        <input
          id="password"
          name="password"
          type="password"
          value={formData.password}
          onChange={handleChange}
          className="mt-1 h-11 w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-300"
          disabled={isLoading}
        />
        {accountErrors.password ? (
          <p className="mt-1 text-xs text-red-300">{accountErrors.password}</p>
        ) : null}
      </div>
      <div>
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
          className="mt-1 h-11 w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-300"
          disabled={isLoading}
        />
        {accountErrors.confirmPassword ? (
          <p className="mt-1 text-xs text-red-300">
            {accountErrors.confirmPassword}
          </p>
        ) : null}
      </div>
      <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-white/70">
        입력한 이메일로 인증 메일이 발송됩니다. 법인 메일을 사용하는 경우
        스팸함도 함께 확인해주세요.
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className="flex-1 rounded-md border border-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/10"
          onClick={() => setWizardStep(1)}
          disabled={isLoading}
        >
          이전 단계
        </button>
        <button
          type="submit"
          className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          disabled={isLoading}
        >
          인증 메일 보내기
        </button>
      </div>
    </form>
  );

  const renderVerificationStep = (
    <form className="space-y-5" onSubmit={handleVerificationSubmit}>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/80">
        {emailVerificationSent ? (
          <>
            <p>
              {normalizedEmail} 주소로 인증 메일을 보냈습니다. '가입 확인'
              버튼을 누른 뒤 아래 코드 또는 상태 확인으로 진행해주세요.
            </p>
            {lastEmailVerificationSentAt ? (
              <p className="mt-2 text-xs text-white/60">
                발송 시각: {lastEmailVerificationSentAt.toLocaleString()}
              </p>
            ) : null}
          </>
        ) : (
          <p>"인증 메일 보내기" 버튼을 눌러 이메일을 인증해주세요.</p>
        )}
      </div>
      <div>
        <label className="text-sm font-medium text-white/80" htmlFor="code">
          인증 코드
        </label>
        <input
          id="code"
          name="code"
          value={verificationCode}
          onChange={(e) => setVerificationCode(e.target.value)}
          className="mt-1 h-11 w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-slate-300"
          placeholder="메일에 안내된 4자리 코드"
          disabled={isLoading}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          disabled={isLoading}
        >
          인증 코드 확인
        </button>
        <button
          type="button"
          onClick={() => refreshEmailVerificationStatus()}
          className="rounded-md border border-white/10 px-4 py-2 text-sm text-white/80 hover:bg-white/10 disabled:opacity-60"
          disabled={isEmailStatusChecking}
        >
          상태 새로고침
        </button>
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-white/70">
        <button
          type="button"
          onClick={() => void sendEmailVerification()}
          className="rounded-md border border-white/10 px-3 py-2 hover:bg-white/10 disabled:opacity-60"
          disabled={isLoading}
        >
          인증 메일 다시 보내기
        </button>
        <button
          type="button"
          onClick={() => {
            setWizardStep(2);
            setVerificationCode("");
          }}
          className="rounded-md border border-white/10 px-3 py-2 hover:bg-white/10"
          disabled={isLoading}
        >
          이메일 수정하기
        </button>
        <button
          type="button"
          onClick={() => setWizardStep(1)}
          className="rounded-md border border-white/10 px-3 py-2 hover:bg-white/10"
          disabled={isLoading}
        >
          처음으로 돌아가기
        </button>
      </div>
    </form>
  );

  const renderSocialSection = (
    <form className="space-y-5" onSubmit={handleSocialSignupSubmit}>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-left text-sm text-white/80">
        <p className="font-semibold text-white">
          소셜 계정으로 가입을 완료합니다.
        </p>
        <p className="mt-2 text-xs text-white/70">
          연결된 계정을 확인하고 아래 버튼으로 가입을 마무리해주세요.
        </p>
      </div>
      <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
        <div className="flex items-center justify-between text-white/80">
          <span>이름</span>
          <span className="font-semibold text-white">
            {formData.name || socialInfo?.name || "-"}
          </span>
        </div>
        <div className="flex items-center justify-between text-white/80">
          <span>이메일</span>
          <span className="font-semibold text-white">
            {formData.email || socialInfo?.email || "-"}
          </span>
        </div>
        <div className="flex items-center justify-between text-white/80">
          <span>역할</span>
          <span className="font-semibold text-white">
            {role === "manufacturer" ? "제조사" : "관리자"}
          </span>
        </div>
      </div>
      <button
        type="submit"
        className="h-12 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
        disabled={isLoading}
      >
        {isLoading ? "가입 처리 중" : "가입 완료"}
      </button>
      <button
        type="button"
        className="h-12 w-full rounded-md border border-white/10 bg-white/5 text-sm font-medium text-white/80 hover:bg-white/10"
        onClick={() => navigate("/login")}
        disabled={isLoading}
      >
        로그인으로 돌아가기
      </button>
    </form>
  );

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

      <main
        className={`relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-12 px-4 py-16 ${showHeroSection ? "lg:flex-row lg:items-center" : "items-center"}`}
      >
        {showHeroSection && (
          <section className="w-full space-y-6 text-center lg:w-1/2 lg:flex-1 lg:text-left">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs uppercase tracking-[0.3em] text-white/70">
              <span>staff onboarding</span>
              <span className="h-1 w-1 rounded-full bg-emerald-300" />
              <span>abuts.fit</span>
            </div>
            <div className="space-y-4">
              <h1 className="text-3xl font-semibold leading-tight text-white md:text-4xl">
                제조사·관리자 임직원 전용 접근
              </h1>
              <p className="text-base text-white/80">
                초대받은 구성원만 접근 가능한 보안 온보딩 절차입니다. 장비
                제어와 운영 권한을 안전하게 제공합니다.
              </p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/5 p-6 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.4em] text-white/60">
                access policy
              </p>
              <p className="text-3xl font-semibold text-white">Zero Trust</p>
              <p className="text-sm text-white/70">
                이메일 인증과 관리자 승인 이후에만 워크스테이션에 접근합니다.
              </p>
            </div>
          </section>
        )}

        <section
          className={`w-full ${showHeroSection ? "lg:w-1/2 lg:flex-1" : "max-w-2xl"}`}
        >
          <Card className="border-white/12 bg-white/5 text-white shadow-[0_25px_65px_rgba(7,7,19,0.55)] backdrop-blur-2xl">
            <CardHeader className="px-8 pb-4 text-center">
              <CardTitle className="text-xl font-semibold text-white">
                {isSocialNewMode ? "소셜 계정 연결" : "제조사·관리자 전용 가입"}
              </CardTitle>
              {renderStepIndicator}
              {invitedBy ? (
                <p className="text-xs text-emerald-200/90">
                  초대자: {invitedBy}
                </p>
              ) : null}
            </CardHeader>
            <CardContent className="px-8 pb-8">
              {isSocialNewMode ? (
                renderSocialSection
              ) : (
                <>
                  {wizardStep === 1 && renderRoleStep}
                  {wizardStep === 2 && renderAccountStep}
                  {wizardStep === 3 && renderVerificationStep}
                </>
              )}
              <p className="pt-6 text-center text-sm text-white/70">
                이미 계정이 있으신가요?{" "}
                <button
                  type="button"
                  className="underline decoration-white/30 decoration-dotted underline-offset-4 hover:text-white"
                  onClick={() => navigate("/login")}
                >
                  로그인으로 이동
                </button>
              </p>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
};

export default SignupStaffPage;

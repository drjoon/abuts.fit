import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Navigation } from "@/features/layout/Navigation";
import { Footer } from "@/features/landing/Footer";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { request } from "@/lib/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { SignupWizardStep1 } from "./signup/SignupWizardStep1";
import { SignupWizardStep2 } from "./signup/SignupWizardStep2";
import { SignupWizardStep3 } from "./signup/SignupWizardStep3";
import { SignupWizardStep4 } from "./signup/SignupWizardStep4";
import { SignupSocialForm } from "./signup/SignupSocialForm";

export const SignupPage = () => {
  const { token, user, loginWithToken } = useAuthStore();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    company: "",
    phone: "",
    requestorType: "" as "" | "owner" | "co_owner" | "staff",
  });
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [selectedMethod, setSelectedMethod] = useState<"email" | null>(null);
  const [emailCode, setEmailCode] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [emailVerifiedAt, setEmailVerifiedAt] = useState<Date | null>(null);
  const [phoneVerifiedAt, setPhoneVerifiedAt] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const mode = (searchParams.get("mode") || "").trim();
  const isSocialCompleteMode = mode === "social_complete";
  const isSocialNewMode = mode === "social_new";
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

  const formatKrPhone = useCallback((raw: string) => {
    const digits = String(raw || "")
      .replace(/\D/g, "")
      .slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }, []);

  const normalizePhoneDigits = useCallback((raw: string) => {
    return String(raw || "").replace(/\D/g, "");
  }, []);

  // LocalStorage에서 폼 데이터 및 이메일 인증 정보 복구
  useEffect(() => {
    if (isSocialCompleteMode || isSocialNewMode) return;
    const saved = localStorage.getItem("signupFormData");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setFormData(parsed);
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
    if (e.target.name === "phone") {
      const formatted = formatKrPhone(e.target.value);
      setPhoneVerifiedAt(null);
      setPhoneCode("");
      setFormData({
        ...formData,
        phone: formatted,
      });
      return;
    }
    if (e.target.name === "email") {
      setEmailVerifiedAt(null);
      setEmailCode("");
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
        throw new Error(data?.message || "인증번호 발송에 실패했습니다.");
      }

      setEmailCodeSent(true);
      const devCode = data?.data?.devCode ? String(data.data.devCode) : "";
      toast({
        title: "인증번호 발송",
        description: devCode
          ? `개발용 인증번호: ${devCode}`
          : "이메일로 인증번호를 발송했습니다.",
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

  const verifyEmailVerification = useCallback(async () => {
    const email = String(formData.email || "")
      .trim()
      .toLowerCase();
    const code = String(emailCode || "").trim();

    if (!isValidEmail(email)) {
      toast({
        title: "오류",
        description: "이메일 형식을 확인해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (!/^\d{4,8}$/.test(code)) {
      toast({
        title: "오류",
        description: "인증번호를 확인해주세요.",
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
  }, [emailCode, formData.email, isValidEmail, toast]);

  const sendPhoneVerification = useCallback(async () => {
    const digits = normalizePhoneDigits(formData.phone);
    if (!digits || !/^\d{10,11}$/.test(digits)) {
      toast({
        title: "오류",
        description: "휴대폰번호 형식을 확인해주세요.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const res = await request<any>({
        path: "/api/auth/signup/phone-verification/send",
        method: "POST",
        jsonBody: { phoneNumber: digits },
      });
      const data: any = res.data || {};
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || "인증번호 발송에 실패했습니다.");
      }

      setPhoneCodeSent(true);
      const devCode = data?.data?.devCode ? String(data.data.devCode) : "";
      toast({
        title: "인증번호 발송",
        description: devCode
          ? `개발용 인증번호: ${devCode}`
          : "문자로 인증번호를 발송했습니다.",
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
  }, [formData.phone, normalizePhoneDigits, toast]);

  const verifyPhoneVerification = useCallback(async () => {
    const digits = normalizePhoneDigits(formData.phone);
    const code = String(phoneCode || "").trim();

    if (!digits || !/^\d{10,11}$/.test(digits)) {
      toast({
        title: "오류",
        description: "휴대폰번호 형식을 확인해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (!/^\d{4,8}$/.test(code)) {
      toast({
        title: "오류",
        description: "인증번호를 확인해주세요.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const res = await request<any>({
        path: "/api/auth/signup/phone-verification/verify",
        method: "POST",
        jsonBody: { phoneNumber: digits, code },
      });
      const data: any = res.data || {};
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || "휴대전화 인증에 실패했습니다.");
      }
      const verifiedAtRaw = data?.data?.verifiedAt;
      setPhoneVerifiedAt(verifiedAtRaw ? new Date(verifiedAtRaw) : new Date());
      toast({
        title: "휴대전화 인증 완료",
        description: "휴대전화 인증이 완료되었습니다.",
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
  }, [formData.phone, normalizePhoneDigits, phoneCode, toast]);

  const submitWizardRegister = useCallback(async () => {
    const name = String(formData.name || "").trim();
    const email = String(formData.email || "")
      .trim()
      .toLowerCase();
    const password = String(formData.password || "");
    const confirmPassword = String(formData.confirmPassword || "");
    const phoneDigits = normalizePhoneDigits(formData.phone);

    if (!name) {
      toast({
        title: "오류",
        description: "이름을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }
    if (!isValidEmail(email)) {
      toast({
        title: "오류",
        description: "이메일 형식을 확인해주세요.",
        variant: "destructive",
      });
      return;
    }
    if (!/^(01\d{8,9})$/.test(phoneDigits)) {
      toast({
        title: "오류",
        description: "휴대폰번호 형식을 확인해주세요.",
        variant: "destructive",
      });
      return;
    }
    if (!isStrongPassword(password)) {
      toast({
        title: "오류",
        description: "비밀번호는 10자 이상이며 특수문자를 포함해야 합니다.",
        variant: "destructive",
      });
      return;
    }
    if (password !== confirmPassword) {
      toast({
        title: "오류",
        description: "비밀번호가 일치하지 않습니다.",
        variant: "destructive",
      });
      return;
    }
    if (!emailVerifiedAt || !phoneVerifiedAt) {
      toast({
        title: "오류",
        description: "이메일 및 휴대전화 인증을 완료해주세요.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const payload: any = {
        name,
        email,
        password,
        phoneNumber: phoneDigits,
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
      if (!authToken) {
        throw new Error("토큰이 전달되지 않았습니다.");
      }

      const ok = await loginWithToken(authToken, authRefreshToken);
      if (!ok) {
        throw new Error("로그인 처리에 실패했습니다.");
      }

      setWizardStep(4);
    } catch (err) {
      toast({
        title: "회원가입 실패",
        description: (err as any)?.message || "다시 시도해주세요.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [
    emailVerifiedAt,
    formData.confirmPassword,
    formData.email,
    formData.name,
    formData.password,
    formData.phone,
    isStrongPassword,
    isValidEmail,
    loginWithToken,
    normalizePhoneDigits,
    phoneVerifiedAt,
    referredByReferralCode,
    referredByUserId,
    toast,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const phoneDigits = normalizePhoneDigits(formData.phone);
    if (!phoneDigits) {
      toast({
        title: "오류",
        description: "휴대폰번호를 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (!/^\d{10,11}$/.test(phoneDigits)) {
      toast({
        title: "오류",
        description: "휴대폰번호 형식을 확인해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.requestorType) {
      toast({
        title: "오류",
        description: "주대표/공동대표/직원을 선택해주세요.",
        variant: "destructive",
      });
      return;
    }

    if (
      (formData.requestorType === "owner" ||
        formData.requestorType === "co_owner") &&
      !formData.company.trim()
    ) {
      toast({
        title: "오류",
        description: "기공소명을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

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
            password: Math.random().toString(36).slice(-12), // 임시 비밀번호
            phoneNumber: normalizePhoneDigits(formData.phone),
            organization:
              formData.requestorType === "owner" ||
              formData.requestorType === "co_owner"
                ? formData.company
                : "",
            requestorType: formData.requestorType,
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
          navigate("/dashboard/new-request", { replace: true });
        } else {
          toast({
            title: "회원가입 완료",
            description: "로그인 페이지로 이동합니다.",
          });
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
          jsonBody: {
            requestorType: formData.requestorType,
            organization:
              formData.requestorType === "owner" ||
              formData.requestorType === "co_owner"
                ? formData.company
                : "",
            phoneNumber: normalizePhoneDigits(formData.phone),
          },
        });

        const data: any = res.data || {};
        if (!res.ok || !data?.success) {
          throw new Error(data?.message || "가입 완료 처리에 실패했습니다.");
        }

        await loginWithToken(token);
        navigate("/dashboard/new-request", { replace: true });
        return;
      }

      const payload: any = {
        name: formData.name,
        email: formData.email,
        password: formData.password,
        phoneNumber: normalizePhoneDigits(formData.phone),
        organization:
          formData.requestorType === "owner" ||
          formData.requestorType === "co_owner"
            ? formData.company
            : "",
        requestorType: formData.requestorType,
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
        navigate("/dashboard/new-request", { replace: true });
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
                      onFormChange={handleChange}
                      onPrevious={() => setWizardStep(1)}
                      onNext={() => setWizardStep(3)}
                      isStrongPassword={isStrongPassword}
                      toast={toast}
                    />
                  )}

                  {wizardStep === 3 && (
                    <SignupWizardStep3
                      formData={formData}
                      isLoading={isLoading}
                      emailCode={emailCode}
                      phoneCode={phoneCode}
                      emailVerifiedAt={emailVerifiedAt}
                      phoneVerifiedAt={phoneVerifiedAt}
                      emailCodeSent={emailCodeSent}
                      phoneCodeSent={phoneCodeSent}
                      onFormChange={handleChange}
                      onEmailCodeChange={setEmailCode}
                      onPhoneCodeChange={setPhoneCode}
                      onSendEmailVerification={sendEmailVerification}
                      onVerifyEmailVerification={verifyEmailVerification}
                      onSendPhoneVerification={sendPhoneVerification}
                      onVerifyPhoneVerification={verifyPhoneVerification}
                      onPrevious={() => setWizardStep(2)}
                      onSubmit={submitWizardRegister}
                    />
                  )}

                  {wizardStep === 4 && (
                    <SignupWizardStep4
                      onNavigate={() =>
                        navigate("/dashboard/new-request", { replace: true })
                      }
                    />
                  )}
                </>
              ) : (
                <SignupSocialForm
                  formData={formData}
                  isLoading={isLoading}
                  isSocialCompleteMode={isSocialCompleteMode}
                  isSocialNewMode={isSocialNewMode}
                  user={user}
                  onFormChange={handleChange}
                  onFormDataChange={setFormData}
                  onSubmit={handleSubmit}
                  onNavigateLogin={() => navigate("/login")}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

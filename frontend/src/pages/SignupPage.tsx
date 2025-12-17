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
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const mode = (searchParams.get("mode") || "").trim();
  const isSocialCompleteMode = mode === "social_complete";
  const isSocialNewMode = mode === "social_new";
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
      setFormData({
        ...formData,
        phone: formatted,
      });
      return;
    }
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

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
              {/* 소셜 회원가입 */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 mb-3">
                  <Button
                    variant="outline"
                    type="button"
                    className="w-full h-12 flex items-center justify-center text-base"
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
                    className="w-full h-12 flex items-center justify-center text-base"
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

              <div className="pt-4 relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  또는
                </span>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {isSocialCompleteMode && (
                  <div className="space-y-2">
                    <Label>소셜 계정</Label>
                    <div className="text-sm text-muted-foreground break-all">
                      {user?.email || ""}
                    </div>
                  </div>
                )}
                <div>
                  <Label>의뢰자 유형</Label>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <Button
                      type="button"
                      variant={
                        formData.requestorType === "owner"
                          ? "default"
                          : "outline"
                      }
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          requestorType: "owner",
                        }))
                      }
                    >
                      주대표
                    </Button>
                    <Button
                      type="button"
                      variant={
                        formData.requestorType === "co_owner"
                          ? "default"
                          : "outline"
                      }
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          requestorType: "co_owner",
                        }))
                      }
                    >
                      공동대표
                    </Button>
                    <Button
                      type="button"
                      variant={
                        formData.requestorType === "staff"
                          ? "default"
                          : "outline"
                      }
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          requestorType: "staff",
                        }))
                      }
                    >
                      직원
                    </Button>
                  </div>
                </div>

                <div>
                  <Label htmlFor="name">이름</Label>
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    value={
                      isSocialCompleteMode ? user?.name || "" : formData.name
                    }
                    onChange={handleChange}
                    required={!isSocialCompleteMode}
                    readOnly={isSocialCompleteMode}
                  />
                </div>

                <div>
                  <Label htmlFor="email">이메일</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={
                      isSocialCompleteMode ? user?.email || "" : formData.email
                    }
                    onChange={handleChange}
                    required={!isSocialCompleteMode}
                    readOnly={isSocialCompleteMode}
                  />
                </div>

                {(formData.requestorType === "owner" ||
                  formData.requestorType === "co_owner") && (
                  <div>
                    <Label htmlFor="company">기공소명</Label>
                    <Input
                      id="company"
                      name="company"
                      type="text"
                      value={formData.company}
                      onChange={handleChange}
                      placeholder="예: 서울치과기공소"
                      required
                    />
                  </div>
                )}

                <div>
                  <Label htmlFor="phone">전화번호</Label>
                  <Input
                    id="phone"
                    name="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={handleChange}
                    placeholder="010-0000-0000"
                  />
                </div>

                {!isSocialCompleteMode && !isSocialNewMode && (
                  <>
                    <div>
                      <Label htmlFor="password">비밀번호</Label>
                      <Input
                        id="password"
                        name="password"
                        type="password"
                        value={formData.password}
                        onChange={handleChange}
                        required
                        minLength={8}
                      />
                    </div>

                    <div>
                      <Label htmlFor="confirmPassword">비밀번호 확인</Label>
                      <Input
                        id="confirmPassword"
                        name="confirmPassword"
                        type="password"
                        value={formData.confirmPassword}
                        onChange={handleChange}
                        required
                        minLength={8}
                      />
                    </div>
                  </>
                )}

                <Button
                  type="submit"
                  className="w-full h-12 flex items-center justify-center text-base"
                  disabled={isLoading}
                  variant="hero"
                >
                  {isLoading
                    ? "처리 중..."
                    : isSocialCompleteMode
                    ? "가입 완료"
                    : "회원가입"}
                </Button>

                <div className="text-center text-sm text-muted-foreground">
                  이미 계정이 있으신가요?{" "}
                  <Button
                    variant="link"
                    className="p-0 h-auto"
                    onClick={() => navigate("/login")}
                  >
                    로그인
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

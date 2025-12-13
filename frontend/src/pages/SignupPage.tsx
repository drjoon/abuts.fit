import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Navigation } from "@/features/layout/Navigation";
import { Footer } from "@/features/landing/Footer";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

export const SignupPage = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    company: "",
    phone: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  const referredByUserId = useMemo(() => {
    const ref = searchParams.get("ref");
    return ref && ref.trim().length > 0 ? ref.trim() : undefined;
  }, [searchParams]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      toast({
        title: "오류",
        description: "비밀번호가 일치하지 않습니다.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const payload: any = {
        name: formData.name,
        email: formData.email,
        password: formData.password,
        phoneNumber: formData.phone,
        organization: formData.company,
      };

      if (referredByUserId) {
        payload.referredByUserId = referredByUserId;
      }

      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.success) {
        throw new Error(data?.message || "회원가입에 실패했습니다.");
      }

      toast({
        title: "회원가입 완료",
        description: "성공적으로 가입되었습니다. 로그인 페이지로 이동합니다.",
      });

      navigate("/login");
    } catch (error) {
      toast({
        title: "회원가입 실패",
        description: "다시 시도해주세요.",
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
                  >
                    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
                      />
                    </svg>
                    Facebook
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Button
                    variant="outline"
                    type="button"
                    className="w-full h-12 flex items-center justify-center text-base"
                  >
                    <svg className="mr-1 h-4 w-4" viewBox="0 0 24 24">
                      <path
                        fill="#FEE500"
                        d="M12 3c5.799 0 9 3.25 9 7.5 0 4.326-4.64 8.5-9 8.5-1.12 0-2.25-.16-3.33-.48-.36-.11-.735-.06-1.035.135L5.4 19.8c-.27.18-.63.12-.81-.12-.06-.09-.09-.21-.09-.33v-2.4c0-.33-.18-.63-.45-.78C2.46 15.445 1.5 13.395 1.5 11.25 1.5 6.75 5.85 3 12 3z"
                      />
                    </svg>
                    카카오
                  </Button>
                  <Button
                    variant="outline"
                    type="button"
                    className="w-full h-12 flex items-center justify-center text-base"
                  >
                    <svg className="mr-1 h-4 w-4" viewBox="0 0 24 24">
                      <path
                        fill="url(#instagram-gradient)"
                        d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"
                      />
                      <defs>
                        <linearGradient
                          id="instagram-gradient"
                          x1="0%"
                          y1="0%"
                          x2="100%"
                          y2="100%"
                        >
                          <stop offset="0%" stopColor="#833ab4" />
                          <stop offset="50%" stopColor="#fd1d1d" />
                          <stop offset="100%" stopColor="#fcb045" />
                        </linearGradient>
                      </defs>
                    </svg>
                    Instagram
                  </Button>
                </div>
              </div>

              <div className="pt-4 relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  또는
                </span>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">이름</Label>
                  <Input
                    id="name"
                    name="name"
                    type="text"
                    value={formData.name}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="email">이메일</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="company">회사명</Label>
                  <Input
                    id="company"
                    name="company"
                    type="text"
                    value={formData.company}
                    onChange={handleChange}
                    placeholder="치과기공소 또는 어벗먼트 제조사"
                  />
                </div>

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

                <Button
                  type="submit"
                  className="w-full h-12 flex items-center justify-center text-base"
                  disabled={isLoading}
                  variant="hero"
                >
                  {isLoading ? "가입 중..." : "회원가입"}
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

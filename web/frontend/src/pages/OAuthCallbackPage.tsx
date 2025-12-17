import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";

export const OAuthCallbackPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { loginWithToken } = useAuthStore();

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const error = searchParams.get("error");
      const token = searchParams.get("token");
      const refreshToken = searchParams.get("refreshToken");
      const socialToken = searchParams.get("socialToken");
      const needsSignup = searchParams.get("needsSignup");

      if (error) {
        toast({
          title: "소셜 로그인 실패",
          description: error,
          variant: "destructive",
        });
        navigate("/login", { replace: true });
        return;
      }

      // 신규 소셜 사용자: socialToken만 있고 token이 없음
      if (socialToken && !token) {
        sessionStorage.setItem("socialToken", socialToken);
        navigate("/signup?mode=social_new", { replace: true });
        return;
      }

      if (!token) {
        toast({
          title: "소셜 로그인 실패",
          description: "토큰이 전달되지 않았습니다.",
          variant: "destructive",
        });
        navigate("/login", { replace: true });
        return;
      }

      const ok = await loginWithToken(token, refreshToken);
      if (cancelled) return;

      if (!ok) {
        toast({
          title: "소셜 로그인 실패",
          description: "로그인 처리에 실패했습니다.",
          variant: "destructive",
        });
        navigate("/login", { replace: true });
        return;
      }

      if (needsSignup === "1") {
        navigate("/signup?mode=social_complete", { replace: true });
        return;
      }

      navigate("/dashboard", { replace: true });
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [loginWithToken, navigate, searchParams, toast]);

  return <div className="p-6">로그인 처리 중...</div>;
};

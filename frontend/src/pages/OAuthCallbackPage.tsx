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

      if (error) {
        toast({
          title: "소셜 로그인 실패",
          description: error,
          variant: "destructive",
        });
        navigate("/login", { replace: true });
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

      navigate("/dashboard", { replace: true });
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [loginWithToken, navigate, searchParams, toast]);

  return <div className="p-6">로그인 처리 중...</div>;
};

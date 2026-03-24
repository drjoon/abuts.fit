import { useEffect } from "react";
import type { NavigateOptions, To } from "react-router-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/shared/hooks/use-toast";
import { useAuthStore } from "@/store/useAuthStore";

export const OAuthCallbackPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { loginWithToken } = useAuthStore();

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    const waitForMinimumDisplay = async () => {
      const elapsed = Date.now() - startedAt;
      const remaining = 1500 - elapsed;
      if (remaining > 0) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }
    };

    const navigateAfterDelay = async (to: To, options?: NavigateOptions) => {
      await waitForMinimumDisplay();
      if (!cancelled) {
        navigate(to, options);
      }
    };

    const run = async () => {
      const error = searchParams.get("error");
      const token = searchParams.get("token");
      const refreshToken = searchParams.get("refreshToken");
      const socialToken = searchParams.get("socialToken");
      const needsSignup = searchParams.get("needsSignup");
      const signupRole = searchParams.get("role");
      const ref = searchParams.get("ref");

      const oauthIntent = sessionStorage.getItem("oauthIntent");
      const oauthReturnTo = sessionStorage.getItem("oauthReturnTo");
      const oauthSignupRole = sessionStorage.getItem("oauthSignupRole");
      const oauthSignupRef = sessionStorage.getItem("oauthSignupRef");

      if (error) {
        toast({
          title: "소셜 로그인 실패",
          description: error,
          variant: "destructive",
        });

        if (oauthIntent === "signup") {
          const qs = new URLSearchParams();
          if (oauthSignupRole) qs.set("role", oauthSignupRole);
          if (oauthSignupRef) qs.set("ref", oauthSignupRef);
          const target = oauthReturnTo || "/signup";
          sessionStorage.removeItem("oauthIntent");
          sessionStorage.removeItem("oauthReturnTo");
          sessionStorage.removeItem("oauthSignupRole");
          sessionStorage.removeItem("oauthSignupRef");
          await navigateAfterDelay(`${target}?${qs.toString()}`, {
            replace: true,
          });
          return;
        }

        await navigateAfterDelay("/login", { replace: true });
        return;
      }

      // 신규 소셜 사용자: socialToken만 있고 token이 없음
      if (socialToken && !token) {
        sessionStorage.setItem("socialToken", socialToken);
        const qs = new URLSearchParams();
        qs.set("mode", "social_new");
        const effectiveRole = signupRole || oauthSignupRole || "";
        const effectiveRef = ref || oauthSignupRef || "";
        if (effectiveRole) qs.set("role", effectiveRole);
        if (effectiveRef) qs.set("ref", effectiveRef);

        const target =
          oauthIntent === "signup" && oauthReturnTo ? oauthReturnTo : "/signup";
        sessionStorage.removeItem("oauthIntent");
        sessionStorage.removeItem("oauthReturnTo");
        sessionStorage.removeItem("oauthSignupRole");
        sessionStorage.removeItem("oauthSignupRef");
        await navigateAfterDelay(`${target}?${qs.toString()}`, {
          replace: true,
        });
        return;
      }

      if (!token) {
        toast({
          title: "소셜 로그인 실패",
          description: "토큰이 전달되지 않았습니다.",
          variant: "destructive",
        });
        await navigateAfterDelay("/login", { replace: true });
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
        await navigateAfterDelay("/login", { replace: true });
        return;
      }

      if (needsSignup === "1") {
        await navigateAfterDelay("/signup?mode=social_complete", {
          replace: true,
        });
        return;
      }

      await navigateAfterDelay("/dashboard", { replace: true });
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [loginWithToken, navigate, searchParams, toast]);

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

      <main className="relative z-10 mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-4 py-16 text-center">
        <div className="w-full max-w-md rounded-2xl border border-white/12 bg-white/5 p-8 text-white shadow-[0_25px_65px_rgba(7,7,19,0.55)] backdrop-blur-2xl">
          <p className="text-sm uppercase tracking-[0.4em] text-white/60">
            processing
          </p>
          <h1 className="mt-3 text-2xl font-semibold">로그인 처리 중...</h1>
          <p className="mt-2 text-white/70 text-sm">
            소셜 로그인 응답을 확인하는 중입니다. 잠시만 기다려주세요.
          </p>
        </div>
      </main>
    </div>
  );
};

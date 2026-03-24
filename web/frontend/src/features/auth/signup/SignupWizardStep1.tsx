import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

interface SignupWizardStep1Props {
  onEmailClick: () => void;
  googleUrl?: string;
  kakaoUrl?: string;
  onGoogleClick?: () => void;
  onKakaoClick?: () => void;
}

export const SignupWizardStep1 = ({
  onEmailClick,
  googleUrl = "/api/auth/oauth/google/start",
  kakaoUrl = "/api/auth/oauth/kakao/start",
  onGoogleClick,
  onKakaoClick,
}: SignupWizardStep1Props) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-10 pt-4">
      <div className="grid grid-cols-3 gap-3">
        <Button
          variant="outline"
          type="button"
          className="h-14 flex flex-col items-center justify-center gap-2 px-2 border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
          onClick={() => {
            if (onGoogleClick) return onGoogleClick();
            window.location.href = googleUrl;
          }}
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
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
          <span className="text-xs font-medium">Google</span>
        </Button>

        <Button
          variant="outline"
          type="button"
          className="h-14 flex flex-col items-center justify-center gap-2 px-2 border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
          onClick={() => {
            if (onKakaoClick) return onKakaoClick();
            window.location.href = kakaoUrl;
          }}
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
              fill="#FEE500"
              d="M12 3c5.799 0 9 3.25 9 7.5 0 4.326-4.64 8.5-9 8.5-1.12 0-2.25-.16-3.33-.48-.36-.11-.735-.06-1.035.135L5.4 19.8c-.27.18-.63.12-.81-.12-.06-.09-.09-.21-.09-.33v-2.4c0-.33-.18-.63-.45-.78C2.46 15.445 1.5 13.395 1.5 11.25 1.5 6.75 5.85 3 12 3z"
            />
          </svg>
          <span className="text-xs font-medium">카카오</span>
        </Button>

        <Button
          type="button"
          className="h-14 flex flex-col items-center justify-center gap-2 px-2 border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
          variant="outline"
          onClick={onEmailClick}
        >
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
          <span className="text-xs font-medium">이메일</span>
        </Button>
      </div>
    </div>
  );
};

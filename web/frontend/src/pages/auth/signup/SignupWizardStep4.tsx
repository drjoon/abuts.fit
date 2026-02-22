import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

interface SignupWizardStep4Props {
  onNavigate: () => void;
}

export const SignupWizardStep4 = ({ onNavigate }: SignupWizardStep4Props) => {
  return (
    <div className="space-y-6 text-center py-4">
      <div className="flex justify-center">
        <CheckCircle2 className="w-16 h-16 text-green-600" />
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-bold">회원가입 완료!</h2>
        <p className="text-sm text-white/70">
          abuts.fit에 오신 것을 환영합니다
        </p>
      </div>

      <Button
        type="button"
        className="w-full h-11"
        variant="hero"
        onClick={onNavigate}
      >
        신규 의뢰 시작하기
      </Button>
    </div>
  );
};

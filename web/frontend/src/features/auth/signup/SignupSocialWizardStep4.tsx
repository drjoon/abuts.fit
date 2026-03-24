import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";

interface SignupSocialWizardStep4Props {
  onNavigate: () => void;
}

export const SignupSocialWizardStep4 = ({
  onNavigate,
}: SignupSocialWizardStep4Props) => {
  return (
    <div className="space-y-6 text-center py-8">
      <div className="flex justify-center">
        <CheckCircle2 className="w-16 h-16 text-green-600" />
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-bold">회원가입 완료</h2>
        <p className="text-white/70">abuts.fit에 가입되었습니다</p>
      </div>

      <Button
        type="button"
        variant="hero"
        onClick={onNavigate}
        className="w-full h-12"
      >
        대시보드로 이동
      </Button>
    </div>
  );
};

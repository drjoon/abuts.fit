import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountTab } from "../../AccountTab";

interface AccountWizardProps {
  user: any;
  onRequestNext: () => void;
  canProceed: boolean;
}

export const AccountWizard = ({
  user,
  onRequestNext,
  canProceed,
}: AccountWizardProps) => {
  const hint = useMemo(() => {
    return ["프로필 저장", "휴대전화 인증"];
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex gap-2 text-xs font-semibold text-slate-500">
        {hint.map((line) => (
          <span
            key={line}
            className="rounded-full border border-white/80 bg-white/70 px-3 py-1"
          >
            {line}
          </span>
        ))}
      </div>

      <Card className="rounded-3xl border border-slate-100/80 bg-white/95 shadow-xl shadow-slate-900/5">
        <CardHeader className="space-y-1 border-b border-slate-100/80 pb-4">
          <CardTitle className="text-xl font-semibold text-slate-900">
            프로필 & 휴대전화
          </CardTitle>
          <p className="text-sm text-slate-500">
            이름+이미지, 휴대전화 두 항목만 완료하면 다음 단계로 이동할 수
            있어요.
          </p>
        </CardHeader>
        <CardContent className="pt-6">
          <AccountTab userData={user} />
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              className="h-11 min-w-[200px] justify-center"
              onClick={onRequestNext}
              disabled={!canProceed}
            >
              다음 단계로 이동
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

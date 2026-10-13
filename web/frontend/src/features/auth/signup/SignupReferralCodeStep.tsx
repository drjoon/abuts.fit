import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SignupReferralCodeStepProps {
  value: string;
  confirmedLabel: string | null;
  isValidating: boolean;
  nextLabel: string;
  nextDisabled?: boolean;
  onChange: (value: string) => void;
  onValidate: () => void;
  onClear: () => void;
  onPrevious: () => void;
  onNext: () => void;
}

export const SignupReferralCodeStep = ({
  value,
  confirmedLabel,
  isValidating,
  nextLabel,
  nextDisabled = false,
  onChange,
  onValidate,
  onClear,
  onPrevious,
  onNext,
}: SignupReferralCodeStepProps) => {
  return (
    <div className="space-y-6">
      <p className="text-sm text-white/70">
        소개받으셨나요? 소개자 코드를 입력해주세요.{" "}
        <span className="text-white/40">(선택)</span>
      </p>
      {confirmedLabel ? (
        <div className="space-y-1 rounded-2xl border border-primary/30 bg-primary/10 p-5">
          <p className="text-xs uppercase tracking-wider text-white/50">
            소개자 확인됨
          </p>
          <p className="font-semibold text-white">{confirmedLabel}</p>
          <button
            type="button"
            onClick={onClear}
            className="mt-1 text-xs text-white/50 underline hover:text-white/80"
          >
            변경
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="text"
            placeholder="소개 코드 입력"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onValidate();
              }
            }}
            disabled={isValidating}
            className="h-11 flex-1 border-white/10 bg-white/5 text-white placeholder:text-slate-300"
          />
          <Button
            type="button"
            variant="outline"
            disabled={isValidating || !value.trim()}
            onClick={onValidate}
            className="h-11 w-full shrink-0 border-white/10 bg-white/5 px-4 text-white/80 hover:bg-white/10 hover:text-white sm:w-auto"
          >
            {isValidating ? "확인 중..." : "확인"}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onPrevious}
          className="h-11 border-white/10 bg-white/5 text-white/80 hover:bg-white/10 hover:text-white"
        >
          이전
        </Button>
        <Button
          type="button"
          variant="hero"
          disabled={nextDisabled}
          onClick={onNext}
          className="h-11"
        >
          {nextLabel}
        </Button>
      </div>
    </div>
  );
};

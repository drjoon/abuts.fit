// related files:
// - web/frontend/src/shared/components/practice/RetentionGrooveGuideDialog.tsx
// - web/frontend/src/shared/components/practice/AbutmentModelConfirmDialog.tsx
// - web/frontend/src/shared/components/practice/AbutmentDesignConfirmDialog.tsx
// - web/frontend/src/features/requestSettings/useRequestorRequestSettings.ts
import { useState } from "react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { CircleHelp } from "lucide-react";
import { RetentionGrooveGuideDialog } from "./RetentionGrooveGuideDialog";

export type RetentionGrooveChoice = "none" | "deep";

type RetentionGrooveFieldProps = {
  value?: RetentionGrooveChoice | "shallow" | "" | null;
  onChange: (value: RetentionGrooveChoice) => void;
  disabled?: boolean;
  /** 라디오 id prefix (페이지 중복 방지) */
  idPrefix?: string;
  guideContentClassName?: string;
  className?: string;
};

/** 유지홈 없음/있음 + 비교 안내 모달 (어벗생산의뢰·기공의뢰수신 공통) */
export function RetentionGrooveField({
  value,
  onChange,
  disabled = false,
  idPrefix = "rg",
  guideContentClassName,
  className,
}: RetentionGrooveFieldProps) {
  const [guideOpen, setGuideOpen] = useState(false);
  const normalized: RetentionGrooveChoice =
    value === "deep" ? "deep" : "none";

  return (
    <>
      <div
        className={
          className || "rounded-lg border border-slate-200 bg-white px-3 py-2"
        }
      >
        <div className="flex flex-row items-center justify-between">
          <div className="text-sm font-semibold text-slate-600">유지홈</div>
          <RadioGroup
            value={normalized}
            onValueChange={(next) => {
              if (next === "none" || next === "deep") onChange(next);
            }}
            className="flex items-center gap-10"
            disabled={disabled}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem
                value="none"
                id={`${idPrefix}-none`}
                className="border-slate-300 text-primary-strong"
              />
              <Label
                htmlFor={`${idPrefix}-none`}
                className="cursor-pointer text-sm text-slate-700"
              >
                없음
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem
                value="deep"
                id={`${idPrefix}-deep`}
                className="border-slate-300 text-primary-strong"
              />
              <Label
                htmlFor={`${idPrefix}-deep`}
                className="cursor-pointer text-sm text-slate-700"
              >
                있음
              </Label>
            </div>
          </RadioGroup>
        </div>

        <button
          type="button"
          className="mt-1.5 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-strong transition-colors hover:text-primary-strong"
          aria-label="유지홈 선택 안내"
          onClick={() => setGuideOpen(true)}
        >
          <CircleHelp className="h-4 w-4" />
          유지구/유지홈 비교 보기
        </button>
      </div>

      <RetentionGrooveGuideDialog
        open={guideOpen}
        onOpenChange={setGuideOpen}
        contentClassName={guideContentClassName}
      />
    </>
  );
}

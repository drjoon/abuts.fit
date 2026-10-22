// related files:
// - web/frontend/src/shared/practice/screwSupply.ts
// - web/frontend/src/shared/components/practice/AbutmentModelConfirmDialog.tsx
// - web/frontend/src/features/requestSettings/RequestSettingsToolbar.tsx
// change-log:
// - 2026-10-23: 스크류 — 어벗츠 정품 / 임플란트 제조사 호환.
import { CircleHelp } from "lucide-react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";
import {
  screwCompatiblePhrase,
  type ScrewSupply,
} from "@/shared/practice/screwSupply";

type ScrewSupplyFieldProps = {
  value?: ScrewSupply | null;
  onChange: (value: ScrewSupply) => void;
  /** 두 번째 선택 라벨. 임플란트 제조사명. 없으면 「제조사」 */
  manufacturerLabel?: string;
  disabled?: boolean;
  idPrefix?: string;
  className?: string;
};

export function ScrewSupplyHint({
  manufacturerLabel,
}: {
  manufacturerLabel: string;
}) {
  const compatible = screwCompatiblePhrase(manufacturerLabel);
  return (
    <>
      <strong>어벗츠 정품</strong> 스크류가 기본입니다.
      <br />
      원하시면 <strong>{compatible}</strong> 스크류로 바뀝니다.
    </>
  );
}

/** 스크류 어벗츠 / 제조사 (3D 확인·채팅 옵션 공통) */
export function ScrewSupplyField({
  value,
  onChange,
  manufacturerLabel = "제조사",
  disabled = false,
  idPrefix = "screw",
  className,
}: ScrewSupplyFieldProps) {
  const selected: ScrewSupply = value === "manufacturer" ? "manufacturer" : "abuts";
  const makerLabel = String(manufacturerLabel || "").trim() || "제조사";

  return (
    <div
      className={
        className || "rounded-lg border border-slate-200 bg-white px-3 py-2"
      }
    >
      <div className="flex flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-1">
          <div className="text-sm font-semibold text-slate-600">스크류</div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex text-slate-400 transition-colors hover:text-primary"
                aria-label="스크류 안내"
              >
                <CircleHelp className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-left text-xs">
              <ScrewSupplyHint manufacturerLabel={makerLabel} />
            </TooltipContent>
          </Tooltip>
        </div>
        <RadioGroup
          value={selected}
          onValueChange={(next) => {
            if (next === "abuts" || next === "manufacturer") onChange(next);
          }}
          className="flex flex-wrap items-center gap-6"
          disabled={disabled}
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem
              value="abuts"
              id={`${idPrefix}-abuts`}
              className="border-slate-300 text-primary-strong"
            />
            <Label
              htmlFor={`${idPrefix}-abuts`}
              className={cn(
                "cursor-pointer text-sm text-slate-700",
                disabled && "cursor-default opacity-60",
              )}
            >
              어벗츠
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem
              value="manufacturer"
              id={`${idPrefix}-manufacturer`}
              className="border-slate-300 text-primary-strong"
            />
            <Label
              htmlFor={`${idPrefix}-manufacturer`}
              className={cn(
                "cursor-pointer text-sm text-slate-700",
                disabled && "cursor-default opacity-60",
              )}
            >
              {makerLabel}
            </Label>
          </div>
        </RadioGroup>
      </div>
    </div>
  );
}

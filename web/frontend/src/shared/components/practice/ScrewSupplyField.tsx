// related files:
// - web/frontend/src/shared/practice/screwSupply.ts
// - web/frontend/src/shared/components/practice/AbutmentModelConfirmDialog.tsx
// - web/frontend/src/features/requestSettings/RequestSettingsToolbar.tsx
// change-log:
// - 2026-10-23: 라벨 — 「선택 사항 - 어벗츠 정품, {제조사} 호환」·옵션 정품/호환.
// - 2026-10-23: 의뢰자 — 제조사 호환 선택 비활성(11월 중 오픈 예정), 어벗츠만.
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
  /** false면 제조사 호환 선택 불가(의뢰자 화면 기본). */
  manufacturerEnabled?: boolean;
  disabled?: boolean;
  idPrefix?: string;
  className?: string;
};

const MANUFACTURER_COMING_SOON_TOOLTIP = (
  <>
    준비 중입니다.
    <br />
    11월 중 제공 예정입니다.
  </>
);

export function ScrewSupplyHint({
  manufacturerLabel,
  manufacturerEnabled = false,
}: {
  manufacturerLabel: string;
  manufacturerEnabled?: boolean;
}) {
  const compatible = screwCompatiblePhrase(manufacturerLabel);
  if (!manufacturerEnabled) {
    return (
      <>
        <strong>어벗츠 정품</strong> 스크류가 기본입니다.
        <br />
        <strong>{compatible}</strong> 스크류는 준비 중이며, 11월 중 제공 예정입니다.
      </>
    );
  }
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
  manufacturerEnabled = false,
  disabled = false,
  idPrefix = "screw",
  className,
}: ScrewSupplyFieldProps) {
  const rawSelected: ScrewSupply =
    value === "manufacturer" ? "manufacturer" : "abuts";
  const selected: ScrewSupply =
    !manufacturerEnabled && rawSelected === "manufacturer" ? "abuts" : rawSelected;
  const makerLabel = String(manufacturerLabel || "").trim() || "제조사";
  const manufacturerCompatibleLabel = screwCompatiblePhrase(makerLabel);
  const sectionTitle = `선택 사항 - 어벗츠 정품, ${manufacturerCompatibleLabel}`;
  const manufacturerChoiceDisabled = disabled || !manufacturerEnabled;

  const manufacturerOption = (
    <>
      <RadioGroupItem
        value="manufacturer"
        id={`${idPrefix}-manufacturer`}
        className="border-slate-300 text-primary-strong"
        disabled={manufacturerChoiceDisabled}
      />
      <Label
        htmlFor={`${idPrefix}-manufacturer`}
        className={cn(
          "text-sm text-slate-700",
          manufacturerChoiceDisabled
            ? "cursor-not-allowed opacity-50"
            : "cursor-pointer",
          disabled && manufacturerEnabled && "cursor-default opacity-60",
        )}
      >
        {manufacturerCompatibleLabel}
      </Label>
    </>
  );

  return (
    <div
      className={
        className || "rounded-lg border border-slate-200 bg-white px-3 py-2"
      }
    >
      <div className="flex flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-1">
          <div className="text-sm font-semibold text-slate-600">{sectionTitle}</div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex text-slate-400 transition-colors hover:text-primary"
                aria-label="선택 사항 안내"
              >
                <CircleHelp className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-left text-xs">
              <ScrewSupplyHint
                manufacturerLabel={makerLabel}
                manufacturerEnabled={manufacturerEnabled}
              />
            </TooltipContent>
          </Tooltip>
        </div>
        <RadioGroup
          value={selected}
          onValueChange={(next) => {
            if (next === "manufacturer" && !manufacturerEnabled) return;
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
              어벗츠 정품
            </Label>
          </div>
          {!manufacturerEnabled ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center space-x-2">
                  {manufacturerOption}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs text-left text-xs">
                {MANUFACTURER_COMING_SOON_TOOLTIP}
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex items-center space-x-2">{manufacturerOption}</div>
          )}
        </RadioGroup>
      </div>
    </div>
  );
}

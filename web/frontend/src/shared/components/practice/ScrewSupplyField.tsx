// related files:
// - web/frontend/src/shared/practice/screwSupply.ts
// - web/frontend/src/shared/components/practice/AbutmentModelConfirmDialog.tsx
// - web/frontend/src/features/requestSettings/RequestSettingsToolbar.tsx
// change-log:
// - 2026-10-24: 3D 확인 모달에서는 쓰지 않는다. 채팅 옵션만.
// - 2026-10-23: RequestScrewSupplySection — 의뢰자 공통(3D 확인·채팅). copy는 screwSupply.ts SSOT.
// - 2026-10-23: 채팅 — 어벗츠 정품 버튼만. 클릭 시 스크류 선택 모달.
// - 2026-10-23: appearance — card(3D 확인) / buttons(채팅 툴바).
// - 2026-10-23: 카드 크롬은 className과 합친다(유지홈·아노와 동일).
// - 2026-10-23: 필드 제목 「스크류 선택」·옵션 어벗츠 정품 / {제조사} 호환.
// - 2026-10-23: 의뢰자 — 제조사 호환 선택 비활성(11월 중 오픈 예정), 어벗츠만.
// - 2026-10-23: 스크류 — 어벗츠 정품 / 임플란트 제조사 호환.
import { useState } from "react";
import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";
import {
  SCREW_SUPPLY_ABUTS_OPTION_LABEL,
  SCREW_SUPPLY_MANUFACTURER_COMING_SOON_LINE_1,
  SCREW_SUPPLY_MANUFACTURER_COMING_SOON_LINE_2,
  SCREW_SUPPLY_FIELD_LABEL,
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
  /** card: 3D 확인(유지홈·아노와 같은 카드). buttons: 채팅 툴바(ExoCAD·아노와 같은 버튼). */
  appearance?: "card" | "buttons";
  disabled?: boolean;
  idPrefix?: string;
  className?: string;
};

const MANUFACTURER_COMING_SOON_TOOLTIP = (
  <>
    {SCREW_SUPPLY_MANUFACTURER_COMING_SOON_LINE_1}
    <br />
    {SCREW_SUPPLY_MANUFACTURER_COMING_SOON_LINE_2}
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
        <strong>{SCREW_SUPPLY_ABUTS_OPTION_LABEL}</strong> 스크류가 기본입니다.
        <br />
        <strong>{compatible}</strong> 스크류는 준비 중이며,{" "}
        {SCREW_SUPPLY_MANUFACTURER_COMING_SOON_LINE_2}
      </>
    );
  }
  return (
    <>
      <strong>{SCREW_SUPPLY_ABUTS_OPTION_LABEL}</strong> 스크류가 기본입니다.
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
  appearance = "card",
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
  const manufacturerChoiceDisabled = disabled || !manufacturerEnabled;
  const [pickerOpen, setPickerOpen] = useState(false);
  const triggerLabel =
    selected === "manufacturer"
      ? manufacturerCompatibleLabel
      : SCREW_SUPPLY_ABUTS_OPTION_LABEL;

  if (appearance === "buttons") {
    return (
      <>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn("h-9 shrink-0 px-3", className)}
          onClick={() => setPickerOpen(true)}
        >
          {triggerLabel}
        </Button>
        <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
          <DialogContent
            className="z-[320] gap-4 sm:max-w-md"
            overlayClassName="z-[320]"
          >
            <DialogHeader className="space-y-1 pr-8">
              <DialogTitle>{SCREW_SUPPLY_FIELD_LABEL}</DialogTitle>
              <DialogDescription className="sr-only">
                스크류를 고릅니다.
              </DialogDescription>
            </DialogHeader>
            <ScrewSupplyField
              appearance="card"
              value={selected}
              manufacturerLabel={makerLabel}
              manufacturerEnabled={manufacturerEnabled}
              disabled={disabled}
              idPrefix={`${idPrefix}-modal`}
              onChange={(next) => {
                onChange(next);
                setPickerOpen(false);
              }}
            />
          </DialogContent>
        </Dialog>
      </>
    );
  }

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
      className={cn(
        "rounded-lg border border-slate-200 bg-white px-3 py-2",
        className,
      )}
    >
      <div className="flex flex-row flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex shrink-0 items-center gap-1">
          <div className="text-sm font-semibold text-slate-600">
            {SCREW_SUPPLY_FIELD_LABEL}
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex text-slate-400 transition-colors hover:text-primary"
                aria-label="스크류 선택 안내"
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
          className="flex min-w-0 flex-wrap items-center gap-6"
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
              {SCREW_SUPPLY_ABUTS_OPTION_LABEL}
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

type RequestScrewSupplySectionProps = Omit<
  ScrewSupplyFieldProps,
  "manufacturerEnabled"
> & {
  manufacturerEnabled?: boolean;
};

/** 의뢰자 — 3D 확인·기공의뢰수신 채팅. 제조사 호환은 기본 비활성. */
export function RequestScrewSupplySection({
  manufacturerEnabled = false,
  className,
  ...rest
}: RequestScrewSupplySectionProps) {
  return (
    <ScrewSupplyField
      {...rest}
      manufacturerEnabled={manufacturerEnabled}
      className={className}
    />
  );
}

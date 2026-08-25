// related files:
// - web/frontend/src/shared/components/practice/PracticeToothAbutmentFields.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/practice/transferMemo.ts
// change-log:
// - 2026-08-25: disabled — 커스텀어벗 보철 형태에서는 심플어벗 선택 불가(스캔바디만).
// - 2026-08-25: 심플어벗 섹션 — 종류(심플어벗/심플밀링)·직경(6–10)·높이(S/M/L). 스캔바디와 XOR.
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  emptyToothWorkAbutment,
  isSimpleAbutmentDiameter,
  isSimpleAbutmentHeight,
  isSimpleAbutmentKind,
  SIMPLE_ABUTMENT_DIAMETERS,
  SIMPLE_ABUTMENT_HEIGHTS,
  SIMPLE_ABUTMENT_KINDS,
  type SimpleAbutmentKind,
} from "@/shared/practice/transferMemo";
import { cn } from "@/shared/ui/cn";

export type ToothSimpleAbutmentValues = {
  abutmentManufacturer: string;
  abutmentDiameter: string;
  abutmentHeight: string;
};

type Props = {
  value: ToothSimpleAbutmentValues;
  onChange: (next: ToothSimpleAbutmentValues) => void;
  heading?: string;
  className?: string;
  /** 스캔바디가 선택된 경우 시각적으로 약하게 */
  dimmed?: boolean;
  /** 커스텀어벗 보철 형태 등 — 선택 자체 불가 */
  disabled?: boolean;
  disabledHint?: string;
};

const ChoiceChip = ({
  label,
  active,
  onClick,
  className,
  disabled = false,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
}) => (
  <button
    type="button"
    disabled={disabled}
    className={cn(
      "h-9 rounded-lg border px-2 text-sm font-semibold transition-colors",
      active
        ? "border-service-abut/70 bg-service-abut-soft/60 text-slate-900 shadow-sm"
        : "border-slate-200/90 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
      disabled &&
        "cursor-not-allowed opacity-50 hover:border-slate-200/90 hover:bg-white",
      className,
    )}
    onClick={onClick}
  >
    {label}
  </button>
);

export const PracticeToothSimpleAbutmentFields = ({
  value,
  onChange,
  heading = "심플어벗",
  className,
  dimmed = false,
  disabled = false,
  disabledHint,
}: Props) => {
  const kind = String(value.abutmentManufacturer || "").trim();
  const diameter = String(value.abutmentDiameter || "").trim();
  const height = String(value.abutmentHeight || "").trim();
  const activeKind = isSimpleAbutmentKind(kind) ? kind : "";
  const activeDiameter = isSimpleAbutmentDiameter(diameter) ? diameter : "";
  const activeHeight = isSimpleAbutmentHeight(height) ? height : "";
  const inactive = disabled || dimmed;

  const selectKind = (next: SimpleAbutmentKind) => {
    if (disabled) return;
    if (activeKind === next) {
      onChange(emptyToothWorkAbutment());
      return;
    }
    onChange({
      abutmentManufacturer: next,
      abutmentDiameter: activeDiameter,
      abutmentHeight: activeHeight,
    });
  };

  const selectDiameter = (next: string) => {
    if (disabled) return;
    if (activeDiameter === next && activeKind) {
      onChange({
        abutmentManufacturer: activeKind,
        abutmentDiameter: "",
        abutmentHeight: activeHeight,
      });
      return;
    }
    onChange({
      abutmentManufacturer: activeKind || SIMPLE_ABUTMENT_KINDS[0],
      abutmentDiameter: next,
      abutmentHeight: activeHeight,
    });
  };

  const selectHeight = (next: string) => {
    if (disabled) return;
    if (activeHeight === next && activeKind) {
      onChange({
        abutmentManufacturer: activeKind,
        abutmentDiameter: activeDiameter,
        abutmentHeight: "",
      });
      return;
    }
    onChange({
      abutmentManufacturer: activeKind || SIMPLE_ABUTMENT_KINDS[0],
      abutmentDiameter: activeDiameter,
      abutmentHeight: next,
    });
  };

  const hasAny = Boolean(activeKind || activeDiameter || activeHeight);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-3 rounded-xl border border-service-abut-muted/80 bg-service-abut-soft/40 p-3 sm:p-4",
        inactive && "opacity-55",
        disabled && "pointer-events-none",
        className,
      )}
      aria-disabled={disabled || undefined}
      title={disabled ? disabledHint : undefined}
    >
      <div className="flex shrink-0 items-center justify-between gap-2">
        <p className="text-sm font-semibold text-service-abut">{heading}</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-sm text-slate-500"
          disabled={disabled || !hasAny}
          onClick={() => onChange(emptyToothWorkAbutment())}
        >
          <X className="mr-1 h-4 w-4" />
          비우기
        </Button>
      </div>

      {disabled && disabledHint ? (
        <p className="text-[11px] leading-snug text-slate-500">{disabledHint}</p>
      ) : null}

      <div className="space-y-1.5">
        <Label className="text-sm text-slate-600">종류</Label>
        <div className="flex gap-1.5">
          {SIMPLE_ABUTMENT_KINDS.map((option) => (
            <ChoiceChip
              key={option}
              label={option}
              active={activeKind === option}
              disabled={disabled}
              className="min-w-0 flex-1"
              onClick={() => selectKind(option)}
            />
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm text-slate-600">직경</Label>
        <div className="flex flex-wrap gap-1.5">
          {SIMPLE_ABUTMENT_DIAMETERS.map((option) => (
            <ChoiceChip
              key={option}
              label={option}
              active={activeDiameter === option}
              disabled={disabled}
              className="min-w-[2.25rem] flex-1"
              onClick={() => selectDiameter(option)}
            />
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm text-slate-600">높이</Label>
        <div className="flex gap-1.5">
          {SIMPLE_ABUTMENT_HEIGHTS.map((option) => (
            <ChoiceChip
              key={option}
              label={option}
              active={activeHeight === option}
              disabled={disabled}
              className="min-w-0 flex-1"
              onClick={() => selectHeight(option)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

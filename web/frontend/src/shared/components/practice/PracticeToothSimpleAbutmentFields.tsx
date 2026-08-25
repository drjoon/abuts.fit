// related files:
// - web/frontend/src/shared/components/practice/PracticeToothAbutmentFields.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/practice/transferMemo.ts
// change-log:
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
};

const ChoiceChip = ({
  label,
  active,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  className?: string;
}) => (
  <button
    type="button"
    className={cn(
      "h-9 rounded-lg border px-2 text-sm font-semibold transition-colors",
      active
        ? "border-service-abut/70 bg-service-abut-soft/60 text-slate-900 shadow-sm"
        : "border-slate-200/90 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
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
}: Props) => {
  const kind = String(value.abutmentManufacturer || "").trim();
  const diameter = String(value.abutmentDiameter || "").trim();
  const height = String(value.abutmentHeight || "").trim();
  const activeKind = isSimpleAbutmentKind(kind) ? kind : "";
  const activeDiameter = isSimpleAbutmentDiameter(diameter) ? diameter : "";
  const activeHeight = isSimpleAbutmentHeight(height) ? height : "";

  const selectKind = (next: SimpleAbutmentKind) => {
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
        dimmed && "opacity-55",
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-2">
        <p className="text-sm font-semibold text-service-abut">{heading}</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-sm text-slate-500"
          disabled={!hasAny}
          onClick={() => onChange(emptyToothWorkAbutment())}
        >
          <X className="mr-1 h-4 w-4" />
          비우기
        </Button>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm text-slate-600">종류</Label>
        <div className="flex gap-1.5">
          {SIMPLE_ABUTMENT_KINDS.map((option) => (
            <ChoiceChip
              key={option}
              label={option}
              active={activeKind === option}
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
              className="min-w-0 flex-1"
              onClick={() => selectHeight(option)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

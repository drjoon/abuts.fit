// related files:
// - web/frontend/src/shared/components/practice/RetentionGrooveField.tsx
// - web/frontend/src/shared/components/practice/AbutmentModelConfirmDialog.tsx
// - web/frontend/src/features/requestSettings/useRequestorRequestSettings.ts
// change-log:
// - 2026-09-20: 3D 확인 모달 — 아노다이징 ON/OFF(계정 기본값).
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/shared/ui/cn";

type AnodizingFieldProps = {
  value?: boolean | null;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  /** 라디오 id prefix (페이지 중복 방지) */
  idPrefix?: string;
  className?: string;
};

/** 아노다이징 ON/OFF (어벗생산의뢰·기공의뢰수신 3D 확인 공통) */
export function AnodizingField({
  value,
  onChange,
  disabled = false,
  idPrefix = "ano",
  className,
}: AnodizingFieldProps) {
  const normalized = value === false ? "off" : "on";

  return (
    <div
      className={
        className || "rounded-lg border border-slate-200 bg-white px-3 py-2"
      }
    >
      <div className="flex flex-row items-center justify-between">
        <div className="text-sm font-semibold text-slate-600">아노다이징</div>
        <RadioGroup
          value={normalized}
          onValueChange={(next) => {
            if (next === "on") onChange(true);
            else if (next === "off") onChange(false);
          }}
          className="flex items-center gap-10"
          disabled={disabled}
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem
              value="on"
              id={`${idPrefix}-on`}
              className="border-slate-300 text-primary-strong"
            />
            <Label
              htmlFor={`${idPrefix}-on`}
              className={cn(
                "cursor-pointer text-sm text-slate-700",
                disabled && "cursor-default opacity-60",
              )}
            >
              ON
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem
              value="off"
              id={`${idPrefix}-off`}
              className="border-slate-300 text-primary-strong"
            />
            <Label
              htmlFor={`${idPrefix}-off`}
              className={cn(
                "cursor-pointer text-sm text-slate-700",
                disabled && "cursor-default opacity-60",
              )}
            >
              OFF
            </Label>
          </div>
        </RadioGroup>
      </div>
    </div>
  );
}

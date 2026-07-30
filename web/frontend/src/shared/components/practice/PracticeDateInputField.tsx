import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/shared/ui/cn";

type PracticeDateInputFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  wrapperClassName?: string;
  labelClassName?: string;
  labelRowClassName?: string;
  inputClassName?: string;
  labelAction?: ReactNode;
};

export function PracticeDateInputField({
  id,
  label,
  value,
  onChange,
  min,
  wrapperClassName,
  labelClassName,
  labelRowClassName,
  inputClassName,
  labelAction,
}: PracticeDateInputFieldProps) {
  return (
    <div className={cn("space-y-1.5", wrapperClassName)}>
      <div className={cn("flex h-7 items-center gap-1", labelRowClassName)}>
        <Label htmlFor={id} className={cn("text-sm leading-none", labelClassName)}>
          {label}
        </Label>
        {labelAction ? <div className="shrink-0 flex h-full items-center">{labelAction}</div> : null}
      </div>
      <Input
        id={id}
        type="date"
        value={value}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        className={cn("h-9", inputClassName)}
      />
    </div>
  );
}

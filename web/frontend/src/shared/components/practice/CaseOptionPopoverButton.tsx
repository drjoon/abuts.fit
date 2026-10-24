// change-log:
// - 2026-10-24: 유지홈·아노다이징 — 버튼 클릭 시 두 선택 팝오버.
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/shared/ui/cn";

export function CaseOptionPopoverButton<T extends string>({
  label,
  icon,
  value,
  options,
  onChange,
  disabled = false,
  className,
}: {
  label: string;
  icon: ReactNode;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn("h-9 shrink-0 gap-1.5 px-3", className)}
          aria-label={label}
        >
          {icon}
          <span>{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-44 p-1.5">
        <div className="flex flex-col gap-1">
          {options.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 justify-start px-2",
                option.value === value && "bg-slate-100 font-medium",
              )}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

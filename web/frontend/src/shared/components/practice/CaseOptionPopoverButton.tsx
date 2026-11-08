// change-log:
// - 2026-11-08: 선택 안내는 팝오버 하단에만. 가리킨 항목 문구를 보여 준다.
// - 2026-10-24: 채팅 줄은 아이콘만. 라벨은 팝오버와 aria에 둔다.
// - 2026-10-24: 유지홈·아노다이징 — 버튼 클릭 시 두 선택 팝오버.
import { useState, type ReactNode } from "react";
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
  hideLabel = false,
  labelClassName,
  className,
  optionNote,
}: {
  label: string;
  icon: ReactNode;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  hideLabel?: boolean;
  labelClassName?: string;
  className?: string;
  /** 팝오버 하단 안내. 마우스가 올린 항목, 없으면 현재 값. */
  optionNote?: (value: T) => ReactNode;
}) {
  const [preview, setPreview] = useState<T | null>(null);
  const noteValue = preview ?? value;

  return (
    <Popover onOpenChange={(open) => { if (!open) setPreview(null); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn(
            "h-9 shrink-0 gap-1.5",
            hideLabel ? "w-9 px-0" : "px-3",
            className,
          )}
          aria-label={label}
        >
          {icon}
          {hideLabel ? (
            <span className="sr-only">{label}</span>
          ) : (
            <span className={labelClassName}>{label}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn("p-1.5", optionNote ? "w-72" : "w-44")}
      >
        <div className="flex flex-col gap-1">
          {options.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 justify-start px-2",
                option.value === noteValue && "bg-slate-100 font-medium",
              )}
              onMouseEnter={() => setPreview(option.value)}
              onMouseLeave={() => setPreview(null)}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
        {optionNote ? (
          <p className="mt-1 border-t border-slate-200 px-2 py-1.5 text-xs leading-relaxed text-slate-500">
            {optionNote(noteValue)}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

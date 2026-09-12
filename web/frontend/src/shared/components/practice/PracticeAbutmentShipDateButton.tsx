// related files:
// - web/frontend/src/shared/components/practice/PracticeLabReceiveWorkActionsBar.tsx
// - web/frontend/src/shared/practice/practiceAbutmentShipYmd.ts
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// change-log:
// - 2026-09-12: 기공소 어벗 출고일 설정 팝오버(기본 도착−3달력일).

import { useEffect, useState, type MouseEvent } from "react";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  defaultAbutmentShipYmdFromArrival,
  formatAbutmentShipButtonLabel,
  resolveEffectiveAbutmentShipYmd,
  resolvePracticeTransferArrivalYmd,
} from "@/shared/practice/practiceAbutmentShipYmd";
import { cn } from "@/shared/ui/cn";

export type PracticeAbutmentShipDateButtonProps = {
  transfer: {
    arrivalDate?: string | null;
    arrivalDates?: string[] | null;
    production?: { abutmentShipYmd?: string | null } | null;
  };
  busy?: boolean;
  disabled?: boolean;
  onSave?: (shipYmd: string) => void | Promise<void>;
  className?: string;
};

/**
 * 어벗 STL 업로드 옆 — 출고일 설정(기본: 치과도착일 − 3달력일).
 */
export function PracticeAbutmentShipDateButton({
  transfer,
  busy = false,
  disabled = false,
  onSave,
  className,
}: PracticeAbutmentShipDateButtonProps) {
  const [open, setOpen] = useState(false);
  const arrivalYmd = resolvePracticeTransferArrivalYmd(transfer);
  const effectiveShipYmd = resolveEffectiveAbutmentShipYmd(transfer);
  const defaultShipYmd =
    defaultAbutmentShipYmdFromArrival(arrivalYmd) || effectiveShipYmd || "";
  const [draft, setDraft] = useState(effectiveShipYmd || defaultShipYmd);

  useEffect(() => {
    if (!open) return;
    setDraft(effectiveShipYmd || defaultShipYmd);
  }, [open, effectiveShipYmd, defaultShipYmd]);

  const maxYmd = arrivalYmd || undefined;
  const canApply =
    /^\d{4}-\d{2}-\d{2}$/.test(draft) &&
    (!maxYmd || draft <= maxYmd) &&
    Boolean(onSave);

  const handleApply = (event: MouseEvent) => {
    event.stopPropagation();
    if (!canApply || busy || !onSave) return;
    void Promise.resolve(onSave(draft)).then(() => setOpen(false));
  };

  const buttonLabel = formatAbutmentShipButtonLabel(effectiveShipYmd);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip open={open ? false : undefined}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || disabled || !onSave}
              className={cn(
                "h-8 shrink-0 gap-1 px-2.5 text-xs focus-visible:ring-0 focus-visible:ring-offset-0",
                className,
              )}
              onClick={(event) => event.stopPropagation()}
            >
              <CalendarClock className="h-3.5 w-3.5" />
              {busy ? "처리 중..." : buttonLabel}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
          기본은 치과도착일 3일 전 출고입니다. 기공소에서 변경할 수 있습니다.
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        className="w-64 space-y-2 p-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="text-[11px] leading-relaxed text-muted-foreground">
          기본: 치과도착일
          {arrivalYmd ? `(${arrivalYmd})` : ""} − 3일
          {defaultShipYmd ? ` → ${defaultShipYmd}` : ""}.
        </div>
        <Input
          type="date"
          value={draft}
          max={maxYmd}
          onChange={(e) => setDraft(e.target.value)}
          className="h-9"
        />
        <div className="flex justify-end gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={(event) => {
              event.stopPropagation();
              setOpen(false);
            }}
          >
            닫기
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 text-xs"
            disabled={!canApply || busy}
            onClick={handleApply}
          >
            {busy ? "저장 중..." : "적용"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

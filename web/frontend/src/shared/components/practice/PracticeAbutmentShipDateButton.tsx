// related files:
// - web/frontend/src/shared/components/practice/PracticeLabReceiveWorkActionsBar.tsx
// - web/frontend/src/shared/practice/practiceAbutmentShipYmd.ts
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// change-log:
// - 2026-09-12: −n일 클릭 즉시 저장. 닫기·적용 제거.
// - 2026-09-12: 팝오버 안내·출고/도착 2줄 표기(가독성).
// - 2026-09-12: 달력 → 치과도착−n일 선택(최소 2·낮 12시 신속/묶음 상한).
// - 2026-09-12: 기공소 어벗 출고일 설정 팝오버(기본 도착−3달력일).

import { useState, type MouseEvent } from "react";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { formatKstYmdToKo } from "@/shared/date/kst";
import {
  PRACTICE_ABUTMENT_SHIP_BEFORE_ARRIVAL_CIVIL_DAYS,
  abutmentShipYmdFromArrivalMinusN,
  clampAbutmentShipN,
  formatAbutmentShipButtonLabel,
  getAbutmentShipNPickerHintLines,
  getAbutmentShipNPickerTooltip,
  resolveAbutmentShipBeforeArrivalN,
  resolveAbutmentShipNRange,
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
  /** 묶음 출고 주간 요일(있으면 12시 이후 max n에 반영) */
  weeklyBatchDays?: unknown;
  onSave?: (shipYmd: string) => void | Promise<void>;
  className?: string;
};

/**
 * 어벗 STL 업로드 옆 — 출고일 = 치과도착일 − n일. n 클릭 시 즉시 저장.
 */
export function PracticeAbutmentShipDateButton({
  transfer,
  busy = false,
  disabled = false,
  weeklyBatchDays,
  onSave,
  className,
}: PracticeAbutmentShipDateButtonProps) {
  const [open, setOpen] = useState(false);
  const arrivalYmd = resolvePracticeTransferArrivalYmd(transfer);
  const effectiveShipYmd = resolveEffectiveAbutmentShipYmd(transfer);
  const range = resolveAbutmentShipNRange({
    arrivalYmd,
    weeklyBatchDays,
  });

  const currentN =
    clampAbutmentShipN(
      resolveAbutmentShipBeforeArrivalN({
        shipYmd: effectiveShipYmd,
        arrivalYmd,
      }) ?? PRACTICE_ABUTMENT_SHIP_BEFORE_ARRIVAL_CIVIL_DAYS,
      range,
    ) ?? PRACTICE_ABUTMENT_SHIP_BEFORE_ARRIVAL_CIVIL_DAYS;

  const handleSelectN = (event: MouseEvent, n: number) => {
    event.stopPropagation();
    if (busy || disabled || !onSave || !range.selectable) return;
    const shipYmd = abutmentShipYmdFromArrivalMinusN(arrivalYmd, n);
    if (!shipYmd) return;
    if (shipYmd === effectiveShipYmd) {
      setOpen(false);
      return;
    }
    void Promise.resolve(onSave(shipYmd)).then(() => setOpen(false));
  };

  const buttonLabel = formatAbutmentShipButtonLabel(effectiveShipYmd);
  const hintLines = getAbutmentShipNPickerHintLines({ mode: range.mode });
  const tooltip = getAbutmentShipNPickerTooltip({ mode: range.mode });
  const nOptions = range.selectable
    ? Array.from(
        { length: range.maxN - range.minN + 1 },
        (_, i) => range.minN + i,
      )
    : [];

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
        <TooltipContent
          side="top"
          className="max-w-xs whitespace-pre-line text-xs leading-relaxed"
        >
          {tooltip}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        className="w-56 space-y-2.5 p-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-0.5 text-[11px] leading-snug text-muted-foreground">
          {hintLines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
        {range.selectable ? (
          <>
            <div className="flex flex-wrap gap-1.5">
              {nOptions.map((n) => {
                const selected = currentN === n;
                return (
                  <Button
                    key={n}
                    type="button"
                    size="sm"
                    variant={selected ? "default" : "outline"}
                    disabled={busy}
                    className="h-8 min-w-9 px-2 text-xs"
                    onClick={(event) => handleSelectN(event, n)}
                  >
                    −{n}일
                  </Button>
                );
              })}
            </div>
            <div className="space-y-0.5 text-[11px] leading-snug text-muted-foreground">
              <div>
                출고{" "}
                <span className="font-medium text-foreground">
                  {effectiveShipYmd
                    ? formatKstYmdToKo(effectiveShipYmd)
                    : "—"}
                </span>
              </div>
              {arrivalYmd ? (
                <div>
                  도착{" "}
                  <span className="font-medium text-foreground">
                    {formatKstYmdToKo(arrivalYmd)}
                  </span>
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <div className="space-y-0.5 text-[11px] leading-snug text-amber-800 dark:text-amber-200">
            <div>선택 가능한 n이 없습니다.</div>
            <div>치과도착일을 확인해 주세요.</div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

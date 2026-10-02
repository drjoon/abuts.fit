/**
 * 기공의뢰수신 — 헤더 설정 팝오버(보기 전환 · PC 알람).
 * related files:
 * - web/frontend/src/shared/practice/labReceiveSoundPrefs.ts
 * - web/frontend/src/shared/practice/labReceiveCalendarViewMode.ts
 * - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
 * - web/frontend/src/pages/practice/components/LabReceiveUnreadNotice.tsx
 * change-log:
 * - 2026-10-03: 캘린더·목록 보기 전환을 팝오버로 이동.
 * - 2026-10-03: 치과별 mute 제거 — 전체 알림 스위치만.
 * - 2026-10-03: 헤더 데모 뱃지 왼쪽 — 전체 on/off.
 */
import { useEffect, useState } from "react";
import { CalendarDays, List, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";
import {
  LAB_RECEIVE_SOUND_PREFS_CHANGED_EVENT,
  getLabReceiveSoundPrefs,
  setLabReceiveSoundEnabled,
  type LabReceiveSoundPrefs,
} from "@/shared/practice/labReceiveSoundPrefs";
import type { LabReceiveCalendarViewMode } from "@/shared/practice/labReceiveCalendarViewMode";

type LabReceiveAlarmSettingsButtonProps = {
  className?: string;
  viewMode?: LabReceiveCalendarViewMode;
  onViewModeChange?: (mode: LabReceiveCalendarViewMode) => void;
};

function useLabReceiveSoundPrefsState(): LabReceiveSoundPrefs {
  const [prefs, setPrefs] = useState<LabReceiveSoundPrefs>(() =>
    getLabReceiveSoundPrefs(),
  );

  useEffect(() => {
    const sync = () => setPrefs(getLabReceiveSoundPrefs());
    window.addEventListener(LAB_RECEIVE_SOUND_PREFS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(LAB_RECEIVE_SOUND_PREFS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return prefs;
}

export function LabReceiveAlarmSettingsButton({
  className,
  viewMode,
  onViewModeChange,
}: LabReceiveAlarmSettingsButtonProps) {
  const prefs = useLabReceiveSoundPrefsState();
  const [open, setOpen] = useState(false);
  const globalOn = prefs.enabled;
  const showViewMode = Boolean(onViewModeChange);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={cn(
                  "h-9 w-9 shrink-0 rounded-full border-slate-200 bg-white p-0 shadow-sm",
                  !globalOn && "text-slate-400",
                  className,
                )}
                aria-label="설정"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">설정</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        className="w-[min(100vw-1.5rem,18rem)] gap-0 overflow-hidden p-0"
      >
        {showViewMode ? (
          <div className="border-b border-slate-100 px-3 py-2.5">
            <p className="text-sm font-semibold text-slate-900">보기</p>
            <div
              className="mt-2 flex items-center rounded-md border border-slate-200 bg-white p-0.5"
              role="group"
              aria-label="보기 전환"
            >
              <button
                type="button"
                className={cn(
                  "inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded px-2 text-xs font-medium",
                  viewMode === "calendar"
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50",
                )}
                aria-pressed={viewMode === "calendar"}
                aria-label="캘린더"
                onClick={() => onViewModeChange?.("calendar")}
              >
                <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
                캘린더
              </button>
              <button
                type="button"
                className={cn(
                  "inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded px-2 text-xs font-medium",
                  viewMode === "list"
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-50",
                )}
                aria-pressed={viewMode === "list"}
                aria-label="목록"
                onClick={() => onViewModeChange?.("list")}
              >
                <List className="h-3.5 w-3.5 shrink-0" aria-hidden />
                목록
              </button>
            </div>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-slate-900">전체 알림</p>
            <p className="text-xs text-slate-500">의뢰·채팅</p>
          </div>
          <Switch
            checked={globalOn}
            onCheckedChange={(checked) => setLabReceiveSoundEnabled(checked)}
            aria-label="전체 알림"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

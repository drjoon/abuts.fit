/**
 * 기공의뢰수신 — 헤더 설정 팝오버(보기 전환 · PC 알람 · 연결 프로그램).
 * related files:
 * - web/frontend/src/shared/practice/labReceiveSoundPrefs.ts
 * - web/frontend/src/shared/chat/chatNotifySounds.ts
 * - web/frontend/src/shared/practice/labReceiveCalendarViewMode.ts
 * - web/frontend/src/shared/hooks/useLabHelperInstallPrompt.tsx
 * - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
 * - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
 * - web/frontend/src/pages/practice/components/LabReceiveUnreadNotice.tsx
 * change-log:
 * - 2026-10-04: 알림음 — 한 줄 항목 클릭 시 중첩 팝오버로 샘플 선택.
 * - 2026-10-04: 알림음 샘플 선택·미리듣기.
 * - 2026-10-04: 연결 프로그램 설치·업데이트 항목.
 * - 2026-10-03: 전체 알림 켜면 미리듣기(제스처로 AudioContext unlock).
 * - 2026-10-03: 치과 발신 헤더에서도 재사용(보기·전체 알림).
 * - 2026-10-03: 캘린더·목록 보기 전환을 팝오버로 이동.
 * - 2026-10-03: 치과별 mute 제거 — 전체 알림 스위치만.
 * - 2026-10-03: 헤더 데모 뱃지 왼쪽 — 전체 on/off.
 */
import { useEffect, useState } from "react";
import { CalendarDays, ChevronDown, List, Settings, Volume2 } from "lucide-react";
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
  setLabReceiveSoundId,
  type LabReceiveSoundPrefs,
} from "@/shared/practice/labReceiveSoundPrefs";
import { playChatNotifySound } from "@/shared/chat/chatSoundPlayer";
import {
  CHAT_NOTIFY_SOUND_OPTIONS,
  type ChatNotifySoundId,
} from "@/shared/chat/chatNotifySounds";
import type { LabReceiveCalendarViewMode } from "@/shared/practice/labReceiveCalendarViewMode";
import { useLabHelperInstallPrompt } from "@/shared/hooks/useLabHelperInstallPrompt";
import {
  resolveLabHelperPresence,
  supportsLabHelper,
  type LabHelperPresence,
} from "@/shared/files/labHelperClient";

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

function presenceActionLabel(presence: LabHelperPresence): string {
  if (presence === "outdated") return "업데이트";
  if (presence === "ready") return "설치됨";
  return "설치";
}

const previewSound = (soundId: ChatNotifySoundId) => {
  playChatNotifySound({
    force: true,
    soundId,
    title: "알림음",
    body: "미리듣기",
  });
};

function soundLabel(soundId: ChatNotifySoundId): string {
  return (
    CHAT_NOTIFY_SOUND_OPTIONS.find((opt) => opt.id === soundId)?.label ||
    CHAT_NOTIFY_SOUND_OPTIONS[0].label
  );
}

export function LabReceiveAlarmSettingsButton({
  className,
  viewMode,
  onViewModeChange,
}: LabReceiveAlarmSettingsButtonProps) {
  const prefs = useLabReceiveSoundPrefsState();
  const [open, setOpen] = useState(false);
  const [soundOpen, setSoundOpen] = useState(false);
  const [presence, setPresence] = useState<LabHelperPresence | null>(null);
  const [presenceBusy, setPresenceBusy] = useState(false);
  const { promptFromSettings, dialogs } = useLabHelperInstallPrompt();
  const globalOn = prefs.enabled;
  const showViewMode = Boolean(onViewModeChange);
  const showHelper = supportsLabHelper();

  useEffect(() => {
    if (!open) setSoundOpen(false);
  }, [open]);

  useEffect(() => {
    if (!open || !showHelper) return;
    let cancelled = false;
    setPresenceBusy(true);
    void (async () => {
      const next = await resolveLabHelperPresence({ wake: true });
      if (!cancelled) {
        setPresence(next);
        setPresenceBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, showHelper]);

  return (
    <>
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
              onCheckedChange={(checked) => {
                setLabReceiveSoundEnabled(checked);
                if (checked) {
                  previewSound(prefs.soundId);
                }
              }}
              aria-label="전체 알림"
            />
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900">알림음</p>
              <p className="text-xs text-slate-500">선택·미리듣기</p>
            </div>
            <Popover
              open={soundOpen}
              onOpenChange={(next) => {
                if (!globalOn) return;
                setSoundOpen(next);
              }}
              modal={false}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!globalOn}
                  className="h-8 max-w-[9.5rem] shrink-0 gap-1 px-2 text-xs"
                  aria-label="알림음 선택"
                >
                  <Volume2 className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
                  <span className="min-w-0 truncate">{soundLabel(prefs.soundId)}</span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                side="left"
                sideOffset={8}
                className="w-44 gap-0 overflow-hidden p-0"
              >
                <ul
                  className="max-h-[13.5rem] space-y-0.5 overflow-y-auto px-1 py-1"
                  role="listbox"
                  aria-label="알림음 선택"
                >
                  {CHAT_NOTIFY_SOUND_OPTIONS.map((opt) => {
                    const selected = prefs.soundId === opt.id;
                    return (
                      <li key={opt.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs font-medium transition-colors",
                            selected
                              ? "bg-sky-50 text-sky-800"
                              : "text-slate-700 hover:bg-slate-50",
                          )}
                          onClick={() => {
                            setLabReceiveSoundId(opt.id);
                            previewSound(opt.id);
                            setSoundOpen(false);
                          }}
                        >
                          <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                          <Volume2
                            className={cn(
                              "h-3.5 w-3.5 shrink-0",
                              selected ? "text-sky-600" : "text-slate-400",
                            )}
                            aria-hidden
                          />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </PopoverContent>
            </Popover>
          </div>
          {showHelper ? (
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">연결 프로그램</p>
                <p className="text-xs text-slate-500">폴더 열기·PC 알림</p>
              </div>
              {presence === "ready" ? (
                <span className="shrink-0 text-xs font-medium text-slate-500">
                  설치됨
                </span>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 shrink-0 px-2.5 text-xs"
                  disabled={presenceBusy}
                  onClick={() => {
                    setOpen(false);
                    void (async () => {
                      const next = await promptFromSettings();
                      setPresence(next);
                    })();
                  }}
                >
                  {presenceBusy
                    ? "확인 중"
                    : presenceActionLabel(presence ?? "missing")}
                </Button>
              )}
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
      {dialogs}
    </>
  );
}

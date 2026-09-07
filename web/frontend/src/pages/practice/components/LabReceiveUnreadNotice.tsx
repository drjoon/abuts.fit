/**
 * 기공의뢰수신 — 미확인 건 상단 안내 바 + 클릭 가능한 의뢰 칩.
 * 상태 필터·캘린더 스크롤과 무관하게 미확인을 항상 알려 수락 누락을 막는다.
 * (목록은 3주 창 + 미확인 전 기간 OR로 서버에서 합친다.)
 *
 * related files:
 * - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
 * - web/frontend/src/shared/practice/labReceiveSoundPrefs.ts
 * - web/frontend/src/shared/hooks/useLabReceiveUnreadSound.ts
 * change-log:
 * - 2026-09-08: 미확인 도착 알림음 on/off 아이콘.
 */
import { useEffect, useState } from "react";
import { AlertCircle, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
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

export type LabReceiveUnreadNoticeItem = {
  id: string;
  label: string;
  unreadCount: number;
};

type LabReceiveUnreadNoticeProps = {
  unreadTotal: number;
  items?: readonly LabReceiveUnreadNoticeItem[];
  loadingMoreUnread?: boolean;
  onSelectItem?: (id: string) => void;
  className?: string;
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

export function LabReceiveUnreadNotice({
  unreadTotal,
  items = [],
  loadingMoreUnread = false,
  onSelectItem,
  className,
}: LabReceiveUnreadNoticeProps) {
  const total = Math.max(0, Number(unreadTotal || 0));
  const soundPrefs = useLabReceiveSoundPrefsState();
  if (total <= 0) return null;

  const loadedItems = items.filter(
    (item) => Math.max(0, Number(item.unreadCount || 0)) > 0,
  );

  let message = `미확인 ${total}건이 있습니다.`;
  if (loadingMoreUnread) {
    message += " 목록을 더 불러오는 중입니다.";
  }

  const soundEnabled = soundPrefs.enabled;
  const SoundIcon = soundEnabled ? Volume2 : VolumeX;
  const soundLabel = soundEnabled
    ? "미확인 의뢰 도착 알림 끄기"
    : "미확인 의뢰 도착 알림 켜기";

  return (
    <div
      className={cn(
        "flex shrink-0 flex-col gap-2 rounded-lg border border-red-200/90 bg-red-50/90 px-3 py-2 text-sm text-red-950",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex min-w-0 items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
        <p className="min-w-0 flex-1 font-medium leading-snug">{message}</p>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={cn(
                "h-8 w-8 shrink-0 p-0 text-red-800 hover:bg-red-100/80 hover:text-red-950",
                !soundEnabled && "text-red-800/55",
              )}
              aria-label={soundLabel}
              onClick={() => setLabReceiveSoundEnabled(!soundEnabled)}
            >
              <SoundIcon className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{soundLabel}</TooltipContent>
        </Tooltip>
      </div>
      {loadedItems.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {loadedItems.slice(0, 12).map((item) => {
            const unreadLabel =
              item.unreadCount > 99 ? "99+" : String(item.unreadCount);
            return (
              <button
                key={item.id}
                type="button"
                className="inline-flex max-w-full items-center gap-1 rounded-md border-[3px] border-double border-red-600 bg-white px-2 py-1 text-left text-[11px] leading-snug text-red-950 hover:bg-red-50"
                title={item.label}
                onClick={() => onSelectItem?.(item.id)}
              >
                <span className="min-w-0 truncate">{item.label}</span>
                <span
                  className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white"
                  aria-label={`안읽음 ${unreadLabel}`}
                >
                  {unreadLabel}
                </span>
              </button>
            );
          })}
          {loadedItems.length > 12 ? (
            <span className="self-center text-[11px] text-red-800/80">
              +{loadedItems.length - 12}건
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

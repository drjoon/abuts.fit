/**
 * 기공의뢰수신 — 미처리(작업큐)·미확인(채팅) 상단 안내 바.
 * 상태 필터·캘린더 스크롤과 무관하게 알려 작업시작·채팅 확인 누락을 막는다.
 *
 * related files:
 * - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
 * - web/frontend/src/shared/practice/labReceiveSoundPrefs.ts
 * - web/frontend/src/shared/hooks/useLabReceiveUnreadSound.ts
 * change-log:
 * - 2026-09-11: 미처리(작업큐)·미확인(채팅) 분리 안내.
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
  /** 미처리(작업큐) — 작업시작 전 등 */
  pendingWork?: boolean;
  /** 미확인(채팅) 안읽음 수 */
  chatUnread?: number;
  /** @deprecated pendingWork/chatUnread 사용 */
  unreadCount?: number;
};

type LabReceiveUnreadNoticeProps = {
  /** 미처리(작업큐) 건수 */
  pendingWorkTotal?: number;
  /** 미확인(채팅) 합 */
  chatUnreadTotal?: number;
  /** @deprecated pendingWorkTotal + chat 로 대체 */
  unreadTotal?: number;
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

const buildNoticeMessage = (
  pendingWork: number,
  chatUnread: number,
  loadingMore: boolean,
) => {
  let message = "";
  if (pendingWork > 0 && chatUnread > 0) {
    message = `미처리(작업큐) ${pendingWork}건 · 미확인(채팅) ${chatUnread}건이 있습니다.`;
  } else if (pendingWork > 0) {
    message = `미처리(작업큐) ${pendingWork}건이 있습니다. 작업시작 전까지 유지됩니다.`;
  } else if (chatUnread > 0) {
    message = `미확인(채팅) ${chatUnread}건이 있습니다.`;
  }
  if (loadingMore && message) message += " 목록을 더 불러오는 중입니다.";
  return message;
};

export function LabReceiveUnreadNotice({
  pendingWorkTotal,
  chatUnreadTotal,
  unreadTotal,
  items = [],
  loadingMoreUnread = false,
  onSelectItem,
  className,
}: LabReceiveUnreadNoticeProps) {
  const pendingWork = Math.max(
    0,
    Number(
      pendingWorkTotal != null
        ? pendingWorkTotal
        : Math.max(0, Number(unreadTotal || 0)),
    ),
  );
  const chatUnread = Math.max(0, Number(chatUnreadTotal || 0));
  const soundPrefs = useLabReceiveSoundPrefsState();
  if (pendingWork <= 0 && chatUnread <= 0) return null;

  const loadedItems = items.filter((item) => {
    const chat = Math.max(
      0,
      Number(item.chatUnread ?? item.unreadCount ?? 0),
    );
    return Boolean(item.pendingWork) || chat > 0;
  });

  const message = buildNoticeMessage(
    pendingWork,
    chatUnread,
    loadingMoreUnread,
  );

  const soundEnabled = soundPrefs.enabled;
  const SoundIcon = soundEnabled ? Volume2 : VolumeX;
  const soundLabel = soundEnabled
    ? "미처리·미확인 도착 알림 끄기"
    : "미처리·미확인 도착 알림 켜기";

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
            const chat = Math.max(
              0,
              Number(item.chatUnread ?? item.unreadCount ?? 0),
            );
            const pending = Boolean(item.pendingWork);
            const chatLabel = chat > 99 ? "99+" : String(chat);
            const kindLabel =
              pending && chat > 0
                ? "미처리·미확인"
                : pending
                  ? "미처리"
                  : "미확인";
            return (
              <button
                key={item.id}
                type="button"
                className="inline-flex max-w-full items-center gap-1 rounded-md border-[3px] border-double border-red-600 bg-white px-2 py-1 text-left text-[11px] leading-snug text-red-950 hover:bg-red-50"
                title={`${kindLabel} · ${item.label}`}
                onClick={() => onSelectItem?.(item.id)}
              >
                <span className="shrink-0 text-[10px] font-semibold text-red-700">
                  {kindLabel}
                </span>
                <span className="min-w-0 truncate">{item.label}</span>
                {chat > 0 ? (
                  <span
                    className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white"
                    aria-label={`미확인(채팅) ${chatLabel}`}
                  >
                    {chatLabel}
                  </span>
                ) : null}
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

/**
 * 기공의뢰수신 — 미처리(작업큐)·미확인(채팅) 상단 안내 바.
 * 상태 필터·캘린더 스크롤과 무관하게 알려 작업시작·채팅 확인 누락을 막는다.
 * 미처리는 1건만 노출 + 위/아래로 순회. 오른쪽 끝에 총 건수.
 *
 * related files:
 * - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
 * - web/frontend/src/shared/practice/labReceiveSoundPrefs.ts
 * - web/frontend/src/shared/practice/labReceivePendingWorkPriority.ts
 * - web/frontend/src/shared/hooks/useLabReceiveUnreadSound.ts
 * change-log:
 * - 2026-09-20: 메시지 칩 항상 표시·truncate — 헤더 남는 폭만큼 사용.
 * - 2026-09-20: xl 미만 — 칩 라벨 숨김(아이콘·건수·순회만).
 * - 2026-09-20: 1건 캐러셀 + 위/아래 순회·오른쪽 미처리 건수. 가로폭 확대.
 * - 2026-09-20: 기공의뢰수신 헤더 왼쪽(구 디자인SW·아노 자리)로 이동.
 * - 2026-09-11: 안내 문장 제거 — 칩·알림음만(수직 높이 축소).
 * - 2026-09-11: 미처리 칩 우선순위 최대 4건(왼쪽=1순위) + … .
 * - 2026-09-11: 미처리(작업큐)·미확인(채팅) 분리 안내.
 * - 2026-09-08: 미확인 도착 알림음 on/off 아이콘.
 */
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Volume2,
  VolumeX,
} from "lucide-react";
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

const buildNoticeAriaLabel = (
  pendingWork: number,
  chatUnread: number,
  loadingMore: boolean,
) => {
  const parts: string[] = [];
  if (pendingWork > 0) parts.push(`미처리(작업큐) ${pendingWork}건`);
  if (chatUnread > 0) parts.push(`미확인(채팅) ${chatUnread}건`);
  let label = parts.join(" · ");
  if (loadingMore && label) label += ". 목록을 더 불러오는 중입니다.";
  return label;
};

const itemChatUnread = (item: LabReceiveUnreadNoticeItem) =>
  Math.max(0, Number(item.chatUnread ?? item.unreadCount ?? 0));

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

  const { pendingItems, chatOnlyItems } = useMemo(() => {
    const pending: LabReceiveUnreadNoticeItem[] = [];
    const chatOnly: LabReceiveUnreadNoticeItem[] = [];
    for (const item of items) {
      const chat = itemChatUnread(item);
      if (item.pendingWork) pending.push(item);
      else if (chat > 0) chatOnly.push(item);
    }
    return { pendingItems: pending, chatOnlyItems: chatOnly };
  }, [items]);

  /** 미처리 우선. 없으면 미확인만 순회 */
  const cycleItems = useMemo(
    () => (pendingItems.length > 0 ? pendingItems : chatOnlyItems),
    [pendingItems, chatOnlyItems],
  );
  const cycleMode: "pending" | "chat" =
    pendingItems.length > 0 ? "pending" : "chat";

  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (cycleItems.length === 0) {
      setActiveId(null);
      return;
    }
    setActiveId((prev) => {
      if (prev && cycleItems.some((row) => row.id === prev)) return prev;
      return cycleItems[0]?.id ?? null;
    });
  }, [cycleItems]);

  const activeIndex = Math.max(
    0,
    cycleItems.findIndex((row) => row.id === activeId),
  );
  const activeItem = cycleItems[activeIndex] ?? cycleItems[0] ?? null;

  if (pendingWork <= 0 && chatUnread <= 0) return null;

  const ariaLabel = buildNoticeAriaLabel(
    pendingWork,
    chatUnread,
    loadingMoreUnread,
  );

  const soundEnabled = soundPrefs.enabled;
  const SoundIcon = soundEnabled ? Volume2 : VolumeX;
  const soundLabel = soundEnabled
    ? "미처리·미확인 도착 알림 끄기"
    : "미처리·미확인 도착 알림 켜기";

  const selectAt = (index: number) => {
    if (cycleItems.length === 0) return;
    const next =
      ((index % cycleItems.length) + cycleItems.length) % cycleItems.length;
    const item = cycleItems[next];
    if (!item) return;
    setActiveId(item.id);
    onSelectItem?.(item.id);
  };

  const kindLabelFor = (item: LabReceiveUnreadNoticeItem) => {
    const chat = itemChatUnread(item);
    if (item.pendingWork) return chat > 0 ? "미처리·미확인" : "미처리";
    return "미확인";
  };

  const displayCount =
    cycleMode === "pending"
      ? Math.max(pendingWork, pendingItems.length)
      : Math.max(chatOnlyItems.length, 1);
  const countLabel = displayCount > 99 ? "99+" : String(displayCount);
  const countAria =
    cycleMode === "pending"
      ? `미처리 ${displayCount}건`
      : `미확인 ${displayCount}건`;
  const canCycle = cycleItems.length > 1;
  const prevLabel =
    cycleMode === "pending" ? "이전 미처리" : "이전 미확인";
  const nextLabel =
    cycleMode === "pending" ? "다음 미처리" : "다음 미확인";

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1.5 rounded-lg border border-red-200/90 bg-red-50/90 px-2 py-1 text-sm text-red-950",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={ariaLabel || undefined}
    >
      <AlertCircle className="h-4 w-4 shrink-0 text-red-600" aria-hidden />
      {activeItem ? (
        <button
          type="button"
          className="inline-flex min-w-0 flex-1 items-center gap-1 rounded-md border-[3px] border-double border-red-600 bg-white px-2 py-1 text-left text-[11px] leading-snug text-red-950 hover:bg-red-50"
          title={`${kindLabelFor(activeItem)} · ${activeItem.label}`}
          onClick={() => onSelectItem?.(activeItem.id)}
        >
          <span className="shrink-0 text-[10px] font-semibold text-red-700">
            {kindLabelFor(activeItem)}
          </span>
          <span className="min-w-0 truncate">{activeItem.label}</span>
          {itemChatUnread(activeItem) > 0 ? (
            <span
              className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white"
              aria-label={`미확인(채팅) ${itemChatUnread(activeItem)}`}
            >
              {itemChatUnread(activeItem) > 99
                ? "99+"
                : String(itemChatUnread(activeItem))}
            </span>
          ) : null}
        </button>
      ) : (
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {ariaLabel}
        </span>
      )}
      {canCycle ? (
        <div className="flex shrink-0 flex-col">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-3.5 w-6 p-0 text-red-800 hover:bg-red-100/80 hover:text-red-950"
            aria-label={prevLabel}
            title={prevLabel}
            onClick={() => selectAt(activeIndex - 1)}
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-3.5 w-6 p-0 text-red-800 hover:bg-red-100/80 hover:text-red-950"
            aria-label={nextLabel}
            title={nextLabel}
            onClick={() => selectAt(activeIndex + 1)}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : null}
      <span
        className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-red-600 px-1.5 text-[11px] font-bold tabular-nums leading-none text-white"
        title={countAria}
        aria-label={countAria}
      >
        {countLabel}
      </span>
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
  );
}

/**
 * 기공의뢰수신 — 미확인 건 상단 안내 바 + 클릭 가능한 의뢰 칩.
 * 상태 필터·캘린더 스크롤과 무관하게 미확인을 항상 알려 수락 누락을 막는다.
 *
 * related files:
 * - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
 */
import { AlertCircle } from "lucide-react";
import { cn } from "@/shared/ui/cn";

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

export function LabReceiveUnreadNotice({
  unreadTotal,
  items = [],
  loadingMoreUnread = false,
  onSelectItem,
  className,
}: LabReceiveUnreadNoticeProps) {
  const total = Math.max(0, Number(unreadTotal || 0));
  if (total <= 0) return null;

  const loadedItems = items.filter(
    (item) => Math.max(0, Number(item.unreadCount || 0)) > 0,
  );

  let message = `미확인 ${total}건이 있습니다.`;
  if (loadingMoreUnread) {
    message += " 목록을 더 불러오는 중입니다.";
  }

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
        <p className="min-w-0 font-medium leading-snug">{message}</p>
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

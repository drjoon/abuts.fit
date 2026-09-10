/**
 * 치과 전체보기·기공의뢰수신 공통 — 상단 상태 뱃지 행.
 * 본문 숫자=해당 상태 전체 건수. 빨간 점=미확인(채팅).
 * 클릭=미확인·미처리 우선으로 해당 상태 건을 하나씩 연다.
 * 캘린더·목록 칩 빨간 숫자=미확인(채팅)만. 빨간 테두리=미처리(작업큐)만(채팅만은 테두리 없음).
 * 2026-09-11: 클릭 순회=상태 전 건(미확인·미처리 앞). 큐만 보면 열람 후 건 누락.
 * 2026-09-11: 헤더 본문=상태 건수(열람으로 0 되지 않음). 미처리·미확인은 테두리/숫자·안내 바로.
 * 2026-09-10: 표시 on/off·「기본」리셋 제거.
 * 2026-09-03: trailing — 어벗츠 생산중 등. 정책 안내는 사이드바.
 * 2026-08-27: 발송 뒤 리메이크·미확인 간격. 미확인 전용 뱃지용 nested unread 숨김.
 *
 * related files:
 * - web/frontend/src/pages/practice/components/PracticeRecentTransfersAllModal.tsx
 * - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
 * - web/frontend/src/shared/practice/practiceStatusBadgeReviewQueue.ts
 * - web/frontend/src/pages/practice/components/PracticeRecentTransfersCalendar.tsx
 */
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";
import {
  PRACTICE_STATUS_FILTER_BADGE_CLASS,
  type PracticeCalendarStatusTone,
} from "@/pages/practice/components/PracticeRecentTransfersCalendar";

export type PracticeStatusFilterBadgeItem = {
  key: string;
  label: string;
  tone: PracticeCalendarStatusTone;
  /** 해당 상태 전체 건수 — 본문 숫자 */
  count: number;
  /** 미확인(채팅) — 빨간 카운터 */
  unreadCount?: number;
  /** 상태 의미 설명(클릭 안내 문구는 컴포넌트가 앞에 붙임) */
  tooltip?: string;
};

type PracticeStatusFilterBadgesProps = {
  items: readonly PracticeStatusFilterBadgeItem[];
  /** 해당 상태 의뢰를 하나씩 연다(안읽음 우선). */
  onUnreadNavigate: (key: string) => void;
  /** 건수 뒤 접미사. 치과 모달="", 기공의뢰수신="건" */
  countSuffix?: string;
  /** 이 키들 앞에 간격(발송 | 리메이크·미확인 / 완료 | 어벗) */
  gapBeforeKeys?: readonly string[];
  /** 뱃지 행 끝 액션(정책 안내·진행중 등) */
  trailing?: ReactNode;
  /** true면 뱃지 안 빨간 unread 점 숨김(전용 미확인 뱃지 쓸 때) */
  hideNestedUnread?: boolean;
  compact?: boolean;
  className?: string;
};

export function PracticeStatusFilterBadges({
  items,
  onUnreadNavigate,
  countSuffix = "",
  gapBeforeKeys,
  trailing,
  hideNestedUnread = false,
  compact = false,
  className,
}: PracticeStatusFilterBadgesProps) {
  const gapKeySet = new Set(gapBeforeKeys || []);
  return (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-2",
        className,
      )}
      role="group"
      aria-label="상태별 의뢰 건수"
    >
      {items.map((item) => {
        const queueCount = Math.max(0, Number(item.count || 0));
        const chatUnread = hideNestedUnread
          ? 0
          : Math.max(0, Number(item.unreadCount || 0));
        const canNavigate = queueCount > 0 || chatUnread > 0;
        const countLabel = `${queueCount}${countSuffix}`;
        const actionHint = !canNavigate
          ? "확인할 의뢰 없음"
          : chatUnread > 0 && queueCount > 0
            ? `미확인(채팅) ${chatUnread} · ${item.label} ${countLabel} 찾아가기`
            : chatUnread > 0
              ? `미확인(채팅) ${chatUnread} 찾아가기`
              : `${item.label} ${countLabel} 찾아가기`;
        const tooltipBody = item.tooltip
          ? `${actionHint}. ${item.tooltip}`
          : actionHint;
        const withGap = gapKeySet.has(item.key);

        return (
          <Tooltip key={item.key}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={cn(
                  "relative shrink-0 rounded-full",
                  withGap && "ml-3",
                  !canNavigate && "cursor-default",
                )}
                onClick={() => {
                  if (!canNavigate) return;
                  onUnreadNavigate(item.key);
                }}
                aria-disabled={!canNavigate}
                aria-label={`${item.label} ${countLabel}, ${actionHint}`}
              >
                <Badge
                  variant="outline"
                  className={cn(
                    "whitespace-nowrap",
                    canNavigate ? "cursor-pointer" : "cursor-default opacity-50",
                    compact && "h-8 px-2.5 text-xs",
                    PRACTICE_STATUS_FILTER_BADGE_CLASS[item.tone].active,
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {item.label} {countLabel}
                    {chatUnread > 0 ? (
                      <span
                        className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground"
                        aria-hidden
                      >
                        {chatUnread > 99 ? "99+" : chatUnread}
                      </span>
                    ) : null}
                  </span>
                </Badge>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs leading-relaxed">
              {tooltipBody}
            </TooltipContent>
          </Tooltip>
        );
      })}
      {trailing}
    </div>
  );
}

/**
 * 치과 전체보기·기공의뢰수신 공통 — 상단 상태 표시 on/off 뱃지 행.
 * 뱃지 + 기본값과 다를 때 「기본」 리셋.
 * 2026-09-03: trailing — 어벗츠 생산중 등(리셋 버튼 앞). 정책 안내는 사이드바.
 * 2026-08-21: 배타 필터 → 다중 표시 on/off. ON/OFF 대비·기본 리셋.
 * 2026-08-21: 「표시」 라벨 제거.
 * 2026-08-27: 발송 뒤 리메이크·미확인 간격. 미확인 전용 뱃지용 nested unread 숨김.
 *
 * related files:
 * - web/frontend/src/pages/practice/components/PracticeRecentTransfersAllModal.tsx
 * - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
 * - web/frontend/src/pages/practice/components/PracticeRecentTransfersCalendar.tsx
 * - web/frontend/src/pages/requestor/new_request/components/RequestorAbutmentPageHeader.tsx
 */
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  count: number;
  unreadCount?: number;
  /** 상태 의미 설명(표시/숨김 문구는 컴포넌트가 앞에 붙임) */
  tooltip?: string;
};

type PracticeStatusFilterBadgesProps = {
  items: readonly PracticeStatusFilterBadgeItem[];
  activeKeys: ReadonlySet<string>;
  onToggle: (key: string) => void;
  onResetToDefault: () => void;
  isDefault: boolean;
  /** 건수 뒤 접미사. 치과 모달="", 기공의뢰수신="건" */
  countSuffix?: string;
  /** 이 키들 앞에 간격(발송 | 리메이크·미확인 / 완료 | 어벗) */
  gapBeforeKeys?: readonly string[];
  /** 뱃지 행 끝·「기본」 앞에 붙는 액션(정책 안내·진행중 등) */
  trailing?: ReactNode;
  /** true면 뱃지 안 빨간 unread 점 숨김(전용 미확인 뱃지 쓸 때) */
  hideNestedUnread?: boolean;
  compact?: boolean;
  className?: string;
};

export function PracticeStatusFilterBadges({
  items,
  activeKeys,
  onToggle,
  onResetToDefault,
  isDefault,
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
      aria-label="캘린더 표시 상태"
    >
      {items.map((item) => {
        const active = activeKeys.has(item.key);
        const unread = hideNestedUnread
          ? 0
          : Math.max(0, Number(item.unreadCount || 0));
        const countLabel = `${item.count}${countSuffix}`;
        const actionHint = active
          ? "캘린더에서 숨기기"
          : "캘린더에 표시하기";
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
                )}
                onClick={() => onToggle(item.key)}
                aria-pressed={active}
                aria-label={
                  unread > 0
                    ? `${item.label} ${countLabel}, 안읽음 ${unread}건, ${actionHint}`
                    : `${item.label} ${countLabel}, ${actionHint}`
                }
              >
                <Badge
                  variant="outline"
                  className={cn(
                    "cursor-pointer whitespace-nowrap",
                    compact && "h-8 px-2.5 text-xs",
                    PRACTICE_STATUS_FILTER_BADGE_CLASS[item.tone][
                      active ? "active" : "idle"
                    ],
                  )}
                >
                  <span className="inline-flex items-center gap-1">
                    {item.label} {countLabel}
                    {unread > 0 ? (
                      <span
                        className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground"
                        aria-hidden
                      >
                        {unread > 99 ? "99+" : unread}
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
      {!isDefault ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground",
            compact && "h-8",
          )}
          onClick={onResetToDefault}
        >
          기본
        </Button>
      ) : null}
    </div>
  );
}

/** 전부 off일 때 캘린더/목록 위 안내. */
export function PracticeStatusFilterEmptyHint({
  onResetToDefault,
  className,
}: {
  onResetToDefault: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-muted-foreground",
        className,
      )}
    >
      <span>표시할 상태를 선택하세요</span>
      <button
        type="button"
        className="font-medium text-sky-700 underline-offset-2 hover:underline"
        onClick={onResetToDefault}
      >
        기본
      </button>
    </div>
  );
}

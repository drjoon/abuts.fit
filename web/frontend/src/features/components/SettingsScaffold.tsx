// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// change-log:
// - 2026-08-24: 작업영역 하단 여백 — 이중 그라데이션/패딩 제거, pb만 유지(레이아웃 스크롤 끝과 맞춤).
// - 2026-08-11: tabsMaxClassName — 탭 바만 문의 페이지처럼 max-w-4xl·상단 고정, 콘텐츠는 별도 max-width.
// - 2026-08-11: fillHeight — 대시보드 작업영역 높이를 채우고 탭 콘텐츠 스크롤/중앙 배치 제어.
// - 2026-08-11: fillHeight 시 이중 배경·패딩 제거(작업영역 흰 카드 기준).
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/shared/ui/cn";

import type { ComponentType, ReactNode } from "react";

export type SettingsTabDef = {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  content: ReactNode;
  disabled?: boolean;
  disabledHint?: string;
  /** 탭 라벨 옆 배지(예: 검토 대기 건수) */
  badgeCount?: number;
};

type Props = {
  tabs: SettingsTabDef[];
  activeTab: string;
  onTabChange: (next: string) => void;
  highlightTabKey?: string;
  /** 기본: max-w-4xl. 정산 등 넓은 표 UI는 max-w-6xl 등 전달. */
  contentMaxClassName?: string;
  /** 탭 바 max-width. 미지정 시 contentMaxClassName과 동일(문의 페이지는 max-w-4xl). */
  tabsMaxClassName?: string;
  /** 탭 바 오른쪽(예: 데모 뱃지). */
  tabsTrailing?: ReactNode;
  /**
   * true면 min-h-screen 대신 부모 높이를 채움(대시보드 outlet).
   * 탭 콘텐츠 영역이 flex-1이 되어 스크롤/중앙 배치를 탭별로 제어 가능.
   */
  fillHeight?: boolean;
};

export const SettingsScaffold = ({
  tabs,
  activeTab,
  onTabChange,
  highlightTabKey,
  contentMaxClassName = "max-w-4xl",
  tabsMaxClassName,
  tabsTrailing,
  fillHeight = false,
}: Props) => {
  const resolvedTabsMax = tabsMaxClassName ?? contentMaxClassName;

  const tabTriggers = tabs.map((t) => {
    const trigger = (
      <TabsTrigger
        value={t.key}
        disabled={Boolean(t.disabled)}
        className={cn(
          "flex min-w-[6.75rem] shrink-0 basis-auto items-center justify-center gap-1.5 px-2 py-2.5 text-sm sm:min-w-[96px] sm:shrink sm:flex-1 sm:basis-0 sm:gap-2 sm:px-3",
          highlightTabKey === t.key &&
            "ring-2 ring-primary/60 shadow-[0_10px_40px_rgba(14,92,228,0.18)]",
          t.disabled && "pointer-events-none opacity-50",
        )}
      >
        <t.icon className="h-4 w-4" />
        {t.label}
        {Number(t.badgeCount || 0) > 0 ? (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold text-white">
            {Number(t.badgeCount) > 99 ? "99+" : Number(t.badgeCount)}
          </span>
        ) : null}
      </TabsTrigger>
    );

    if (!t.disabled || !t.disabledHint) {
      return <span key={t.key} className="contents">{trigger}</span>;
    }

    return (
      <Tooltip key={t.key}>
        <TooltipTrigger asChild>
          <span className="inline-flex min-w-[7.5rem] shrink-0 cursor-not-allowed sm:min-w-[96px] sm:flex-1 sm:basis-0">
            {trigger}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs text-center">
          <p>{t.disabledHint}</p>
        </TooltipContent>
      </Tooltip>
    );
  });

  const tabContents = tabs.map((t) => (
    <TabsContent
      key={t.key}
      value={t.key}
      className={cn(
        fillHeight &&
          "mt-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden",
      )}
    >
      {t.disabled ? null : t.content}
    </TabsContent>
  ));

  return (
    <div
      className={cn(
        fillHeight
          ? "box-border flex h-full min-h-0 flex-col overflow-hidden"
          : // 대시보드 흰 카드 안 — 이중 그라데이션 없이 하단 pb만 (스크롤 끝에 여백)
            "min-h-full pb-8 sm:pb-12",
      )}
    >
      <TooltipProvider>
        <Tabs
          value={activeTab}
          onValueChange={(next) => {
            const tab = tabs.find((t) => t.key === next);
            if (tab?.disabled) return;
            onTabChange(next);
          }}
          className={cn(
            "mx-auto w-full",
            fillHeight
              ? "flex min-h-0 flex-1 flex-col justify-start gap-3 sm:gap-4"
              : cn("space-y-4", resolvedTabsMax),
          )}
        >
          <div
            className={cn(
              "mx-auto w-full min-w-0",
              fillHeight ? cn("shrink-0", resolvedTabsMax) : "contents",
            )}
          >
            <div
              className={cn(
                "flex min-w-0 items-start gap-2",
                tabsTrailing ? "sm:items-center" : null,
              )}
            >
              {/* 모바일: 탭이 넘치면 수평 스크롤. 좌우 패딩으로 첫/끝 탭이 잘리지 않게. */}
              <div className="min-w-0 flex-1 overscroll-x-contain scroll-pl-1 scroll-pr-1 px-1 scroll-x-bar-top sm:overflow-visible sm:px-0 sm:[transform:none] sm:[&>*]:[transform:none]">
                <TabsList
                  className={cn(
                    "inline-flex h-auto min-w-full w-max max-w-none justify-start gap-1.5 p-1.5 sm:flex sm:w-full sm:flex-wrap sm:justify-center",
                  )}
                >
                  {tabTriggers}
                </TabsList>
              </div>
              {tabsTrailing ? (
                <div className="flex shrink-0 items-center self-center pr-1 sm:pr-0">
                  {tabsTrailing}
                </div>
              ) : null}
            </div>
          </div>

          <div
            className={cn(
              "mx-auto w-full",
              fillHeight
                ? cn("flex min-h-0 flex-1 flex-col", contentMaxClassName)
                : "contents",
            )}
          >
            {tabContents}
          </div>
        </Tabs>
      </TooltipProvider>
    </div>
  );
};

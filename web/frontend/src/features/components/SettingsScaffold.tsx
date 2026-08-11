// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// change-log:
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
};

type Props = {
  tabs: SettingsTabDef[];
  activeTab: string;
  onTabChange: (next: string) => void;
  highlightTabKey?: string;
  /** 기본: max-w-4xl. 정산 등 넓은 표 UI는 max-w-6xl 등 전달. */
  contentMaxClassName?: string;
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
  fillHeight = false,
}: Props) => {
  return (
    <div
      className={cn(
        fillHeight
          ? "box-border flex h-full min-h-0 flex-col overflow-hidden"
          : "min-h-screen bg-gradient-subtle p-4",
      )}
    >
      <div
        className={cn(
          "mx-auto w-full",
          fillHeight ? "flex min-h-0 flex-1 flex-col" : "space-y-4",
          contentMaxClassName,
        )}
      >
        <TooltipProvider delayDuration={200}>
          <Tabs
            value={activeTab}
            onValueChange={(next) => {
              const tab = tabs.find((t) => t.key === next);
              if (tab?.disabled) return;
              onTabChange(next);
            }}
            className={cn(
              fillHeight ? "flex min-h-0 flex-1 flex-col gap-4" : "space-y-4",
            )}
          >
            <TabsList
              className={cn(
                "flex h-auto w-full flex-wrap gap-1.5",
                "px-1.5 py-1.5",
                fillHeight && "shrink-0",
              )}
            >
              {tabs.map((t) => {
                const trigger = (
                  <TabsTrigger
                    value={t.key}
                    disabled={Boolean(t.disabled)}
                    className={cn(
                      "flex min-w-[96px] flex-1 basis-0 items-center justify-center gap-2 px-3 py-2.5",
                      highlightTabKey === t.key &&
                        "ring-2 ring-primary/60 shadow-[0_10px_40px_rgba(14,92,228,0.18)]",
                      t.disabled && "pointer-events-none opacity-50",
                    )}
                  >
                    <t.icon className="h-4 w-4" />
                    {t.label}
                  </TabsTrigger>
                );

                if (!t.disabled || !t.disabledHint) {
                  return <span key={t.key} className="contents">{trigger}</span>;
                }

                return (
                  <Tooltip key={t.key}>
                    <TooltipTrigger asChild>
                      <span className="inline-flex min-w-[96px] flex-1 basis-0 cursor-not-allowed">
                        {trigger}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs text-center">
                      <p>{t.disabledHint}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </TabsList>

            {tabs.map((t) => (
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
            ))}
          </Tabs>
        </TooltipProvider>
      </div>
    </div>
  );
};

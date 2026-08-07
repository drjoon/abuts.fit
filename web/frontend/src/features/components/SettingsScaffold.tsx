// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
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
};

export const SettingsScaffold = ({
  tabs,
  activeTab,
  onTabChange,
  highlightTabKey,
}: Props) => {
  return (
    <div className="min-h-screen bg-gradient-subtle p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <TooltipProvider delayDuration={200}>
          <Tabs
            value={activeTab}
            onValueChange={(next) => {
              const tab = tabs.find((t) => t.key === next);
              if (tab?.disabled) return;
              onTabChange(next);
            }}
            className="space-y-4"
          >
            <TabsList
              className={cn(
                "flex w-full flex-nowrap gap-1.5 overflow-x-auto",
                "py-1",
              )}
            >
              {tabs.map((t) => {
                const trigger = (
                  <TabsTrigger
                    value={t.key}
                    disabled={Boolean(t.disabled)}
                    className={cn(
                      "flex min-w-[110px] flex-1 basis-0 items-center justify-center gap-2",
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
                      <span className="inline-flex min-w-[110px] flex-1 basis-0 cursor-not-allowed">
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
              <TabsContent key={t.key} value={t.key}>
                {t.disabled ? null : t.content}
              </TabsContent>
            ))}
          </Tabs>
        </TooltipProvider>
      </div>
    </div>
  );
};

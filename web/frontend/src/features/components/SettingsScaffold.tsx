import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import type { ComponentType, ReactNode } from "react";

export type SettingsTabDef = {
  key: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  content: ReactNode;
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
  const totalTabs = tabs.length;

  return (
    <div className="min-h-screen bg-gradient-subtle p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        <Tabs
          value={activeTab}
          onValueChange={onTabChange}
          className="space-y-4"
        >
          <TabsList
            className={cn(
              "flex w-full flex-nowrap gap-1.5 overflow-x-auto",
              "py-1",
            )}
          >
            {tabs.map((t) => (
              <TabsTrigger
                key={t.key}
                value={t.key}
                className={cn(
                  "flex min-w-[110px] flex-1 basis-0 items-center justify-center gap-2",
                  highlightTabKey === t.key &&
                    "ring-2 ring-primary/60 shadow-[0_10px_40px_rgba(14,92,228,0.18)]",
                )}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {tabs.map((t) => (
            <TabsContent key={t.key} value={t.key}>
              {t.content}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
};

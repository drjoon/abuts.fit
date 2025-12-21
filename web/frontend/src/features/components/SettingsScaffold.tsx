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
    <div className="min-h-screen bg-gradient-subtle p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <Tabs
          value={activeTab}
          onValueChange={onTabChange}
          className="space-y-6"
        >
          <TabsList
            className={cn(
              "grid w-full",
              totalTabs === 1 && "grid-cols-1",
              totalTabs === 2 && "grid-cols-2",
              totalTabs === 3 && "grid-cols-3",
              totalTabs === 4 && "grid-cols-4",
              totalTabs === 5 && "grid-cols-5",
              totalTabs === 6 && "grid-cols-6"
            )}
          >
            {tabs.map((t) => (
              <TabsTrigger
                key={t.key}
                value={t.key}
                className={cn(
                  "flex items-center gap-2",
                  highlightTabKey === t.key &&
                    "ring-2 ring-primary/60 shadow-[0_10px_40px_rgba(14,92,228,0.18)]"
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

// change-log:
// - 2026-08-15: 사이드바 상단 익스프레스↔엑스퍼트 모드 전환 버튼
// related files:
// - web/frontend/src/store/useWorkspaceModeStore.ts
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { Gauge, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useWorkspaceModeStore,
  WORKSPACE_MODE_LABEL,
} from "@/store/useWorkspaceModeStore";

type WorkspaceModeSwitchProps = {
  collapsed?: boolean;
};

export const WorkspaceModeSwitch = ({
  collapsed = false,
}: WorkspaceModeSwitchProps) => {
  const mode = useWorkspaceModeStore((s) => s.mode);
  const toggleMode = useWorkspaceModeStore((s) => s.toggleMode);
  const label = WORKSPACE_MODE_LABEL[mode];
  const nextLabel =
    WORKSPACE_MODE_LABEL[mode === "express" ? "expert" : "express"];
  const Icon = mode === "express" ? Zap : Gauge;

  const button = (
    <Button
      type="button"
      variant="outline"
      className={`w-full h-9 lg:h-10 gap-1.5 text-xs lg:text-sm font-medium border-border/80 bg-muted/40 text-foreground hover:bg-muted hover:text-foreground ${
        collapsed ? "justify-center px-2" : "justify-start px-3"
      }`}
      onClick={toggleMode}
      aria-label={`${label} — 클릭 시 ${nextLabel}로 전환`}
    >
      <Icon className="h-3.5 w-3.5 flex-shrink-0 text-accent-strong" />
      {!collapsed && <span className="truncate">{label}</span>}
    </Button>
  );

  if (!collapsed) {
    return (
      <div className="px-3 lg:px-4 pt-3 lg:pt-4 pb-1">
        {button}
      </div>
    );
  }

  return (
    <div className="px-3 lg:px-4 pt-3 lg:pt-4 pb-1 flex justify-center">
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side="right">
            <p>{label}</p>
            <p className="text-muted-foreground text-xs">
              클릭 시 {nextLabel}로 전환
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};

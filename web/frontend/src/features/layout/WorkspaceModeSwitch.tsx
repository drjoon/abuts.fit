// change-log:
// - 2026-08-15: 계정(개인) preferences.workspaceMode 서버 저장. 기본 익스프레스
// - 2026-08-15: 사이드바 → 치과 기공의뢰 카드용으로 단순화(중앙 정렬·툴팁)
// - 2026-08-15: 전환 안내는 툴팁, 버튼 라벨 중앙 정렬
// - 2026-08-15: 모드 버튼 아래에 전환 안내 문구 추가
// - 2026-08-15: 사이드바 상단 익스프레스↔엑스퍼트 모드 전환 버튼
// related files:
// - web/frontend/src/shared/workspace/workspaceMode.ts
// - web/frontend/src/store/useAuthStore.ts
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/backend/controllers/users/user.controller.js
import { Gauge, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiFetch } from "@/shared/api/apiClient";
import {
  DEFAULT_WORKSPACE_MODE,
  normalizeWorkspaceMode,
  WORKSPACE_MODE_LABEL,
  type WorkspaceMode,
} from "@/shared/workspace/workspaceMode";
import { useAuthStore } from "@/store/useAuthStore";
import { cn } from "@/shared/ui/cn";

type WorkspaceModeSwitchProps = {
  className?: string;
};

export const WorkspaceModeSwitch = ({
  className,
}: WorkspaceModeSwitchProps) => {
  const token = useAuthStore((s) => s.token);
  const workspaceMode = useAuthStore((s) => s.user?.workspaceMode);
  const setWorkspaceMode = useAuthStore((s) => s.setWorkspaceMode);
  const mode = normalizeWorkspaceMode(workspaceMode ?? DEFAULT_WORKSPACE_MODE);
  const label = WORKSPACE_MODE_LABEL[mode];
  const nextMode: WorkspaceMode = mode === "express" ? "expert" : "express";
  const nextLabel = WORKSPACE_MODE_LABEL[nextMode];
  const hint = `클릭시 ${nextLabel}로 전환`;
  const Icon = mode === "express" ? Zap : Gauge;

  const handleToggle = () => {
    setWorkspaceMode(nextMode);
    if (!token) return;
    void apiFetch({
      path: "/api/users/workspace-mode",
      method: "PUT",
      token,
      jsonBody: { mode: nextMode },
    }).catch(() => {
      // 저장 실패는 UX를 막지 않음 — 다음 로그인 시 서버 값으로 복원
    });
  };

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              "h-9 justify-center gap-1.5 px-3 text-xs font-medium border-border/80 bg-muted/40 text-foreground hover:bg-muted hover:text-foreground",
              className,
            )}
            onClick={handleToggle}
            aria-label={`${label} — ${hint}`}
          >
            <Icon className="h-3.5 w-3.5 flex-shrink-0 text-accent-strong" />
            <span className="truncate">{label}</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>{hint}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

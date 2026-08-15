// change-log:
// - 2026-08-15: 계정(개인) 단위 workspaceMode SSOT. 기본값 expert
// related files:
// - web/backend/utils/workspaceMode.util.js
// - web/frontend/src/store/useAuthStore.ts
// - web/frontend/src/features/layout/WorkspaceModeSwitch.tsx

export type WorkspaceMode = "express" | "expert";

export const DEFAULT_WORKSPACE_MODE: WorkspaceMode = "expert";

export const WORKSPACE_MODE_LABEL: Record<WorkspaceMode, string> = {
  express: "익스프레스 모드",
  expert: "엑스퍼트 모드",
};

export const normalizeWorkspaceMode = (raw: unknown): WorkspaceMode => {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  if (value === "express" || value === "expert") return value;
  return DEFAULT_WORKSPACE_MODE;
};

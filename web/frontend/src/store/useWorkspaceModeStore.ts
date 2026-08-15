// change-log:
// - 2026-08-15: 사이드바 익스프레스/엑스퍼트 워크스페이스 모드 토글
// related files:
// - web/frontend/src/features/layout/WorkspaceModeSwitch.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WorkspaceMode = "express" | "expert";

export const WORKSPACE_MODE_LABEL: Record<WorkspaceMode, string> = {
  express: "익스프레스 모드",
  expert: "엑스퍼트 모드",
};

const isWorkspaceMode = (value: unknown): value is WorkspaceMode =>
  value === "express" || value === "expert";

interface WorkspaceModeState {
  mode: WorkspaceMode;
  setMode: (mode: WorkspaceMode) => void;
  toggleMode: () => void;
}

export const useWorkspaceModeStore = create<WorkspaceModeState>()(
  persist(
    (set, get) => ({
      mode: "express",
      setMode: (mode) => set({ mode }),
      toggleMode: () =>
        set({ mode: get().mode === "express" ? "expert" : "express" }),
    }),
    {
      name: "abuts.workspace-mode",
      partialize: (state) => ({ mode: state.mode }),
      merge: (persisted, current) => {
        const raw = (persisted || {}) as Partial<WorkspaceModeState>;
        return {
          ...current,
          mode: isWorkspaceMode(raw.mode) ? raw.mode : current.mode,
        };
      },
    },
  ),
);

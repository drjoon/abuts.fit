// related files:
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/admin/AdminSettingsHubPage.tsx
// - web/frontend/src/pages/admin/system/AdminPlatformSettingsPage.tsx
// change-log:
// - 2026-09-18: 기본 기공수가 검토 대기 — Layout·설정 허브 공유.
import { create } from "zustand";

type AdminAbutsFeePendingState = {
  count: number;
  setCount: (count: number) => void;
  bump: (delta?: number) => void;
};

export const useAdminAbutsFeePendingStore = create<AdminAbutsFeePendingState>(
  (set) => ({
    count: 0,
    setCount: (count) =>
      set({ count: Math.max(0, Number.isFinite(count) ? count : 0) }),
    bump: (delta = 1) =>
      set((state) => ({
        count: Math.max(0, state.count + (Number(delta) || 0)),
      })),
  }),
);

// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// moved from pages/manufacturer/cncDashboard/hooks/useCncDashboardQueues.ts
// NOTE: logic unchanged, only path/imports adjusted
// moved from pages/manufacturer/cncDashboard/hooks/useCncDashboardQueues.ts
// NOTE: logic is still defined in the original file; this feature-level hook
// simply re-exports it so that domain hooks live under `features/` while we
// keep a single source of truth.

export { useCncDashboardQueues } from "@/pages/manufacturer/equipment/cnc/hooks/useCncDashboardQueues";

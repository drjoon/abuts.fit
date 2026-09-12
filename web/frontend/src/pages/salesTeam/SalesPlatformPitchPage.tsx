// related files:
// - web/frontend/src/shared/sales/PlatformPitchPanel.tsx
// - web/frontend/src/pages/salesTeam/salesUi.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { PlatformPitchPanel } from "@/shared/sales/PlatformPitchPanel";
import { SalesPageShell } from "./salesUi";

export default function SalesPlatformPitchPage() {
  return (
    <SalesPageShell wide>
      <PlatformPitchPanel
        apiPath="/api/sales-team/platform-pitch"
        queryKey="sales-team-platform-pitch"
      />
    </SalesPageShell>
  );
}

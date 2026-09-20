// related files:
// - web/frontend/src/shared/sales/PlatformPitchPanel.tsx
// - web/frontend/src/pages/salesTeam/salesUi.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { PlatformPitchPanel } from "@/shared/sales/PlatformPitchPanel";
import { useAuthStore } from "@/store/useAuthStore";
import { SalesPageShell } from "./salesUi";

export default function SalesPlatformPitchPage() {
  const role = useAuthStore((s) => s.user?.role);
  const isSalesman = role === "salesman";
  return (
    <SalesPageShell wide>
      <PlatformPitchPanel
        apiPath={
          isSalesman
            ? "/api/salesman/platform-pitch"
            : "/api/sales-team/platform-pitch"
        }
        queryKey={
          isSalesman ? "salesman-platform-pitch" : "sales-team-platform-pitch"
        }
      />
    </SalesPageShell>
  );
}

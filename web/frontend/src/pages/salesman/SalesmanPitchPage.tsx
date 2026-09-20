// related files:
// - web/frontend/src/shared/sales/PlatformPitchPanel.tsx
// - web/frontend/src/pages/salesTeam/SalesPlatformPitchPage.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { PlatformPitchPanel } from "@/shared/sales/PlatformPitchPanel";

/** 딜러사 고객 피치(치과·기공소 대면용). */
export default function SalesmanPitchPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-3 pb-16 pt-3 sm:px-4 sm:pb-10 lg:pb-8">
      <header className="border-b border-slate-200/70 pb-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
          소개·피치
        </h1>
      </header>
      <PlatformPitchPanel
        apiPath="/api/salesman/platform-pitch"
        queryKey="salesman-platform-pitch"
      />
    </div>
  );
}

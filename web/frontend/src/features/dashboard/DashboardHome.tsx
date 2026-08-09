import { useAuthStore } from "@/store/useAuthStore";
import { RequestorDashboardPage } from "@/pages/requestor/dashboard/RequestorDashboardPage";
import { AdminDashboardPage } from "@/pages/admin/dashboard/AdminDashboardPage";
import { SalesmanDashboardPage } from "@/pages/salesman/SalesmanDashboardPage";
import { DevopsDashboardPage } from "@/pages/devops/DevopsDashboardPage";
import { PracticeFileTransferPage } from "@/pages/practice/PracticeFileTransferPage";
import { Navigate } from "react-router-dom";
import { BusinessPaidAccessGate } from "@/shared/business/BusinessPaidAccessGate";
import {
  getRoleDefaultDashboardPath,
  normalizeLastDashboardPath,
} from "@/shared/navigation/lastDashboardPath";

// related files:
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/navigation/lastDashboardPath.ts

export const DashboardHome = () => {
  const { user } = useAuthStore();

  if (!user) return null;

  if (user.role === "practice") {
    return <PracticeFileTransferPage />;
  }

  if (user.role === "requestor") {
    return (
      <BusinessPaidAccessGate>
        <RequestorDashboardPage />
      </BusinessPaidAccessGate>
    );
  }

  if (user.role === "manufacturer") {
    const last = normalizeLastDashboardPath(user.lastDashboardPath);
    const target =
      last && last !== "/dashboard"
        ? last
        : getRoleDefaultDashboardPath("manufacturer");
    return <Navigate to={target} replace />;
  }

  if (user.role === "salesman") {
    return <SalesmanDashboardPage />;
  }

  if (user.role === "devops") {
    return <DevopsDashboardPage />;
  }

  return <AdminDashboardPage />;
};

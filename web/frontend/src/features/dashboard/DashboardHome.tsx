import { useAuthStore } from "@/store/useAuthStore";
import { RequestorDashboardPage } from "@/pages/requestor/dashboard/RequestorDashboardPage";
import { AdminDashboardPage } from "@/pages/admin/dashboard/AdminDashboardPage";
import { SalesmanDashboardPage } from "@/pages/salesman/SalesmanDashboardPage";
import { DevopsDashboardPage } from "@/pages/devops/DevopsDashboardPage";
import { PracticeDashboardPage } from "@/pages/practice/PracticeDashboardPage";
import { Navigate } from "react-router-dom";

// related files:
// - web/frontend/src/pages/practice/PracticeDashboardPage.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx

export const DashboardHome = () => {
  const { user } = useAuthStore();

  if (!user) return null;

  if (user.isPracticeAccount || user.role === "practice") {
    return <PracticeDashboardPage />;
  }

  if (user.role === "requestor") {
    return <RequestorDashboardPage />;
  }

  if (user.role === "manufacturer") {
    return <Navigate to="/dashboard/worksheet" replace />;
  }

  if (user.role === "salesman") {
    return <SalesmanDashboardPage />;
  }

  if (user.role === "devops") {
    return <DevopsDashboardPage />;
  }

  return <AdminDashboardPage />;
};

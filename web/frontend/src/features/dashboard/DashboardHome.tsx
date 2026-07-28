import { useAuthStore } from "@/store/useAuthStore";
import { RequestorDashboardPage } from "@/pages/requestor/dashboard/RequestorDashboardPage";
import { AdminDashboardPage } from "@/pages/admin/dashboard/AdminDashboardPage";
import { SalesmanDashboardPage } from "@/pages/salesman/SalesmanDashboardPage";
import { DevopsDashboardPage } from "@/pages/devops/DevopsDashboardPage";
import { PracticeFileTransferPage } from "@/pages/practice/PracticeFileTransferPage";
import { Navigate } from "react-router-dom";

// related files:
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx

export const DashboardHome = () => {
  const { user } = useAuthStore();

  if (!user) return null;

  if (user.role === "practice") {
    return <PracticeFileTransferPage />;
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

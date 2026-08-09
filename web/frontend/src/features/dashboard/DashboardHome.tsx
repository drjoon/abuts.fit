import { useAuthStore } from "@/store/useAuthStore";
import { RequestorDashboardPage } from "@/pages/requestor/dashboard/RequestorDashboardPage";
import { AdminDashboardPage } from "@/pages/admin/dashboard/AdminDashboardPage";
import { SalesmanDashboardPage } from "@/pages/salesman/SalesmanDashboardPage";
import { DevopsDashboardPage } from "@/pages/devops/DevopsDashboardPage";
import { Navigate } from "react-router-dom";
import { BusinessPaidAccessGate } from "@/shared/business/BusinessPaidAccessGate";
import { resolveEntryDashboardPath } from "@/shared/navigation/lastDashboardPath";

// change-log:
// - 2026-08-09: 모든 role에서 /dashboard 허브가 lastDashboardPath(없으면 역할 기본값)로 복원.
// related files:
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/navigation/lastDashboardPath.ts

export const DashboardHome = () => {
  const { user } = useAuthStore();

  if (!user) return null;

  const entry = resolveEntryDashboardPath(user);
  // `/dashboard`는 진입 허브. 최근 메뉴(또는 역할 기본)가 다른면 그쪽으로 보낸다.
  if (entry !== "/dashboard") {
    return <Navigate to={entry} replace />;
  }

  if (user.role === "requestor") {
    return (
      <BusinessPaidAccessGate>
        <RequestorDashboardPage />
      </BusinessPaidAccessGate>
    );
  }

  if (user.role === "salesman") {
    return <SalesmanDashboardPage />;
  }

  if (user.role === "devops") {
    return <DevopsDashboardPage />;
  }

  if (user.role === "admin") {
    return <AdminDashboardPage />;
  }

  // manufacturer / practice 등은 entry가 역할 기본으로 보정되어 위에서 Navigate 됨
  return <Navigate to={entry} replace />;
};

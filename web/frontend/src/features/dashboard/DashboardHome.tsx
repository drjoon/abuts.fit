import { useAuthStore } from "@/store/useAuthStore";
import { RequestorDashboardPage } from "@/pages/requestor/dashboard/RequestorDashboardPage";
import { AdminDashboardPage } from "@/pages/admin/dashboard/AdminDashboardPage";
import { SalesmanDashboardPage } from "@/pages/salesman/SalesmanDashboardPage";
import { Navigate, useLocation } from "react-router-dom";
import { BusinessPaidAccessGate } from "@/shared/business/BusinessPaidAccessGate";
import { resolveEntryDashboardPath } from "@/shared/navigation/lastDashboardPath";

// change-log:
// - 2026-08-17: internalLab `/dashboard` = 대기보드(RequestorDashboardPage). 기본 랜딩은 lab-work 유지.
// - 2026-08-09: 신규의뢰 제출 등 refreshDashboardAt 의도 이동은 last path 허브 리다이렉트를 건너뛴다.
// - 2026-08-09: 모든 role에서 /dashboard 허브가 lastDashboardPath(없으면 역할 기본값)로 복원.
// related files:
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/navigation/lastDashboardPath.ts
// - web/frontend/src/pages/requestor/new_request/hooks/useNewRequestPage.ts

export const DashboardHome = () => {
  const { user } = useAuthStore();
  const location = useLocation();

  if (!user) return null;

  const locationState =
    location.state && typeof location.state === "object"
      ? (location.state as { refreshDashboardAt?: unknown })
      : null;
  const stayOnDashboardHome = Boolean(
    Number(locationState?.refreshDashboardAt || 0),
  );

  const entry = resolveEntryDashboardPath(user);
  // `/dashboard`는 진입 허브. 최근 메뉴(또는 역할 기본)가 다른면 그쪽으로 보낸다.
  // 단, 신규의뢰 제출 등 명시적 홈 이동(refreshDashboardAt)은 bounce 하지 않는다.
  if (!stayOnDashboardHome && entry !== "/dashboard") {
    return <Navigate to={entry} replace />;
  }

  if (user.role === "requestor" || user.role === "internalLab") {
    return (
      <BusinessPaidAccessGate>
        <RequestorDashboardPage />
      </BusinessPaidAccessGate>
    );
  }

  if (user.role === "salesman") {
    return <SalesmanDashboardPage />;
  }

  if (user.role === "admin") {
    return <AdminDashboardPage />;
  }

  // manufacturer / practice / devops 등은 entry가 역할 기본으로 보정되어 위에서 Navigate 됨
  return <Navigate to={entry} replace />;
};

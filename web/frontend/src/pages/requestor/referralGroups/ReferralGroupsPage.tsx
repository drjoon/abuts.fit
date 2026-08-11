// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - 2026-08-11: 의뢰자 소개 페이지 제거 — salesman/devops만 라우팅.
import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { SalesmanReferralPage } from "@/pages/salesman/referral/SalesmanReferralPage";
import { DevopsReferralPage } from "@/pages/devops/referral/DevopsReferralPage";

export default function ReferralGroupsPage() {
  const { user } = useAuthStore();

  if (user?.role === "salesman") {
    return <SalesmanReferralPage />;
  }

  if (user?.role === "devops") {
    return <DevopsReferralPage />;
  }

  return <Navigate to="/dashboard" replace />;
}

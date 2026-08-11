// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - 2026-08-11: 의뢰자·개발운영사·관리자 소개 제거 — salesman만 라우팅.
import { Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { SalesmanReferralPage } from "@/pages/salesman/referral/SalesmanReferralPage";

export default function ReferralGroupsPage() {
  const { user } = useAuthStore();

  if (user?.role === "salesman") {
    return <SalesmanReferralPage />;
  }

  return <Navigate to="/dashboard" replace />;
}

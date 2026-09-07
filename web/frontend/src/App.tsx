import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLayout } from "@/features/layout/AppLayout";
import { LoadingScreen } from "@/shared/ui/feedback/LoadingScreen";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import type { AppUserRole } from "@/shared/types/role";
import { NewChatWidget } from "@/features/chat/components/NewChatWidget";
import { Suspense, lazy, useEffect } from "react";
import { loadRulesFromBackend } from "@/shared/filename/filenameRules";
import { useSocket } from "@/shared/hooks/useSocket";
import { useChatMessageSound } from "@/shared/hooks/useChatMessageSound";
import { useLabReceiveUnreadSound } from "@/shared/hooks/useLabReceiveUnreadSound";

// related files:
// - web/frontend/src/shared/types/role.ts
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/requestor/credits/RequestorCreditsPage.tsx
// - web/frontend/src/pages/requestor/store/RequestorStorePage.tsx
// - web/frontend/src/pages/devops/DevopsPaymentsPage.tsx
// - web/frontend/src/features/settings/tabs/LabSettlementPayoutTab.tsx
// - web/frontend/src/features/dashboard/DashboardHome.tsx
// - web/frontend/src/pages/admin/AdminMembersPage.tsx
// - web/frontend/src/pages/admin/AdminSupportHubPage.tsx
// - web/frontend/src/pages/admin/AdminChannelsPage.tsx
// - web/frontend/src/pages/admin/AdminFinancePage.tsx
// - web/frontend/src/pages/admin/AdminSettingsHubPage.tsx
// change-log:
// - 2026-09-06: 관리자 사이드 허브(회원·지원·채널·재무·설정) + 구 URL 리다이렉트.

const Index = lazy(() => import("./pages/public/Index"));
const ManualPage = lazy(() => import("./pages/public/ManualPage"));
const LoginPage = lazy(() =>
  import("./features/auth/LoginPage").then((m) => ({ default: m.LoginPage })),
);
const SignupPage = lazy(() =>
  import("./features/auth/SignupPage").then((m) => ({ default: m.SignupPage })),
);
const ForgotPasswordPage = lazy(() =>
  import("./features/auth/ForgotPasswordPage").then((m) => ({
    default: m.ForgotPasswordPage,
  })),
);
const ResetPasswordPage = lazy(() =>
  import("./features/auth/ResetPasswordPage").then((m) => ({
    default: m.ResetPasswordPage,
  })),
);
const DashboardLayout = lazy(() =>
  import("./features/layout/DashboardLayout").then((m) => ({
    default: m.DashboardLayout,
  })),
);
const DashboardHome = lazy(() =>
  import("./features/dashboard/DashboardHome").then((m) => ({
    default: m.DashboardHome,
  })),
);
const NewRequestPage = lazy(
  () => import("./pages/requestor/new_request/NewRequestPage"),
);
const RequestorPracticePage = lazy(
  () => import("./pages/requestor/practice/RequestorPracticePage"),
);
const ManufacturerWorksheetPage = lazy(() =>
  import("./pages/manufacturer/worksheet/WorksheetPage").then((m) => ({
    default: m.ManufacturerWorksheetPage,
  })),
);
const InternalLabLabWorkPage = lazy(
  () => import("./pages/internalLab/labWork/LabWorkPage"),
);
const SalesHomePage = lazy(() => import("./pages/salesTeam/SalesHomePage"));
const SalesAccountsPage = lazy(
  () => import("./pages/salesTeam/SalesAccountsPage"),
);
const SalesPerformancePage = lazy(
  () => import("./pages/salesTeam/SalesPerformancePage"),
);
const SalesRequirementsPage = lazy(
  () => import("./pages/salesTeam/SalesRequirementsPage"),
);
const AdminMembersPage = lazy(() => import("./pages/admin/AdminMembersPage"));
const AdminSupportHubPage = lazy(
  () => import("./pages/admin/AdminSupportHubPage"),
);
const AdminChannelsPage = lazy(() => import("./pages/admin/AdminChannelsPage"));
const AdminFinancePage = lazy(() => import("./pages/admin/AdminFinancePage"));
const AdminSettingsHubPage = lazy(
  () => import("./pages/admin/AdminSettingsHubPage"),
);
const SettingsPage = lazy(() =>
  import("./features/dashboard/SettingsPage").then((m) => ({
    default: m.SettingsPage,
  })),
);
const DevopsSettingsPage = lazy(() =>
  import("./pages/devops/DevopsSettingsPage").then((m) => ({
    default: m.DevopsSettingsPage,
  })),
);
const SharedOnboardingWizardPage = lazy(() =>
  import("./shared/onboarding/SharedOnboardingWizardPage").then((m) => ({
    default: m.SharedOnboardingWizardPage,
  })),
);
const InquiriesPage = lazy(() =>
  import("./features/support/InquiriesPage").then((m) => ({
    default: m.InquiriesPage,
  })),
);
import { AdminRequestMonitoring } from "@/pages/admin/requests/AdminRequestMonitoring";
import AdminInquiriesPage from "@/pages/admin/support/AdminBusinessRegistrationInquiryPage";
import AdminSettlementBatches from "@/pages/admin/system/AdminSettlementBatches";
import { AdminSecurity } from "@/pages/admin/system/AdminSecurity";
import AdminOrganizationVerification from "@/pages/admin/system/AdminOrganizationVerification";
import RequestorCreditsPage from "@/pages/requestor/credits/RequestorCreditsPage";
import RequestorStorePage from "@/pages/requestor/store/RequestorStorePage";
import RequestorStoreProductPage from "@/pages/requestor/store/RequestorStoreProductPage";
import RequestorStoreCartPage from "@/pages/requestor/store/RequestorStoreCartPage";
import RequestorStoreOrdersPage, {
  RequestorStoreOrderDetailPage,
} from "@/pages/requestor/store/RequestorStoreOrdersPage";
import AdminStorePage from "@/pages/admin/system/AdminStorePage";
import ReferralGroupsPage from "@/pages/requestor/referralGroups/ReferralGroupsPage";
import SalesmanPaymentsPage from "@/pages/salesman/SalesmanPaymentsPage";
import DevopsPaymentsPage from "@/pages/devops/DevopsPaymentsPage";
import { LabSettlementPayoutTab } from "@/features/settings/tabs/LabSettlementPayoutTab";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";
const CncDashboardPage = lazy(() =>
  import("./pages/manufacturer/equipment/EquipmentPage").then((m) => ({
    default: m.EquipmentPage,
  })),
);
const ManufacturerPaymentPage = lazy(() =>
  import("./pages/manufacturer/payments/PaymentsPage").then((m) => ({
    default: m.ManufacturerPaymentPage,
  })),
);
const HelpPage = lazy(() =>
  import("./pages/public/HelpPage").then((m) => ({ default: m.HelpPage })),
);
const ContactPage = lazy(() =>
  import("./pages/public/ContactPage").then((m) => ({
    default: m.ContactPage,
  })),
);
const OAuthCallbackPage = lazy(() =>
  import("./features/auth/OAuthCallbackPage").then((m) => ({
    default: m.OAuthCallbackPage,
  })),
);
const TermsPage = lazy(() =>
  import("./pages/public/TermsPage").then((m) => ({ default: m.TermsPage })),
);
const PrivacyPage = lazy(() =>
  import("./pages/public/PrivacyPage").then((m) => ({
    default: m.PrivacyPage,
  })),
);
const SecurityPage = lazy(() =>
  import("./pages/public/SecurityPage").then((m) => ({
    default: m.SecurityPage,
  })),
);
const CookiesPage = lazy(() =>
  import("./pages/public/CookiesPage").then((m) => ({
    default: m.CookiesPage,
  })),
);
const ServicePage = lazy(() =>
  import("./pages/public/ServicePage").then((m) => ({
    default: m.ServicePage,
  })),
);
const BusinessPage = lazy(() =>
  import("./pages/public/BusinessPage").then((m) => ({
    default: m.BusinessPage,
  })),
);
const CreditsPage = lazy(() =>
  import("./pages/public/CreditsPage").then((m) => ({
    default: m.CreditsPage,
  })),
);
const RefundPolicyPage = lazy(() =>
  import("./pages/public/RefundPolicyPage").then((m) => ({
    default: m.RefundPolicyPage,
  })),
);
const PracticeDropzonePage = lazy(() =>
  import("./pages/practice/PracticeDropzonePage").then((m) => ({
    default: m.PracticeDropzonePage,
  })),
);
const PracticeFileTransferPage = lazy(() =>
  import("./pages/practice/PracticeFileTransferPage").then((m) => ({
    default: m.PracticeFileTransferPage,
  })),
);
const PracticeSettingsPage = lazy(() =>
  import("./pages/practice/PracticeSettingsPage").then((m) => ({
    default: m.PracticeSettingsPage,
  })),
);
const NotFound = lazy(() => import("./pages/public/NotFound"));

const queryClient = new QueryClient();

// Protected Route wrapper
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

// Role-based Protected Route (예: manufacturer 전용)
const RoleProtectedRoute = ({
  roles,
  children,
}: {
  roles: AppUserRole[];
  children: React.ReactNode;
}) => {
  const { isAuthenticated, user } = useAuthStore();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (!user || !roles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
};

const PracticeAccountProtectedRoute = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (!user) {
    return <Navigate to="/dashboard" replace />;
  }
  if (user.role === "practice") {
    return <>{children}</>;
  }

  return <Navigate to="/dashboard" replace />;
};

const ReferralGroupsRoute = () => {
  const { user } = useAuthStore();

  if (!user) return <Navigate to="/dashboard" replace />;
  if (user.role === "salesman") return <ReferralGroupsPage />;
  return <Navigate to="/dashboard" replace />;
};

const PaymentsRoute = () => {
  const { user } = useAuthStore();
  const { kind, loading: accessLoading } = useRequestorBusinessAccess();

  if (!user) return <Navigate to="/dashboard" replace />;
  if (user.role === "manufacturer") return <ManufacturerPaymentPage />;
  if (user.role === "salesman") return <SalesmanPaymentsPage />;
  if (user.role === "devops") return <DevopsPaymentsPage />;
  if (user.role === "admin") {
    return <Navigate to="/dashboard/finance?tab=payments" replace />;
  }
  if (user.role === "internalLab") return <LabSettlementPayoutTab />;
  // 기공소(requestor lab) 사이드「정산」은 제거. 구 북마크는 크레딧 내역으로.
  if (user.role === "requestor") {
    if (accessLoading) return null;
    if (kind === "lab") {
      return <Navigate to="/dashboard/credits?tab=ledger" replace />;
    }
  }
  return <Navigate to="/dashboard" replace />;
};

const CreditsRoute = () => {
  const { user } = useAuthStore();

  if (!user) return <Navigate to="/dashboard" replace />;
  if (user.role === "admin") {
    return <Navigate to="/dashboard/finance" replace />;
  }
  if (user.role === "requestor" || user.role === "internalLab") {
    return <RequestorCreditsPage />;
  }
  return <Navigate to="/dashboard" replace />;
};

const InquiriesRoute = () => {
  const { user } = useAuthStore();
  const location = useLocation();
  if (!user) return <Navigate to="/dashboard" replace />;
  if (user.role === "practice") {
    return <Navigate to="/practice/inquiries" replace />;
  }
  if (user.role === "admin") {
    const next = new URLSearchParams(location.search);
    next.set("tab", "inquiries");
    return (
      <Navigate to={`/dashboard/support?${next.toString()}`} replace />
    );
  }
  if (user.role === "salesTeam") {
    return <AdminInquiriesPage mode="salesTeam" />;
  }
  return <InquiriesPage />;
};

const SettingsRoute = () => {
  const { user } = useAuthStore();
  const location = useLocation();
  if (!user) return <Navigate to="/dashboard" replace />;
  if (user.role === "practice") {
    return <Navigate to="/practice/settings" replace />;
  }
  const tab = new URLSearchParams(location.search).get("tab");
  // 구 북마크: 관리자 설정 결제 → 플랫폼 설정(크레딧)
  if (user.role === "admin" && tab === "payment") {
    return (
      <Navigate
        to="/dashboard/admin-settings?tab=platform&platformTab=credits"
        replace
      />
    );
  }
  if (user.role === "admin") {
    const next = new URLSearchParams(location.search);
    const accountTab = next.get("tab");
    next.delete("tab");
    next.set("tab", "account");
    if (
      accountTab &&
      accountTab !== "payment" &&
      ["account", "business", "staff", "notifications"].includes(accountTab)
    ) {
      next.set("accountTab", accountTab);
    }
    const qs = next.toString();
    return (
      <Navigate
        to={`/dashboard/admin-settings${qs ? `?${qs}` : "?tab=account"}`}
        replace
      />
    );
  }
  // 구 북마크: 의뢰자 설정 결제 → 사이드바 크레딧 충전
  if (
    (user.role === "requestor" || user.role === "internalLab") &&
    tab === "payment"
  ) {
    return <Navigate to="/dashboard/credits?tab=charge" replace />;
  }
  return <SettingsPage />;
};

const LegacyPartnerRedirect = () => {
  const { user } = useAuthStore();
  const location = useLocation();
  if (user?.role === "admin") {
    const next = new URLSearchParams(location.search);
    const partnersTab = next.get("tab");
    next.delete("tab");
    next.set("tab", "partners");
    if (partnersTab) next.set("partnersTab", partnersTab);
    return (
      <Navigate
        to={`/dashboard/admin-settings?${next.toString()}`}
        replace
      />
    );
  }
  return <Navigate to="/dashboard" replace />;
};

const AdminPlatformSettingsRedirect = () => {
  const location = useLocation();
  const next = new URLSearchParams(location.search);
  const platformTab = next.get("tab");
  next.delete("tab");
  next.set("tab", "platform");
  if (platformTab) next.set("platformTab", platformTab);
  return (
    <Navigate to={`/dashboard/admin-settings?${next.toString()}`} replace />
  );
};

const AdminRemoteSupportRedirect = () => {
  const location = useLocation();
  const next = new URLSearchParams(location.search);
  // Hub default tab is remote — drop redundant tab=room stays for deep-link.
  if (!next.get("tab") || next.get("tab") === "room") {
    // keep sessionId; room is an in-page tab, not hub tab
  } else if (next.get("tab") === "remote") {
    next.delete("tab");
  }
  const qs = next.toString();
  return <Navigate to={`/dashboard/support${qs ? `?${qs}` : ""}`} replace />;
};

const AdminBusinessesRedirect = () => {
  const location = useLocation();
  const qs = location.search || "";
  return <Navigate to={`/dashboard/members${qs}`} replace />;
};

const SignupEntryRoute = () => {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const referralCode = String(searchParams.get("ref") || "").trim();

  if (!referralCode) {
    return <SignupPage />;
  }

  const nextSearch = searchParams.toString();
  return (
    <Navigate
      to={`/signup/referral${nextSearch ? `?${nextSearch}` : ""}`}
      replace
    />
  );
};

const PracticeDashboardRoute = () => {
  const { user } = useAuthStore();
  const location = useLocation();

  if (!user) return <Navigate to="/dashboard" replace />;
  // Soft-deprecate: 통합 의뢰자(practice)는 대시보드 기공의뢰서로 유도
  if (user.role === "requestor") {
    return (
      <Navigate
        to="/dashboard/practice-transfers"
        replace
        state={location.state}
      />
    );
  }
  if (user.role === "practice") {
    return <PracticeFileTransferPage />;
  }

  return <Navigate to="/dashboard" replace />;
};

const PracticeInquiriesRoute = () => {
  const { user } = useAuthStore();

  if (!user) return <Navigate to="/dashboard" replace />;
  if (user.role === "practice") {
    return <InquiriesPage />;
  }

  return <Navigate to="/dashboard" replace />;
};

const PracticeSettingsRoute = () => {
  const { user } = useAuthStore();

  if (!user) return <Navigate to="/dashboard" replace />;
  if (user.role === "practice") {
    return <PracticeSettingsPage />;
  }

  return <Navigate to="/dashboard" replace />;
};

const ReferRoute = () => {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const referralCode = String(searchParams.get("ref") || "").trim();
  const nextPath = referralCode ? "/signup/referral" : "/signup";
  const nextSearch = searchParams.toString();

  return (
    <Navigate to={`${nextPath}${nextSearch ? `?${nextSearch}` : ""}`} replace />
  );
};

const App = () => {
  const { token, loginWithToken, logout } = useAuthStore();

  useSocket();
  useChatMessageSound();
  useLabReceiveUnreadSound();

  // 앱 시작 시 백엔드에서 파일명 파싱 룰 로드
  useEffect(() => {
    loadRulesFromBackend();
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    loginWithToken(token).then((result) => {
      if (cancelled) return;
      // 계정 전환 직후 토큰이 바뀌었거나, 백엔드 재시작 등 일시 장애면 세션 유지
      if (
        result.status === "unauthorized" &&
        useAuthStore.getState().token === token
      ) {
        logout();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loginWithToken, logout, token]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={600} skipDelayDuration={0}>
        <BrowserRouter>
          <Toaster />
          <Sonner />
          <AppLayout>
            <Suspense fallback={<LoadingScreen />}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupEntryRoute />} />
                <Route
                  path="/signup/start"
                  element={<Navigate to="/signup" replace />}
                />
                <Route path="/refer" element={<ReferRoute />} />
                <Route path="/signup/referral" element={<SignupPage />} />
                <Route path="/signup/staff" element={<SignupPage />} />
                <Route
                  path="/forgot-password"
                  element={<ForgotPasswordPage />}
                />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
                <Route path="/manual" element={<ManualPage />} />
                <Route path="/help" element={<HelpPage />} />
                <Route path="/contact" element={<ContactPage />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/security" element={<SecurityPage />} />
                <Route path="/cookies" element={<CookiesPage />} />
                <Route path="/service" element={<ServicePage />} />
                <Route path="/business" element={<BusinessPage />} />
                <Route path="/credits" element={<CreditsPage />} />
                <Route path="/refund-policy" element={<RefundPolicyPage />} />
                <Route
                  path="/practice"
                  element={<Navigate to="/practice/dropzone" replace />}
                />
                <Route
                  path="/practice/dropzone"
                  element={<PracticeDropzonePage />}
                />
                <Route path="/p" element={<PracticeDropzonePage />} />
                <Route
                  path="/practice/dashboard"
                  element={
                    <ProtectedRoute>
                      <DashboardLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<PracticeDashboardRoute />} />
                </Route>
                <Route
                  path="/practice/inquiries"
                  element={
                    <ProtectedRoute>
                      <DashboardLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<PracticeInquiriesRoute />} />
                </Route>
                <Route
                  path="/practice/settings"
                  element={
                    <ProtectedRoute>
                      <DashboardLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<PracticeSettingsRoute />} />
                </Route>
                <Route
                  path="/dashboard"
                  element={
                    <ProtectedRoute>
                      <DashboardLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route index element={<DashboardHome />} />
                  <Route
                    path="new-request"
                    element={
                      <RoleProtectedRoute roles={["requestor", "internalLab"]}>
                        <NewRequestPage />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="new-request/:id"
                    element={
                      <RoleProtectedRoute roles={["requestor", "internalLab"]}>
                        <NewRequestPage />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="practice-transfers"
                    element={
                      <RoleProtectedRoute roles={["requestor"]}>
                        <RequestorPracticePage />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="worksheet"
                    element={
                      <RoleProtectedRoute roles={["manufacturer"]}>
                        <ManufacturerWorksheetPage />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="abut-design"
                    element={
                      <RoleProtectedRoute roles={["internalLab"]}>
                        <Navigate to="/dashboard/lab-work" replace />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="lab-work"
                    element={
                      <RoleProtectedRoute roles={["internalLab"]}>
                        <InternalLabLabWorkPage />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="sales"
                    element={
                      <RoleProtectedRoute roles={["salesTeam"]}>
                        <SalesHomePage />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="sales/accounts"
                    element={
                      <RoleProtectedRoute roles={["salesTeam"]}>
                        <SalesAccountsPage />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="sales/performance"
                    element={
                      <RoleProtectedRoute roles={["salesTeam"]}>
                        <SalesPerformancePage />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="sales/schedule"
                    element={
                      <RoleProtectedRoute roles={["salesTeam"]}>
                        <Navigate to="/dashboard/sales?tab=schedule" replace />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="sales/stats"
                    element={
                      <RoleProtectedRoute roles={["salesTeam"]}>
                        <Navigate
                          to="/dashboard/sales/performance"
                          replace
                        />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="sales/reports"
                    element={
                      <RoleProtectedRoute roles={["salesTeam"]}>
                        <Navigate to="/dashboard/sales?tab=report" replace />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="sales/referral"
                    element={
                      <RoleProtectedRoute roles={["salesTeam"]}>
                        <Navigate
                          to="/dashboard/sales/performance?tab=referral"
                          replace
                        />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="sales/requirements"
                    element={
                      <RoleProtectedRoute
                        roles={[
                          "salesTeam",
                          "admin",
                          "internalLab",
                          "devops",
                        ]}
                      >
                        <SalesRequirementsPage />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="design"
                    element={
                      <RoleProtectedRoute roles={["requestor"]}>
                        <Navigate
                          to="/dashboard/practice-transfers?mode=receive"
                          replace
                        />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="platform-settings"
                    element={
                      <RoleProtectedRoute roles={["admin"]}>
                        <AdminPlatformSettingsRedirect />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="admin-settings"
                    element={
                      <RoleProtectedRoute roles={["admin"]}>
                        <AdminSettingsHubPage />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="partners"
                    element={
                      <RoleProtectedRoute roles={["admin"]}>
                        <Navigate
                          to="/dashboard/admin-settings?tab=partners"
                          replace
                        />
                      </RoleProtectedRoute>
                    }
                  />
                  {/* 호환용: 구 개발운영사 파트너 경로 */}
                  <Route
                    path="partner"
                    element={
                      <ProtectedRoute>
                        <LegacyPartnerRedirect />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="cnc"
                    element={
                      <RoleProtectedRoute roles={["manufacturer"]}>
                        <CncDashboardPage />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="printer"
                    element={
                      <RoleProtectedRoute roles={["manufacturer"]}>
                        <CncDashboardPage />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="members"
                    element={
                      <RoleProtectedRoute roles={["admin"]}>
                        <AdminMembersPage />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="businesses"
                    element={
                      <RoleProtectedRoute roles={["admin"]}>
                        <AdminBusinessesRedirect />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="users"
                    element={
                      <RoleProtectedRoute roles={["admin"]}>
                        <Navigate to="/dashboard/members?tab=users" replace />
                      </RoleProtectedRoute>
                    }
                  />
                  {/* 호환용: 기존 경로 유지 */}
                  <Route
                    path="user-management"
                    element={
                      <RoleProtectedRoute roles={["admin"]}>
                        <Navigate to="/dashboard/members?tab=users" replace />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="monitoring"
                    element={
                      <RoleProtectedRoute roles={["admin"]}>
                        <AdminRequestMonitoring />
                      </RoleProtectedRoute>
                    }
                  />
                  {/* 호환용: 기존 경로 유지 */}
                  <Route
                    path="request-monitoring"
                    element={
                      <RoleProtectedRoute roles={["admin"]}>
                        <AdminRequestMonitoring />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="channels"
                    element={
                      <RoleProtectedRoute roles={["admin"]}>
                        <AdminChannelsPage />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="support"
                    element={
                      <RoleProtectedRoute roles={["admin"]}>
                        <AdminSupportHubPage />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="finance"
                    element={
                      <RoleProtectedRoute roles={["admin"]}>
                        <AdminFinancePage />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="mail"
                    element={
                      <RoleProtectedRoute roles={["admin"]}>
                        <Navigate to="/dashboard/channels?tab=mail" replace />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="admin/inquiries"
                    element={
                      <RoleProtectedRoute roles={["admin"]}>
                        <Navigate
                          to="/dashboard/support?tab=inquiries"
                          replace
                        />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="inquiries"
                    element={
                      <RoleProtectedRoute
                        roles={[
                          "admin",
                          "requestor",
                          "salesman",
                          "practice",
                          "internalLab",
                          "salesTeam",
                        ]}
                      >
                        <InquiriesRoute />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="sms"
                    element={
                      <RoleProtectedRoute roles={["admin"]}>
                        <Navigate to="/dashboard/channels?tab=sms" replace />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="chat-management"
                    element={
                      <RoleProtectedRoute roles={["admin"]}>
                        <Navigate to="/dashboard/channels" replace />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="remote-support"
                    element={
                      <RoleProtectedRoute roles={["admin"]}>
                        <AdminRemoteSupportRedirect />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="tax-invoices"
                    element={
                      <RoleProtectedRoute roles={["admin"]}>
                        <Navigate to="/dashboard/finance?tab=tax" replace />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="store-admin"
                    element={
                      <RoleProtectedRoute roles={["admin"]}>
                        <AdminStorePage />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="settlement-batches"
                    element={
                      <RoleProtectedRoute roles={["admin"]}>
                        <AdminSettlementBatches />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="security-settings"
                    element={
                      <RoleProtectedRoute roles={["admin"]}>
                        <AdminSecurity />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="organization-verification"
                    element={
                      <RoleProtectedRoute roles={["admin"]}>
                        <AdminOrganizationVerification />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="credits"
                    element={
                      <RoleProtectedRoute
                        roles={["admin", "requestor", "internalLab"]}
                      >
                        <CreditsRoute />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="store"
                    element={
                      <RoleProtectedRoute roles={["requestor"]}>
                        <RequestorStorePage />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="store/cart"
                    element={
                      <RoleProtectedRoute roles={["requestor"]}>
                        <RequestorStoreCartPage />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="store/orders"
                    element={
                      <RoleProtectedRoute roles={["requestor"]}>
                        <RequestorStoreOrdersPage />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="store/orders/:orderId"
                    element={
                      <RoleProtectedRoute roles={["requestor"]}>
                        <RequestorStoreOrderDetailPage />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="store/:productId"
                    element={
                      <RoleProtectedRoute roles={["requestor"]}>
                        <RequestorStoreProductPage />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="payments"
                    element={
                      <RoleProtectedRoute
                        roles={[
                          "manufacturer",
                          "salesman",
                          "admin",
                          "devops",
                          "requestor",
                          "internalLab",
                        ]}
                      >
                        <PaymentsRoute />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="referral-groups"
                    element={
                      <RoleProtectedRoute roles={["salesman"]}>
                        <ReferralGroupsRoute />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="wizard"
                    element={
                      <RoleProtectedRoute
                        roles={[
                          "requestor",
                          "practice",
                          "salesman",
                          "manufacturer",
                          "internalLab",
                          "admin",
                          "devops",
                          "salesTeam",
                          "labTeam",
                        ]}
                      >
                        <SharedOnboardingWizardPage />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="practice/dropzone"
                    element={
                      <PracticeAccountProtectedRoute>
                        <PracticeDropzonePage />
                      </PracticeAccountProtectedRoute>
                    }
                  />
                  <Route path="settings" element={<SettingsRoute />} />
                  <Route
                    path="settings/devops"
                    element={
                      <RoleProtectedRoute roles={["devops", "admin"]}>
                        <DevopsSettingsPage />
                      </RoleProtectedRoute>
                    }
                  />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
            <NewChatWidget />
          </AppLayout>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;

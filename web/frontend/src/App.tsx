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

// related files:
// - web/frontend/src/shared/types/role.ts
// - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/frontend/src/pages/requestor/credits/RequestorCreditsPage.tsx
// - web/frontend/src/features/dashboard/DashboardHome.tsx

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
const DevopsPartnerPage = lazy(() =>
  import("./pages/devops/DevopsPartnerPage").then((m) => ({
    default: m.DevopsPartnerPage,
  })),
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
import { AdminUserManagement } from "@/pages/admin/users/AdminUserManagement";
import { AdminRequestMonitoring } from "@/pages/admin/requests/AdminRequestMonitoring";
import AdminMailPage from "@/pages/admin/support/AdminMailPage";
import AdminSmsPage from "@/pages/admin/support/AdminSmsPage";
import { AdminChatManagement } from "@/pages/admin/support/AdminChatManagement";
import AdminInquiriesPage from "@/pages/admin/support/AdminBusinessRegistrationInquiryPage";
import AdminTaxInvoices from "@/pages/admin/system/AdminTaxInvoices";
import { AdminSecurity } from "@/pages/admin/system/AdminSecurity";
import AdminOrganizationVerification from "@/pages/admin/system/AdminOrganizationVerification";
import AdminCreditPage from "@/pages/admin/credits/AdminCreditPage";
import RequestorCreditsPage from "@/pages/requestor/credits/RequestorCreditsPage";
import AdminBusinessPage from "@/pages/admin/businesses/AdminBusinessPage";
import ReferralGroupsPage from "@/pages/requestor/referralGroups/ReferralGroupsPage";
import SalesmanPaymentsPage from "@/pages/salesman/SalesmanPaymentsPage";
import AdminPaymentsPage from "@/pages/admin/AdminPaymentsPage";
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

  if (!user) return <Navigate to="/dashboard" replace />;
  if (user.role === "manufacturer") return <ManufacturerPaymentPage />;
  if (user.role === "salesman") return <SalesmanPaymentsPage />;
  if (user.role === "admin") return <AdminPaymentsPage />;
  return <Navigate to="/dashboard" replace />;
};

const CreditsRoute = () => {
  const { user } = useAuthStore();

  if (!user) return <Navigate to="/dashboard" replace />;
  if (user.role === "admin") return <AdminCreditPage />;
  if (user.role === "requestor") return <RequestorCreditsPage />;
  return <Navigate to="/dashboard" replace />;
};

const InquiriesRoute = () => {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/dashboard" replace />;
  if (user.role === "practice") {
    return <Navigate to="/practice/inquiries" replace />;
  }
  if (user.role === "admin") return <AdminInquiriesPage />;
  return <InquiriesPage />;
};

const SettingsRoute = () => {
  const { user } = useAuthStore();
  const location = useLocation();
  if (!user) return <Navigate to="/dashboard" replace />;
  if (user.role === "practice") {
    return <Navigate to="/practice/settings" replace />;
  }
  // 구 북마크: devops 설정 수익분배/요금 → 파트너 페이지
  if (user.role === "devops") {
    const tab = new URLSearchParams(location.search).get("tab");
    if (tab === "payment" || tab === "credits") {
      return <Navigate to={`/dashboard/partner?tab=${tab}`} replace />;
    }
  }
  // 구 북마크: 의뢰자 설정 결제 → 사이드바 크레딧 충전
  if (user.role === "requestor") {
    const tab = new URLSearchParams(location.search).get("tab");
    if (tab === "payment") {
      return <Navigate to="/dashboard/credits?tab=charge" replace />;
    }
  }
  return <SettingsPage />;
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

  // 앱 시작 시 백엔드에서 파일명 파싱 룰 로드
  useEffect(() => {
    loadRulesFromBackend();
  }, []);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    loginWithToken(token).then((ok) => {
      if (cancelled) return;
      // 계정 전환 직후 토큰이 바뀌었거나 요청이 중단된 경우 세션을 지우지 않음
      if (!ok && useAuthStore.getState().token === token) {
        logout();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loginWithToken, logout, token]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={0} skipDelayDuration={0}>
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
                      <RoleProtectedRoute roles={["requestor"]}>
                        <NewRequestPage />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="new-request/:id"
                    element={
                      <RoleProtectedRoute roles={["requestor"]}>
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
                    path="partner"
                    element={
                      <RoleProtectedRoute roles={["devops"]}>
                        <DevopsPartnerPage />
                      </RoleProtectedRoute>
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
                    path="businesses"
                    element={
                      <RoleProtectedRoute roles={["admin"]}>
                        <AdminBusinessPage />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="users"
                    element={
                      <RoleProtectedRoute roles={["admin"]}>
                        <AdminUserManagement />
                      </RoleProtectedRoute>
                    }
                  />
                  {/* 호환용: 기존 경로 유지 */}
                  <Route
                    path="user-management"
                    element={
                      <RoleProtectedRoute roles={["admin"]}>
                        <AdminUserManagement />
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
                    path="mail"
                    element={
                      <RoleProtectedRoute roles={["admin"]}>
                        <AdminMailPage />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="admin/inquiries"
                    element={
                      <RoleProtectedRoute roles={["admin"]}>
                        <AdminInquiriesPage />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="inquiries"
                    element={
                      <RoleProtectedRoute
                        roles={["admin", "requestor", "salesman", "practice"]}
                      >
                        <InquiriesRoute />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="sms"
                    element={
                      <RoleProtectedRoute roles={["admin"]}>
                        <AdminSmsPage />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="chat-management"
                    element={
                      <RoleProtectedRoute roles={["admin"]}>
                        <AdminChatManagement />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="tax-invoices"
                    element={
                      <RoleProtectedRoute roles={["admin"]}>
                        <AdminTaxInvoices />
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
                      <RoleProtectedRoute roles={["admin", "requestor"]}>
                        <CreditsRoute />
                      </RoleProtectedRoute>
                    }
                  />
                  <Route
                    path="payments"
                    element={
                      <RoleProtectedRoute
                        roles={["manufacturer", "salesman", "admin"]}
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
                          "admin",
                          "devops",
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

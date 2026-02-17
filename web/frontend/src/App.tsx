import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLayout } from "@/features/layout/AppLayout";
import { LoadingScreen } from "@/components/common/LoadingScreen";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { NewChatWidget } from "@/components/chat/NewChatWidget";
import { Suspense, lazy, useEffect } from "react";
import { loadRulesFromBackend } from "@/shared/filename/filenameRules";
import { GuideTourProvider } from "@/features/guidetour/GuideTourProvider";

const Index = lazy(() => import("./pages/public/Index"));
const LoginPage = lazy(() =>
  import("./pages/auth/LoginPage").then((m) => ({ default: m.LoginPage })),
);
const SignupPage = lazy(() =>
  import("./pages/auth/SignupPage").then((m) => ({ default: m.SignupPage })),
);
const SignupStaffPage = lazy(() =>
  import("./pages/auth/SignupStaffPage").then((m) => ({
    default: m.SignupStaffPage,
  })),
);
const ForgotPasswordPage = lazy(() =>
  import("./pages/auth/ForgotPasswordPage").then((m) => ({
    default: m.ForgotPasswordPage,
  })),
);
const ResetPasswordPage = lazy(() =>
  import("./pages/auth/ResetPasswordPage").then((m) => ({
    default: m.ResetPasswordPage,
  })),
);
const DashboardLayout = lazy(() =>
  import("./features/layout/DashboardLayout").then((m) => ({
    default: m.DashboardLayout,
  })),
);
const DashboardHome = lazy(() =>
  import("./pages/dashboard/DashboardHome").then((m) => ({
    default: m.DashboardHome,
  })),
);
const NewRequestPage = lazy(() =>
  import("./pages/requestor/new_request/NewRequestPage").then((m) => ({
    default: m.NewRequestPage,
  })),
);
const ManufacturerWorksheetPage = lazy(() =>
  import("./pages/manufacturer/worksheet/ManufacturerWorksheetPage").then(
    (m) => ({
      default: m.ManufacturerWorksheetPage,
    }),
  ),
);
const SettingsPage = lazy(() =>
  import("./pages/dashboard/SettingsPage").then((m) => ({
    default: m.SettingsPage,
  })),
);
import { AdminUserManagement } from "@/pages/admin/users/AdminUserManagement";
import { AdminRequestMonitoring } from "@/pages/admin/monitoring/AdminRequestMonitoring";
import AdminMailPage from "@/pages/admin/support/AdminMailPage";
import AdminSmsPage from "@/pages/admin/support/AdminSmsPage";
import { AdminChatManagement } from "@/pages/admin/support/AdminChatManagement";
import AdminTaxInvoices from "@/pages/admin/system/AdminTaxInvoices";
import AdminPopbillQueue from "@/pages/admin/system/AdminPopbillQueue";
import { AdminSecurity } from "@/pages/admin/system/AdminSecurity";
import AdminOrganizationVerification from "@/pages/admin/system/AdminOrganizationVerification";
import AdminCreditPage from "@/pages/admin/credits/AdminCreditPage";
import AdminReferralGroupsPage from "@/pages/admin/referralGroups/AdminReferralGroupsPage";
const CncDashboardPage = lazy(() =>
  import("./pages/manufacturer/CncDashboardPage").then((m) => ({
    default: m.CncDashboardPage,
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
  import("./pages/auth/OAuthCallbackPage").then((m) => ({
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
  roles: ("requestor" | "manufacturer" | "admin" | "salesman")[];
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

const App = () => {
  const { token, loginWithToken, logout } = useAuthStore();

  // 앱 시작 시 백엔드에서 파일명 파싱 룰 로드
  useEffect(() => {
    loadRulesFromBackend();
  }, []);

  useEffect(() => {
    if (!token) return;
    loginWithToken(token).then((ok) => {
      if (!ok) logout();
    });
  }, [loginWithToken, logout, token]);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <Toaster />
          <Sonner />
          <GuideTourProvider>
            <AppLayout>
              <Suspense fallback={<LoadingScreen />}>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/signup" element={<SignupPage />} />
                  <Route path="/signup/staff" element={<SignupStaffPage />} />
                  <Route
                    path="/forgot-password"
                    element={<ForgotPasswordPage />}
                  />
                  <Route
                    path="/reset-password"
                    element={<ResetPasswordPage />}
                  />
                  <Route
                    path="/oauth/callback"
                    element={<OAuthCallbackPage />}
                  />
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
                    path="/admin/popbill-queue"
                    element={<Navigate to="/dashboard/popbill-queue" replace />}
                  />
                  <Route
                    path="/dashboard"
                    element={
                      <ProtectedRoute>
                        <DashboardLayout />
                      </ProtectedRoute>
                    }
                  >
                    <Route index element={<DashboardHome />} />
                    <Route path="new-request" element={<NewRequestPage />} />
                    <Route
                      path="new-request/:id"
                      element={<NewRequestPage />}
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
                    <Route path="users" element={<AdminUserManagement />} />
                    {/* 호환용: 기존 경로 유지 */}
                    <Route
                      path="user-management"
                      element={<AdminUserManagement />}
                    />
                    <Route
                      path="monitoring"
                      element={<AdminRequestMonitoring />}
                    />
                    {/* 호환용: 기존 경로 유지 */}
                    <Route
                      path="request-monitoring"
                      element={<AdminRequestMonitoring />}
                    />
                    <Route path="mail" element={<AdminMailPage />} />
                    <Route path="sms" element={<AdminSmsPage />} />
                    <Route
                      path="chat-management"
                      element={<AdminChatManagement />}
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
                      path="popbill-queue"
                      element={
                        <RoleProtectedRoute roles={["admin"]}>
                          <AdminPopbillQueue />
                        </RoleProtectedRoute>
                      }
                    />
                    <Route
                      path="security-settings"
                      element={<AdminSecurity />}
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
                        <RoleProtectedRoute roles={["admin"]}>
                          <AdminCreditPage />
                        </RoleProtectedRoute>
                      }
                    />
                    <Route
                      path="referral-groups"
                      element={
                        <RoleProtectedRoute roles={["admin"]}>
                          <AdminReferralGroupsPage />
                        </RoleProtectedRoute>
                      }
                    />
                    <Route path="settings" element={<SettingsPage />} />
                  </Route>
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
              <NewChatWidget />
            </AppLayout>
          </GuideTourProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;

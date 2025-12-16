import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLayout } from "@/components/common/AppLayout";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { NewChatWidget } from "@/components/chat/NewChatWidget";
import { Suspense, lazy, useEffect } from "react";
import { loadRulesFromBackend } from "@/utils/filenameRules";

const Index = lazy(() => import("./pages/Index"));
const LoginPage = lazy(() =>
  import("./pages/LoginPage").then((m) => ({ default: m.LoginPage }))
);
const SignupPage = lazy(() =>
  import("./pages/SignupPage").then((m) => ({ default: m.SignupPage }))
);
const DashboardLayout = lazy(() =>
  import("./components/DashboardLayout").then((m) => ({
    default: m.DashboardLayout,
  }))
);
const DashboardHome = lazy(() =>
  import("./pages/DashboardHome").then((m) => ({ default: m.DashboardHome }))
);
const NewRequestPage = lazy(() =>
  import("./pages/requestor/new_request/NewRequestPage").then((m) => ({
    default: m.NewRequestPage,
  }))
);
const ManufacturerWorksheetPage = lazy(() =>
  import("./pages/manufacturer/WorkSheet").then((m) => ({
    default: m.ManufacturerWorksheetPage,
  }))
);
const SettingsPage = lazy(() =>
  import("./pages/SettingsPage").then((m) => ({
    default: m.SettingsPage,
  }))
);
const AdminUserManagement = lazy(() =>
  import("./pages/admin/users/AdminUserManagement").then((m) => ({
    default: m.AdminUserManagement,
  }))
);
const AdminRequestMonitoring = lazy(() =>
  import("./pages/admin/monitoring/AdminRequestMonitoring").then((m) => ({
    default: m.AdminRequestMonitoring,
  }))
);
const AdminChatManagement = lazy(() =>
  import("./pages/admin/support/AdminChatManagement").then((m) => ({
    default: m.AdminChatManagement,
  }))
);
const AdminAnalytics = lazy(() =>
  import("./pages/admin/system/AdminAnalytics").then((m) => ({
    default: m.AdminAnalytics,
  }))
);
const AdminSecurity = lazy(() =>
  import("./pages/admin/system/AdminSecurity").then((m) => ({
    default: m.AdminSecurity,
  }))
);
const CncDashboardPage = lazy(() =>
  import("./pages/manufacturer/CncDashboardPage").then((m) => ({
    default: m.CncDashboardPage,
  }))
);
const HelpPage = lazy(() =>
  import("./pages/HelpPage").then((m) => ({ default: m.HelpPage }))
);
const ContactPage = lazy(() =>
  import("./pages/ContactPage").then((m) => ({ default: m.ContactPage }))
);
const OAuthCallbackPage = lazy(() =>
  import("./pages/OAuthCallbackPage").then((m) => ({
    default: m.OAuthCallbackPage,
  }))
);
const TermsPage = lazy(() =>
  import("./pages/TermsPage").then((m) => ({ default: m.TermsPage }))
);
const PrivacyPage = lazy(() =>
  import("./pages/PrivacyPage").then((m) => ({ default: m.PrivacyPage }))
);
const SecurityPage = lazy(() =>
  import("./pages/SecurityPage").then((m) => ({ default: m.SecurityPage }))
);
const CookiesPage = lazy(() =>
  import("./pages/CookiesPage").then((m) => ({ default: m.CookiesPage }))
);
const BusinessPage = lazy(() =>
  import("./pages/BusinessPage").then((m) => ({ default: m.BusinessPage }))
);
const NotFound = lazy(() => import("./pages/NotFound"));

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
  roles: ("requestor" | "manufacturer" | "admin")[];
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
  // 앱 시작 시 백엔드에서 파일명 파싱 룰 로드
  useEffect(() => {
    loadRulesFromBackend();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <Toaster />
          <Sonner />
          <AppLayout>
            <Suspense fallback={<div className="p-6">불러오는 중...</div>}>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />
                <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
                <Route path="/help" element={<HelpPage />} />
                <Route path="/contact" element={<ContactPage />} />
                <Route path="/terms" element={<TermsPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/security" element={<SecurityPage />} />
                <Route path="/cookies" element={<CookiesPage />} />
                <Route path="/business" element={<BusinessPage />} />
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
                  <Route path="new-request/:id" element={<NewRequestPage />} />
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
                  <Route
                    path="user-management"
                    element={<AdminUserManagement />}
                  />
                  <Route
                    path="request-monitoring"
                    element={<AdminRequestMonitoring />}
                  />
                  <Route
                    path="chat-management"
                    element={<AdminChatManagement />}
                  />
                  <Route path="system-analytics" element={<AdminAnalytics />} />
                  <Route path="security-settings" element={<AdminSecurity />} />
                  <Route path="settings" element={<SettingsPage />} />
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

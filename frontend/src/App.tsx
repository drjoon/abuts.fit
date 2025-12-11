import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLayout } from "@/components/common/AppLayout";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { NewChatWidget } from "@/components/chat/NewChatWidget";
import { useEffect } from "react";
import { loadRulesFromBackend } from "@/utils/filenameRules";
import Index from "./pages/Index";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { DashboardLayout } from "./components/DashboardLayout";
import { DashboardHome } from "./pages/DashboardHome";
import { NewRequestPage } from "./pages/requestor/new_request/NewRequestPage";
import { ManufacturerWorksheetPage } from "./pages/manufacturer/WorkSheet";
import { SettingsPage } from "./features/requestor/pages/SettingsPage";
import { AdminUserManagement } from "./pages/admin/users/AdminUserManagement";
import { AdminRequestMonitoring } from "./pages/admin/monitoring/AdminRequestMonitoring";
import { AdminChatManagement } from "./pages/admin/support/AdminChatManagement";
import { AdminAnalytics } from "./pages/admin/system/AdminAnalytics";
import { AdminSecurity } from "./pages/admin/system/AdminSecurity";
import { CncDashboardPage } from "./pages/manufacturer/CncDashboardPage";
import { HelpPage } from "./pages/HelpPage";
import { ContactPage } from "./pages/ContactPage";
import { TermsPage } from "./pages/TermsPage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { SecurityPage } from "./pages/SecurityPage";
import { CookiesPage } from "./pages/CookiesPage";
import { BusinessPage } from "./pages/BusinessPage";
import NotFound from "./pages/NotFound";

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
            <Routes>
              <Route
                path="/"
                element={
                  <AppLayout>
                    <Index />
                  </AppLayout>
                }
              />
              <Route
                path="/login"
                element={
                  <AppLayout>
                    <LoginPage />
                  </AppLayout>
                }
              />
              <Route
                path="/signup"
                element={
                  <AppLayout>
                    <SignupPage />
                  </AppLayout>
                }
              />
              <Route
                path="/help"
                element={
                  <AppLayout>
                    <HelpPage />
                  </AppLayout>
                }
              />
              <Route
                path="/contact"
                element={
                  <AppLayout>
                    <ContactPage />
                  </AppLayout>
                }
              />
              <Route
                path="/terms"
                element={
                  <AppLayout>
                    <TermsPage />
                  </AppLayout>
                }
              />
              <Route
                path="/privacy"
                element={
                  <AppLayout>
                    <PrivacyPage />
                  </AppLayout>
                }
              />
              <Route
                path="/security"
                element={
                  <AppLayout>
                    <SecurityPage />
                  </AppLayout>
                }
              />
              <Route
                path="/cookies"
                element={
                  <AppLayout>
                    <CookiesPage />
                  </AppLayout>
                }
              />
              <Route
                path="/business"
                element={
                  <AppLayout>
                    <BusinessPage />
                  </AppLayout>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <AppLayout>
                    <ProtectedRoute>
                      <DashboardLayout />
                    </ProtectedRoute>
                  </AppLayout>
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
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
            <NewChatWidget />
          </AppLayout>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;

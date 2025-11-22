import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppLayout } from "@/components/common/AppLayout";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { NewChatWidget } from "@/components/chat/NewChatWidget";
import Index from "./pages/Index";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { DashboardLayout } from "./components/DashboardLayout";
import { DashboardHome } from "./pages/DashboardHome";
import { NewRequestPage } from "./pages/NewRequestPage";
import { RequestListPage } from "./pages/RequestListPage";
import { SettingsPage } from "./pages/SettingsPage";
import { AdminUserManagement } from "./pages/AdminUserManagement";
import { AdminRequestMonitoring } from "./pages/AdminRequestMonitoring";
import { AdminChatManagement } from "./pages/AdminChatManagement";
import { AdminAnalytics } from "./pages/AdminAnalytics";
import { AdminSecurity } from "./pages/AdminSecurity";
import { CncDashboardPage } from "./pages/CncDashboardPage";
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

const App = () => (
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
              <Route path="request-list" element={<RequestListPage />} />
              <Route path="cnc" element={<CncDashboardPage />} />
              <Route path="user-management" element={<AdminUserManagement />} />
              <Route
                path="request-monitoring"
                element={<AdminRequestMonitoring />}
              />
              <Route path="chat-management" element={<AdminChatManagement />} />
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

export default App;

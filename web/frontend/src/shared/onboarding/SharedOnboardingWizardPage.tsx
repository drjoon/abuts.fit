// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { useEffect, useMemo } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { apiFetch } from "@/shared/api/apiClient";
import { SettingsWizard } from "./wizard/SettingsWizard";
import {
  canUsePaidServices,
  normalizeRequestorKind,
  shouldGatePaidRequestorAccess,
} from "@/shared/business/requestorCapabilities";
import { resolveEntryDashboardPath } from "@/shared/navigation/lastDashboardPath";

const resolvePostOnboardingPath = (user: {
  role?: string | null;
  businessVerified?: boolean;
  requestorKind?: "practice" | "lab" | null;
  requestorServices?: { free?: boolean; paid?: boolean } | null;
  requestorCapabilities?: { practice?: boolean; lab?: boolean } | null;
  lastDashboardPath?: string | null;
} | null) => {
  // practice + 유료 미가용은 대시보드 대신 기공의뢰서로 (lab은 대시보드 허용)
  if (
    user?.role === "requestor" &&
    shouldGatePaidRequestorAccess({
      kind: normalizeRequestorKind(user?.requestorKind),
      canUsePaid: canUsePaidServices({
        businessVerified: Boolean(user?.businessVerified),
        services: user?.requestorServices,
        caps: user?.requestorCapabilities,
      }),
    })
  ) {
    return "/dashboard/practice-transfers";
  }
  return resolveEntryDashboardPath(user);
};

export const SharedOnboardingWizardPage = () => {
  const { user, token, setUser, loginWithToken } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (!user) return;
    if (!user.role) {
      navigate(resolvePostOnboardingPath(user), { replace: true });
    }
  }, [navigate, user]);

  const markWizardCompleted = async () => {
    if (!token) return;
    if (!user) return;
    setUser({
      ...user,
      onboardingWizardCompleted: true,
    });
    try {
      const res = await apiFetch<any>({
        path: "/api/users/profile",
        method: "PUT",
        token,
        jsonBody: { onboardingWizardCompleted: true },
      });
      if (!res.ok) return;
      await loginWithToken(token);
    } catch {
      // ignore
    }
  };

  const mode = useMemo<"account" | "business">(() => {
    const raw = String(searchParams.get("mode") || "").trim();
    return raw === "business" ? "business" : "account";
  }, [searchParams]);

  const handleModeChange = (next: "account" | "business") => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("mode", next);
    setSearchParams(nextParams, { replace: true });
  };

  const handleComplete = () => {
    void markWizardCompleted().finally(() => {
      const latest = useAuthStore.getState().user;
      navigate(resolvePostOnboardingPath(latest), { replace: true });
    });
  };

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (user?.onboardingWizardCompleted) {
    return <Navigate to={resolvePostOnboardingPath(user)} replace />;
  }

  return (
    <SettingsWizard
      mode={mode}
      user={user}
      onRequestModeChange={handleModeChange}
      onWizardComplete={handleComplete}
    />
  );
};

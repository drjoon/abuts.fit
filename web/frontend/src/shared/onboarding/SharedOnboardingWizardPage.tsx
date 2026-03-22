import { useEffect, useMemo } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { apiFetch } from "@/shared/api/apiClient";
import { SettingsWizard } from "./wizard/SettingsWizard";

export const SharedOnboardingWizardPage = () => {
  const { user, token, setUser, loginWithToken } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (!user) return;
    if (!user.role) {
      navigate("/dashboard", { replace: true });
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
      navigate("/dashboard", { replace: true });
    });
  };

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (user?.onboardingWizardCompleted) {
    return <Navigate to="/dashboard" replace />;
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

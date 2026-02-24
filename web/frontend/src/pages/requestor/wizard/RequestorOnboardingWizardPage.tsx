import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { apiFetch } from "@/shared/api/apiClient";
import { onAppEvent } from "@/shared/realtime/socket";
import { SettingsWizard } from "@/features/onboarding/wizard/SettingsWizard";

const GUIDE_PROGRESS_PATH = "/api/guide-progress/requestor-onboarding";

type BackendGuideProgress = {
  finishedAt?: string | null;
};

export const RequestorOnboardingWizardPage = () => {
  const { user, token } = useAuthStore();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [progress, setProgress] = useState<BackendGuideProgress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    if (!user.role) {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate, user]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const res = await apiFetch<any>({
          path: GUIDE_PROGRESS_PATH,
          method: "GET",
          token,
        });
        if (cancelled) return;
        if (!res.ok) return;
        const body = res.data || {};
        const data = body.data || body;
        setProgress(data);
      } catch {
        if (!cancelled) setProgress(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const unsubscribe = onAppEvent((evt) => {
      if (evt.type !== "guide-progress:updated") return;
      const payload = evt.data || {};
      if (payload?.tourId !== "requestor-onboarding") return;
      setProgress(payload);
      setLoading(false);
    });
    return () => {
      unsubscribe?.();
    };
  }, [token]);

  useEffect(() => {
    if (!progress?.finishedAt) return;
    const timer = window.setTimeout(() => {
      navigate("/dashboard", { replace: true });
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [navigate, progress?.finishedAt]);

  const mode = useMemo<"account" | "organization">(() => {
    const raw = String(searchParams.get("mode") || "").trim();
    return raw === "organization" ? "organization" : "account";
  }, [searchParams]);

  const handleModeChange = (next: "account" | "organization") => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("mode", next);
    setSearchParams(nextParams, { replace: true });
  };

  const handleComplete = () => {
    window.setTimeout(() => {
      navigate("/dashboard", { replace: true });
    }, 1500);
  };

  if (loading || !progress) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f6f7fb]">
        <div className="text-sm text-slate-500">마법사를 불러오는 중...</div>
      </div>
    );
  }

  if (progress.finishedAt) {
    return null;
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

// related files:
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/features/settings/tabs/LabFeeScheduleTab.tsx
// - web/frontend/src/pages/requestor/settings/SettingsPage.tsx
// - web/backend/controllers/labTradingPartners/labTradingPartner.controller.js
// - 2026-08-13: 기공소 로그인 시 기공비 미설정이면 설정 탭으로 유도.
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";

export const LAB_FEE_SETTINGS_PATH = "/dashboard/settings?tab=lab-fees";

const sessionKey = (userId: string) => `abuts:lab-fee-setup-prompted:${userId}`;

type FeeSchedulePayload = {
  data?: { configured?: boolean; updatedAt?: string | null };
  configured?: boolean;
  updatedAt?: string | null;
};

const isLabFeeSettingsPath = (pathname: string, search: string) =>
  pathname.startsWith("/dashboard/settings") &&
  new URLSearchParams(search).get("tab") === "lab-fees";

export const LabFeeSetupPrompt = ({
  isLab,
  ready,
}: {
  isLab: boolean;
  ready: boolean;
}) => {
  const { token, user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const alreadyOnSettings = isLabFeeSettingsPath(
    location.pathname,
    location.search,
  );

  useEffect(() => {
    if (!ready || !isLab || !token || !user?.id) {
      setOpen(false);
      return;
    }
    if (alreadyOnSettings) {
      setOpen(false);
      return;
    }
    try {
      if (sessionStorage.getItem(sessionKey(String(user.id))) === "1") {
        setOpen(false);
        return;
      }
    } catch {
      // ignore
    }

    let cancelled = false;
    void apiFetch<FeeSchedulePayload>({
      path: "/api/lab-trading-partners/fee-schedule",
      method: "GET",
      token,
    }).then((res) => {
      if (cancelled) return;
      if (!res.ok) return;
      const body =
        res.data && typeof res.data === "object" ? res.data : null;
      const data = body?.data && typeof body.data === "object" ? body.data : body;
      if (!data || typeof data !== "object") return;
      const configured =
        typeof data.configured === "boolean"
          ? data.configured
          : Boolean(data.updatedAt);
      if (!configured) setOpen(true);
    });

    return () => {
      cancelled = true;
    };
  }, [alreadyOnSettings, isLab, ready, token, user?.id]);

  const goToSettings = () => {
    if (user?.id) {
      try {
        sessionStorage.setItem(sessionKey(String(user.id)), "1");
      } catch {
        // ignore
      }
    }
    setOpen(false);
    navigate(LAB_FEE_SETTINGS_PATH);
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setOpen(true);
          return;
        }
        if (open) goToSettings();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>기공비 미설정</AlertDialogTitle>
          <AlertDialogDescription>
            기공비를 아직 설정하지 않았습니다. 확인을 누르면 기공비 설정
            페이지로 이동합니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={goToSettings}>확인</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

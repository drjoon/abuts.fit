// related files:
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/features/settings/LabFeeSetupPrompt.tsx
// - web/frontend/src/features/settings/tabs/ThreeShapeIntegrationTab.tsx
// - web/backend/controllers/integrations/threeShape.controller.js
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";

export const THREE_SHAPE_SETTINGS_PATH = "/dashboard/settings?tab=3shape";

const sessionKeyDismissed = (userId: string) =>
  `abuts:3shape-connect-prompted:${userId}`;

const readSessionFlag = (key: string) => {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};

const writeSessionFlag = (key: string) => {
  try {
    sessionStorage.setItem(key, "1");
  } catch {
    // ignore
  }
};

const isThreeShapeSettingsPath = (pathname: string, search: string) =>
  pathname.startsWith("/dashboard/settings") &&
  new URLSearchParams(search).get("tab") === "3shape";

type IntegrationPayload = {
  data?: {
    status?: string;
  };
  status?: string;
};

type RequestSettingsPayload = {
  data?: {
    designSoftware?: string | null;
  };
  designSoftware?: string | null;
};

const readIntegrationStatus = (raw: unknown): string => {
  if (!raw || typeof raw !== "object") return "disconnected";
  const body = raw as IntegrationPayload;
  const nested =
    body.data && typeof body.data === "object" ? body.data : body;
  return String(nested.status || "disconnected").trim() || "disconnected";
};

const readDesignSoftware = (raw: unknown): string => {
  if (!raw || typeof raw !== "object") return "";
  const body = raw as RequestSettingsPayload;
  const nested =
    body.data && typeof body.data === "object" ? body.data : body;
  return String(nested.designSoftware || "").trim();
};

/**
 * 기공소 로그인 시 Communicate 미연결이면 TRIOS 수신 여부를 확인하고
 * 맞으면 3Shape 연동 설정으로 유도한다.
 * - designSoftware=3Shape → 강하게 연결 유도
 * - ExoCAD 등 → TRIOS 사용 여부 확인 후 연결 유도
 */
export const ThreeShapeConnectPrompt = ({
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
  const [isLikelyTrios, setIsLikelyTrios] = useState(false);

  const alreadyOnSettings = isThreeShapeSettingsPath(
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

    const userId = String(user.id);
    if (readSessionFlag(sessionKeyDismissed(userId))) {
      setOpen(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      const [integrationRes, settingsRes] = await Promise.all([
        apiFetch<IntegrationPayload>({
          path: "/api/integrations/3shape",
          method: "GET",
          token,
        }),
        apiFetch<RequestSettingsPayload>({
          path: "/api/businesses/me/request-settings",
          method: "GET",
          token,
        }),
      ]);
      if (cancelled) return;

      const status = integrationRes.ok
        ? readIntegrationStatus(integrationRes.data)
        : "disconnected";
      if (status === "connected") {
        setOpen(false);
        return;
      }

      const designSoftware = settingsRes.ok
        ? readDesignSoftware(settingsRes.data)
        : "";
      const likely =
        designSoftware.toLowerCase() === "3shape" ||
        designSoftware === "3Shape";
      setIsLikelyTrios(likely);
      setOpen(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    alreadyOnSettings,
    isLab,
    ready,
    token,
    user?.id,
  ]);

  const dismiss = () => {
    if (user?.id) writeSessionFlag(sessionKeyDismissed(String(user.id)));
    setOpen(false);
  };

  const goToConnect = () => {
    if (user?.id) writeSessionFlag(sessionKeyDismissed(String(user.id)));
    setOpen(false);
    navigate(THREE_SHAPE_SETTINGS_PATH);
  };

  const title = isLikelyTrios
    ? "3Shape Communicate 연결"
    : "TRIOS 스캔을 받으시나요?";

  const description = isLikelyTrios
    ? "디자인 소프트웨어가 3Shape으로 설정되어 있습니다. Communicate 계정을 연결하면 치과 TRIOS 의뢰가 기공의뢰 수신함으로 자동 들어옵니다."
    : "ExoCAD 등 다른 CAD를 쓰더라도 TRIOS 스캐너로 의뢰를 받을 수 있습니다. Communicate 계정을 연결하면 치과 TRIOS 의뢰가 수신함으로 자동 들어옵니다.";

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setOpen(true);
          return;
        }
        dismiss();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
          <AlertDialogCancel onClick={dismiss}>나중에</AlertDialogCancel>
          <AlertDialogAction onClick={goToConnect}>
            Communicate 연결
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

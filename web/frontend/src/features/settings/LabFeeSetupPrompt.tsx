// related files:
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/features/settings/tabs/LabFeeScheduleTab.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/backend/controllers/labTradingPartners/labTradingPartner.controller.js
// - 2026-08-19: 수락 시 빠진 수가명을 `need` 쿼리로 넘기고 해당 카드를 하이라이트.
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

export const LAB_FEE_SETTINGS_PATH = "/dashboard/settings?tab=lab-fees&setup=1";
export const LAB_FEE_SETTINGS_FROM_ACCEPT_PATH = `${LAB_FEE_SETTINGS_PATH}&from=accept`;
export const LAB_FEE_UNCONFIGURED_REASON = "lab_fee_unconfigured";

export const parseLabFeeNeedNames = (search: string) => {
  const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
  const names: string[] = [];
  const seen = new Set<string>();
  for (const raw of params.getAll("need")) {
    for (const part of String(raw || "").split(",")) {
      const name = String(part || "").trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
  }
  return names;
};

export const labFeeSettingsFromAcceptPath = (needNames?: string[]) => {
  const params = new URLSearchParams({
    tab: "lab-fees",
    setup: "1",
    from: "accept",
  });
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(needNames) ? needNames : []) {
    const name = String(raw || "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    unique.push(name);
  }
  if (unique.length) params.set("need", unique.join(","));
  return `/dashboard/settings?${params.toString()}`;
};

export const readLabFeeScheduleConfigured = (raw: unknown): boolean | null => {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  const nested =
    body.data && typeof body.data === "object"
      ? (body.data as Record<string, unknown>)
      : body;
  if (typeof nested.configured === "boolean") return nested.configured;
  if (typeof nested.active === "boolean") return nested.active;
  return null;
};

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
  const fromAccept =
    alreadyOnSettings &&
    new URLSearchParams(location.search).get("from") === "accept";
  const needNames = parseLabFeeNeedNames(location.search);

  useEffect(() => {
    if (!ready || !isLab || !token || !user?.id) {
      setOpen(false);
      return;
    }
    if (alreadyOnSettings && fromAccept && needNames.length > 0) {
      setOpen(false);
      return;
    }
    if (alreadyOnSettings && !fromAccept) {
      setOpen(false);
      return;
    }
    if (!fromAccept) {
      try {
        if (sessionStorage.getItem(sessionKey(String(user.id))) === "1") {
          setOpen(false);
          return;
        }
      } catch {
        // ignore
      }
    }

    let cancelled = false;
    void apiFetch<FeeSchedulePayload>({
      path: "/api/lab-trading-partners/fee-schedule",
      method: "GET",
      token,
    }).then((res) => {
      if (cancelled) return;
      if (!res.ok) return;
      const configured = readLabFeeScheduleConfigured(res.data);
      if (configured === false) setOpen(true);
    });

    return () => {
      cancelled = true;
    };
  }, [alreadyOnSettings, fromAccept, isLab, needNames.length, ready, token, user?.id]);

  const goToSettings = () => {
    if (user?.id) {
      try {
        sessionStorage.setItem(sessionKey(String(user.id)), "1");
      } catch {
        // ignore
      }
    }
    setOpen(false);
    navigate(
      fromAccept
        ? labFeeSettingsFromAcceptPath(needNames)
        : LAB_FEE_SETTINGS_PATH,
    );
  };

  const dismissAcceptPrompt = () => setOpen(false);

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setOpen(true);
          return;
        }
        if (fromAccept) {
          dismissAcceptPrompt();
          return;
        }
        if (open) goToSettings();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {fromAccept ? "기공비 설정이 필요합니다" : "기공비 미설정"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {fromAccept
              ? needNames.length
                ? `「${needNames.join("·")}」 수가가 없습니다. 깜빡이는 카드를 켜고 원가를 입력한 뒤, 기공의뢰수신에서 다시 수락해 주세요.`
                : "의뢰를 수락하려면 기공비를 먼저 설정해야 합니다. 오른쪽 마스터 스위치를 켜고, 제공할 항목을 켠 뒤 저장하세요. 완료 후 기공의뢰수신에서 다시 수락해 주세요."
              : "기공비를 아직 설정하지 않았습니다. 확인을 누르면 기공비 설정 페이지로 이동합니다."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            onClick={fromAccept ? dismissAcceptPrompt : goToSettings}
          >
            확인
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

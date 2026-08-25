// related files:
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/features/settings/tabs/LabFeeScheduleTab.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/backend/controllers/labTradingPartners/labTradingPartner.controller.js
// - 2026-08-25: 기본 기공수가 신규 항목(needSetupNames)도 재접속 시 설정 탭·need 하이라이트로 안내.
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

export const labFeeSettingsNeedPath = (
  needNames?: string[],
  from: "accept" | "catalog" = "accept",
) => {
  const params = new URLSearchParams({
    tab: "lab-fees",
    setup: "1",
    from,
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

export const labFeeSettingsFromAcceptPath = (needNames?: string[]) =>
  labFeeSettingsNeedPath(needNames, "accept");

export const labFeeSettingsFromCatalogPath = (needNames?: string[]) =>
  labFeeSettingsNeedPath(needNames, "catalog");

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

export const readLabFeeNeedSetupNames = (raw: unknown): string[] => {
  if (!raw || typeof raw !== "object") return [];
  const body = raw as Record<string, unknown>;
  const nested =
    body.data && typeof body.data === "object"
      ? (body.data as Record<string, unknown>)
      : body;
  const list = Array.isArray(nested.needSetupNames)
    ? nested.needSetupNames
    : [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const rawName of list) {
    const name = String(rawName || "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
};

const sessionKeyUnconfigured = (userId: string) =>
  `abuts:lab-fee-setup-prompted:${userId}`;
const sessionKeyCatalog = (userId: string) =>
  `abuts:lab-fee-catalog-setup-prompted:${userId}`;

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

type FeeSchedulePayload = {
  data?: {
    configured?: boolean;
    updatedAt?: string | null;
    needSetupNames?: string[];
  };
  configured?: boolean;
  updatedAt?: string | null;
  needSetupNames?: string[];
};

const isLabFeeSettingsPath = (pathname: string, search: string) =>
  pathname.startsWith("/dashboard/settings") &&
  new URLSearchParams(search).get("tab") === "lab-fees";

type PromptMode = "unconfigured" | "catalog";

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
  const [mode, setMode] = useState<PromptMode>("unconfigured");
  const [catalogNeedNames, setCatalogNeedNames] = useState<string[]>([]);

  const alreadyOnSettings = isLabFeeSettingsPath(
    location.pathname,
    location.search,
  );
  const fromParam = new URLSearchParams(location.search).get("from");
  const fromAccept = alreadyOnSettings && fromParam === "accept";
  const fromCatalog = alreadyOnSettings && fromParam === "catalog";
  const needNames = parseLabFeeNeedNames(location.search);

  useEffect(() => {
    if (!ready || !isLab || !token || !user?.id) {
      setOpen(false);
      return;
    }
    if (
      alreadyOnSettings &&
      (fromAccept || fromCatalog) &&
      needNames.length > 0
    ) {
      setOpen(false);
      return;
    }
    if (alreadyOnSettings && !fromAccept && !fromCatalog) {
      setOpen(false);
      return;
    }

    const userId = String(user.id);
    const skipUnconfigured = readSessionFlag(sessionKeyUnconfigured(userId));
    const skipCatalog = readSessionFlag(sessionKeyCatalog(userId));
    if (!fromAccept && skipUnconfigured && skipCatalog) {
      setOpen(false);
      return;
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
      const setupNames = readLabFeeNeedSetupNames(res.data);

      if (configured === false && !skipUnconfigured) {
        setMode("unconfigured");
        setCatalogNeedNames([]);
        setOpen(true);
        return;
      }

      if (setupNames.length && !skipCatalog) {
        setMode("catalog");
        setCatalogNeedNames(setupNames);
        setOpen(true);
        return;
      }

      setOpen(false);
    });

    return () => {
      cancelled = true;
    };
  }, [
    alreadyOnSettings,
    fromAccept,
    fromCatalog,
    isLab,
    needNames.length,
    ready,
    token,
    user?.id,
  ]);

  const goToSettings = () => {
    if (user?.id) {
      if (mode === "catalog") {
        writeSessionFlag(sessionKeyCatalog(String(user.id)));
      } else {
        writeSessionFlag(sessionKeyUnconfigured(String(user.id)));
      }
    }
    setOpen(false);
    if (mode === "catalog") {
      navigate(labFeeSettingsFromCatalogPath(catalogNeedNames));
      return;
    }
    if (fromAccept) {
      navigate(labFeeSettingsFromAcceptPath(needNames));
      return;
    }
    navigate(LAB_FEE_SETTINGS_PATH);
  };

  const dismissAcceptPrompt = () => setOpen(false);

  const title =
    mode === "catalog"
      ? "신규 기공수가 설정"
      : fromAccept
        ? "기공비 설정이 필요합니다"
        : "기공비 미설정";

  const description =
    mode === "catalog"
      ? catalogNeedNames.length
        ? `기본 기공수가에 「${catalogNeedNames.join("·")}」이(가) 추가되었습니다. 깜빡이는 카드를 켜고 수가를 확인·저장해 주세요.`
        : "기본 기공수가에 새 항목이 추가되었습니다. 확인을 누르면 기공비 설정 페이지로 이동합니다."
      : fromAccept
        ? needNames.length
          ? `「${needNames.join("·")}」 수가가 없습니다. 깜빡이는 카드를 켜고 수가를 입력한 뒤, 기공의뢰수신에서 다시 수락해 주세요.`
          : "의뢰를 수락하려면 기공비를 먼저 설정해야 합니다. 오른쪽 마스터 스위치를 켜고, 제공할 항목을 켠 뒤 저장하세요. 완료 후 기공의뢰수신에서 다시 수락해 주세요."
        : "기공비를 아직 설정하지 않았습니다. 확인을 누르면 기공비 설정 페이지로 이동합니다.";

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
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
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

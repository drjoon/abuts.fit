// related files:
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/features/settings/tabs/LabFeeScheduleTab.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
// - web/backend/controllers/labTradingPartners/labTradingPartner.controller.js
// - 2026-09-21: freeRemakeYears 미설정 시 설정 탭 포워드·하이라이트.
// - 2026-08-25: 안내 문구 — 치과 의뢰·기공비 정상 결제 위해 해당 카드 설정 필수.
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
import { normalizeFreeRemakeYears } from "@/shared/practice/labFeeSchedule";

export const LAB_FEE_SETTINGS_PATH = "/dashboard/settings?tab=lab-fees&setup=1";
export const LAB_FEE_SETTINGS_FROM_ACCEPT_PATH = `${LAB_FEE_SETTINGS_PATH}&from=accept`;
export const LAB_FEE_SETTINGS_FROM_FREE_REMAKE_PATH = `${LAB_FEE_SETTINGS_PATH}&from=freeRemake`;
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
  from: "accept" | "catalog" | "freeRemake" = "accept",
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

export const labFeeSettingsFromFreeRemakePath = () =>
  labFeeSettingsNeedPath(undefined, "freeRemake");

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

export const readLabFeeFreeRemakeYears = (raw: unknown): number | null => {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as Record<string, unknown>;
  const nested =
    body.data && typeof body.data === "object"
      ? (body.data as Record<string, unknown>)
      : body;
  return normalizeFreeRemakeYears(nested.freeRemakeYears);
};

const sessionKeyUnconfigured = (userId: string) =>
  `abuts:lab-fee-setup-prompted:${userId}`;
const sessionKeyCatalog = (userId: string) =>
  `abuts:lab-fee-catalog-setup-prompted:${userId}`;
const sessionKeyFreeRemake = (userId: string) =>
  `abuts:lab-fee-free-remake-prompted:${userId}`;

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
    freeRemakeYears?: number | null;
  };
  configured?: boolean;
  updatedAt?: string | null;
  needSetupNames?: string[];
  freeRemakeYears?: number | null;
};

const isLabFeeSettingsPath = (pathname: string, search: string) =>
  pathname.startsWith("/dashboard/settings") &&
  new URLSearchParams(search).get("tab") === "lab-fees";

type PromptMode = "unconfigured" | "catalog" | "freeRemake";

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
  const fromFreeRemake = alreadyOnSettings && fromParam === "freeRemake";
  const needNames = parseLabFeeNeedNames(location.search);

  useEffect(() => {
    if (!ready || !isLab || !token || !user?.id) {
      setOpen(false);
      return;
    }
    if (
      alreadyOnSettings &&
      (fromAccept || fromCatalog || fromFreeRemake) &&
      (fromFreeRemake || needNames.length > 0)
    ) {
      setOpen(false);
      return;
    }
    if (alreadyOnSettings && !fromAccept && !fromCatalog && !fromFreeRemake) {
      setOpen(false);
      return;
    }

    const userId = String(user.id);
    const skipUnconfigured = readSessionFlag(sessionKeyUnconfigured(userId));
    const skipCatalog = readSessionFlag(sessionKeyCatalog(userId));
    const skipFreeRemake = readSessionFlag(sessionKeyFreeRemake(userId));
    if (!fromAccept && skipUnconfigured && skipCatalog && skipFreeRemake) {
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
      const freeRemakeYears = readLabFeeFreeRemakeYears(res.data);

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

      if (freeRemakeYears == null && !skipFreeRemake) {
        setMode("freeRemake");
        setCatalogNeedNames([]);
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
    fromFreeRemake,
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
      } else if (mode === "freeRemake") {
        writeSessionFlag(sessionKeyFreeRemake(String(user.id)));
      } else {
        writeSessionFlag(sessionKeyUnconfigured(String(user.id)));
      }
    }
    setOpen(false);
    if (mode === "catalog") {
      navigate(labFeeSettingsFromCatalogPath(catalogNeedNames));
      return;
    }
    if (mode === "freeRemake") {
      navigate(labFeeSettingsFromFreeRemakePath());
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
    mode === "freeRemake"
      ? "무료 리메이크 기간 설정"
      : mode === "catalog"
        ? "기공수가 설정이 필요합니다"
        : fromAccept
          ? "기공수가 설정이 필요합니다"
          : "기공비 미설정";

  const needLabel = (names: string[]) =>
    names.length ? `「${names.join("·")}」` : "해당";

  const description =
    mode === "freeRemake"
      ? "치과→기공소 무료 리메이크 기간(년)을 아직 정하지 않았습니다. 확인을 누르면 기공비 설정에서 기간을 지정할 수 있습니다. 0년이면 유료, 1년 이상이면 그 기간 동안 무료입니다."
      : mode === "catalog"
        ? catalogNeedNames.length
          ? `치과에서 의뢰가 들어올 수 있습니다. 기공비를 정상적으로 받으려면 ${needLabel(catalogNeedNames)} 수가를 켜고 설정하세요.`
          : "치과 의뢰를 정상적으로 받으려면 기공수가를 설정해야 합니다. 확인을 누르면 기공비 설정 페이지로 이동합니다."
        : fromAccept
          ? needNames.length
            ? `치과에서 의뢰가 들어왔습니다. 기공비를 정상적으로 받으려면 ${needLabel(needNames)} 수가를 켜고 설정한 뒤, 기공의뢰수신에서 다시 작업시작해 주세요.`
            : "치과에서 의뢰가 들어왔습니다. 기공비를 정상적으로 받으려면 기공수가를 먼저 설정한 뒤, 기공의뢰수신에서 다시 작업시작해 주세요."
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

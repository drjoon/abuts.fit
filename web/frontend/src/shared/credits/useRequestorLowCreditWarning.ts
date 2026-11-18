// related files:
// - web/frontend/src/shared/credits/RequestorLowCreditWarning.tsx
// - web/frontend/src/shared/notices/DashboardImportantNoticesRail.tsx
// - web/backend/services/requestorLowCreditWarning.service.js
//
// PTX·커스텀어벗 의뢰 화면용 저잔액 경고 상태. 배너·모달·중요 공지 레일이 공유한다.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useLocation } from "react-router-dom";
import { apiFetch } from "@/shared/api/apiClient";
import { canAccessSettlement } from "@/shared/business/departmentAccess";
import { isCreditEventForBusiness } from "@/shared/realtime/creditBalanceEvent";
import { useAppEventDebouncedReload } from "@/shared/realtime/useAppEventDebouncedReload";
import { useAuthStore } from "@/store/useAuthStore";

export const LOW_CREDIT_CHARGE_HREF = "/dashboard/credits?tab=charge";

const FOREVER_PREFIX = "abutsfit:low-credit-modal-dismissed:";
const SESSION_PREFIX = "abutsfit:low-credit-modal-session:";

export type LowCreditWarning = {
  active?: boolean;
  orderableCredit?: number;
  lastChargeAmount?: number;
  lastChargeJournalId?: string | null;
};

type BalanceResponse = {
  data?: {
    requestorKind?: string | null;
    lowCreditWarning?: LowCreditWarning | null;
  };
  requestorKind?: string | null;
  lowCreditWarning?: LowCreditWarning | null;
};

const isWarningRoute = (pathname: string) =>
  pathname.startsWith("/dashboard/new-request") ||
  pathname.startsWith("/dashboard/practice-transfers");

const isRequestorRole = (role: string | null | undefined) =>
  role === "requestor" || role === "internalLab" || role === "practice";

const storageKey = (prefix: string, userId: string, journalId: string) =>
  `${prefix}${userId}:${journalId}`;

export const readLowCreditFlag = (storage: Storage, key: string) => {
  try {
    return storage.getItem(key) === "1";
  } catch {
    return false;
  }
};

export const writeLowCreditFlag = (storage: Storage, key: string) => {
  try {
    storage.setItem(key, "1");
  } catch {
    // ignore
  }
};

export function formatLowCreditWon(value: number) {
  return `${Math.max(0, Math.round(value)).toLocaleString("ko-KR")}원`;
}

export type RequestorLowCreditWarningState = ReturnType<
  typeof useRequestorLowCreditWarning
>;

export const RequestorLowCreditWarningContext =
  createContext<RequestorLowCreditWarningState | null>(null);

/** 중요 공지 레일 등 — Provider 안에서만 값이 있다. */
export function useRequestorLowCreditWarningContext() {
  return useContext(RequestorLowCreditWarningContext);
}

export function useRequestorLowCreditWarning() {
  const location = useLocation();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const userId = String(user?.id || "").trim();
  const role = user?.role;
  const enabled =
    Boolean(token) &&
    Boolean(userId) &&
    isRequestorRole(role) &&
    isWarningRoute(location.pathname);

  const [warning, setWarning] = useState<LowCreditWarning | null>(null);
  const [requestorKind, setRequestorKind] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [hideForever, setHideForever] = useState(false);
  const [seenThisSession, setSeenThisSession] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const res = await apiFetch<BalanceResponse>({
      path: "/api/credits/balance",
      method: "GET",
      token,
    });
    if (!res.ok) {
      setWarning(null);
      return;
    }
    const body = res.data || {};
    const data = body.data || body;
    setRequestorKind(String(data.requestorKind || "").trim());
    setWarning(data.lowCreditWarning || null);
  }, [token]);

  useEffect(() => {
    if (!enabled) {
      setWarning(null);
      setModalOpen(false);
      return;
    }
    let cancelled = false;
    void load().catch(() => {
      if (!cancelled) setWarning(null);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, load]);

  useAppEventDebouncedReload({
    enabled,
    eventTypes: ["credit:balance-updated"],
    delayMs: 80,
    shouldHandle: (evt) =>
      isCreditEventForBusiness(evt, user?.businessAnchorId),
    onMatch: () => load(),
  });

  const journalId = String(warning?.lastChargeJournalId || "").trim();
  const active = Boolean(warning?.active) && Boolean(journalId);
  const forever = active
    ? readLowCreditFlag(
        localStorage,
        storageKey(FOREVER_PREFIX, userId, journalId),
      )
    : false;
  const sessionSeen = active
    ? readLowCreditFlag(
        sessionStorage,
        storageKey(SESSION_PREFIX, userId, journalId),
      )
    : false;

  useEffect(() => {
    setHideForever(false);
    if (!active) {
      setModalOpen(false);
      setSeenThisSession(false);
      return;
    }
    if (forever || sessionSeen) {
      setModalOpen(false);
      setSeenThisSession(true);
      return;
    }
    setModalOpen(true);
    setSeenThisSession(false);
  }, [active, forever, journalId, sessionSeen]);

  const orderable = Math.max(
    0,
    Math.round(Number(warning?.orderableCredit) || 0),
  );
  const lastCharge = Math.max(
    0,
    Math.round(Number(warning?.lastChargeAmount) || 0),
  );
  const canCharge =
    canAccessSettlement(user) &&
    (requestorKind === "lab" || role === "internalLab");
  const showBanner =
    enabled &&
    active &&
    Boolean(warning) &&
    !modalOpen &&
    (forever || sessionSeen || seenThisSession);

  const dismissModal = () => {
    if (!journalId) {
      setModalOpen(false);
      return;
    }
    if (hideForever) {
      writeLowCreditFlag(
        localStorage,
        storageKey(FOREVER_PREFIX, userId, journalId),
      );
    }
    writeLowCreditFlag(
      sessionStorage,
      storageKey(SESSION_PREFIX, userId, journalId),
    );
    setSeenThisSession(true);
    setModalOpen(false);
  };

  return {
    enabled,
    active,
    warning,
    orderable,
    lastCharge,
    canCharge,
    showBanner,
    modalOpen,
    hideForever,
    setHideForever,
    dismissModal,
  };
}

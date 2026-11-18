// related files:
// - web/backend/services/requestorLowCreditWarning.service.js
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/business/departmentAccess.ts
//
// PTX·커스텀어벗 의뢰 화면. 최근 충전의 1/4 이하이면 모달 한 번, 이후에는 남은 금액.
// 정산 메뉴가 없는 기공사도 같은 경고를 본다. 충전 버튼은 정산을 볼 수 있는 기공소만.

import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { apiFetch } from "@/shared/api/apiClient";
import { canAccessSettlement } from "@/shared/business/departmentAccess";
import { isCreditEventForBusiness } from "@/shared/realtime/creditBalanceEvent";
import { useAppEventDebouncedReload } from "@/shared/realtime/useAppEventDebouncedReload";
import { useAuthStore } from "@/store/useAuthStore";
import { CONTENT_MEASURED_CHROME_CLASS } from "@/shared/ui/contentMeasuredChrome";
import { cn } from "@/shared/ui/cn";

const FOREVER_PREFIX = "abutsfit:low-credit-modal-dismissed:";
const SESSION_PREFIX = "abutsfit:low-credit-modal-session:";
const CHARGE_HREF = "/dashboard/credits?tab=charge";

type LowCreditWarning = {
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

const formatWon = (value: number) =>
  `${Math.max(0, Math.round(value)).toLocaleString("ko-KR")}원`;

const isWarningRoute = (pathname: string) =>
  pathname.startsWith("/dashboard/new-request") ||
  pathname.startsWith("/dashboard/practice-transfers");

const isRequestorRole = (role: string | null | undefined) =>
  role === "requestor" || role === "internalLab" || role === "practice";

const storageKey = (prefix: string, userId: string, journalId: string) =>
  `${prefix}${userId}:${journalId}`;

const readFlag = (storage: Storage, key: string) => {
  try {
    return storage.getItem(key) === "1";
  } catch {
    return false;
  }
};

const writeFlag = (storage: Storage, key: string) => {
  try {
    storage.setItem(key, "1");
  } catch {
    // ignore
  }
};

export function RequestorLowCreditWarning() {
  const location = useLocation();
  const navigate = useNavigate();
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
    void load()
      .catch(() => {
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
    ? readFlag(localStorage, storageKey(FOREVER_PREFIX, userId, journalId))
    : false;
  const sessionSeen = active
    ? readFlag(sessionStorage, storageKey(SESSION_PREFIX, userId, journalId))
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

  if (!enabled || !active || !warning) return null;

  const orderable = Math.max(0, Math.round(Number(warning.orderableCredit) || 0));
  const lastCharge = Math.max(0, Math.round(Number(warning.lastChargeAmount) || 0));
  const canCharge =
    canAccessSettlement(user) &&
    (requestorKind === "lab" || role === "internalLab");
  const showBanner = !modalOpen && (forever || sessionSeen || seenThisSession);

  const dismissModal = () => {
    if (hideForever) {
      writeFlag(localStorage, storageKey(FOREVER_PREFIX, userId, journalId));
    }
    writeFlag(sessionStorage, storageKey(SESSION_PREFIX, userId, journalId));
    setSeenThisSession(true);
    setModalOpen(false);
  };

  return (
    <>
      {showBanner ? (
        <div className="shrink-0 px-3 pt-2">
          <div
            className={cn(
              CONTENT_MEASURED_CHROME_CLASS,
              "flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-950",
            )}
          >
            <span className="min-w-0">남은 크레딧 {formatWon(orderable)}</span>
            {canCharge ? (
              <button
                type="button"
                className="shrink-0 rounded-md px-1.5 py-0.5 text-amber-950 underline underline-offset-2"
                onClick={() => navigate(CHARGE_HREF)}
              >
                충전
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <ConfirmDialog
        open={modalOpen}
        title="크레딧이 얼마 남지 않았습니다"
        confirmTone="primary"
        confirmLabel={canCharge ? "충전" : "닫기"}
        cancelLabel="닫기"
        showCancel={canCharge}
        closeOnBackdrop={false}
        footerLeading={
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={hideForever}
              onChange={(event) => setHideForever(event.target.checked)}
            />
            다시 보지 않기
          </label>
        }
        description={
          <p>
            남은 크레딧은 {formatWon(orderable)}입니다.
            <br />
            최근 충전 {formatWon(lastCharge)}의 4분의 1 이하입니다.
          </p>
        }
        onCancel={dismissModal}
        onConfirm={() => {
          dismissModal();
          if (canCharge) navigate(CHARGE_HREF);
        }}
      />
    </>
  );
}

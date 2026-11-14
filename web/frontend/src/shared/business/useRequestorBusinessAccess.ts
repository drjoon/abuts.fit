// related files:
// - web/frontend/src/shared/business/requestorCapabilities.ts
// - web/frontend/src/shared/components/business/settings/business/businessMeCache.ts
// change-log:
// - 2026-08-15: internalLab(어벗츠기공소) — lab 수신 + 사업자 me, 디자인 큐는 기공의뢰수신.
// - 2026-08-11: 초기 1회만 loading=true — 이후 refresh는 silent(페이지 스켈레톤 플리커 방지).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { resolveBusinessType } from "@/shared/utils/resolveBusinessType";
import {
  loadBusinessMeCached,
  invalidateBusinessMeCache,
} from "@/shared/components/business/settings/business/businessMeCache";
import {
  REQUESTOR_ACCESS_UPDATED_EVENT,
  canReceivePracticeTransfer,
  canSendPracticeTransfer,
  canUseFreeServices,
  canUsePaidServices,
  hasRequestorProfile,
  requiresBusinessLicense,
  normalizePracticeHasInHouseLabFlag,
  normalizeRequestorKind,
  resolveRequestorProfile,
  type RequestorProfile,
} from "@/shared/business/requestorCapabilities";
import { whenPracticeCalendarPainted } from "@/shared/practice/practiceCalendarFirstPaint";

const emptyProfile = (): RequestorProfile => ({
  kind: null,
  services: { free: false, paid: false },
});

const INTERNAL_LAB_PROFILE: RequestorProfile = {
  kind: "lab",
  services: { free: false, paid: true },
};

const requestorAccessKnownOnUser = (user: {
  role?: string | null;
  requestorKind?: string | null;
} | null | undefined) =>
  Boolean(
    user?.role === "internalLab" ||
      user?.role === "practice" ||
      (user?.role && user.role !== "requestor") ||
      normalizeRequestorKind(user?.requestorKind),
  );

export const useRequestorBusinessAccess = () => {
  const { token, user } = useAuthStore();
  const location = useLocation();
  const [loading, setLoading] = useState(
    () => Boolean(token) && !requestorAccessKnownOnUser(user),
  );
  const [businessVerified, setBusinessVerified] = useState(() =>
    Boolean(user?.businessVerified),
  );
  const [verificationPending, setVerificationPending] = useState(false);
  const [profile, setProfile] = useState<RequestorProfile>(() =>
    user?.role === "internalLab"
      ? INTERNAL_LAB_PROFILE
      : resolveRequestorProfile({
          userKind: user?.requestorKind,
          userServices: user?.requestorServices,
          userCaps: user?.requestorCapabilities,
          userRole: user?.role,
          businessVerified: Boolean(user?.businessVerified),
        }),
  );
  const [membership, setMembership] = useState<string>("none");
  const [designAccessEnabled, setDesignAccessEnabled] = useState(false);
  const [practiceHasInHouseLab, setPracticeHasInHouseLab] = useState<
    boolean | null
  >(() => normalizePracticeHasInHouseLabFlag(user?.practiceHasInHouseLab));
  const hasLoadedOnceRef = useRef(false);

  const isInternalLab = user?.role === "internalLab";

  const businessType = useMemo(
    () => resolveBusinessType(user?.role, "requestor"),
    [user?.role],
  );

  const refresh = useCallback(async () => {
    if (!token) {
      setLoading(false);
      hasLoadedOnceRef.current = true;
      setBusinessVerified(false);
      setDesignAccessEnabled(false);
      setPracticeHasInHouseLab(null);
      setProfile(emptyProfile());
      return;
    }

    // 어벗츠기공소: 기공의뢰수신용 lab 수신. 디자인 큐는 LabWorkPage에서 직접 켠다.
    if (isInternalLab) {
      if (!hasLoadedOnceRef.current && !requestorAccessKnownOnUser(user)) {
        setLoading(true);
      }
      try {
        const data = await loadBusinessMeCached({
          token,
          businessType: "internalLab",
        });
        setBusinessVerified(Boolean(data?.businessVerified));
        setMembership(String(data?.membership || "none"));
      } catch {
        setBusinessVerified(Boolean(user?.businessVerified));
        setMembership("none");
      } finally {
        setDesignAccessEnabled(false);
        setPracticeHasInHouseLab(null);
        setProfile(INTERNAL_LAB_PROFILE);
        hasLoadedOnceRef.current = true;
        setLoading(false);
      }
      return;
    }

    if (user?.role !== "requestor") {
      setLoading(false);
      hasLoadedOnceRef.current = true;
      setBusinessVerified(Boolean(user?.businessVerified));
      setDesignAccessEnabled(false);
      setPracticeHasInHouseLab(
        normalizePracticeHasInHouseLabFlag(user?.practiceHasInHouseLab),
      );
      setProfile(
        resolveRequestorProfile({
          userKind: user?.requestorKind,
          userServices: user?.requestorServices,
          userCaps: user?.requestorCapabilities,
          userRole: user?.role,
          businessVerified: Boolean(user?.businessVerified),
        }),
      );
      return;
    }

    // 로그인 사용자에 역할이 있으면 스켈레톤으로 사업자 조회를 기다리지 않는다.
    if (!hasLoadedOnceRef.current && !requestorAccessKnownOnUser(user)) {
      setLoading(true);
    }
    try {
      const data = await loadBusinessMeCached({
        token,
        businessType: businessType || "requestor",
      });
      const verified = Boolean(data?.businessVerified);
      setBusinessVerified(verified);
      setVerificationPending(!verified && Boolean(data?.verificationPending));
      setMembership(String(data?.membership || "none"));
      setDesignAccessEnabled(Boolean(data?.designAccessEnabled));
      setPracticeHasInHouseLab(
        normalizePracticeHasInHouseLabFlag(data?.practiceHasInHouseLab),
      );
      setProfile(
        resolveRequestorProfile({
          anchorKind: data?.requestorKind,
          anchorServices: data?.requestorServices,
          anchorCaps: data?.requestorCapabilities,
          userKind: user?.requestorKind,
          userServices: user?.requestorServices,
          userCaps: user?.requestorCapabilities,
          userRole: user?.role,
          businessVerified: verified,
        }),
      );
    } catch {
      setBusinessVerified(false);
      setDesignAccessEnabled(false);
      setPracticeHasInHouseLab(
        normalizePracticeHasInHouseLabFlag(user?.practiceHasInHouseLab),
      );
      setProfile(
        resolveRequestorProfile({
          userKind: user?.requestorKind,
          userServices: user?.requestorServices,
          userCaps: user?.requestorCapabilities,
          userRole: user?.role,
          businessVerified: false,
        }),
      );
    } finally {
      hasLoadedOnceRef.current = true;
      setLoading(false);
    }
  }, [
    businessType,
    isInternalLab,
    token,
    user?.businessVerified,
    user?.requestorCapabilities,
    user?.practiceHasInHouseLab,
    user?.requestorKind,
    user?.requestorServices,
    user?.role,
  ]);

  const delayAccessRefresh = requestorAccessKnownOnUser(user);
  const holdForCalendar =
    delayAccessRefresh && location.pathname.includes("/practice-transfers");
  useEffect(() => {
    if (!holdForCalendar) {
      const timer = window.setTimeout(() => {
        void refresh();
      }, delayAccessRefresh ? 700 : 0);
      return () => window.clearTimeout(timer);
    }
    return whenPracticeCalendarPainted(() => {
      void refresh();
    });
  }, [delayAccessRefresh, holdForCalendar, refresh]);

  useEffect(() => {
    const onUpdated = () => {
      invalidateBusinessMeCache({
        token: token || undefined,
        businessType: businessType || "requestor",
      });
      void refresh();
    };
    window.addEventListener(REQUESTOR_ACCESS_UPDATED_EVENT, onUpdated);
    return () => {
      window.removeEventListener(REQUESTOR_ACCESS_UPDATED_EVENT, onUpdated);
    };
  }, [businessType, refresh, token]);

  return {
    loading,
    refresh,
    invalidate: () =>
      invalidateBusinessMeCache({
        token: token || undefined,
        businessType: businessType || "requestor",
      }),
    membership,
    businessVerified,
    /** 홈택스 장애로 검증 보류 — 복구되면 자동 처리 */
    verificationPending,
    designAccessEnabled,
    profile,
    kind: profile.kind,
    practiceHasInHouseLab,
    services: profile.services,
    /** @deprecated profile / kind 사용 */
    capabilities: {
      practice: profile.kind === "practice",
      lab: profile.kind === "lab",
    },
    hasCapability: hasRequestorProfile(profile),
    requiresLicense: requiresBusinessLicense(profile.services),
    canUsePaid: canUsePaidServices({
      businessVerified,
      services: profile.services,
    }),
    canUseFree: canUseFreeServices(profile),
    canSendTransfer:
      canSendPracticeTransfer(profile) || user?.role === "practice",
    canReceiveTransfer:
      canReceivePracticeTransfer(profile) || isInternalLab,
  };
};

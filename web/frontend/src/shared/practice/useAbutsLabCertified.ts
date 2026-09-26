// related files:
// - web/frontend/src/shared/practice/abutsLabCertification.ts
// - web/frontend/src/shared/components/business/settings/business/businessMeCache.ts
// - web/backend/controllers/businesses/business.controller.js
// change-log:
// - 2026-09-27: 로그인 기공소가 관리자 인증 기공소인지. 채팅 AI 버튼 노출.
import { useEffect, useMemo, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { resolveBusinessType } from "@/shared/utils/resolveBusinessType";
import { loadBusinessMeCached } from "@/shared/components/business/settings/business/businessMeCache";
import { isAbutsLabCertificationCertified } from "@/shared/practice/abutsLabCertification";

export function useAbutsLabCertified(active: boolean) {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  const businessType = useMemo(
    () => resolveBusinessType(role, "requestor"),
    [role],
  );
  const [certified, setCertified] = useState(false);

  useEffect(() => {
    if (!active || !token) {
      setCertified(false);
      return;
    }
    let cancelled = false;
    void loadBusinessMeCached({ token, businessType }).then((data) => {
      if (cancelled) return;
      const row = data && typeof data === "object" ? data : null;
      setCertified(
        Boolean(row?.abutsLabCertified) ||
          isAbutsLabCertificationCertified({
            status: row?.abutsLabCertification?.status,
            practiceTransferAutoMatchEnabled:
              row?.practiceTransferAutoMatchEnabled,
          }),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [active, businessType, token]);

  return certified;
}

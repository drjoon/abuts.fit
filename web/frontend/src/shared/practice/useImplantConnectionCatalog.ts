// related files:
// - web/frontend/src/shared/components/practice/PracticeToothImplantFields.tsx
// - web/frontend/src/pages/requestor/new_request/hooks/useNewRequestImplant.ts
// - web/frontend/src/shared/practice/implantPresetsCache.ts
// - web/backend/controllers/presets/implantPreset.controller.js
// change-log:
// - 2026-11-03: 카탈로그 serverUpdatedAt 변경 시 캐시만 갱신(로그인 세션 유지).
// - 2026-08-26: AnyOne Mini 캐시(v9) 무효화·API 응답 sanitize.
// - 2026-08-26: 어벗 추가/공개·삭제 이벤트 시 캐시 무효화 후 카탈로그 재조회.
// - 2026-08-14: 캐시를 보여준 뒤 서버를 다시 불러 도입 스펙이 빠지지 않게 한다.
import { useEffect, useState } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { ROUND_BAR_REQUEST_UPDATED_EVENT } from "@/shared/practice/roundBarAbutment";
import { sanitizeCncImplantConnections } from "@/shared/practice/cncImplantCatalog";
import {
  clearImplantPresetsCache,
  parseImplantPresetsServerUpdatedAt,
  readImplantPresetsCache,
  shouldReplaceImplantPresetsCache,
  writeImplantPresetsCache,
} from "@/shared/practice/implantPresetsCache";
import { useAppEventDebouncedReload } from "@/shared/realtime/useAppEventDebouncedReload";

export type ImplantConnection = {
  _id?: string;
  manufacturer: string;
  brand?: string;
  family?: string;
  type: string;
  displayManufacturer?: string | null;
  displayBrand?: string | null;
  displayFamily?: string | null;
  displayType?: string | null;
  screwType?: string | null;
  connectionDiameter?: number | null;
  diameter?: number | null;
  /** 어벗 추가 요청 카탈로그(공개/도입) */
  roundBar?: boolean;
  adopted?: boolean;
  isPublic?: boolean;
};

export const useImplantConnectionCatalog = (
  token: string | null,
  deferMs = 0,
) => {
  const [connections, setConnections] = useState<ImplantConnection[]>([]);
  const [reloadNonce, setReloadNonce] = useState(0);

  useAppEventDebouncedReload({
    enabled: Boolean(token),
    eventTypes: [ROUND_BAR_REQUEST_UPDATED_EVENT],
    delayMs: 0,
    deferWhenEditing: false,
    onMatch: () => {
      clearImplantPresetsCache();
      setReloadNonce((value) => value + 1);
    },
  });

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    const load = async () => {
      const cached = readImplantPresetsCache<ImplantConnection>();
      if (cached?.data?.length && !cancelled) {
        setConnections(sanitizeCncImplantConnections(cached.data));
      }

      try {
        const res = await apiFetch<{
          data?: ImplantConnection[];
          serverUpdatedAt?: number | null;
        }>({
          path: "/api/implant-presets",
          method: "GET",
          token,
          skipCache: true,
        });
        if (!res.ok || cancelled) return;
        const list = sanitizeCncImplantConnections(
          Array.isArray(res.data?.data) ? res.data.data : [],
        );
        if (list.length === 0) return;

        const serverUpdatedAt = parseImplantPresetsServerUpdatedAt(
          res.data?.serverUpdatedAt,
        );
        const shouldReplace = shouldReplaceImplantPresetsCache(
          cached?.serverUpdatedAt,
          serverUpdatedAt,
        );
        if (shouldReplace || !cached?.data?.length) {
          setConnections(list);
          writeImplantPresetsCache(list, serverUpdatedAt);
        }
      } catch {
        // ignore — 캐시가 있으면 그대로 둔다
      }
    };

    const delay = Math.max(0, Number(deferMs) || 0);
    const timer = window.setTimeout(() => {
      void load();
    }, delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [deferMs, token, reloadNonce]);

  return { connections };
};

// related files:
// - web/frontend/src/shared/components/practice/PracticeToothImplantFields.tsx
// - web/frontend/src/pages/requestor/new_request/hooks/useNewRequestImplant.ts
// - web/backend/controllers/presets/implantPreset.controller.js
// change-log:
// - 2026-08-14: 캐시를 보여준 뒤 서버를 다시 불러 도입 스펙이 빠지지 않게 한다.
import { useEffect, useState } from "react";
import { apiFetch } from "@/shared/api/apiClient";

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

const IMPLANT_PRESETS_STORAGE_KEY = "abutsfit:implant-presets:v8";
const IMPLANT_PRESETS_TTL_MS = 365 * 24 * 60 * 60 * 1000;

export const useImplantConnectionCatalog = (token: string | null) => {
  const [connections, setConnections] = useState<ImplantConnection[]>([]);

  useEffect(() => {
    let cancelled = false;

    const readCache = () => {
      if (typeof window === "undefined") return [];
      try {
        const stored = window.localStorage.getItem(IMPLANT_PRESETS_STORAGE_KEY);
        if (!stored) return [];
        const parsed = JSON.parse(stored) as {
          data: ImplantConnection[];
          cachedAt: number;
        };
        const age = Date.now() - Number(parsed.cachedAt || 0);
        if (
          age <= IMPLANT_PRESETS_TTL_MS &&
          Array.isArray(parsed.data) &&
          parsed.data.length > 0
        ) {
          return parsed.data;
        }
      } catch {
        // ignore cache read errors
      }
      return [];
    };

    const load = async () => {
      const cached = readCache();
      if (cached.length > 0 && !cancelled) setConnections(cached);

      try {
        const res = await apiFetch<{ data?: ImplantConnection[] }>({
          path: "/api/implant-presets",
          method: "GET",
          token,
          skipCache: true,
        });
        if (!res.ok || cancelled) return;
        const list = Array.isArray(res.data?.data) ? res.data.data : [];
        if (list.length > 0) setConnections(list);

        if (typeof window !== "undefined" && list.length > 0) {
          try {
            window.localStorage.setItem(
              IMPLANT_PRESETS_STORAGE_KEY,
              JSON.stringify({ data: list, cachedAt: Date.now() }),
            );
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return { connections };
};

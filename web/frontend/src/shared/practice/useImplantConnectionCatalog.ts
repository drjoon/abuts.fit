// related files:
// - web/frontend/src/shared/components/practice/PracticeToothImplantFields.tsx
// - web/frontend/src/pages/requestor/new_request/hooks/useNewRequestImplant.ts
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
};

const IMPLANT_PRESETS_STORAGE_KEY = "abutsfit:implant-presets:v6";
const IMPLANT_PRESETS_TTL_MS = 365 * 24 * 60 * 60 * 1000;

export const useImplantConnectionCatalog = (token: string | null) => {
  const [connections, setConnections] = useState<ImplantConnection[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        if (typeof window !== "undefined") {
          try {
            const stored = window.localStorage.getItem(IMPLANT_PRESETS_STORAGE_KEY);
            if (stored) {
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
                if (!cancelled) setConnections(parsed.data);
                return;
              }
            }
          } catch {
            // ignore cache read errors
          }
        }

        const res = await apiFetch<{ data?: ImplantConnection[] }>({
          path: "/api/implant-presets",
          method: "GET",
          token,
        });
        if (!res.ok || cancelled) return;
        const list = Array.isArray(res.data?.data) ? res.data.data : [];
        setConnections(list);

        if (typeof window !== "undefined") {
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

// related files:
// - web/frontend/src/pages/requestor/new_request/components/NewRequestPatientImplantFields.tsx
// - web/backend/controllers/presets/implantPreset.controller.js
import { useEffect, useState } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";

/** 기본 또는 대체가 연결된 임플란트 브랜드 키. 아직 못 읽으면 null. */
export const useOrderableImplantBrandKeys = () => {
  const token = useAuthStore((state) => state.token);
  const [keys, setKeys] = useState<ReadonlySet<string> | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void apiFetch<{ data?: { keys?: string[] } }>({
        path: "/api/implant-presets/orderable-brands",
        method: "GET",
        token,
      })
        .then((res) => {
          if (cancelled || !res.ok) return;
          const list = Array.isArray(res.data?.data?.keys) ? res.data.data.keys : [];
          setKeys(new Set(list.map((key) => String(key || "").trim()).filter(Boolean)));
        })
        .catch(() => {});
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [token]);

  return keys;
};

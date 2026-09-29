// 계정 디자인 소프트웨어. 개인 설정이 있으면 그걸, 없으면 사업체 기본값.
// 기공의뢰 채팅 「폴더 열기」 DCM 포맷 기본값에만 쓴다. 설정 모달을 열거나 저장하지 않는다.
// related: web/frontend/src/shared/files/labWorkFolder.ts (dcmFormatForDesignSoftware)
import { useEffect, useState } from "react";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";

type RequestSettingsBody = {
  data?: {
    designSoftware?: string | null;
    requestorDesignSoftware?: string | null;
  };
  designSoftware?: string | null;
  requestorDesignSoftware?: string | null;
};

export function useAccountDesignSoftware(): string {
  const token = useAuthStore((s) => s.token);
  const [software, setSoftware] = useState("");

  useEffect(() => {
    if (!token) {
      setSoftware("");
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch<RequestSettingsBody>({
          path: "/api/businesses/me/request-settings",
          method: "GET",
          token,
        });
        if (!res.ok || cancelled) return;
        const body = res.data || {};
        const data = body.data || body;
        const next =
          String(data.requestorDesignSoftware || "").trim() ||
          String(data.designSoftware || "").trim();
        if (!cancelled) setSoftware(next);
      } catch {
        // 설정이 없으면 호출부 기본값(DCM)을 유지한다.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return software;
}

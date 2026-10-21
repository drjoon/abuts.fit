// related files:
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
// - web/backend/services/lowFinishLineWatch.js
import { useQuery } from "@tanstack/react-query";
import { request } from "@/shared/api/apiClient";

/** 제조사 준비 경고 기준. 서버 `LOW_FINISH_LINE_Z_MM` 과 같다. */
export const LOW_FINISH_LINE_Z_MM = 1;

export function useLowFinishLineWarning() {
  const query = useQuery({
    queryKey: ["low-finish-line-warning"],
    queryFn: async () => {
      const res = await request<{
        success?: boolean;
        data?: { warning?: boolean };
      }>({
        path: "/api/manufacturer/low-finish-line-warning",
        method: "GET",
      });
      if (!res.ok) return true;
      return res.data?.data?.warning !== false;
    },
    staleTime: 20_000,
    refetchInterval: 60_000,
    placeholderData: true,
  });
  return query.data !== false;
}

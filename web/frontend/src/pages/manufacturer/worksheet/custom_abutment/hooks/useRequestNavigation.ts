// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/backend/controllers/requests/common.review.controller.js
import { useCallback } from "react";
import { type ManufacturerRequest } from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";

export const useRequestNavigation = (
  filteredAndSorted: ManufacturerRequest[],
  getFilteredAndSortedRequests: (reqs: ManufacturerRequest[]) => ManufacturerRequest[],
  handleOpenPreview: (req: ManufacturerRequest) => Promise<void>,
  refreshRequests: (silent: boolean) => Promise<ManufacturerRequest[] | null>,
  pageState: any,
) => {
  const handleOpenNextRequest = useCallback(
    async (currentReqId: string) => {
      const currentIndex = filteredAndSorted.findIndex(
        (r) => r._id === currentReqId,
      );

      const preferredNextId =
        currentIndex >= 0
          ? filteredAndSorted[currentIndex + 1]?._id || null
          : null;

      if (!preferredNextId) {
        pageState.setPreviewOpen(false);
        return;
      }

      const refreshed = await refreshRequests(true);
      const latestList = Array.isArray(refreshed)
        ? getFilteredAndSortedRequests(refreshed as ManufacturerRequest[])
        : getFilteredAndSortedRequests(pageState.requests);

      const nextReq = latestList.find((r) => r._id === preferredNextId);

      if (!nextReq) {
        pageState.setPreviewOpen(false);
        return;
      }

      await handleOpenPreview(nextReq as ManufacturerRequest);
    },
    [
      filteredAndSorted,
      getFilteredAndSortedRequests,
      handleOpenPreview,
      refreshRequests,
      pageState,
    ],
  );

  return { handleOpenNextRequest };
};

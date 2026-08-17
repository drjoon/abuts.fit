// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/RequestPage.tsx
// - web/backend/controllers/requests/common.review.controller.js
import { useMemo, useCallback } from "react";
import { type ManufacturerRequest } from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";
import {
  filterRequestsByStage,
  filterAndSortRequests,
} from "@/pages/manufacturer/worksheet/custom_abutment/utils/requestFiltering";

export const useRequestFiltering = (
  requests: ManufacturerRequest[],
  tabStage: string,
  showCompleted: boolean,
  currentStageOrder: number,
  worksheetSearch: string,
  filterRequests?: (req: ManufacturerRequest) => boolean,
) => {
  const searchLower = worksheetSearch.toLowerCase();

  const filteredBase = useMemo(() => {
    if (!Array.isArray(requests)) return [];
    return filterRequestsByStage(
      requests,
      tabStage,
      showCompleted,
      currentStageOrder,
      filterRequests,
    );
  }, [currentStageOrder, filterRequests, requests, showCompleted, tabStage]);

  const filteredAndSorted = useMemo(() => {
    return filterAndSortRequests(filteredBase, searchLower, { tabStage });
  }, [filteredBase, searchLower, tabStage]);

  const getFilteredAndSortedRequests = useCallback(
    (sourceRequests: ManufacturerRequest[]) => {
      const base = filterRequestsByStage(
        sourceRequests,
        tabStage,
        showCompleted,
        currentStageOrder,
        filterRequests,
      );
      return filterAndSortRequests(base, searchLower, { tabStage });
    },
    [currentStageOrder, filterRequests, searchLower, showCompleted, tabStage],
  );

  return {
    filteredBase,
    filteredAndSorted,
    getFilteredAndSortedRequests,
  };
};

import { useCallback, useEffect } from "react";
import { type ManufacturerRequest } from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";

export const usePackingSelection = (
  tabStage: string,
  filteredAndSorted: ManufacturerRequest[],
  pageState: any,
) => {
  useEffect(() => {
    if (tabStage !== "packing") return;
    pageState.setSelectedPackingRequestIds((prev: string[]) => {
      const validIds = new Set(
        filteredAndSorted.map((req) => String(req._id || "")).filter(Boolean),
      );
      const next = prev.filter((id) => validIds.has(id));
      if (!pageState.didInitPackingSelectionRef.current) {
        pageState.didInitPackingSelectionRef.current = true;
        return Array.from(validIds);
      }
      return next;
    });
  }, [filteredAndSorted, tabStage, pageState]);

  const handleTogglePackingRequest = useCallback(
    (req: ManufacturerRequest) => {
      const id = String(req._id || "").trim();
      if (!id) return;
      pageState.setSelectedPackingRequestIds((prev: string[]) =>
        prev.includes(id)
          ? prev.filter((value) => value !== id)
          : [...prev, id],
      );
    },
    [pageState],
  );

  const handleSelectAllPackingRequests = useCallback(() => {
    pageState.setSelectedPackingRequestIds(
      filteredAndSorted.map((req) => String(req._id || "")).filter(Boolean),
    );
  }, [filteredAndSorted, pageState]);

  const handleClearPackingRequests = useCallback(() => {
    pageState.setSelectedPackingRequestIds([]);
  }, [pageState]);

  return {
    handleTogglePackingRequest,
    handleSelectAllPackingRequests,
    handleClearPackingRequests,
  };
};

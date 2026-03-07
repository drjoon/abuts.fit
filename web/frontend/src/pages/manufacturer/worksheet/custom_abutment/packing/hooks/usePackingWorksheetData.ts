import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type ManufacturerRequest,
  deriveStageForFilter,
  getDiameterBucketIndex,
  stageOrder,
} from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";
import { type DiameterBucketKey } from "@/shared/ui/dashboard/WorksheetDiameterQueueBar";
import { type WorksheetQueueItem } from "@/shared/ui/dashboard/WorksheetDiameterQueueModal";

export const usePackingWorksheetData = ({
  token,
  userRole,
  showCompleted,
  worksheetSearch,
  toast,
}: {
  token?: string | null;
  userRole?: string | null;
  showCompleted: boolean;
  worksheetSearch: string;
  toast: (opts: any) => void;
}) => {
  const [requests, setRequests] = useState<ManufacturerRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(12);
  const PAGE_LIMIT = 12;
  const pageRef = useRef(1);
  const hasMoreRef = useRef(true);
  const isFetchingPageRef = useRef(false);
  const lastFetchTimeRef = useRef(0);
  const userScrolledRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const fetchRequestsList = useCallback(
    async (silent = false, append = false) => {
      if (!token) return null;
      try {
        if (!silent) setIsLoading(true);
        const basePath =
          userRole === "admin"
            ? "/api/admin/requests"
            : userRole === "manufacturer"
              ? "/api/requests/all"
              : "/api/requests";
        const stageFilterForTab = showCompleted
          ? ["세척.패킹", "포장.발송", "추적관리"]
          : ["세척.패킹"];
        const url = new URL(basePath, window.location.origin);
        if (userRole === "manufacturer") {
          url.searchParams.set("page", String(pageRef.current));
          url.searchParams.set("limit", String(PAGE_LIMIT));
          url.searchParams.set("view", "worksheet");
          url.searchParams.set("includeTotal", "0");
          if (stageFilterForTab.length === 1) {
            url.searchParams.set("manufacturerStage", stageFilterForTab[0]);
          } else {
            for (const stage of stageFilterForTab) {
              url.searchParams.append("manufacturerStageIn", stage);
            }
          }
        }

        const res = await fetch(url.pathname + url.search, {
          method: "GET",
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!res.ok) {
          toast({
            title: "의뢰 불러오기 실패",
            description: "잠시 후 다시 시도해주세요.",
            variant: "destructive",
          });
          return null;
        }

        const data = await res.json();
        const raw = data?.data;
        const list = Array.isArray(raw?.requests)
          ? raw.requests
          : Array.isArray(raw)
            ? raw
            : [];

        if (data?.success && Array.isArray(list)) {
          if (append) {
            setRequests((prev) => {
              const map = new Map<string, any>();
              for (const r of prev) {
                map.set(
                  String(
                    (r as any)?._id || (r as any)?.requestId || Math.random(),
                  ),
                  r,
                );
              }
              for (const r of list) {
                map.set(
                  String(
                    (r as any)?._id || (r as any)?.requestId || Math.random(),
                  ),
                  r,
                );
              }
              return Array.from(map.values()) as any[];
            });
          } else {
            setRequests(list);
          }
          if (userRole === "manufacturer") {
            hasMoreRef.current = list.length >= PAGE_LIMIT;
          }
          return list as ManufacturerRequest[];
        }
        return list as ManufacturerRequest[];
      } catch (error) {
        console.error("Error fetching requests:", error);
        toast({
          title: "의뢰 불러오기 실패",
          description: "네트워크 오류가 발생했습니다.",
          variant: "destructive",
        });
        return null;
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [showCompleted, token, toast, userRole],
  );

  const fetchRequests = useCallback(
    async (silent = false, append = false) => {
      await fetchRequestsList(silent, append);
    },
    [fetchRequestsList],
  );

  const fetchNextPage = useCallback(async () => {
    if (isFetchingPageRef.current || !hasMoreRef.current) return;
    const now = Date.now();
    if (now - lastFetchTimeRef.current < 500) return;
    lastFetchTimeRef.current = now;
    isFetchingPageRef.current = true;
    try {
      pageRef.current += 1;
      await fetchRequests(true, true);
    } finally {
      isFetchingPageRef.current = false;
    }
  }, [fetchRequests]);

  useEffect(() => {
    void fetchRequests();
  }, [fetchRequests]);

  const searchLower = worksheetSearch.toLowerCase();
  const currentStageForTab = "세척.패킹";
  const currentStageOrder = stageOrder[currentStageForTab] ?? 0;

  const filteredBase = useMemo(() => {
    if (showCompleted) {
      return requests.filter((req) => {
        const stage = deriveStageForFilter(req);
        const order = stageOrder[stage] ?? 0;
        return order >= currentStageOrder;
      });
    }
    return requests.filter((req) => deriveStageForFilter(req) === "세척.패킹");
  }, [currentStageOrder, requests, showCompleted]);

  const filteredAndSorted = useMemo(() => {
    return filteredBase
      .filter((request) => {
        const caseInfos = request.caseInfos || {};
        const text = (
          (request.referenceIds?.join(",") || "") +
          (request.requestor?.organization || "") +
          (request.requestor?.name || "") +
          (caseInfos.clinicName || "") +
          (caseInfos.patientName || "") +
          (request.description || "") +
          (caseInfos.tooth || "") +
          (caseInfos.connectionDiameter || "") +
          (caseInfos.implantManufacturer || "") +
          (caseInfos.implantBrand || "") +
          (caseInfos.implantFamily || "") +
          (caseInfos.implantType || "")
        ).toLowerCase();
        return text.includes(searchLower);
      })
      .sort((a, b) => {
        const aScore = a.shippingPriority?.score ?? 0;
        const bScore = b.shippingPriority?.score ?? 0;
        if (aScore !== bScore) return bScore - aScore;
        return new Date(a.createdAt) < new Date(b.createdAt) ? 1 : -1;
      });
  }, [filteredBase, searchLower]);

  const paginatedRequests = useMemo(
    () => filteredAndSorted.slice(0, visibleCount),
    [filteredAndSorted, visibleCount],
  );

  const diameterQueueForPacking = useMemo(() => {
    const labels: DiameterBucketKey[] = ["6", "8", "10", "12"];
    const counts = labels.map(() => 0);
    const buckets: Record<DiameterBucketKey, WorksheetQueueItem[]> = {
      "6": [],
      "8": [],
      "10": [],
      "12": [],
    };
    for (const req of filteredAndSorted) {
      const caseInfos = req.caseInfos || {};
      const bucketIndex = getDiameterBucketIndex(caseInfos.maxDiameter);
      const item: WorksheetQueueItem = {
        id: req._id,
        client: req.requestor?.organization || req.requestor?.name || "",
        patient: caseInfos.patientName || "",
        tooth: caseInfos.tooth || "",
        connectionDiameter:
          typeof caseInfos.connectionDiameter === "number" &&
          Number.isFinite(caseInfos.connectionDiameter)
            ? caseInfos.connectionDiameter
            : null,
        maxDiameter:
          typeof caseInfos.maxDiameter === "number" &&
          Number.isFinite(caseInfos.maxDiameter)
            ? caseInfos.maxDiameter
            : null,
        camDiameter:
          typeof req.productionSchedule?.diameter === "number" &&
          Number.isFinite(req.productionSchedule.diameter)
            ? req.productionSchedule.diameter
            : null,
        programText: req.description,
        qty: 1,
      };
      if (bucketIndex === 0) {
        counts[0]++;
        buckets["6"].push(item);
      } else if (bucketIndex === 1) {
        counts[1]++;
        buckets["8"].push(item);
      } else if (bucketIndex === 2) {
        counts[2]++;
        buckets["10"].push(item);
      } else {
        counts[3]++;
        buckets["12"].push(item);
      }
    }
    return {
      labels,
      counts,
      total: counts.reduce((sum, c) => sum + c, 0),
      buckets,
    };
  }, [filteredAndSorted]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting || !userScrolledRef.current) return;
        if (
          visibleCount >= filteredAndSorted.length - 3 &&
          hasMoreRef.current
        ) {
          void fetchNextPage();
        }
        if (visibleCount < filteredAndSorted.length) {
          setVisibleCount((prev) => prev + 9);
        }
      },
      { threshold: 0.2 },
    );
    if (sentinelRef.current) observer.observe(sentinelRef.current);
    return () => {
      if (sentinelRef.current) observer.unobserve(sentinelRef.current);
    };
  }, [fetchNextPage, filteredAndSorted.length, visibleCount]);

  return {
    requests,
    setRequests,
    isLoading,
    setIsLoading,
    fetchRequestsList,
    fetchRequests,
    fetchNextPage,
    filteredBase,
    filteredAndSorted,
    paginatedRequests,
    currentStageOrder,
    diameterQueueForPacking,
    visibleCount,
    setVisibleCount,
    sentinelRef,
    hasMoreRef,
    pageRef,
    userScrolledRef,
    currentStageForTab,
  };
};

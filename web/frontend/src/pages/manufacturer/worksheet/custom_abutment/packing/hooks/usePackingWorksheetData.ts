import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type ManufacturerRequest,
  deriveStageForFilter,
  getDiameterBucketIndex,
  stageOrder,
} from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";
import { shouldShowRequestInIncludeCompleted } from "@/pages/manufacturer/worksheet/custom_abutment/utils/requestFiltering";
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
  const [serverTotal, setServerTotal] = useState<number | null>(null);
  const PAGE_LIMIT = 12;
  const pageRef = useRef(1);
  const hasMoreRef = useRef(true);
  const isFetchingPageRef = useRef(false);
  const lastFetchTimeRef = useRef(0);
  const userScrolledRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const serverTotalRef = useRef<number | null>(null);
  const requestsRef = useRef<ManufacturerRequest[]>([]);
  const reconcileInFlightRef = useRef(false);
  const hiddenRequestIdsRef = useRef<Set<string>>(new Set());

  const getRequestIdentity = useCallback((req: ManufacturerRequest | null | undefined) => {
    const mongoId = String(req?._id || "").trim();
    const requestId = String(req?.requestId || "").trim();
    return { mongoId, requestId };
  }, []);

  const isHiddenRequest = useCallback((req: ManufacturerRequest | null | undefined) => {
    const { mongoId, requestId } = getRequestIdentity(req);
    if (mongoId && hiddenRequestIdsRef.current.has(`oid:${mongoId}`)) return true;
    if (requestId && hiddenRequestIdsRef.current.has(`rid:${requestId}`)) return true;
    return false;
  }, [getRequestIdentity]);

  const applyHiddenFilter = useCallback(
    (list: ManufacturerRequest[]) => list.filter((req) => !isHiddenRequest(req)),
    [isHiddenRequest],
  );

  const hideRequestFromList = useCallback((req: ManufacturerRequest | null | undefined) => {
    const { mongoId, requestId } = getRequestIdentity(req);
    if (mongoId) hiddenRequestIdsRef.current.add(`oid:${mongoId}`);
    if (requestId) hiddenRequestIdsRef.current.add(`rid:${requestId}`);
  }, [getRequestIdentity]);

  const restoreHiddenRequest = useCallback((req: ManufacturerRequest | null | undefined) => {
    const { mongoId, requestId } = getRequestIdentity(req);
    if (mongoId) hiddenRequestIdsRef.current.delete(`oid:${mongoId}`);
    if (requestId) hiddenRequestIdsRef.current.delete(`rid:${requestId}`);
  }, [getRequestIdentity]);

  const requestKey = useCallback((req: ManufacturerRequest) => {
    const mongoId = String(req?._id || "").trim();
    if (mongoId) return `oid:${mongoId}`;

    const requestId = String(req?.requestId || "").trim();
    if (requestId) return `rid:${requestId}`;

    // 비정상 데이터(_id/requestId 누락)라도 서로 덮어쓰지 않도록 결정적 합성 키 사용
    const caseInfos = (req.caseInfos || {}) as Record<string, unknown>;
    return [
      "unknown",
      String(req.createdAt || ""),
      String(req.manufacturerStage || ""),
      String(req.description || ""),
      String(caseInfos.patientName || ""),
      String(caseInfos.tooth || ""),
      String(req.lotNumber?.value || ""),
    ].join("|");
  }, []);

  const fetchRequestsList = useCallback(
    async (silent = false, append = false) => {
      if (!token) return null;
      try {
        if (!silent) setIsLoading(true);
        if (!append) {
          pageRef.current = 1;
          hasMoreRef.current = true;
        }
        const basePath =
          userRole === "admin" || userRole === "manufacturer"
            ? "/api/requests/all"
            : "/api/requests";
        const stageFilterForTab = showCompleted
          ? [
              "세척.패킹",
              "세척.포장",
              "packing",
              "포장.발송",
              "shipping",
              "추적관리",
              "tracking",
            ]
          : ["세척.패킹", "세척.포장", "packing"];
        const url = new URL(basePath, window.location.origin);
        if (userRole === "manufacturer" || userRole === "admin") {
          url.searchParams.set("page", String(pageRef.current));
          url.searchParams.set("limit", String(PAGE_LIMIT));
          url.searchParams.set("view", "worksheet");
          url.searchParams.set("includeTotal", append ? "0" : "1");
          // R&D Done 샘플은 packing 목록에서 제외 (R&D 탭 전용)
          url.searchParams.set("rndDone", "0");
          // 가공불가 건은 unmachinable 탭 전용
          url.searchParams.set("rndUnmachinable", "0");
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
          const total = data?.data?.pagination?.total;
          if (typeof total === "number") {
            serverTotalRef.current = total;
            setServerTotal(total);
          }
          if (append) {
            const current = requestsRef.current;
            const mergedMap = new Map<string, ManufacturerRequest>();
            for (const r of current) {
              mergedMap.set(requestKey(r), r);
            }
            for (const r of list as ManufacturerRequest[]) {
              mergedMap.set(requestKey(r), r);
            }
            const merged = Array.from(
              mergedMap.values(),
            ) as ManufacturerRequest[];
            setRequests(applyHiddenFilter(merged));

            if (userRole === "manufacturer" || userRole === "admin") {
              const knownTotal =
                typeof total === "number" ? total : serverTotalRef.current;
              if (list.length === 0) {
                hasMoreRef.current = false;
              } else if (typeof knownTotal === "number") {
                hasMoreRef.current = merged.length < knownTotal;
              } else {
                // total 미제공 시 부분 페이지(중복/정렬 경계) 누락을 방지하기 위해
                // 빈 페이지가 나올 때까지 한 번 더 탐색한다.
                hasMoreRef.current = list.length > 0;
              }
            }
          } else {
            setRequests(applyHiddenFilter(list));
            if (userRole === "manufacturer" || userRole === "admin") {
              const knownTotal =
                typeof total === "number" ? total : serverTotalRef.current;
              if (typeof knownTotal === "number") {
                hasMoreRef.current = list.length < knownTotal;
              } else {
                // total 미제공 시 부분 페이지(중복/정렬 경계) 누락을 방지하기 위해
                // 빈 페이지가 나올 때까지 한 번 더 탐색한다.
                hasMoreRef.current = list.length > 0;
              }
            }
          }
          if (append && list.length > 0) {
            setVisibleCount((prev) => prev + list.length);
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
    [applyHiddenFilter, requestKey, showCompleted, token, toast, userRole],
  );

  const fetchRequests = useCallback(
    async (silent = false, append = false) => {
      await fetchRequestsList(silent, append);
    },
    [fetchRequestsList],
  );

  const reconcileMissingRequests = useCallback(
    async (knownTotal: number) => {
      if (!token) return;
      if (reconcileInFlightRef.current) return;
      if (!(userRole === "manufacturer" || userRole === "admin")) return;

      reconcileInFlightRef.current = true;
      try {
        const basePath =
          userRole === "admin" || userRole === "manufacturer"
            ? "/api/requests/all"
            : "/api/requests";
        const stageFilterForTab = showCompleted
          ? [
              "세척.패킹",
              "세척.포장",
              "packing",
              "포장.발송",
              "shipping",
              "추적관리",
              "tracking",
            ]
          : ["세척.패킹", "세척.포장", "packing"];

        // 중요: 현재 로컬 목록(requestsRef.current)을 시드로 쓰면
        // 방금 롤백/이동으로 제거된 카드가 레이스로 다시 합쳐질 수 있다.
        // reconcile은 서버 재조회 결과만 SSOT로 삼아 재구성한다.
        const mergedMap = new Map<string, ManufacturerRequest>();

        // 1) 우선 대용량 1페이지 조회로 skip/limit 경계 누락을 우회한다.
        const bulkLimit = Math.min(
          Math.max(knownTotal + 20, PAGE_LIMIT * 3),
          500,
        );
        const bulkUrl = new URL(basePath, window.location.origin);
        bulkUrl.searchParams.set("page", "1");
        bulkUrl.searchParams.set("limit", String(bulkLimit));
        bulkUrl.searchParams.set("view", "worksheet");
        bulkUrl.searchParams.set("includeTotal", "0");
        bulkUrl.searchParams.set("rndDone", "0");
        bulkUrl.searchParams.set("rndUnmachinable", "0");
        for (const stage of stageFilterForTab) {
          bulkUrl.searchParams.append("manufacturerStageIn", stage);
        }

        try {
          const bulkRes = await fetch(bulkUrl.pathname + bulkUrl.search, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          });
          if (bulkRes.ok) {
            const bulkData = await bulkRes.json().catch(() => null);
            const bulkRaw = bulkData?.data;
            const bulkList = Array.isArray(bulkRaw?.requests)
              ? bulkRaw.requests
              : Array.isArray(bulkRaw)
                ? bulkRaw
                : [];
            for (const req of bulkList as ManufacturerRequest[]) {
              mergedMap.set(requestKey(req), req);
            }
          }
        } catch (error) {
          console.warn("[PackingWorksheet] bulk reconcile fetch failed", error);
        }

        const maxPages = Math.max(6, Math.ceil(knownTotal / PAGE_LIMIT) + 4);
        let stagnantPages = 0;

        for (let page = 1; page <= maxPages; page += 1) {
          const url = new URL(basePath, window.location.origin);
          url.searchParams.set("page", String(page));
          url.searchParams.set("limit", String(PAGE_LIMIT));
          url.searchParams.set("view", "worksheet");
          url.searchParams.set("includeTotal", "0");
          url.searchParams.set("rndDone", "0");
          url.searchParams.set("rndUnmachinable", "0");
          for (const stage of stageFilterForTab) {
            url.searchParams.append("manufacturerStageIn", stage);
          }

          const res = await fetch(url.pathname + url.search, {
            method: "GET",
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          });
          if (!res.ok) break;

          const data = await res.json().catch(() => null);
          const raw = data?.data;
          const list = Array.isArray(raw?.requests)
            ? raw.requests
            : Array.isArray(raw)
              ? raw
              : [];
          if (!Array.isArray(list) || list.length === 0) break;

          const beforeSize = mergedMap.size;
          for (const req of list as ManufacturerRequest[]) {
            mergedMap.set(requestKey(req), req);
          }

          const grew = mergedMap.size > beforeSize;
          stagnantPages = grew ? 0 : stagnantPages + 1;
          if (mergedMap.size >= knownTotal) break;
          if (stagnantPages >= 2) break;
        }

        const reconciled = Array.from(mergedMap.values());
        if (reconciled.length > 0) {
          setRequests(applyHiddenFilter(reconciled));
          setVisibleCount((prev) => Math.max(prev, reconciled.length));
          pageRef.current = Math.max(
            1,
            Math.ceil(reconciled.length / PAGE_LIMIT),
          );
          hasMoreRef.current = reconciled.length < knownTotal;
        }
      } catch (error) {
        console.warn(
          "[PackingWorksheet] reconcile missing requests failed",
          error,
        );
      } finally {
        reconcileInFlightRef.current = false;
      }
    },
    [PAGE_LIMIT, applyHiddenFilter, requestKey, showCompleted, token, userRole],
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

  useEffect(() => {
    requestsRef.current = requests;
  }, [requests]);

  useEffect(() => {
    setVisibleCount(12);
    setServerTotal(null);
    serverTotalRef.current = null;
    pageRef.current = 1;
    hasMoreRef.current = true;
  }, [showCompleted, worksheetSearch]);

  const searchLower = worksheetSearch.trim().toLowerCase();
  const currentStageForTab = "세척.패킹";
  const currentStageOrder = stageOrder[currentStageForTab] ?? 0;

  const filteredBase = useMemo(() => {
    const isDoneRndSample = (req: ManufacturerRequest) =>
      String(req.source || "").trim() === "manufacturer_sample" &&
      Boolean(req.rnd?.doneAt);
    const isUnmachinable = (req: ManufacturerRequest) =>
      Boolean(req.rnd?.unmachinableAt);

    if (showCompleted) {
      return requests.filter(
        (req) =>
          !isHiddenRequest(req) &&
          !isDoneRndSample(req) &&
          !isUnmachinable(req) &&
          shouldShowRequestInIncludeCompleted(req, currentStageOrder),
      );
    }
    return requests.filter(
      (req) =>
        !isHiddenRequest(req) &&
        !isDoneRndSample(req) &&
        !isUnmachinable(req) &&
        deriveStageForFilter(req) === "세척.패킹",
    );
  }, [currentStageOrder, isHiddenRequest, requests, showCompleted]);

  const filteredAndSorted = useMemo(() => {
    return filteredBase
      .filter((request) => {
        const caseInfos = request.caseInfos || {};
        const text = (
          (request.referenceIds?.join(",") || "") +
          (request.requestor?.business || "") +
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
        if (!searchLower) return true;
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
        client: req.requestor?.business || req.requestor?.name || "",
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
    const sentinelEl = sentinelRef.current;
    if (sentinelEl) observer.observe(sentinelEl);
    return () => {
      if (sentinelEl) observer.unobserve(sentinelEl);
    };
  }, [fetchNextPage, filteredAndSorted.length, visibleCount]);

  useEffect(() => {
    if (isLoading) return;
    if (worksheetSearch.trim()) return;
    if (visibleCount < filteredAndSorted.length) return;

    const knownTotal = serverTotalRef.current;
    if (
      typeof knownTotal !== "number" ||
      filteredAndSorted.length >= knownTotal
    ) {
      return;
    }

    if (hasMoreRef.current) {
      void fetchNextPage();
      return;
    }

    void reconcileMissingRequests(knownTotal);
  }, [
    fetchNextPage,
    filteredAndSorted.length,
    isLoading,
    reconcileMissingRequests,
    visibleCount,
    worksheetSearch,
  ]);

  return {
    requests,
    setRequests,
    hideRequestFromList,
    restoreHiddenRequest,
    isLoading,
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
    serverTotal,
    sentinelRef,
    hasMoreRef,
    pageRef,
    userScrolledRef,
    currentStageForTab,
  };
};

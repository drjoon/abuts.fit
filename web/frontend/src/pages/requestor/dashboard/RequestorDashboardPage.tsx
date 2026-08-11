import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";
import { useLocation, useOutletContext } from "react-router-dom";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import { DashboardShellSkeleton } from "@/shared/ui/dashboard/DashboardShellSkeleton";
import {
  CheckCircle,
  ClipboardCheck,
  Factory,
  FileText,
  Package,
  Boxes,
  Send,
  Download,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import {
  RequestorEditRequestDialog,
  type EditingRequestState,
} from "./components/RequestorEditRequestDialog";
import { RequestorDashboardStatsCards } from "./components/RequestorDashboardStatsCards";
import { RequestorBulkShippingBannerCard } from "./components/RequestorBulkShippingBannerCard";
import { RequestorRecentRequestsCard } from "./components/RequestorRecentRequestsCard";
import type {
  RequestorDashboardStat,
  RequestorDashboardStatRow,
} from "./components/RequestorDashboardStatsCards";
import { RequestorWorkspaceHeader } from "@/shared/components/RequestorWorkspaceHeader";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { getNormalizedStage, getNormalizedStageLabelSafe } from "@/utils/stage";
import { useAppEventDebouncedReload } from "@/shared/realtime/useAppEventDebouncedReload";
import { useSystemSettings } from "@/hooks/useSystemSettings";
import { StlPreviewViewer } from "@/features/requests/components/StlPreviewViewer";
import { resolveImplantConnectionSpec } from "@/utils/implantConnectionSpec";
import { getFileBlob, setFileBlob } from "@/shared/files/stlIndexedDb";
import {
  fileFromModelBlob,
  modelFileBasename,
} from "@/shared/files/modelPreviewFile";
import { ShippingModeBadge } from "@/shared/shipping/ShippingModeBadge";
import { RequestorPolicyRemakeHeader } from "./components/RequestorPolicyRemakeHeader";

const isDashDebugEnabled = () => {
  if (typeof window === "undefined") return false;
  return Boolean(import.meta.env.DEV && (window as any).__DASH_DEBUG__ === true);
};

const dashDebug = (label: string, payload?: unknown) => {
  if (!isDashDebugEnabled()) return;
  const ts = new Date().toISOString();
  if (typeof payload === "undefined") {
    console.log(`[RequestorDashboardDebug][${ts}] ${label}`);
    return;
  }
  console.log(`[RequestorDashboardDebug][${ts}] ${label}`, payload);
};

// change-log:
// - 2026-08-11: 대시보드 컨텐츠 max-w-7xl — 기공/어벗 요약카드 가로 여유.
// - 2026-08-11: 기공 요약 — 의뢰·수락·완료·발송·추적관리 5칸(수신 제거).
// - 2026-08-11: 기공 요약 — 발송·수락·완료·발송·추적관리 5칸(수신 제거).
// - 2026-08-11: 기공 요약 — 의뢰수락 오른쪽「작업완료」추가(placeholder).
// - 2026-08-11: 불완전 가공 프리뷰 File명을 원본 확장자(STL/PLY/OBJ)로 유지.
// - 2026-08-11: 지연 위험 요약 카드 제거. 지연은 최근 의뢰 빨간 뱃지로 표시.
// - 2026-08-11: 좌측(출고·불완전가공) + 우측 최근의뢰(동일 높이) 레이아웃.
// - 2026-08-11: 오늘의 가격 카드 삭제. [정책]·무료 재제작 잔여를 헤더(필터 오른쪽)로 이동.
// - 2026-08-11: 지난 의뢰 버튼을 상단 헤더에서 최근 의뢰 카드로 이동(어벗의뢰 헤더에서도 제거).
// - 2026-08-11: 헤더 보유 크레딧/원장 모달 제거 → 사이드바 크레딧 페이지로 이전.
// - 2026-08-11: 요약카드 압축·전기간대비 제거, 오늘의 가격 숨김/출고 툴팁 반영.
// - 2026-08-11: 치과·기공소 공통 — 기공/어벗 2행 요약, 오늘의 생산가격↔출고 위치 교체.
// - 2026-08-11: 치과(practice) 상단 요약 — 기공/어벗 2행, 좌측 행 라벨, 불완전 가공 카드 제거.
// related files:
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/shared/components/RequestorWorkspaceHeader.tsx
// - web/frontend/src/pages/requestor/credits/RequestorCreditsPage.tsx
// - web/frontend/src/shared/components/CreditLedgerModal.tsx
// - web/frontend/src/pages/requestor/dashboard/components/RequestorPolicyRemakeHeader.tsx
// - web/frontend/src/pages/requestor/dashboard/components/RequestorRecentRequestsCard.tsx
// - web/frontend/src/pages/requestor/dashboard/components/RequestorDashboardStatsCards.tsx
// - web/frontend/src/shared/shipping/ShippingModeBadge.tsx
// - web/frontend/src/shared/ui/PricingPolicyDialog.tsx
// - web/frontend/src/shared/date/kst.ts
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
// - web/frontend/src/features/requests/components/StlPreviewViewer.tsx
// - web/frontend/src/shared/files/stlIndexedDb.ts
// - web/frontend/src/shared/realtime/useAppEventDebouncedReload.ts
// - web/frontend/src/shared/realtime/creditBalanceEvent.ts
// - web/backend/controllers/requests/dashboard.controller.js
// - web/backend/controllers/requests/common.requests.controller.js
// - web/backend/controllers/requests/common.review.controller.js
// - web/backend/controllers/requests/expressPrice.utils.js
// - web/backend/services/requestSnapshotTriggers.service.js
// - web/backend/utils/creditRealtime.js
// - web/frontend/rules.md


type DashboardOutletContext = {
  paidCredit: number | null;
  freeRequestCredit: number | null;
  freeShippingCredit: number | null;
};

export const RequestorDashboardPage = () => {
  const { user, token } = useAuthStore();
  const queryClient = useQueryClient();
  const location = useLocation();
  const { toast } = useToast();
  const {
    paidCredit,
    freeRequestCredit,
    freeShippingCredit,
  } = useOutletContext<DashboardOutletContext>();
  const { data: systemSettings } = useSystemSettings();

  const [period, setPeriod] = useState<PeriodFilterValue>("30d");
  const [editingRequest, setEditingRequest] =
    useState<EditingRequestState>(null);
  const [editingDescription, setEditingDescription] = useState("");
  const [editingClinicName, setEditingClinicName] = useState("");
  const [editingPatientName, setEditingPatientName] = useState("");
  const [editingTeethText, setEditingTeethText] = useState("");
  const [editingImplantManufacturer, setEditingImplantManufacturer] =
    useState("");
  const [editingImplantBrand, setEditingImplantBrand] = useState("");
  const [editingImplantFamily, setEditingImplantFamily] = useState("");
  const [editingImplantType, setEditingImplantType] = useState("");
  const [statsModalOpen, setStatsModalOpen] = useState(false);
  const [statsModalLabel, setStatsModalLabel] = useState<string>("");
  const [hasSummaryHydrated, setHasSummaryHydrated] = useState(false);
  const [heavySummaryEnabled, setHeavySummaryEnabled] = useState(false);
  const heavySummaryRefreshTimerRef = useRef<number | null>(null);
  const cardsSummaryRevalidateTimerRef = useRef<number | null>(null);

  const [unmachinableAlertModalOpen, setUnmachinableAlertModalOpen] =
    useState(false);
  const [selectedUnmachinableContinueIds, setSelectedUnmachinableContinueIds] =
    useState<Set<string>>(new Set());
  const [approvingUnmachinableSelection, setApprovingUnmachinableSelection] =
    useState(false);
  const [unmachinableCancelConfirmOpen, setUnmachinableCancelConfirmOpen] =
    useState(false);
  const [pendingCancelUnmachinableIds, setPendingCancelUnmachinableIds] =
    useState<string[]>([]);
  const pendingCancelUnmachinableIdsRef = useRef<string[]>([]);
  const [focusedUnmachinableRequestId, setFocusedUnmachinableRequestId] =
    useState<string | null>(null);
  const promptedUnmachinableFingerprintRef = useRef<string>("");

  const setPendingCancelIds = (ids: string[]) => {
    const normalized = ids.map((id) => String(id || "").trim()).filter(Boolean);
    pendingCancelUnmachinableIdsRef.current = normalized;
    setPendingCancelUnmachinableIds(normalized);
  };

  const clearPendingCancelIds = () => {
    pendingCancelUnmachinableIdsRef.current = [];
    setPendingCancelUnmachinableIds([]);
  };

  const summaryQueryKey = useMemo(
    () => [
      "requestor-dashboard-summary-page",
      period,
      String(user?.id || ""),
      String(user?.businessAnchorId || ""),
    ],
    [period, user],
  );

  const cardsSummaryQueryKey = useMemo(
    () => [
      "requestor-dashboard-cards-summary",
      period,
      String(user?.id || ""),
      String(user?.businessAnchorId || ""),
    ],
    [period, user],
  );

  const unmachinableOverviewQueryKey = useMemo(
    () => ["requestor-unmachinable-overview", period],
    [period],
  );

  // change-log: 2026-08-03 - '의뢰' -> '준비' display normalization for requestor dashboard groups
  const stageGroupByLabel = useMemo<Record<string, string[] | null>>(() => ({
    // 작업 공정 변경: 준비 → 가공 → 세척.패킹 → 포장.발송 → 추적관리
    // Note: canceled requests are kept in DB but not shown in the '준비' card per UI policy.
    "준비": ["request"],
    가공: ["cam", "machining"],
    "세척.패킹": ["packing"],
    "포장.발송": ["shipping"],
    추적관리: ["tracking"],
    // 상세 공정 코드(불완전 가공)는 별도 분기 처리
    "불완전 가공": null,
  }), []);
  
  const stageRawAliasByLabel = useMemo<Record<string, string[]>>(() => ({
    // display-level label '준비' maps legacy raw values '의뢰' / 'request' for normalization
    "준비": ["의뢰", "request"],
    가공: ["cam", "CAM", "가공", "생산", "production", "machining"],
    "세척.패킹": ["세척.패킹", "세척.포장", "cleaning", "packing"],
    "포장.발송": ["포장.발송", "발송", "delivery", "shipping"],
    추적관리: ["추적관리", "tracking"],
  }), []);

  const getNormalizedStageOrNull = useCallback((requestLike: any): string | null => {
    if (!requestLike?.manufacturerStage) {
      return null;
    }
    try {
      return getNormalizedStage(requestLike);
    } catch {
      const raw = String(requestLike?.manufacturerStage || "").trim();
      // legacy stage 보정: 상단 요약 카드와 세부 모달의 stage 매칭 불일치 방지
      if (["production", "생산"].includes(raw)) return "machining";
      if (["cleaning", "세척.포장"].includes(raw)) return "packing";
      if (["delivery", "발송"].includes(raw)) return "shipping";
      return null;
    }
  }, []);

  const isCanceledRequest = useCallback((requestLike: any): boolean => {
    if (!requestLike) return false;
    const normalizedStage = getNormalizedStageOrNull(requestLike);
    if (normalizedStage === "cancel") {
      return true;
    }
    const stageLabel = String(requestLike?.manufacturerStage || "").trim();
    if (stageLabel === "취소") {
      return true;
    }
    return false;
  }, [getNormalizedStageOrNull]);

  const isUnmachinableRequest = useCallback((requestLike: any): boolean =>
    !!requestLike?.rnd?.unmachinableAt,
  [],);

  const getUnmachinableReason = useCallback((requestLike: any): string =>
    String(requestLike?.rnd?.unmachinableReason || "").trim(),
  [],);

  const splitUnmachinableReasons = (rawReason: unknown): string[] => {
    const text = String(rawReason || "").trim();
    if (!text) return [];

    return Array.from(
      new Set(
        text
          .split(/\s*\/\s*|\r?\n|\s*·\s*|\s*•\s*|\s*\|\s*/)
          .map((item) => String(item || "").trim())
          .filter(Boolean),
      ),
    );
  };

  const isSampleRequest = useCallback((requestLike: any): boolean => {
    const requestCategory = String(requestLike?.requestCategory || "").trim();
    const source = String(requestLike?.source || "").trim();
    const priceRule = String(requestLike?.price?.rule || "").trim();
    return (
      requestCategory === "rnd_sample" ||
      requestCategory === "copied_sample" ||
      source === "manufacturer_sample" ||
      priceRule === "manufacturer_sample"
    );
  }, []);

  const normalizeEventId = (value: unknown): string => {
    if (value == null) return "";
    if (typeof value === "string") return value.trim();
    if (typeof value === "number" || typeof value === "bigint") {
      return String(value).trim();
    }

    if (typeof value === "object") {
      const obj = value as {
        _id?: unknown;
        id?: unknown;
        $oid?: unknown;
        businessAnchorId?: unknown;
        requestorBusinessAnchorId?: unknown;
        toString?: () => string;
      };

      const nested =
        obj.$oid ??
        obj._id ??
        obj.id ??
        obj.businessAnchorId ??
        obj.requestorBusinessAnchorId;

      if (nested != null && nested !== value) {
        const resolved = normalizeEventId(nested);
        if (resolved) return resolved;
      }

      const fromToString =
        typeof obj.toString === "function" ? String(obj.toString()) : "";
      const normalized = fromToString.trim();
      if (normalized && normalized !== "[object Object]") {
        return normalized;
      }
    }

    return "";
  };

  const extractEventBusinessAnchorIds = (evt: { data?: unknown }) => {
    const payload =
      evt?.data && typeof evt.data === "object"
        ? (evt.data as {
            requestorBusinessAnchorId?: unknown;
            businessAnchorId?: unknown;
            ownerBusinessAnchorId?: unknown;
            request?: {
              requestorBusinessAnchorId?: unknown;
              businessAnchorId?: unknown;
              requestor?: {
                businessAnchorId?: unknown;
                businessAnchor?: unknown;
                businessAnchorIdStr?: unknown;
              };
            };
            requests?: Array<{
              requestorBusinessAnchorId?: unknown;
              businessAnchorId?: unknown;
              request?: {
                requestorBusinessAnchorId?: unknown;
                businessAnchorId?: unknown;
                requestor?: { businessAnchorId?: unknown; businessAnchor?: unknown };
              };
            }>;
          })
        : {};

    const ids = new Set<string>();
    const pushId = (candidate: unknown) => {
      const normalized = normalizeEventId(candidate);
      if (normalized) ids.add(normalized);
    };

    pushId(payload.requestorBusinessAnchorId);
    pushId(payload.businessAnchorId);
    pushId(payload.ownerBusinessAnchorId);
    pushId(payload.request?.requestorBusinessAnchorId);
    pushId(payload.request?.businessAnchorId);
    pushId(payload.request?.requestor?.businessAnchorId);
    pushId(payload.request?.requestor?.businessAnchor);
    pushId(payload.request?.requestor?.businessAnchorIdStr);

    (Array.isArray(payload.requests) ? payload.requests : []).forEach((row) => {
      pushId(row?.requestorBusinessAnchorId);
      pushId(row?.businessAnchorId);
      pushId(row?.request?.requestorBusinessAnchorId);
      pushId(row?.request?.businessAnchorId);
      pushId(row?.request?.requestor?.businessAnchorId);
      pushId(row?.request?.requestor?.businessAnchor);
    });

    return Array.from(ids);
  };

  const filterDashboardRequest = useCallback((r: any) => {
    if (!r) return false;
    return !isSampleRequest(r);
  }, [isSampleRequest]);

  const getModalItems = useCallback((all: any[], label: string) => {
    const group = stageGroupByLabel[label];
    const base = (all || []).filter(filterDashboardRequest);

    // 불완전 가공은 stage(manufacturerStage)가 아니라 rnd 상세 상태로 분류한다.
    if (label === "불완전 가공") {
      return base.filter((r) => {
        if (r?.rnd?.unmachinableAt) return true;
        const rawStage = String(r?.manufacturerStage || "")
          .trim()
          .toLowerCase();
        // stage 코드 레거시 값은 띄어쓰기 없이 저장될 수 있다.
        return rawStage === "불완전가공" || rawStage === "불완전 가공";
      });
    }

    if (!group) return base;
    return base.filter((r) => {
      const normalized = getNormalizedStageOrNull(r);
      if (normalized && group.includes(normalized)) return true;

      const rawLabel = String(r?.manufacturerStage || "").trim();
      if (!rawLabel) return false;
      const aliases = stageRawAliasByLabel[label] || [];
      if (aliases.includes(rawLabel)) return true;
      return false;
    });
  }, [stageGroupByLabel, filterDashboardRequest, stageRawAliasByLabel, getNormalizedStageOrNull]);

  const {
    data: infiniteData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: loadingMyRequestsForModal,
  } = useInfiniteQuery({
    queryKey: ["requestor-dashboard-stats-modal-infinite", statsModalLabel],
    queryFn: async ({ pageParam = 1 }) => {
      const res = await apiFetch<any>({
        path: `/api/requests/my?page=${pageParam}&limit=20&sortBy=createdAt&sortOrder=desc`,
        method: "GET",
        token,
      });
      if (!res.ok) throw new Error("의뢰 목록 조회에 실패했습니다.");
      const body = res.data;
      const data = body?.data || body;
      return {
        requests: Array.isArray(data?.requests) ? data.requests : [],
        nextPage:
          data?.pagination?.page < data?.pagination?.pages
            ? data.pagination.page + 1
            : undefined,
      };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled: statsModalOpen && !!token,
    retry: false,
  });

  const { ref: loadMoreRef, inView } = useInView();

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const modalItems = useMemo(() => {
    const all = infiniteData?.pages.flatMap((page) => page.requests) || [];
    return getModalItems(all, statsModalLabel);
  }, [infiniteData, statsModalLabel, getModalItems]);

  useEffect(() => {
    // 첫 페이지에 해당 stage 항목이 없더라도, 다음 페이지에 있을 수 있어 자동 추가 로드한다.
    if (!statsModalOpen) return;
    if (loadingMyRequestsForModal) return;
    if (modalItems.length > 0) return;
    if (!hasNextPage || isFetchingNextPage) return;
    void fetchNextPage();
  }, [
    statsModalOpen,
    loadingMyRequestsForModal,
    modalItems.length,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  ]);

  const [insufficientCredit, setInsufficientCredit] = useState(false);
  const [insufficientShippingCredit, setInsufficientShippingCredit] =
    useState(false);

  const { data: summaryResponse, refetch: refetchSummary } = useQuery({
    queryKey: summaryQueryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (period) {
        params.set("period", period);
      }
      const res = await apiFetch<any>({
        path: `/api/requests/my/dashboard-summary?${params.toString()}`,
        method: "GET",
        token,
      });
      if (!res.ok) {
        throw new Error("대시보드 요약 조회에 실패했습니다.");
      }
      return res.data;
    },
    retry: false,
    staleTime: 30 * 1000,
    refetchOnMount: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
    enabled: !!token && heavySummaryEnabled,
    // period 전환 시 이전 기간의 최근의뢰/지연위험을 그대로 보여주지 않는다.
  });

  const {
    data: cardsSummaryResponse,
    refetch: refetchCardsSummary,
    isLoading: isCardsSummaryLoading,
  } = useQuery({
    queryKey: cardsSummaryQueryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (period) {
        params.set("period", period);
      }
      const res = await apiFetch<any>({
        path: `/api/requests/my/dashboard-cards-summary?${params.toString()}`,
        method: "GET",
        token,
      });
      if (!res.ok) {
        throw new Error("대시보드 카드 요약 조회에 실패했습니다.");
      }
      return res.data;
    },
    retry: false,
    staleTime: 15 * 1000,
    refetchOnMount: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
    enabled: !!token,
    placeholderData: (previous) => previous,
  });

  const {
    data: bulkResponse,
    isLoading: isBulkLoading,
    refetch: refetchBulk,
  } = useQuery({
    queryKey: ["requestor-bulk-shipping"],
    queryFn: async () => {
      const res = await apiFetch<any>({
        path: "/api/requests/my/bulk-shipping",
        method: "GET",
        token,
      });
      if (!res.ok) {
        throw new Error("묶음 배송 후보 조회에 실패했습니다.");
      }
      return res.data;
    },
    retry: false,
    staleTime: 30 * 1000,
    refetchOnMount: false,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
    enabled: !!token,
    placeholderData: (previous) => previous,
  });

  const shouldLoadUnmachinableOverview =
    Boolean(token) &&
    (unmachinableAlertModalOpen ||
      (statsModalOpen && statsModalLabel === "불완전 가공"));

  const {
    data: unmachinableOverviewResponse,
    isLoading: loadingUnmachinableOverview,
  } = useQuery({
    queryKey: unmachinableOverviewQueryKey,
    queryFn: async () => {
      const res = await apiFetch<any>({
        path: `/api/requests/unmachinable-overview?period=${period}&limit=100`,
        method: "GET",
        token,
      });
      if (!res.ok) {
        throw new Error("불완전 가공 목록 조회에 실패했습니다.");
      }
      return res.data;
    },
    enabled: shouldLoadUnmachinableOverview,
    retry: false,
    placeholderData: (previous) => previous,
  });

  const dashboardStatsSource =
    cardsSummaryResponse?.success && cardsSummaryResponse?.data?.stats
      ? cardsSummaryResponse
      : summaryResponse;

  // 의뢰비 충전 경고
  // 준비, 가공 단계에 의뢰건이 있으면서 크레딧이 부족한지 확인
  // 의뢰비 결제: 유료 크레딧 + 무료 의뢰비 크레딧 사용 가능 (무료 배송비 크레딧은 사용 불가)
  useEffect(() => {
    if (
      dashboardStatsSource?.success &&
      paidCredit !== null &&
      freeRequestCredit !== null &&
      systemSettings?.creditSettings
    ) {
      const stats = dashboardStatsSource.data.stats ?? {};
      const pricePerRequest =
        systemSettings.creditSettings.minCreditForRequest || 10000;

      // 준비, 가공 단계에 의뢰건이 있으면 경고
      const inRequest = stats.totalRequests || 0;
      const inMachining = (stats.inCam || 0) + (stats.inProduction || 0);
      const totalPendingRequests = inRequest + inMachining;

      // 의뢰비는 유료 크레딧 + 무료 의뢰비 크레딧 사용 가능
      const availableForRequest = paidCredit + freeRequestCredit;
      const requiredCredit = totalPendingRequests * pricePerRequest;

      if (totalPendingRequests > 0 && availableForRequest < requiredCredit) {
        setInsufficientCredit(true);
      } else {
        setInsufficientCredit(false);
      }
    }
  }, [
    dashboardStatsSource,
    paidCredit,
    freeRequestCredit,
    systemSettings,
  ]);

  // 배송비 충전 경고
  // 묶음 배송 건수를 기준으로 필요한 배송비 계산
  // 배송비 결제: 유료 크레딧 + 무료 배송비 크레딧 사용 가능
  useEffect(() => {
    if (
      bulkResponse?.success &&
      paidCredit !== null &&
      freeShippingCredit !== null &&
      systemSettings?.creditSettings
    ) {
      const shippingFeePerBox =
        systemSettings.creditSettings.shippingFee || 3500;

      // 묶음 배송 후보 건수 (실제 배송될 박스 수)
      const bulkShippingCandidates = bulkResponse.data?.candidates || [];
      const totalShippingBoxes = bulkShippingCandidates.length;

      // 배송비는 유료 크레딧 + 무료 배송비 크레딧으로 결제
      const availableForShipping = paidCredit + freeShippingCredit;
      const requiredShippingFee = totalShippingBoxes * shippingFeePerBox;

      if (
        totalShippingBoxes > 0 &&
        availableForShipping < requiredShippingFee
      ) {
        setInsufficientShippingCredit(true);
      } else {
        setInsufficientShippingCredit(false);
      }
    }
  }, [bulkResponse, freeShippingCredit, paidCredit, systemSettings]);

  type DashboardRefreshPlan = {
    cardsSummary?: boolean;
    heavySummary?: boolean;
    bulk?: boolean;
    unmachinableOverview?: boolean;
    shippingSummary?: boolean;
    pricingStats?: boolean;
    referralTree?: boolean;
  };

  const refreshInFlightRef = useRef(false);
  const queuedPlanRef = useRef<DashboardRefreshPlan | null>(null);

  const mergeRefreshPlan = useCallback(
    (
      base: DashboardRefreshPlan | null,
      patch: DashboardRefreshPlan,
    ): DashboardRefreshPlan => ({
      cardsSummary: Boolean(base?.cardsSummary || patch.cardsSummary),
      heavySummary: Boolean(base?.heavySummary || patch.heavySummary),
      bulk: Boolean(base?.bulk || patch.bulk),
      unmachinableOverview: Boolean(
        base?.unmachinableOverview || patch.unmachinableOverview,
      ),
      shippingSummary: Boolean(base?.shippingSummary || patch.shippingSummary),
      pricingStats: Boolean(base?.pricingStats || patch.pricingStats),
      referralTree: Boolean(base?.referralTree || patch.referralTree),
    }),
    [],
  );

  const executeDashboardRefreshPlan = useCallback(
    async (plan: DashboardRefreshPlan) => {
      const tasks: Promise<unknown>[] = [];

      if (plan.cardsSummary) {
        tasks.push(Promise.resolve(refetchCardsSummary()));
      }
      if (plan.heavySummary) {
        if (!heavySummaryEnabled) {
          setHeavySummaryEnabled(true);
        }
        tasks.push(Promise.resolve(refetchSummary()));
      }
      if (plan.bulk) {
        tasks.push(Promise.resolve(refetchBulk()));
      }
      if (plan.unmachinableOverview && shouldLoadUnmachinableOverview) {
        tasks.push(
          queryClient.refetchQueries({
            queryKey: unmachinableOverviewQueryKey,
            type: "active",
          }),
        );
      }
      if (plan.shippingSummary) {
        tasks.push(
          queryClient.refetchQueries({
            queryKey: ["requestor-shipping-packages-summary"],
            type: "active",
          }),
        );
      }
      if (plan.pricingStats) {
        tasks.push(
          queryClient.refetchQueries({
            queryKey: ["requestor-pricing-referral-stats", "v8"],
            type: "active",
          }),
        );
      }
      if (plan.referralTree && user?.id) {
        tasks.push(
          queryClient.refetchQueries({
            queryKey: ["requestor-referral-tree-member-count", user.id],
            type: "active",
          }),
        );
      }

      if (tasks.length > 0) {
        await Promise.all(tasks);
      }
    },
    [
      heavySummaryEnabled,
      queryClient,
      refetchBulk,
      refetchCardsSummary,
      refetchSummary,
      shouldLoadUnmachinableOverview,
      unmachinableOverviewQueryKey,
      user?.id,
    ],
  );

  const refreshDashboard = useCallback(
    async (plan?: DashboardRefreshPlan) => {
      const normalizedPlan = plan
        ? mergeRefreshPlan(null, plan)
        : {
            cardsSummary: true,
            heavySummary: true,
            bulk: true,
            unmachinableOverview: true,
            shippingSummary: true,
            pricingStats: true,
            referralTree: true,
          };

      if (refreshInFlightRef.current) {
        const mergedQueued = mergeRefreshPlan(queuedPlanRef.current, normalizedPlan);
        queuedPlanRef.current = mergedQueued;
        dashDebug("refreshDashboard queued", {
          incomingPlan: normalizedPlan,
          queuedPlan: mergedQueued,
        });
        return;
      }

      dashDebug("refreshDashboard start", { plan: normalizedPlan });
      refreshInFlightRef.current = true;
      try {
        await executeDashboardRefreshPlan(normalizedPlan);
        dashDebug("refreshDashboard done", { plan: normalizedPlan });
      } finally {
        refreshInFlightRef.current = false;
        const queued = queuedPlanRef.current;
        queuedPlanRef.current = null;
        if (queued) {
          dashDebug("refreshDashboard drain queued", { queuedPlan: queued });
          await refreshDashboard(queued);
        }
      }
    },
    [executeDashboardRefreshPlan, mergeRefreshPlan],
  );

  useEffect(() => {
    setHeavySummaryEnabled(false);
    setHasSummaryHydrated(false);
  }, [period, user?.id, user?.businessAnchorId]);

  useEffect(() => {
    if (heavySummaryEnabled) return;
    if (!token || !cardsSummaryResponse?.success) return;
    const timer = window.setTimeout(() => {
      setHeavySummaryEnabled(true);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [cardsSummaryResponse?.success, heavySummaryEnabled, token]);

  useEffect(() => {
    const locationState =
      location.state && typeof location.state === "object"
        ? (location.state as { refreshDashboardAt?: unknown })
        : null;
    const refreshDashboardAt = Number(locationState?.refreshDashboardAt || 0);
    if (!refreshDashboardAt) return;
    dashDebug("location refresh trigger", { refreshDashboardAt });
    void refreshDashboard({
      cardsSummary: true,
      heavySummary: true,
      bulk: true,
      unmachinableOverview: true,
      shippingSummary: true,
      pricingStats: true,
      referralTree: true,
    });
  }, [location.state, refreshDashboard]);

  const toFiniteNumber = (value: unknown): number => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  // 상단 요약카드(stats)는 웹소켓 이벤트마다 로컬 +/- 증감 패치를 하지 않고,
  // 서버 cards-summary 재조회 결과만 단일 SSOT로 사용한다.

  const scheduleHeavySummaryRefresh = useCallback(
    (delayMs = 1200, reason = "") => {
      if (heavySummaryRefreshTimerRef.current) {
        window.clearTimeout(heavySummaryRefreshTimerRef.current);
      }
      const resolvedDelay = Math.max(0, Number(delayMs || 0));
      dashDebug("scheduleHeavySummaryRefresh", { delayMs: resolvedDelay, reason });
      heavySummaryRefreshTimerRef.current = window.setTimeout(() => {
        dashDebug("scheduleHeavySummaryRefresh fired", { reason });
        void refreshDashboard({ heavySummary: true });
      }, resolvedDelay);
    },
    [refreshDashboard],
  );

  const scheduleCardsSummaryRevalidate = useCallback(
    (delayMs = 1700, reason = "") => {
      if (cardsSummaryRevalidateTimerRef.current) {
        window.clearTimeout(cardsSummaryRevalidateTimerRef.current);
      }
      const resolvedDelay = Math.max(0, Number(delayMs || 0));
      dashDebug("scheduleCardsSummaryRevalidate", {
        delayMs: resolvedDelay,
        reason,
      });
      cardsSummaryRevalidateTimerRef.current = window.setTimeout(() => {
        dashDebug("scheduleCardsSummaryRevalidate fired", { reason });
        void refreshDashboard({ cardsSummary: true });
      }, resolvedDelay);
    },
    [refreshDashboard],
  );

  useEffect(() => {
    return () => {
      if (heavySummaryRefreshTimerRef.current) {
        window.clearTimeout(heavySummaryRefreshTimerRef.current);
        heavySummaryRefreshTimerRef.current = null;
      }
      if (cardsSummaryRevalidateTimerRef.current) {
        window.clearTimeout(cardsSummaryRevalidateTimerRef.current);
        cardsSummaryRevalidateTimerRef.current = null;
      }
    };
  }, []);

  useAppEventDebouncedReload({
    enabled: Boolean(token) && Boolean(user) && user?.role === "requestor",
    eventTypes: [
      "request:stage-changed",
      "request:rnd-unmachinable-updated",
      "request:rnd-unmachinable-confirmed",
      "request:delivery-updated",
      "request:delivery-updated-batch",
      "credit:balance-updated",
    ],
    delayMs: 120,
    shouldHandle: (evt) => {
      const myOrgId = normalizeEventId(user?.businessAnchorId);
      if (!myOrgId) {
        dashDebug("event:shouldHandle skip(no-my-org)", { type: evt?.type });
        return false;
      }

      const eventOrgIds = extractEventBusinessAnchorIds(evt);
      if (eventOrgIds.length === 0) {
        dashDebug("event:shouldHandle skip(no-event-org)", { type: evt?.type, data: evt?.data });
        return false;
      }

      const matched = eventOrgIds.includes(myOrgId);
      dashDebug("event:shouldHandle", {
        type: evt?.type,
        myOrgId,
        eventOrgIds,
        matched,
      });
      return matched;
    },
    onMatch: (evt) => {
      const type = String(evt?.type || "").trim();
      const payload =
        evt?.data && typeof evt.data === "object"
          ? (evt.data as {
              toStage?: unknown;
              fromStage?: unknown;
              unmachinable?: unknown;
              request?: any;
              requestMongoId?: unknown;
              requestId?: unknown;
            })
          : {};

      const toStage = String(payload?.toStage || "").trim();
      const fromStage = String(payload?.fromStage || "").trim();
      const source = String((payload as any)?.source || "").trim();
      const requestMongoId = normalizeEventId(
        payload.requestMongoId ?? payload.request?._id,
      );
      const requestId = normalizeEventId(payload.requestId ?? payload.request?.requestId);
      dashDebug("event:onMatch", {
        type,
        requestMongoId,
        requestId,
        fromStage,
        toStage,
        source,
        payload,
      });

      if (type === "request:stage-changed") {
        const normalizedFrom = fromStage.toLowerCase();
        const normalizedTo = toStage.toLowerCase();
        const isRequestToCam =
          normalizedFrom === "준비" &&
          (normalizedTo === "cam" || normalizedTo === "가공");
        const isTrustedRequestToCamSource = [
          "bg-file-processed",
          "review-status-noop-nc-reuse",
          "review-status-cam-skip", // 레거시
          "review-status-machining-entry",
        ].includes(source);
        const shouldIgnoreProvisionalRequestToCam =
          isRequestToCam && !isTrustedRequestToCamSource;

        if (shouldIgnoreProvisionalRequestToCam) {
          dashDebug("event:stage-changed ignored provisional request->cam", {
            fromStage,
            toStage,
            source,
            requestMongoId,
            requestId,
          });
          return;
        }

        let stagePatchMatchedCount = 0;
        if (requestMongoId || requestId) {
          queryClient.setQueryData<any>(summaryQueryKey, (prev) => {
            if (!prev?.success || !Array.isArray(prev?.data?.recentRequests)) return prev;
            const recentRequests = prev.data.recentRequests.map((row: any) => {
              const rowMongoId = normalizeEventId(row?._id || row?.id);
              const rowRequestId = normalizeEventId(row?.requestId);
              if (
                (requestMongoId && rowMongoId === requestMongoId) ||
                (requestId && rowRequestId === requestId)
              ) {
                stagePatchMatchedCount += 1;
                return {
                  ...row,
                  ...(payload.request && typeof payload.request === "object"
                    ? payload.request
                    : null),
                  manufacturerStage: toStage || row.manufacturerStage,
                };
              }
              return row;
            });
            return {
              ...prev,
              data: {
                ...prev.data,
                recentRequests,
              },
            };
          });
        }

        const summaryCache = queryClient.getQueryData<any>(summaryQueryKey);
        dashDebug("event:stage-changed patched recent", {
          requestMongoId,
          requestId,
          fromStage,
          toStage,
          stagePatchMatchedCount,
          recentRequestsSize: Array.isArray(summaryCache?.data?.recentRequests)
            ? summaryCache.data.recentRequests.length
            : null,
        });

        void refreshDashboard({
          cardsSummary: true,
          bulk: true,
          unmachinableOverview: true,
          shippingSummary: true,
          pricingStats: true,
          referralTree: true,
        });
        scheduleHeavySummaryRefresh(1200, "request:stage-changed");
        scheduleCardsSummaryRevalidate(1700, "request:stage-changed");
        return;
      }

      if (type === "request:rnd-unmachinable-updated") {
        const unmachinable = Boolean(payload?.unmachinable);

        if (requestMongoId && payload.request && typeof payload.request === "object") {
          queryClient.setQueryData<any>(unmachinableOverviewQueryKey, (prev) => {
            if (!prev?.success || !Array.isArray(prev?.data?.items)) return prev;
            const items = [...prev.data.items] as any[];
            const index = items.findIndex((row) => {
              const rowId = normalizeEventId(row?._id || row?.id);
              return rowId === requestMongoId;
            });

            if (unmachinable) {
              const nextRow = {
                ...(index >= 0 ? items[index] : {}),
                ...payload.request,
              };
              if (index >= 0) items[index] = nextRow;
              else items.unshift(nextRow);
            } else if (index >= 0) {
              items.splice(index, 1);
            }

            return {
              ...prev,
              data: {
                ...prev.data,
                items,
              },
            };
          });
        }

        void refreshDashboard({
          cardsSummary: true,
          bulk: true,
          unmachinableOverview: true,
        });
        scheduleHeavySummaryRefresh(1200, "request:rnd-unmachinable-updated");
        return;
      }

      if (type === "request:rnd-unmachinable-confirmed") {
        if (requestMongoId && payload.request && typeof payload.request === "object") {
          queryClient.setQueryData<any>(unmachinableOverviewQueryKey, (prev) => {
            if (!prev?.success || !Array.isArray(prev?.data?.items)) return prev;
            const items = prev.data.items.map((row: any) => {
              const rowId = normalizeEventId(row?._id || row?.id);
              if (rowId !== requestMongoId) return row;
              return {
                ...row,
                ...payload.request,
              };
            });
            return {
              ...prev,
              data: {
                ...prev.data,
                items,
              },
            };
          });
        }

        void refreshDashboard({
          cardsSummary: true,
          bulk: true,
          unmachinableOverview: true,
          pricingStats: true,
          referralTree: true,
        });
        scheduleHeavySummaryRefresh(1200, "request:rnd-unmachinable-confirmed");
        return;
      }

      if (type === "credit:balance-updated") {
        // 가공 승인/롤백처럼 크레딧 이벤트만 먼저 들어오는 케이스에서도
        // 7개 섹션 전체가 동기화되도록 full refresh plan을 사용한다.
        void refreshDashboard({
          cardsSummary: true,
          bulk: true,
          unmachinableOverview: true,
          shippingSummary: true,
          pricingStats: true,
          referralTree: true,
        });
        scheduleHeavySummaryRefresh(1200, "credit:balance-updated");
        scheduleCardsSummaryRevalidate(1700, "credit:balance-updated");
        return;
      }

      if (
        type === "request:delivery-updated" ||
        type === "request:delivery-updated-batch"
      ) {
        void refreshDashboard({
          cardsSummary: true,
          bulk: true,
          shippingSummary: true,
        });
        scheduleHeavySummaryRefresh(1500);
        return;
      }

      void refreshDashboard({ cardsSummary: true, bulk: true });
      scheduleHeavySummaryRefresh(1200, `fallback:${type || "unknown"}`);
    },
  });

  const bulkData = bulkResponse?.success ? bulkResponse.data : null;

  const recentRequests = useMemo(() => {
    if (!summaryResponse?.success) return [];
    const requests = Array.isArray(summaryResponse.data.recentRequests)
      ? summaryResponse.data.recentRequests
      : [];
    return requests.filter(
      (r: any) => !isCanceledRequest(r) && !isUnmachinableRequest(r),
    );
  }, [summaryResponse, isCanceledRequest, isUnmachinableRequest]);
  
  const unmachinableRecentRequests = useMemo(() => {
    if (!summaryResponse?.success) return [];
    const requests = Array.isArray(summaryResponse.data.recentRequests)
      ? summaryResponse.data.recentRequests
      : [];
    return requests.filter(
      (r: any) => !isCanceledRequest(r) && isUnmachinableRequest(r),
    );
  }, [summaryResponse, isCanceledRequest, isUnmachinableRequest]);

  // 상단 alert 배지는 "미확인(읽지 않음)" 판정 건수를 사용한다.
  const unmachinableAlertCount = useMemo(() => {
    const fromStats = Number(
      dashboardStatsSource?.data?.stats?.unmachinableCount,
    );
    if (Number.isFinite(fromStats)) return Math.max(0, fromStats);
    return recentRequests.filter((r) => isUnmachinableRequest(r)).length;
  }, [dashboardStatsSource, recentRequests, isUnmachinableRequest]);
  
  // 상단 통계카드(불완전 가공)는 기록용 누적(확인 포함) 건수를 사용한다.
  const unmachinableRecordedCount = useMemo(() => {
    const stats = dashboardStatsSource?.data?.stats || {};
    const fromJudgedTotal = Number(stats?.unmachinableJudgedTotalCount);
    if (Number.isFinite(fromJudgedTotal)) return Math.max(0, fromJudgedTotal);

    // 상세 필드가 실제로 내려온 경우에만 pending+confirmed 합을 사용한다.
    // (구버전 응답에서 unmachinableCount=0만 있으면 잘못 0으로 고정되는 문제 방지)
    const hasPendingField = Object.prototype.hasOwnProperty.call(
      stats,
      "unmachinablePendingConfirmCount",
    );
    const hasConfirmedField = Object.prototype.hasOwnProperty.call(
      stats,
      "unmachinableConfirmedCount",
    );
    if (hasPendingField || hasConfirmedField) {
      const pending = Number(stats?.unmachinablePendingConfirmCount ?? 0);
      const confirmed = Number(stats?.unmachinableConfirmedCount ?? 0);
      return Math.max(0, pending + confirmed);
    }

    return recentRequests.filter((r) => isUnmachinableRequest(r)).length;
  }, [dashboardStatsSource, recentRequests, isUnmachinableRequest]);

  const isInitialLoading =
    (!cardsSummaryResponse && isCardsSummaryLoading) ||
    (!bulkResponse && isBulkLoading);

  const openEditDialogFromRequest = (request: any) => {
    const mongoId = request._id || request.id;
    const displayId = request.requestId || request.id || mongoId;

    if (!mongoId) return;

    const ci = request.caseInfos || {};

    // riskSummary 등에서 넘어온 raw data가 recentRequests 형식과 다를 수 있어 보강
    setEditingRequest({
      id: mongoId,
      requestId: request.requestId || displayId,
      createdAt: request.createdAt,
      estimatedShipYmd: request.estimatedShipYmd || request.dueDate || "",
      title: request.title || displayId,
      description: request.description || "",
      clinicName:
        ci.clinicName ||
        request.clinicName ||
        request.requestor?.business ||
        request.requestor?.companyName ||
        "",
      patientName: ci.patientName || request.patientName || "",
      teethText: ci.tooth || request.toothNumber || request.tooth || "",
      implantManufacturer:
        ci.implantManufacturer || request.implantManufacturer || "",
      implantBrand: ci.implantBrand || request.implantBrand || "",
      implantFamily: ci.implantFamily || request.implantFamily || "",
      implantType: ci.implantType || request.implantType || "",
    });

    setEditingDescription(request.description || "");
    setEditingClinicName(
      ci.clinicName ||
        request.clinicName ||
        request.requestor?.business ||
        request.requestor?.companyName ||
        "",
    );
    setEditingPatientName(ci.patientName || request.patientName || "");
    setEditingTeethText(ci.tooth || request.toothNumber || request.tooth || "");
    setEditingImplantManufacturer(
      ci.implantManufacturer || request.implantManufacturer || "",
    );
    setEditingImplantBrand(ci.implantBrand || request.implantBrand || "");
    setEditingImplantFamily(ci.implantFamily || request.implantFamily || "");
    setEditingImplantType(ci.implantType || request.implantType || "");
  };

  const cancelRequest = async (requestId: string) => {
    if (!token) {
      toast({
        title: "로그인이 필요합니다",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    try {
      const res = await apiFetch<any>({
        path: `/api/requests/${requestId}/status`,
        method: "PATCH",
        token,
        headers: {
          "Content-Type": "application/json",
        },
        jsonBody: { manufacturerStage: "취소" },
      });

      if (!res.ok) {
        const serverMsg = res.data?.message;
        console.error("의뢰 취소 실패", await res.raw.text().catch(() => ""));
        toast({
          title: "의뢰 취소 실패",
          description:
            serverMsg ||
            "준비 단계에서만 취소할 수 있습니다. 가공 단계부터는 취소가 불가능합니다.",
          variant: "destructive",
          duration: 3000,
        });
        refreshDashboard();
        return;
      }

      toast({
        title: "의뢰가 취소되었습니다",
        duration: 2000,
      });
      // 최근의뢰 목록은 request:stage-changed, 크레딧 잔액은 credit:balance-updated
      // 웹소켓 수신 후 silent refetch로 무플리커 반영한다. (optimistic 금지)
    } catch (error) {
      console.error("의뢰 취소 중 오류", error);
      toast({
        title: "의뢰 취소 중 오류",
        description: "다시 시도해주세요.",
        variant: "destructive",
        duration: 3000,
      });
      refreshDashboard();
    }
  };

  const unmachinableOverviewItems = useMemo(() => {
    const rows = Array.isArray(unmachinableOverviewResponse?.data?.items)
      ? unmachinableOverviewResponse?.data?.items
      : [];
    return rows.filter((row: any) => {
      if (!row?.rnd?.unmachinableAt) return false;
      const stage = String(row?.manufacturerStage || "").trim();
      return stage !== "취소" && stage.toLowerCase() !== "cancel";
    });
  }, [unmachinableOverviewResponse]);

  const resolvedModalItems = useMemo(() => {
    const pagedItems = infiniteData?.pages.flatMap((page) => page.requests) || [];
    const summaryRecentItems = Array.isArray(summaryResponse?.data?.recentRequests)
      ? summaryResponse?.data?.recentRequests
      : [];
    const unmachinableSeedItems =
      statsModalLabel === "불완전 가공" ? unmachinableOverviewItems : [];

    const merged = [...pagedItems, ...summaryRecentItems, ...unmachinableSeedItems];
    const deduped = new Map<string, any>();
    for (const item of merged) {
      const key = String(item?._id || item?.id || item?.requestId || "").trim();
      if (!key) continue;
      if (!deduped.has(key)) deduped.set(key, item);
      else deduped.set(key, { ...item, ...deduped.get(key) });
    }

    return getModalItems(Array.from(deduped.values()), statsModalLabel);
  }, [
    infiniteData,
    getModalItems,
    summaryResponse,
    statsModalLabel,
    unmachinableOverviewItems,
  ]);

  const pendingUnmachinableItems = useMemo(() => {
    return unmachinableOverviewItems.filter(
      (row: any) => !row?.rnd?.unmachinableConfirmedAt,
    );
  }, [unmachinableOverviewItems]);

  const pendingUnmachinableIds = useMemo(() => {
    return pendingUnmachinableItems
      .map((row: any) => String(row?._id || "").trim())
      .filter(Boolean);
  }, [pendingUnmachinableItems]);

  const activePendingUnmachinableItems = useMemo(() => {
    if (!focusedUnmachinableRequestId) return pendingUnmachinableItems;
    return pendingUnmachinableItems.filter(
      (row: any) => String(row?._id || "").trim() === focusedUnmachinableRequestId,
    );
  }, [focusedUnmachinableRequestId, pendingUnmachinableItems]);

  const activePendingUnmachinableIds = useMemo(() => {
    return activePendingUnmachinableItems
      .map((row: any) => String(row?._id || "").trim())
      .filter(Boolean);
  }, [activePendingUnmachinableItems]);

  const pendingUnmachinableFingerprint = useMemo(
    () => pendingUnmachinableIds.join(","),
    [pendingUnmachinableIds],
  );

  useEffect(() => {
    if (!pendingUnmachinableIds.length) return;
    const nextFingerprint = pendingUnmachinableFingerprint;
    if (!nextFingerprint) return;
    if (promptedUnmachinableFingerprintRef.current === nextFingerprint) return;

    promptedUnmachinableFingerprintRef.current = nextFingerprint;
    setFocusedUnmachinableRequestId(null);
    setSelectedUnmachinableContinueIds(new Set(pendingUnmachinableIds));
    clearPendingCancelIds();
    setUnmachinableAlertModalOpen(true);
  }, [pendingUnmachinableFingerprint, pendingUnmachinableIds]);

  useEffect(() => {
    if (!unmachinableAlertModalOpen) return;
    setSelectedUnmachinableContinueIds(new Set(activePendingUnmachinableIds));
  }, [unmachinableAlertModalOpen, activePendingUnmachinableIds]);

  const toggleUnmachinableContinueSelection = (
    requestId: string,
    checked: boolean,
  ) => {
    setSelectedUnmachinableContinueIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(requestId);
      else next.delete(requestId);
      return next;
    });
  };

  const markUnmachinableAsContinue = async (targetIds: string[]) => {
    if (!token) return 0;
    let successCount = 0;
    for (const requestId of targetIds) {
      const res = await apiFetch<any>({
        path: `/api/requests/${requestId}/rnd-unmachinable/continue`,
        method: "PATCH",
        token,
      });
      if (res.ok) successCount += 1;
    }
    return successCount;
  };

  const cancelUnmachinableRequests = async (targetIds: string[]) => {
    if (!token) {
      console.warn("[UNMACHINABLE_CANCEL] missing token");
      return 0;
    }

    const normalizedIds = targetIds
      .map((id) => String(id || "").trim())
      .filter(Boolean);

    console.log("[UNMACHINABLE_CANCEL] start", {
      total: normalizedIds.length,
      targetIds: normalizedIds,
    });

    let canceledCount = 0;

    for (const requestId of normalizedIds) {
      console.log("[UNMACHINABLE_CANCEL] request", { requestId });

      const res = await apiFetch<any>({
        path: `/api/requests/${requestId}/status`,
        method: "PATCH",
        token,
        headers: {
          "Content-Type": "application/json",
        },
        jsonBody: { manufacturerStage: "취소" },
      });

      let serverBody: any = null;
      try {
        serverBody = res.data;
      } catch {
        serverBody = null;
      }

      console.log("[UNMACHINABLE_CANCEL] response", {
        requestId,
        ok: res.ok,
        status: res.raw?.status,
        body: serverBody,
      });

      if (res.ok) {
        canceledCount += 1;
      }
    }

    console.log("[UNMACHINABLE_CANCEL] done", {
      total: normalizedIds.length,
      canceledCount,
    });

    return canceledCount;
  };

  const handleOpenUnmachinableDecisionModal = (requestId: string) => {
    const normalized = String(requestId || "").trim();
    if (!normalized) return;
    setFocusedUnmachinableRequestId(normalized);
    clearPendingCancelIds();
    setUnmachinableAlertModalOpen(true);
  };

  const focusedUnmachinableItem = useMemo(() => {
    const targetId = String(focusedUnmachinableRequestId || "").trim();
    if (!targetId) return null;

    const fromOverview = (unmachinableOverviewItems || []).find(
      (row: any) => String(row?._id || row?.id || "").trim() === targetId,
    );
    if (fromOverview) return fromOverview;

    const fromRecent = (unmachinableRecentRequests || []).find(
      (row: any) => String(row?._id || row?.id || "").trim() === targetId,
    );
    return fromRecent || null;
  }, [focusedUnmachinableRequestId, unmachinableOverviewItems, unmachinableRecentRequests]);

  const activeUnmachinableDecisionItem = useMemo(() => {
    if (focusedUnmachinableItem) return focusedUnmachinableItem;
    return pendingUnmachinableItems[0] || null;
  }, [focusedUnmachinableItem, pendingUnmachinableItems]);

  const [unmachinablePreviewFile, setUnmachinablePreviewFile] =
    useState<File | null>(null);
  const [unmachinablePreviewLoading, setUnmachinablePreviewLoading] =
    useState(false);
  const [unmachinablePreviewError, setUnmachinablePreviewError] = useState<string | null>(
    null,
  );
  const [unmachinableDetailRequest, setUnmachinableDetailRequest] = useState<any | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    const requestMongoId = String(
      activeUnmachinableDecisionItem?._id || activeUnmachinableDecisionItem?.id || "",
    ).trim();

    if (!unmachinableAlertModalOpen || !token || !requestMongoId) {
      setUnmachinablePreviewFile(null);
      setUnmachinablePreviewLoading(false);
      setUnmachinablePreviewError(null);
      setUnmachinableDetailRequest(null);
      return;
    }

    setUnmachinablePreviewFile(null);
    setUnmachinablePreviewLoading(true);
    setUnmachinablePreviewError(null);

    const load = async () => {
      try {
        const requestNo = String(
          activeUnmachinableDecisionItem?.requestId || requestMongoId,
        ).trim();
        const fallbackName = `${requestNo || requestMongoId}-original.stl`;
        const cacheKey = `stl:requestor-unmachinable:${requestMongoId}:original-file-url`;

        const detailRes = await apiFetch<any>({
          path: `/api/requests/${requestMongoId}`,
          method: "GET",
          token,
        });
        const detail =
          detailRes.ok && detailRes.data?.success
            ? detailRes.data?.data || null
            : null;
        if (!cancelled) {
          setUnmachinableDetailRequest(detail);
        }

        const resolveFileName = (apiFileName?: unknown) =>
          modelFileBasename(
            apiFileName ||
              detail?.caseInfos?.file?.filePath ||
              detail?.caseInfos?.file?.originalName ||
              detail?.caseInfos?.file?.fileName ||
              (activeUnmachinableDecisionItem as any)?.caseInfos?.file
                ?.filePath ||
              (activeUnmachinableDecisionItem as any)?.caseInfos?.file
                ?.originalName ||
              fallbackName,
            fallbackName,
          );

        const cached = await getFileBlob(cacheKey);
        if (cached && !cancelled) {
          setUnmachinablePreviewFile(
            fileFromModelBlob(cached, resolveFileName()),
          );
          setUnmachinablePreviewLoading(false);
          return;
        }

        const originalFileRes = await fetch(
          `/api/requests/${encodeURIComponent(requestMongoId)}/original-file-url`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
          },
        );
        const originalFileBody: any = await originalFileRes.json().catch(() => ({}));
        const signedUrl = String(originalFileBody?.data?.url || "").trim();
        const fileName = resolveFileName(originalFileBody?.data?.fileName);

        if (!originalFileRes.ok || !signedUrl) {
          if (cancelled) return;
          setUnmachinablePreviewError("3D 모델 파일을 찾을 수 없습니다.");
          setUnmachinablePreviewLoading(false);
          return;
        }

        const fileRes = await fetch(signedUrl, { method: "GET" });
        if (!fileRes.ok) {
          if (cancelled) return;
          setUnmachinablePreviewError("3D 모델 파일을 불러오지 못했습니다.");
          setUnmachinablePreviewLoading(false);
          return;
        }

        const blob = await fileRes.blob();
        if (cancelled) return;

        try {
          await setFileBlob(cacheKey, blob);
        } catch {
          // ignore cache write errors
        }

        setUnmachinablePreviewFile(fileFromModelBlob(blob, fileName));
        setUnmachinablePreviewLoading(false);
      } catch (error) {
        if (cancelled) return;
        console.error("불완전 가공 3D 모델 로드 실패", error);
        setUnmachinablePreviewError("3D 모델 파일을 불러오지 못했습니다.");
        setUnmachinablePreviewLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [activeUnmachinableDecisionItem, token, unmachinableAlertModalOpen]);

  const handleContinueSingleUnmachinableRequest = async (
    requestId: string,
  ): Promise<boolean> => {
    const normalized = String(requestId || "").trim();
    if (!token || !normalized) return false;
    setApprovingUnmachinableSelection(true);
    try {
      const successCount = await markUnmachinableAsContinue([normalized]);
      if (successCount <= 0) {
        toast({
          title: "불완전 가공 진행 전환 실패",
          description: "처리된 의뢰가 없습니다. 잠시 후 다시 시도해주세요.",
          variant: "destructive",
          duration: 2500,
        });
        return false;
      }

      toast({
        title: "가공 계속 진행",
        description: `${successCount}건이 계속 진행으로 처리되었습니다.`,
        duration: 2000,
      });
      refreshDashboard();
      return true;
    } catch (error) {
      console.error("불완전 가공 진행 전환 실패", error);
      toast({
        title: "불완전 가공 진행 전환 실패",
        description: "잠시 후 다시 시도해주세요.",
        variant: "destructive",
        duration: 2500,
      });
      return false;
    } finally {
      setApprovingUnmachinableSelection(false);
    }
  };

  const handleApproveUnmachinableSelections = async () => {
    if (!token) return;

    const allPendingIds = [...activePendingUnmachinableIds];
    if (!allPendingIds.length) {
      toast({
        title: "처리할 의뢰가 없습니다",
        duration: 1800,
      });
      setUnmachinableAlertModalOpen(false);
      return;
    }

    const continueIds = allPendingIds.filter((id) =>
      selectedUnmachinableContinueIds.has(id),
    );
    const cancelIds = allPendingIds.filter(
      (id) => !selectedUnmachinableContinueIds.has(id),
    );

    if (cancelIds.length > 0) {
      setPendingCancelIds(cancelIds);
      setUnmachinableCancelConfirmOpen(true);
      return;
    }

    setApprovingUnmachinableSelection(true);
    try {
      const successCount = await markUnmachinableAsContinue(continueIds);
      toast({
        title: "가공 계속 진행",
        description: `${successCount}건이 계속 진행으로 처리되었습니다.`,
        duration: 2000,
      });
      setUnmachinableAlertModalOpen(false);
      refreshDashboard();
    } catch (error) {
      console.error("불완전 가공 승인 처리 실패", error);
      toast({
        title: "불완전 가공 승인 처리 실패",
        description: "잠시 후 다시 시도해주세요.",
        variant: "destructive",
        duration: 2500,
      });
    } finally {
      setApprovingUnmachinableSelection(false);
    }
  };

  const handleConfirmCancelUnmachinableRequests = async () => {
    if (!token) {
      console.warn("[UNMACHINABLE_CANCEL] confirm blocked: missing token");
      return;
    }

    const stateCancelIds = [...pendingCancelUnmachinableIds]
      .map((id) => String(id || "").trim())
      .filter(Boolean);
    const refCancelIds = [...pendingCancelUnmachinableIdsRef.current]
      .map((id) => String(id || "").trim())
      .filter(Boolean);
    const cancelIds = stateCancelIds.length > 0 ? stateCancelIds : refCancelIds;

    console.log("[UNMACHINABLE_CANCEL] confirm clicked", {
      pendingCancelUnmachinableIds,
      refPendingCancelUnmachinableIds: pendingCancelUnmachinableIdsRef.current,
      normalizedCancelIds: cancelIds,
      confirmOpen: unmachinableCancelConfirmOpen,
    });

    if (!cancelIds.length) {
      console.warn("[UNMACHINABLE_CANCEL] no ids to cancel");
      setUnmachinableCancelConfirmOpen(false);
      return;
    }

    setApprovingUnmachinableSelection(true);
    try {
      const canceledCount = await cancelUnmachinableRequests(cancelIds);

      console.log("[UNMACHINABLE_CANCEL] confirm result", {
        cancelIds,
        canceledCount,
      });

      if (canceledCount <= 0) {
        toast({
          title: "불완전 가공 취소 처리 실패",
          description:
            "취소 처리된 의뢰가 없습니다. 잠시 후 다시 시도해주세요.",
          variant: "destructive",
          duration: 2500,
        });
        return;
      }

      toast({
        title: "의뢰건 자체를 취소합니다",
        description: `${canceledCount}건이 취소 처리되었습니다.`,
        duration: 2200,
      });

      setUnmachinableCancelConfirmOpen(false);
      clearPendingCancelIds();
      setUnmachinableAlertModalOpen(false);
      refreshDashboard();
    } catch (error) {
      console.error("[UNMACHINABLE_CANCEL] confirm failed", error);
      toast({
        title: "불완전 가공 취소 처리 실패",
        description: "잠시 후 다시 시도해주세요.",
        variant: "destructive",
        duration: 2500,
      });
    } finally {
      setApprovingUnmachinableSelection(false);
    }
  };

  useEffect(() => {
    if (cardsSummaryResponse?.success || summaryResponse?.success) {
      setHasSummaryHydrated(true);
    }
  }, [cardsSummaryResponse, summaryResponse]);

  useEffect(() => {
    if (!cardsSummaryResponse?.success) return;
    dashDebug("query:cardsSummary updated", {
      stats: cardsSummaryResponse?.data?.stats || null,
    });
  }, [cardsSummaryResponse]);

  useEffect(() => {
    if (!summaryResponse?.success) return;
    const recent = Array.isArray(summaryResponse?.data?.recentRequests)
      ? summaryResponse.data.recentRequests
      : [];
    dashDebug("query:summary updated", {
      stats: summaryResponse?.data?.stats || null,
      recentCount: recent.length,
      recentTop: recent.slice(0, 3).map((row: any) => ({
        id: String(row?._id || row?.id || ""),
        requestId: String(row?.requestId || ""),
        stage: String(row?.manufacturerStage || ""),
      })),
    });
  }, [summaryResponse]);

  useEffect(() => {
    if (!cardsSummaryResponse?.success || !summaryResponse?.success) return;
    const cardsStats = cardsSummaryResponse?.data?.stats || {};
    const summaryStats = summaryResponse?.data?.stats || {};
    const keys = [
      "totalRequests",
      "inCam",
      "inProduction",
      "inPacking",
      "inShipping",
      "inTracking",
      "canceled",
      "unmachinableCount",
    ] as const;

    const mismatchKeys = keys.filter(
      (key) => Number(cardsStats?.[key] ?? 0) !== Number(summaryStats?.[key] ?? 0),
    );

    if (mismatchKeys.length > 0) {
      dashDebug("cards-summary mismatch with summary", {
        mismatchKeys,
        cards: Object.fromEntries(mismatchKeys.map((k) => [k, cardsStats?.[k] ?? 0])),
        summary: Object.fromEntries(mismatchKeys.map((k) => [k, summaryStats?.[k] ?? 0])),
      });
    }
  }, [cardsSummaryResponse, summaryResponse]);

  // 웹소켓 실시간 업데이트 안정성:
  // 초기 로딩 중에는 스켈레톤을 우선 표시한다.
  if (isInitialLoading) {
    return <DashboardShellSkeleton showMain />;
  }

  const showSkeleton =
    !hasSummaryHydrated &&
    isCardsSummaryLoading &&
    !cardsSummaryResponse;

  const abutmentStats: RequestorDashboardStat[] = (() => {
    if (!dashboardStatsSource?.success) {
      return [
        { label: "준비", value: "0", icon: FileText },
        { label: "가공", value: "0", icon: Factory },
        { label: "세척.패킹", value: "0", icon: Boxes },
        { label: "포장.발송", value: "0건/0박스", icon: Package },
        { label: "추적관리", value: "0건/0박스", icon: CheckCircle },
      ];
    }

    const s = dashboardStatsSource.data.stats ?? {};
    const shippingProductCount = Number(s.inShipping ?? 0);
    const shippingBoxCount = Number(s.inShippingBoxes ?? 0);
    const trackingProductCount = Number(s.inTracking ?? 0);
    const trackingBoxCount = Number(s.inTrackingBoxes ?? 0);
    return [
      {
        label: "준비",
        value: `${s.totalRequests ?? 0}`,
        icon: FileText,
      },
      {
        label: "가공",
        value: String((s.inCam ?? 0) + (s.inProduction ?? 0)),
        icon: Factory,
      },
      {
        label: "세척.패킹",
        value: String(s.inPacking ?? 0),
        icon: Boxes,
      },
      {
        label: "포장.발송",
        value: `${shippingProductCount}건/${shippingBoxCount}박스`,
        icon: Package,
      },
      {
        label: "추적관리",
        value: `${trackingProductCount}건/${trackingBoxCount}박스`,
        icon: CheckCircle,
      },
    ];
  })();

  // 기공(무료 기공의뢰서) 라인 — 집계 API 연동 전 UI 슬롯. 수치는 placeholder.
  // 뱃지 SSOT: 의뢰 · 수락 · 완료 · 발송 · 추적관리 (수신 제거)
  const practiceTransferStats: RequestorDashboardStat[] = [
    {
      label: "의뢰",
      value: "0",
      icon: Send,
      interactive: false,
    },
    {
      label: "수락",
      value: "0",
      icon: Download,
      interactive: false,
    },
    {
      label: "완료",
      value: "0",
      icon: ClipboardCheck,
      interactive: false,
    },
    {
      label: "발송",
      value: "0",
      icon: Package,
      interactive: false,
    },
    {
      label: "추적관리",
      value: "0",
      icon: CheckCircle,
      interactive: false,
    },
  ];

  const requestorStatRows: RequestorDashboardStatRow[] = [
    { rowLabel: "기공", stats: practiceTransferStats },
    { rowLabel: "어벗", stats: abutmentStats },
  ];

  if (showSkeleton) {
    return <DashboardShellSkeleton />;
  }

  return (
    <div className="h-full min-h-0">
      <div className="max-w-7xl mx-auto w-full space-y-3">
      <DashboardShell
        title={`안녕하세요, ${user.name}님!`}
        statsGridClassName="space-y-3"
        subtitle={
          insufficientCredit && insufficientShippingCredit
            ? "의뢰비와 배송비 크레딧 부족. 충전해주세요"
            : insufficientCredit
              ? "의뢰비 크레딧 부족. 충전하시면 생산이 진행됩니다"
              : insufficientShippingCredit
                ? "배송비 크레딧 부족. 충전해주세요"
                : "의뢰 현황을 확인하세요."
        }
        headerRight={
          <RequestorWorkspaceHeader
            period={period}
            onPeriodChange={setPeriod}
          >
            <RequestorPolicyRemakeHeader />
            {unmachinableAlertCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setFocusedUnmachinableRequestId(null);
                  setUnmachinableAlertModalOpen(true);
                }}
                className="inline-flex h-8 items-center rounded-md border border-accent-muted bg-accent-soft px-3 text-sm font-semibold text-accent-strong ring-2 ring-accent-muted/80 hover:bg-accent-muted/50"
                title="불완전 가공 의뢰 목록을 확인합니다"
              >
                불완전 가공 의뢰 {unmachinableAlertCount}건 발생
              </button>
            )}
          </RequestorWorkspaceHeader>
        }
        stats={
          <RequestorDashboardStatsCards
            rows={requestorStatRows}
            onCardClick={(stat, rowLabel) => {
              if (rowLabel === "기공") return;
              setStatsModalLabel(stat.label);
              setStatsModalOpen(true);
            }}
          />
        }
        topSection={
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-3 items-stretch">
            <div className="lg:col-span-2 min-w-0 flex flex-col gap-3 [&_.app-glass-card]:h-auto">
              <RequestorBulkShippingBannerCard
                bulkData={bulkData}
                period={period}
                onRefresh={() => {
                  refetchBulk();
                }}
                onOpenBulkModal={() => {}}
              />

              <Card className="app-glass-card app-glass-card--lg min-w-0">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">불완전 가공</CardTitle>
                </CardHeader>
                <CardContent className="pt-2">
                  {unmachinableRecentRequests.length === 0 ? (
                    <div className="text-sm text-muted-foreground">표시할 불완전 가공 의뢰가 없습니다.</div>
                  ) : (
                    <div className="space-y-2 max-h-[200px] overflow-auto pr-1 pb-1">
                      {unmachinableRecentRequests.map((item: any) => {
                        const requestMongoId = String(item?._id || item?.id || "").trim();
                        const requestId = String(item?.requestId || "-").trim() || "-";
                        const ci = item?.caseInfos || {};
                        const title =
                          String(item?.title || "").trim() ||
                          [ci?.patientName, ci?.tooth].filter(Boolean).join(" ") ||
                          requestId;
                        const reason = String(item?.rnd?.unmachinableReason || "").trim();
                        const confirmed = Boolean(item?.rnd?.unmachinableConfirmedAt);
                        return (
                          <button
                            key={requestMongoId || requestId}
                            type="button"
                            className="w-full text-left rounded-md border border-accent-muted bg-accent-soft/50 px-3 py-2 hover:bg-accent-muted/40"
                            onClick={() => {
                              handleOpenUnmachinableDecisionModal(requestMongoId);
                            }}
                          >
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <div className="text-sm font-medium truncate">{title}</div>
                                <ShippingModeBadge source={item} size="sm" />
                                <Badge
                                  variant="outline"
                                  className="text-[10px] border-accent-muted text-accent-strong"
                                >
                                  {confirmed ? "확인됨" : "미확인"}
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                의뢰번호: {requestId}
                              </div>
                              <div className="text-xs text-accent-strong truncate">
                                불완전 가공 사유: {reason || "미등록"}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* 좌측 2행 높이에 맞추기: lg에서 absolute fill */}
            <div className="lg:col-span-3 relative min-h-[320px] min-w-0">
              <div className="h-full min-h-[320px] lg:absolute lg:inset-0">
                <RequestorRecentRequestsCard
                  items={recentRequests}
                  onRefresh={() => {
                    refetchSummary();
                    refetchBulk();
                  }}
                  onEdit={openEditDialogFromRequest}
                  onCancel={cancelRequest}
                />
              </div>
            </div>
          </div>
        }
      />
      </div>

      <RequestorEditRequestDialog
        editingRequest={editingRequest}
        editingDescription={editingDescription}
        editingClinicName={editingClinicName}
        editingPatientName={editingPatientName}
        editingTeethText={editingTeethText}
        editingImplantManufacturer={editingImplantManufacturer}
        editingImplantBrand={editingImplantBrand}
        editingImplantFamily={editingImplantFamily}
        editingImplantType={editingImplantType}
        onChangeDescription={setEditingDescription}
        onChangeClinicName={setEditingClinicName}
        onChangePatientName={setEditingPatientName}
        onChangeTeethText={setEditingTeethText}
        onChangeImplantManufacturer={setEditingImplantManufacturer}
        onChangeImplantBrand={setEditingImplantBrand}
        onChangeImplantFamily={setEditingImplantFamily}
        onChangeImplantType={setEditingImplantType}
        onClose={() => setEditingRequest(null)}
        onSave={async () => {
          if (!editingRequest || !token) {
            setEditingRequest(null);
            return;
          }

          try {
            const payload: any = {
              description: editingDescription,
              caseInfos: {},
            };

            if (editingClinicName.trim()) {
              payload.caseInfos.clinicName = editingClinicName.trim();
            }
            if (editingPatientName.trim()) {
              payload.caseInfos.patientName = editingPatientName.trim();
            }
            if (editingTeethText.trim()) {
              payload.caseInfos.tooth = editingTeethText.trim();
            }

            if (editingImplantManufacturer.trim()) {
              payload.caseInfos.implantManufacturer =
                editingImplantManufacturer.trim();
            }
            if (editingImplantBrand.trim()) {
              payload.caseInfos.implantBrand = editingImplantBrand.trim();
            }
            if (editingImplantFamily.trim()) {
              payload.caseInfos.implantFamily = editingImplantFamily.trim();
            }
            if (editingImplantType.trim()) {
              payload.caseInfos.implantType = editingImplantType.trim();
            }

            if (Object.keys(payload.caseInfos).length === 0) {
              delete payload.caseInfos;
            }

            const res = await apiFetch<any>({
              path: `/api/requests/${editingRequest.id}`,
              method: "PUT",
              token,
              headers: {
                "Content-Type": "application/json",
              },
              jsonBody: payload,
            });

            if (!res.ok) {
              console.error(
                "의뢰 수정 실패",
                await res.raw.text().catch(() => ""),
              );
            } else {
              await refreshDashboard();
            }
          } catch (e) {
            console.error("의뢰 수정 중 오류", e);
          } finally {
            setEditingRequest(null);
          }
        }}
      />

      <Dialog
        open={unmachinableAlertModalOpen}
        onOpenChange={(open) => {
          setUnmachinableAlertModalOpen(open);
          if (!open) {
            setFocusedUnmachinableRequestId(null);
          }
        }}
      >
        <DialogContent className="w-[92vw] max-w-4xl h-[64vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>불완전 가공 안내</DialogTitle>
          </DialogHeader>

          {loadingUnmachinableOverview ? (
            <div className="text-sm text-muted-foreground">불러오는 중...</div>
          ) : !activeUnmachinableDecisionItem ? (
            <div className="text-sm text-muted-foreground">표시할 불완전 가공 의뢰가 없습니다.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0 overflow-hidden">
                {unmachinablePreviewLoading ? (
                  <div className="flex-1 min-h-0 rounded-md border border-dashed border-slate-300 flex items-center justify-center text-base text-slate-500">
                    원본 STL 불러오는 중...
                  </div>
                ) : unmachinablePreviewFile ? (
                  <div className="flex-1 min-h-0 rounded-md border border-slate-200 overflow-hidden">
                    <StlPreviewViewer
                      file={unmachinablePreviewFile}
                      showOverlay={false}
                    />
                  </div>
                ) : (
                  <div className="flex-1 min-h-0 rounded-md border border-dashed border-slate-300 flex items-center justify-center text-base text-slate-500">
                    {unmachinablePreviewError || "원본 3D 모델 파일이 없습니다."}
                  </div>
                )}

              {(() => {
                const item = activeUnmachinableDecisionItem as any;
                const detail = (unmachinableDetailRequest as any) || item;
                const requestMongoId = String(item?._id || item?.id || "").trim();
                const canDecide = Boolean(requestMongoId);
                const requestId = String(detail?.requestId || item?.requestId || "-").trim() || "-";
                const ci = detail?.caseInfos || item?.caseInfos || {};
                const title =
                  String(detail?.title || item?.title || "").trim() ||
                  [ci?.patientName, ci?.tooth].filter(Boolean).join(" ") ||
                  requestId;
                const reason = String(detail?.rnd?.unmachinableReason || item?.rnd?.unmachinableReason || "").trim();
                const reasonItems = splitUnmachinableReasons(reason);

                const implantManufacturer =
                  String(ci?.implantManufacturer || detail?.implantManufacturer || "").trim() || "-";
                const implantBrand =
                  String(ci?.implantBrand || detail?.implantBrand || "").trim() || "-";
                const implantFamily =
                  String(ci?.implantFamily || detail?.implantFamily || "").trim() || "-";
                const implantType =
                  String(ci?.implantType || detail?.implantType || "").trim() || "-";
                const clinicName =
                  String(ci?.clinicName || detail?.clinicName || "").trim() || "-";
                const patientName =
                  String(ci?.patientName || detail?.patientName || "").trim() || "-";
                const tooth = String(ci?.tooth || detail?.tooth || "").trim() || "-";

                const resolvedSpec = resolveImplantConnectionSpec({
                  implantManufacturer,
                  implantBrand,
                  implantFamily,
                  implantType,
                  connectionDiameter: ci?.connectionDiameter,
                });

                const connectionDiameterText =
                  typeof resolvedSpec.connectionDiameter === "number" &&
                  Number.isFinite(resolvedSpec.connectionDiameter)
                    ? resolvedSpec.connectionDiameter.toFixed(2)
                    : "-";

                return (
                  <div className="rounded-lg border border-accent-muted bg-accent-soft/60 p-3.5 flex flex-col min-h-0 overflow-hidden">
                    <div className="space-y-2.5 overflow-auto pr-1">
                      <div className="text-sm text-slate-600">의뢰번호: {requestId}</div>


                      <div className="rounded-md border border-slate-200 bg-white px-3 py-2.5 space-y-2 text-sm leading-6 text-slate-800">
                        <div>
                          <span className="font-semibold">치과:</span> {clinicName}
                        </div>
                        <div>
                          <span className="font-semibold">환자:</span> {patientName}
                        </div>
                        <div>
                          <span className="font-semibold">치아번호:</span> {tooth}
                        </div>
                        <div className="break-words">
                          <span className="font-semibold">임플란트:</span> {implantManufacturer} / {implantBrand} / {implantFamily} / {implantType}
                        </div>
                        <div>
                          <span className="font-semibold">커넥션 직경:</span> {connectionDiameterText}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 space-y-1">
                        <div className="text-sm font-semibold text-accent-strong">불완전 가공 사유</div>
                        {reasonItems.length > 0 ? (
                          <div className="space-y-0.5">
                            {reasonItems.map((reasonItem, idx) => (
                              <div
                                key={`unmachinable-reason-${idx}`}
                                className="text-[15px] leading-6 text-accent-strong break-words font-medium"
                              >
                                • {reasonItem}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[15px] leading-6 text-accent-strong break-words font-medium">
                            • 미등록
                          </div>
                        )}
                      </div>

                    <div className="mt-auto pt-4">
                      <div className="text-sm text-right leading-6 text-slate-800">
                        해당 의뢰건을 취소할지, 그대로 진행할지 선택해주세요.
                      </div>

                      <div className="mt-3.5 flex items-center justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setUnmachinableAlertModalOpen(false);
                        }}
                        disabled={approvingUnmachinableSelection}
                      >
                        나중에 결정
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="border-destructive text-destructive hover:bg-destructive"
                        onClick={() => {
                          if (!canDecide) return;
                          console.log("[UNMACHINABLE_CANCEL] open confirm", {
                            requestMongoId,
                            requestId,
                          });
                          setPendingCancelIds([requestMongoId]);
                          setUnmachinableCancelConfirmOpen(true);
                        }}
                        disabled={approvingUnmachinableSelection || !canDecide}
                      >
                        의뢰 취소
                      </Button>
                      <Button
                        type="button"
                        onClick={async () => {
                          if (!canDecide) return;
                          const continued =
                            await handleContinueSingleUnmachinableRequest(requestMongoId);
                          if (continued) {
                            setUnmachinableAlertModalOpen(false);
                          }
                        }}
                        disabled={approvingUnmachinableSelection || !canDecide}
                      >
                        의뢰 계속 진행
                      </Button>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={unmachinableCancelConfirmOpen}
        title="의뢰건 자체를 취소합니다"
        description="해당 불완전 가공 의뢰건을 취소 처리합니다. 계속할까요?"
        confirmLabel="취소 진행"
        cancelLabel="닫기"
        onCancel={() => {
          setUnmachinableCancelConfirmOpen(false);
          clearPendingCancelIds();
        }}
        onConfirm={async () => {
          console.log("[UNMACHINABLE_CANCEL] confirm dialog onConfirm");
          await handleConfirmCancelUnmachinableRequests();
        }}
      />

      <Dialog open={statsModalOpen} onOpenChange={setStatsModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{statsModalLabel} 세부 내역</DialogTitle>
          </DialogHeader>

          {loadingMyRequestsForModal ? (
            <div className="text-sm text-muted-foreground">불러오는 중...</div>
          ) : resolvedModalItems.length === 0 ? (
            hasNextPage || isFetchingNextPage ? (
              <div className="text-sm text-muted-foreground">세부 내역 검색 중...</div>
            ) : (
              <div className="text-sm text-muted-foreground">
                표시할 내역이 없습니다.
              </div>
            )
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-auto pr-1">
              {resolvedModalItems.map((r: any) => {
                const ci = r?.caseInfos || {};
                const title =
                  String(r?.title || "").trim() ||
                  [ci?.patientName, ci?.tooth].filter(Boolean).join(" ") ||
                  String(r?.requestId || "");
                const isUnmachinable = isUnmachinableRequest(r);
                const unmachinableReason = getUnmachinableReason(r);
                return (
                  <button
                    key={String(r?._id || r?.id || Math.random())}
                    type="button"
                    className={`w-full text-left rounded-md border px-3 py-2 hover:bg-gray-50 ${
                      isUnmachinable
                        ? "border-accent-muted ring-2 ring-accent-muted/80 bg-accent-soft/40"
                        : "border-gray-200 bg-white"
                    }`}
                    onClick={() => {
                      setStatsModalOpen(false);
                      openEditDialogFromRequest(r);
                    }}
                  >
                    <div className="text-sm font-semibold text-gray-900 truncate flex items-center gap-2">
                      <span className="truncate">{title}</span>
                      {isUnmachinable && (
                        <Badge variant="outline" className="text-[10px] h-5 border-accent-muted text-accent-strong bg-accent-soft">
                          불완전 가공
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      상태: {getNormalizedStageLabelSafe(r)} / 의뢰번호: {String(r?.requestId || "")}
                    </div>

                    {isUnmachinable && (
                      <div className="text-[11px] text-accent-strong truncate mt-1">
                        불완전 가공 사유: {unmachinableReason || "미등록"}
                      </div>
                    )}
                  </button>
                );
              })}
              <div ref={loadMoreRef} className="h-4">
                {isFetchingNextPage && (
                  <div className="text-center text-xs text-muted-foreground py-2">
                    불러오는 중...
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

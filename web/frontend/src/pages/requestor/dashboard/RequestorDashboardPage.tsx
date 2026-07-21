import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useInView } from "react-intersection-observer";
import { useLocation, useOutletContext } from "react-router-dom";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import { DashboardShellSkeleton } from "@/shared/ui/dashboard/DashboardShellSkeleton";
import {
  CheckCircle,
  Factory,
  FileText,
  Package,
  Boxes,
  Wrench,
  AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import {
  RequestorEditRequestDialog,
  type EditingRequestState,
} from "./components/RequestorEditRequestDialog";
import { RequestorDashboardStatsCards } from "./components/RequestorDashboardStatsCards";
import { RequestorPricingReferralPolicyCard } from "./components/RequestorPricingReferralPolicyCard";
import {
  RequestorRiskSummaryCard,
  type RiskSummaryItem,
} from "@/shared/ui/dashboard/RequestorRiskSummaryCard";
import { RequestorBulkShippingBannerCard } from "./components/RequestorBulkShippingBannerCard";
import { RequestorRecentRequestsCard } from "./components/RequestorRecentRequestsCard";
import { RequestorShippingSummaryCard } from "./components/RequestorShippingSummaryCard";
import type { RequestorDashboardStat } from "./components/RequestorDashboardStatsCards";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CreditLedgerModal } from "./components/CreditLedgerModal";
import { PastRequestsModal } from "@/shared/components/PastRequestsModal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  RequestDetailDialog,
  type RequestDetailDialogRequest,
} from "@/features/requests/components/RequestDetailDialog";
import { getNormalizedStage, getNormalizedStageLabel } from "@/utils/stage";
import { onAppEvent } from "@/shared/realtime/socket";
import { useSystemSettings } from "@/hooks/useSystemSettings";

type DashboardOutletContext = {
  creditBalance: number | null;
  paidCredit: number | null;
  bonusRequestCredit: number | null;
  bonusShippingCredit: number | null;
  loadingCreditBalance: boolean;
};

export const RequestorDashboardPage = () => {
  const { user, token } = useAuthStore();
  const queryClient = useQueryClient();
  const location = useLocation();
  const { toast } = useToast();
  const {
    creditBalance,
    paidCredit,
    bonusRequestCredit,
    bonusShippingCredit,
    loadingCreditBalance,
  } = useOutletContext<DashboardOutletContext>();
  const { data: systemSettings } = useSystemSettings();

  const [period, setPeriod] = useState<PeriodFilterValue>("30d");
  const [creditLedgerOpen, setCreditLedgerOpen] = useState(false);
  const [pastRequestsOpen, setPastRequestsOpen] = useState(false);
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
  const [selectedRiskSummaryItem, setSelectedRiskSummaryItem] =
    useState<RiskSummaryItem | null>(null);
  const [riskSummaryDetail, setRiskSummaryDetail] =
    useState<RequestDetailDialogRequest | null>(null);
  const [riskSummaryDetailLoading, setRiskSummaryDetailLoading] =
    useState(false);

  const [statsModalOpen, setStatsModalOpen] = useState(false);
  const [statsModalLabel, setStatsModalLabel] = useState<string>("");

  const [unmachinableAlertModalOpen, setUnmachinableAlertModalOpen] =
    useState(false);
  const [selectedUnmachinableIds, setSelectedUnmachinableIds] = useState<
    Set<string>
  >(new Set());
  const [confirmingUnmachinableSelection, setConfirmingUnmachinableSelection] =
    useState(false);

  const summaryQueryKey = useMemo(
    () => [
      "requestor-dashboard-summary-page",
      period,
      String(user?.id || ""),
      String((user as any)?.businessAnchorId || ""),
    ],
    [period, user],
  );

  const stageGroupByLabel: Record<string, string[] | null> = {
    // 6단계 공통 공정: 의뢰(취소 포함) → CAM → 가공 → 세척.패킹 → 포장.발송 → 추적관리
    "의뢰/취소": ["request", "cancel"],
    CAM: ["cam"],
    가공: ["machining"],
    "세척.패킹": ["packing"],
    "포장.발송": ["shipping"],
    추적관리: ["tracking"],
    // 상세 공정 코드(가공불가)는 별도 분기 처리
    가공불가: null,
  };

  const getNormalizedStageOrNull = (requestLike: any): string | null => {
    if (!requestLike?.manufacturerStage) {
      return null;
    }
    try {
      return getNormalizedStage(requestLike);
    } catch {
      return null;
    }
  };

  const isCanceledRequest = (requestLike: any): boolean => {
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
  };

  const isUnmachinableRequest = (requestLike: any): boolean =>
    Boolean(requestLike?.rnd?.unmachinableAt);

  const getUnmachinableReason = (requestLike: any): string =>
    String(requestLike?.rnd?.unmachinableReason || "").trim();

  const filterAbutmentRequest = (r: any) => {
    if (!r) return false;
    const ci = r.caseInfos || {};
    const implantBrand = String(ci.implantBrand).trim();
    return Boolean(implantBrand);
  };

  const getModalItems = (all: any[], label: string) => {
    const group = stageGroupByLabel[label];
    const base = (all || []).filter(filterAbutmentRequest);

    // 가공불가는 stage(manufacturerStage)가 아니라 rnd 상세 상태로 분류한다.
    if (label === "가공불가") {
      return base.filter((r) => Boolean(r?.rnd?.unmachinableAt));
    }

    if (!group) return base;
    return base.filter((r) => {
      const normalized = getNormalizedStageOrNull(r);
      return normalized ? group.includes(normalized) : false;
    });
  };

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
  }, [infiniteData, statsModalLabel]);

  const [insufficientCredit, setInsufficientCredit] = useState(false);
  const [insufficientShippingCredit, setInsufficientShippingCredit] =
    useState(false);

  const {
    data: summaryResponse,
    refetch: refetchSummary,
    isFetching,
    isLoading,
  } = useQuery({
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
    enabled: !!token,
  });

  const {
    data: bulkResponse,
    isLoading: isBulkLoading,
    isFetching: isBulkFetching,
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
  });

  const { data: unmachinableOverviewResponse, isLoading: loadingUnmachinableOverview } =
    useQuery({
      queryKey: ["requestor-unmachinable-overview", period],
      queryFn: async () => {
        const res = await apiFetch<any>({
          path: `/api/requests/unmachinable-overview?period=${period}&limit=100`,
          method: "GET",
          token,
        });
        if (!res.ok) {
          throw new Error("가공불가 목록 조회에 실패했습니다.");
        }
        return res.data;
      },
      enabled: Boolean(token) && unmachinableAlertModalOpen,
      retry: false,
    });

  // 의뢰비 충전 경고
  // 의뢰, CAM 단계에 의뢰건이 있으면서 크레딧이 부족한지 확인
  // 의뢰비 결제: 유료 크레딧 + 무료 의뢰비 크레딧 사용 가능 (무료 배송비 크레딧은 사용 불가)
  useEffect(() => {
    if (
      summaryResponse?.success &&
      paidCredit !== null &&
      bonusRequestCredit !== null &&
      systemSettings?.creditSettings
    ) {
      const stats = summaryResponse.data.stats ?? {};
      const pricePerRequest =
        systemSettings.creditSettings.minCreditForRequest || 10000;

      // 의뢰, CAM 단계에 의뢰건이 있으면 경고
      const inRequest = stats.totalRequests || 0;
      const inCam = stats.inCam || 0;
      const totalPendingRequests = inRequest + inCam;

      // 의뢰비는 유료 크레딧 + 무료 의뢰비 크레딧 사용 가능
      const availableForRequest = paidCredit + bonusRequestCredit;
      const requiredCredit = totalPendingRequests * pricePerRequest;

      if (totalPendingRequests > 0 && availableForRequest < requiredCredit) {
        setInsufficientCredit(true);
      } else {
        setInsufficientCredit(false);
      }
    }
  }, [summaryResponse, paidCredit, bonusRequestCredit, systemSettings]);

  // 배송비 충전 경고
  // 묶음 배송 건수를 기준으로 필요한 배송비 계산
  // 배송비 결제: 유료 크레딧 + 무료 배송비 크레딧 사용 가능
  useEffect(() => {
    if (
      bulkResponse?.success &&
      paidCredit !== null &&
      bonusShippingCredit !== null &&
      systemSettings?.creditSettings
    ) {
      const shippingFeePerBox =
        systemSettings.creditSettings.shippingFee || 3500;

      // 묶음 배송 후보 건수 (실제 배송될 박스 수)
      const bulkShippingCandidates = bulkResponse.data?.candidates || [];
      const totalShippingBoxes = bulkShippingCandidates.length;

      // 배송비는 유료 크레딧 + 무료 배송비 크레딧으로 결제
      const availableForShipping = paidCredit + bonusShippingCredit;
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
  }, [bulkResponse, bonusShippingCredit, paidCredit, systemSettings]);

  const refreshDashboard = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ["requestor-dashboard-summary-page"],
    });
    void queryClient.invalidateQueries({
      queryKey: ["requestor-my-requests"],
    });
    void refetchSummary();
    void refetchBulk();
  }, [queryClient, refetchBulk, refetchSummary]);

  useEffect(() => {
    const refreshDashboardAt = Number(
      (location.state as any)?.refreshDashboardAt || 0,
    );
    if (!refreshDashboardAt) return;
    refreshDashboard();
  }, [location.state, refreshDashboard]);

  useEffect(() => {
    if (!token) return;
    if (!user) return;
    if (user.role !== "requestor") return;

    const unsubscribe = onAppEvent((evt) => {
      const type = String(evt?.type || "").trim();
      const payload = evt?.data || {};
      const eventRequest = payload?.request;
      const eventOrgId = String(
        payload?.requestorBusinessAnchorId ||
          eventRequest?.requestorBusinessAnchorId ||
          eventRequest?.businessAnchorId ||
          eventRequest?.requestor?.businessAnchorId ||
          "",
      ).trim();
      const myOrgId = String((user as any)?.businessAnchorId || "").trim();
      if (!eventOrgId || !myOrgId || eventOrgId !== myOrgId) return;

      if (type === "request:stage-changed") {
        // 공정 변경 시 전체 대시보드 summary 무효화 및 재조회
        // manufacturingSummary, stats, recentRequests 모두 최신 데이터로 업데이트
        void queryClient.invalidateQueries({
          queryKey: summaryQueryKey,
        });

        // 배송 관련 공정 변경 시 bulk shipping도 무효화
        if (
          ["세척.패킹", "포장.발송", "추적관리"].includes(
            String(payload?.toStage || "").trim(),
          )
        ) {
          void queryClient.invalidateQueries({
            queryKey: ["requestor-bulk-shipping"],
          });
        }
        return;
      }

      if (
        type === "request:rnd-unmachinable-updated" ||
        type === "request:rnd-unmachinable-confirmed" ||
        type === "request:hex-rotation-updated"
      ) {
        void queryClient.invalidateQueries({
          queryKey: summaryQueryKey,
        });
        void queryClient.invalidateQueries({
          queryKey: ["requestor-my-requests"],
        });
        void queryClient.invalidateQueries({
          queryKey: ["requestor-bulk-shipping"],
        });

        if (type === "request:hex-rotation-updated" && selectedRiskSummaryItem?.id) {
          const selectedRequestMongoId = String(selectedRiskSummaryItem.id || "").trim();
          const eventRequestMongoId = String(
            payload?.requestMongoId || eventRequest?._id || "",
          ).trim();

          if (selectedRequestMongoId && eventRequestMongoId === selectedRequestMongoId) {
            setRiskSummaryDetailLoading(true);
            void apiFetch<any>({
              path: `/api/requests/${selectedRequestMongoId}`,
              method: "GET",
              token,
            })
              .then((res) => {
                if (res.ok && res.data?.success) {
                  setRiskSummaryDetail(res.data.data || null);
                }
              })
              .finally(() => {
                setRiskSummaryDetailLoading(false);
              });
          }
        }
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [queryClient, selectedRiskSummaryItem, summaryQueryKey, token, user]);

  const bulkData = bulkResponse?.success ? bulkResponse.data : null;

  const riskSummary = useMemo(() => {
    if (!summaryResponse?.success) return null;
    const baseSummary = summaryResponse.data.riskSummary ?? null;
    if (!baseSummary) return null;

    const originalItems = Array.isArray(baseSummary.items)
      ? baseSummary.items
      : [];
    const filteredItems = originalItems.filter(
      (item) => !isCanceledRequest(item),
    );

    if (filteredItems.length === originalItems.length) {
      return baseSummary;
    }

    const delayedCount = filteredItems.filter(
      (item) => item.riskLevel === "danger",
    ).length;
    const warningCount = filteredItems.length - delayedCount;

    return {
      ...baseSummary,
      items: filteredItems,
      delayedCount,
      warningCount,
    };
  }, [summaryResponse]);

  const recentRequests = useMemo(() => {
    if (!summaryResponse?.success) return [];
    const requests = Array.isArray(summaryResponse.data.recentRequests)
      ? summaryResponse.data.recentRequests
      : [];
    return requests.filter((r: any) => !isCanceledRequest(r));
  }, [summaryResponse]);

  // 상단 alert 배지는 "미확인(읽지 않음)" 판정 건수를 사용한다.
  const unmachinableAlertCount = useMemo(() => {
    const fromStats = Number(summaryResponse?.data?.stats?.unmachinableCount);
    if (Number.isFinite(fromStats)) return Math.max(0, fromStats);
    return recentRequests.filter((r) => isUnmachinableRequest(r)).length;
  }, [recentRequests, summaryResponse]);

  // 상단 통계카드(가공불가)는 기록용 누적(확인 포함) 건수를 사용한다.
  const unmachinableRecordedCount = useMemo(() => {
    const stats = summaryResponse?.data?.stats || {};
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
  }, [recentRequests, summaryResponse]);

  const isInitialLoading =
    isLoading || isBulkLoading || loadingCreditBalance || !summaryResponse;

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

    // 낙관적 UI 업데이트: 취소 요청 전 미리 화면에서 제거
    queryClient.setQueryData<any>(summaryQueryKey, (prev) => {
      if (!prev?.success || !prev?.data) return prev;
      const recentRequests = prev.data.recentRequests || [];
      return {
        ...prev,
        data: {
          ...prev.data,
          recentRequests: recentRequests.filter(
            (r: any) => String(r._id || r.id) !== requestId,
          ),
        },
      };
    });

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
            "의뢰 또는 CAM 단계에서만 취소할 수 있습니다. 가공 단계부터는 취소가 불가능합니다.",
          variant: "destructive",
          duration: 3000,
        });
        // 실패 시 롤백
        refreshDashboard();
        return;
      }

      toast({
        title: "의뢰가 취소되었습니다",
        duration: 2000,
      });

      try {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("abuts:credits:updated"));
        }
      } catch {}

      // 백그라운드에서 최신 데이터 갱신
      refreshDashboard();
    } catch (error) {
      console.error("의뢰 취소 중 오류", error);
      toast({
        title: "의뢰 취소 중 오류",
        description: "다시 시도해주세요.",
        variant: "destructive",
        duration: 3000,
      });
      // 에러 시 롤백
      refreshDashboard();
    }
  };

  // 의뢰자 가공불가 확인(읽음) 처리
  const confirmUnmachinableRequest = async (requestId: string) => {
    if (!token || !requestId) return;
    try {
      const res = await apiFetch<any>({
        path: `/api/requests/${requestId}/rnd-unmachinable/confirm`,
        method: "PATCH",
        token,
      });
      if (!res.ok) {
        throw new Error(res.data?.message || "가공불가 확인 처리에 실패했습니다.");
      }
      refreshDashboard();
    } catch (error) {
      console.error("가공불가 확인 처리 실패", error);
      toast({
        title: "가공불가 확인 처리 실패",
        description: "잠시 후 다시 시도해주세요.",
        variant: "destructive",
        duration: 2500,
      });
    }
  };

  const unmachinableOverviewItems = useMemo(() => {
    const rows = Array.isArray(unmachinableOverviewResponse?.data?.items)
      ? unmachinableOverviewResponse?.data?.items
      : [];
    return rows.filter((row: any) => Boolean(row?.rnd?.unmachinableAt));
  }, [unmachinableOverviewResponse]);

  const selectableUnmachinableIds = useMemo(() => {
    return unmachinableOverviewItems
      .filter((row: any) => !row?.rnd?.unmachinableConfirmedAt)
      .map((row: any) => String(row?._id || "").trim())
      .filter(Boolean);
  }, [unmachinableOverviewItems]);

  useEffect(() => {
    if (!unmachinableAlertModalOpen) return;
    setSelectedUnmachinableIds(new Set(selectableUnmachinableIds));
  }, [unmachinableAlertModalOpen, selectableUnmachinableIds]);

  const toggleUnmachinableSelection = (requestId: string, checked: boolean) => {
    setSelectedUnmachinableIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(requestId);
      else next.delete(requestId);
      return next;
    });
  };

  const toggleSelectAllUnmachinable = (checked: boolean) => {
    if (checked) {
      setSelectedUnmachinableIds(new Set(selectableUnmachinableIds));
      return;
    }
    setSelectedUnmachinableIds(new Set());
  };

  const confirmSelectedUnmachinableRequests = async () => {
    if (!token) return;
    const targetIds = Array.from(selectedUnmachinableIds.values()).filter(Boolean);
    if (!targetIds.length) {
      toast({
        title: "선택된 의뢰가 없습니다",
        description: "확인 처리할 가공불가 의뢰를 선택해주세요.",
        duration: 1800,
      });
      return;
    }

    setConfirmingUnmachinableSelection(true);
    try {
      let successCount = 0;
      for (const requestId of targetIds) {
        const res = await apiFetch<any>({
          path: `/api/requests/${requestId}/rnd-unmachinable/confirm`,
          method: "PATCH",
          token,
        });
        if (res.ok) successCount += 1;
      }

      toast({
        title: "가공불가 확인 처리 완료",
        description: `${successCount}건을 확인 처리했습니다.`,
        duration: 2000,
      });
      setUnmachinableAlertModalOpen(false);
      refreshDashboard();
    } catch (error) {
      console.error("가공불가 선택 확인 처리 실패", error);
      toast({
        title: "가공불가 확인 처리 실패",
        description: "잠시 후 다시 시도해주세요.",
        variant: "destructive",
        duration: 2500,
      });
    } finally {
      setConfirmingUnmachinableSelection(false);
    }
  };

  const allSelectableChecked =
    selectableUnmachinableIds.length > 0 &&
    selectableUnmachinableIds.every((id) => selectedUnmachinableIds.has(id));

  if (isInitialLoading) {
    return <DashboardShellSkeleton showMain />;
  }

  const showSkeleton = (isLoading || isFetching) && !summaryResponse;

  const stats: RequestorDashboardStat[] = (() => {
    if (!summaryResponse?.success) {
      return [
        { label: "의뢰/취소", value: "0 / 0", icon: FileText },
        { label: "CAM", value: "0", icon: Wrench },
        { label: "가공", value: "0", icon: Factory },
        { label: "세척.패킹", value: "0", icon: Boxes },
        { label: "포장.발송", value: "0건/0박스", icon: Package },
        { label: "추적관리", value: "0건/0박스", icon: CheckCircle },
        { label: "가공불가", value: "0", icon: AlertTriangle },
      ];
    }

    const s = summaryResponse.data.stats ?? {};
    const shippingProductCount = Number(s.inShipping ?? 0);
    const shippingBoxCount = Number(s.inShippingBoxes ?? 0);
    const trackingProductCount = Number(s.inTracking ?? 0);
    const trackingBoxCount = Number(s.inTrackingBoxes ?? 0);
    return [
      {
        label: "의뢰/취소",
        value: `${s.totalRequests ?? 0} / ${
          (s.canceled ?? s.canceledCount ?? 0) as number
        }`,
        change: `${s.totalRequestsChange ?? "+0%"}/${s.canceledChange ?? "+0%"}`,
        icon: FileText,
      },
      {
        label: "CAM",
        value: String(s.inCam ?? 0),
        change: s.inCamChange ?? "+0%",
        icon: Wrench,
      },
      {
        label: "가공",
        value: String(s.inProduction ?? 0),
        change: s.inProductionChange ?? "+0%",
        icon: Factory,
      },
      {
        label: "세척.패킹",
        value: String(s.inPacking ?? 0),
        change: s.inPackingChange ?? "+0%",
        icon: Boxes,
      },
      {
        label: "포장.발송",
        value: `${shippingProductCount}건/${shippingBoxCount}박스`,
        change: s.inShippingChange ?? "+0%",
        icon: Package,
      },
      {
        label: "추적관리",
        value: `${trackingProductCount}건/${trackingBoxCount}박스`,
        change: s.inTrackingChange ?? "+0%",
        icon: CheckCircle,
      },
      {
        label: "가공불가",
        value: String(unmachinableRecordedCount),
        change: "+0%",
        icon: AlertTriangle,
      },
    ];
  })();

  const canOpenCreditLedger = user.role === "requestor";

  if (showSkeleton) {
    return <DashboardShellSkeleton />;
  }

  return (
    <div>
      <DashboardShell
        title={`안녕하세요, ${user.name}님!`}
        statsGridClassName="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-2.5"
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
          <div className="flex flex-wrap items-center gap-2 w-full">
            <PeriodFilter value={period} onChange={setPeriod} />
            {canOpenCreditLedger && (
              <TooltipProvider>
                <Tooltip
                  open={insufficientCredit || insufficientShippingCredit}
                >
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant={
                        insufficientCredit || insufficientShippingCredit
                          ? "destructive"
                          : "outline"
                      }
                      size="sm"
                      className={`h-8 transition-all ${
                        insufficientCredit || insufficientShippingCredit
                          ? "ring-2 ring-destructive ring-offset-2 animate-pulse"
                          : ""
                      }`}
                      onClick={() => setCreditLedgerOpen(true)}
                    >
                      {loadingCreditBalance
                        ? "보유 크레딧: ..."
                        : `보유 크레딧: ${Number(
                            creditBalance || 0,
                          ).toLocaleString()}원`}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    className="bg-destructive text-destructive-foreground"
                  >
                    <p>
                      {insufficientCredit && insufficientShippingCredit
                        ? "의뢰비와 배송비 크레딧이 모두 부족합니다"
                        : insufficientCredit
                          ? "의뢰비 크레딧이 부족합니다. 충전하시면 생산이 진행됩니다"
                          : "배송비 크레딧이 부족합니다. 충전해주세요"}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setPastRequestsOpen(true)}
            >
              지난 의뢰
            </Button>

            {unmachinableAlertCount > 0 && (
              <button
                type="button"
                onClick={() => setUnmachinableAlertModalOpen(true)}
                className="inline-flex h-8 items-center rounded-md border border-red-300 bg-red-50 px-3 text-sm font-semibold text-red-700 ring-2 ring-red-200 hover:bg-red-100"
                title="가공불가 의뢰 목록을 확인합니다"
              >
                가공불가 의뢰 {unmachinableAlertCount}건 발생
              </button>
            )}
          </div>
        }
        stats={
          <RequestorDashboardStatsCards
            stats={stats}
            onCardClick={(stat) => {
              setStatsModalLabel(stat.label);
              setStatsModalOpen(true);
            }}
          />
        }
        topSection={
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 items-stretch">
              <RequestorPricingReferralPolicyCard />
              <RequestorShippingSummaryCard />
              <RequestorBulkShippingBannerCard
                bulkData={bulkData}
                onRefresh={() => {
                  refetchBulk();
                }}
                onOpenBulkModal={() => {}}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
              <RequestorRecentRequestsCard
                items={recentRequests}
                onRefresh={() => {
                  refetchSummary();
                  refetchBulk();
                }}
                onEdit={openEditDialogFromRequest}
                onCancel={cancelRequest}
                onConfirmUnmachinable={confirmUnmachinableRequest}
              />

              <RequestorRiskSummaryCard
                riskSummary={riskSummary}
                onItemClick={(item) => {
                  setSelectedRiskSummaryItem(item);
                  setRiskSummaryDetailLoading(true);
                  apiFetch<any>({
                    path: `/api/requests/${item.id}`,
                    method: "GET",
                    token,
                  })
                    .then((res) => {
                      if (!res.ok) {
                        throw new Error("의뢰 상세 조회에 실패했습니다.");
                      }
                      if (!res.data?.success) {
                        throw new Error("의뢰 상세 데이터가 없습니다.");
                      }
                      setRiskSummaryDetail(res.data.data || null);
                    })
                    .catch((error) => {
                      console.error("의뢰 상세 조회 실패", error);
                      setRiskSummaryDetail(null);
                    })
                    .finally(() => {
                      setRiskSummaryDetailLoading(false);
                    });
                }}
              />
            </div>
          </div>
        }
      />

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

      <CreditLedgerModal
        open={creditLedgerOpen}
        onOpenChange={setCreditLedgerOpen}
      />

      <PastRequestsModal
        open={pastRequestsOpen}
        onOpenChange={setPastRequestsOpen}
        title="지난 의뢰"
        onSelectRequest={(r) => {
          setPastRequestsOpen(false);
          openEditDialogFromRequest(r);
        }}
      />

      <Dialog
        open={unmachinableAlertModalOpen}
        onOpenChange={(open) => {
          setUnmachinableAlertModalOpen(open);
          if (!open) {
            // 취소/닫기는 읽음 처리 없이 선택 상태만 초기화
            setSelectedUnmachinableIds(new Set());
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>가공불가 의뢰 목록</DialogTitle>
            <DialogDescription>
              확인할 의뢰를 체크한 뒤 [선택 확인 처리]를 누르면 읽음 처리됩니다.
              [취소/닫기] 시에는 읽음 처리되지 않습니다.
            </DialogDescription>
          </DialogHeader>

          {loadingUnmachinableOverview ? (
            <div className="text-sm text-muted-foreground">불러오는 중...</div>
          ) : unmachinableOverviewItems.length === 0 ? (
            <div className="text-sm text-muted-foreground">표시할 가공불가 의뢰가 없습니다.</div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                <Checkbox
                  checked={allSelectableChecked}
                  onCheckedChange={(checked) =>
                    toggleSelectAllUnmachinable(Boolean(checked))
                  }
                />
                <span className="text-sm">
                  전체 선택 ({selectedUnmachinableIds.size}/{selectableUnmachinableIds.length})
                </span>
              </div>

              <div className="space-y-2 max-h-[45vh] overflow-auto pr-1">
                {unmachinableOverviewItems.map((item: any) => {
                  const requestMongoId = String(item?._id || "").trim();
                  const requestId = String(item?.requestId || "-").trim() || "-";
                  const ci = item?.caseInfos || {};
                  const title =
                    String(item?.title || "").trim() ||
                    [ci?.patientName, ci?.tooth].filter(Boolean).join(" ") ||
                    requestId;
                  const reason = String(item?.rnd?.unmachinableReason || "").trim();
                  const confirmed = Boolean(item?.rnd?.unmachinableConfirmedAt);
                  const checked = selectedUnmachinableIds.has(requestMongoId);

                  return (
                    <div
                      key={requestMongoId || requestId}
                      className={`rounded-md border px-3 py-2 ${
                        confirmed
                          ? "border-slate-200 bg-slate-50"
                          : "border-red-300 bg-red-50/40"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={confirmed ? true : checked}
                          disabled={confirmed}
                          onCheckedChange={(next) =>
                            toggleUnmachinableSelection(
                              requestMongoId,
                              Boolean(next),
                            )
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-medium truncate">{title}</div>
                            <Badge
                              variant={confirmed ? "outline" : "destructive"}
                              className="text-[10px]"
                            >
                              {confirmed ? "확인됨" : "미확인"}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            의뢰번호: {requestId}
                          </div>
                          <div className="text-xs text-red-700 truncate mt-1">
                            가공불가 사유: {reason || "미등록"}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setUnmachinableAlertModalOpen(false)}
                  disabled={confirmingUnmachinableSelection}
                >
                  취소
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    void confirmSelectedUnmachinableRequests();
                  }}
                  disabled={
                    confirmingUnmachinableSelection ||
                    selectedUnmachinableIds.size === 0
                  }
                >
                  {confirmingUnmachinableSelection
                    ? "처리 중..."
                    : "선택 확인 처리"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <RequestDetailDialog
        open={Boolean(selectedRiskSummaryItem)}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRiskSummaryItem(null);
            setRiskSummaryDetail(null);
          }
        }}
        request={riskSummaryDetail || selectedRiskSummaryItem || null}
        description={
          riskSummaryDetailLoading
            ? "불러오는 중..."
            : selectedRiskSummaryItem?.message ||
              "지연 가능 의뢰의 정보를 확인하세요."
        }
        extraBadge={
          selectedRiskSummaryItem ? (
            <Badge
              variant={
                selectedRiskSummaryItem.riskLevel === "danger"
                  ? "destructive"
                  : "outline"
              }
              className="text-[11px]"
            >
              {selectedRiskSummaryItem.riskLevel === "danger"
                ? "지연확정"
                : "지연가능"}
            </Badge>
          ) : null
        }
      />

      <Dialog open={statsModalOpen} onOpenChange={setStatsModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{statsModalLabel} 세부 내역</DialogTitle>
          </DialogHeader>

          {loadingMyRequestsForModal ? (
            <div className="text-sm text-muted-foreground">불러오는 중...</div>
          ) : modalItems.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              표시할 내역이 없습니다.
            </div>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-auto pr-1">
              {modalItems.map((r: any) => {
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
                        ? "border-red-300 ring-2 ring-red-200 bg-red-50/40"
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
                        <Badge variant="destructive" className="text-[10px] h-5">
                          가공불가
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      상태: {getNormalizedStageLabel(r)} / 의뢰번호: {String(r?.requestId || "")}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      헥스 회전: {(() => {
                        const finalHexRaw = String(ci?.finalHexRotation || "").trim();
                        if (finalHexRaw === "30") return "원본 각도";
                        if (finalHexRaw === "0") return "각도 보정";
                        return String(ci?.requestorHexRotation || "").trim() === "30"
                          ? "원본 각도"
                          : "각도 보정";
                      })()}
                    </div>
                    {isUnmachinable && (
                      <div className="text-[11px] text-red-700 truncate mt-1">
                        가공불가 사유: {unmachinableReason || "미등록"}
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

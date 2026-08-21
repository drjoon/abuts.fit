// change-log:
// - 2026-08-21: 기공의뢰(PTX) CA는 어벗츠로의뢰 상세에서 취소 안내만.
// - 2026-08-21: 기공의뢰 취소 후 헤더 건수 재조회. 마운트 시 summary refetch.
// - 2026-08-21: 헥스 확인용 원본↔샘플 취소 시 목록·건수에서 함께 제거
// - 2026-08-19: 기공소·어벗츠기공소 어벗생산의뢰에도 동일 헤더(대기보드 대체).
// - 2026-08-19: 진행중 목록 일괄 취소는 PATCH /status/batch 한 요청으로 처리.
// - 2026-08-19: 제출·공정 변경 소켓으로 진행중/출고예정 건수 재조회(리프레시 없이).
// - 2026-08-19: 취소 확인은 즉시 닫고, 헤더 건수 재조회는 스냅샷 완료 뒤로 미룸.
// - 2026-08-19: 헤더 라벨 출고예정. 취소 후 출고 스냅샷 쿼리도 무효화.
// - 2026-08-19: 취소 후 진행중인 의뢰 목록으로 복귀. 확인 클릭이 목록을 닫지 않음.
// - 2026-08-19: 진행중인 의뢰 상세에서 준비 단계 취소. 원본 STL 프리뷰는 RequestDetailDialog.
// - 2026-08-19: [정책 안내] 오른쪽 [진행중인 의뢰] — 준비~포장.발송.
// - 2026-08-18: 지난의뢰 건수·목록에서 취소 제외(추적관리만).
// - 2026-08-18: 치과 어벗디자인 상단 — 기간필터·정책안내·출고예정·지난의뢰·불완전가공.
// related files:
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// - web/frontend/src/shared/components/RequestorWorkspaceHeader.tsx
// - web/frontend/src/pages/requestor/dashboard/components/RequestorPolicyRemakeHeader.tsx
// - web/frontend/src/pages/requestor/dashboard/components/RequestorBulkShippingBannerCard.tsx
// - web/frontend/src/pages/requestor/dashboard/components/RequestorUnmachinableHost.tsx
// - web/frontend/src/shared/components/PastRequestsModal.tsx
// - web/frontend/src/features/requests/components/RequestDetailDialog.tsx
// - web/frontend/src/shared/realtime/useAppEventDebouncedReload.ts
// - web/frontend/src/shared/realtime/creditBalanceEvent.ts
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { useAppEventDebouncedReload } from "@/shared/realtime/useAppEventDebouncedReload";
import { isCreditEventForBusiness } from "@/shared/realtime/creditBalanceEvent";
import { RequestorWorkspaceHeader } from "@/shared/components/RequestorWorkspaceHeader";
import { RequestorPolicyRemakeHeader } from "@/pages/requestor/dashboard/components/RequestorPolicyRemakeHeader";
import { RequestorBulkShippingBannerCard } from "@/pages/requestor/dashboard/components/RequestorBulkShippingBannerCard";
import { RequestorUnmachinableHost } from "@/pages/requestor/dashboard/components/RequestorUnmachinableHost";
import { PastRequestsModal } from "@/shared/components/PastRequestsModal";
import { RequestDetailDialog } from "@/features/requests/components/RequestDetailDialog";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { getNormalizedStageLabelSafe } from "@/utils/stage";
import type { PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import {
  PRACTICE_TRANSFER_CANCEL_FROM_ABUTS_MESSAGE,
  isPracticeTransferLinkedRequest,
} from "@/shared/practice/practiceTransferAbutsCancel";

/** 지난의뢰(추적관리)를 제외한 생산 파이프라인 */
const IN_PROGRESS_MANUFACTURER_STAGES = [
  "준비",
  "의뢰",
  "CAM",
  "가공",
  "세척.패킹",
  "포장.발송",
];

const isPrepCancelableRequest = (request: unknown) =>
  getNormalizedStageLabelSafe(request) === "준비";

export const RequestorAbutmentPageHeader = () => {
  const { user, token } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<PeriodFilterValue>("30d");
  const [inProgressOpen, setInProgressOpen] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);
  const [selectedPastRequest, setSelectedPastRequest] = useState<any | null>(
    null,
  );
  const [listSource, setListSource] = useState<"inProgress" | "past" | null>(
    null,
  );
  const [canceledMongoIds, setCanceledMongoIds] = useState<string[]>([]);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [canceling, setCanceling] = useState(false);

  const cardsSummaryQueryKey = useMemo(
    () => [
      "requestor-dashboard-cards-summary",
      period,
      String(user?.id || ""),
      String(user?.businessAnchorId || ""),
    ],
    [period, user],
  );

  const { data: cardsSummaryResponse } = useQuery({
    queryKey: cardsSummaryQueryKey,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (period) params.set("period", period);
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
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
    enabled: !!token,
    placeholderData: (previous) => previous,
  });

  const { data: bulkResponse, refetch: refetchBulk } = useQuery({
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

  useAppEventDebouncedReload({
    enabled: Boolean(token) && Boolean(user?.businessAnchorId),
    eventTypes: [
      "credit:balance-updated",
      "request:stage-changed",
      "request:delivery-updated",
      "request:delivery-updated-batch",
    ],
    delayMs: 160,
    deferWhenEditing: false,
    shouldHandle: (evt) => {
      const type = String(evt?.type || "").trim();
      const myOrgId = String(user?.businessAnchorId || "").trim();
      if (!myOrgId) return false;
      if (type === "credit:balance-updated") {
        return isCreditEventForBusiness(evt, myOrgId);
      }
      const payload =
        evt?.data && typeof evt.data === "object"
          ? (evt.data as {
              businessAnchorId?: unknown;
              requestorBusinessAnchorId?: unknown;
            })
          : {};
      const eventOrgId = String(
        payload.requestorBusinessAnchorId || payload.businessAnchorId || "",
      ).trim();
      return !eventOrgId || eventOrgId === myOrgId;
    },
    onMatch: () => {
      void queryClient.invalidateQueries({ queryKey: cardsSummaryQueryKey });
      void queryClient.invalidateQueries({ queryKey: ["requestor-bulk-shipping"] });
    },
  });

  const stats = cardsSummaryResponse?.success
    ? cardsSummaryResponse.data?.stats || {}
    : {};
  const inProgressCount = Math.max(
    0,
    Number(stats.totalRequests ?? 0) +
      Number(stats.inCam ?? 0) +
      Number(stats.inProduction ?? 0) +
      Number(stats.inPacking ?? 0) +
      Number(stats.inShipping ?? 0),
  );
  const pastCount = Math.max(0, Number(stats.inTracking ?? 0));
  const unmachinableCount = (() => {
    const judged = Number(stats.unmachinableJudgedTotalCount);
    if (Number.isFinite(judged)) return Math.max(0, judged);
    const pending = Number(stats.unmachinablePendingConfirmCount ?? 0);
    const confirmed = Number(stats.unmachinableConfirmedCount ?? 0);
    if (
      Object.prototype.hasOwnProperty.call(stats, "unmachinablePendingConfirmCount") ||
      Object.prototype.hasOwnProperty.call(stats, "unmachinableConfirmedCount")
    ) {
      return Math.max(0, pending + confirmed);
    }
    const fallback = Number(stats.unmachinableCount);
    return Number.isFinite(fallback) ? Math.max(0, fallback) : 0;
  })();

  const bulkData = bulkResponse?.success ? bulkResponse.data : null;
  const selectedIsPtxLinked = isPracticeTransferLinkedRequest(
    selectedPastRequest,
  );
  const canCancelSelected =
    isPrepCancelableRequest(selectedPastRequest) && !selectedIsPtxLinked;
  const canGuidePtxCancelSelected =
    isPrepCancelableRequest(selectedPastRequest) && selectedIsPtxLinked;

  const refreshHeaderCounts = () => {
    window.setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: cardsSummaryQueryKey });
      void queryClient.invalidateQueries({ queryKey: ["requestor-bulk-shipping"] });
    }, 2000);
  };

  const decrementInProgressCountOptimistic = (count = 1) => {
    const n = Math.max(0, Number(count) || 0);
    if (!n) return;
    queryClient.setQueryData(cardsSummaryQueryKey, (old: any) => {
      const stats = old?.data?.stats;
      if (!old || !stats || typeof stats !== "object") return old;
      return {
        ...old,
        data: {
          ...old.data,
          stats: {
            ...stats,
            totalRequests: Math.max(0, Number(stats.totalRequests ?? 0) - n),
          },
        },
      };
    });
  };

  const removeFromBulkShippingOptimistic = (mongoIds: string | string[]) => {
    const idSet = new Set(
      (Array.isArray(mongoIds) ? mongoIds : [mongoIds])
        .map((id) => String(id || "").trim())
        .filter(Boolean),
    );
    if (!idSet.size) return;
    queryClient.setQueryData(["requestor-bulk-shipping"], (old: any) => {
      const data = old?.data;
      if (!old || !data || typeof data !== "object") return old;
      const matches = (item: any) => {
        const itemMongoId = String(item?.mongoId || item?._id || "").trim();
        const itemRequestId = String(item?.id || "").trim();
        return idSet.has(itemMongoId) || idSet.has(itemRequestId);
      };
      const withoutCanceled = (list: unknown) =>
        Array.isArray(list) ? list.filter((item) => !matches(item)) : list;
      return {
        ...old,
        data: {
          ...data,
          pre: withoutCanceled(data.pre),
          post: withoutCanceled(data.post),
          waiting: withoutCanceled(data.waiting),
        },
      };
    });
  };

  const cancelRequestByMongoId = async (
    mongoId: string,
    options?: { silent?: boolean },
  ) => {
    if (!token || !mongoId) return false;
    const res = await apiFetch<any>({
      path: `/api/requests/${encodeURIComponent(mongoId)}/status`,
      method: "PATCH",
      token,
      headers: { "Content-Type": "application/json" },
      jsonBody: { manufacturerStage: "취소" },
    });
    if (!res.ok) {
      if (!options?.silent) {
        const serverMsg = res.data?.message;
        toast({
          title: "의뢰 취소 실패",
          description:
            serverMsg ||
            "준비 단계에서만 취소할 수 있습니다. 가공 단계부터는 취소가 불가능합니다.",
          variant: "destructive",
          duration: 3000,
        });
      }
      return false;
    }
    if (!options?.silent) {
      toast({
        title: "의뢰가 취소되었습니다",
        duration: 2000,
      });
    }
    const cascaded = Array.isArray(res.data?.data?.cascaded)
      ? res.data.data.cascaded
      : [];
    const cascadedIds = cascaded
      .map((row: any) => String(row?._id || row?.id || "").trim())
      .filter(Boolean);
    const canceledIds = [...new Set([mongoId, ...cascadedIds])];
    decrementInProgressCountOptimistic(canceledIds.length);
    removeFromBulkShippingOptimistic(canceledIds);
    setCanceledMongoIds(canceledIds);
    if (!options?.silent) {
      refreshHeaderCounts();
    }
    return true;
  };

  const cancelRequestsByMongoIds = async (mongoIds: string[]) => {
    const ids = [
      ...new Set(
        (mongoIds || []).map((id) => String(id || "").trim()).filter(Boolean),
      ),
    ];
    if (!token || !ids.length) return { okIds: [] as string[], failedIds: ids };
    const res = await apiFetch<any>({
      path: "/api/requests/status/batch",
      method: "PATCH",
      token,
      headers: { "Content-Type": "application/json" },
      jsonBody: { ids, manufacturerStage: "취소" },
    });
    const canceled = Array.isArray(res.data?.data?.canceled)
      ? res.data.data.canceled
      : [];
    const failed = Array.isArray(res.data?.data?.failed)
      ? res.data.data.failed
      : [];
    const okIds = canceled
      .map((row: any) => String(row?._id || row?.id || "").trim())
      .filter(Boolean);
    const failedFromApi = failed
      .map((row: any) => String(row?.id || row?._id || "").trim())
      .filter(Boolean);
    const okSet = new Set(okIds);
    const failedIds = [
      ...new Set([
        ...failedFromApi,
        ...ids.filter((id) => !okSet.has(id)),
      ]),
    ];
    if (!res.ok && !okIds.length) {
      toast({
        title: "의뢰 일괄 취소 실패",
        description:
          res.data?.message ||
          "준비 단계에서만 취소할 수 있습니다. 잠시 후 다시 시도해주세요.",
        variant: "destructive",
        duration: 3000,
      });
      return { okIds: [], failedIds: ids };
    }
    if (okIds.length) {
      decrementInProgressCountOptimistic(okIds.length);
      removeFromBulkShippingOptimistic(okIds);
      setCanceledMongoIds(okIds);
      refreshHeaderCounts();
    }
    return { okIds, failedIds: failedIds.filter((id) => !okSet.has(id)) };
  };

  const closeDetailAndRestoreList = () => {
    setCancelConfirmOpen(false);
    setSelectedPastRequest(null);
    if (listSource === "inProgress") setInProgressOpen(true);
    if (listSource === "past") setPastOpen(true);
  };

  const handleConfirmCancel = async () => {
    const mongoId = String(
      selectedPastRequest?._id || selectedPastRequest?.id || "",
    ).trim();
    const snapshot = selectedPastRequest;
    if (!mongoId) {
      setCancelConfirmOpen(false);
      return;
    }
    setCanceledMongoIds([mongoId]);
    closeDetailAndRestoreList();
    setCanceling(true);
    try {
      const ok = await cancelRequestByMongoId(mongoId);
      if (!ok) {
        setCanceledMongoIds([]);
        setSelectedPastRequest(snapshot);
      }
    } finally {
      setCanceling(false);
    }
  };

  return (
    <>
      <RequestorWorkspaceHeader period={period} onPeriodChange={setPeriod}>
        <RequestorPolicyRemakeHeader />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-3 text-xs"
          onClick={() => setInProgressOpen(true)}
        >
          진행중 {inProgressCount.toLocaleString()}건
        </Button>
        <RequestorBulkShippingBannerCard
          variant="headerButton"
          bulkData={bulkData}
          period={period}
          onRefresh={() => {
            void refetchBulk();
          }}
          onOpenBulkModal={() => {}}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 px-3 text-xs"
          onClick={() => setPastOpen(true)}
        >
          완료 내역 {pastCount.toLocaleString()}건
        </Button>
        <RequestorUnmachinableHost period={period} count={unmachinableCount} />
      </RequestorWorkspaceHeader>

      <PastRequestsModal
        open={inProgressOpen}
        onOpenChange={setInProgressOpen}
        title="진행중"
        description="준비·가공·세척.패킹·포장.발송 단계의 의뢰를 확인하고 상세를 엽니다. 준비 단계는 건별 또는 선택 후 한꺼번에 취소할 수 있습니다."
        manufacturerStageIn={IN_PROGRESS_MANUFACTURER_STAGES}
        initialPeriod={period}
        allowCancel
        suspend={listSource === "inProgress" && Boolean(selectedPastRequest)}
        removeMongoId={canceledMongoIds}
        onCanceled={refreshHeaderCounts}
        onCancelRequest={cancelRequestByMongoId}
        onCancelRequests={cancelRequestsByMongoIds}
        onSelectRequest={(request) => {
          setListSource("inProgress");
          setSelectedPastRequest(request);
        }}
      />

      <PastRequestsModal
        open={pastOpen}
        onOpenChange={setPastOpen}
        title="완료 내역"
        manufacturerStageIn={["추적관리"]}
        initialPeriod={period}
        suspend={listSource === "past" && Boolean(selectedPastRequest)}
        onSelectRequest={(request) => {
          setListSource("past");
          setSelectedPastRequest(request);
        }}
      />

      <RequestDetailDialog
        open={Boolean(selectedPastRequest)}
        dismissLocked={cancelConfirmOpen || canceling}
        onOpenChange={(next) => {
          if (!next) {
            if (cancelConfirmOpen || canceling) return;
            closeDetailAndRestoreList();
          }
        }}
        request={selectedPastRequest}
        footer={
          canCancelSelected || canGuidePtxCancelSelected ? (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={canceling}
                onClick={() => {
                  if (canGuidePtxCancelSelected) {
                    toast({
                      title: "기공의뢰 건은 여기서 취소할 수 없습니다",
                      description: PRACTICE_TRANSFER_CANCEL_FROM_ABUTS_MESSAGE,
                      duration: 4500,
                    });
                    return;
                  }
                  setCancelConfirmOpen(true);
                }}
              >
                의뢰 취소
              </Button>
            </div>
          ) : null
        }
      />

      <ConfirmDialog
        open={cancelConfirmOpen}
        title="이 의뢰를 취소하시겠습니까?"
        description="준비 단계 의뢰만 취소할 수 있습니다. 취소 후 크레딧은 정책에 따라 복구됩니다."
        confirmLabel="의뢰 취소"
        cancelLabel="닫기"
        busy={canceling}
        onConfirm={() => {
          void handleConfirmCancel();
        }}
        onCancel={() => {
          if (canceling) return;
          setCancelConfirmOpen(false);
        }}
      />
    </>
  );
};

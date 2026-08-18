// change-log:
// - 2026-08-19: 진행중인 의뢰 상세에서 준비 단계 취소. 원본 STL 프리뷰는 RequestDetailDialog.
// - 2026-08-19: [정책 안내] 오른쪽 [진행중인 의뢰] — 준비~포장.발송.
// - 2026-08-18: 지난의뢰 건수·목록에서 취소 제외(추적관리만).
// - 2026-08-18: 치과 어벗디자인 상단 — 기간필터·정책안내·출고대기·지난의뢰·불완전가공.
// related files:
// - web/frontend/src/pages/requestor/new_request/NewRequestPage.tsx
// - web/frontend/src/shared/components/RequestorWorkspaceHeader.tsx
// - web/frontend/src/pages/requestor/dashboard/components/RequestorPolicyRemakeHeader.tsx
// - web/frontend/src/pages/requestor/dashboard/components/RequestorBulkShippingBannerCard.tsx
// - web/frontend/src/pages/requestor/dashboard/components/RequestorUnmachinableHost.tsx
// - web/frontend/src/shared/components/PastRequestsModal.tsx
// - web/frontend/src/features/requests/components/RequestDetailDialog.tsx
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { RequestorWorkspaceHeader } from "@/shared/components/RequestorWorkspaceHeader";
import { RequestorPolicyRemakeHeader } from "@/pages/requestor/dashboard/components/RequestorPolicyRemakeHeader";
import { RequestorBulkShippingBannerCard } from "@/pages/requestor/dashboard/components/RequestorBulkShippingBannerCard";
import { RequestorUnmachinableHost } from "@/pages/requestor/dashboard/components/RequestorUnmachinableHost";
import { PastRequestsModal } from "@/shared/components/PastRequestsModal";
import { RequestDetailDialog } from "@/features/requests/components/RequestDetailDialog";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { getNormalizedStageLabelSafe } from "@/utils/stage";
import type { PeriodFilterValue } from "@/shared/ui/PeriodFilter";

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
    refetchOnMount: false,
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
  const canCancelSelected = isPrepCancelableRequest(selectedPastRequest);

  const refreshInProgressCounts = () => {
    void queryClient.invalidateQueries({ queryKey: cardsSummaryQueryKey });
  };

  const cancelRequestByMongoId = async (mongoId: string) => {
    if (!token || !mongoId) return false;
    const res = await apiFetch<any>({
      path: `/api/requests/${encodeURIComponent(mongoId)}/status`,
      method: "PATCH",
      token,
      headers: { "Content-Type": "application/json" },
      jsonBody: { manufacturerStage: "취소" },
    });
    if (!res.ok) {
      const serverMsg = res.data?.message;
      toast({
        title: "의뢰 취소 실패",
        description:
          serverMsg ||
          "준비 단계에서만 취소할 수 있습니다. 가공 단계부터는 취소가 불가능합니다.",
        variant: "destructive",
        duration: 3000,
      });
      return false;
    }
    toast({
      title: "의뢰가 취소되었습니다",
      duration: 2000,
    });
    refreshInProgressCounts();
    return true;
  };

  const handleConfirmCancel = async () => {
    const mongoId = String(
      selectedPastRequest?._id || selectedPastRequest?.id || "",
    ).trim();
    if (!mongoId) {
      setCancelConfirmOpen(false);
      return;
    }
    setCanceling(true);
    try {
      const ok = await cancelRequestByMongoId(mongoId);
      if (ok) {
        setCancelConfirmOpen(false);
        setSelectedPastRequest(null);
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
          진행중인 의뢰 {inProgressCount.toLocaleString()}건
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
          지난의뢰 {pastCount.toLocaleString()}건
        </Button>
        <RequestorUnmachinableHost period={period} count={unmachinableCount} />
      </RequestorWorkspaceHeader>

      <PastRequestsModal
        open={inProgressOpen}
        onOpenChange={setInProgressOpen}
        title="진행중인 의뢰"
        description="준비·가공·세척.패킹·포장.발송 단계의 의뢰를 확인하고 상세를 엽니다. 준비 단계에서는 취소할 수 있습니다."
        manufacturerStageIn={IN_PROGRESS_MANUFACTURER_STAGES}
        initialPeriod={period}
        allowCancel
        onCanceled={refreshInProgressCounts}
        onCancelRequest={cancelRequestByMongoId}
        onSelectRequest={(request) => {
          setInProgressOpen(false);
          setSelectedPastRequest(request);
        }}
      />

      <PastRequestsModal
        open={pastOpen}
        onOpenChange={setPastOpen}
        title="지난 의뢰"
        manufacturerStageIn={["추적관리"]}
        initialPeriod={period}
        onSelectRequest={(request) => {
          setPastOpen(false);
          setSelectedPastRequest(request);
        }}
      />

      <RequestDetailDialog
        open={Boolean(selectedPastRequest)}
        onOpenChange={(next) => {
          if (!next) {
            setSelectedPastRequest(null);
            setCancelConfirmOpen(false);
          }
        }}
        request={selectedPastRequest}
        footer={
          canCancelSelected ? (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={canceling}
                onClick={() => setCancelConfirmOpen(true)}
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
        onConfirm={() => {
          void handleConfirmCancel();
        }}
        onCancel={() => setCancelConfirmOpen(false)}
      />
    </>
  );
};

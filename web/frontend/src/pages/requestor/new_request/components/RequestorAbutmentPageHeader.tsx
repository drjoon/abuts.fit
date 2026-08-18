// change-log:
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
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { RequestorWorkspaceHeader } from "@/shared/components/RequestorWorkspaceHeader";
import { RequestorPolicyRemakeHeader } from "@/pages/requestor/dashboard/components/RequestorPolicyRemakeHeader";
import { RequestorBulkShippingBannerCard } from "@/pages/requestor/dashboard/components/RequestorBulkShippingBannerCard";
import { RequestorUnmachinableHost } from "@/pages/requestor/dashboard/components/RequestorUnmachinableHost";
import { PastRequestsModal } from "@/shared/components/PastRequestsModal";
import { RequestDetailDialog } from "@/features/requests/components/RequestDetailDialog";
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

export const RequestorAbutmentPageHeader = () => {
  const { user, token } = useAuthStore();
  const [period, setPeriod] = useState<PeriodFilterValue>("30d");
  const [inProgressOpen, setInProgressOpen] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);
  const [selectedPastRequest, setSelectedPastRequest] = useState<any | null>(
    null,
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
        description="준비·가공·세척.패킹·포장.발송 단계의 의뢰를 확인하고 상세를 엽니다."
        manufacturerStageIn={IN_PROGRESS_MANUFACTURER_STAGES}
        initialPeriod={period}
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
          if (!next) setSelectedPastRequest(null);
        }}
        request={selectedPastRequest}
      />
    </>
  );
};

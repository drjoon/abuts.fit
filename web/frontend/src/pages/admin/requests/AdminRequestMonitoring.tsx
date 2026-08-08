// change-log:
// - 2026-08-09: 샘플(고스트) 제외 확인용 FE 가드. 직원명 숨기고 치과명 표시. 필터/요약 좌측 여백 정리.
// - 2026-08-09: 진행중 stage를 목록 상단 정렬. 의뢰ID 숨김·신속/묶음 뱃지·필터/요약 여백. 카운트는 목록과 동일 소스만 사용.
// - 2026-08-09: 준비/세척.패킹 카운트·필터 불일치 수정(모니터링 stage 정규화 통일). 카드 밀도·슬레이트 톤으로 정리.
// - 2026-08-03: 모니터링 UI에서 공정 '의뢰' 표시를 '준비'로 우선 표기하도록 일부 카운터/버튼 로직을 보완했습니다. (표시 레이어)
// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// - web/frontend/src/utils/stage.ts
// - web/frontend/src/shared/shipping/ShippingModeBadge.tsx
// - web/backend/services/requestStageStats.service.js
// - web/backend/controllers/requests/common.requests.controller.js
import { useState, useEffect, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { usePeriodStore, periodToRange } from "@/store/usePeriodStore";
import { apiFetch } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { ShippingModeBadge } from "@/shared/shipping/ShippingModeBadge";
import {
  Search,
  FileText,
  Clock,
  Truck,
  XCircle,
  Trash2,
  RotateCcw,
  Package,
} from "lucide-react";
import { getMonitoringStageLabel } from "@/utils/stage";

type StatusFilter =
  | "all"
  | "준비"
  | "가공"
  | "세척.패킹"
  | "포장.발송"
  | "추적관리"
  | "취소";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "준비", label: "준비" },
  { key: "가공", label: "가공" },
  { key: "세척.패킹", label: "세척.패킹" },
  { key: "포장.발송", label: "포장.발송" },
  { key: "추적관리", label: "추적관리" },
  { key: "취소", label: "취소" },
];

const STAGE_CHIP: Record<string, string> = {
  준비: "border-emerald-200 bg-emerald-50 text-emerald-700",
  가공: "border-cyan-200 bg-cyan-50 text-cyan-700",
  "세척.패킹": "border-violet-200 bg-violet-50 text-violet-700",
  "포장.발송": "border-orange-200 bg-orange-50 text-orange-700",
  추적관리: "border-slate-200 bg-slate-50 text-slate-600",
  취소: "border-rose-200 bg-rose-50 text-rose-700",
};

/** 전체 목록에서 진행중 건이 카운트와 맞게 상단에 보이도록 */
const STAGE_LIST_ORDER: Record<string, number> = {
  준비: 0,
  가공: 1,
  "세척.패킹": 2,
  "포장.발송": 3,
  추적관리: 4,
  취소: 5,
};

/** 내부 샘플/R&D·복사본 — 운영 모니터링에서 제외 (BE buildNonSampleRequestGuard와 동일) */
const isSampleRequest = (request: any) => {
  const source = String(request?.source || "").trim();
  const priceRule = String(request?.price?.rule || "").trim();
  const requestCategory = String(request?.requestCategory || "").trim();
  return (
    source === "manufacturer_sample" ||
    priceRule === "manufacturer_sample" ||
    requestCategory === "rnd_sample" ||
    requestCategory === "copied_sample"
  );
};

const formatKstDate = (value: unknown) => {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });
};

const StageChip = ({ stage }: { stage: string }) => (
  <span
    className={`inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${
      STAGE_CHIP[stage] || "border-slate-200 bg-slate-50 text-slate-600"
    }`}
  >
    {stage || "상태 미지정"}
  </span>
);

const PAGE_SIZE = 12;

export const AdminRequestMonitoring = () => {
  const { token } = useAuthStore();
  const [searchParams] = useSearchParams();
  const { period } = usePeriodStore();
  const { toast } = useToast();
  const [requests, setRequests] = useState<any[]>([]);
  const initialQuery = String(searchParams.get("q") || "").trim();
  const focusRequestMongoId = String(
    searchParams.get("focusRequestMongoId") || "",
  ).trim();
  const focusRequestId = String(
    searchParams.get("focusRequestId") || "",
  ).trim();
  const initialStatus = String(searchParams.get("status") || "").trim();
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>(
    (STATUS_FILTERS.some((f) => f.key === initialStatus)
      ? initialStatus
      : "all") as StatusFilter,
  );
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [restoringIds, setRestoringIds] = useState<Set<string>>(new Set());
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const handleDeleteRequest = async (
    requestId: string,
    requestMongoId: string,
  ) => {
    if (!token) return;

    setDeletingIds((prev) => new Set(prev).add(requestMongoId));

    try {
      const res = await apiFetch({
        path: `/api/requests/${requestMongoId}`,
        method: "DELETE",
        token,
      });

      if (res.ok) {
        setRequests((prev) =>
          prev.map((r) =>
            r._id === requestMongoId ? { ...r, manufacturerStage: "취소" } : r,
          ),
        );
        toast({
          title: "의뢰 삭제 완료",
          description: `의뢰 ${requestId}이(가) 취소 처리되었습니다.`,
        });
      } else {
        toast({
          title: "의뢰 삭제 실패",
          description: res.data?.message || "알 수 없는 오류",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Failed to delete request:", error);
      toast({
        title: "의뢰 삭제 실패",
        description: `삭제 중 오류가 발생했습니다: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(requestMongoId);
        return next;
      });
    }
  };

  const handleRestoreRequest = async (
    requestId: string,
    requestMongoId: string,
  ) => {
    if (!token) return;

    setRestoringIds((prev) => new Set(prev).add(requestMongoId));

    try {
      const res = await apiFetch<any>({
        path: `/api/requests/${requestMongoId}/status`,
        method: "PATCH",
        token,
        headers: {
          "Content-Type": "application/json",
        },
        jsonBody: { manufacturerStage: "준비" },
      });

      if (res.ok) {
        setRequests((prev) =>
          prev.map((r) =>
            r._id === requestMongoId ? { ...r, manufacturerStage: "준비" } : r,
          ),
        );
        toast({
          title: "의뢰 복구 완료",
          description: `의뢰 ${requestId}이(가) 준비 상태로 복구되었습니다.`,
        });
      } else {
        toast({
          title: "의뢰 복구 실패",
          description: res.data?.message || "알 수 없는 오류",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("Failed to restore request:", error);
      toast({
        title: "의뢰 복구 실패",
        description: `복구 중 오류가 발생했습니다: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setRestoringIds((prev) => {
        const next = new Set(prev);
        next.delete(requestMongoId);
        return next;
      });
    }
  };

  useEffect(() => {
    let canceled = false;

    const fetchRequests = async () => {
      if (!token) return;
      try {
        const LIMIT = 120;
        const { startDate, endDate } = periodToRange(period);

        const fetchPage = async (page: number) => {
          const query = new URLSearchParams({
            page: String(page),
            limit: String(LIMIT),
            sortBy: "createdAt",
            sortOrder: "desc",
            includeTotal: page === 1 ? "true" : "false",
            view: "monitoring",
            startDate,
            endDate,
          });

          return apiFetch<any>({
            path: `/api/requests?${query.toString()}`,
            method: "GET",
            token,
          });
        };

        const firstRes = await fetchPage(1);
        if (!firstRes.ok || !firstRes.data?.data?.requests) {
          if (!canceled) {
            setRequests([]);
            setVisibleCount(PAGE_SIZE);
          }
          return;
        }

        const firstPageRequests = Array.isArray(firstRes.data.data.requests)
          ? firstRes.data.data.requests
          : [];

        if (!canceled) {
          setRequests(firstPageRequests);
          setVisibleCount(PAGE_SIZE);
        }

        const totalPages = Number(firstRes.data?.data?.pagination?.pages || 1);
        if (!Number.isFinite(totalPages) || totalPages <= 1) return;

        const restPagePromises: Promise<any>[] = [];
        for (let page = 2; page <= totalPages; page += 1) {
          restPagePromises.push(fetchPage(page));
        }

        const restResponses = await Promise.all(restPagePromises);
        const restRequests = restResponses.flatMap((res) => {
          if (!res.ok || !res.data?.data?.requests) return [];
          return Array.isArray(res.data.data.requests)
            ? res.data.data.requests
            : [];
        });

        if (!canceled) {
          setRequests([...firstPageRequests, ...restRequests]);
        }
      } catch (error) {
        console.error("Failed to fetch requests:", error);
      }
    };

    void fetchRequests();

    return () => {
      canceled = true;
    };
  }, [token, period]);

  const periodFilteredRequests = useMemo(() => {
    const { startDate, endDate } = periodToRange(period);
    const startMs = new Date(startDate).getTime();
    const endMs = new Date(endDate).getTime();

    return requests.filter((request) => {
      if (isSampleRequest(request)) return false;
      const createdAtMs = new Date(request?.createdAt || 0).getTime();
      if (!Number.isFinite(createdAtMs)) return false;
      return createdAtMs >= startMs && createdAtMs <= endMs;
    });
  }, [requests, period]);

  // 카운트 = 목록과 동일 배열·동일 정규화 (서버 stats 미사용)
  const requestStats = useMemo(() => {
    const byStatus: Record<string, number> = {
      준비: 0,
      가공: 0,
      "세척.패킹": 0,
      "포장.발송": 0,
      추적관리: 0,
      취소: 0,
    };

    periodFilteredRequests.forEach((request) => {
      const stage = getMonitoringStageLabel(request);
      if (byStatus[stage] != null) {
        byStatus[stage] += 1;
      }
    });

    return {
      total: periodFilteredRequests.length,
      byStatus,
    };
  }, [periodFilteredRequests]);

  const filteredRequests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const rows = periodFilteredRequests.filter((request) => {
      const caseInfos = request.caseInfos || {};
      const requestor = request.requestor || {};
      const effectiveStatus = getMonitoringStageLabel(request);
      const matchesSearch =
        !q ||
        String(caseInfos.patientName || "")
          .toLowerCase()
          .includes(q) ||
        String(caseInfos.clinicName || "")
          .toLowerCase()
          .includes(q) ||
        String(requestor.business || "")
          .toLowerCase()
          .includes(q) ||
        String(request.requestId || "")
          .toLowerCase()
          .includes(q) ||
        String(request._id || "")
          .toLowerCase()
          .includes(q);

      const matchesStatus =
        selectedStatus === "all" || effectiveStatus === selectedStatus;

      return matchesSearch && matchesStatus;
    });

    // 전체 뷰: 진행중 → 추적/취소, 같은 stage 안에서는 최신순
    return [...rows].sort((a, b) => {
      const stageA = getMonitoringStageLabel(a);
      const stageB = getMonitoringStageLabel(b);
      const orderA = STAGE_LIST_ORDER[stageA] ?? 9;
      const orderB = STAGE_LIST_ORDER[stageB] ?? 9;
      if (orderA !== orderB) return orderA - orderB;
      const timeA = new Date(a?.createdAt || 0).getTime();
      const timeB = new Date(b?.createdAt || 0).getTime();
      return timeB - timeA;
    });
  }, [periodFilteredRequests, searchQuery, selectedStatus]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, selectedStatus, period]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = listScrollRef.current;
    if (!sentinel || !root) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((prev) => prev + PAGE_SIZE);
        }
      },
      { root, rootMargin: "200px", threshold: 0 },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [filteredRequests.length, visibleCount]);

  const byStatus = requestStats.byStatus || {};
  const receiveCount = byStatus["준비"] || 0;
  const machiningCount = byStatus["가공"] || 0;
  const packagingCount = byStatus["세척.패킹"] || 0;
  const shippingCount = byStatus["포장.발송"] || 0;
  const trackingCount = byStatus["추적관리"] || 0;

  const statsCards: {
    key: StatusFilter;
    label: string;
    count: number;
    icon: typeof FileText;
    iconWrap: string;
    iconClass: string;
  }[] = [
    {
      key: "준비",
      label: "준비",
      count: receiveCount,
      icon: FileText,
      iconWrap: "bg-emerald-50",
      iconClass: "text-emerald-600",
    },
    {
      key: "가공",
      label: "가공",
      count: machiningCount,
      icon: Clock,
      iconWrap: "bg-cyan-50",
      iconClass: "text-cyan-600",
    },
    {
      key: "세척.패킹",
      label: "세척.패킹",
      count: packagingCount,
      icon: Package,
      iconWrap: "bg-violet-50",
      iconClass: "text-violet-600",
    },
    {
      key: "포장.발송",
      label: "포장.발송",
      count: shippingCount,
      icon: Truck,
      iconWrap: "bg-orange-50",
      iconClass: "text-orange-600",
    },
    {
      key: "추적관리",
      label: "추적관리",
      count: trackingCount,
      icon: Truck,
      iconWrap: "bg-slate-100",
      iconClass: "text-slate-600",
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50/80 px-2 py-4 sm:px-3 sm:py-5">
      <div className="mx-auto flex w-full max-w-7xl flex-1 min-h-0 flex-col gap-4 overflow-y-auto">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="환자·치과·의뢰자·의뢰번호 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 rounded-lg border-slate-200 bg-white pl-9 text-sm shadow-sm"
            />
          </div>
          <div className="inline-flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
            {STATUS_FILTERS.map((filter) => {
              const active = selectedStatus === filter.key;
              return (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setSelectedStatus(filter.key)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {filter.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {statsCards.map((card) => {
            const Icon = card.icon;
            const active = selectedStatus === card.key;
            return (
              <button
                key={card.key}
                type="button"
                onClick={() =>
                  setSelectedStatus(active ? "all" : card.key)
                }
                className={`rounded-xl border bg-white px-3.5 py-3 text-left shadow-sm transition-colors ${
                  active
                    ? "border-slate-900 ring-1 ring-slate-900"
                    : "border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/60"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`rounded-lg p-2 ${card.iconWrap}`}>
                    <Icon className={`h-4 w-4 ${card.iconClass}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-slate-500">
                      {card.label}
                    </p>
                    <p className="text-xl font-bold tabular-nums tracking-tight text-slate-900">
                      {card.count.toLocaleString()}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex shrink-0 items-baseline justify-between gap-3 border-b border-slate-100 px-5 py-3.5 sm:px-6">
            <h2 className="text-sm font-bold tracking-tight text-slate-900">
              의뢰 목록
            </h2>
            <p className="text-xs text-slate-500">
              총 {filteredRequests.length.toLocaleString()}건
            </p>
          </div>

          <div
            ref={listScrollRef}
            className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6"
          >
            {filteredRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-16 text-center">
                <XCircle className="mb-2 h-5 w-5 text-slate-300" />
                <p className="text-sm font-medium text-slate-600">
                  조건에 맞는 의뢰가 없습니다
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  기간·상태 필터 또는 검색어를 바꿔 보세요
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                {filteredRequests.slice(0, visibleCount).map((request) => {
                  const stage = getMonitoringStageLabel(request);
                  const isDeleting = deletingIds.has(request._id);
                  const isRestoring = restoringIds.has(request._id);
                  const isActionPending = isDeleting || isRestoring;
                  const isFocused =
                    (focusRequestMongoId &&
                      String(request._id || "").trim() ===
                        focusRequestMongoId) ||
                    (focusRequestId &&
                      String(request.requestId || "").trim() ===
                        focusRequestId);
                  const patient =
                    String(request.caseInfos?.patientName || "").trim() ||
                    "환자명 없음";
                  const tooth = String(request.caseInfos?.tooth || "").trim();
                  const clinicName = String(
                    request.caseInfos?.clinicName || "",
                  ).trim();
                  const businessName = String(
                    request.requestor?.business || "",
                  ).trim();
                  // 직원/대표명(requestor.name)은 숨기고 치과명·기공소명만 표시
                  const orgLabel =
                    [clinicName, businessName].filter(Boolean).join(" · ") ||
                    "치과명 미확인";
                  const price = Number(
                    request.price?.paidAmount ?? request.price?.amount ?? 0,
                  );
                  const priority = String(request.priority || "").trim();
                  const showPriority = priority === "높음" || priority === "긴급";

                  return (
                    <div
                      key={request._id || request.id}
                      className={`relative rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 transition-colors hover:bg-slate-50/70 ${
                        isActionPending ? "pointer-events-none opacity-50" : ""
                      } ${
                        isFocused
                          ? "border-slate-900 ring-1 ring-slate-900"
                          : ""
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <h3 className="truncate text-sm font-semibold text-slate-900">
                              {patient}
                              {tooth ? (
                                <span className="font-medium text-slate-500">
                                  {" "}
                                  · {tooth}
                                </span>
                              ) : null}
                            </h3>
                            {showPriority ? (
                              <span className="shrink-0 rounded-md border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                                {priority}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 truncate text-[11px] text-slate-500">
                            {orgLabel}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <ShippingModeBadge source={request} size="sm" />
                            <span className="text-[11px] text-slate-400">
                              {formatKstDate(request.createdAt)}
                            </span>
                          </div>
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          <div className="flex items-center gap-1">
                            <StageChip stage={stage} />
                            {stage === "취소" ? (
                              <button
                                type="button"
                                onClick={() =>
                                  handleRestoreRequest(
                                    request.requestId,
                                    request._id,
                                  )
                                }
                                disabled={isActionPending}
                                className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                title="준비 상태로 복구"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  handleDeleteRequest(
                                    request.requestId,
                                    request._id,
                                  )
                                }
                                disabled={isActionPending}
                                className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                title="의뢰 취소"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                          <p className="text-xs font-semibold tabular-nums text-slate-800">
                            {price.toLocaleString()}원
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div ref={sentinelRef} className="h-4" />
          </div>
        </div>
      </div>
    </div>
  );
};

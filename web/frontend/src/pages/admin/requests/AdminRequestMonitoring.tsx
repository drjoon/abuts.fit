import { useState, useEffect, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { usePeriodStore, periodToRange } from "@/store/usePeriodStore";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import { apiFetch } from "@/shared/api/apiClient";
import { useToast } from "@/shared/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  FileText,
  Clock,
  Building2,
  User,
  Truck,
  XCircle,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { getNormalizedStageLabel } from "@/utils/stage";


const getStatusBadge = (requestLike: any) => {
  const norm = getNormalizedStageLabel(requestLike);
  switch (norm) {
    case "의뢰":
      return <Badge variant="outline">의뢰</Badge>;
    case "CAM":
      return <Badge variant="default">CAM</Badge>;
    case "가공":
      return (
        <Badge className="bg-cyan-50 text-cyan-700 border-cyan-200 text-xs">
          가공
        </Badge>
      );
    case "세척.패킹":
      return (
        <Badge className="bg-purple-50 text-purple-700 border-purple-200 text-xs">
          세척.패킹
        </Badge>
      );
    case "포장.발송":
      return (
        <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
          포장.발송
        </Badge>
      );
    case "추적관리":
      return <Badge variant="secondary">추적관리</Badge>;
    case "취소":
      return <Badge variant="destructive">취소</Badge>;
    default:
      return <Badge>{norm || "상태 미지정"}</Badge>;
  }
};

const getPriorityBadge = (priority: string) => {
  switch (priority) {
    case "높음":
      return (
        <Badge variant="destructive" className="text-xs">
          {priority}
        </Badge>
      );
    case "보통":
      return (
        <Badge variant="outline" className="text-xs">
          {priority}
        </Badge>
      );
    case "낮음":
      return (
        <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">
          {priority}
        </Badge>
      );
    default:
      return <Badge className="text-xs">{priority}</Badge>;
  }
};

const getStatusIcon = (requestLike: any) => {
  const norm = getNormalizedStageLabel(requestLike);
  switch (norm) {
    case "의뢰":
      return <FileText className="h-4 w-4 text-blue-500" />;
    case "CAM":
    case "가공":
    case "세척.패킹":
      return <Clock className="h-4 w-4 text-green-500" />;
    case "포장.발송":
      return <Truck className="h-4 w-4 text-orange-500" />;
    case "추적관리":
      return <Truck className="h-4 w-4 text-green-600" />;
    case "취소":
      return <XCircle className="h-4 w-4 text-red-500" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
};

const PAGE_SIZE = 9;

export const AdminRequestMonitoring = () => {
  const { token } = useAuthStore();
  const [searchParams] = useSearchParams();
  const { period, setPeriod } = usePeriodStore();
  const { toast } = useToast();
  const [requests, setRequests] = useState<any[]>([]);
  const [serverStageStats, setServerStageStats] = useState<{
    total: number;
    byStatus: Record<string, number>;
  } | null>(null);
  const initialQuery = String(searchParams.get("q") || "").trim();
  const focusRequestMongoId = String(
    searchParams.get("focusRequestMongoId") || "",
  ).trim();
  const focusRequestId = String(
    searchParams.get("focusRequestId") || "",
  ).trim();
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedStatus, setSelectedStatus] = useState("all");
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
        // 목록에서 제거하지 않고 상태를 "취소"로 업데이트
        setRequests((prev) =>
          prev.map((r) =>
            r._id === requestMongoId ? { ...r, manufacturerStage: "취소" } : r,
          ),
        );
        toast({
          title: "의뢰 삭제 완료",
          description: `의뢰 ${requestId}이(가) 취소 처리되었습니다.`,
        });
        setServerStageStats(null);
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

  const handleRestoreRequest = async (requestId: string, requestMongoId: string) => {
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
        jsonBody: { manufacturerStage: "의뢰" },
      });

      if (res.ok) {
        setRequests((prev) =>
          prev.map((r) =>
            r._id === requestMongoId ? { ...r, manufacturerStage: "의뢰" } : r,
          ),
        );
        toast({
          title: "의뢰 복구 완료",
          description: `의뢰 ${requestId}이(가) 의뢰 상태로 복구되었습니다.`,
        });
        setServerStageStats(null);
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
            includeTotal: "true",
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
            setServerStageStats(null);
            setVisibleCount(PAGE_SIZE);
          }
          return;
        }

        const firstPageRequests = Array.isArray(firstRes.data.data.requests)
          ? firstRes.data.data.requests
          : [];

        if (!canceled) {
          // 첫 페이지를 먼저 그려 초기 체감 로딩 개선
          setRequests(firstPageRequests);
          const stats = firstRes.data?.data?.stats;
          if (
            stats &&
            typeof stats === "object" &&
            typeof stats.total === "number" &&
            stats.byStatus &&
            typeof stats.byStatus === "object"
          ) {
            setServerStageStats({
              total: Number(stats.total || 0),
              byStatus: stats.byStatus as Record<string, number>,
            });
          } else {
            setServerStageStats(null);
          }
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
      const createdAtMs = new Date(request?.createdAt || 0).getTime();
      if (!Number.isFinite(createdAtMs)) return false;
      return createdAtMs >= startMs && createdAtMs <= endMs;
    });
  }, [requests, period]);

  const requestStats = useMemo(() => {
    if (serverStageStats) {
      return serverStageStats;
    }

    const byStatus: Record<string, number> = {
      의뢰: 0,
      CAM: 0,
      가공: 0,
      "세척.패킹": 0,
      "포장.발송": 0,
      추적관리: 0,
      취소: 0,
    };

    periodFilteredRequests.forEach((request) => {
      const stage = getNormalizedStageLabel(request);
      if (byStatus[stage] != null) {
        byStatus[stage] += 1;
      }
    });

    return {
      total: periodFilteredRequests.length,
      byStatus,
    };
  }, [periodFilteredRequests, serverStageStats]);

  const filteredRequests = periodFilteredRequests.filter((request) => {
    const caseInfos = request.caseInfos || {};
    const requestor = request.requestor || {};
    const effectiveStatus = getNormalizedStageLabel(request);
    const matchesSearch =
      (caseInfos.patientName || "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      (caseInfos.clinicName || "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      (requestor.name || "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      (requestor.business || "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      String(request.requestId || "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase()) ||
      String(request._id || "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase());

    const matchesStatus =
      selectedStatus === "all" || effectiveStatus === selectedStatus;

    return matchesSearch && matchesStatus;
  });

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

  const totalCount = requestStats.total ?? 0;
  const byStatus = requestStats.byStatus || {};
  const receiveCount = byStatus["의뢰"] || 0;
  const camCount = byStatus["CAM"] || 0;
  const machiningCount = byStatus["가공"] || 0;
  const packagingCount = byStatus["세척.패킹"] || 0;
  const shippingCount = byStatus["포장.발송"] || 0;
  const trackingCount = byStatus["추적관리"] || 0;
  const canceledCount = byStatus["취소"] || 0;

  return (
    <div className="flex flex-col h-full min-h-0 bg-gradient-subtle p-6">
      <div className="max-w-7xl w-full mx-auto space-y-6 flex-1 min-h-0 overflow-y-auto">
        {/* Header */}
        <div className="space-y-4">
          {/* Search and Filter */}
          <div className="flex gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[300px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="의뢰 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={selectedStatus === "all" ? "default" : "outline"}
                onClick={() => setSelectedStatus("all")}
                size="sm"
              >
                전체
              </Button>
              <Button
                variant={selectedStatus === "의뢰" ? "default" : "outline"}
                onClick={() => setSelectedStatus("의뢰")}
                size="sm"
              >
                의뢰
              </Button>
              <Button
                variant={selectedStatus === "CAM" ? "default" : "outline"}
                onClick={() => setSelectedStatus("CAM")}
                size="sm"
              >
                CAM
              </Button>
              <Button
                variant={selectedStatus === "가공" ? "default" : "outline"}
                onClick={() => setSelectedStatus("가공")}
                size="sm"
              >
                가공
              </Button>
              <Button
                variant={selectedStatus === "세척.패킹" ? "default" : "outline"}
                onClick={() => setSelectedStatus("세척.패킹")}
                size="sm"
              >
                세척.패킹
              </Button>
              <Button
                variant={selectedStatus === "포장.발송" ? "default" : "outline"}
                onClick={() => setSelectedStatus("포장.발송")}
                size="sm"
              >
                포장.발송
              </Button>
              <Button
                variant={selectedStatus === "취소" ? "default" : "outline"}
                onClick={() => setSelectedStatus("취소")}
                size="sm"
              >
                취소
              </Button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <FileText className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">의뢰</p>
                  <p className="text-2xl font-bold">
                    {receiveCount.toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Clock className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">CAM</p>
                  <p className="text-2xl font-bold">
                    {camCount.toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-100 rounded-lg">
                  <Clock className="h-4 w-4 text-cyan-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">가공</p>
                  <p className="text-2xl font-bold">
                    {machiningCount.toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Clock className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">세척.패킹</p>
                  <p className="text-2xl font-bold">
                    {packagingCount.toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <Truck className="h-4 w-4 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">포장.발송</p>
                  <p className="text-2xl font-bold">
                    {shippingCount.toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-lg">
                  <Truck className="h-4 w-4 text-emerald-700" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">추적관리</p>
                  <p className="text-2xl font-bold">
                    {trackingCount.toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Requests List */}
        <Card>
          <CardHeader>
            <CardTitle>의뢰 목록</CardTitle>
            <CardDescription>
              총 {filteredRequests.length}건의 의뢰가 검색되었습니다
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              ref={listScrollRef}
              className="max-h-[70vh] overflow-y-auto pr-1"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredRequests.slice(0, visibleCount).map((request) => {
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

                  return (
                    <div
                      key={request._id || request.id}
                      className={`p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors relative ${
                        isActionPending ? "opacity-50 pointer-events-none" : ""
                      } ${isFocused ? "ring-2 ring-primary border-primary" : ""}`}
                    >
                      {getNormalizedStageLabel(request) === "취소" ? (
                        <button
                          onClick={() =>
                            handleRestoreRequest(request.requestId, request._id)
                          }
                          disabled={isActionPending}
                          className="absolute top-2 right-2 p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                          title="의뢰 상태로 복구"
                        >
                          <RotateCcw className="h-4 w-4" />
                        </button>
                      ) : (
                        <button
                          onClick={() =>
                            handleDeleteRequest(request.requestId, request._id)
                          }
                          disabled={isActionPending}
                          className="absolute top-2 right-2 p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          title="의뢰 삭제"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}

                      <div className="flex items-start justify-between mb-3 pr-8">
                        <div className="space-y-1 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {getStatusIcon(request)}
                            <h3 className="font-medium truncate">
                              {request.caseInfos?.patientName} (
                              {request.caseInfos?.tooth})
                            </h3>
                            {getPriorityBadge(request.priority)}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {request.requestor?.name} (
                              {request.requestor?.business})
                            </span>
                            {request.caManufacturer &&
                              request.caManufacturer !== "-" && (
                                <span className="flex items-center gap-1">
                                  <Building2 className="h-3 w-3" />
                                  {request.caManufacturer}
                                </span>
                              )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 ml-2 shrink-0">
                          {getStatusBadge(request)}
                          <div className="text-right text-xs">
                            <p className="font-medium text-primary">
                              {(
                                request.price?.paidAmount ??
                                request.price?.amount ??
                                0
                              ).toLocaleString()}
                              원
                            </p>
                            <p className="text-muted-foreground">
                              {new Date(request.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-1">
                        <div className="w-full bg-muted rounded-full h-1.5">
                          <div
                            className="bg-primary h-1.5 rounded-full transition-all"
                            style={{ width: `${request.progress ?? 0}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div ref={sentinelRef} className="h-4" />
            </div>
          </CardContent>
        </Card>
      </div>


    </div>
  );
};

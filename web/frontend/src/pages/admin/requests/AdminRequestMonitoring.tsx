import { useState, useEffect, useRef } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { usePeriodStore } from "@/store/usePeriodStore";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import { apiFetch } from "@/shared/api/apiClient";
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
  CheckCircle,
  Building2,
  User,
  Truck,
  XCircle,
} from "lucide-react";

const normalizeStage = (
  status?: string,
  manufacturerStage?: string,
  status2?: string,
) => {
  const s = String(status || "");
  const stage = String(manufacturerStage || "");
  const s2 = String(status2 || "");

  if (s === "취소") return "취소";
  if (s2 === "완료") return "완료";

  if (["shipping", "tracking", "발송", "포장.발송", "추적관리"].includes(stage))
    return "포장.발송";
  if (["packaging", "세척.포장", "세척.패킹"].includes(stage))
    return "세척.패킹";
  if (["machining", "production", "가공"].includes(stage)) return "가공";
  if (["cam", "CAM", "가공전"].includes(stage)) return "CAM";
  return "의뢰";
};

const getStatusBadge = (
  status?: string,
  manufacturerStage?: string,
  status2?: string,
) => {
  const norm = normalizeStage(status, manufacturerStage, status2);
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
    case "완료":
      return <Badge variant="secondary">완료</Badge>;
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

const getStatusIcon = (
  status: string,
  manufacturerStage?: string,
  status2?: string,
) => {
  const norm = normalizeStage(status, manufacturerStage, status2);
  switch (norm) {
    case "의뢰":
      return <FileText className="h-4 w-4 text-blue-500" />;
    case "CAM":
    case "가공":
    case "세척.패킹":
      return <Clock className="h-4 w-4 text-green-500" />;
    case "포장.발송":
      return <Truck className="h-4 w-4 text-orange-500" />;
    case "완료":
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case "취소":
      return <XCircle className="h-4 w-4 text-red-500" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
};

const PAGE_SIZE = 9;

export const AdminRequestMonitoring = () => {
  const { token } = useAuthStore();
  const { period, setPeriod } = usePeriodStore();
  const [requests, setRequests] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [requestStats, setRequestStats] = useState<{
    total?: number;
    byStatus?: Record<string, number>;
  }>({});
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const fetchRequests = async () => {
      if (!token) return;
      try {
        const res = await apiFetch<any>({
          path: "/api/requests",
          method: "GET",
          token,
        });
        if (res.ok && res.data?.data?.requests) {
          setRequests(res.data.data.requests);
          setVisibleCount(PAGE_SIZE);
        }
      } catch (error) {
        console.error("Failed to fetch requests:", error);
      }
    };
    void fetchRequests();
  }, [token]);

  useEffect(() => {
    const fetchStats = async () => {
      if (!token) return;
      try {
        const res = await apiFetch<any>({
          path: "/api/admin/dashboard",
          method: "GET",
          token,
          headers:
            token === "MOCK_DEV_TOKEN"
              ? {
                  "x-mock-role": "admin",
                }
              : undefined,
        });
        if (res.ok && res.data?.success) {
          setRequestStats(res.data.data?.requestStats || {});
        }
      } catch (error) {
        console.error("Failed to fetch request stats:", error);
      }
    };
    void fetchStats();
  }, [token]);

  const filteredRequests = requests.filter((request) => {
    const caseInfos = request.caseInfos || {};
    const requestor = request.requestor || {};
    const effectiveStatus = normalizeStage(
      request.status,
      request.manufacturerStage,
      request.status2,
    );
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
      (requestor.organization || "")
        .toLowerCase()
        .includes(searchQuery.toLowerCase());

    const matchesStatus =
      selectedStatus === "all" || effectiveStatus === selectedStatus;

    return matchesSearch && matchesStatus;
  });

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchQuery, selectedStatus]);

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
  const packagingCount = byStatus["세척.패킹"] || byStatus["세척.포장"] || 0;
  const shippingCount = byStatus["포장.발송"] || byStatus["발송"] || 0;
  const doneCount = byStatus["완료"] || 0;
  const canceledCount = byStatus["취소"] || 0;

  return (
    <div className="min-h-screen bg-gradient-subtle p-6">
      <div className="max-w-7xl mx-auto space-y-6">
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
                  <CheckCircle className="h-4 w-4 text-emerald-700" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">추적관리</p>
                  <p className="text-2xl font-bold">
                    {doneCount.toLocaleString()}
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
                {filteredRequests.slice(0, visibleCount).map((request) => (
                  <div
                    key={request._id || request.id}
                    className="p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          {getStatusIcon(
                            request.status,
                            request.manufacturerStage,
                            request.status2,
                          )}
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
                            {request.requestor?.organization})
                          </span>
                          {request.manufacturer &&
                            request.manufacturer !== "-" && (
                              <span className="flex items-center gap-1">
                                <Building2 className="h-3 w-3" />
                                {request.manufacturer}
                              </span>
                            )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 ml-2 shrink-0">
                        {getStatusBadge(
                          request.status,
                          request.manufacturerStage,
                          request.status2,
                        )}
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
                ))}
              </div>
              <div ref={sentinelRef} className="h-4" />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { apiFetch } from "@/lib/apiClient";
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
  Filter,
  FileText,
  Clock,
  CheckCircle,
  AlertTriangle,
  Building2,
  User,
  Eye,
  MessageSquare,
  Truck,
  XCircle,
} from "lucide-react";

const normalizeStage = (
  status?: string,
  manufacturerStage?: string,
  status2?: string
) => {
  const s = String(status || "");
  const stage = String(manufacturerStage || "");
  const s2 = String(status2 || "");

  if (s === "취소") return "취소";
  if (s === "완료" || s2 === "완료") return "완료";
  if (
    ["발송", "배송대기", "배송중"].includes(s) ||
    ["shipping", "발송"].includes(stage)
  )
    return "발송";
  if (
    ["생산", "가공후"].includes(s) ||
    ["machining", "생산", "packaging"].includes(stage)
  )
    return "생산";
  if (["CAM", "가공전"].includes(s) || ["cam", "CAM", "가공전"].includes(stage))
    return "CAM";
  return "의뢰";
};

const getStatusBadge = (
  status?: string,
  manufacturerStage?: string,
  status2?: string
) => {
  const norm = normalizeStage(status, manufacturerStage, status2);
  switch (norm) {
    case "의뢰":
      return <Badge variant="outline">의뢰</Badge>;
    case "CAM":
      return <Badge variant="default">CAM</Badge>;
    case "생산":
      return (
        <Badge className="bg-cyan-50 text-cyan-700 border-cyan-200 text-xs">
          생산
        </Badge>
      );
    case "발송":
      return (
        <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
          발송
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
  status2?: string
) => {
  const norm = normalizeStage(status, manufacturerStage, status2);
  switch (norm) {
    case "의뢰":
      return <FileText className="h-4 w-4 text-blue-500" />;
    case "CAM":
    case "생산":
      return <Clock className="h-4 w-4 text-green-500" />;
    case "발송":
      return <Truck className="h-4 w-4 text-orange-500" />;
    case "완료":
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case "취소":
      return <XCircle className="h-4 w-4 text-red-500" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
};

export const AdminRequestMonitoring = () => {
  const { token } = useAuthStore();
  const [requests, setRequests] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [requestStats, setRequestStats] = useState<{
    total?: number;
    byStatus?: Record<string, number>;
  }>({});

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
      request.status2
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

  const totalCount = requestStats.total ?? 0;
  const byStatus = requestStats.byStatus || {};
  const receiveCount = byStatus["의뢰"] || 0;
  const camCount = byStatus["CAM"] || 0;
  const productionCount = byStatus["생산"] || 0;
  const shippingCount = byStatus["발송"] || 0;
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
                variant={selectedStatus === "생산" ? "default" : "outline"}
                onClick={() => setSelectedStatus("생산")}
                size="sm"
              >
                생산
              </Button>
              <Button
                variant={selectedStatus === "발송" ? "default" : "outline"}
                onClick={() => setSelectedStatus("발송")}
                size="sm"
              >
                발송
              </Button>
              <Button
                variant={selectedStatus === "추적관리" ? "default" : "outline"}
                onClick={() => setSelectedStatus("추적관리")}
                size="sm"
              >
                추적관리
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
                  <p className="text-sm text-muted-foreground">생산</p>
                  <p className="text-2xl font-bold">
                    {productionCount.toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <FileText className="h-4 w-4 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">발송</p>
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
          <Card className="border-dashed">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-100 rounded-lg">
                  <FileText className="h-4 w-4 text-slate-700" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">총 의뢰</p>
                  <p className="text-2xl font-bold">
                    {totalCount.toLocaleString()}
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
            <div className="space-y-4">
              {filteredRequests.map((request) => (
                <div
                  key={request.id}
                  className="p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        {getStatusIcon(
                          request.status,
                          request.manufacturerStage,
                          request.status2
                        )}
                        <h3 className="font-medium">
                          {request.caseInfos?.patientName} (
                          {request.caseInfos?.tooth})
                        </h3>
                        {getPriorityBadge(request.priority)}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {request.requestor?.name} (
                          {request.requestor?.organization})
                        </span>
                        {request.manufacturer !== "-" && (
                          <span className="flex items-center gap-1">
                            <Building2 className="h-3 w-3" />
                            {request.manufacturer}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {getStatusBadge(
                        request.status,
                        request.manufacturerStage,
                        request.status2
                      )}
                      <div className="text-right text-sm">
                        <p className="font-medium text-primary">
                          {request.price?.amount?.toLocaleString()}원
                        </p>
                        <p className="text-muted-foreground">
                          의뢰일:{" "}
                          {new Date(request.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">진행률</span>
                      <span className="font-medium">{request.progress}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all"
                        style={{ width: `${request.progress}%` }}
                      />
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 justify-end mt-4">
                    <Button variant="outline" size="sm">
                      <Eye className="mr-2 h-4 w-4" />
                      상세보기
                    </Button>
                    <Button variant="outline" size="sm">
                      <MessageSquare className="mr-2 h-4 w-4" />
                      채팅 참여
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

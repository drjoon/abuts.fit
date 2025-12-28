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

const getStatusBadge = (status1?: string, status2?: string) => {
  const statusText =
    status2 && status2 !== "없음" ? `${status1}(${status2})` : status1;

  switch (status1) {
    case "의뢰접수":
      return <Badge variant="outline">{statusText}</Badge>;
    case "가공":
      return <Badge variant="default">{statusText}</Badge>;
    case "가공전":
    case "가공후":
      return <Badge variant="default">{statusText}</Badge>;
    case "세척/검사/포장":
      return (
        <Badge className="bg-cyan-50 text-cyan-700 border-cyan-200 text-xs">
          {statusText}
        </Badge>
      );
    case "배송":
    case "배송대기":
    case "배송중":
      return (
        <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
          {statusText}
        </Badge>
      );
    case "완료":
      return <Badge variant="secondary">{statusText}</Badge>;
    case "취소":
      return <Badge variant="destructive">{statusText}</Badge>;
    default:
      return <Badge>{statusText || "상태 미지정"}</Badge>;
  }
  switch (status) {
    case "진행중":
      return <Badge variant="default">{status}</Badge>;
    case "완료":
      return <Badge variant="secondary">{status}</Badge>;
    case "견적 대기":
      return (
        <Badge className="bg-orange-100 text-orange-700 border-orange-200">
          {status}
        </Badge>
      );
    case "지연":
      return <Badge variant="destructive">{status}</Badge>;
    default:
      return <Badge>{status}</Badge>;
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

const getStatusIcon = (status: string) => {
  switch (status) {
    case "의뢰접수":
      return <FileText className="h-4 w-4 text-blue-500" />;
    case "가공전":
    case "가공후":
      return <Clock className="h-4 w-4 text-green-500" />;
    case "배송대기":
    case "배송중":
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
    const effectiveStatus = request.status || request.status1;
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
  const receiveCount = byStatus["의뢰접수"] || 0;
  const machiningCount = (byStatus["가공전"] || 0) + (byStatus["가공후"] || 0);
  const shippingCount = (byStatus["배송대기"] || 0) + (byStatus["배송중"] || 0);
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
                variant={selectedStatus === "의뢰접수" ? "default" : "outline"}
                onClick={() => setSelectedStatus("의뢰접수")}
                size="sm"
              >
                의뢰접수
              </Button>
              <Button
                variant={selectedStatus === "가공전" ? "default" : "outline"}
                onClick={() => setSelectedStatus("가공전")}
                size="sm"
              >
                가공전
              </Button>
              <Button
                variant={selectedStatus === "가공후" ? "default" : "outline"}
                onClick={() => setSelectedStatus("가공후")}
                size="sm"
              >
                가공후
              </Button>
              <Button
                variant={selectedStatus === "배송대기" ? "default" : "outline"}
                onClick={() => setSelectedStatus("배송대기")}
                size="sm"
              >
                배송대기
              </Button>
              <Button
                variant={selectedStatus === "배송중" ? "default" : "outline"}
                onClick={() => setSelectedStatus("배송중")}
                size="sm"
              >
                배송중
              </Button>
              <Button
                variant={selectedStatus === "완료" ? "default" : "outline"}
                onClick={() => setSelectedStatus("완료")}
                size="sm"
              >
                완료
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
                  <p className="text-sm text-muted-foreground">의뢰접수</p>
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
                  <p className="text-sm text-muted-foreground">가공(전/후)</p>
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
                <div className="p-2 bg-orange-100 rounded-lg">
                  <FileText className="h-4 w-4 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">배송(대기/중)</p>
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
                  <p className="text-sm text-muted-foreground">완료</p>
                  <p className="text-2xl font-bold">
                    {doneCount.toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-rose-100 rounded-lg">
                  <XCircle className="h-4 w-4 text-rose-700" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">취소</p>
                  <p className="text-2xl font-bold">
                    {canceledCount.toLocaleString()}
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
                        {getStatusIcon(request.status)}
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
                      {getStatusBadge(request.status1, request.status2)}
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

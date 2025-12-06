import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";
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
} from "lucide-react";

const getStatusBadge = (status1?: string, status2?: string) => {
  const statusText =
    status2 && status2 !== "없음" ? `${status1}(${status2})` : status1;

  switch (status1) {
    case "의뢰접수":
      return <Badge variant="outline">{statusText}</Badge>;
    case "가공":
      return <Badge variant="default">{statusText}</Badge>;
    case "세척/검사/포장":
      return (
        <Badge className="bg-cyan-50 text-cyan-700 border-cyan-200 text-xs">
          {statusText}
        </Badge>
      );
    case "배송":
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
    case "진행중":
      return <Clock className="h-4 w-4 text-blue-500" />;
    case "완료":
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case "견적 대기":
      return <FileText className="h-4 w-4 text-orange-500" />;
    case "지연":
      return <AlertTriangle className="h-4 w-4 text-red-500" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
};

export const AdminRequestMonitoring = () => {
  const { token } = useAuthStore();
  const [requests, setRequests] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");

  useEffect(() => {
    const fetchRequests = async () => {
      if (!token) return;
      try {
        const res = await fetch("/api/requests", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (res.ok) {
          const data = await res.json();
          setRequests(data.data.requests);
        }
      } catch (error) {
        console.error("Failed to fetch requests:", error);
      }
    };
    fetchRequests();
  }, [token]);

  const filteredRequests = requests.filter((request) => {
    const caseInfos = request.caseInfos || {};
    const requestor = request.requestor || {};
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
      selectedStatus === "all" || request.status1 === selectedStatus;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-gradient-subtle p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-hero bg-clip-text text-transparent">
            의뢰 모니터링
          </h1>
          <p className="text-muted-foreground text-lg">
            모든 의뢰의 진행 상황을 실시간으로 모니터링하세요
          </p>

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
                variant={selectedStatus === "진행중" ? "default" : "outline"}
                onClick={() => setSelectedStatus("진행중")}
                size="sm"
              >
                진행중
              </Button>
              <Button
                variant={selectedStatus === "지연" ? "default" : "outline"}
                onClick={() => setSelectedStatus("지연")}
                size="sm"
              >
                지연
              </Button>
              <Button
                variant={selectedStatus === "견적 대기" ? "default" : "outline"}
                onClick={() => setSelectedStatus("견적 대기")}
                size="sm"
              >
                견적 대기
              </Button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <FileText className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">총 의뢰</p>
                  <p className="text-2xl font-bold">1,234</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Clock className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">진행중</p>
                  <p className="text-2xl font-bold">56</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">지연</p>
                  <p className="text-2xl font-bold">8</p>
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
                  <p className="text-sm text-muted-foreground">견적 대기</p>
                  <p className="text-2xl font-bold">23</p>
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

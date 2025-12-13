import { useEffect, useMemo, useState } from "react";
import { useLocation, useOutletContext } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";
import { ExpandedRequestCard } from "@/components/ExpandedRequestCard";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  WorksheetDiameterCard,
  DiameterStats,
} from "@/shared/ui/dashboard/WorksheetDiameterCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Search,
  Filter,
  Clock,
  Building2,
  AlertCircle,
  CheckCircle,
  FileText,
  MessageSquare,
} from "lucide-react";
import { WorksheetCncMachineSection } from "@/features/manufacturer/cnc/components/WorksheetCncMachineSection";

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
      return (
        <Badge className="bg-red-50 text-red-700 border-red-200 text-xs">
          {statusText}
        </Badge>
      );
    default:
      return <Badge>{statusText || "상태 미지정"}</Badge>;
  }
  switch (status) {
    case "의뢰접수":
      return <Badge variant="outline">의뢰접수</Badge>;
    case "가공전":
    case "가공후":
      return <Badge variant="default">{status}</Badge>;
    case "배송대기":
      return (
        <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
          배송대기
        </Badge>
      );
    case "배송중":
      return (
        <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
          배송중
        </Badge>
      );
    case "완료":
      return <Badge variant="secondary">완료</Badge>;
    case "취소":
      return (
        <Badge className="bg-red-50 text-red-700 border-red-200 text-xs">
          취소
        </Badge>
      );
    default:
      return <Badge>{status}</Badge>;
  }
};

const getUrgencyBadge = (urgency: string) => {
  switch (urgency) {
    case "높음":
      return (
        <Badge variant="destructive" className="text-xs">
          {urgency}
        </Badge>
      );
    case "보통":
      return (
        <Badge variant="outline" className="text-xs">
          {urgency}
        </Badge>
      );
    case "낮음":
      return (
        <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">
          {urgency}
        </Badge>
      );
    default:
      return <Badge className="text-xs">{urgency}</Badge>;
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case "의뢰접수":
      return <AlertCircle className="h-4 w-4 text-orange-500" />;
    case "가공전":
    case "가공후":
      return <Building2 className="h-4 w-4 text-blue-500" />;
    case "배송대기":
      return <Clock className="h-4 w-4 text-amber-500" />;
    case "배송중":
      return <Clock className="h-4 w-4 text-blue-500" />;
    case "완료":
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case "취소":
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
};

type WorksheetSortKey =
  | "client"
  | "requestDate"
  | "dentistName"
  | "patientName"
  | "tooth"
  | "diameter"
  | "implantCompany"
  | "implantProduct"
  | "implantSize"
  | "status";

type WorksheetSortOrder = "asc" | "desc";

const useWorksheetFilters = (
  requests: any[],
  controlledSearch?: { value: string; setValue: (value: string) => void },
  options?: { showCompleted?: boolean }
) => {
  const [internalSearch, setInternalSearch] = useState("");
  const searchQuery = controlledSearch
    ? controlledSearch.value
    : internalSearch;
  const setSearchQuery = controlledSearch
    ? controlledSearch.setValue
    : setInternalSearch;
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [sortKey, setSortKey] = useState<WorksheetSortKey>("requestDate");
  const [sortOrder, setSortOrder] = useState<WorksheetSortOrder>("desc");

  const filteredAndSorted = useMemo(() => {
    const filtered = requests.filter((request) => {
      const lower = searchQuery.toLowerCase();
      const matchesSearch =
        (request.caseInfos?.patientName || "").toLowerCase().includes(lower) ||
        (request.caseInfos?.clinicName || "").toLowerCase().includes(lower) ||
        (request.description || "").toLowerCase().includes(lower);

      const matchesStatusBase =
        selectedStatus === "all" || request.status1 === selectedStatus;
      const includeCompleted = options?.showCompleted ?? false;
      const matchesCompleted = includeCompleted
        ? true
        : request.status1 !== "완료";

      const matchesStatus = matchesStatusBase && matchesCompleted;

      return matchesSearch && matchesStatus;
    });

    const sorted = [...filtered].sort((a, b) => {
      const getValue = (item: any) => {
        const caseInfos = item.caseInfos || {};
        switch (sortKey) {
          case "client": // clinicName으로 변경
            return caseInfos.clinicName;
          case "requestDate":
            return item.createdAt;
          case "patientName":
            return caseInfos.patientName;
          case "tooth":
            return caseInfos.tooth;
          case "diameter":
            return caseInfos.connectionDiameter;
          case "implantCompany": // implantSystem으로 변경
            return caseInfos.implantSystem;
          case "implantProduct": // implantType으로 변경
            return caseInfos.implantType;
          case "status":
            return item.status1;
          default:
            return "";
        }
      };

      const va = getValue(a);
      const vb = getValue(b);

      if (va === vb) return 0;
      if (sortOrder === "asc") {
        return va > vb ? 1 : -1;
      }
      return va < vb ? 1 : -1;
    });

    return sorted;
  }, [
    requests,
    searchQuery,
    selectedStatus,
    sortKey,
    sortOrder,
    options?.showCompleted,
  ]);

  const toggleSort = (key: WorksheetSortKey) => {
    if (sortKey === key) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };

  return {
    searchQuery,
    setSearchQuery,
    selectedStatus,
    setSelectedStatus,
    sortKey,
    sortOrder,
    toggleSort,
    filteredAndSorted,
  };
};

const WorksheetSortBar = ({
  searchQuery,
  setSearchQuery,
}: {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
}) => {
  return (
    <div className="w-full flex justify-end">
      <div className="relative w-full max-w-xs">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="기공소, 치과, 환자, 제목으로 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>
    </div>
  );
};

const WorksheetCardGrid = ({
  requests,
  onSelect,
}: {
  requests: any[];
  onSelect: (request: any) => void;
}) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
    {requests.map((request) => (
      <Card
        key={request.id}
        className="shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer h-full flex flex-col"
        onClick={() => onSelect(request)}
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {getStatusIcon(request.status1 || request.status)}
                <CardTitle className="text-sm line-clamp-1">
                  {request.caseInfos?.patientName} ({request.caseInfos?.tooth})
                </CardTitle>
              </div>
              <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                <span>{request.client}</span>
                <span>•</span>
                <span>{request.dentistName}</span>
                <span>•</span>
                <span>{request.requestDate}</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              {getStatusBadge(
                request.status1 || request.status,
                request.status2
              )}
              {getUrgencyBadge(request.priority)}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 flex-1 flex flex-col justify-between">
          <div className="space-y-1.5 text-[11px] text-muted-foreground">
            <div className="text-xs font-semibold text-blue-700">
              직경 {request.caseInfos?.connectionDiameter?.toFixed(1) ?? "-"}mm
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span>{request.caseInfos?.clinicName}</span>
              <span>•</span>
              <span>
                {request.createdAt
                  ? new Date(request.createdAt).toLocaleDateString()
                  : ""}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <span>{request.caseInfos?.implantManufacturer || "-"}</span>
              <span>•</span>
              <span>{request.caseInfos?.implantSystem || "-"}</span>
              <span>•</span>
              <span>{request.caseInfos?.implantType || "-"}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    ))}
  </div>
);

export const RequestListPage = () => {
  const { user } = useAuthStore();
  const location = useLocation();
  const { worksheetSearch, setWorksheetSearch } = useOutletContext<{
    worksheetSearch: string;
    setWorksheetSearch: (value: string) => void;
  }>();
  const worksheetParams = new URLSearchParams(location.search);
  const worksheetType = worksheetParams.get("type") || "abutment";
  const worksheetStage = worksheetParams.get("stage") || "receive";
  const isCncMachining =
    worksheetType === "cnc" && worksheetStage === "machining";
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);

  const [requests, setRequests] = useState<any[]>([]);

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const res = await fetch("/api/requests/my");
        if (!res.ok) {
          console.error("Failed to fetch my requests");
          return;
        }

        const data = await res.json();
        if (data.success && Array.isArray(data.data.requests)) {
          const mapped = data.data.requests.map((req: any) => req); // No more mapping to mock data structure

          setRequests(mapped);
        }
      } catch (error) {
        console.error("Error fetching my requests:", error);
      }
    };

    fetchRequests();
  }, []);

  const filters = useWorksheetFilters(requests, {
    value: worksheetSearch,
    setValue: setWorksheetSearch,
  });

  if (isCncMachining) {
    return (
      <div className="min-h-screen bg-gradient-subtle p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <WorksheetCncMachineSection searchQuery={filters.searchQuery} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="space-y-4">
          <WorksheetSortBar
            searchQuery={filters.searchQuery}
            setSearchQuery={filters.setSearchQuery}
          />
          <WorksheetCardGrid
            requests={filters.filteredAndSorted}
            onSelect={(request) => setSelectedRequest(request)}
          />
        </div>
      </div>

      {selectedRequest && (
        <ExpandedRequestCard
          request={selectedRequest}
          onClose={() => setSelectedRequest(null)}
          currentUserId={user?.id}
          currentUserRole={user?.role}
        />
      )}
    </div>
  );
};

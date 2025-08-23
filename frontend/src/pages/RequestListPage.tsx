import { useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { ExpandedRequestCard } from "@/components/ExpandedRequestCard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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

// Mock requests data for manufacturers
const mockRequests = [
  {
    id: "REQ-001",
    title: "상악 우측 제1대구치 임플란트",
    description: "티타늄 어벗먼트, 4.3mm 직경, 높이 5mm, 15도 각도 조정 필요",
    client: "서울치과기공소",
    clientContact: "김철수",
    requestDate: "2025-07-15",
    urgency: "높음",
    status: "진행중",
    attachments: 3,
    specifications: {
      implantType: "Straumann",
      diameter: "4.3mm",
      height: "5mm",
      angle: "15도",
      material: "티타늄",
    },
  },
  {
    id: "REQ-002",
    title: "하악 좌측 제2소구치 임플란트",
    description: "지르코니아 어벗먼트, 3.8mm 직경, 미적 고려사항 포함",
    client: "부산치과기공소",
    clientContact: "이영희",
    requestDate: "2025-07-14",
    urgency: "보통",
    status: "제작중",
    attachments: 5,
    specifications: {
      implantType: "Nobel Biocare",
      diameter: "3.8mm",
      height: "4mm",
      angle: "직각",
      material: "지르코니아",
    },
  },
  {
    id: "REQ-003",
    title: "상악 전치부 임플란트",
    description: "맞춤형 어벗먼트, 미적 고려사항 중요, 특수 각도 조정",
    client: "대구치과기공소",
    clientContact: "박민수",
    requestDate: "2025-07-13",
    urgency: "높음",
    status: "검토중",
    attachments: 7,
    specifications: {
      implantType: "Dentium",
      diameter: "4.0mm",
      height: "6mm",
      angle: "25도",
      material: "티타늄+지르코니아",
    },
  },
  {
    id: "REQ-004",
    title: "하악 우측 제1대구치 임플란트",
    description: "하이브리드 어벗먼트, 특수 각도 조정, 교합 고려",
    client: "인천치과기공소",
    clientContact: "정수진",
    requestDate: "2025-07-12",
    urgency: "보통",
    status: "진행중",
    attachments: 4,
    specifications: {
      implantType: "Osstem",
      diameter: "4.5mm",
      height: "5.5mm",
      angle: "20도",
      material: "티타늄",
    },
  },
  {
    id: "REQ-005",
    title: "상악 좌측 소구치 임플란트",
    description: "표준 어벗먼트, 일반적인 사양",
    client: "광주치과기공소",
    clientContact: "최미영",
    requestDate: "2025-07-11",
    urgency: "낮음",
    status: "완료",
    attachments: 2,
    specifications: {
      implantType: "Straumann",
      diameter: "3.3mm",
      height: "4mm",
      angle: "직각",
      material: "티타늄",
    },
  },
  {
    id: "REQ-006",
    title: "하악 전치부 임플란트",
    description: "미니 어벗먼트, 좁은 공간 고려",
    client: "울산치과기공소",
    clientContact: "강동현",
    requestDate: "2025-07-10",
    urgency: "보통",
    status: "제작중",
    attachments: 3,
    specifications: {
      implantType: "Nobel Biocare",
      diameter: "3.0mm",
      height: "4.5mm",
      angle: "10도",
      material: "지르코니아",
    },
  },
  {
    id: "REQ-007",
    title: "상악 우측 제2대구치 임플란트",
    description: "와이드 어벗먼트, 강도 중요",
    client: "전주치과기공소",
    clientContact: "송지훈",
    requestDate: "2025-07-09",
    urgency: "높음",
    status: "진행중",
    attachments: 6,
    specifications: {
      implantType: "Dentium",
      diameter: "5.0mm",
      height: "6mm",
      angle: "직각",
      material: "티타늄",
    },
  },
];

const getStatusBadge = (status: string) => {
  switch (status) {
    case "진행중":
      return <Badge variant="default">{status}</Badge>;
    case "제작중":
      return <Badge variant="default">{status}</Badge>;
    case "검토중":
      return <Badge variant="outline">{status}</Badge>;
    case "완료":
      return <Badge variant="secondary">{status}</Badge>;
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
    case "진행중":
      return <Clock className="h-4 w-4 text-blue-500" />;
    case "제작중":
      return <Building2 className="h-4 w-4 text-blue-500" />;
    case "검토중":
      return <AlertCircle className="h-4 w-4 text-orange-500" />;
    case "완료":
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
};

export const RequestListPage = () => {
  const { user } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedRequest, setSelectedRequest] = useState<any>(null);

  const filteredRequests = mockRequests.filter((request) => {
    const matchesSearch =
      request.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      request.client.toLowerCase().includes(searchQuery.toLowerCase()) ||
      request.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      selectedStatus === "all" || request.status === selectedStatus;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-gradient-subtle p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-hero bg-clip-text text-transparent">
            의뢰 목록
          </h1>
          <p className="text-muted-foreground text-lg">
            새로운 의뢰를 확인하고 견적을 제출하세요
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
                variant={selectedStatus === "제작중" ? "default" : "outline"}
                onClick={() => setSelectedStatus("제작중")}
                size="sm"
              >
                제작중
              </Button>
            </div>
          </div>
        </div>

        {/* Request Cards - Half Width Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredRequests.map((request) => (
            <Card
              key={request.id}
              className="hover:shadow-elegant transition-all duration-300 cursor-pointer"
              onClick={() => setSelectedRequest(request)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(request.status)}
                      <CardTitle className="text-sm">{request.title}</CardTitle>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{request.client}</span>
                      <span>•</span>
                      <span>{request.requestDate}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {getStatusBadge(request.status)}
                    {getUrgencyBadge(request.urgency)}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  <CardDescription className="text-xs line-clamp-1">
                    {request.description}
                  </CardDescription>

                  {/* Minimal Specifications */}
                  <div className="text-xs text-muted-foreground">
                    {request.specifications.implantType} •{" "}
                    {request.specifications.diameter}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Load More */}
        <div className="text-center pt-6">
          <Button variant="outline" size="lg">
            더 많은 의뢰 보기
          </Button>
        </div>
      </div>

      {/* Expanded Request Card Modal */}
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

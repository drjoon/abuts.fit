import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  MessageSquare
} from "lucide-react";

// Mock requests data
const mockRequests = [
  {
    id: "REQ-001",
    title: "상악 우측 제1대구치 임플란트",
    requestor: "김철수",
    requestorCompany: "서울치과기공소",
    manufacturer: "프리미엄 어벗먼트",
    status: "진행중",
    priority: "높음",
    amount: "200,000원",
    requestDate: "2024-01-15",
    dueDate: "2024-01-25",
    progress: 75
  },
  {
    id: "REQ-002",
    title: "하악 좌측 제2소구치 임플란트",
    requestor: "이영희",
    requestorCompany: "부산치과기공소",
    manufacturer: "정밀 어벗먼트",
    status: "완료",
    priority: "보통",
    amount: "180,000원",
    requestDate: "2024-01-14",
    dueDate: "2024-01-24",
    progress: 100
  },
  {
    id: "REQ-003",
    title: "상악 전치부 임플란트",
    requestor: "박민수",
    requestorCompany: "대구치과기공소",
    manufacturer: "-",
    status: "견적 대기",
    priority: "높음",
    amount: "-",
    requestDate: "2024-01-13",
    dueDate: "2024-01-23",
    progress: 10
  },
  {
    id: "REQ-004",
    title: "하악 우측 제1대구치 임플란트",
    requestor: "정수진",
    requestorCompany: "인천치과기공소",
    manufacturer: "스마트 어벗먼트",
    status: "지연",
    priority: "높음",
    amount: "220,000원",
    requestDate: "2024-01-12",
    dueDate: "2024-01-20",
    progress: 40
  }
];

const getStatusBadge = (status: string) => {
  switch (status) {
    case '진행중':
      return <Badge variant="default">{status}</Badge>;
    case '완료':
      return <Badge variant="secondary">{status}</Badge>;
    case '견적 대기':
      return <Badge className="bg-orange-100 text-orange-700 border-orange-200">{status}</Badge>;
    case '지연':
      return <Badge variant="destructive">{status}</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
};

const getPriorityBadge = (priority: string) => {
  switch (priority) {
    case '높음':
      return <Badge variant="destructive" className="text-xs">{priority}</Badge>;
    case '보통':
      return <Badge variant="outline" className="text-xs">{priority}</Badge>;
    case '낮음':
      return <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">{priority}</Badge>;
    default:
      return <Badge className="text-xs">{priority}</Badge>;
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case '진행중':
      return <Clock className="h-4 w-4 text-blue-500" />;
    case '완료':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case '견적 대기':
      return <FileText className="h-4 w-4 text-orange-500" />;
    case '지연':
      return <AlertTriangle className="h-4 w-4 text-red-500" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
};

export const AdminRequestMonitoring = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");

  const filteredRequests = mockRequests.filter(request => {
    const matchesSearch = request.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         request.requestor.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         request.requestorCompany.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = selectedStatus === "all" || request.status === selectedStatus;
    
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
                <div key={request.id} className="p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        {getStatusIcon(request.status)}
                        <h3 className="font-medium">{request.title}</h3>
                        {getPriorityBadge(request.priority)}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {request.requestor} ({request.requestorCompany})
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
                      {getStatusBadge(request.status)}
                      <div className="text-right text-sm">
                        <p className="font-medium text-primary">{request.amount}</p>
                        <p className="text-muted-foreground">마감: {request.dueDate}</p>
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
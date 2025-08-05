import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Search, 
  MessageSquare,
  Clock,
  Users,
  AlertTriangle,
  Eye,
  Ban,
  Volume2,
  VolumeX
} from "lucide-react";

// Mock chat rooms data
const mockChatRooms = [
  {
    id: "CHAT-001",
    requestId: "REQ-001",
    requestTitle: "상악 우측 제1대구치 임플란트",
    participants: [
      { name: "김철수", role: "requestor", company: "서울치과기공소" },
      { name: "박영희", role: "manufacturer", company: "프리미엄 어벗먼트" }
    ],
    lastMessage: {
      sender: "김철수",
      content: "배송은 언제쯤 가능할까요?",
      timestamp: "2024-01-20 14:30"
    },
    unreadCount: 3,
    status: "active",
    hasIssue: false,
    createdAt: "2024-01-15"
  },
  {
    id: "CHAT-002",
    requestId: "REQ-002",
    requestTitle: "하악 좌측 제2소구치 임플란트",
    participants: [
      { name: "이영희", role: "requestor", company: "부산치과기공소" },
      { name: "정수진", role: "manufacturer", company: "정밀 어벗먼트" }
    ],
    lastMessage: {
      sender: "정수진",
      content: "제작이 완료되었습니다.",
      timestamp: "2024-01-20 13:45"
    },
    unreadCount: 0,
    status: "completed",
    hasIssue: false,
    createdAt: "2024-01-14"
  },
  {
    id: "CHAT-003",
    requestId: "REQ-003",
    requestTitle: "상악 전치부 임플란트",
    participants: [
      { name: "박민수", role: "requestor", company: "대구치과기공소" },
      { name: "최민영", role: "manufacturer", company: "스마트 어벗먼트" }
    ],
    lastMessage: {
      sender: "박민수",
      content: "이런 식으로 하면 안 되잖아요!",
      timestamp: "2024-01-20 12:15"
    },
    unreadCount: 8,
    status: "active",
    hasIssue: true,
    createdAt: "2024-01-13"
  },
  {
    id: "CHAT-004",
    requestId: "REQ-004",
    requestTitle: "하악 우측 제1대구치 임플란트",
    participants: [
      { name: "송지훈", role: "requestor", company: "전주치과기공소" },
      { name: "강동현", role: "manufacturer", company: "정밀 어벗먼트" }
    ],
    lastMessage: {
      sender: "어벗츠.핏",
      content: "해당 이슈는 해결되었습니다.",
      timestamp: "2024-01-20 11:30"
    },
    unreadCount: 1,
    status: "monitored",
    hasIssue: false,
    createdAt: "2024-01-12"
  }
];

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'active':
      return <Badge className="bg-green-100 text-green-700 border-green-200">활성</Badge>;
    case 'completed':
      return <Badge variant="secondary">완료</Badge>;
    case 'monitored':
      return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">모니터링</Badge>;
    case 'suspended':
      return <Badge variant="destructive">일시정지</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

export const AdminChatManagement = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [showIssuesOnly, setShowIssuesOnly] = useState(false);

  const filteredChats = mockChatRooms.filter(chat => {
    const matchesSearch = chat.requestTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         chat.participants.some(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesStatus = selectedStatus === "all" || chat.status === selectedStatus;
    const matchesIssue = !showIssuesOnly || chat.hasIssue;
    
    return matchesSearch && matchesStatus && matchesIssue;
  });

  return (
    <div className="min-h-screen bg-gradient-subtle p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-hero bg-clip-text text-transparent">
            채팅 관리
          </h1>
          <p className="text-muted-foreground text-lg">
            플랫폼 내 모든 채팅을 모니터링하고 관리하세요
          </p>
          
          {/* Search and Filter */}
          <div className="flex gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[300px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="채팅방 검색..."
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
                variant={selectedStatus === "active" ? "default" : "outline"}
                onClick={() => setSelectedStatus("active")}
                size="sm"
              >
                활성
              </Button>
              <Button
                variant={selectedStatus === "monitored" ? "default" : "outline"}
                onClick={() => setSelectedStatus("monitored")}
                size="sm"
              >
                모니터링
              </Button>
            </div>
            <Button
              variant={showIssuesOnly ? "default" : "outline"}
              onClick={() => setShowIssuesOnly(!showIssuesOnly)}
              size="sm"
            >
              <AlertTriangle className="mr-2 h-4 w-4" />
              이슈만 보기
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <MessageSquare className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">총 채팅방</p>
                  <p className="text-2xl font-bold">456</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Users className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">활성 채팅</p>
                  <p className="text-2xl font-bold">89</p>
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
                  <p className="text-sm text-muted-foreground">이슈 발생</p>
                  <p className="text-2xl font-bold">12</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Eye className="h-4 w-4 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">모니터링 중</p>
                  <p className="text-2xl font-bold">7</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Chat Rooms List */}
        <Card>
          <CardHeader>
            <CardTitle>채팅방 목록</CardTitle>
            <CardDescription>
              총 {filteredChats.length}개의 채팅방이 검색되었습니다
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredChats.map((chat) => (
                <div key={chat.id} className={`p-4 border rounded-lg hover:bg-muted/50 transition-colors ${chat.hasIssue ? 'border-red-200 bg-red-50/50' : 'border-border'}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <MessageSquare className="h-4 w-4 text-primary" />
                        <h3 className="font-medium">{chat.requestTitle}</h3>
                        {chat.hasIssue && (
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                        )}
                        {chat.unreadCount > 0 && (
                          <Badge variant="destructive" className="text-xs">
                            {chat.unreadCount}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span>요청 ID: {chat.requestId}</span>
                        <span>•</span>
                        <span>생성일: {chat.createdAt}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {getStatusBadge(chat.status)}
                    </div>
                  </div>
                  
                  {/* Participants */}
                  <div className="flex items-center gap-4 mb-3">
                    {chat.participants.map((participant, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs">{participant.name[0]}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm">
                          {participant.name} ({participant.company})
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {participant.role === 'requestor' ? '의뢰자' : '제조사'}
                        </Badge>
                      </div>
                    ))}
                  </div>

                  {/* Last Message */}
                  <div className="p-3 bg-muted/30 rounded-lg mb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-medium">{chat.lastMessage.sender}</p>
                        <p className="text-sm text-muted-foreground">{chat.lastMessage.content}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">{chat.lastMessage.timestamp}</span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" size="sm">
                      <Eye className="mr-2 h-4 w-4" />
                      채팅 보기
                    </Button>
                    {chat.status === "active" && (
                      <Button variant="outline" size="sm">
                        <Volume2 className="mr-2 h-4 w-4" />
                        모니터링 시작
                      </Button>
                    )}
                    {chat.status === "monitored" && (
                      <Button variant="outline" size="sm">
                        <VolumeX className="mr-2 h-4 w-4" />
                        모니터링 해제
                      </Button>
                    )}
                    {chat.hasIssue && (
                      <Button variant="destructive" size="sm">
                        <Ban className="mr-2 h-4 w-4" />
                        채팅 일시정지
                      </Button>
                    )}
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
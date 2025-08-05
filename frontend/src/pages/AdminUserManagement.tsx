import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  Search, 
  Filter, 
  MoreHorizontal,
  UserCheck,
  UserX,
  Shield,
  Building2,
  FileText,
  Eye
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

// Mock users data
const mockUsers = [
  {
    id: "1",
    name: "김철수",
    email: "kim@dental-lab.co.kr",
    role: "requestor",
    companyName: "서울치과기공소",
    status: "active",
    joinDate: "2024-01-15",
    lastLogin: "2024-01-20",
    totalRequests: 24,
    profileComplete: 95
  },
  {
    id: "2",
    name: "박영희",
    email: "park@abutment-maker.co.kr",
    role: "manufacturer",
    companyName: "프리미엄 어벗먼트",
    status: "active",
    joinDate: "2024-01-10",
    lastLogin: "2024-01-19",
    totalRequests: 47,
    profileComplete: 100
  },
  {
    id: "3",
    name: "이민수",
    email: "lee@dental-clinic.co.kr",
    role: "requestor",
    companyName: "부산치과기공소",
    status: "pending",
    joinDate: "2024-01-18",
    lastLogin: "2024-01-18",
    totalRequests: 0,
    profileComplete: 60
  },
  {
    id: "4",
    name: "정수진",
    email: "jung@precision-ab.co.kr",
    role: "manufacturer",
    companyName: "정밀 어벗먼트",
    status: "suspended",
    joinDate: "2024-01-05",
    lastLogin: "2024-01-16",
    totalRequests: 32,
    profileComplete: 85
  }
];

const getRoleLabel = (role: string) => {
  switch (role) {
    case 'requestor': return '의뢰자';
    case 'manufacturer': return '제조사';
    case 'admin': return '어벗츠.핏';
    default: return '사용자';
  }
};

const getRoleBadgeVariant = (role: string) => {
  switch (role) {
    case 'requestor': return 'default';
    case 'manufacturer': return 'secondary';
    case 'admin': return 'destructive';
    default: return 'outline';
  }
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'active':
      return <Badge className="bg-green-100 text-green-700 border-green-200">활성</Badge>;
    case 'pending':
      return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">승인 대기</Badge>;
    case 'suspended':
      return <Badge variant="destructive">일시정지</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

export const AdminUserManagement = () => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRole, setSelectedRole] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");

  const filteredUsers = mockUsers.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         user.companyName.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesRole = selectedRole === "all" || user.role === selectedRole;
    const matchesStatus = selectedStatus === "all" || user.status === selectedStatus;
    
    return matchesSearch && matchesRole && matchesStatus;
  });

  const handleUserAction = (action: string, userId: string, userName: string) => {
    toast({
      title: `사용자 ${action} 완료`,
      description: `${userName}님의 상태가 변경되었습니다.`,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-subtle p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="space-y-4">
          <h1 className="text-4xl font-bold bg-gradient-hero bg-clip-text text-transparent">
            사용자 관리
          </h1>
          <p className="text-muted-foreground text-lg">
            플랫폼 사용자들을 관리하고 모니터링하세요
          </p>
          
          {/* Search and Filter */}
          <div className="flex gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[300px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="사용자 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant={selectedRole === "all" ? "default" : "outline"}
                onClick={() => setSelectedRole("all")}
                size="sm"
              >
                전체
              </Button>
              <Button
                variant={selectedRole === "requestor" ? "default" : "outline"}
                onClick={() => setSelectedRole("requestor")}
                size="sm"
              >
                의뢰자
              </Button>
              <Button
                variant={selectedRole === "manufacturer" ? "default" : "outline"}
                onClick={() => setSelectedRole("manufacturer")}
                size="sm"
              >
                제조사
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant={selectedStatus === "all" ? "default" : "outline"}
                onClick={() => setSelectedStatus("all")}
                size="sm"
              >
                전체 상태
              </Button>
              <Button
                variant={selectedStatus === "active" ? "default" : "outline"}
                onClick={() => setSelectedStatus("active")}
                size="sm"
              >
                활성
              </Button>
              <Button
                variant={selectedStatus === "pending" ? "default" : "outline"}
                onClick={() => setSelectedStatus("pending")}
                size="sm"
              >
                대기
              </Button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Shield className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">총 사용자</p>
                  <p className="text-2xl font-bold">234</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <FileText className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">의뢰자</p>
                  <p className="text-2xl font-bold">156</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <Building2 className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">제조사</p>
                  <p className="text-2xl font-bold">67</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <UserCheck className="h-4 w-4 text-yellow-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">승인 대기</p>
                  <p className="text-2xl font-bold">11</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Users List */}
        <Card>
          <CardHeader>
            <CardTitle>사용자 목록</CardTitle>
            <CardDescription>
              총 {filteredUsers.length}명의 사용자가 검색되었습니다
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {filteredUsers.map((user) => (
                <div key={user.id} className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <Avatar>
                      <AvatarFallback>{user.name[0]}</AvatarFallback>
                    </Avatar>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{user.name}</h3>
                        <Badge variant={getRoleBadgeVariant(user.role)}>
                          {getRoleLabel(user.role)}
                        </Badge>
                        {getStatusBadge(user.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                      <p className="text-sm text-muted-foreground">{user.companyName}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="text-right text-sm">
                      <p className="text-muted-foreground">가입일: {user.joinDate}</p>
                      <p className="text-muted-foreground">최종접속: {user.lastLogin}</p>
                      <p className="text-muted-foreground">의뢰수: {user.totalRequests}건</p>
                    </div>
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleUserAction("상세보기", user.id, user.name)}>
                          <Eye className="mr-2 h-4 w-4" />
                          상세보기
                        </DropdownMenuItem>
                        {user.status === "pending" && (
                          <DropdownMenuItem onClick={() => handleUserAction("승인", user.id, user.name)}>
                            <UserCheck className="mr-2 h-4 w-4" />
                            승인하기
                          </DropdownMenuItem>
                        )}
                        {user.status === "active" && (
                          <DropdownMenuItem onClick={() => handleUserAction("일시정지", user.id, user.name)}>
                            <UserX className="mr-2 h-4 w-4" />
                            일시정지
                          </DropdownMenuItem>
                        )}
                        {user.status === "suspended" && (
                          <DropdownMenuItem onClick={() => handleUserAction("활성화", user.id, user.name)}>
                            <UserCheck className="mr-2 h-4 w-4" />
                            활성화
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
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
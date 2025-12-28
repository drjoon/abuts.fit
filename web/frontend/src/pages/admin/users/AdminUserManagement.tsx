import { useCallback, useEffect, useMemo, useState } from "react";
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
  Eye,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { request } from "@/lib/apiClient";
import { useAuthStore } from "@/store/useAuthStore";

const getRoleLabel = (role: string) => {
  switch (role) {
    case "requestor":
      return "의뢰자";
    case "manufacturer":
      return "제조사";
    case "admin":
      return "어벗츠.핏";
    default:
      return "사용자";
  }
};

const getRoleBadgeVariant = (role: string) => {
  switch (role) {
    case "requestor":
      return "default";
    case "manufacturer":
      return "secondary";
    case "admin":
      return "destructive";
    default:
      return "outline";
  }
};

type UiUserStatus = "active" | "pending" | "inactive" | "suspended";

type ApiUser = {
  _id: string;
  name?: string;
  email?: string;
  originalEmail?: string | null;
  role?: string;
  organization?: string;
  active?: boolean;
  approvedAt?: string | null;
  createdAt?: string;
  lastLogin?: string;
  replacesUserId?: string | null;
  replacedByUserId?: string | null;
};

type UiUserRow = {
  id: string;
  name: string;
  email: string;
  originalEmail: string;
  role: string;
  companyName: string;
  status: UiUserStatus;
  joinDate: string;
  lastLogin: string;
  totalRequests?: number | null;
  replacesUserId?: string | null;
  replacedByUserId?: string | null;
};

const formatDate = (input?: string) => {
  if (!input) return "-";
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "-";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const toUiUser = (u: ApiUser): UiUserRow => {
  const active = Boolean(u.active);
  const approved = Boolean(u.approvedAt);
  const status: UiUserStatus = !active
    ? "inactive"
    : !approved
    ? "pending"
    : "active";
  const email = String(u.email || "");
  const originalEmail = String(u.originalEmail || "");
  return {
    id: String(u._id || ""),
    name: String(u.name || ""),
    email,
    originalEmail,
    role: String(u.role || ""),
    companyName: String(u.organization || ""),
    status,
    joinDate: formatDate(u.createdAt),
    lastLogin: formatDate(u.lastLogin),
    totalRequests: null,
    replacesUserId: u.replacesUserId || null,
    replacedByUserId: u.replacedByUserId || null,
  };
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case "active":
      return (
        <Badge className="bg-green-100 text-green-700 border-green-200">
          활성
        </Badge>
      );
    case "pending":
      return (
        <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">
          승인 대기
        </Badge>
      );
    case "suspended":
      return <Badge variant="destructive">일시정지</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

export const AdminUserManagement = () => {
  const { toast } = useToast();
  const { token } = useAuthStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRole, setSelectedRole] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");

  const [users, setUsers] = useState<UiUserRow[] | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UiUserRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const fetchUsers = useCallback(async () => {
    if (!token) return;

    setLoadingUsers(true);
    try {
      const res = await request<any>({
        path: "/api/admin/users?page=1&limit=200",
        method: "GET",
        token,
      });

      if (!res.ok || !res.data?.success) {
        toast({
          title: "사용자 목록 조회 실패",
          description: res.data?.message || "잠시 후 다시 시도해주세요.",
          variant: "destructive",
        });
        return;
      }

      const body: any = res.data || {};
      const data = body.data || {};
      const rawUsers: ApiUser[] = Array.isArray(data.users) ? data.users : [];
      setUsers(rawUsers.map(toUiUser));
    } finally {
      setLoadingUsers(false);
    }
  }, [toast, token]);

  const fetchUserDetail = useCallback(
    async (userId: string) => {
      if (!token) return;
      setSelectedUserId(userId);
      setDetailOpen(true);
      setLoadingDetail(true);
      try {
        const res = await request<any>({
          path: `/api/admin/users/${encodeURIComponent(userId)}`,
          method: "GET",
          token,
        });

        if (!res.ok) return;
        const body: any = res.data || {};
        const data = body.data || body;
        if (!data?._id) return;
        setSelectedUser(toUiUser(data));
      } finally {
        setLoadingDetail(false);
      }
    },
    [token]
  );

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const sourceUsers = users || [];

  const filteredUsers = useMemo(() => {
    return sourceUsers.filter((user: any) => {
      const q = searchQuery.trim().toLowerCase();
      const hay = [
        String(user.name || "").toLowerCase(),
        String(user.email || "").toLowerCase(),
        String(user.companyName || "").toLowerCase(),
        String((user as any).originalEmail || "").toLowerCase(),
      ].join(" ");

      const matchesSearch = !q || hay.includes(q);
      const matchesRole = selectedRole === "all" || user.role === selectedRole;
      const matchesStatus =
        selectedStatus === "all" || user.status === selectedStatus;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [searchQuery, selectedRole, selectedStatus, sourceUsers]);

  const handleUserAction = (
    action: string,
    userId: string,
    userName: string
  ) => {
    if (action === "상세보기") {
      void fetchUserDetail(userId);
      return;
    }
    toast({
      title: `사용자 ${action} 완료`,
      description: `${userName}님의 상태가 변경되었습니다.`,
    });
  };

  const totalUsers = sourceUsers.length;
  const totalRequestor = sourceUsers.filter(
    (u) => u.role === "requestor"
  ).length;
  const totalManufacturer = sourceUsers.filter(
    (u) => u.role === "manufacturer"
  ).length;
  const totalPending = sourceUsers.filter((u) => u.status === "pending").length;

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
                variant={
                  selectedRole === "manufacturer" ? "default" : "outline"
                }
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
                  <p className="text-2xl font-bold">
                    {totalUsers.toLocaleString()}
                  </p>
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
                  <p className="text-2xl font-bold">
                    {totalRequestor.toLocaleString()}
                  </p>
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
                  <p className="text-2xl font-bold">
                    {totalManufacturer.toLocaleString()}
                  </p>
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
                  <p className="text-2xl font-bold">
                    {totalPending.toLocaleString()}
                  </p>
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
            {loadingUsers && (
              <div className="text-sm text-muted-foreground pb-4">
                불러오는 중...
              </div>
            )}
            <div className="space-y-4">
              {filteredUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <Avatar>
                      <AvatarFallback>
                        {String(user.name || "?")[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{user.name}</h3>
                        <Badge variant={getRoleBadgeVariant(user.role)}>
                          {getRoleLabel(user.role)}
                        </Badge>
                        {getStatusBadge(user.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {user.email}
                      </p>
                      {!!(user as any).originalEmail && (
                        <p className="text-xs text-muted-foreground">
                          원본 이메일: {(user as any).originalEmail}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {user.companyName}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right text-sm">
                      <p className="text-muted-foreground">
                        가입일: {user.joinDate}
                      </p>
                      <p className="text-muted-foreground">
                        최종접속: {user.lastLogin}
                      </p>
                      <p className="text-muted-foreground">
                        의뢰수: {user.totalRequests ?? "-"}
                      </p>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            handleUserAction("상세보기", user.id, user.name)
                          }
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          상세보기
                        </DropdownMenuItem>
                        {user.status === "pending" && (
                          <DropdownMenuItem
                            onClick={() =>
                              handleUserAction("승인", user.id, user.name)
                            }
                          >
                            <UserCheck className="mr-2 h-4 w-4" />
                            승인하기
                          </DropdownMenuItem>
                        )}
                        {user.status === "active" && (
                          <DropdownMenuItem
                            onClick={() =>
                              handleUserAction("일시정지", user.id, user.name)
                            }
                          >
                            <UserX className="mr-2 h-4 w-4" />
                            일시정지
                          </DropdownMenuItem>
                        )}
                        {user.status === "suspended" && (
                          <DropdownMenuItem
                            onClick={() =>
                              handleUserAction("활성화", user.id, user.name)
                            }
                          >
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

        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>사용자 상세</DialogTitle>
            </DialogHeader>

            {loadingDetail || !selectedUser ? (
              <div className="text-sm text-muted-foreground">
                불러오는 중...
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-muted-foreground">이름</div>
                    <div className="font-medium">{selectedUser.name}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">역할</div>
                    <div className="font-medium">
                      {getRoleLabel(selectedUser.role)}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">이메일</div>
                    <div className="font-medium break-all">
                      {selectedUser.email}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">원본 이메일</div>
                    <div className="font-medium break-all">
                      {selectedUser.originalEmail || "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">조직</div>
                    <div className="font-medium">
                      {selectedUser.companyName || "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">상태</div>
                    <div className="font-medium">
                      {getStatusBadge(selectedUser.status)}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 justify-end">
                  {!!selectedUser.replacesUserId && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        fetchUserDetail(String(selectedUser.replacesUserId))
                      }
                      disabled={loadingDetail}
                    >
                      이전 계정
                    </Button>
                  )}
                  {!!selectedUser.replacedByUserId && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        fetchUserDetail(String(selectedUser.replacedByUserId))
                      }
                      disabled={loadingDetail}
                    >
                      새 계정
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setDetailOpen(false)}
                  >
                    닫기
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

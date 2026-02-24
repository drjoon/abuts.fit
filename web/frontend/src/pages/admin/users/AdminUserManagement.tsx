import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  MoreHorizontal,
  UserCheck,
  UserX,
  Shield,
  Users,
  Briefcase,
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
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { usePeriodStore } from "@/store/usePeriodStore";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";

const getRoleLabel = (role: string) => {
  switch (role) {
    case "requestor":
      return "의뢰자";
    case "manufacturer":
      return "제조사";
    case "admin":
      return "어벗츠.핏";
    case "salesman":
      return "영업자";
    default:
      return "사용자";
  }
};

const getRoleBadgeVariant = (role: string) => {
  switch (role) {
    case "requestor":
      return "default";
    case "salesman":
      return "secondary";
    case "manufacturer":
      return "secondary";
    case "admin":
      return "destructive";
    default:
      return "outline";
  }
};

type UiUserStatus = "active" | "pending" | "inactive" | "suspended";

const PAGE_LIMIT = 60;

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
  totalRequests?: number;
  replacesUserId?: string | null;
  replacedByUserId?: string | null;
  organizationInfo?: {
    name?: string;
    businessLicense?: {
      fileId?: string | null;
      s3Key?: string | null;
      originalName?: string | null;
    } | null;
    extracted?: {
      companyName?: string;
      businessNumber?: string;
      address?: string;
      phoneNumber?: string;
      email?: string;
      representativeName?: string;
      businessType?: string;
      businessItem?: string;
      startDate?: string;
    } | null;
    verification?: {
      verified?: boolean;
      provider?: string;
      message?: string;
      checkedAt?: string | null;
    } | null;
  } | null;
  unresolvedBusiness?: boolean;
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
  organizationInfo?: ApiUser["organizationInfo"] | null;
  unresolvedBusiness?: boolean;
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
    totalRequests:
      typeof u.totalRequests === "number" && !Number.isNaN(u.totalRequests)
        ? u.totalRequests
        : null,
    replacesUserId: u.replacesUserId || null,
    replacedByUserId: u.replacedByUserId || null,
    organizationInfo: u.organizationInfo || null,
    unresolvedBusiness: Boolean(u.unresolvedBusiness),
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
  const { period, setPeriod } = usePeriodStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRole, setSelectedRole] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");

  const [users, setUsers] = useState<UiUserRow[] | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UiUserRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [licenseUrl, setLicenseUrl] = useState<string | null>(null);
  const [licenseLoading, setLicenseLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [createdTempPassword, setCreatedTempPassword] = useState<string | null>(
    null,
  );
  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    role: "requestor",
    organization: "",
  });

  const fetchUsers = useCallback(
    async (targetPage = 1, append = false) => {
      if (!token) return;

      if (append) {
        setLoadingMore(true);
      } else {
        setLoadingUsers(true);
      }
      try {
        const res = await request<any>({
          path: `/api/admin/users?page=${targetPage}&limit=${PAGE_LIMIT}`,
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
        const mapped = rawUsers.map(toUiUser);
        setUsers((prev) => (append ? [...(prev || []), ...mapped] : mapped));
        const total = Number(data.pagination?.total || 0);
        setTotalCount(total);
        setHasMore(targetPage * PAGE_LIMIT < total);
        setPage(targetPage);
      } finally {
        if (append) {
          setLoadingMore(false);
        } else {
          setLoadingUsers(false);
        }
      }
    },
    [toast, token],
  );

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
    [token],
  );

  const toggleUserActive = useCallback(
    async (userId: string) => {
      if (!token) return false;
      const res = await request<any>({
        path: `/api/admin/users/${encodeURIComponent(userId)}/toggle-active`,
        method: "PATCH",
        token,
      });
      if (!res.ok || !res.data?.success) {
        toast({
          title: "사용자 상태 변경 실패",
          description: res.data?.message || "잠시 후 다시 시도해주세요.",
          variant: "destructive",
        });
        return false;
      }
      return true;
    },
    [toast, token],
  );

  const createUser = useCallback(async () => {
    if (!token) return;

    const email = createForm.email.trim().toLowerCase();
    if (!email) {
      toast({
        title: "입력 오류",
        description: "이메일은 필수입니다.",
        variant: "destructive",
      });
      return;
    }

    setCreatingUser(true);
    setCreatedTempPassword(null);
    try {
      const res = await request<any>({
        path: "/api/admin/users",
        method: "POST",
        token,
        jsonBody: {
          name: createForm.name,
          email,
          role: createForm.role,
          organization: createForm.organization,
          autoActivate: true,
        },
      });

      if (!res.ok || !res.data?.success) {
        toast({
          title: "사용자 생성 실패",
          description: res.data?.message || "잠시 후 다시 시도해주세요.",
          variant: "destructive",
        });
        return;
      }

      const tempPassword = res.data?.data?.tempPassword || null;
      setCreatedTempPassword(tempPassword);

      toast({
        title: "사용자 생성 완료",
        description: tempPassword
          ? "임시 비밀번호가 발급되었습니다. 복사 후 전달하세요."
          : "사용자가 생성되었습니다.",
      });
      await fetchUsers();
    } finally {
      setCreatingUser(false);
    }
  }, [
    createForm.email,
    createForm.name,
    createForm.organization,
    createForm.role,
    fetchUsers,
    toast,
    token,
  ]);

  const approveUser = useCallback(
    async (userId: string) => {
      if (!token) return false;
      const res = await request<any>({
        path: `/api/admin/users/${encodeURIComponent(userId)}/approve`,
        method: "POST",
        token,
      });
      if (!res.ok || !res.data?.success) {
        toast({
          title: "승인 실패",
          description: res.data?.message || "잠시 후 다시 시도해주세요.",
          variant: "destructive",
        });
        return false;
      }
      return true;
    },
    [toast, token],
  );

  const rejectUser = useCallback(
    async (userId: string) => {
      if (!token) return false;
      const res = await request<any>({
        path: `/api/admin/users/${encodeURIComponent(userId)}/reject`,
        method: "POST",
        token,
      });
      if (!res.ok || !res.data?.success) {
        toast({
          title: "거절 실패",
          description: res.data?.message || "잠시 후 다시 시도해주세요.",
          variant: "destructive",
        });
        return false;
      }
      return true;
    },
    [toast, token],
  );

  useEffect(() => {
    void fetchUsers(1, false);
  }, [fetchUsers]);

  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (loadingUsers || loadingMore) return;
        if (!hasMore) return;
        void fetchUsers(page + 1, true);
      },
      { rootMargin: "240px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchUsers, hasMore, loadingMore, loadingUsers, page]);

  useEffect(() => {
    const loadLicense = async () => {
      const license = selectedUser?.organizationInfo?.businessLicense;
      if (!token || (!license?.fileId && !license?.s3Key)) {
        setLicenseUrl(null);
        return;
      }
      setLicenseLoading(true);
      try {
        const endpoint = license?.fileId
          ? `/api/files/${license.fileId}/download-url`
          : `/api/files/s3/${encodeURIComponent(license?.s3Key || "")}/download-url`;
        const res = await request<any>({
          path: endpoint,
          method: "GET",
          token,
        });
        if (!res.ok) {
          setLicenseUrl(null);
          return;
        }
        setLicenseUrl(res.data?.data?.url || null);
      } finally {
        setLicenseLoading(false);
      }
    };
    void loadLicense();
  }, [selectedUser, token]);

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
    userName: string,
  ) => {
    if (action === "상세보기") {
      void fetchUserDetail(userId);
      return;
    }

    const run = async () => {
      if (action === "승인") {
        const ok = await approveUser(userId);
        if (!ok) return;
      } else if (action === "거절") {
        const ok = await rejectUser(userId);
        if (!ok) return;
      } else {
        const ok = await toggleUserActive(userId);
        if (!ok) return;
      }

      toast({
        title: `사용자 ${action} 완료`,
        description: `${userName}님의 상태가 변경되었습니다.`,
      });
      await fetchUsers();
      if (selectedUserId === userId) {
        await fetchUserDetail(userId);
      }
    };

    void run();
  };

  const changeUserRole = useCallback(
    async (userId: string, role: string) => {
      if (!token) return false;
      const res = await request<any>({
        path: `/api/admin/users/${encodeURIComponent(userId)}/change-role`,
        method: "PATCH",
        token,
        jsonBody: { role },
      });
      if (!res.ok || !res.data?.success) {
        toast({
          title: "사용자 역할 변경 실패",
          description: res.data?.message || "잠시 후 다시 시도해주세요.",
          variant: "destructive",
        });
        return false;
      }
      return true;
    },
    [toast, token],
  );

  const totalUsers = totalCount || sourceUsers.length;
  const totalRequestor = sourceUsers.filter(
    (u) => u.role === "requestor",
  ).length;
  const totalSalesman = sourceUsers.filter((u) => u.role === "salesman").length;
  const totalManufacturer = sourceUsers.filter(
    (u) => u.role === "manufacturer",
  ).length;
  const totalAdmin = sourceUsers.filter((u) => u.role === "admin").length;
  const totalPending = sourceUsers.filter((u) => u.status === "pending").length;
  const unresolvedUsers = sourceUsers.filter((u) => u.unresolvedBusiness);

  return (
    <div className="min-h-screen bg-gradient-subtle p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Users className="h-4 w-4 text-primary" />
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
                <div className="p-2 bg-slate-100 rounded-lg">
                  <Briefcase className="h-4 w-4 text-slate-700" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">영업자</p>
                  <p className="text-2xl font-bold">
                    {totalSalesman.toLocaleString()}
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
                <div className="p-2 bg-red-100 rounded-lg">
                  <Shield className="h-4 w-4 text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">관리자</p>
                  <p className="text-2xl font-bold">
                    {totalAdmin.toLocaleString()}
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

        {/* Search and Filter (moved below summary cards) */}
        {unresolvedUsers.length > 0 && (
          <Card className="border-amber-200 bg-amber-50/70">
            <CardHeader>
              <CardTitle className="text-base">사업자 정보 확인 필요</CardTitle>
              <CardDescription>
                사업자등록증 검증이 미처리된 사용자입니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {unresolvedUsers.map((user) => (
                <div
                  key={user.id}
                  className="rounded-lg border border-amber-200 bg-white p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium">{user.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {user.companyName || "사업장 미등록"}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => fetchUserDetail(user.id)}
                    >
                      상세보기
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        <div className="flex gap-4 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              className="bg-orange-600 hover:bg-orange-700 text-white"
              onClick={() => {
                setCreateOpen(true);
                setCreatedTempPassword(null);
                setCreateForm({
                  name: "",
                  email: "",
                  role: "requestor",
                  organization: "",
                });
              }}
            >
              사용자 추가
            </Button>
          </div>

          <div className="relative flex-1 min-w-[280px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="사용자 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex gap-2 flex-wrap">
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
              variant={selectedRole === "salesman" ? "default" : "outline"}
              onClick={() => setSelectedRole("salesman")}
              size="sm"
            >
              영업자
            </Button>
            <Button
              variant={selectedRole === "manufacturer" ? "default" : "outline"}
              onClick={() => setSelectedRole("manufacturer")}
              size="sm"
            >
              제조사
            </Button>
            <Button
              variant={selectedRole === "admin" ? "default" : "outline"}
              onClick={() => setSelectedRole("admin")}
              size="sm"
            >
              관리자
            </Button>
          </div>

          <div className="flex gap-2 flex-wrap">
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredUsers.map((user) => (
                <div
                  key={user.id}
                  className={
                    user.unresolvedBusiness
                      ? "p-4 border border-amber-200 rounded-lg bg-amber-50/40"
                      : "p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="shrink-0">
                        <AvatarFallback>
                          {String(user.name || "?")[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium truncate max-w-[180px]">
                            {user.name}
                          </h3>
                          <Badge variant={getRoleBadgeVariant(user.role)}>
                            {getRoleLabel(user.role)}
                          </Badge>
                          {getStatusBadge(user.status)}
                          {user.unresolvedBusiness && (
                            <Badge className="bg-amber-100 text-amber-700 border-amber-200">
                              사업자 확인 필요
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {user.email}
                        </p>
                        {user.companyName ? (
                          <p className="text-xs text-muted-foreground truncate">
                            {user.companyName}
                          </p>
                        ) : null}
                      </div>
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
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="text-xs text-muted-foreground">
                      의뢰 {user.totalRequests ?? "-"}
                    </div>

                    <div className="flex items-center gap-2">
                      {user.status === "pending" ? (
                        <>
                          <Button
                            size="sm"
                            className="h-8"
                            onClick={() =>
                              handleUserAction("승인", user.id, user.name)
                            }
                          >
                            승인
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() =>
                              handleUserAction("거절", user.id, user.name)
                            }
                          >
                            거절
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant={
                            user.status === "active" ? "outline" : "default"
                          }
                          className="h-8"
                          onClick={() =>
                            handleUserAction(
                              user.status === "active" ? "일시정지" : "활성화",
                              user.id,
                              user.name,
                            )
                          }
                        >
                          {user.status === "active" ? "비활성화" : "활성화"}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div ref={loadMoreRef} className="h-8" />
            {loadingMore && (
              <div className="text-sm text-muted-foreground pt-2">
                추가 사용자 불러오는 중...
              </div>
            )}
          </CardContent>
        </Card>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>사용자 추가</DialogTitle>
            </DialogHeader>

            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">이름</div>
                  <Input
                    value={createForm.name}
                    onChange={(e) =>
                      setCreateForm((p) => ({ ...p, name: e.target.value }))
                    }
                    placeholder="이름"
                  />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">역할</div>
                  <Select
                    value={createForm.role}
                    onValueChange={(v) =>
                      setCreateForm((p) => ({ ...p, role: v }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="역할 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="requestor">의뢰자</SelectItem>
                      <SelectItem value="salesman">영업자</SelectItem>
                      <SelectItem value="manufacturer">제조사</SelectItem>
                      <SelectItem value="admin">관리자</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <div className="text-sm text-muted-foreground mb-1">이메일</div>
                <Input
                  value={createForm.email}
                  onChange={(e) =>
                    setCreateForm((p) => ({ ...p, email: e.target.value }))
                  }
                  placeholder="email@example.com"
                />
              </div>

              <div>
                <div className="text-sm text-muted-foreground mb-1">조직</div>
                <Input
                  value={createForm.organization}
                  onChange={(e) =>
                    setCreateForm((p) => ({
                      ...p,
                      organization: e.target.value,
                    }))
                  }
                  placeholder="조직명(선택)"
                />
              </div>

              {createdTempPassword && (
                <div className="p-3 rounded-lg border border-orange-200 bg-orange-50">
                  <div className="text-sm font-semibold text-orange-800">
                    임시 비밀번호
                  </div>
                  <div className="mt-1 font-mono text-sm break-all text-orange-900">
                    {createdTempPassword}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateOpen(false)}
                  disabled={creatingUser}
                >
                  닫기
                </Button>
                <Button
                  type="button"
                  onClick={() => void createUser()}
                  disabled={creatingUser}
                >
                  {creatingUser ? "생성 중..." : "생성"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="max-w-6xl w-full">
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
                  <div>
                    <div className="text-muted-foreground">사업자 상태</div>
                    <div className="font-medium">
                      {selectedUser.unresolvedBusiness ? (
                        <Badge className="bg-amber-100 text-amber-700 border-amber-200">
                          확인 필요
                        </Badge>
                      ) : (
                        <Badge variant="outline">정상</Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
                  <div className="space-y-3 rounded-lg border p-4">
                    <div className="text-sm font-medium">사업자등록증</div>
                    {licenseLoading && (
                      <div className="text-sm text-muted-foreground">
                        불러오는 중...
                      </div>
                    )}
                    {!licenseLoading && licenseUrl && (
                      <img
                        src={licenseUrl}
                        alt="사업자등록증"
                        className="w-full rounded-md border object-contain"
                      />
                    )}
                    {!licenseLoading && !licenseUrl && (
                      <div className="text-sm text-muted-foreground">
                        등록된 사업자등록증이 없습니다.
                      </div>
                    )}
                  </div>
                  <div className="space-y-3 rounded-lg border p-4">
                    <div className="text-sm font-medium">
                      추출된 사업자 정보
                    </div>
                    {selectedUser.organizationInfo?.extracted ? (
                      <div className="grid gap-2 text-sm">
                        <div className="grid grid-cols-[140px_1fr] gap-2">
                          <span className="text-muted-foreground">
                            사업자명
                          </span>
                          <span>
                            {selectedUser.organizationInfo.extracted
                              .companyName || "-"}
                          </span>
                        </div>
                        <div className="grid grid-cols-[140px_1fr] gap-2">
                          <span className="text-muted-foreground">대표자</span>
                          <span>
                            {selectedUser.organizationInfo.extracted
                              .representativeName || "-"}
                          </span>
                        </div>
                        <div className="grid grid-cols-[140px_1fr] gap-2">
                          <span className="text-muted-foreground">
                            사업자번호
                          </span>
                          <span>
                            {selectedUser.organizationInfo.extracted
                              .businessNumber || "-"}
                          </span>
                        </div>
                        <div className="grid grid-cols-[140px_1fr] gap-2">
                          <span className="text-muted-foreground">주소</span>
                          <span>
                            {selectedUser.organizationInfo.extracted.address ||
                              "-"}
                          </span>
                        </div>
                        <div className="grid grid-cols-[140px_1fr] gap-2">
                          <span className="text-muted-foreground">
                            전화번호
                          </span>
                          <span>
                            {selectedUser.organizationInfo.extracted
                              .phoneNumber || "-"}
                          </span>
                        </div>
                        <div className="grid grid-cols-[140px_1fr] gap-2">
                          <span className="text-muted-foreground">이메일</span>
                          <span>
                            {selectedUser.organizationInfo.extracted.email ||
                              "-"}
                          </span>
                        </div>
                        <div className="grid grid-cols-[140px_1fr] gap-2">
                          <span className="text-muted-foreground">
                            업태/업종
                          </span>
                          <span>
                            {selectedUser.organizationInfo.extracted
                              .businessType || "-"}
                            {selectedUser.organizationInfo.extracted
                              .businessItem
                              ? ` / ${selectedUser.organizationInfo.extracted.businessItem}`
                              : ""}
                          </span>
                        </div>
                        <div className="grid grid-cols-[140px_1fr] gap-2">
                          <span className="text-muted-foreground">개업일</span>
                          <span>
                            {selectedUser.organizationInfo.extracted
                              .startDate || "-"}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        추출된 정보가 없습니다.
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={loadingDetail}
                    onClick={async () => {
                      if (!selectedUser) return;
                      const ok = await toggleUserActive(selectedUser.id);
                      if (!ok) return;
                      await fetchUsers();
                      await fetchUserDetail(selectedUser.id);
                    }}
                  >
                    {selectedUser.status === "active" ? "비활성화" : "활성화"}
                  </Button>

                  <Select
                    value={selectedUser.role}
                    onValueChange={async (v) => {
                      if (!selectedUser) return;
                      const ok = await changeUserRole(selectedUser.id, v);
                      if (!ok) return;
                      toast({
                        title: "역할 변경 완료",
                        description: `${selectedUser.name}님의 역할이 변경되었습니다.`,
                      });
                      await fetchUsers();
                      await fetchUserDetail(selectedUser.id);
                    }}
                  >
                    <SelectTrigger className="w-[160px]">
                      <SelectValue placeholder="역할" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="requestor">의뢰자</SelectItem>
                      <SelectItem value="salesman">영업자</SelectItem>
                      <SelectItem value="manufacturer">제조사</SelectItem>
                      <SelectItem value="admin">관리자</SelectItem>
                    </SelectContent>
                  </Select>

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

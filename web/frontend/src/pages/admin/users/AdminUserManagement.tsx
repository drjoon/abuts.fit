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
  Trash2,
  Download,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
    case "devops":
      return "개발운영사";
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
    case "devops":
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

const PAGE_LIMIT = 20;

type ApiUser = {
  _id: string;
  name?: string;
  email?: string;
  originalEmail?: string | null;
  role?: string;
  subRole?: string | null;
  business?: string;
  active?: boolean;
  approvedAt?: string | null;
  createdAt?: string;
  lastLogin?: string;
  totalRequests?: number;
  replacesUserId?: string | null;
  replacedByUserId?: string | null;
  businessInfo?: {
    name?: string;
    businessLicense?: {
      fileId?: string | null;
      s3Key?: string | null;
      originalName?: string | null;
    } | null;
    metadata?: {
      companyName?: string;
      businessNumber?: string;
      representativeName?: string;
      address?: string;
      addressDetail?: string;
      zipCode?: string;
      phoneNumber?: string;
      email?: string;
      businessType?: string;
      businessItem?: string;
      businessCategory?: string;
      startDate?: string;
    } | null;
    // SSOT: metadata 사용 (extracted 레거시 제거)
    extracted?: {
      companyName?: string;
      businessNumber?: string;
      representativeName?: string;
      businessAddress?: string;
      businessType?: string;
      businessItem?: string;
      openDate?: string;
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
  subRole?: string | null;
  companyName: string;
  status: UiUserStatus;
  joinDate: string;
  lastLogin: string;
  totalRequests?: number | null;
  replacesUserId?: string | null;
  replacedByUserId?: string | null;
  businessInfo?: ApiUser["businessInfo"] | null;
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

// SSOT: metadata 사용 (extracted 레거시 제거)
const getDisplayUserName = (user: Pick<UiUserRow, "name" | "businessInfo">) => {
  const representativeName = String(
    user.businessInfo?.metadata?.representativeName || "",
  ).trim();
  const accountName = String(user.name || "").trim();
  return representativeName || accountName || "-";
};

const toUiUser = (u: ApiUser): UiUserRow => {
  const active = Boolean(u.active);
  const approved = Boolean(u.approvedAt);
  const status: UiUserStatus = !approved
    ? "pending"
    : !active
      ? "inactive"
      : "active";
  const email = String(u.email || "");
  const originalEmail = String(u.originalEmail || "");
  return {
    id: String(u._id || ""),
    name: String(u.name || ""),
    email,
    originalEmail,
    role: String(u.role || ""),
    subRole: u.subRole || null,
    companyName: String(u.business || ""),
    status,
    joinDate: formatDate(u.createdAt),
    lastLogin: formatDate(u.lastLogin),
    totalRequests:
      typeof u.totalRequests === "number" && !Number.isNaN(u.totalRequests)
        ? u.totalRequests
        : null,
    replacesUserId: u.replacesUserId || null,
    replacedByUserId: u.replacedByUserId || null,
    businessInfo: u.businessInfo || null,
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

const getSubRoleBadge = (user: Pick<UiUserRow, "subRole">) => {
  const { subRole } = user;

  if (!subRole) return null;

  if (subRole === "owner") {
    return (
      <Badge className="bg-blue-100 text-blue-700 border-blue-200">대표</Badge>
    );
  }

  if (subRole === "staff") {
    return (
      <Badge className="bg-slate-100 text-slate-600 border-slate-200">
        직원
      </Badge>
    );
  }

  return null;
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
  const [deleteTarget, setDeleteTarget] = useState<UiUserRow | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const listContainerRef = useRef<HTMLDivElement | null>(null);

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

  const deleteUserWithBusiness = useCallback(
    async (targetUser: UiUserRow) => {
      if (!token) return false;
      setDeletingUser(true);
      try {
        const res = await request<any>({
          path: `/api/admin/users/${encodeURIComponent(targetUser.id)}/with-business`,
          method: "DELETE",
          token,
        });
        if (!res.ok || !res.data?.success) {
          toast({
            title: "사업자 포함 계정 삭제 실패",
            description:
              res.data?.message ||
              res.data?.error ||
              "잠시 후 다시 시도해주세요.",
            variant: "destructive",
          });
          return false;
        }
        toast({
          title: "사업자 포함 계정 삭제 완료",
          description: `${getDisplayUserName(targetUser)} 계정과 연결 사업자를 삭제했습니다.`,
        });
        setDeleteTarget(null);
        setDetailOpen(false);
        setSelectedUser(null);
        setSelectedUserId(null);
        await fetchUsers(1, false);
        return true;
      } finally {
        setDeletingUser(false);
      }
    },
    [fetchUsers, toast, token],
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
      {
        root: listContainerRef.current || null,
        rootMargin: listContainerRef.current ? "200px" : "240px",
      },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchUsers, hasMore, loadingMore, loadingUsers, page]);

  useEffect(() => {
    const loadLicense = async () => {
      const license = selectedUser?.businessInfo?.businessLicense;
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
  const totalDevops = sourceUsers.filter((u) => u.role === "devops").length;
  const totalManufacturer = sourceUsers.filter(
    (u) => u.role === "manufacturer",
  ).length;
  const totalAdmin = sourceUsers.filter((u) => u.role === "admin").length;
  const totalPending = sourceUsers.filter((u) => u.status === "pending").length;
  const unresolvedUsers = sourceUsers.filter((u) => u.unresolvedBusiness);

  return (
    <div className="flex flex-col h-full min-h-0 bg-gradient-subtle p-6">
      <div className="max-w-7xl w-full mx-auto space-y-6 flex-1 min-h-0 overflow-y-auto">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4">
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
                <div className="p-2 bg-sky-100 rounded-lg">
                  <Shield className="h-4 w-4 text-sky-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">개발운영사</p>
                  <p className="text-2xl font-bold">
                    {totalDevops.toLocaleString()}
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
                      <div className="font-medium">
                        {getDisplayUserName(user)}
                      </div>
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
              variant={selectedRole === "devops" ? "default" : "outline"}
              onClick={() => setSelectedRole("devops")}
              size="sm"
            >
              개발운영사
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
              승인대기
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
                          {String(getDisplayUserName(user) || "?")[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium truncate max-w-[180px]">
                            {getDisplayUserName(user)}
                          </h3>
                          <Badge variant={getRoleBadgeVariant(user.role)}>
                            {getRoleLabel(user.role)}
                          </Badge>
                          {getSubRoleBadge(user)}
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
                        <p className="text-xs text-muted-foreground truncate">
                          {user.businessInfo?.name || user.companyName || "-"}
                        </p>
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
                            handleUserAction(
                              "상세보기",
                              user.id,
                              getDisplayUserName(user),
                            )
                          }
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          상세보기
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteTarget(user)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          사업자 포함 계정 삭제
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
                              handleUserAction(
                                "승인",
                                user.id,
                                getDisplayUserName(user),
                              )
                            }
                          >
                            승인
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() =>
                              handleUserAction(
                                "거절",
                                user.id,
                                getDisplayUserName(user),
                              )
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
                              getDisplayUserName(user),
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

        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="w-[min(1440px,calc(100vw-1.5rem))] max-w-none max-h-[92vh] overflow-hidden p-0">
            <div className="flex max-h-[90vh] flex-col overflow-hidden">
              <DialogHeader className="border-b px-6 py-5">
                <DialogTitle className="text-lg">사용자 상세</DialogTitle>
              </DialogHeader>

              {loadingDetail || !selectedUser ? (
                <div className="px-6 py-8 text-sm text-muted-foreground">
                  불러오는 중...
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto px-6 py-5">
                  <div className="space-y-5">
                    <Card className="border-slate-200/80 shadow-sm">
                      <CardContent className="p-4 md:p-5">
                        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                          <div className="space-y-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-2xl font-semibold tracking-tight">
                                {getDisplayUserName(selectedUser)}
                              </div>
                              <Badge
                                variant={getRoleBadgeVariant(selectedUser.role)}
                              >
                                {getRoleLabel(selectedUser.role)}
                              </Badge>
                              {getStatusBadge(selectedUser.status)}
                              {selectedUser.unresolvedBusiness && (
                                <Badge className="bg-amber-100 text-amber-700 border-amber-200">
                                  사업자 확인 필요
                                </Badge>
                              )}
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2 text-sm">
                              <div className="rounded-lg border bg-slate-50/70 p-3">
                                <div className="text-xs text-muted-foreground">
                                  계정명
                                </div>
                                <div className="mt-1 font-medium">
                                  {selectedUser.name || "-"}
                                </div>
                              </div>
                              <div className="rounded-lg border bg-slate-50/70 p-3">
                                <div className="text-xs text-muted-foreground">
                                  이메일
                                </div>
                                <div className="mt-1 break-all font-medium">
                                  {selectedUser.email || "-"}
                                </div>
                              </div>
                              <div className="rounded-lg border bg-slate-50/70 p-3">
                                <div className="text-xs text-muted-foreground">
                                  원본 이메일
                                </div>
                                <div className="mt-1 break-all font-medium">
                                  {selectedUser.originalEmail || "-"}
                                </div>
                              </div>
                              <div className="rounded-lg border bg-slate-50/70 p-3">
                                <div className="text-xs text-muted-foreground">
                                  사업자명
                                </div>
                                <div className="mt-1 font-medium">
                                  {selectedUser.businessInfo?.metadata
                                    ?.companyName ||
                                    selectedUser.businessInfo?.name ||
                                    selectedUser.companyName ||
                                    "-"}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-lg border bg-white p-4">
                            <div className="grid grid-cols-2 gap-3 text-sm">
                              <div className="rounded-lg bg-muted/40 p-3">
                                <div className="text-xs text-muted-foreground">
                                  상태
                                </div>
                                <div className="mt-1 font-medium">
                                  {getStatusBadge(selectedUser.status)}
                                </div>
                              </div>
                              <div className="rounded-lg bg-muted/40 p-3">
                                <div className="text-xs text-muted-foreground">
                                  사업자 상태
                                </div>
                                <div className="mt-1 font-medium">
                                  {selectedUser.unresolvedBusiness ? (
                                    <Badge className="bg-amber-100 text-amber-700 border-amber-200">
                                      확인 필요
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline">정상</Badge>
                                  )}
                                </div>
                              </div>
                              <div className="rounded-lg bg-muted/40 p-3">
                                <div className="text-xs text-muted-foreground">
                                  등록일
                                </div>
                                <div className="mt-1 font-medium">
                                  {selectedUser.joinDate || "-"}
                                </div>
                              </div>
                              <div className="rounded-lg bg-muted/40 p-3">
                                <div className="text-xs text-muted-foreground">
                                  마지막 로그인
                                </div>
                                <div className="mt-1 font-medium">
                                  {selectedUser.lastLogin || "-"}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
                      <Card className="border-slate-200/80 shadow-sm">
                        <CardHeader className="pb-4">
                          <CardTitle className="text-sm">
                            사업자등록증
                          </CardTitle>
                          <CardDescription>
                            업로드된 이미지를 크게 확인할 수 있습니다.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {licenseLoading && (
                            <div className="flex min-h-[460px] items-center justify-center rounded-lg border bg-muted/20 text-sm text-muted-foreground">
                              불러오는 중...
                            </div>
                          )}
                          {!licenseLoading && licenseUrl && (
                            <>
                              <div className="overflow-hidden rounded-lg border bg-white">
                                <img
                                  src={licenseUrl}
                                  alt="사업자등록증"
                                  className="h-[460px] w-full object-contain"
                                />
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full"
                                asChild
                              >
                                <a
                                  href={licenseUrl}
                                  download={`사업자등록증_${selectedUser?.businessInfo?.metadata?.companyName || selectedUser?.name || "download"}.jpg`}
                                >
                                  <Download className="mr-2 h-4 w-4" />
                                  다운로드
                                </a>
                              </Button>
                            </>
                          )}
                          {!licenseLoading && !licenseUrl && (
                            <div className="flex min-h-[460px] items-center justify-center rounded-lg border bg-muted/20 text-sm text-muted-foreground">
                              등록된 사업자등록증이 없습니다.
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      <Card className="border-slate-200/80 shadow-sm">
                        <CardHeader className="pb-4">
                          <CardTitle className="text-sm">
                            추출된 사업자 정보
                          </CardTitle>
                          <CardDescription>
                            사업자등록증에서 읽은 정보를 확인합니다.
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          {selectedUser.businessInfo ? (
                            <div className="grid gap-3 sm:grid-cols-2">
                              {[
                                [
                                  "사업자명",
                                  selectedUser.businessInfo.metadata
                                    ?.companyName || "-",
                                ],
                                [
                                  "대표자",
                                  selectedUser.businessInfo.metadata
                                    ?.representativeName || "-",
                                ],
                                [
                                  "사업자번호",
                                  selectedUser.businessInfo.metadata
                                    ?.businessNumber || "-",
                                ],
                                [
                                  "주소",
                                  selectedUser.businessInfo.metadata?.address ||
                                    "-",
                                ],
                                [
                                  "전화번호",
                                  selectedUser.businessInfo.metadata
                                    ?.phoneNumber || "-",
                                ],
                                [
                                  "이메일",
                                  selectedUser.businessInfo.metadata?.email ||
                                    "-",
                                ],
                                [
                                  "업태/업종",
                                  `${selectedUser.businessInfo.metadata?.businessType || "-"}${selectedUser.businessInfo.metadata?.businessItem ? ` / ${selectedUser.businessInfo.metadata?.businessItem}` : ""}`,
                                ],
                                [
                                  "개업일",
                                  selectedUser.businessInfo.metadata
                                    ?.startDate || "-",
                                ],
                              ].map(([label, value]) => (
                                <div
                                  key={label}
                                  className="rounded-lg border bg-slate-50/70 p-3"
                                >
                                  <div className="text-xs text-muted-foreground">
                                    {label}
                                  </div>
                                  <div className="mt-1 break-words text-sm font-medium text-foreground">
                                    {value}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="rounded-lg border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">
                              추출된 정보가 없습니다.
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>

                    <div className="flex flex-wrap gap-2 justify-end pb-1">
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
                        {selectedUser.status === "active"
                          ? "비활성화"
                          : "활성화"}
                      </Button>

                      <Select
                        value={selectedUser.role}
                        onValueChange={async (v) => {
                          if (!selectedUser) return;
                          const ok = await changeUserRole(selectedUser.id, v);
                          if (!ok) return;
                          toast({
                            title: "역할 변경 완료",
                            description: `${getDisplayUserName(selectedUser)}님의 역할이 변경되었습니다.`,
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
                          <SelectItem value="devops">개발운영사</SelectItem>
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
                            fetchUserDetail(
                              String(selectedUser.replacedByUserId),
                            )
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
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={deletingUser}
                        onClick={() => setDeleteTarget(selectedUser)}
                      >
                        사업자 포함 계정 삭제
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
        <AlertDialog
          open={Boolean(deleteTarget)}
          onOpenChange={(open) => {
            if (!open && !deletingUser) {
              setDeleteTarget(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                사업자 포함 계정을 삭제할까요?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget
                  ? getDisplayUserName(deleteTarget)
                  : "선택한 사용자"}{" "}
                계정과 연결된 사업자, 그리고 안전 조건을 만족하는 경우 business
                anchor까지 함께 삭제합니다. 다른 계정이나 하위 참조가 남아
                있으면 삭제가 거부됩니다.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deletingUser}>
                취소
              </AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async (event) => {
                  event.preventDefault();
                  if (!deleteTarget || deletingUser) return;
                  await deleteUserWithBusiness(deleteTarget);
                }}
              >
                {deletingUser ? "삭제 중..." : "삭제"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

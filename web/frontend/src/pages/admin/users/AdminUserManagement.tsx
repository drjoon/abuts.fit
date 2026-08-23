// related files:
// - web/frontend/rules.md
// - web/backend/controllers/admin/admin.users.controller.js
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
// change-log:
// - 2026-08-19: 치과 멤버십 폐지. 사용자 상세 멤버십 on/off 제거.
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
  REQUESTOR_SERVICE_LABEL,
  getRequestorRoleBadgeLabel,
  legacyCapabilitiesFromProfile,
  normalizeRequestorCapabilities,
  normalizeRequestorKind,
  normalizeRequestorServices,
  resolveRequestorProfile,
} from "@/shared/business/requestorCapabilities";
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
  FlaskConical,
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
import { getAppUserRoleLabel } from "@/shared/types/role";

const normalizeRole = (rawRole?: string) => {
  const normalized = String(rawRole || "")
    .trim()
    .toLowerCase();

  if (!normalized) return "";
  if (normalized === "requester") return "requestor";
  // 레거시 치과(practice) → 의뢰자로 통합
  if (normalized.startsWith("practice")) return "requestor";
  if (normalized.startsWith("requestor")) return "requestor";
  if (normalized.startsWith("manufacturer")) return "manufacturer";
  if (normalized === "internallab" || normalized.startsWith("internal_lab")) {
    return "internalLab";
  }
  if (normalized.startsWith("salesman")) return "salesman";
  if (normalized.startsWith("devops")) return "devops";
  if (normalized === "labteam" || normalized.startsWith("lab_team")) {
    return "labTeam";
  }
  if (normalized === "salesteam" || normalized.startsWith("sales_team")) {
    return "salesTeam";
  }
  if (normalized.startsWith("admin")) return "admin";
  return normalized;
};

const getRoleLabel = (role: string) =>
  getAppUserRoleLabel(normalizeRole(role) || role);

const resolveUserRequestorKind = (
  user: Pick<
    UiUserRow,
    "requestorKind" | "requestorCapabilities"
  >,
) =>
  user.requestorKind ||
  (user.requestorCapabilities?.practice
    ? "practice"
    : user.requestorCapabilities?.lab
      ? "lab"
      : null);

const getRoleBadgeLabel = (
  user: Pick<
    UiUserRow,
    "role" | "requestorKind" | "requestorCapabilities"
  >,
) => {
  if (normalizeRole(user.role) !== "requestor") {
    return getRoleLabel(user.role);
  }
  return getRequestorRoleBadgeLabel(resolveUserRequestorKind(user));
};

const getRoleBadgeVariant = (role: string) => {
  switch (normalizeRole(role)) {
    case "requestor":
      return "default";
    case "salesman":
      return "secondary";
    case "devops":
      return "secondary";
    case "manufacturer":
      return "secondary";
    case "internalLab":
      return "secondary";
    case "labTeam":
      return "secondary";
    case "salesTeam":
      return "secondary";
    case "admin":
      return "destructive";
    default:
      return "outline";
  }
};

const getRequestorSalesmanSwapRole = (role: string) => {
  const normalized = normalizeRole(role);
  if (normalized === "requestor") return "salesman";
  if (normalized === "salesman") return "requestor";
  return null;
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
  requestorKind?: "practice" | "lab" | null;
  requestorServices?: {
    free?: boolean;
    paid?: boolean;
  } | null;
  requestorCapabilities?: {
    practice?: boolean;
    lab?: boolean;
  } | null;
  businessInfo?: {
    name?: string;
    requestorKind?: "practice" | "lab" | null;
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
  requestorKind?: "practice" | "lab" | null;
  requestorServices?: {
    free: boolean;
    paid: boolean;
  } | null;
  requestorCapabilities?: {
    practice: boolean;
    lab: boolean;
  } | null;
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

// SSOT: metadata 우선, extracted는 레거시 호환용 fallback
const getDisplayUserName = (user: Pick<UiUserRow, "name" | "businessInfo">) => {
  const representativeName =
    String(user.businessInfo?.metadata?.representativeName || "").trim() ||
    String(user.businessInfo?.extracted?.representativeName || "").trim();
  const accountName = String(user.name || "").trim();
  return representativeName || accountName || "-";
};

const getDisplayEmail = (
  user: Pick<UiUserRow, "email" | "originalEmail">,
) => {
  const original = String(user.originalEmail || "").trim();
  if (original) return original;
  const email = String(user.email || "").trim();
  if (!email) return "";
  // 삭제 마스킹된 이메일은 목록에서 숨김
  if (/^deleted\+/i.test(email)) return "";
  return email;
};

const getDisplayCompany = (
  user: Pick<UiUserRow, "companyName" | "businessInfo" | "name">,
) => {
  const company = String(
    user.businessInfo?.name || user.companyName || "",
  ).trim();
  if (!company || company === "-") return "";
  const displayName = getDisplayUserName(user);
  if (company === displayName) return "";
  return company;
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
  const profile = resolveRequestorProfile({
    anchorKind: u.businessInfo?.requestorKind,
    userKind: u.requestorKind,
    userServices: u.requestorServices,
    userCaps: u.requestorCapabilities,
    userRole: u.role,
    businessVerified: Boolean(u.businessInfo?.verification?.verified),
  });
  const kind = normalizeRequestorKind(profile.kind);
  const services = normalizeRequestorServices(profile.services);
  const hasProfile = Boolean(kind) && services.paid;
  const normalizedCaps = hasProfile
    ? legacyCapabilitiesFromProfile(profile)
    : u.requestorCapabilities
      ? normalizeRequestorCapabilities(u.requestorCapabilities)
      : null;
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
    requestorKind: kind,
    requestorServices: hasProfile ? services : null,
    requestorCapabilities: normalizedCaps,
    businessInfo: u.businessInfo || null,
    unresolvedBusiness: Boolean(u.unresolvedBusiness),
  };
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case "active":
      return (
        <span className="rounded-md border border-primary-muted bg-primary-soft px-1.5 py-0.5 text-[10px] font-semibold text-primary-strong">
          활성
        </span>
      );
    case "pending":
      return (
        <span className="rounded-md border border-accent-muted bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent-strong">
          승인대기
        </span>
      );
    case "inactive":
      return (
        <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
          비활성
        </span>
      );
    case "suspended":
      return (
        <span className="rounded-md border border-destructive-muted bg-destructive-soft px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
          일시정지
        </span>
      );
    default:
      return (
        <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
          {status}
        </span>
      );
  }
};

const getSubRoleBadge = (user: Pick<UiUserRow, "subRole">) => {
  const { subRole } = user;

  if (!subRole) return null;

  if (subRole === "owner") {
    return (
      <span className="rounded-md border border-primary-muted bg-primary-soft px-1.5 py-0.5 text-[10px] font-semibold text-primary-strong">
        대표
      </span>
    );
  }

  if (subRole === "staff") {
    return (
      <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
        직원
      </span>
    );
  }

  return null;
};

const getRequestorCapabilityBadges = (
  user: Pick<
    UiUserRow,
    "role" | "requestorKind" | "requestorServices" | "requestorCapabilities"
  >,
) => {
  if (normalizeRole(user.role) !== "requestor") return null;
  const services = user.requestorServices;
  if (!services?.paid) return null;
  return (
    <span className="rounded-md border border-accent-muted bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent-strong">
      {REQUESTOR_SERVICE_LABEL.paid}
    </span>
  );
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
  const [deleteType, setDeleteType] = useState<"user-only" | "with-business">(
    "with-business",
  );
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

  const deleteUserOnly = useCallback(
    async (targetUser: UiUserRow) => {
      if (!token) return false;
      setDeletingUser(true);
      try {
        const res = await request<any>({
          path: `/api/admin/users/${encodeURIComponent(targetUser.id)}`,
          method: "DELETE",
          token,
        });
        if (!res.ok || !res.data?.success) {
          toast({
            title: "사용자 삭제 실패",
            description:
              res.data?.message ||
              res.data?.error ||
              "잠시 후 다시 시도해주세요.",
            variant: "destructive",
          });
          return false;
        }
        toast({
          title: "사용자 삭제 완료",
          description: `${getDisplayUserName(targetUser)} 계정을 삭제했습니다. (사업자는 유지됨)`,
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
      const matchesRole =
        selectedRole === "all" ||
        normalizeRole(user.role) === normalizeRole(selectedRole);
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

  const swapRequestorSalesmanRole = useCallback(
    async (targetUser: UiUserRow) => {
      const nextRole = getRequestorSalesmanSwapRole(targetUser.role);
      if (!nextRole) {
        toast({
          title: "역할 변경 불가",
          description: "의뢰자/딜러 계정만 서로 전환할 수 있습니다.",
          variant: "destructive",
        });
        return;
      }

      const ok = await changeUserRole(targetUser.id, nextRole);
      if (!ok) return;

      toast({
        title: "역할 변경 완료",
        description: `${getDisplayUserName(targetUser)}님의 역할이 ${getRoleLabel(nextRole)}로 변경되었습니다.`,
      });

      await fetchUsers();
      if (selectedUserId === targetUser.id) {
        await fetchUserDetail(targetUser.id);
      }
    },
    [changeUserRole, fetchUserDetail, fetchUsers, selectedUserId, toast],
  );

  const totalUsers = totalCount || sourceUsers.length;
  const totalRequestor = sourceUsers.filter(
    (u) => normalizeRole(u.role) === "requestor",
  ).length;
  const totalSalesman = sourceUsers.filter(
    (u) => normalizeRole(u.role) === "salesman",
  ).length;
  const totalDevops = sourceUsers.filter(
    (u) => normalizeRole(u.role) === "devops",
  ).length;
  const totalManufacturer = sourceUsers.filter(
    (u) => normalizeRole(u.role) === "manufacturer",
  ).length;
  const totalInternalLab = sourceUsers.filter(
    (u) => normalizeRole(u.role) === "internalLab",
  ).length;
  const totalAdmin = sourceUsers.filter(
    (u) => normalizeRole(u.role) === "admin",
  ).length;
  const totalPending = sourceUsers.filter((u) => u.status === "pending").length;
  const unresolvedUsers = sourceUsers.filter((u) => u.unresolvedBusiness);

  const statsCards = [
    {
      key: "all",
      label: "총 사용자",
      count: totalUsers,
      icon: Users,
      iconWrap: "bg-slate-100",
      iconClass: "text-slate-600",
      onClick: () => {
        setSelectedRole("all");
        setSelectedStatus("all");
      },
      active: selectedRole === "all" && selectedStatus === "all",
    },
    {
      key: "requestor",
      label: "의뢰자",
      count: totalRequestor,
      icon: FileText,
      iconWrap: "bg-primary-soft",
      iconClass: "text-primary-strong",
      onClick: () => setSelectedRole("requestor"),
      active: selectedRole === "requestor",
    },
    {
      key: "salesman",
      label: getAppUserRoleLabel("salesman"),
      count: totalSalesman,
      icon: Briefcase,
      iconWrap: "bg-primary-soft",
      iconClass: "text-primary-strong",
      onClick: () => setSelectedRole("salesman"),
      active: selectedRole === "salesman",
    },
    {
      key: "devops",
      label: "개발운영사",
      count: totalDevops,
      icon: Shield,
      iconWrap: "bg-primary-soft",
      iconClass: "text-primary-strong",
      onClick: () => setSelectedRole("devops"),
      active: selectedRole === "devops",
    },
    {
      key: "manufacturer",
      label: "제조사",
      count: totalManufacturer,
      icon: Building2,
      iconWrap: "bg-primary-soft",
      iconClass: "text-primary-strong",
      onClick: () => setSelectedRole("manufacturer"),
      active: selectedRole === "manufacturer",
    },
    {
      key: "internalLab",
      label: "어벗츠기공소",
      count: totalInternalLab,
      icon: FlaskConical,
      iconWrap: "bg-primary-soft",
      iconClass: "text-primary-strong",
      onClick: () => setSelectedRole("internalLab"),
      active: selectedRole === "internalLab",
    },
    {
      key: "admin",
      label: "관리자",
      count: totalAdmin,
      icon: Shield,
      iconWrap: "bg-destructive-soft",
      iconClass: "text-destructive",
      onClick: () => setSelectedRole("admin"),
      active: selectedRole === "admin",
    },
    {
      key: "pending",
      label: "승인 대기",
      count: totalPending,
      icon: UserCheck,
      iconWrap: "bg-accent-soft",
      iconClass: "text-accent-strong",
      onClick: () => setSelectedStatus("pending"),
      active: selectedStatus === "pending",
    },
  ] as const;

  const roleFilters = [
    ["all", "전체"],
    ["requestor", "의뢰자"],
    ["salesman", getAppUserRoleLabel("salesman")],
    ["devops", "개발운영사"],
    ["manufacturer", "제조사"],
    ["internalLab", "어벗츠기공소"],
    ["admin", "관리자"],
    ["labTeam", "기공팀"],
    ["salesTeam", "영업팀"],
  ] as const;

  const statusFilters = [
    ["all", "전체 상태"],
    ["active", "활성"],
    ["pending", "승인대기"],
  ] as const;

  return (
    <div className="flex h-full min-h-0 flex-col px-2 pt-4 pb-2 sm:px-5 sm:pt-4">
      <div className="mx-auto flex w-full max-w-7xl flex-1 min-h-0 flex-col gap-4 overflow-y-auto">
        <div className="grid grid-cols-2 gap-2.5 p-0.5 md:grid-cols-4 xl:grid-cols-7">
          {statsCards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.key}
                type="button"
                onClick={card.onClick}
                className={`rounded-xl border bg-white px-3.5 py-3 text-left shadow-sm transition-colors ${
                  card.active
                    ? "border-slate-900 ring-1 ring-slate-900"
                    : "border-slate-200/80 hover:border-slate-300 hover:bg-slate-50/60"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`rounded-lg p-2 ${card.iconWrap}`}>
                    <Icon className={`h-4 w-4 ${card.iconClass}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-slate-500">
                      {card.label}
                    </p>
                    <p className="text-xl font-bold tabular-nums tracking-tight text-slate-900">
                      {card.count.toLocaleString()}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {unresolvedUsers.length > 0 && (
          <div className="rounded-2xl border border-accent-muted/80 bg-accent-soft/60 px-5 py-4 shadow-sm sm:px-6">
            <div className="mb-3">
              <h2 className="text-sm font-bold tracking-tight text-slate-900">
                사업자 정보 확인 필요
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                사업자등록증 검증이 미처리된 사용자입니다.
              </p>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {unresolvedUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-accent-muted/80 bg-white px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">
                      {getDisplayUserName(user)}
                    </div>
                    <div className="truncate text-[11px] text-slate-500">
                      {getDisplayCompany(user) || "사업장 미등록"}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 border-slate-200 text-xs"
                    onClick={() => fetchUserDetail(user.id)}
                  >
                    상세
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pl-1.5 pr-0.5 sm:pl-2">
          <div className="relative min-w-0 w-full flex-1 sm:min-w-[160px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="사용자 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 rounded-lg border-slate-200 bg-white pl-9 text-sm shadow-sm"
            />
          </div>
          <div className="inline-flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
            {roleFilters.map(([value, label]) => {
              const active = selectedRole === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSelectedRole(value)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="inline-flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
            {statusFilters.map(([value, label]) => {
              const active = selectedStatus === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSelectedStatus(value)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                    active
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex shrink-0 items-baseline justify-between gap-3 border-b border-slate-100 px-5 py-3.5 sm:px-6">
            <h2 className="text-sm font-bold tracking-tight text-slate-900">
              사용자 목록
            </h2>
            <p className="text-xs text-slate-500">
              총 {filteredUsers.length.toLocaleString()}명
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            {loadingUsers && (
              <div className="pb-3 text-sm text-slate-500">불러오는 중...</div>
            )}
            {filteredUsers.length === 0 && !loadingUsers ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-4 py-16 text-center">
                <Users className="mb-2 h-5 w-5 text-slate-300" />
                <p className="text-sm font-medium text-slate-600">
                  조건에 맞는 사용자가 없습니다
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  역할·상태 필터 또는 검색어를 바꿔 보세요
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                {filteredUsers.map((user) => {
                  const displayEmail = getDisplayEmail(user);
                  const displayCompany = getDisplayCompany(user);
                  const displayName = getDisplayUserName(user);
                  const requestCount =
                    typeof user.totalRequests === "number"
                      ? user.totalRequests
                      : null;

                  return (
                    <div
                      key={user.id}
                      className={`rounded-xl border bg-white px-3 py-2.5 shadow-sm transition-colors hover:border-slate-300 ${
                        user.unresolvedBusiness
                          ? "border-accent-muted bg-accent-soft/30"
                          : "border-slate-200/80"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        <Avatar className="h-9 w-9 shrink-0">
                          <AvatarFallback className="bg-slate-100 text-sm font-semibold text-slate-600">
                            {String(displayName || "?")[0]}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                              <h3 className="min-w-0 truncate text-sm font-semibold text-slate-900">
                                {displayName}
                              </h3>
                              {getSubRoleBadge(user)}
                              {displayCompany ? (
                                <span className="min-w-0 truncate text-sm font-medium text-slate-500">
                                  · {displayCompany}
                                </span>
                              ) : null}
                              {getStatusBadge(user.status)}
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleUserAction(
                                      "상세보기",
                                      user.id,
                                      displayName,
                                    )
                                  }
                                >
                                  <Eye className="mr-2 h-4 w-4" />
                                  상세보기
                                </DropdownMenuItem>
                                {user.status === "pending" ? (
                                  <>
                                    <DropdownMenuItem
                                      onClick={() =>
                                        handleUserAction(
                                          "승인",
                                          user.id,
                                          displayName,
                                        )
                                      }
                                    >
                                      <UserCheck className="mr-2 h-4 w-4" />
                                      승인
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={() =>
                                        handleUserAction(
                                          "거절",
                                          user.id,
                                          displayName,
                                        )
                                      }
                                    >
                                      <UserX className="mr-2 h-4 w-4" />
                                      거절
                                    </DropdownMenuItem>
                                  </>
                                ) : (
                                  <DropdownMenuItem
                                    onClick={() =>
                                      handleUserAction(
                                        user.status === "active"
                                          ? "일시정지"
                                          : "활성화",
                                        user.id,
                                        displayName,
                                      )
                                    }
                                  >
                                    {user.status === "active" ? (
                                      <UserX className="mr-2 h-4 w-4" />
                                    ) : (
                                      <UserCheck className="mr-2 h-4 w-4" />
                                    )}
                                    {user.status === "active"
                                      ? "비활성화"
                                      : "활성화"}
                                  </DropdownMenuItem>
                                )}
                                {getRequestorSalesmanSwapRole(user.role) && (
                                  <DropdownMenuItem
                                    onClick={() => {
                                      void swapRequestorSalesmanRole(user);
                                    }}
                                  >
                                    <UserCheck className="mr-2 h-4 w-4" />
                                    {getRoleLabel(
                                      getRequestorSalesmanSwapRole(user.role) ||
                                        "",
                                    )}
                                    로 변경
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => {
                                    setDeleteTarget(user);
                                    setDeleteType("user-only");
                                  }}
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  사용자만 삭제
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>

                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            <Badge
                              variant={getRoleBadgeVariant(user.role)}
                              className="h-5 px-1.5 text-[10px]"
                            >
                              {getRoleBadgeLabel(user)}
                            </Badge>
                            {getRequestorCapabilityBadges(user)}
                            {user.unresolvedBusiness ? (
                              <span className="rounded-md border border-accent-muted bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-accent-strong">
                                사업자 확인
                              </span>
                            ) : null}
                            <span className="text-[11px] tabular-nums text-slate-400">
                              · 의뢰{" "}
                              {requestCount == null
                                ? "-"
                                : requestCount.toLocaleString()}
                            </span>
                          </div>

                          {displayEmail ? (
                            <p className="mt-1 truncate text-[11px] text-slate-400">
                              {displayEmail}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div ref={loadMoreRef} className="h-8" />
            {loadingMore && (
              <div className="pt-2 text-sm text-slate-500">
                추가 사용자 불러오는 중...
              </div>
            )}
          </div>
        </div>

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
                            {/* <div className="flex flex-wrap items-center gap-2">
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
                                <Badge className="bg-accent-soft text-accent-strong border-accent-muted">
                                  사업자 확인 필요
                                </Badge>
                              )}
                            </div> */}
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
                                    <Badge className="bg-accent-soft text-accent-strong border-accent-muted">
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

                      {getRequestorSalesmanSwapRole(selectedUser.role) && (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={loadingDetail}
                          onClick={() => {
                            void swapRequestorSalesmanRole(selectedUser);
                          }}
                        >
                          {getRoleLabel(
                            getRequestorSalesmanSwapRole(selectedUser.role) ||
                              "",
                          )}
                          로 변경
                        </Button>
                      )}

                      <Select
                        value={normalizeRole(selectedUser.role) || selectedUser.role}
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
                          <SelectItem value="salesman">{getAppUserRoleLabel("salesman")}</SelectItem>
                          <SelectItem value="devops">개발운영사</SelectItem>
                          <SelectItem value="manufacturer">제조사</SelectItem>
                          <SelectItem value="internalLab">어벗츠기공소</SelectItem>
                          <SelectItem value="admin">관리자</SelectItem>
                          <SelectItem value="labTeam">기공팀</SelectItem>
                          <SelectItem value="salesTeam">영업팀</SelectItem>
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
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        disabled={deletingUser}
                        onClick={() => {
                          setDeleteTarget(selectedUser);
                          setDeleteType("user-only");
                        }}
                      >
                        사용자만 삭제
                      </Button>
                      {/* <Button
                        type="button"
                        variant="destructive"
                        disabled={deletingUser}
                        onClick={() => {
                          setDeleteTarget(selectedUser);
                          setDeleteType("with-business");
                        }}
                      >
                        사업자 포함 계정 삭제
                      </Button> */}
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
                {deleteType === "user-only"
                  ? "사용자만 삭제할까요?"
                  : "사업자 포함 계정을 삭제할까요?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {deleteType === "user-only" ? (
                  <>
                    {deleteTarget
                      ? getDisplayUserName(deleteTarget)
                      : "선택한 사용자"}{" "}
                    계정만 삭제합니다. 연결된 사업자는 유지되며, 다른 계정이
                    해당 사업자를 계속 사용할 수 있습니다.
                  </>
                ) : (
                  <>
                    {deleteTarget
                      ? getDisplayUserName(deleteTarget)
                      : "선택한 사용자"}{" "}
                    계정과 연결된 사업자, 그리고 안전 조건을 만족하는 경우
                    business anchor까지 함께 삭제합니다. 다른 계정이나 하위
                    참조가 남아 있으면 삭제가 거부됩니다.
                  </>
                )}
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
                  if (deleteType === "user-only") {
                    await deleteUserOnly(deleteTarget);
                  } else {
                    await deleteUserWithBusiness(deleteTarget);
                  }
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

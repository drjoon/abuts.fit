// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { resolveBusinessType, BUSINESS_ALLOWED_ROLES } from "@/shared/utils/resolveBusinessType";
import { Building2, Loader2, Pencil, Plus, Trash2, UserPlus, Users } from "lucide-react";
import { BusinessSearchSection } from "@/shared/components/business/settings/business/BusinessSearchSection";
import { JoinRequestsSection } from "@/shared/components/business/settings/business/JoinRequestsSection";
import { useBusinessSearch } from "@/shared/components/business/settings/business/useBusinessSearch";
import { useMembershipManagement } from "@/shared/components/business/settings/business/useMembershipManagement";
import {
  handleJoinOrLeave,
  handleJoinRequest as handleJoinRequestImpl,
} from "@/shared/components/business/settings/business/handlers";
import {
  loginIdDisplay,
  StaffBulkRegisterDialog,
  StaffPasswordResetDialog,
} from "@/features/settings/tabs/StaffBulkRegisterDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type StaffMember = {
  _id: string;
  name?: string;
  email?: string;
  loginId?: string;
  internalDepartmentId?: string | null;
  departmentName?: string;
};

function memberLoginLabel(member: { email?: string; loginId?: string }) {
  const loginId = String(member.loginId || "").trim();
  if (loginId) return loginId;
  const email = String(member.email || "").trim();
  if (email.toLowerCase().endsWith("@staff.abuts.fit")) return "";
  return email;
}

function memberConfirmLabel(member: { _id: string; name?: string; email?: string; loginId?: string }) {
  const name = String(member.name || "").trim() || member._id;
  const login = memberLoginLabel(member);
  return login && login !== name ? `${name} (${login})` : name;
}

type DepartmentOption = {
  _id: string;
  name: string;
  sortOrder?: number;
};

type DirectoryMember = StaffMember & {
  kind: "representative" | "staff";
};

interface StaffTabProps {
  userData: {
    companyName?: string;
    role?: string;
    email?: string;
    name?: string;
  } | null;
  businessTypeOverride?: string;
}

export const StaffTab = ({ userData, businessTypeOverride }: StaffTabProps) => {
  const { toast } = useToast();
  const { token, user } = useAuthStore();

  const isDeletedAccount = useCallback((value?: string) => {
    const v = String(value || "")
      .trim()
      .toLowerCase();
    if (!v) return false;
    const compact = v.replace(/\s+/g, "");
    return (
      compact.startsWith("delete+") ||
      compact.includes("delete+") ||
      compact.includes("delete%2b")
    );
  }, []);

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [representatives, setRepresentatives] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionUserId, setActionUserId] = useState<string>("");
  const [usesDepartments, setUsesDepartments] = useState(false);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [creatingDepartment, setCreatingDepartment] = useState(false);
  const [editingDepartmentId, setEditingDepartmentId] = useState("");
  const [editingDepartmentName, setEditingDepartmentName] = useState("");
  const [savingDepartmentId, setSavingDepartmentId] = useState("");
  const [deletingDepartmentId, setDeletingDepartmentId] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [resetStaff, setResetStaff] = useState<StaffMember | null>(null);
  const [removeStaff, setRemoveStaff] = useState<DirectoryMember | null>(null);
  const [removeDepartment, setRemoveDepartment] = useState<DepartmentOption | null>(null);

  const mockHeaders = useMemo(() => {
    return {} as Record<string, string>;
  }, []);

  const businessType = useMemo(() => {
    if (businessTypeOverride) return businessTypeOverride;
    return resolveBusinessType(user?.role || userData?.role, "requestor");
  }, [businessTypeOverride, user?.role, userData?.role]);

  const supportsDepartments = (BUSINESS_ALLOWED_ROLES as readonly string[]).includes(
    businessType,
  );

  const membershipMgmt = useMembershipManagement({
    token,
    businessType,
  });
  const membership = membershipMgmt.membership;
  const canManage = membership === "owner" || membership === "member";
  const showDirectory = membership === "owner" || membership === "member";

  const businessSearch = useBusinessSearch({
    token,
    businessType,
    membership,
  });

  const sortedDepartments = useMemo(() => {
    return [...departments].sort((a, b) => {
      const orderDiff = Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0);
      if (orderDiff !== 0) return orderDiff;
      return String(a.name).localeCompare(String(b.name), "ko");
    });
  }, [departments]);

  const refreshRepresentatives = useCallback(async () => {
    if (!token) return;
    const res = await request<any>({
      path: `/api/businesses/owners?businessType=${encodeURIComponent(
        businessType,
      )}`,
      method: "GET",
      token,
      headers: mockHeaders,
    });
    if (!res.ok) {
      setRepresentatives([]);
      return;
    }
    const body: any = res.data || {};
    const data = body.data || body;

    if (Array.isArray(data?.representatives)) {
      setRepresentatives(
        data.representatives
          .filter((r: any) => Boolean(r && r._id))
          .map((r: any) => ({
            _id: String(r._id),
            name: r.name,
            email: r.email,
            loginId: r.loginId ? String(r.loginId) : "",
            internalDepartmentId: r.internalDepartmentId
              ? String(r.internalDepartmentId)
              : null,
            departmentName: r.departmentName ? String(r.departmentName) : "",
          })),
      );
      setUsesDepartments(Boolean(data?.usesDepartments));
      return;
    }
    setRepresentatives([]);
  }, [mockHeaders, businessType, token]);

  const refreshDepartments = useCallback(async () => {
    if (!token || !supportsDepartments) {
      setDepartments([]);
      return;
    }
    const res = await request<any>({
      path: `/api/businesses/departments?businessType=${encodeURIComponent(
        businessType,
      )}`,
      method: "GET",
      token,
      headers: mockHeaders,
    });
    if (!res.ok) {
      setDepartments([]);
      return;
    }
    const body: any = res.data || {};
    const data = body.data || body;
    setDepartments(
      Array.isArray(data?.departments)
        ? data.departments.map((row: any) => ({
            _id: String(row._id),
            name: String(row.name || ""),
            sortOrder: Number(row.sortOrder ?? 0),
          }))
        : [],
    );
    setUsesDepartments(
      Array.isArray(data?.departments) && data.departments.length > 0,
    );
  }, [businessType, supportsDepartments, mockHeaders, token]);

  const refreshStaff = useCallback(async () => {
    if (!token) return;
    const res = await request<any>({
      path: `/api/businesses/staff?businessType=${encodeURIComponent(
        businessType,
      )}`,
      method: "GET",
      token,
      headers: mockHeaders,
    });
    if (!res.ok) {
      setStaff([]);
      return;
    }
    const body: any = res.data || {};
    const data = body.data || body;
    setStaff(Array.isArray(data?.staffMembers) ? data.staffMembers : []);
    setUsesDepartments(Boolean(data?.usesDepartments));
    if (Array.isArray(data?.departments) && data.departments.length > 0) {
      setDepartments(
        data.departments.map((row: any) => ({
          _id: String(row._id),
          name: String(row.name || ""),
          sortOrder: Number(row.sortOrder ?? 0),
        })),
      );
    }
  }, [mockHeaders, businessType, token]);

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      if (!showDirectory) return;
      setLoading(true);
      try {
        await Promise.all([
          refreshRepresentatives(),
          refreshStaff(),
          refreshDepartments(),
        ]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [
    refreshDepartments,
    showDirectory,
    refreshRepresentatives,
    refreshStaff,
    token,
  ]);

  const handleAssignDepartment = async (
    userId: string,
    departmentId: string,
  ) => {
    try {
      if (!token || !userId) return;
      setActionUserId(userId);
      const res = await request<any>({
        path: `/api/businesses/staff/${userId}/department?businessType=${encodeURIComponent(
          businessType,
        )}`,
        method: "PATCH",
        token,
        jsonBody: { departmentId, businessType },
      });
      if (!res.ok) {
        const message = String((res.data as any)?.message || "").trim();
        toast({
          title: "부서 변경에 실패했어요",
          description: message || "잠시 후 다시 시도해주세요.",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }
      toast({ title: "부서가 변경되었습니다" });
      await Promise.all([refreshStaff(), refreshRepresentatives()]);
    } finally {
      setActionUserId("");
    }
  };

  const renderDepartmentControl = (
    memberId: string,
    currentDepartmentId?: string | null,
    compact = false,
  ) => {
    if (!supportsDepartments || departments.length === 0) return null;
    const value = currentDepartmentId ? String(currentDepartmentId) : "";
    return (
      <Select
        value={value || undefined}
        disabled={actionUserId === memberId}
        onValueChange={(next) => void handleAssignDepartment(memberId, next)}
      >
        <SelectTrigger className={compact ? "h-8 text-xs" : "h-9"}>
          <SelectValue placeholder="부서 선택" />
        </SelectTrigger>
        <SelectContent>
          {sortedDepartments.map((dept) => (
            <SelectItem key={dept._id} value={dept._id}>
              {dept.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  const handleCreateDepartment = async () => {
    const name = newDepartmentName.trim();
    if (!name || !token) return;
    setCreatingDepartment(true);
    try {
      const res = await request<any>({
        path: `/api/businesses/departments?businessType=${encodeURIComponent(
          businessType,
        )}`,
        method: "POST",
        token,
        jsonBody: { name, businessType },
      });
      if (!res.ok) {
        toast({
          title: "부서 추가에 실패했어요",
          description: String((res.data as any)?.message || ""),
          variant: "destructive",
        });
        return;
      }
      setNewDepartmentName("");
      toast({ title: "부서가 추가되었습니다" });
      await Promise.all([
        refreshDepartments(),
        refreshStaff(),
        refreshRepresentatives(),
      ]);
    } finally {
      setCreatingDepartment(false);
    }
  };

  const handleSaveDepartmentEdit = async (departmentId: string) => {
    const name = editingDepartmentName.trim();
    if (!name || !token) return;
    setSavingDepartmentId(departmentId);
    try {
      const res = await request<any>({
        path: `/api/businesses/departments/${departmentId}?businessType=${encodeURIComponent(
          businessType,
        )}`,
        method: "PATCH",
        token,
        jsonBody: { name, businessType },
      });
      if (!res.ok) {
        toast({
          title: "부서 수정에 실패했어요",
          description: String((res.data as any)?.message || ""),
          variant: "destructive",
        });
        return;
      }
      setEditingDepartmentId("");
      setEditingDepartmentName("");
      toast({ title: "부서 이름이 수정되었습니다" });
      await Promise.all([
        refreshDepartments(),
        refreshStaff(),
        refreshRepresentatives(),
      ]);
    } finally {
      setSavingDepartmentId("");
    }
  };

  const handleDeleteDepartment = async (departmentId: string) => {
    if (!token) return;
    setDeletingDepartmentId(departmentId);
    try {
      const res = await request<any>({
        path: `/api/businesses/departments/${departmentId}?businessType=${encodeURIComponent(
          businessType,
        )}`,
        method: "DELETE",
        token,
        jsonBody: { businessType },
      });
      if (!res.ok) {
        toast({
          title: "부서 삭제에 실패했어요",
          description: String((res.data as any)?.message || ""),
          variant: "destructive",
        });
        return;
      }
      toast({ title: "부서가 삭제되었습니다" });
      await Promise.all([
        refreshDepartments(),
        refreshStaff(),
        refreshRepresentatives(),
      ]);
    } finally {
      setDeletingDepartmentId("");
    }
  };

  const handleRemoveStaff = async (userId: string) => {
    try {
      if (!token) return;
      const id = String(userId || "").trim();
      if (!id) return;

      setActionUserId(id);
      const res = await request<any>({
        path: `/api/businesses/staff/${id}?businessType=${encodeURIComponent(
          businessType,
        )}`,
        method: "DELETE",
        token,
      });

      if (!res.ok) {
        const message = String((res.data as any)?.message || "").trim();
        toast({
          title: "직원을 삭제하지 못했어요",
          description: message || "잠시 후 다시 시도해주세요.",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      toast({ title: "직원이 삭제되었습니다" });
      await refreshStaff();
    } finally {
      setActionUserId("");
    }
  };

  const representativeEntries = useMemo(() => {
    return representatives
      .filter((entry) => Boolean(entry && entry._id))
      .filter(
        (entry) =>
          !isDeletedAccount(entry.email) &&
          !isDeletedAccount(entry.name) &&
          !isDeletedAccount(entry._id),
      );
  }, [isDeletedAccount, representatives]);

  const staffEntries = useMemo(() => {
    return staff
      .filter((m) => Boolean(m && m._id))
      .filter(
        (m) =>
          !isDeletedAccount(m.email) &&
          !isDeletedAccount(m.name) &&
          !isDeletedAccount(m._id),
      );
  }, [isDeletedAccount, staff]);

  const registeredMemberCount =
    representativeEntries.length + staffEntries.length;

  // 대표 본인만 등록된 경우(직원·공동대표 없음) 목록에서 숨김
  const visibleRepresentatives = useMemo(() => {
    if (registeredMemberCount === 1 && staffEntries.length === 0) {
      return [];
    }
    return representativeEntries;
  }, [registeredMemberCount, representativeEntries, staffEntries.length]);

  const visibleMemberCount =
    visibleRepresentatives.length + staffEntries.length;

  const directoryMembers = useMemo<DirectoryMember[]>(() => {
    return [
      ...visibleRepresentatives.map((entry) => ({
        ...entry,
        kind: "representative" as const,
      })),
      ...staffEntries.map((entry) => ({
        ...entry,
        kind: "staff" as const,
      })),
    ];
  }, [staffEntries, visibleRepresentatives]);

  const groupedByDepartment =
    supportsDepartments && sortedDepartments.length > 0;

  const looseMembers = useMemo(() => {
    if (!groupedByDepartment) return directoryMembers;
    const ids = new Set(sortedDepartments.map((row) => row._id));
    return directoryMembers.filter((member) => {
      const id = String(member.internalDepartmentId || "");
      return !id || !ids.has(id);
    });
  }, [directoryMembers, groupedByDepartment, sortedDepartments]);

  const membersForDepartment = useCallback(
    (departmentId: string) =>
      directoryMembers.filter(
        (member) => String(member.internalDepartmentId || "") === departmentId,
      ),
    [directoryMembers],
  );

  const renderMemberCard = (
    member: DirectoryMember,
    allowMove: boolean,
    hideDepartmentName = false,
  ) => {
    const name = String(member.name || "").trim() || member._id;
    const login = memberLoginLabel(member);
    const loginParts = login ? loginIdDisplay(name, login) : null;
    const departmentLabel =
      !hideDepartmentName && member.departmentName && !allowMove
        ? member.departmentName
        : "";
    const busy = member.kind === "staff" && actionUserId === member._id;
    const body = (
      <div className="min-w-0 px-3.5 pb-3 pt-3">
        <div className="flex items-center gap-2">
          {member.kind === "representative" ? (
            <Badge className="shrink-0 rounded-md border-0 bg-primary-soft px-2 py-0.5 text-primary-strong">
              대표
            </Badge>
          ) : (
            <Badge variant="outline" className="shrink-0 rounded-md px-2 py-0.5">
              직원
            </Badge>
          )}
          <div className="min-w-0 truncate text-sm font-semibold leading-tight text-slate-900">
            {name}
          </div>
        </div>
        {canManage && loginParts ? (
          <div className="mt-3 rounded-lg bg-slate-50 px-2.5 py-2">
            <div className="text-xs text-muted-foreground">로그인 아이디</div>
            <div
              className="mt-0.5 truncate text-sm font-semibold tracking-tight text-foreground"
              title={login}
            >
              {loginParts.stem}
              {loginParts.suffix ? (
                <span className="text-primary-strong">{loginParts.suffix}</span>
              ) : null}
            </div>
          </div>
        ) : null}
        {departmentLabel ? (
          <div className="mt-2 truncate text-xs text-muted-foreground">{departmentLabel}</div>
        ) : null}
        {busy ? <div className="mt-2 text-xs text-muted-foreground">처리 중...</div> : null}
        {canManage && (member.kind === "staff" || allowMove) ? (
          <div className="mt-3 flex items-center gap-2">
            {member.kind === "staff" ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 rounded-lg px-2.5 text-xs"
                  disabled={busy}
                  onClick={() => setResetStaff(member)}
                >
                  비밀번호
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 rounded-lg px-2.5 text-xs"
                  disabled={busy}
                  onClick={() => setRemoveStaff(member)}
                >
                  삭제
                </Button>
              </>
            ) : null}
            {allowMove ? (
              <div className="min-w-0 flex-1">
                {renderDepartmentControl(member._id, member.internalDepartmentId, true)}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );

    if (member.kind === "representative") {
      return (
        <div
          key={member._id}
          className="overflow-hidden rounded-xl border border-slate-200 bg-white"
        >
          {body}
        </div>
      );
    }

    return (
      <div
        key={member._id}
        className="overflow-hidden rounded-xl border border-slate-200 bg-white"
      >
        {body}
      </div>
    );
  };

  const renderMemberGrid = (
    members: DirectoryMember[],
    allowMove: boolean,
    hideDepartmentName = false,
  ) => {
    if (members.length === 0) {
      return (
        <div className="rounded-xl border border-dashed border-slate-200/90 bg-white/50 px-4 py-6 text-center text-sm text-muted-foreground">
          임직원이 없습니다
        </div>
      );
    }
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((member) =>
          renderMemberCard(member, allowMove, hideDepartmentName),
        )}
      </div>
    );
  };

  const handleCancelJoinRequest = async (businessId: string) => {
    if (!token) return;
    await handleJoinOrLeave({
      token,
      businessId,
      action: "cancel",
      businessType,
      toast,
      setCancelLoadingBusinessId: membershipMgmt.setCancelLoadingBusinessId,
      refreshMyJoinRequests: membershipMgmt.refreshMyJoinRequests,
      refreshMembership: membershipMgmt.refreshMembership,
    });
  };

  const handleLeaveBusiness = async (businessId: string) => {
    if (!token) return;
    await handleJoinOrLeave({
      token,
      businessId,
      action: "leave",
      businessType,
      toast,
      setCancelLoadingBusinessId: membershipMgmt.setCancelLoadingBusinessId,
      refreshMyJoinRequests: membershipMgmt.refreshMyJoinRequests,
      refreshMembership: membershipMgmt.refreshMembership,
    });
  };

  const handleJoinRequest = async () => {
    await handleJoinRequestImpl({
      token,
      selectedBusinessId: businessSearch.selectedBusiness?._id,
      businessType,
      toast,
      setJoinLoading: membershipMgmt.setJoinLoading,
      setBusinessSearch: businessSearch.setBusinessSearch,
      setBusinessSearchResults: businessSearch.setBusinessSearchResults,
      setSelectedBusiness: businessSearch.setSelectedBusiness,
      refreshMembership: membershipMgmt.refreshMembership,
      refreshMyJoinRequests: membershipMgmt.refreshMyJoinRequests,
    });
  };

  return (
    <Card className="app-glass-card app-glass-card--lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-5 w-5 text-primary-strong" />
          임직원 · 부서
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {!membershipMgmt.joinRequestsLoaded ? (
          <div className="rounded-2xl border border-dashed border-slate-200/90 bg-white/50 px-6 py-8 text-center text-sm text-muted-foreground">
            불러오는 중...
          </div>
        ) : (
          <>
            {!canManage && membership === "none" ? (
              <BusinessSearchSection
                businessType={businessType}
                businessSearch={businessSearch.businessSearch}
                setBusinessSearch={businessSearch.setBusinessSearch}
                businessSearchResults={businessSearch.businessSearchResults}
                selectedBusiness={businessSearch.selectedBusiness}
                setSelectedBusiness={businessSearch.setSelectedBusiness}
                businessOpen={businessSearch.businessOpen}
                setBusinessOpen={businessSearch.setBusinessOpen}
                joinLoading={membershipMgmt.joinLoading}
                onJoinRequest={() => void handleJoinRequest()}
              />
            ) : null}
            {!canManage ? (
              <JoinRequestsSection
                myJoinRequests={membershipMgmt.myJoinRequests || []}
                cancelLoadingBusinessId={membershipMgmt.cancelLoadingBusinessId}
                onCancelJoinRequest={(businessId) =>
                  void handleCancelJoinRequest(businessId)
                }
                onLeaveBusiness={(businessId) => void handleLeaveBusiness(businessId)}
              />
            ) : null}
          </>
        )}

        {showDirectory && (
          <>
            <section className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 sm:p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-16">
                {canManage && supportsDepartments ? (
                  <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end">
                    <div className="w-full space-y-2 sm:w-52">
                      <label className="text-xs font-medium text-muted-foreground">
                        새 부서 이름
                      </label>
                      <Input
                        value={newDepartmentName}
                        onChange={(event) => setNewDepartmentName(event.target.value)}
                        placeholder="예: 진료팀"
                        disabled={creatingDepartment}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void handleCreateDepartment();
                          }
                        }}
                      />
                    </div>
                    <Button
                      type="button"
                      className="shrink-0"
                      disabled={creatingDepartment || !newDepartmentName.trim()}
                      onClick={() => void handleCreateDepartment()}
                    >
                      {creatingDepartment ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="mr-2 h-4 w-4" />
                      )}
                      부서 추가
                    </Button>
                  </div>
                ) : null}
                <div className="flex shrink-0 items-center gap-2 lg:ml-auto">
                  {canManage ? (
                    <Button type="button" className="shrink-0" onClick={() => setBulkOpen(true)}>
                      <UserPlus className="mr-2 h-4 w-4" />
                      직원 등록
                    </Button>
                  ) : null}
                  <span className="inline-flex h-10 items-center rounded-md bg-white px-4 text-sm font-semibold tabular-nums text-slate-600 ring-1 ring-slate-200/80">
                    {visibleMemberCount}명
                  </span>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {loading &&
                visibleMemberCount === 0 &&
                sortedDepartments.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200/90 bg-white/50 px-6 py-8 text-center text-sm text-muted-foreground">
                    불러오는 중...
                  </div>
                ) : groupedByDepartment ? (
                  <>
                    {sortedDepartments.map((row) => {
                      const isEditing = editingDepartmentId === row._id;
                      const canMove = canManage && sortedDepartments.length > 1;
                      return (
                        <div
                          key={row._id}
                          className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/70"
                        >
                          <div className="border-t-4 border-primary-strong bg-white/80">
                            <div className="flex items-center gap-2 px-3.5 py-2.5">
                              <Building2 className="h-4 w-4 shrink-0 text-primary-strong" />
                              {isEditing ? (
                                <>
                                  <Input
                                    value={editingDepartmentName}
                                    autoFocus
                                    disabled={savingDepartmentId === row._id}
                                    className="h-8 w-44"
                                    onChange={(event) =>
                                      setEditingDepartmentName(event.target.value)
                                    }
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") {
                                        event.preventDefault();
                                        void handleSaveDepartmentEdit(row._id);
                                      }
                                      if (event.key === "Escape") {
                                        event.preventDefault();
                                        setEditingDepartmentId("");
                                        setEditingDepartmentName("");
                                      }
                                    }}
                                  />
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="h-8 shrink-0 rounded-lg px-3 text-xs"
                                    disabled={
                                      savingDepartmentId === row._id ||
                                      !editingDepartmentName.trim()
                                    }
                                    onClick={() => void handleSaveDepartmentEdit(row._id)}
                                  >
                                    저장
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 shrink-0 rounded-lg px-3 text-xs"
                                    disabled={savingDepartmentId === row._id}
                                    onClick={() => {
                                      setEditingDepartmentId("");
                                      setEditingDepartmentName("");
                                    }}
                                  >
                                    취소
                                  </Button>
                                </>
                              ) : canManage ? (
                                <button
                                  type="button"
                                  className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-slate-900 hover:text-primary-strong"
                                  disabled={deletingDepartmentId === row._id}
                                  onClick={() => {
                                    setEditingDepartmentId(row._id);
                                    setEditingDepartmentName(row.name);
                                  }}
                                >
                                  {row.name}
                                </button>
                              ) : (
                                <div className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">
                                  {row.name}
                                </div>
                              )}
                              {canManage ? (
                                <div className="ml-auto flex shrink-0 items-center">
                                  {isEditing ? null : (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-slate-400 hover:text-slate-700"
                                      aria-label="부서 이름 수정"
                                      disabled={deletingDepartmentId === row._id}
                                      onClick={() => {
                                        setEditingDepartmentId(row._id);
                                        setEditingDepartmentName(row.name);
                                      }}
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                  )}
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-slate-400 hover:text-destructive"
                                    aria-label="부서 삭제"
                                    disabled={
                                      deletingDepartmentId === row._id ||
                                      savingDepartmentId === row._id
                                    }
                                    onClick={() => setRemoveDepartment(row)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              ) : null}
                            </div>
                          </div>
                          <div className="border-t border-slate-200/80 p-3 sm:p-4">
                            {renderMemberGrid(
                              membersForDepartment(row._id),
                              canMove,
                              true,
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {looseMembers.length > 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200/90 bg-white/40 p-3 sm:p-4">
                        <h3 className="mb-3 text-sm font-semibold text-slate-900">
                          미배치
                        </h3>
                        {renderMemberGrid(looseMembers, canManage, false)}
                      </div>
                    ) : null}
                  </>
                ) : visibleMemberCount === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200/90 bg-white/50 px-6 py-10 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white ring-1 ring-slate-200/80">
                      <Users className="h-5 w-5 text-slate-400" />
                    </span>
                    <p className="mt-3 text-sm font-medium text-slate-700">
                      등록된 임직원이 없습니다
                    </p>
                    {canManage ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        직원을 등록하면 표시됩니다.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  renderMemberGrid(directoryMembers, false, false)
                )}
              </div>
            </section>
            <StaffBulkRegisterDialog
              open={bulkOpen}
              token={token || ""}
              businessType={businessType}
              departments={sortedDepartments}
              onOpenChange={setBulkOpen}
              onCreated={() => {
                void refreshStaff();
                void refreshRepresentatives();
              }}
            />
            <ConfirmDialog
              open={Boolean(removeDepartment)}
              title="부서를 삭제할까요?"
              description={
                removeDepartment ? (
                  <div className="text-sm text-muted-foreground">
                    {removeDepartment.name}
                    <br />
                    소속 임직원이 있으면 삭제할 수 없습니다.
                  </div>
                ) : null
              }
              confirmLabel="삭제"
              cancelLabel="닫기"
              busy={Boolean(
                removeDepartment && deletingDepartmentId === removeDepartment._id,
              )}
              onConfirm={async () => {
                if (!removeDepartment) return;
                await handleDeleteDepartment(removeDepartment._id);
                setRemoveDepartment(null);
              }}
              onCancel={() => {
                if (removeDepartment && deletingDepartmentId === removeDepartment._id) return;
                setRemoveDepartment(null);
              }}
            />
            <ConfirmDialog
              open={Boolean(removeStaff)}
              title="직원을 삭제할까요?"
              description={
                removeStaff ? (
                  <div className="text-sm text-muted-foreground">
                    {memberConfirmLabel(removeStaff)}
                  </div>
                ) : null
              }
              confirmLabel="삭제"
              cancelLabel="닫기"
              busy={Boolean(removeStaff && actionUserId === removeStaff._id)}
              onConfirm={async () => {
                if (!removeStaff) return;
                await handleRemoveStaff(removeStaff._id);
                setRemoveStaff(null);
              }}
              onCancel={() => {
                if (removeStaff && actionUserId === removeStaff._id) return;
                setRemoveStaff(null);
              }}
            />
            <StaffPasswordResetDialog
              open={Boolean(resetStaff)}
              token={token || ""}
              businessType={businessType}
              userId={resetStaff?._id || ""}
              label={resetStaff ? memberConfirmLabel(resetStaff) : ""}
              onOpenChange={(open) => {
                if (!open) setResetStaff(null);
              }}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
};

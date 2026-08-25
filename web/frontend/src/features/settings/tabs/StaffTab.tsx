// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FunctionalItemCard } from "@/shared/ui/components/FunctionalItemCard";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { resolveBusinessType } from "@/shared/utils/resolveBusinessType";
import { Info, UserCheck, UserPlus, Users } from "lucide-react";
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
  internalDepartmentId?: string | null;
  departmentName?: string;
};

type DepartmentOption = {
  _id: string;
  name: string;
};

type PendingJoinRequest = {
  user: { _id: string; name?: string; email?: string } | string;
  createdAt?: string;
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

  const [membership, setMembership] = useState<
    "none" | "owner" | "member" | "pending"
  >("none");

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [pending, setPending] = useState<PendingJoinRequest[]>([]);
  const [representatives, setRepresentatives] = useState<
    Array<{ _id: string; name?: string; email?: string }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [actionUserId, setActionUserId] = useState<string>("");
  const [usesDepartments, setUsesDepartments] = useState(false);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [pendingDepartmentByUserId, setPendingDepartmentByUserId] = useState<
    Record<string, string>
  >({});

  const mockHeaders = useMemo(() => {
    return {} as Record<string, string>;
  }, []);

  const businessType = useMemo(() => {
    if (businessTypeOverride) return businessTypeOverride;
    return resolveBusinessType(user?.role || userData?.role, "requestor");
  }, [businessTypeOverride, user?.role, userData?.role]);

  const isAdminBusiness = businessType === "admin";

  const refreshMembership = useCallback(async () => {
    if (!token) return;
    const res = await request<any>({
      path: `/api/businesses/me?businessType=${encodeURIComponent(
        businessType,
      )}`,
      method: "GET",
      token,
      headers: mockHeaders,
    });
    if (!res.ok) return;
    const body: any = res.data || {};
    const data = body.data || body;
    const next = (data?.membership || "none") as
      | "none"
      | "owner"
      | "member"
      | "pending";
    setMembership(next);
  }, [mockHeaders, businessType, token]);

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
    if (!token || !isAdminBusiness) {
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
          }))
        : [],
    );
  }, [businessType, isAdminBusiness, mockHeaders, token]);

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
  }, [mockHeaders, businessType, token]);

  const refreshPending = useCallback(async () => {
    if (!token) return;
    const res = await request<any>({
      path: `/api/businesses/join-requests/pending?businessType=${encodeURIComponent(
        businessType,
      )}`,
      method: "GET",
      token,
      headers: mockHeaders,
    });
    if (!res.ok) {
      setPending([]);
      return;
    }
    const body: any = res.data || {};
    const data = body.data || body;
    setPending(Array.isArray(data?.joinRequests) ? data.joinRequests : []);
  }, [mockHeaders, businessType, token]);

  useEffect(() => {
    const load = async () => {
      try {
        if (!token) return;
        setLoading(true);
        await refreshMembership();
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [refreshMembership, token]);

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      if (membership !== "owner") return;
      setLoading(true);
      try {
        await Promise.all([
          refreshRepresentatives(),
          refreshStaff(),
          refreshPending(),
          refreshDepartments(),
        ]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [
    membership,
    refreshDepartments,
    refreshPending,
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
    if (!usesDepartments || departments.length === 0) return null;
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
          {departments.map((dept) => (
            <SelectItem key={dept._id} value={dept._id}>
              {dept.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
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

  const handleApprove = async (
    userId: string,
    role: "representative" | "staff",
  ) => {
    try {
      if (!token) return;
      const id = String(userId || "").trim();
      if (!id) return;

      const departmentId = pendingDepartmentByUserId[id] || "";
      if (usesDepartments && !departmentId) {
        toast({
          title: "부서를 선택해주세요",
          description: "승인 전에 배치할 부서를 선택해야 합니다.",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      setActionUserId(id);
      const res = await request<any>({
        path: `/api/businesses/join-requests/${id}/approve`,
        method: "POST",
        token,
        headers: mockHeaders,
        jsonBody: {
          role,
          businessType,
          ...(usesDepartments ? { departmentId } : {}),
        },
      });

      if (!res.ok) {
        const message = String((res.data as any)?.message || "").trim();
        toast({
          title: "승인에 실패했어요",
          description: message || "잠시 후 다시 시도해주세요.",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      toast({
        title:
          role === "representative"
            ? "대표로 승인되었습니다"
            : "직원으로 승인되었습니다",
      });
      await Promise.all([
        refreshPending(),
        refreshStaff(),
        refreshRepresentatives(),
        refreshMembership(),
      ]);
    } finally {
      setActionUserId("");
    }
  };

  const handleReject = async (userId: string) => {
    try {
      if (!token) return;
      const id = String(userId || "").trim();
      if (!id) return;

      setActionUserId(id);
      const res = await request<any>({
        path: `/api/businesses/join-requests/${id}/reject`,
        method: "POST",
        token,
        headers: mockHeaders,
        jsonBody: { businessType },
      });

      if (!res.ok) {
        const message = String((res.data as any)?.message || "").trim();
        toast({
          title: "거절에 실패했어요",
          description: message || "잠시 후 다시 시도해주세요.",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      toast({ title: "신청이 거절되었습니다" });
      await refreshPending();
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

  const pendingEntries = useMemo(() => {
    return pending.filter((r) => {
      const u: any = (r as any)?.user;
      const userId = typeof u === "string" ? u : String(u?._id || "");
      const email = typeof u === "string" ? "" : String(u?.email || "");
      const name = typeof u === "string" ? "" : String(u?.name || "");
      return (
        Boolean(userId) &&
        !isDeletedAccount(userId) &&
        !isDeletedAccount(email) &&
        !isDeletedAccount(name)
      );
    });
  }, [isDeletedAccount, pending]);

  return (
    <Card className="app-glass-card app-glass-card--lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-5 w-5 text-primary-strong" />
          임직원 관리
        </CardTitle>
        <CardDescription className="text-[13px] leading-relaxed">
          대표·직원 계정과 가입 신청을 관리합니다.
          {usesDepartments ? " 어벗츠 임직원은 부서별로 배치합니다." : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {membership !== "owner" && (
          <div className="flex gap-3 rounded-2xl border border-slate-200/90 bg-slate-50/60 px-4 py-3.5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              대표 계정만 임직원을 관리할 수 있습니다.
            </p>
          </div>
        )}

        {membership === "owner" && (
          <>
            <section className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white ring-1 ring-slate-200/80">
                    <UserCheck className="h-4 w-4 text-primary-strong" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      등록된 임직원
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      대표와 직원 계정
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-600 ring-1 ring-slate-200/80">
                  {representativeEntries.length + staffEntries.length}명
                </span>
              </div>

              {loading &&
              representativeEntries.length === 0 &&
              staffEntries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200/90 bg-white/50 px-6 py-8 text-center text-sm text-muted-foreground">
                  불러오는 중...
                </div>
              ) : representativeEntries.length === 0 &&
                staffEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200/90 bg-white/50 px-6 py-10 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white ring-1 ring-slate-200/80">
                    <Users className="h-5 w-5 text-slate-400" />
                  </span>
                  <p className="mt-3 text-sm font-medium text-slate-700">
                    등록된 임직원이 없습니다
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    가입 신청을 승인하면 이곳에 표시됩니다.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {representativeEntries.map((entry) => {
                    const name = String(entry.name || "").trim() || entry._id;
                    const email = String(entry.email || "").trim();
                    return (
                      <div
                        key={entry._id}
                        className="overflow-hidden rounded-2xl border border-primary-muted/70 bg-white/80 shadow-sm"
                      >
                        <div className="h-1 w-full bg-primary-strong" />
                        <div className="flex items-start gap-2.5 px-3.5 py-3">
                          <Badge className="shrink-0 rounded-md border-0 bg-primary-soft px-2 py-0.5 text-primary-strong">
                            대표
                          </Badge>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-semibold leading-tight text-slate-900">
                              {name}
                            </div>
                            {email ? (
                              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                                {email}
                              </div>
                            ) : null}
                            {entry.departmentName ? (
                              <div className="mt-1 text-xs text-primary-strong">
                                {entry.departmentName}
                              </div>
                            ) : null}
                          </div>
                        </div>
                        {usesDepartments ? (
                          <div className="px-3.5 pb-3">
                            {renderDepartmentControl(
                              entry._id,
                              entry.internalDepartmentId,
                              true,
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}

                  {staffEntries.map((m) => {
                    const name = String(m.name || "").trim() || m._id;
                    const email = String(m.email || "").trim();
                    const label = `${name}${email ? ` (${email})` : ""}`;
                    return (
                      <FunctionalItemCard
                        key={m._id}
                        className="overflow-hidden rounded-2xl border-slate-200/80 bg-white/80 p-0 shadow-sm"
                        onRemove={() => handleRemoveStaff(m._id)}
                        confirmTitle="직원을 삭제할까요?"
                        confirmDescription={
                          <div className="text-sm text-muted-foreground">
                            {label}
                          </div>
                        }
                        confirmLabel="삭제"
                        cancelLabel="닫기"
                        disabled={actionUserId === m._id}
                      >
                        <div className="border-t-4 border-slate-300">
                          <div className="flex items-start gap-2.5 px-3.5 py-3 pr-8">
                            <Badge
                              variant="outline"
                              className="shrink-0 rounded-md px-2 py-0.5"
                            >
                              직원
                            </Badge>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold leading-tight text-slate-900">
                                {name}
                              </div>
                              {email ? (
                                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                                  {email}
                                </div>
                              ) : null}
                              {m.departmentName ? (
                                <div className="mt-1 text-xs text-primary-strong">
                                  {m.departmentName}
                                </div>
                              ) : null}
                              {actionUserId === m._id ? (
                                <div className="mt-0.5 text-xs text-muted-foreground">
                                  처리 중...
                                </div>
                              ) : null}
                            </div>
                          </div>
                          {usesDepartments ? (
                            <div className="px-3.5 pb-3">
                              {renderDepartmentControl(
                                m._id,
                                m.internalDepartmentId,
                                true,
                              )}
                            </div>
                          ) : null}
                        </div>
                      </FunctionalItemCard>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-4 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white ring-1 ring-slate-200/80">
                    <UserPlus className="h-4 w-4 text-amber-600" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      등록 신청
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      승인 대기 중인 가입 신청
                    </p>
                  </div>
                </div>
                {pendingEntries.length > 0 ? (
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-amber-800 ring-1 ring-amber-200">
                    {pendingEntries.length}건
                  </span>
                ) : null}
              </div>

              {loading && pendingEntries.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200/90 bg-white/50 px-6 py-8 text-center text-sm text-muted-foreground">
                  불러오는 중...
                </div>
              ) : pendingEntries.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200/90 bg-white/50 px-6 py-10 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white ring-1 ring-slate-200/80">
                    <UserPlus className="h-5 w-5 text-slate-400" />
                  </span>
                  <p className="mt-3 text-sm font-medium text-slate-700">
                    대기 중인 신청이 없습니다
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {pendingEntries.map((r, idx) => {
                    const u: any = (r as any)?.user;
                    const userId =
                      typeof u === "string" ? u : String(u?._id || "");
                    const name =
                      typeof u === "string"
                        ? u
                        : String(u?.name || "").trim() || userId;
                    const email =
                      typeof u === "string" ? "" : String(u?.email || "").trim();
                    const label = `${name}${email ? ` (${email})` : ""}`;
                    return (
                      <FunctionalItemCard
                        key={`${userId}-${idx}`}
                        className="overflow-hidden rounded-2xl border-amber-200/70 bg-white/80 p-0 shadow-sm"
                        onRemove={() => handleReject(userId)}
                        confirmTitle="신청을 거절할까요?"
                        confirmDescription={
                          <div className="text-sm text-muted-foreground">
                            {label || userId}
                          </div>
                        }
                        confirmLabel="거절"
                        cancelLabel="닫기"
                        disabled={!userId || actionUserId === userId}
                      >
                        <div className="border-t-4 border-amber-400">
                          <div className="space-y-3 px-3.5 py-3 pr-8">
                            <div className="flex items-start gap-2.5">
                              <Badge className="shrink-0 rounded-md border-0 bg-amber-50 px-2 py-0.5 text-amber-800">
                                신청
                              </Badge>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-semibold leading-tight text-slate-900">
                                  {name || userId}
                                </div>
                                {email ? (
                                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                                    {email}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            {usesDepartments ? (
                              <div className="space-y-2">
                                <Select
                                  value={pendingDepartmentByUserId[userId] || undefined}
                                  onValueChange={(next) =>
                                    setPendingDepartmentByUserId((prev) => ({
                                      ...prev,
                                      [userId]: next,
                                    }))
                                  }
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="승인 부서 선택" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {departments.map((dept) => (
                                      <SelectItem key={dept._id} value={dept._id}>
                                        {dept.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : null}
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 flex-1 rounded-lg text-xs"
                                onClick={() =>
                                  handleApprove(userId, "representative")
                                }
                                disabled={!userId || actionUserId === userId}
                              >
                                대표 승인
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                className="h-8 flex-1 rounded-lg text-xs"
                                onClick={() => handleApprove(userId, "staff")}
                                disabled={!userId || actionUserId === userId}
                              >
                                직원 승인
                              </Button>
                            </div>
                          </div>
                        </div>
                      </FunctionalItemCard>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
};

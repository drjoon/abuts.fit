// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FunctionalItemCard } from "@/shared/ui/components/FunctionalItemCard";
import { request } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import { resolveBusinessType } from "@/shared/utils/resolveBusinessType";
import { Users } from "lucide-react";

type StaffMember = {
  _id: string;
  name?: string;
  email?: string;
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

  const mockHeaders = useMemo(() => {
    return {} as Record<string, string>;
  }, []);

  const businessType = useMemo(() => {
    if (businessTypeOverride) return businessTypeOverride;
    return resolveBusinessType(user?.role || userData?.role, "requestor");
  }, [businessTypeOverride, user?.role, userData?.role]);

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
          })),
      );
      return;
    }
    setRepresentatives([]);
  }, [mockHeaders, businessType, token]);

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
        ]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [membership, refreshPending, refreshRepresentatives, refreshStaff, token]);

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

      setActionUserId(id);
      const res = await request<any>({
        path: `/api/businesses/join-requests/${id}/approve`,
        method: "POST",
        token,
        headers: mockHeaders,
        jsonBody: { role, businessType },
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
        <CardTitle className="flex items-center gap-2 text-xl">
          <Users className="h-5 w-5" />
          임직원 관리
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {membership !== "owner" && (
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 px-4 py-3 text-sm text-muted-foreground">
            대표 계정만 직원 관리를 할 수 있습니다.
          </div>
        )}

        {membership === "owner" && (
          <>
            <section className="space-y-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold tracking-tight">
                  등록된 임직원
                </h3>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {representativeEntries.length + staffEntries.length}명
                </span>
              </div>

              {loading &&
              representativeEntries.length === 0 &&
              staffEntries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-sm text-muted-foreground">
                  불러오는 중...
                </div>
              ) : representativeEntries.length === 0 &&
                staffEntries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-sm text-muted-foreground">
                  등록된 임직원이 없습니다.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {representativeEntries.map((entry) => {
                    const name = String(entry.name || "").trim() || entry._id;
                    const email = String(entry.email || "").trim();
                    return (
                      <div
                        key={entry._id}
                        className="flex items-start gap-2.5 rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2.5"
                      >
                        <Badge
                          variant="secondary"
                          className="shrink-0 rounded-md px-2 py-0.5"
                        >
                          대표
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium leading-tight">
                            {name}
                          </div>
                          {email ? (
                            <div className="mt-0.5 truncate text-xs text-muted-foreground">
                              {email}
                            </div>
                          ) : null}
                        </div>
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
                        className="rounded-xl border-slate-200/80 bg-white/80 p-0"
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
                        <div className="flex items-start gap-2.5 px-3 py-2.5 pr-8">
                          <Badge
                            variant="outline"
                            className="shrink-0 rounded-md px-2 py-0.5"
                          >
                            직원
                          </Badge>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium leading-tight">
                              {name}
                            </div>
                            {email ? (
                              <div className="mt-0.5 truncate text-xs text-muted-foreground">
                                {email}
                              </div>
                            ) : null}
                            {actionUserId === m._id ? (
                              <div className="mt-0.5 text-xs text-muted-foreground">
                                처리 중...
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </FunctionalItemCard>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="space-y-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold tracking-tight">
                  등록 신청자 관리
                </h3>
                {pendingEntries.length > 0 ? (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {pendingEntries.length}건
                  </span>
                ) : null}
              </div>

              {loading && pendingEntries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-sm text-muted-foreground">
                  불러오는 중...
                </div>
              ) : pendingEntries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 px-4 py-5 text-sm text-muted-foreground">
                  대기 중인 신청이 없습니다.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
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
                        className="rounded-xl border-slate-200/80 bg-white/80 p-0"
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
                        <div className="space-y-2 px-3 py-2.5 pr-8">
                          <div className="flex items-start gap-2.5">
                            <Badge
                              variant="secondary"
                              className="shrink-0 rounded-md px-2 py-0.5"
                            >
                              신청
                            </Badge>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium leading-tight">
                                {name || userId}
                              </div>
                              {email ? (
                                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                                  {email}
                                </div>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex gap-1.5">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 flex-1 px-2 text-xs"
                              onClick={() =>
                                handleApprove(userId, "representative")
                              }
                              disabled={!userId || actionUserId === userId}
                            >
                              대표
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 flex-1 px-2 text-xs"
                              onClick={() => handleApprove(userId, "staff")}
                              disabled={!userId || actionUserId === userId}
                            >
                              직원
                            </Button>
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

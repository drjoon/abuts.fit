import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FunctionalItemCard } from "@/components/FunctionalItemCard";
import { request } from "@/lib/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/hooks/use-toast";

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
}

export const StaffTab = ({ userData }: StaffTabProps) => {
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
    if (token !== "MOCK_DEV_TOKEN") return {} as Record<string, string>;
    return {
      "x-mock-role": (user?.role || userData?.role || "requestor") as string,
      "x-mock-position": (user as any)?.position || "staff",
      "x-mock-email": user?.email || userData?.email || "mock@abuts.fit",
      "x-mock-name": user?.name || userData?.name || "사용자",
      "x-mock-organization":
        (user as any)?.organization || userData?.companyName || "",
      "x-mock-phone": (user as any)?.phoneNumber || "",
    };
  }, [token, user?.email, user?.name, user?.role, userData]);

  const refreshMembership = useCallback(async () => {
    if (!token) return;
    const res = await request<any>({
      path: "/api/requestor-organizations/me",
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
  }, [mockHeaders, token]);

  const refreshRepresentatives = useCallback(async () => {
    if (!token) return;
    const res = await request<any>({
      path: "/api/requestor-organizations/owners",
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
  }, [mockHeaders, token]);

  const refreshStaff = useCallback(async () => {
    if (!token) return;
    const res = await request<any>({
      path: "/api/requestor-organizations/staff",
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
    setStaff(Array.isArray(data?.staff) ? data.staff : []);
  }, [mockHeaders, token]);

  const refreshPending = useCallback(async () => {
    if (!token) return;
    const res = await request<any>({
      path: "/api/requestor-organizations/join-requests/pending",
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
  }, [mockHeaders, token]);

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
        path: `/api/requestor-organizations/staff/${id}`,
        method: "DELETE",
        token,
        headers: mockHeaders,
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
        path: `/api/requestor-organizations/join-requests/${id}/approve`,
        method: "POST",
        token,
        headers: mockHeaders,
        jsonBody: { role },
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
        path: `/api/requestor-organizations/join-requests/${id}/reject`,
        method: "POST",
        token,
        headers: mockHeaders,
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
      <CardHeader>
        <CardTitle>임직원 관리</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {membership !== "owner" && (
          <div className="app-surface app-surface--panel text-sm">
            대표 계정만 직원 관리를 할 수 있습니다.
          </div>
        )}

        {membership === "owner" && (
          <>
            <div className="app-surface app-surface--panel space-y-4">
              <div className="text-sm font-medium">등록된 임직원</div>

              {loading &&
              representativeEntries.length === 0 &&
              staffEntries.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  불러오는 중...
                </div>
              ) : representativeEntries.length === 0 &&
                staffEntries.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  등록된 임직원이 없습니다.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {representativeEntries.map((entry) => {
                    const label = `${entry.name || ""}${
                      entry.email ? ` (${entry.email})` : ""
                    }`.trim();
                    return (
                      <FunctionalItemCard
                        key={entry._id}
                        className="p-3"
                        disabled
                      >
                        <div className="flex items-start gap-2">
                          <Badge variant="secondary">대표</Badge>
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">
                              {label || entry._id}
                            </div>
                          </div>
                        </div>
                      </FunctionalItemCard>
                    );
                  })}

                  {staffEntries.map((m) => {
                    const label = `${m.name || ""}${
                      m.email ? ` (${m.email})` : ""
                    }`.trim();
                    return (
                      <FunctionalItemCard
                        key={m._id}
                        className="p-3"
                        onRemove={() => handleRemoveStaff(m._id)}
                        confirmTitle="직원을 삭제할까요?"
                        confirmDescription={
                          <div className="text-sm text-muted-foreground">
                            {label || m._id}
                          </div>
                        }
                        confirmLabel="삭제"
                        cancelLabel="닫기"
                        disabled={actionUserId === m._id}
                      >
                        <div className="flex items-start gap-2">
                          <Badge variant="outline">직원</Badge>
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">
                              {label || m._id}
                            </div>
                            {actionUserId === m._id && (
                              <div className="text-xs text-muted-foreground mt-1">
                                처리 중...
                              </div>
                            )}
                          </div>
                        </div>
                      </FunctionalItemCard>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="app-surface app-surface--panel">
              <div className="text-sm font-medium mb-3">등록 신청자 관리</div>
              {loading && pendingEntries.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  불러오는 중...
                </div>
              ) : pendingEntries.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  대기 중인 신청이 없습니다.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {pendingEntries.map((r, idx) => {
                    const u: any = (r as any)?.user;
                    const userId =
                      typeof u === "string" ? u : String(u?._id || "");
                    const label =
                      typeof u === "string"
                        ? u
                        : `${u?.name || ""} ${
                            u?.email ? `(${u.email})` : ""
                          }`.trim();
                    return (
                      <FunctionalItemCard
                        key={`${userId}-${idx}`}
                        className="p-3"
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
                        <div className="flex items-start gap-2">
                          <Badge variant="secondary">신청</Badge>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">
                              {label || userId}
                            </div>
                            <div className="flex gap-2 mt-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
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
                                onClick={() => handleApprove(userId, "staff")}
                                disabled={!userId || actionUserId === userId}
                              >
                                직원
                              </Button>
                            </div>
                          </div>
                        </div>
                      </FunctionalItemCard>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};

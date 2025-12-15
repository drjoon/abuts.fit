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
import { Label } from "@/components/ui/label";
import { request } from "@/lib/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/hooks/use-toast";

type StaffMember = {
  _id: string;
  name?: string;
  email?: string;
};

type CoOwnerUser = {
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

  const myUserId = useMemo(() => {
    return String(user?.mockUserId || user?.id || "");
  }, [user?.id, user?.mockUserId]);

  const [membership, setMembership] = useState<
    "none" | "owner" | "member" | "pending"
  >("none");

  const [orgName, setOrgName] = useState<string>("");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [pending, setPending] = useState<PendingJoinRequest[]>([]);
  const [ownerUser, setOwnerUser] = useState<CoOwnerUser | null>(null);
  const [coOwners, setCoOwners] = useState<CoOwnerUser[]>([]);
  const [coOwnerEmail, setCoOwnerEmail] = useState<string>("");
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
    setOrgName(String(data?.organization?.name || "").trim());
  }, [mockHeaders, token]);

  const refreshCoOwners = useCallback(async () => {
    if (!token) return;
    const res = await request<any>({
      path: "/api/requestor-organizations/co-owners",
      method: "GET",
      token,
      headers: mockHeaders,
    });
    if (!res.ok) {
      setOwnerUser(null);
      setCoOwners([]);
      return;
    }
    const body: any = res.data || {};
    const data = body.data || body;
    setOrgName(String(data?.organizationName || "").trim());
    setOwnerUser(data?.owner || null);
    setCoOwners(Array.isArray(data?.coOwners) ? data.coOwners : []);
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
    setOrgName(String(data?.organizationName || "").trim());
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
    setOrgName(String(data?.organizationName || "").trim());
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
          refreshCoOwners(),
          refreshStaff(),
          refreshPending(),
        ]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [membership, refreshCoOwners, refreshPending, refreshStaff, token]);

  const isPrimaryOwner = useMemo(() => {
    if (!ownerUser?._id) return false;
    return String(ownerUser._id) === myUserId;
  }, [myUserId, ownerUser?._id]);

  const handleAddCoOwner = async () => {
    try {
      if (!token) return;
      const email = String(coOwnerEmail || "")
        .trim()
        .toLowerCase();

      if (!email) {
        toast({
          title: "공동대표 이메일을 입력해주세요",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      setActionUserId("add");
      const res = await request<any>({
        path: "/api/requestor-organizations/co-owners",
        method: "POST",
        token,
        headers: mockHeaders,
        jsonBody: { email },
      });

      if (!res.ok) {
        const message = String((res.data as any)?.message || "").trim();
        toast({
          title: "공동대표를 추가하지 못했어요",
          description: message || "잠시 후 다시 시도해주세요.",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      toast({ title: "공동대표가 추가되었습니다" });
      setCoOwnerEmail("");
      await Promise.all([
        refreshCoOwners(),
        refreshStaff(),
        refreshMembership(),
      ]);
    } finally {
      setActionUserId("");
    }
  };

  const handleRemoveCoOwner = async (userId: string) => {
    try {
      if (!token) return;
      const id = String(userId || "").trim();
      if (!id) return;
      setActionUserId(id);
      const res = await request<any>({
        path: `/api/requestor-organizations/co-owners/${id}`,
        method: "DELETE",
        token,
        headers: mockHeaders,
      });

      if (!res.ok) {
        const message = String((res.data as any)?.message || "").trim();
        toast({
          title: "공동대표를 삭제하지 못했어요",
          description: message || "잠시 후 다시 시도해주세요.",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      toast({ title: "공동대표가 삭제되었습니다" });
      await Promise.all([refreshCoOwners(), refreshMembership()]);
    } finally {
      setActionUserId("");
    }
  };

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

  const handleApprove = async (userId: string) => {
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

      toast({ title: "신청이 승인되었습니다" });
      await Promise.all([
        refreshPending(),
        refreshStaff(),
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

  return (
    <Card className="relative flex flex-col rounded-2xl border border-gray-200 bg-white/80 shadow-sm transition-all hover:shadow-lg">
      <CardHeader>
        <CardTitle>직원 관리</CardTitle>
        <CardDescription>
          {orgName
            ? `${orgName} 직원 및 신청자를 관리합니다.`
            : "직원 및 신청자를 관리합니다."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {membership !== "owner" && (
          <div className="rounded-lg border bg-white/60 p-3 text-sm">
            대표자(주대표/공동대표) 계정만 직원 관리를 할 수 있습니다.
          </div>
        )}

        {membership === "owner" && (
          <>
            <div className="rounded-lg border bg-white/60 p-4 space-y-3">
              <div className="text-sm font-medium">공동대표</div>

              {!isPrimaryOwner && (
                <div className="rounded-md border bg-white/70 p-2 text-xs text-muted-foreground">
                  공동대표 추가/삭제는 주대표 계정만 가능합니다.
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm truncate">
                    {ownerUser
                      ? `${ownerUser.name || ""}${
                          ownerUser.email ? ` (${ownerUser.email})` : ""
                        }`
                      : "-"}
                  </div>
                  <div className="text-xs text-muted-foreground">주대표</div>
                </div>

                {coOwners.map((m) => {
                  const label = `${m.name || ""}${
                    m.email ? ` (${m.email})` : ""
                  }`.trim();
                  return (
                    <div
                      key={m._id}
                      className="flex items-center justify-between gap-3"
                    >
                      <div className="text-sm truncate">{label || m._id}</div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleRemoveCoOwner(m._id)}
                        disabled={!isPrimaryOwner || actionUserId === m._id}
                      >
                        삭제
                      </Button>
                    </div>
                  );
                })}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <div className="md:col-span-2 space-y-1">
                  <Label htmlFor="coOwnerEmail">공동대표 추가(이메일)</Label>
                  <Input
                    id="coOwnerEmail"
                    type="email"
                    value={coOwnerEmail}
                    onChange={(e) => setCoOwnerEmail(e.target.value)}
                    placeholder="example@domain.com"
                    disabled={!isPrimaryOwner}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="opacity-0">추가</Label>
                  <Button
                    type="button"
                    className="w-full"
                    onClick={handleAddCoOwner}
                    disabled={
                      !isPrimaryOwner ||
                      actionUserId === "add" ||
                      !String(coOwnerEmail || "").trim()
                    }
                    variant="outline"
                  >
                    추가
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-lg border bg-white/60 p-4">
              <div className="text-sm font-medium mb-3">등록된 직원</div>
              {loading && staff.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  불러오는 중...
                </div>
              ) : staff.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  등록된 직원이 없습니다.
                </div>
              ) : (
                <div className="space-y-2">
                  {staff.map((m) => {
                    const label = `${m.name || ""}${
                      m.email ? ` (${m.email})` : ""
                    }`.trim();
                    return (
                      <div
                        key={m._id}
                        className="flex items-center justify-between gap-3"
                      >
                        <div className="text-sm truncate">{label || m._id}</div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleRemoveStaff(m._id)}
                          disabled={actionUserId === m._id}
                        >
                          {actionUserId === m._id ? "삭제 중..." : "삭제"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-lg border bg-white/60 p-4">
              <div className="text-sm font-medium mb-3">등록 신청자 관리</div>
              {loading && pending.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  불러오는 중...
                </div>
              ) : pending.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  대기 중인 신청이 없습니다.
                </div>
              ) : (
                <div className="space-y-2">
                  {pending.map((r, idx) => {
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
                      <div
                        key={`${userId}-${idx}`}
                        className="flex items-center justify-between gap-3"
                      >
                        <div className="text-sm truncate">
                          {label || userId}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleApprove(userId)}
                            disabled={!userId || actionUserId === userId}
                          >
                            승인
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleReject(userId)}
                            disabled={!userId || actionUserId === userId}
                          >
                            거절
                          </Button>
                        </div>
                      </div>
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

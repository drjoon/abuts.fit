import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Building2,
  Search,
  Anchor,
  Wallet,
  Users,
  AlertCircle,
  Trash2,
  Loader2,
} from "lucide-react";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import type { BusinessCredit } from "@/pages/admin/credits/adminCredit.types";

type ApiBusinessCreditsResponse = {
  success: boolean;
  data?: {
    items?: BusinessCredit[];
    total?: number;
  };
  message?: string;
  error?: string;
};

type LinkedUser = {
  _id: string;
  name: string;
  email: string;
  role: string;
  subRole?: string;
  isOwner?: boolean;
  isStaff?: boolean;
};

type LinkedUsersResponse = {
  success: boolean;
  data?: {
    businessAnchor: {
      _id: string;
      name: string;
      companyName: string;
      businessNumber: string;
      businessType: string;
    };
    users: LinkedUser[];
    stats: {
      userCount: number;
      requestCount: number;
      childAnchorCount: number;
    };
  };
  message?: string;
  error?: string;
};

type ReconcileSummary = {
  scope: string;
  mode: "dry-run" | "execute";
  targetAnchors: number;
  requestsChecked: number;
  target: {
    requestSpendCorrections: number;
    requestSpendInsertions: number;
    shippingSpendInsertions: number;
  };
  applied: {
    correctedCount: number;
    insertedRequestSpendCount: number;
    insertedShippingSpendCount: number;
  };
  changedAnchors: Array<{
    anchorId: string;
    anchorName: string;
    targetCount: number;
    requestSpendCorrections: number;
    requestSpendInsertions: number;
    shippingSpendInsertions: number;
  }>;
};

type ReconcileResponse = {
  success: boolean;
  data?: ReconcileSummary;
  message?: string;
  error?: string;
};

type ReconcileHistoryResponse = {
  success: boolean;
  data?: {
    items: Array<{
      _id: string;
      action: string;
      createdAt?: string;
      actor?: { _id?: string; name?: string; email?: string };
      details?: ReconcileSummary | null;
    }>;
  };
  message?: string;
  error?: string;
};

const formatMoney = (value: number) => {
  try {
    return Number(value || 0).toLocaleString("ko-KR");
  } catch {
    return String(value || 0);
  }
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

const getBusinessTypeLabel = (type?: string) => {
  switch (type) {
    case "requestor":
      return "의뢰자";
    case "salesman":
      return "영업자";
    case "manufacturer":
      return "제조사";
    case "devops":
      return "개발운영사";
    default:
      return type || "미분류";
  }
};

const getBusinessTypeBadgeClass = (type?: string) => {
  switch (type) {
    case "requestor":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "salesman":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "manufacturer":
      return "bg-slate-100 text-slate-700 border-slate-200";
    case "devops":
      return "bg-violet-100 text-violet-700 border-violet-200";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
};

const getCreditBreakdown = (business?: BusinessCredit | null) => {
  const paidCredit = Number(
    business?.paidCredit ?? business?.paidBalance ?? 0,
  );
  const bonusRequestCredit = Number(business?.bonusRequestCredit ?? 0);
  const bonusShippingCredit = Number(business?.bonusShippingCredit ?? 0);
  const totalBalance = Number(
    business?.balance ??
      paidCredit + bonusRequestCredit + bonusShippingCredit,
  );

  const spentPaid = Number(business?.spentPaidAmount ?? 0);
  const spentBonusRequest = Number(business?.spentBonusRequestAmount ?? 0);
  const spentBonusShipping = Number(business?.spentBonusShippingAmount ?? 0);
  const totalSpent = Number(
    business?.spentAmount ??
      spentPaid + spentBonusRequest + spentBonusShipping,
  );

  return {
    paidCredit,
    bonusRequestCredit,
    bonusShippingCredit,
    totalBalance,
    spentPaid,
    spentBonusRequest,
    spentBonusShipping,
    totalSpent,
  };
};

export default function AdminBusinessPage() {
  const { token } = useAuthStore();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const initialQuery = String(searchParams.get("q") || "").trim();
  const focusAnchorId = String(searchParams.get("focusAnchorId") || "").trim();
  const [search, setSearch] = useState(initialQuery);
  const [typeFilter, setTypeFilter] = useState("all");
  const [detailDialog, setDetailDialog] = useState<{
    open: boolean;
    business: BusinessCredit | null;
  }>({
    open: false,
    business: null,
  });

  const [reconcileDialog, setReconcileDialog] = useState<{
    open: boolean;
    loading: boolean;
    summary: ReconcileSummary | null;
    history: Array<{
      _id: string;
      action: string;
      createdAt?: string;
      actor?: { _id?: string; name?: string; email?: string };
      details?: ReconcileSummary | null;
    }>;
    error: string | null;
  }>({
    open: false,
    loading: false,
    summary: null,
    history: [],
    error: null,
  });

  // 연결된 사용자 목록 다이얼로그 상태
  const [linkedUsersDialog, setLinkedUsersDialog] = useState<{
    open: boolean;
    business: BusinessCredit | null;
    users: LinkedUser[];
    stats: {
      userCount: number;
      requestCount: number;
      childAnchorCount: number;
    } | null;
    loading: boolean;
    error: string | null;
  }>({
    open: false,
    business: null,
    users: [],
    stats: null,
    loading: false,
    error: null,
  });

  // 삭제 확인 다이얼로그 상태
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    business: BusinessCredit | null;
    userCount: number;
  }>({ open: false, business: null, userCount: 0 });

  useEffect(() => {
    const q = String(searchParams.get("q") || "").trim();
    if (q) setSearch(q);
  }, [searchParams]);

  useEffect(() => {
    const shouldOpenReconcile =
      String(searchParams.get("reconcile") || "").trim() === "1";
    if (!shouldOpenReconcile) return;
    setReconcileDialog((prev) => ({ ...prev, open: true }));
    void loadReconcileData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // 연결된 사용자 목록 조회
  const fetchLinkedUsers = async (businessAnchorId: string) => {
    const res = await apiFetch<LinkedUsersResponse>({
      path: `/api/admin/businesses/${businessAnchorId}/linked-users`,
      method: "GET",
      token,
    });
    if (!res.ok || !res.data?.success) {
      throw new Error(
        res.data?.message ||
          res.data?.error ||
          "연결된 사용자 조회에 실패했습니다.",
      );
    }
    return res.data.data;
  };

  const loadReconcileData = async () => {
    setReconcileDialog((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const [checkRes, historyRes] = await Promise.all([
        apiFetch<ReconcileResponse>({
          path: "/api/admin/businesses/credit-reconcile/check?scope=all-requestors",
          method: "GET",
          token,
        }),
        apiFetch<ReconcileHistoryResponse>({
          path: "/api/admin/businesses/credit-reconcile/history?limit=20",
          method: "GET",
          token,
        }),
      ]);

      if (!checkRes.ok || !checkRes.data?.success || !checkRes.data?.data) {
        throw new Error(
          checkRes.data?.message ||
            checkRes.data?.error ||
            "누락 확인 조회에 실패했습니다.",
        );
      }

      if (!historyRes.ok || !historyRes.data?.success) {
        throw new Error(
          historyRes.data?.message ||
            historyRes.data?.error ||
            "업데이트 이력 조회에 실패했습니다.",
        );
      }

      setReconcileDialog((prev) => ({
        ...prev,
        loading: false,
        summary: checkRes.data?.data || null,
        history: historyRes.data?.data?.items || [],
        error: null,
      }));
    } catch (error: unknown) {
      setReconcileDialog((prev) => ({
        ...prev,
        loading: false,
        error: getErrorMessage(error, "누락 확인 중 오류가 발생했습니다."),
      }));
    }
  };



  // 삭제 버튼 클릭 핸들러
  const handleDeleteClick = async (business: BusinessCredit) => {
    if (!business.businessAnchorId) return;

    setLinkedUsersDialog({
      open: true,
      business,
      users: [],
      stats: null,
      loading: true,
      error: null,
    });

    try {
      const data = await fetchLinkedUsers(business.businessAnchorId);
      setLinkedUsersDialog({
        open: true,
        business,
        users: data?.users || [],
        stats: data?.stats || null,
        loading: false,
        error: null,
      });
    } catch (error: unknown) {
      setLinkedUsersDialog({
        open: true,
        business,
        users: [],
        stats: null,
        loading: false,
        error: getErrorMessage(error, "연결된 사용자 조회에 실패했습니다."),
      });
    }
  };

  // 삭제 mutation
  const deleteMutation = useMutation({
    mutationFn: async (businessAnchorId: string) => {
      const res = await apiFetch<{
        success: boolean;
        message?: string;
        error?: string;
      }>({
        path: `/api/admin/businesses/${businessAnchorId}`,
        method: "DELETE",
        token,
      });
      if (!res.ok || !res.data?.success) {
        throw new Error(
          res.data?.message || res.data?.error || "삭제에 실패했습니다.",
        );
      }
      return res.data;
    },
    onSuccess: () => {
      toast({
        title: "사업자 삭제 완료",
        description: "사업자와 연결된 사용자가 성공적으로 삭제되었습니다.",
        variant: "default",
      });
      setConfirmDialog({ open: false, business: null, userCount: 0 });
      queryClient.invalidateQueries({
        queryKey: ["admin-business-page", token],
      });
    },
    onError: (error: Error) => {
      toast({
        title: "사업자 삭제 실패",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-business-page", token],
    enabled: Boolean(token),
    queryFn: async () => {
      const res = await apiFetch<ApiBusinessCreditsResponse>({
        path: "/api/admin/credits/businesses?limit=200&skip=0",
        method: "GET",
        token,
      });
      if (!res.ok || !res.data?.success) {
        const msg =
          res.data?.message ||
          res.data?.error ||
          "사업자 목록 조회에 실패했습니다.";
        throw new Error(msg);
      }
      return {
        items: res.data.data?.items || [],
        total: Number(res.data.data?.total || 0),
      };
    },
    retry: false,
  });



  const businesses = data?.items || [];

  const filteredBusinesses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return businesses.filter((business) => {
      const matchesType =
        typeFilter === "all" ||
        String(business.businessType || "") === typeFilter;
      if (!matchesType) return false;
      if (!q) return true;
      const hay = [
        business.name,
        business.companyName,
        business.businessNumber,
        business.ownerName,
        business.ownerEmail,
        business.businessAnchorId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [businesses, search, typeFilter]);

  const totalBusinesses = data?.total || businesses.length;
  const anchoredCount = businesses.filter((business) =>
    Boolean(business.businessAnchorId),
  ).length;
  const missingAnchorCount = totalBusinesses - anchoredCount;

  const requestorCount = businesses.filter(
    (business) => business.businessType === "requestor",
  ).length;
  const salesmanCount = businesses.filter(
    (business) => business.businessType === "salesman",
  ).length;
  const manufacturerCount = businesses.filter(
    (business) => business.businessType === "manufacturer",
  ).length;
  const devopsCount = businesses.filter(
    (business) => business.businessType === "devops",
  ).length;
  const detailCredit = getCreditBreakdown(detailDialog.business);

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 bg-gradient-subtle p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">사업자</h1>
          <p className="text-sm text-muted-foreground">
            BusinessAnchor를 중심으로 사업자 연결 상태와 크레딧을 확인합니다.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2">
                <Building2 className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">총 사업자</p>
                <p className="text-2xl font-bold">
                  {totalBusinesses.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-violet-100 p-2">
                <Anchor className="h-4 w-4 text-violet-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Anchor 연결</p>
                <p className="text-2xl font-bold">
                  {anchoredCount.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-100 p-2">
                <AlertCircle className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Anchor 미연결</p>
                <p className="text-2xl font-bold">
                  {missingAnchorCount.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-sky-100 p-2">
                <Wallet className="h-4 w-4 text-sky-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">표시 사업자</p>
                <p className="text-2xl font-bold">
                  {filteredBusinesses.length.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>BusinessAnchor 목록</CardTitle>
              <CardDescription>
                사업자명, 사업자번호, 대표 계정, anchor ID를 함께 확인합니다.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>관리자 전용</span>
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1 min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="사업자명 / 사업자번호 / anchor ID / 대표자 검색"
                className="pl-10"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {[
                ["all", "전체"],
                ["requestor", "의뢰자"],
                ["salesman", "영업자"],
                ["manufacturer", "제조사"],
                ["devops", "개발운영사"],
              ].map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={typeFilter === value ? "default" : "outline"}
                  onClick={() => setTypeFilter(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">불러오는 중...</div>
          ) : filteredBusinesses.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              표시할 사업자가 없습니다.
            </div>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
              {filteredBusinesses.map((business) => {
                const anchorId = String(business.businessAnchorId || "").trim();
                const isFocused =
                  Boolean(focusAnchorId) &&
                  String(anchorId || "").trim() === focusAnchorId;
                const credit = getCreditBreakdown(business);

                return (
                  <Card
                    key={business._id}
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      setDetailDialog({
                        open: true,
                        business,
                      })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setDetailDialog({
                          open: true,
                          business,
                        });
                      }
                    }}
                    className={`border-border/70 cursor-pointer transition hover:border-primary/40 hover:shadow-sm ${
                      isFocused ? "ring-2 ring-primary border-primary" : ""
                    }`}
                  >
                    <CardHeader className="space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <CardTitle className="truncate text-base">
                            {business.companyName || business.name}
                          </CardTitle>
                          <CardDescription className="mt-1 text-xs">
                            {business.name}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge
                            className={getBusinessTypeBadgeClass(
                              business.businessType,
                            )}
                          >
                            {getBusinessTypeLabel(business.businessType)}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClick(business);
                            }}
                            onKeyDown={(e) => e.stopPropagation()}
                            disabled={
                              deleteMutation.isPending ||
                              !business.businessAnchorId
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                        <div>
                          <div className="mb-0.5">사업자번호</div>
                          <div className="font-medium text-foreground">
                            {business.businessNumber || "-"}
                          </div>
                        </div>
                        <div>
                          <div className="mb-0.5">BusinessAnchor ID</div>
                          <div className="font-mono text-[11px] break-all text-foreground">
                            {anchorId || "-"}
                          </div>
                        </div>
                        <div>
                          <div className="mb-0.5">대표 계정</div>
                          <div className="font-medium text-foreground">
                            {business.ownerName || "-"}
                          </div>
                        </div>
                        <div>
                          <div className="mb-0.5">대표 이메일</div>
                          <div className="break-all font-medium text-foreground">
                            {business.ownerEmail || "-"}
                          </div>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">
                          크레딧 소비액 (유형별)
                        </div>
                        <div className="mt-1 text-xl font-bold">
                          {formatMoney(credit.totalSpent)}원
                        </div>
                        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                          <div>유료: {formatMoney(credit.spentPaid)}원</div>
                          <div>무료(의뢰): {formatMoney(credit.spentBonusRequest)}원</div>
                          <div>무료(배송): {formatMoney(credit.spentBonusShipping)}원</div>
                        </div>
                      </div>
                      <div className="rounded-lg border p-3">
                        <div className="text-xs text-muted-foreground">
                          크레딧 잔액 (유형별)
                        </div>
                        <div className="mt-1 text-xl font-bold">
                          {formatMoney(credit.totalBalance)}원
                        </div>
                        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                          <div>유료: {formatMoney(credit.paidCredit)}원</div>
                          <div>무료(의뢰): {formatMoney(credit.bonusRequestCredit)}원</div>
                          <div>무료(배송): {formatMoney(credit.bonusShippingCredit)}원</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 누락 확인 및 업데이트 다이얼로그 */}
      <Dialog
        open={reconcileDialog.open}
        onOpenChange={(open) =>
          setReconcileDialog((prev) => ({
            ...prev,
            open,
            error: open ? prev.error : null,
          }))
        }
      >
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>크레딧 업데이트</DialogTitle>
            <DialogDescription>
              의뢰자 전체를 검사하여 의뢰/배송 크레딧 소비 누락 건을 확인합니다.
            </DialogDescription>
          </DialogHeader>

          {reconcileDialog.loading ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              누락 현황 조회 중...
            </div>
          ) : reconcileDialog.error ? (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {reconcileDialog.error}
            </div>
          ) : reconcileDialog.summary ? (
            <div className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded border p-3">
                  <div className="text-xs text-muted-foreground">대상 사업자</div>
                  <div className="mt-1 text-lg font-semibold">
                    {reconcileDialog.summary.targetAnchors.toLocaleString()}개
                  </div>
                </div>
                <div className="rounded border p-3">
                  <div className="text-xs text-muted-foreground">점검 의뢰</div>
                  <div className="mt-1 text-lg font-semibold">
                    {reconcileDialog.summary.requestsChecked.toLocaleString()}건
                  </div>
                </div>
                <div className="rounded border p-3">
                  <div className="text-xs text-muted-foreground">변경 필요 사업자</div>
                  <div className="mt-1 text-lg font-semibold">
                    {reconcileDialog.summary.changedAnchors.length.toLocaleString()}개
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <div className="text-sm font-medium">누락 후보</div>
                <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
                  <div className="rounded bg-muted/40 p-2">
                    의뢰 업데이트 후보
                    <div className="font-semibold">
                      {reconcileDialog.summary.target.requestSpendCorrections.toLocaleString()}건
                    </div>
                  </div>
                  <div className="rounded bg-muted/40 p-2">
                    의뢰 삽입 후보
                    <div className="font-semibold">
                      {reconcileDialog.summary.target.requestSpendInsertions.toLocaleString()}건
                    </div>
                  </div>
                  <div className="rounded bg-muted/40 p-2">
                    배송 삽입 후보
                    <div className="font-semibold">
                      {reconcileDialog.summary.target.shippingSpendInsertions.toLocaleString()}건
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <div className="text-sm font-medium">최근 업데이트 이력</div>
                {reconcileDialog.history.length === 0 ? (
                  <div className="mt-2 text-sm text-muted-foreground">이력이 없습니다.</div>
                ) : (
                  <div className="mt-2 space-y-2">
                    {reconcileDialog.history.slice(0, 4).map((row) => (
                      <div key={row._id} className="rounded border p-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium">
                            {row.action === "BUSINESS_CREDIT_RECONCILE_EXECUTE"
                              ? "업데이트 실행"
                              : "누락 확인"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {row.createdAt
                              ? new Date(row.createdAt).toLocaleString("ko-KR")
                              : "-"}
                          </div>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          실행자: {row.actor?.name || "-"} ({row.actor?.email || "-"})
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={loadReconcileData}
              disabled={reconcileDialog.loading}
            >
              다시 확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 사업자 상세 다이얼로그 */}
      <Dialog
        open={detailDialog.open}
        onOpenChange={(open) =>
          setDetailDialog((prev) => ({
            ...prev,
            open,
            business: open ? prev.business : null,
          }))
        }
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>사업자 세부 정보</DialogTitle>
            <DialogDescription>
              선택한 사업자의 등록 정보와 계정 정보를 확인합니다.
            </DialogDescription>
          </DialogHeader>

          {detailDialog.business ? (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="text-lg font-semibold break-words">
                  {detailDialog.business.companyName || detailDialog.business.name}
                </div>
                <div className="mt-1 text-sm text-muted-foreground break-all">
                  Anchor ID: {detailDialog.business.businessAnchorId || "-"}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">사업자명</div>
                  <div className="mt-1 font-medium break-words">
                    {detailDialog.business.name || "-"}
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">사업자번호</div>
                  <div className="mt-1 font-medium break-words">
                    {detailDialog.business.businessNumber || "-"}
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">사업자 유형</div>
                  <div className="mt-1 font-medium">
                    {getBusinessTypeLabel(detailDialog.business.businessType)}
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">대표자명(사업자 정보)</div>
                  <div className="mt-1 font-medium break-words">
                    {detailDialog.business.representativeName || "-"}
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">대표 계정명</div>
                  <div className="mt-1 font-medium break-words">
                    {detailDialog.business.ownerName || "-"}
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">대표 계정 이메일</div>
                  <div className="mt-1 font-medium break-all">
                    {detailDialog.business.ownerEmail || "-"}
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">전화번호</div>
                  <div className="mt-1 font-medium break-words">
                    {detailDialog.business.phoneNumber || "-"}
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">사업자 이메일</div>
                  <div className="mt-1 font-medium break-all">
                    {detailDialog.business.businessEmail || "-"}
                  </div>
                </div>

                <div className="rounded-lg border p-3 sm:col-span-2">
                  <div className="text-xs text-muted-foreground">주소</div>
                  <div className="mt-1 font-medium break-words">
                    {[
                      detailDialog.business.zipCode
                        ? `(${detailDialog.business.zipCode})`
                        : "",
                      detailDialog.business.address || "",
                      detailDialog.business.addressDetail || "",
                    ]
                      .filter(Boolean)
                      .join(" ") || "-"}
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">업태</div>
                  <div className="mt-1 font-medium break-words">
                    {detailDialog.business.businessCategory || "-"}
                  </div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">종목</div>
                  <div className="mt-1 font-medium break-words">
                    {detailDialog.business.businessItem || "-"}
                  </div>
                </div>

                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">개업일</div>
                  <div className="mt-1 font-medium break-words">
                    {detailDialog.business.startDate || "-"}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">크레딧 소비액 (합계)</div>
                <div className="mt-1 text-lg font-semibold">
                  {formatMoney(detailCredit.totalSpent)}원
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded border bg-muted/30 p-2">
                    <div className="text-[11px] text-muted-foreground">유료 소비</div>
                    <div className="mt-0.5 font-semibold">
                      {formatMoney(detailCredit.spentPaid)}원
                    </div>
                  </div>
                  <div className="rounded border bg-muted/30 p-2">
                    <div className="text-[11px] text-muted-foreground">무료 소비 (의뢰)</div>
                    <div className="mt-0.5 font-semibold">
                      {formatMoney(detailCredit.spentBonusRequest)}원
                    </div>
                  </div>
                  <div className="rounded border bg-muted/30 p-2">
                    <div className="text-[11px] text-muted-foreground">무료 소비 (배송)</div>
                    <div className="mt-0.5 font-semibold">
                      {formatMoney(detailCredit.spentBonusShipping)}원
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">크레딧 잔액 (합계)</div>
                <div className="mt-1 text-lg font-semibold">
                  {formatMoney(detailCredit.totalBalance)}원
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded border bg-muted/30 p-2">
                    <div className="text-[11px] text-muted-foreground">유료 잔액</div>
                    <div className="mt-0.5 font-semibold">
                      {formatMoney(detailCredit.paidCredit)}원
                    </div>
                  </div>
                  <div className="rounded border bg-muted/30 p-2">
                    <div className="text-[11px] text-muted-foreground">무료 잔액 (의뢰)</div>
                    <div className="mt-0.5 font-semibold">
                      {formatMoney(detailCredit.bonusRequestCredit)}원
                    </div>
                  </div>
                  <div className="rounded border bg-muted/30 p-2">
                    <div className="text-[11px] text-muted-foreground">무료 잔액 (배송)</div>
                    <div className="mt-0.5 font-semibold">
                      {formatMoney(detailCredit.bonusShippingCredit)}원
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* 연결된 사용자 목록 다이얼로그 */}
      <Dialog
        open={linkedUsersDialog.open}
        onOpenChange={(open) =>
          setLinkedUsersDialog((prev) => ({ ...prev, open }))
        }
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>사업자 삭제 확인</DialogTitle>
            <DialogDescription>
              {linkedUsersDialog.business && (
                <>
                  <span className="font-medium">
                    {linkedUsersDialog.business.companyName ||
                      linkedUsersDialog.business.name}
                  </span>{" "}
                  사업자와 연결된 사용자 목록입니다.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {linkedUsersDialog.loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                연결된 사용자 조회 중...
              </span>
            </div>
          ) : linkedUsersDialog.error ? (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
              {linkedUsersDialog.error}
            </div>
          ) : (
            <div className="space-y-4">
              {/* 통계 */}
              {linkedUsersDialog.stats && (
                <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted p-3 text-center text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">
                      연결 사용자
                    </div>
                    <div className="font-semibold">
                      {linkedUsersDialog.stats.userCount}명
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      관련 의뢰
                    </div>
                    <div className="font-semibold">
                      {linkedUsersDialog.stats.requestCount}건
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      하위 사업자
                    </div>
                    <div className="font-semibold">
                      {linkedUsersDialog.stats.childAnchorCount}개
                    </div>
                  </div>
                </div>
              )}

              {/* 사용자 목록 */}
              {linkedUsersDialog.users.length > 0 ? (
                <div className="max-h-60 overflow-y-auto rounded-lg border">
                  <table className="w-full text-sm table-fixed">
                    <colgroup>
                      <col className="w-[80px]" />
                      <col />
                      <col className="w-[70px]" />
                    </colgroup>
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">
                          이름
                        </th>
                        <th className="px-3 py-2 text-left font-medium">
                          이메일
                        </th>
                        <th className="px-3 py-2 text-center font-medium">
                          구분
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {linkedUsersDialog.users.map((user) => (
                        <tr key={user._id} className="border-t">
                          <td className="px-3 py-2 truncate">
                            {user.name || "-"}
                          </td>
                          <td
                            className="px-3 py-2 text-muted-foreground truncate"
                            title={user.email}
                          >
                            {user.email}
                          </td>
                          <td className="px-3 py-2 text-center whitespace-nowrap">
                            {user.isOwner ? (
                              <Badge
                                variant="default"
                                className="text-xs whitespace-nowrap"
                              >
                                대표
                              </Badge>
                            ) : user.isStaff ? (
                              <Badge
                                variant="secondary"
                                className="text-xs whitespace-nowrap"
                              >
                                직원
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-xs whitespace-nowrap"
                              >
                                일반
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-lg bg-muted p-4 text-center text-sm text-muted-foreground">
                  연결된 사용자가 없습니다.
                </div>
              )}

              {/* 경고 메시지 */}
              {linkedUsersDialog.stats &&
                linkedUsersDialog.stats.childAnchorCount > 0 && (
                  <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700">
                    하위 소개 사업자가{" "}
                    {linkedUsersDialog.stats.childAnchorCount}개 존재하여 삭제할
                    수 없습니다. 하위 사업자를 먼저 삭제해주세요.
                  </div>
                )}

              {/* 삭제 안내 */}
              {linkedUsersDialog.stats &&
                linkedUsersDialog.stats.childAnchorCount === 0 && (
                  <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                    삭제 시 사업자와 연결된 {linkedUsersDialog.stats.userCount}
                    명의 사용자가 모두 함께 삭제됩니다. 관련 의뢰{" "}
                    {linkedUsersDialog.stats.requestCount}건은 보존되며 사업자
                    정보만 분리됩니다.
                  </div>
                )}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() =>
                setLinkedUsersDialog({
                  open: false,
                  business: null,
                  users: [],
                  stats: null,
                  loading: false,
                  error: null,
                })
              }
              disabled={deleteMutation.isPending}
            >
              취소
            </Button>
            {linkedUsersDialog.stats &&
              linkedUsersDialog.stats.childAnchorCount === 0 && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    setLinkedUsersDialog((prev) => ({ ...prev, open: false }));
                    setConfirmDialog({
                      open: true,
                      business: linkedUsersDialog.business,
                      userCount: linkedUsersDialog.stats?.userCount || 0,
                    });
                  }}
                  disabled={deleteMutation.isPending}
                >
                  계속 진행
                </Button>
              )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 최종 삭제 확인 다이얼로그 */}
      <ConfirmDialog
        open={confirmDialog.open}
        title="사업자 및 사용자 삭제"
        description={
          confirmDialog.business
            ? `"${confirmDialog.business.companyName || confirmDialog.business.name}" 사업자와 연결된 ${confirmDialog.userCount}명의 사용자를 함께 삭제합니다. 이 작업은 되돌릴 수 없습니다.`
            : "사업자와 연결된 사용자를 함께 삭제합니다."
        }
        confirmLabel={deleteMutation.isPending ? "삭제 중..." : "삭제 실행"}
        cancelLabel="취소"
        onConfirm={() => {
          if (confirmDialog.business?.businessAnchorId) {
            deleteMutation.mutate(confirmDialog.business.businessAnchorId);
          }
        }}
        onCancel={() =>
          setConfirmDialog({ open: false, business: null, userCount: 0 })
        }
      />
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch } from "@/shared/api/apiClient";
import { SnapshotRecalcAllButton } from "@/shared/components/SnapshotRecalcAllButton";
import { useAuthStore } from "@/store/useAuthStore";
import { usePeriodStore, periodToRangeQuery } from "@/store/usePeriodStore";

const PERIOD_LABEL: Record<string, string> = {
  "7d": "최근 7일",
  "30d": "최근 30일",
  lastMonth: "지난달",
  thisMonth: "이번달",
  "90d": "최근 90일",
};

type ApiGroupLeader = {
  _id: string;
  role?: "requestor" | "salesman";
  name?: string;
  email?: string;
  organization?: string;
  active?: boolean;
  createdAt?: string;
};

type ApiGroupRow = {
  leader: ApiGroupLeader;
  memberCount: number;
  groupMemberCount?: number;
  groupTotalOrders?: number;
  effectiveUnitPrice?: number;
  commissionAmount?: number;
  snapshotComputedAt?: string | null;
  unitPriceDebug?: any;
};

type ApiGroupListResponse = {
  success: boolean;
  data?: {
    overview: {
      ymd?: string;
      totalGroups: number;
      totalAccounts: number;
      totalGroupOrders?: number;
      avgEffectiveUnitPrice?: number;
      requestor: {
        groupCount: number;
        avgAccountsPerGroup: number;
        netNewGroups: number;
        avgRevenuePerGroup: number;
        totalRevenueAmount: number;
        totalBonusAmount?: number;
        totalOrders?: number;
      };
      salesman: {
        groupCount: number;
        avgAccountsPerGroup: number;
        netNewGroups: number;
        avgCommissionPerGroup: number;
        totalCommissionAmount: number;
        totalReferredRevenueAmount?: number;
        totalReferredBonusAmount?: number;
        totalReferralOrders?: number;
      };
    };
    groups?: ApiGroupRow[];
  };
  message?: string;
  error?: string;
};

const roleBadge = (role?: string) => {
  if (role === "salesman") {
    return (
      <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
        영업자
      </Badge>
    );
  }
  return (
    <Badge className="bg-blue-600 text-white hover:bg-blue-600">의뢰자</Badge>
  );
};

const formatMoney = (n: number) => {
  const v = Number(n || 0);
  try {
    return v.toLocaleString("ko-KR");
  } catch {
    return String(v);
  }
};

type ApiTreeNode = {
  _id: string;
  role?: "requestor" | "salesman";
  name?: string;
  email?: string;
  organization?: string;
  organizationId?: string;
  active?: boolean;
  createdAt?: string;
  approvedAt?: string;
  updatedAt?: string;
  referredByUserId?: string | null;
  lastMonthOrders?: number;
  lastMonthPaidOrders?: number;
  lastMonthBonusOrders?: number;
  lastMonthPaidRevenue?: number;
  lastMonthBonusRevenue?: number;
  commissionAmount?: number;
  directCommissionAmount?: number;
  level1CommissionAmount?: number;
  children?: ApiTreeNode[];
};

type ApiGroupTreeResponse = {
  success: boolean;
  data?: {
    leader?: ApiGroupLeader;
    memberCount?: number;
    groupTotalOrders?: number;
    effectiveUnitPrice?: number;
    commissionAmount?: number;
    unitPriceDebug?: any;
    snapshot?: {
      ymd?: string;
      groupMemberCount?: number;
      groupTotalOrders?: number;
      computedAt?: string | null;
    } | null;
    tree?: ApiTreeNode;
  };
  message?: string;
  error?: string;
};

const TreeNode = ({
  node,
  depth,
  onSelect,
}: {
  node: ApiTreeNode;
  depth: number;
  onSelect: (node: ApiTreeNode) => void;
}) => {
  const indent = depth * 16;
  const lastMonthOrders = Number(node.lastMonthOrders || 0);
  const commissionAmount = Number(node.commissionAmount || 0);
  const directCommissionAmount = Number(node.directCommissionAmount ?? -1);
  const level1CommissionAmount = Number(node.level1CommissionAmount ?? -1);
  const hasCommissionBreakdown =
    directCommissionAmount >= 0 && level1CommissionAmount >= 0;
  const isSalesman = String(node.role || "") === "salesman";

  return (
    <div style={{ paddingLeft: indent }} className="relative">
      {depth > 0 ? (
        <>
          <div className="absolute left-[7px] top-0 bottom-0 w-px bg-border" />
          <div className="absolute left-[7px] top-1/2 h-px w-3 -translate-y-1/2 bg-border" />
        </>
      ) : null}
      <button
        type="button"
        onClick={() => onSelect(node)}
        className="w-full text-left"
      >
        <div className="flex items-center justify-between gap-2 rounded-md border border-transparent hover:border-border hover:bg-muted/40 px-2 py-1">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">
              {node.organization || node.name || node.email || node._id}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {node.email || ""}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {roleBadge(node.role)}
            <Badge variant={node.active ? "default" : "secondary"}>
              {node.active ? "활성" : "비활성"}
            </Badge>
          </div>
        </div>
      </button>
    </div>
  );
};

export default function AdminReferralGroupsPage() {
  const { token } = useAuthStore();
  const { period } = usePeriodStore();
  const queryClient = useQueryClient();
  const isDev = import.meta.env.DEV;
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<
    "all" | "requestor" | "salesman"
  >("all");
  const [selectedLeaderId, setSelectedLeaderId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<ApiTreeNode | null>(null);
  const [visibleCount, setVisibleCount] = useState(6);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const listSentinelRef = useRef<HTMLDivElement | null>(null);
  const treeScrollRef = useRef<HTMLDivElement | null>(null);
  const treeSentinelRef = useRef<HTMLDivElement | null>(null);
  const [treeVisibleCount, setTreeVisibleCount] = useState(10);
  const [sortKey, setSortKey] = useState<"members" | "orders" | "created">(
    "members",
  );
  const periodLabel = PERIOD_LABEL[period] || period;

  const { data: groupList, isLoading: isGroupListLoading } = useQuery({
    queryKey: ["admin-referral-groups", period],
    enabled: Boolean(token),
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (isDev) qs.set("refresh", "1");
      const rangeQ = periodToRangeQuery(period);
      if (rangeQ) {
        const rp = new URLSearchParams(rangeQ.replace(/^\?/, ""));
        rp.forEach((v, k) => qs.set(k, v));
      }
      const res = await apiFetch<ApiGroupListResponse>({
        path: `/api/admin/referral-groups?${qs.toString()}`,
        method: "GET",
        token,
        headers:
          token === "MOCK_DEV_TOKEN"
            ? {
                "x-mock-role": "admin",
              }
            : undefined,
      });
      if (!res.ok || !res.data?.success) {
        const msg =
          res.data?.message || res.data?.error || "조회에 실패했습니다.";
        throw new Error(msg);
      }
      return {
        overview: res.data?.data?.overview || null,
        groups: res.data?.data?.groups || [],
      };
    },
    retry: false,
  });

  const handleSnapshotSuccess = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["admin-referral-groups", period],
      }),
      queryClient.invalidateQueries({
        queryKey: ["admin-referral-group-tree"],
      }),
    ]);
  };

  const groups = groupList?.groups || [];
  const overview = groupList?.overview || null;
  const requestorGroupCount = Number(overview?.requestor?.groupCount || 0);
  const avgPaidRevenuePerGroup = requestorGroupCount
    ? Math.round(
        Number(overview?.requestor?.totalRevenueAmount || 0) /
          requestorGroupCount,
      )
    : 0;
  const avgBonusRevenuePerGroup = requestorGroupCount
    ? Math.round(
        Number(overview?.requestor?.totalBonusAmount || 0) /
          requestorGroupCount,
      )
    : 0;

  const salesmanCommissionRatio = useMemo(() => {
    const revenue = Number(overview?.salesman?.totalReferredRevenueAmount || 0);
    const commission = Number(overview?.salesman?.totalCommissionAmount || 0);
    if (!revenue || revenue <= 0) return 0;
    return (commission / revenue) * 100;
  }, [
    overview?.salesman?.totalReferredRevenueAmount,
    overview?.salesman?.totalCommissionAmount,
  ]);

  // 데이터가 새로 바뀌면 기본 노출 개수 리셋
  useEffect(() => {
    setVisibleCount(6);
  }, [groupList]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = groups.filter((g) => {
      const leader = g.leader || ({} as any);
      if (roleFilter !== "all" && String(leader.role || "") !== roleFilter) {
        return false;
      }
      if (!q) return true;
      const hay =
        `${leader.organization || ""} ${leader.name || ""} ${leader.email || ""}`
          .trim()
          .toLowerCase();
      return hay.includes(q);
    });

    const arr = [...base];
    arr.sort((a, b) => {
      if (sortKey === "orders") {
        return (
          Number(b.groupTotalOrders || 0) - Number(a.groupTotalOrders || 0)
        );
      }
      if (sortKey === "created") {
        const at = new Date(a?.leader?.createdAt || 0).getTime();
        const bt = new Date(b?.leader?.createdAt || 0).getTime();
        return bt - at;
      }
      const am = Number(a.groupMemberCount || a.memberCount || 0);
      const bm = Number(b.groupMemberCount || b.memberCount || 0);
      return bm - am;
    });
    return arr;
  }, [groups, roleFilter, search, sortKey]);

  const visibleGroups = useMemo(() => {
    return filteredGroups.slice(0, Math.max(0, visibleCount));
  }, [filteredGroups, visibleCount]);

  useEffect(() => {
    setVisibleCount(6);
    setSelectedLeaderId(null);
    setSelectedNode(null);
  }, [roleFilter, search]);

  useEffect(() => {
    const sentinel = listSentinelRef.current;
    if (!sentinel) return;
    if (visibleGroups.length >= filteredGroups.length) return;

    const root = listScrollRef.current;
    if (!root) return;

    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (!hit) return;
        setVisibleCount((prev) => Math.min(prev + 6, filteredGroups.length));
      },
      { root, rootMargin: "400px", threshold: 0 },
    );

    io.observe(sentinel);
    return () => io.disconnect();
  }, [filteredGroups.length, visibleGroups.length]);

  const effectiveLeaderId =
    selectedLeaderId || (visibleGroups[0]?.leader?._id ?? null);

  const selectedGroupRow = useMemo(() => {
    if (!effectiveLeaderId) return null;
    const id = String(effectiveLeaderId);
    const all = groups || [];
    return all.find((g) => String(g?.leader?._id || "") === id) || null;
  }, [effectiveLeaderId, groups]);

  const { data: treeData, isLoading: isTreeLoading } = useQuery({
    queryKey: ["admin-referral-group-tree", effectiveLeaderId],
    enabled: Boolean(token && effectiveLeaderId),
    queryFn: async () => {
      const res = await apiFetch<ApiGroupTreeResponse>({
        path: `/api/admin/referral-groups/${effectiveLeaderId}${isDev ? "?refresh=1" : ""}`,
        method: "GET",
        token,
        headers:
          token === "MOCK_DEV_TOKEN"
            ? {
                "x-mock-role": "admin",
              }
            : undefined,
      });
      if (!res.ok || !res.data?.success) {
        const msg =
          res.data?.message || res.data?.error || "조회에 실패했습니다.";
        throw new Error(msg);
      }
      return res.data?.data;
    },
    retry: false,
  });

  const flattenedTree = useMemo(() => {
    const root = treeData?.tree;
    if (!root) return [] as Array<{ node: ApiTreeNode; depth: number }>;
    const out: Array<{ node: ApiTreeNode; depth: number }> = [];
    const stack: Array<{ node: ApiTreeNode; depth: number }> = [
      { node: root, depth: 0 },
    ];
    while (stack.length) {
      const cur = stack.shift();
      if (!cur) break;
      out.push(cur);
      const children = Array.isArray(cur.node.children)
        ? cur.node.children
        : [];
      const sortedChildren = [...children].sort(
        (a, b) =>
          Number(b?.lastMonthOrders || 0) - Number(a?.lastMonthOrders || 0),
      );
      for (let i = 0; i < sortedChildren.length; i += 1) {
        stack.push({ node: sortedChildren[i], depth: cur.depth + 1 });
      }
    }
    return out;
  }, [treeData?.tree]);

  // 수수료 패널: 직접리퍼럴(영업자가 직접 소개한 의뢰자) 목록
  // 트리 루트가 영업자인 경우, 루트의 직계 자식 중 의뢰자
  const directReferralRequestors = useMemo(() => {
    const root = treeData?.tree;
    if (!root || String(root.role || "") !== "salesman")
      return [] as ApiTreeNode[];
    return (root.children || []).filter(
      (c) => String(c?.role || "") === "requestor",
    );
  }, [treeData?.tree]);

  // 수수료 패널: 간접리퍼럴(영업자가 소개한 하위 영업자들의 의뢰자) 목록
  // 루트의 직계 자식 중 영업자들의 직계 자식 중 의뢰자
  const indirectReferralRequestors = useMemo(() => {
    const root = treeData?.tree;
    if (!root || String(root.role || "") !== "salesman")
      return [] as Array<{ requestor: ApiTreeNode; via: ApiTreeNode }>;
    const result: Array<{ requestor: ApiTreeNode; via: ApiTreeNode }> = [];
    const childSalesmen = (root.children || []).filter(
      (c) => String(c?.role || "") === "salesman",
    );
    for (const salesman of childSalesmen) {
      const requestors = (salesman.children || []).filter(
        (c) => String(c?.role || "") === "requestor",
      );
      for (const r of requestors) {
        result.push({ requestor: r, via: salesman });
      }
    }
    return result;
  }, [treeData?.tree]);

  const visibleTreeRows = useMemo(() => {
    return flattenedTree.slice(0, Math.max(0, treeVisibleCount));
  }, [flattenedTree, treeVisibleCount]);

  useEffect(() => {
    setTreeVisibleCount(10);
  }, [effectiveLeaderId, treeData]);

  useEffect(() => {
    const sentinel = treeSentinelRef.current;
    if (!sentinel) return;
    if (visibleTreeRows.length >= flattenedTree.length) return;

    const root = treeScrollRef.current;
    if (!root) return;

    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (!hit) return;
        setTreeVisibleCount((prev) =>
          Math.min(prev + 10, flattenedTree.length),
        );
      },
      { root, rootMargin: "200px", threshold: 0 },
    );

    io.observe(sentinel);
    return () => io.disconnect();
  }, [flattenedTree.length, visibleTreeRows.length]);

  const directCommissionSum = useMemo(() => {
    const sumPaidRevenue = (directReferralRequestors || []).reduce(
      (acc, r) => acc + Number(r.lastMonthPaidRevenue || 0),
      0,
    );
    return Math.round(sumPaidRevenue * 0.05);
  }, [directReferralRequestors]);

  const indirectCommissionSum = useMemo(() => {
    const sumPaidRevenue = (indirectReferralRequestors || []).reduce(
      (acc, row) => acc + Number(row.requestor?.lastMonthPaidRevenue || 0),
      0,
    );
    return Math.round(sumPaidRevenue * 0.025);
  }, [indirectReferralRequestors]);

  const totalCommissionSum = directCommissionSum + indirectCommissionSum;

  return (
    <div className="h-screen max-h-screen overflow-hidden p-4 flex flex-col gap-4">
      <div className="flex items-center justify-end gap-2">
        <SnapshotRecalcAllButton
          token={token}
          periodKey={period}
          className="h-9"
          onSuccess={handleSnapshotSuccess}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base">의뢰자 그룹</CardTitle>
              {roleBadge("requestor")}
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3 text-right">
            <div className="rounded-xl border p-3">
              <div className="text-xs text-muted-foreground">
                그룹수 / 의뢰건수
              </div>
              <div className="text-2xl font-semibold tracking-tight">
                {Number(overview?.requestor?.groupCount || 0).toLocaleString()}
                <span className="text-base font-normal text-muted-foreground mx-1">
                  /
                </span>
                {Number(overview?.requestor?.totalOrders || 0).toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">
                평균 계정수{" "}
                {Number(
                  overview?.requestor?.avgAccountsPerGroup || 0,
                ).toLocaleString()}{" "}
                · 순증가{" "}
                {Number(
                  overview?.requestor?.netNewGroups || 0,
                ).toLocaleString()}
              </div>
            </div>
            <div className="rounded-xl border p-3">
              <div className="text-xs text-muted-foreground">
                그룹당 평균 매출
              </div>
              <div className="text-3xl font-semibold tracking-tight">
                {formatMoney(
                  Number(overview?.requestor?.avgRevenuePerGroup || 0),
                )}
                원
              </div>
              <div className="text-xs text-muted-foreground">
                유료 {formatMoney(avgPaidRevenuePerGroup)}원
              </div>
              <div className="text-xs text-muted-foreground">
                무료 {formatMoney(avgBonusRevenuePerGroup)}원
              </div>
            </div>
            <div className="rounded-xl border p-3">
              <div className="text-xs text-muted-foreground">매출 총액</div>
              <div className="text-2xl font-semibold tracking-tight">
                {formatMoney(
                  Number(overview?.requestor?.totalRevenueAmount || 0) +
                    Number(overview?.requestor?.totalBonusAmount || 0),
                )}
                원
              </div>
              <div className="text-xs text-muted-foreground">
                유료{" "}
                {formatMoney(
                  Number(overview?.requestor?.totalRevenueAmount || 0),
                )}
                원
              </div>
              <div className="text-xs text-muted-foreground">
                무료{" "}
                {formatMoney(
                  Number(overview?.requestor?.totalBonusAmount || 0),
                )}
                원
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-base">영업자 그룹</CardTitle>
                {roleBadge("salesman")}
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3 text-right">
            <div className="rounded-xl border p-3">
              <div className="text-xs text-muted-foreground">
                그룹수 / 의뢰건수
              </div>
              <div className="text-2xl font-semibold tracking-tight">
                {Number(overview?.salesman?.groupCount || 0).toLocaleString()}
                <span className="text-base font-normal text-muted-foreground mx-1">
                  /
                </span>
                {Number(
                  overview?.salesman?.totalReferralOrders || 0,
                ).toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">
                평균 계정수{" "}
                {Number(
                  overview?.salesman?.avgAccountsPerGroup || 0,
                ).toLocaleString()}{" "}
                · 순증가{" "}
                {Number(overview?.salesman?.netNewGroups || 0).toLocaleString()}
              </div>
            </div>
            <div className="rounded-xl border p-3">
              <div className="text-xs text-muted-foreground">
                그룹당 평균 수수료
              </div>
              <div className="text-2xl font-semibold tracking-tight">
                {formatMoney(
                  Number(overview?.salesman?.avgCommissionPerGroup || 0),
                )}
                원
              </div>
              <div className="text-xs text-muted-foreground">
                유료 소개 매출 기준
              </div>
            </div>
            <div className="rounded-xl border p-3 text-right">
              <div className="text-xs text-muted-foreground">
                소개 매출 총액
              </div>
              <div className="text-2xl font-semibold tracking-tight">
                {formatMoney(
                  Number(overview?.salesman?.totalReferredRevenueAmount || 0) +
                    Number(overview?.salesman?.totalReferredBonusAmount || 0),
                )}
                원
              </div>
              <div className="text-xs text-muted-foreground">
                유료{" "}
                {formatMoney(
                  Number(overview?.salesman?.totalReferredRevenueAmount || 0),
                )}
                원
              </div>
              <div className="text-xs text-muted-foreground">
                무료{" "}
                {formatMoney(
                  Number(overview?.salesman?.totalReferredBonusAmount || 0),
                )}
                원
              </div>
              <div className="text-xs text-muted-foreground">
                수수료{" "}
                {formatMoney(
                  Number(overview?.salesman?.totalCommissionAmount || 0),
                )}
                원 · 비율 {salesmanCommissionRatio.toFixed(1)}%
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3 flex-1 min-h-0">
        {/* 열 1: 그룹 목록 */}
        <Card className="h-full flex flex-col min-h-0">
          <CardHeader className="py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-base">그룹 목록</CardTitle>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant={sortKey === "members" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSortKey("members")}
                >
                  규모
                </Button>
                <Button
                  type="button"
                  variant={sortKey === "orders" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSortKey("orders")}
                >
                  주문
                </Button>
                <Button
                  type="button"
                  variant={sortKey === "created" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSortKey("created")}
                >
                  최신
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 flex flex-col min-h-0 flex-1">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={roleFilter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setRoleFilter("all")}
              >
                전체
              </Button>
              <Button
                type="button"
                variant={roleFilter === "requestor" ? "default" : "outline"}
                size="sm"
                onClick={() => setRoleFilter("requestor")}
              >
                의뢰자
              </Button>
              <Button
                type="button"
                variant={roleFilter === "salesman" ? "default" : "outline"}
                size="sm"
                onClick={() => setRoleFilter("salesman")}
              >
                영업자
              </Button>
            </div>

            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="조직/이름/이메일 검색"
            />
            <div
              ref={listScrollRef}
              className="space-y-2 flex-1 min-h-0 overflow-y-auto pr-1"
            >
              {isGroupListLoading ? (
                <div className="text-sm text-muted-foreground">로딩중...</div>
              ) : filteredGroups.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  표시할 그룹이 없습니다.
                </div>
              ) : (
                visibleGroups.map((g) => {
                  const leader = g.leader || ({} as any);
                  const isSelected =
                    String(leader._id) === String(effectiveLeaderId);
                  const isSalesman = String(leader.role || "") === "salesman";
                  const orders = Number(g.groupTotalOrders || 0);
                  const unit = Number(g.effectiveUnitPrice || 0);
                  const commission = Number(g.commissionAmount || 0);
                  const debugApplied = Boolean(
                    (g as any)?.unitPriceDebug?.applied,
                  );
                  return (
                    <button
                      key={String(leader._id)}
                      type="button"
                      className={`w-full rounded-xl border p-2 text-left transition-colors ${
                        isSelected ? "border-primary" : "border-border"
                      }`}
                      onClick={() => {
                        setSelectedLeaderId(String(leader._id));
                        setSelectedNode(null);
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">
                            {leader.organization ||
                              leader.name ||
                              leader.email ||
                              leader._id}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {leader.email || ""}
                          </div>
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {orders.toLocaleString()}건 ·{" "}
                            {isSalesman ? "수수료" : "단가"}{" "}
                            {formatMoney(isSalesman ? commission : unit)}원
                          </div>
                          {isDev && !isSalesman ? (
                            <div className="mt-0.5 text-[10px] text-muted-foreground">
                              debug: applied={String(debugApplied)}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          {roleBadge(leader.role)}
                          <Badge variant="outline">
                            {Number(g.memberCount || 0)}
                          </Badge>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}

              {visibleGroups.length < filteredGroups.length ? (
                <div ref={listSentinelRef} className="h-8" aria-hidden="true" />
              ) : null}
              {visibleGroups.length < filteredGroups.length ? (
                <div className="pb-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      setVisibleCount((prev) =>
                        Math.min(prev + 6, filteredGroups.length),
                      )
                    }
                  >
                    더 보기
                  </Button>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* 열 2: 계층도 */}
        <Card className="h-full flex flex-col min-h-0">
          <CardHeader className="py-3">
            <CardTitle className="text-base">계층도</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col min-h-0 flex-1">
            {isTreeLoading ? (
              <div className="text-sm text-muted-foreground">로딩중...</div>
            ) : !treeData?.tree ? (
              <div className="text-sm text-muted-foreground">
                그룹을 선택해주세요.
              </div>
            ) : (
              <div
                ref={treeScrollRef}
                className="space-y-2 flex-1 min-h-0 overflow-y-auto pr-1"
              >
                <div className="space-y-2">
                  {visibleTreeRows.map(({ node, depth }) => (
                    <TreeNode
                      key={String(node._id)}
                      node={node}
                      depth={depth}
                      onSelect={(n) => setSelectedNode(n)}
                    />
                  ))}

                  {visibleTreeRows.length < flattenedTree.length ? (
                    <div
                      ref={treeSentinelRef}
                      className="h-8"
                      aria-hidden="true"
                    />
                  ) : null}
                  {visibleTreeRows.length < flattenedTree.length ? (
                    <div className="pb-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() =>
                          setTreeVisibleCount((prev) =>
                            Math.min(prev + 10, flattenedTree.length),
                          )
                        }
                      >
                        더 보기
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 열 3: 수수료 */}
        <Card className="h-full flex flex-col min-h-0">
          <CardHeader className="py-3">
            <CardTitle className="text-base">수수료</CardTitle>
            {effectiveLeaderId &&
            treeData?.tree &&
            String(treeData.tree.role || "") === "salesman" ? (
              <CardDescription className="text-[11px]">
                직접 5%: {formatMoney(directCommissionSum)}원 · 간접 2.5%:{" "}
                {formatMoney(indirectCommissionSum)}원 · 합계:{" "}
                {formatMoney(totalCommissionSum)}원
              </CardDescription>
            ) : null}
          </CardHeader>
          <CardContent className="flex flex-col min-h-0 flex-1 overflow-y-auto pr-1 space-y-4">
            {isTreeLoading ? (
              <div className="text-sm text-muted-foreground">로딩중...</div>
            ) : !effectiveLeaderId || !treeData?.tree ? (
              <div className="text-sm text-muted-foreground">
                그룹을 선택해주세요.
              </div>
            ) : String(treeData.tree.role || "") !== "salesman" ? (
              <div className="text-sm text-muted-foreground">
                영업자 그룹만 수수료가 표시됩니다.
              </div>
            ) : (
              <>
                {/* 직접리퍼럴 */}
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-sm font-semibold">직접리퍼럴</span>
                    <Badge className="bg-emerald-600 text-white hover:bg-emerald-600 text-[10px] px-1.5 py-0">
                      5%
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {directReferralRequestors.length}개 조직
                    </span>
                  </div>
                  {directReferralRequestors.length === 0 ? (
                    <div className="text-xs text-muted-foreground pl-2">
                      직접 소개한 의뢰자 없음
                    </div>
                  ) : (
                    <div className="space-y-1 pl-2 border-l-2 border-emerald-200">
                      {directReferralRequestors.map((r) => {
                        const paidOrders = Number(r.lastMonthPaidOrders || 0);
                        const bonusOrders = Number(r.lastMonthBonusOrders || 0);
                        const paidRevenue = Number(r.lastMonthPaidRevenue || 0);
                        const bonusRevenue = Number(
                          r.lastMonthBonusRevenue || 0,
                        );
                        const commission = Math.round(paidRevenue * 0.05);
                        return (
                          <button
                            key={String(r._id)}
                            type="button"
                            className="w-full text-left rounded-md hover:bg-muted/40 px-2 py-1"
                            onClick={() => setSelectedNode(r)}
                          >
                            <div className="truncate text-sm font-medium">
                              {r.organization || r.name || r.email || r._id}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              유료 {paidOrders.toLocaleString()}건
                              {bonusOrders > 0 ? (
                                <span className="text-muted-foreground/60">
                                  {" "}
                                  ({bonusOrders.toLocaleString()}건 무료)
                                </span>
                              ) : null}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              유료 {formatMoney(paidRevenue)}원
                              {bonusRevenue > 0 ? (
                                <span className="text-muted-foreground/60">
                                  {" "}
                                  ({formatMoney(bonusRevenue)}원 무료)
                                </span>
                              ) : null}
                            </div>
                            {commission > 0 ? (
                              <div className="text-[11px] font-semibold text-emerald-700">
                                수수료 {formatMoney(commission)}원
                              </div>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 간접리퍼럴 */}
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-sm font-semibold">간접리퍼럴</span>
                    <Badge className="bg-blue-600 text-white hover:bg-blue-600 text-[10px] px-1.5 py-0">
                      2.5%
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {indirectReferralRequestors.length}개 조직
                    </span>
                  </div>
                  {indirectReferralRequestors.length === 0 ? (
                    <div className="text-xs text-muted-foreground pl-2">
                      간접 소개한 의뢰자 없음
                    </div>
                  ) : (
                    <div className="space-y-3 pl-2 border-l-2 border-blue-200">
                      {indirectReferralRequestors.map(
                        ({ requestor: r, via }) => {
                          const paidOrders = Number(r.lastMonthPaidOrders || 0);
                          const bonusOrders = Number(
                            r.lastMonthBonusOrders || 0,
                          );
                          const paidRevenue = Number(
                            r.lastMonthPaidRevenue || 0,
                          );
                          const bonusRevenue = Number(
                            r.lastMonthBonusRevenue || 0,
                          );
                          const commission = Math.round(paidRevenue * 0.025);
                          return (
                            <button
                              key={String(r._id)}
                              type="button"
                              className="w-full text-left rounded-md hover:bg-muted/40 px-2 py-1"
                              onClick={() => setSelectedNode(r)}
                            >
                              <div className="text-[10px] text-muted-foreground/70 mb-0.5">
                                경유:{" "}
                                {via.organization ||
                                  via.name ||
                                  via.email ||
                                  via._id}
                              </div>
                              <div className="truncate text-sm font-medium">
                                {r.organization || r.name || r.email || r._id}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                유료 {paidOrders.toLocaleString()}건
                                {bonusOrders > 0 ? (
                                  <span className="text-muted-foreground/60">
                                    {" "}
                                    ({bonusOrders.toLocaleString()}건 무료)
                                  </span>
                                ) : null}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                유료 {formatMoney(paidRevenue)}원
                                {bonusRevenue > 0 ? (
                                  <span className="text-muted-foreground/60">
                                    {" "}
                                    ({formatMoney(bonusRevenue)}원 무료)
                                  </span>
                                ) : null}
                              </div>
                              {commission > 0 ? (
                                <div className="text-[11px] font-semibold text-blue-700">
                                  수수료 {formatMoney(commission)}원
                                </div>
                              ) : null}
                            </button>
                          );
                        },
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={Boolean(selectedNode)}
        onOpenChange={() => setSelectedNode(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>계정 정보</DialogTitle>
            <DialogDescription>
              {selectedNode?.organization ||
                selectedNode?.name ||
                selectedNode?.email ||
                ""}
            </DialogDescription>
          </DialogHeader>
          {selectedNode ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <div className="text-muted-foreground">상태</div>
                <Badge variant={selectedNode.active ? "default" : "secondary"}>
                  {selectedNode.active ? "활성" : "비활성"}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-muted-foreground">{periodLabel} 주문</div>
                <div className="font-medium">
                  {Number(selectedNode.lastMonthOrders || 0).toLocaleString()}건
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-muted-foreground">이메일</div>
                <div className="font-medium">{selectedNode.email || "-"}</div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-muted-foreground">ID</div>
                <div className="font-mono text-xs">{selectedNode._id}</div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-muted-foreground">추천인(부모) ID</div>
                <div className="font-mono text-xs">
                  {selectedNode.referredByUserId || "-"}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-muted-foreground">생성일</div>
                <div className="font-medium">
                  {selectedNode.createdAt || "-"}
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

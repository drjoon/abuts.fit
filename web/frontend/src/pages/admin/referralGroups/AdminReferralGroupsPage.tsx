import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { useAuthStore } from "@/store/useAuthStore";
import { usePeriodStore } from "@/store/usePeriodStore";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";

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
  last30DaysOrders?: number;
  commissionAmount?: number;
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
  const last30DaysOrders = Number(node.last30DaysOrders || 0);
  const commissionAmount = Number(node.commissionAmount || 0);
  const isSalesman = String(node.role || "") === "salesman";
  const isRequestor = String(node.role || "") === "requestor";

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
            <div className="truncate text-[11px] text-muted-foreground">
              최근30일 {last30DaysOrders.toLocaleString()}건
              {(isSalesman || isRequestor) && commissionAmount > 0 ? (
                <> · 수수료 {formatMoney(commissionAmount)}원</>
              ) : null}
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
  const { period, setPeriod } = usePeriodStore();
  const isDev = import.meta.env.DEV;
  const refreshSuffix = isDev ? "?refresh=1" : "";
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

  const { data: groupList, isLoading: isGroupListLoading } = useQuery({
    queryKey: ["admin-referral-groups", period],
    enabled: Boolean(token),
    queryFn: async () => {
      const res = await apiFetch<ApiGroupListResponse>({
        path: `/api/admin/referral-groups${refreshSuffix}`,
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

  const groups = groupList?.groups || [];
  const overview = groupList?.overview || null;

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
        path: `/api/admin/referral-groups/${effectiveLeaderId}${refreshSuffix}`,
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
          Number(b?.last30DaysOrders || 0) - Number(a?.last30DaysOrders || 0),
      );
      for (let i = 0; i < sortedChildren.length; i += 1) {
        stack.push({ node: sortedChildren[i], depth: cur.depth + 1 });
      }
    }
    return out;
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

  return (
    <div className="h-screen max-h-screen overflow-hidden p-4 flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
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
                그룹당 평균 유료 매출액
              </div>
              <div className="text-2xl font-semibold tracking-tight">
                {formatMoney(
                  Number(overview?.requestor?.avgRevenuePerGroup || 0),
                )}
                원
              </div>
              <div className="text-xs text-muted-foreground">
                (무료 매출액{" "}
                {formatMoney(
                  Number(
                    overview?.requestor?.groupCount
                      ? Math.round(
                          (overview?.requestor?.totalBonusAmount || 0) /
                            overview?.requestor?.groupCount,
                        )
                      : 0,
                  ),
                )}
                원)
              </div>
            </div>
            <div className="rounded-xl border p-3">
              <div className="text-xs text-muted-foreground">
                유료 매출 총액
              </div>
              <div className="text-2xl font-semibold tracking-tight">
                {formatMoney(
                  Number(overview?.requestor?.totalRevenueAmount || 0),
                )}
                원
              </div>
              <div className="text-xs text-muted-foreground">
                (무료{" "}
                {formatMoney(
                  Number(overview?.requestor?.totalBonusAmount || 0),
                )}
                원)
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">영업자 그룹</CardTitle>
              {roleBadge("salesman")}
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3 text-right">
            <div className="rounded-xl border p-3">
              <div className="text-xs text-muted-foreground">
                그룹수 / 의뢰건수(소개)
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
                그룹당 평균 수수료(30일)
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
              <div className="text-xs text-muted-foreground">수수료 총액</div>
              <div className="text-2xl font-semibold tracking-tight">
                {formatMoney(
                  Number(overview?.salesman?.totalCommissionAmount || 0),
                )}
                원
              </div>
              <div className="text-xs text-muted-foreground">
                유료 매출{" "}
                {formatMoney(
                  Number(overview?.salesman?.totalReferredRevenueAmount || 0),
                )}
                원
              </div>
              <div className="text-xs text-muted-foreground">
                비율 {salesmanCommissionRatio.toFixed(1)}%
              </div>
              <div className="text-xs text-muted-foreground">
                (무료 매출{" "}
                {formatMoney(
                  Number(overview?.salesman?.totalReferredBonusAmount || 0),
                )}
                원)
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 flex-1 min-h-0">
        <Card className="h-full flex flex-col min-h-0">
          <CardHeader className="py-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">그룹 목록</CardTitle>
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
            {isDev ? (
              <CardDescription className="text-[11px]">
                dev: refresh=1 · unitPriceDebug.applied 확인 가능
              </CardDescription>
            ) : null}
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

            {selectedGroupRow ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-2 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-emerald-900">
                    멤버{" "}
                    {Number(selectedGroupRow.memberCount || 0).toLocaleString()}
                    명
                  </div>
                  <div className="text-emerald-900">
                    주문{" "}
                    {Number(
                      selectedGroupRow.groupTotalOrders || 0,
                    ).toLocaleString()}
                    건
                  </div>
                  <div className="text-emerald-900">
                    매출{" "}
                    {(
                      Number((overview as any)?.avgEffectiveUnitPrice || 0) *
                      Number(selectedGroupRow.groupTotalOrders || 0)
                    ).toLocaleString()}
                    원
                  </div>
                  {String(selectedGroupRow?.leader?.role || "") ===
                  "salesman" ? (
                    <div className="font-semibold text-emerald-900">
                      수수료{" "}
                      {formatMoney(
                        Number(selectedGroupRow.commissionAmount || 0),
                      )}
                      원
                    </div>
                  ) : (
                    <div className="font-semibold text-emerald-900">
                      단가{" "}
                      {Number(
                        selectedGroupRow.effectiveUnitPrice || 0,
                      ).toLocaleString()}
                      원
                    </div>
                  )}
                </div>
              </div>
            ) : null}

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
                            최근30일 {orders.toLocaleString()}건 ·{" "}
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

        <Card className="h-full flex flex-col min-h-0">
          <CardHeader className="py-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">계층도</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col min-h-0 flex-1">
            {isDev && treeData?.tree ? (
              <div className="mb-2 text-[11px] text-muted-foreground">
                debug: applied=
                {String(Boolean((treeData as any)?.unitPriceDebug?.applied))}
              </div>
            ) : null}

            {isTreeLoading ? (
              <div className="text-sm text-muted-foreground">로딩중...</div>
            ) : !treeData?.tree ? (
              <div className="text-sm text-muted-foreground">
                그룹을 선택해주세요.
              </div>
            ) : (
              <div
                ref={treeScrollRef}
                className="space-y-3 flex-1 min-h-0 overflow-y-auto pr-1"
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
                <div className="text-muted-foreground">최근 30일 주문</div>
                <div className="font-medium">
                  {Number(selectedNode.last30DaysOrders || 0).toLocaleString()}
                  건
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

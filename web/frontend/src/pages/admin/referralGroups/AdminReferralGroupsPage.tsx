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
import { useAuthStore } from "@/store/useAuthStore";
import { usePeriodStore, periodToRangeQuery } from "@/store/usePeriodStore";
import { ReferralNetworkChart } from "@/features/referral/components/ReferralNetworkChart";
import { useToast } from "@/shared/hooks/use-toast";
import { request } from "@/shared/api/apiClient";
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

const PERIOD_LABEL: Record<string, string> = {
  "7d": "최근 7일",
  "30d": "최근 30일",
  lastMonth: "지난달",
  thisMonth: "이번달",
  "90d": "최근 90일",
};

type ApiGroupLeader = {
  _id: string;
  role?: "requestor" | "salesman" | "devops";
  name?: string;
  email?: string;
  business?: string;
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
      devops: {
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
  if (role === "devops") {
    return (
      <Badge className="bg-violet-600 text-white hover:bg-violet-600">
        개발운영사
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
  role?: "requestor" | "salesman" | "devops";
  name?: string;
  email?: string;
  business?: string;
  businessAnchorId?: string;
  active?: boolean;
  createdAt?: string;
  approvedAt?: string;
  updatedAt?: string;
  referredByAnchorId?: string | null;
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
              {node.business || node.name || node.email || node._id}
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
  const { toast } = useToast();
  const { period } = usePeriodStore();
  const queryClient = useQueryClient();
  const isDev = import.meta.env.DEV;
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<
    "all" | "requestor" | "salesman" | "devops" | "referrer"
  >("all");
  const [selectedLeaderId, setSelectedLeaderId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<ApiTreeNode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiTreeNode | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);
  const [visibleCount, setVisibleCount] = useState(6);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const listSentinelRef = useRef<HTMLDivElement | null>(null);
  const treeScrollRef = useRef<HTMLDivElement | null>(null);
  const treeSentinelRef = useRef<HTMLDivElement | null>(null);
  const [treeVisibleCount, setTreeVisibleCount] = useState(10);
  const [sortKey, setSortKey] = useState<"members" | "orders" | "created">(
    "members",
  );
  const [referrerTab, setReferrerTab] = useState<"salesman" | "devops">(
    "salesman",
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

  const devopsCommissionRatio = useMemo(() => {
    const revenue = Number(overview?.devops?.totalReferredRevenueAmount || 0);
    const commission = Number(overview?.devops?.totalCommissionAmount || 0);
    if (!revenue || revenue <= 0) return 0;
    return (commission / revenue) * 100;
  }, [
    overview?.devops?.totalReferredRevenueAmount,
    overview?.devops?.totalCommissionAmount,
  ]);
  const isCommissionLeader = (role?: string) =>
    ["salesman", "devops"].includes(String(role || ""));

  // 데이터가 새로 바뀌면 기본 노출 개수 리셋
  useEffect(() => {
    setVisibleCount(6);
  }, [groupList]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = groups.filter((g) => {
      const leader = g.leader || ({} as any);
      if (roleFilter !== "all") {
        const leaderRole = String(leader.role || "");
        if (roleFilter === "referrer") {
          if (!isCommissionLeader(leaderRole)) return false;
        } else if (leaderRole !== roleFilter) {
          return false;
        }
      }
      if (!q) return true;
      const hay =
        `${leader.business || ""} ${leader.name || ""} ${leader.email || ""}`
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

  // selectedLeaderId가 유효하지 않으면 초기화
  useEffect(() => {
    if (selectedLeaderId && !selectedGroupRow) {
      setSelectedLeaderId(null);
    }
  }, [selectedLeaderId, selectedGroupRow]);

  const { data: treeData, isLoading: isTreeLoading } = useQuery({
    queryKey: ["admin-referral-group-tree", effectiveLeaderId],
    enabled: Boolean(token && effectiveLeaderId && selectedGroupRow),
    queryFn: async () => {
      const res = await apiFetch<ApiGroupTreeResponse>({
        path: `/api/admin/referral-groups/${effectiveLeaderId}/tree`,
        method: "GET",
        token,
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

  // 수수료 패널: 직접 소개(소개자가 직접 소개한 의뢰자) 목록
  // 트리 루트가 소개자인 경우, 루트의 직계 자식 중 의뢰자
  const directReferralRequestors = useMemo(() => {
    const root = treeData?.tree;
    if (!root || !isCommissionLeader(String(root.role || "")))
      return [] as ApiTreeNode[];
    return (root.children || []).filter(
      (c) => String(c?.role || "") === "requestor",
    );
  }, [treeData?.tree]);

  // 수수료 패널: 간접 소개(소개자가 소개한 하위 소개자들의 의뢰자) 목록
  // 루트의 직계 자식 중 소개자들의 직계 자식 중 의뢰자
  const indirectReferralRequestors = useMemo(() => {
    const root = treeData?.tree;
    if (!root || !isCommissionLeader(String(root.role || "")))
      return [] as Array<{ requestor: ApiTreeNode; via: ApiTreeNode }>;
    const result: Array<{ requestor: ApiTreeNode; via: ApiTreeNode }> = [];
    const childReferrers = (root.children || []).filter((c) =>
      isCommissionLeader(String(c?.role || "")),
    );
    for (const referrer of childReferrers) {
      const requestors = (referrer.children || []).filter(
        (c) => String(c?.role || "") === "requestor",
      );
      for (const r of requestors) {
        result.push({ requestor: r, via: referrer });
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

  const deleteUserWithBusiness = async (node: ApiTreeNode) => {
    if (!token) return false;
    setDeletingUser(true);
    try {
      const res = await request<any>({
        path: `/api/admin/users/${encodeURIComponent(String(node._id || ""))}/with-business`,
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
        description: `${node.business || node.name || node.email || "선택한 계정"} 계정과 연결 사업자를 삭제했습니다.`,
      });
      setDeleteTarget(null);
      setSelectedNode(null);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["admin-referral-groups", period],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-referral-group-tree"],
        }),
      ]);
      return true;
    } finally {
      setDeletingUser(false);
    }
  };

  return (
    <div className="h-screen max-h-screen overflow-hidden p-4 flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 shrink-0">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-base">
                의뢰자 할인 네트워크 현황
              </CardTitle>
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
                <CardTitle className="text-base">
                  소개자 네트워크 현황
                </CardTitle>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant={referrerTab === "salesman" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setReferrerTab("salesman")}
                  className="h-7 px-3"
                >
                  영업자
                </Button>
                <Button
                  type="button"
                  variant={referrerTab === "devops" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setReferrerTab("devops")}
                  className="h-7 px-3"
                >
                  개발운영사
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-3 text-right">
            {referrerTab === "salesman" ? (
              <>
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-muted-foreground">
                    그룹수 / 의뢰건수
                  </div>
                  <div className="text-2xl font-semibold tracking-tight">
                    {Number(
                      overview?.salesman?.groupCount || 0,
                    ).toLocaleString()}
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
                    {Number(
                      overview?.salesman?.netNewGroups || 0,
                    ).toLocaleString()}
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
                      Number(
                        overview?.salesman?.totalReferredRevenueAmount || 0,
                      ) +
                        Number(
                          overview?.salesman?.totalReferredBonusAmount || 0,
                        ),
                    )}
                    원
                  </div>
                  <div className="text-xs text-muted-foreground">
                    유료{" "}
                    {formatMoney(
                      Number(
                        overview?.salesman?.totalReferredRevenueAmount || 0,
                      ),
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
              </>
            ) : (
              <>
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-muted-foreground">
                    그룹수 / 의뢰건수
                  </div>
                  <div className="text-2xl font-semibold tracking-tight">
                    {Number(overview?.devops?.groupCount || 0).toLocaleString()}
                    <span className="text-base font-normal text-muted-foreground mx-1">
                      /
                    </span>
                    {Number(
                      overview?.devops?.totalReferralOrders || 0,
                    ).toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    평균 계정수{" "}
                    {Number(
                      overview?.devops?.avgAccountsPerGroup || 0,
                    ).toLocaleString()}{" "}
                    · 순증가{" "}
                    {Number(
                      overview?.devops?.netNewGroups || 0,
                    ).toLocaleString()}
                  </div>
                </div>
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-muted-foreground">
                    그룹당 평균 수수료
                  </div>
                  <div className="text-2xl font-semibold tracking-tight">
                    {formatMoney(
                      Number(overview?.devops?.avgCommissionPerGroup || 0),
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
                      Number(
                        overview?.devops?.totalReferredRevenueAmount || 0,
                      ) +
                        Number(overview?.devops?.totalReferredBonusAmount || 0),
                    )}
                    원
                  </div>
                  <div className="text-xs text-muted-foreground">
                    유료{" "}
                    {formatMoney(
                      Number(overview?.devops?.totalReferredRevenueAmount || 0),
                    )}
                    원
                  </div>
                  <div className="text-xs text-muted-foreground">
                    무료{" "}
                    {formatMoney(
                      Number(overview?.devops?.totalReferredBonusAmount || 0),
                    )}
                    원
                  </div>
                  <div className="text-xs text-muted-foreground">
                    수수료{" "}
                    {formatMoney(
                      Number(overview?.devops?.totalCommissionAmount || 0),
                    )}
                    원 · 비율 {devopsCommissionRatio.toFixed(1)}%
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 소개 네트워크 */}
      <Card className="flex flex-col min-h-0 flex-1 overflow-hidden">
        <CardHeader className="py-3 space-y-3 shrink-0">
          {/* 상단 컨트롤 바 */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* 리더 선택 */}
            <div className="flex items-center gap-2 flex-1 min-w-[300px]">
              <span className="text-sm font-medium whitespace-nowrap">
                리더
              </span>
              <select
                value={effectiveLeaderId || ""}
                onChange={(e) => {
                  setSelectedLeaderId(e.target.value || null);
                  setSelectedNode(null);
                }}
                className="flex-1 h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">리더를 선택하세요</option>
                {filteredGroups.map((g) => {
                  const leader = g.leader || ({} as any);
                  const displayName =
                    leader.business ||
                    leader.name ||
                    leader.email ||
                    leader._id;
                  return (
                    <option key={String(leader._id)} value={String(leader._id)}>
                      {displayName} ({leader.role}) -{" "}
                      {Number(g.memberCount || 0)}명
                    </option>
                  );
                })}
              </select>
            </div>

            {/* 필터 */}
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant={roleFilter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setRoleFilter("all")}
                className="h-8"
              >
                전체
              </Button>
              <Button
                type="button"
                variant={roleFilter === "requestor" ? "default" : "outline"}
                size="sm"
                onClick={() => setRoleFilter("requestor")}
                className="h-8"
              >
                의뢰자
              </Button>
              <Button
                type="button"
                variant={roleFilter === "salesman" ? "default" : "outline"}
                size="sm"
                onClick={() => setRoleFilter("salesman")}
                className="h-8"
              >
                영업자
              </Button>
              <Button
                type="button"
                variant={roleFilter === "devops" ? "default" : "outline"}
                size="sm"
                onClick={() => setRoleFilter("devops")}
                className="h-8"
              >
                개발운영사
              </Button>
            </div>

            {/* 검색 */}
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="검색..."
              className="h-8 w-[200px]"
            />
          </div>

          {/* 선택된 리더 정보 */}
          {effectiveLeaderId && treeData?.tree ? (
            <div className="flex items-start justify-between gap-4 p-3 rounded-lg bg-muted/30">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold">
                    {treeData.tree.business ||
                      treeData.tree.name ||
                      treeData.tree.email}
                  </span>
                  {roleBadge(treeData.tree.role)}
                </div>
                <div className="text-xs text-muted-foreground">
                  네트워크 {flattenedTree.length}명
                  {isCommissionLeader(String(treeData.tree.role || "")) && (
                    <>
                      {" · "}직접 소개 {directReferralRequestors.length}개
                      {" · "}간접 소개 {indirectReferralRequestors.length}개
                    </>
                  )}
                </div>
              </div>

              {isCommissionLeader(String(treeData.tree.role || "")) && (
                <div className="text-right">
                  <div className="text-lg font-bold">
                    {formatMoney(totalCommissionSum)}원
                  </div>
                  <div className="text-xs text-muted-foreground">
                    직접 {formatMoney(directCommissionSum)} · 간접{" "}
                    {formatMoney(indirectCommissionSum)}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </CardHeader>

        <CardContent className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
          {isTreeLoading ? (
            <div className="text-muted-foreground">로딩중...</div>
          ) : !effectiveLeaderId || !treeData?.tree ? (
            <div className="text-center text-muted-foreground">
              <div className="text-lg mb-2">👆</div>
              <div>리더를 선택하면 소개 네트워크를 확인할 수 있습니다</div>
            </div>
          ) : (
            <div className="w-full h-full">
              <ReferralNetworkChart
                data={treeData.tree}
                title=""
                mode="radial-tree"
                legendRoles={["requestor", "salesman", "devops"]}
                chartHeight={600}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(selectedNode)}
        onOpenChange={() => setSelectedNode(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>계정 정보</DialogTitle>
            <DialogDescription>
              {selectedNode?.business ||
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
                <div className="text-muted-foreground">추천인 사업자 ID</div>
                <div className="font-mono text-xs">
                  {selectedNode.referredByAnchorId || "-"}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-muted-foreground">추천인 사업자 ID</div>
                <div className="font-mono text-xs">
                  {selectedNode.referredByAnchorId || "-"}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-muted-foreground">사업자 ID</div>
                <div className="font-mono text-xs">
                  {selectedNode.businessAnchorId || "-"}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-muted-foreground">생성일</div>
                <div className="font-medium">
                  {selectedNode.createdAt || "-"}
                </div>
              </div>
              <div className="pt-3 flex justify-end">
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deletingUser}
                  onClick={() => setDeleteTarget(selectedNode)}
                >
                  사업자 포함 계정 삭제
                </Button>
              </div>
            </div>
          ) : null}
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
            <AlertDialogTitle>사업자 포함 계정을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.business ||
                deleteTarget?.name ||
                deleteTarget?.email ||
                "선택한 계정"}{" "}
              계정과 연결된 사업자, 그리고 안전 조건을 만족하는 경우 business
              anchor까지 함께 삭제합니다. 다른 계정이나 하위 참조가 남아 있으면
              삭제가 거부됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingUser}>취소</AlertDialogCancel>
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
  );
}

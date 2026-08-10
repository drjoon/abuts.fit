// related files:
// - web/frontend/rules.md
// - web/frontend/src/App.tsx
// - web/frontend/src/features/layout/DashboardLayout.tsx
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { getRequestorRoleBadgeLabel } from "@/shared/business/requestorCapabilities";
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
import { Search } from "lucide-react";

const PERIOD_LABEL: Record<string, string> = {
  "30d": "30일",
  lastMonth: "지난달",
  thisMonth: "이번달",
  "90d": "90일",
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
  unitPriceDebug?: unknown;
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

const roleBadge = (role?: string, requestorKind?: "practice" | "lab" | null) => {
  if (role === "salesman") {
    return (
      <span className="rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
        영업자
      </span>
    );
  }
  if (role === "devops") {
    return (
      <span className="rounded-md border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700">
        개발운영사
      </span>
    );
  }
  return (
    <span className="rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
      {getRequestorRoleBadgeLabel(requestorKind)}
    </span>
  );
};

const MetricTile = ({
  label,
  value,
  hints,
}: {
  label: string;
  value: ReactNode;
  hints?: ReactNode;
}) => (
  <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5 text-right">
    <div className="text-[10px] font-medium text-slate-400">{label}</div>
    <div className="mt-0.5 text-xl font-bold tabular-nums tracking-tight text-slate-900">
      {value}
    </div>
    {hints ? (
      <div className="mt-1 space-y-0.5 text-[10px] text-slate-400">{hints}</div>
    ) : null}
  </div>
);

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
    unitPriceDebug?: unknown;
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
    staleTime: 60_000,
    queryFn: async () => {
      const qs = new URLSearchParams();
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

  // change-log:
  // - 2026-08-03: Stabilize derived 'groups' and 'overview' with useMemo to avoid hook dependency instability warnings.
  const groups = useMemo(() => groupList?.groups || [], [groupList?.groups]);
  const overview = useMemo(() => groupList?.overview || null, [groupList?.overview]);
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
      const leader = g.leader || ({} as Partial<ApiGroupLeader>);
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
    staleTime: 60_000,
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

  // 수수료 패널: 1단계 소개(소개자가 소개한 의뢰자) 목록
  // 트리 루트가 소개자인 경우, 루트의 직계 자식 중 의뢰자
  const directReferralRequestors = useMemo(() => {
    const root = treeData?.tree;
    if (!root || !isCommissionLeader(String(root.role || "")))
      return [] as ApiTreeNode[];
    return (root.children || []).filter(
      (c) => String(c?.role || "") === "requestor",
    );
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
    return Math.round(sumPaidRevenue * 0.1);
  }, [directReferralRequestors]);

  const totalCommissionSum = directCommissionSum;

  const deleteUserWithBusiness = async (node: ApiTreeNode) => {
    if (!token) return false;
    setDeletingUser(true);
    try {
      const res = await request<{
        success?: boolean;
        message?: string;
        error?: string;
      }>({
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
    <div className="flex h-full min-h-0 flex-col px-4 pt-4 pb-2 sm:px-4 sm:pt-4">
      <div className="mx-auto flex w-full max-w-7xl flex-1 min-h-0 flex-col gap-4 overflow-hidden">
        <div className="grid shrink-0 grid-cols-1 gap-2.5 p-0.5 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm sm:px-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold tracking-tight text-slate-900">
                의뢰자 할인 네트워크
              </h2>
              {roleBadge("requestor")}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <MetricTile
                label="그룹수 / 의뢰건수"
                value={
                  <>
                    {Number(
                      overview?.requestor?.groupCount || 0,
                    ).toLocaleString()}
                    <span className="mx-1 text-sm font-normal text-slate-400">
                      /
                    </span>
                    {Number(
                      overview?.requestor?.totalOrders || 0,
                    ).toLocaleString()}
                  </>
                }
                hints={
                  <>
                    평균 계정수{" "}
                    {Number(
                      overview?.requestor?.avgAccountsPerGroup || 0,
                    ).toLocaleString()}{" "}
                    · 순증가{" "}
                    {Number(
                      overview?.requestor?.netNewGroups || 0,
                    ).toLocaleString()}
                  </>
                }
              />
              <MetricTile
                label="그룹당 평균 매출"
                value={`${formatMoney(
                  Number(overview?.requestor?.avgRevenuePerGroup || 0),
                )}원`}
                hints={
                  <>
                    <div>유료 {formatMoney(avgPaidRevenuePerGroup)}원</div>
                    <div>무료 {formatMoney(avgBonusRevenuePerGroup)}원</div>
                  </>
                }
              />
              <MetricTile
                label="매출 총액"
                value={`${formatMoney(
                  Number(overview?.requestor?.totalRevenueAmount || 0) +
                    Number(overview?.requestor?.totalBonusAmount || 0),
                )}원`}
                hints={
                  <>
                    <div>
                      유료{" "}
                      {formatMoney(
                        Number(overview?.requestor?.totalRevenueAmount || 0),
                      )}
                      원
                    </div>
                    <div>
                      무료{" "}
                      {formatMoney(
                        Number(overview?.requestor?.totalBonusAmount || 0),
                      )}
                      원
                    </div>
                  </>
                }
              />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3.5 shadow-sm sm:px-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold tracking-tight text-slate-900">
                소개자 네트워크
              </h2>
              <div className="inline-flex gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                <button
                  type="button"
                  onClick={() => setReferrerTab("salesman")}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    referrerTab === "salesman"
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-white"
                  }`}
                >
                  영업자
                </button>
                <button
                  type="button"
                  onClick={() => setReferrerTab("devops")}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    referrerTab === "devops"
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:bg-white"
                  }`}
                >
                  개발운영사
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {referrerTab === "salesman" ? (
                <>
                  <MetricTile
                    label="그룹수 / 의뢰건수"
                    value={
                      <>
                        {Number(
                          overview?.salesman?.groupCount || 0,
                        ).toLocaleString()}
                        <span className="mx-1 text-sm font-normal text-slate-400">
                          /
                        </span>
                        {Number(
                          overview?.salesman?.totalReferralOrders || 0,
                        ).toLocaleString()}
                      </>
                    }
                    hints={
                      <>
                        평균 계정수{" "}
                        {Number(
                          overview?.salesman?.avgAccountsPerGroup || 0,
                        ).toLocaleString()}{" "}
                        · 순증가{" "}
                        {Number(
                          overview?.salesman?.netNewGroups || 0,
                        ).toLocaleString()}
                      </>
                    }
                  />
                  <MetricTile
                    label="그룹당 평균 수수료"
                    value={`${formatMoney(
                      Number(overview?.salesman?.avgCommissionPerGroup || 0),
                    )}원`}
                    hints="유료 소개 매출 기준"
                  />
                  <MetricTile
                    label="소개 매출 총액"
                    value={`${formatMoney(
                      Number(
                        overview?.salesman?.totalReferredRevenueAmount || 0,
                      ) +
                        Number(
                          overview?.salesman?.totalReferredBonusAmount || 0,
                        ),
                    )}원`}
                    hints={
                      <>
                        <div>
                          유료{" "}
                          {formatMoney(
                            Number(
                              overview?.salesman?.totalReferredRevenueAmount ||
                                0,
                            ),
                          )}
                          원
                        </div>
                        <div>
                          무료{" "}
                          {formatMoney(
                            Number(
                              overview?.salesman?.totalReferredBonusAmount || 0,
                            ),
                          )}
                          원
                        </div>
                        <div>
                          수수료{" "}
                          {formatMoney(
                            Number(
                              overview?.salesman?.totalCommissionAmount || 0,
                            ),
                          )}
                          원 · 비율 {salesmanCommissionRatio.toFixed(1)}%
                        </div>
                      </>
                    }
                  />
                </>
              ) : (
                <>
                  <MetricTile
                    label="그룹수 / 의뢰건수"
                    value={
                      <>
                        {Number(
                          overview?.devops?.groupCount || 0,
                        ).toLocaleString()}
                        <span className="mx-1 text-sm font-normal text-slate-400">
                          /
                        </span>
                        {Number(
                          overview?.devops?.totalReferralOrders || 0,
                        ).toLocaleString()}
                      </>
                    }
                    hints={
                      <>
                        평균 계정수{" "}
                        {Number(
                          overview?.devops?.avgAccountsPerGroup || 0,
                        ).toLocaleString()}{" "}
                        · 순증가{" "}
                        {Number(
                          overview?.devops?.netNewGroups || 0,
                        ).toLocaleString()}
                      </>
                    }
                  />
                  <MetricTile
                    label="그룹당 평균 수수료"
                    value={`${formatMoney(
                      Number(overview?.devops?.avgCommissionPerGroup || 0),
                    )}원`}
                    hints="유료 소개 매출 기준"
                  />
                  <MetricTile
                    label="소개 매출 총액"
                    value={`${formatMoney(
                      Number(
                        overview?.devops?.totalReferredRevenueAmount || 0,
                      ) +
                        Number(overview?.devops?.totalReferredBonusAmount || 0),
                    )}원`}
                    hints={
                      <>
                        <div>
                          유료{" "}
                          {formatMoney(
                            Number(
                              overview?.devops?.totalReferredRevenueAmount || 0,
                            ),
                          )}
                          원
                        </div>
                        <div>
                          무료{" "}
                          {formatMoney(
                            Number(
                              overview?.devops?.totalReferredBonusAmount || 0,
                            ),
                          )}
                          원
                        </div>
                        <div>
                          수수료{" "}
                          {formatMoney(
                            Number(
                              overview?.devops?.totalCommissionAmount || 0,
                            ),
                          )}
                          원 · 비율 {devopsCommissionRatio.toFixed(1)}%
                        </div>
                      </>
                    }
                  />
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="shrink-0 space-y-3 border-b border-slate-100 px-5 py-3.5 sm:px-6">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex min-w-[240px] flex-1 basis-[280px] items-center gap-2">
                <span className="shrink-0 text-xs font-semibold text-slate-500">
                  리더
                </span>
                <Select
                  value={effectiveLeaderId || undefined}
                  onValueChange={(value) => {
                    setSelectedLeaderId(value || null);
                    setSelectedNode(null);
                  }}
                >
                  <SelectTrigger className="h-9 w-full min-w-0 rounded-lg border-slate-200 bg-white text-sm shadow-sm focus:ring-slate-400 focus:ring-offset-0">
                    <SelectValue placeholder="리더 선택" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {filteredGroups.map((g) => {
                      const leader = g.leader || ({} as Partial<ApiGroupLeader>);
                      const displayName =
                        leader.business ||
                        leader.name ||
                        leader.email ||
                        leader._id;
                      return (
                        <SelectItem
                          key={String(leader._id)}
                          value={String(leader._id)}
                        >
                          {displayName} ({leader.role}) ·{" "}
                          {Number(g.memberCount || 0)}명
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="inline-flex shrink-0 flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
                {(
                  [
                    ["all", "전체"],
                    ["requestor", "의뢰자"],
                    ["salesman", "영업자"],
                    ["devops", "개발운영사"],
                  ] as const
                ).map(([value, label]) => {
                  const active = roleFilter === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setRoleFilter(value)}
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

              <div className="relative min-w-[240px] flex-1 basis-[280px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="리더·사업자·이메일 검색..."
                  className="h-9 w-full rounded-lg border-slate-200 bg-white pl-9 text-sm shadow-sm"
                />
              </div>
            </div>

            {effectiveLeaderId && treeData?.tree ? (
              <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50/70 px-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-slate-900">
                      {treeData.tree.business ||
                        treeData.tree.name ||
                        treeData.tree.email}
                    </span>
                    {roleBadge(treeData.tree.role)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    네트워크 {flattenedTree.length}명
                    {isCommissionLeader(String(treeData.tree.role || "")) && (
                      <>
                        {" · "}소개 {directReferralRequestors.length}개
                      </>
                    )}
                  </div>
                </div>

                {isCommissionLeader(String(treeData.tree.role || "")) && (
                  <div className="shrink-0 text-right">
                    <div className="text-base font-bold tabular-nums text-slate-900">
                      {formatMoney(totalCommissionSum)}원
                    </div>
                    <div className="text-[11px] text-slate-400">
                      소개 수수료 {formatMoney(directCommissionSum)}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            {isTreeLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                로딩중...
              </div>
            ) : !effectiveLeaderId || !treeData?.tree ? (
              <div className="flex h-full flex-col items-center justify-center px-4 text-center">
                <p className="text-sm font-medium text-slate-600">
                  리더를 선택하면 소개 네트워크를 확인할 수 있습니다
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  상단에서 리더를 고르거나 역할 필터를 바꿔 보세요
                </p>
              </div>
            ) : (
              <div className="h-full w-full p-3 sm:p-4">
                <ReferralNetworkChart
                  data={treeData.tree}
                  title=""
                  mode="radial-tree"
                  legendRoles={["requestor", "salesman", "devops"]}
                  chartHeight={600}
                  showCard={false}
                  showZoomControls
                />
              </div>
            )}
          </div>
        </div>
      </div>

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

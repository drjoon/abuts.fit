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
};

type ApiGroupListResponse = {
  success: boolean;
  data?: {
    overview?: {
      ymd?: string;
      totalGroups?: number;
      totalAccounts?: number;
      totalGroupOrders?: number;
      avgEffectiveUnitPrice?: number;
      requestor?: {
        groupCount?: number;
        avgAccountsPerGroup?: number;
        netNewGroups?: number;
        avgRevenuePerGroup?: number;
      };
      salesman?: {
        groupCount?: number;
        avgAccountsPerGroup?: number;
        netNewGroups?: number;
        avgCommissionPerGroup?: number;
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
  name?: string;
  email?: string;
  organization?: string;
  active?: boolean;
  createdAt?: string;
  approvedAt?: string;
  updatedAt?: string;
  referredByUserId?: string | null;
  last30DaysOrders?: number;
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

  return (
    <div style={{ paddingLeft: indent }} className="space-y-1">
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
            </div>
          </div>
          <Badge variant={node.active ? "default" : "secondary"}>
            {node.active ? "활성" : "비활성"}
          </Badge>
        </div>
      </button>
      {Array.isArray(node.children) && node.children.length > 0 ? (
        <div className="space-y-2">
          {node.children.map((c) => (
            <TreeNode
              key={c._id}
              node={c}
              depth={depth + 1}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

export default function AdminReferralGroupsPage() {
  const { token } = useAuthStore();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<
    "all" | "requestor" | "salesman"
  >("all");
  const [selectedLeaderId, setSelectedLeaderId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<ApiTreeNode | null>(null);
  const [visibleCount, setVisibleCount] = useState(8);
  const listScrollRef = useRef<HTMLDivElement | null>(null);

  const { data: groupList, isLoading: isGroupListLoading } = useQuery({
    queryKey: ["admin-referral-groups"],
    enabled: Boolean(token),
    queryFn: async () => {
      const res = await apiFetch<ApiGroupListResponse>({
        path: "/api/admin/referral-groups",
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

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter((g) => {
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
  }, [groups, roleFilter, search]);

  const visibleGroups = useMemo(() => {
    return filteredGroups.slice(0, Math.max(0, visibleCount));
  }, [filteredGroups, visibleCount]);

  useEffect(() => {
    setVisibleCount(8);
    setSelectedLeaderId(null);
    setSelectedNode(null);
  }, [roleFilter, search]);

  useEffect(() => {
    const sentinel = document.querySelector(
      '[data-infinite-sentinel="admin-referral-groups"]',
    );
    if (!sentinel) return;
    if (visibleGroups.length >= filteredGroups.length) return;

    const root = listScrollRef.current;
    if (!root) return;

    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (!hit) return;
        setVisibleCount((prev) => Math.min(prev + 8, filteredGroups.length));
      },
      { root, rootMargin: "200px", threshold: 0 },
    );

    io.observe(sentinel);
    return () => io.disconnect();
  }, [filteredGroups.length, visibleGroups.length]);

  const effectiveLeaderId =
    selectedLeaderId || (visibleGroups[0]?.leader?._id ?? null);

  const { data: treeData, isLoading: isTreeLoading } = useQuery({
    queryKey: ["admin-referral-group-tree", effectiveLeaderId],
    enabled: Boolean(token && effectiveLeaderId),
    queryFn: async () => {
      const res = await apiFetch<ApiGroupTreeResponse>({
        path: `/api/admin/referral-groups/${effectiveLeaderId}`,
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

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">의뢰자 그룹</CardTitle>
              {roleBadge("requestor")}
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-xl border p-3">
              <div className="text-xs text-muted-foreground">그룹수</div>
              <div className="text-lg font-semibold">
                {Number(overview?.requestor?.groupCount || 0).toLocaleString()}
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
                그룹당 평균 매출액(추정)
              </div>
              <div className="text-lg font-semibold">
                {formatMoney(
                  Number(overview?.requestor?.avgRevenuePerGroup || 0),
                )}
                원
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
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-xl border p-3">
              <div className="text-xs text-muted-foreground">그룹수</div>
              <div className="text-lg font-semibold">
                {Number(overview?.salesman?.groupCount || 0).toLocaleString()}
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
                그룹당 평균 수수료(추정)
              </div>
              <div className="text-lg font-semibold">
                {formatMoney(
                  Number(overview?.salesman?.avgCommissionPerGroup || 0),
                )}
                원
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">그룹 목록</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
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
              className="space-y-2 max-h-[65vh] overflow-y-auto pr-1"
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
                  return (
                    <button
                      key={String(leader._id)}
                      type="button"
                      className={`w-full rounded-xl border p-3 text-left transition-colors ${
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
                <div
                  data-infinite-sentinel="admin-referral-groups"
                  className="h-8"
                  aria-hidden="true"
                />
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">계층도</CardTitle>
          </CardHeader>
          <CardContent>
            {isTreeLoading ? (
              <div className="text-sm text-muted-foreground">로딩중...</div>
            ) : !treeData?.tree ? (
              <div className="text-sm text-muted-foreground">
                그룹을 선택해주세요.
              </div>
            ) : (
              <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">
                    멤버 수(리더+직계):{" "}
                    {Number(treeData.memberCount || 0).toLocaleString()}
                  </div>
                  <div className="text-sm font-medium">
                    주문(최근30일, 리더+직계):{" "}
                    {Number(treeData.groupTotalOrders || 0).toLocaleString()}건
                  </div>
                  {String(treeData?.leader?.role || "") === "salesman" ? (
                    <div className="text-sm font-medium">
                      수수료(최근30일 추정):{" "}
                      {formatMoney(Number(treeData.commissionAmount || 0))}원
                    </div>
                  ) : (
                    <div className="text-sm font-medium">
                      당일 단가:{" "}
                      {Number(
                        treeData.effectiveUnitPrice || 0,
                      ).toLocaleString()}
                      원
                    </div>
                  )}
                </div>
                <TreeNode
                  node={treeData.tree}
                  depth={0}
                  onSelect={(n) => setSelectedNode(n)}
                />
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

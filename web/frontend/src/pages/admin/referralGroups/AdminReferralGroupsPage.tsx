import { useMemo, useState } from "react";
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
    };
    groups?: ApiGroupRow[];
  };
  message?: string;
  error?: string;
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
  const [selectedLeaderId, setSelectedLeaderId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<ApiTreeNode | null>(null);

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
    if (!q) return groups;
    return groups.filter((g) => {
      const leader = g.leader || ({} as any);
      const hay =
        `${leader.organization || ""} ${leader.name || ""} ${leader.email || ""}`
          .trim()
          .toLowerCase();
      return hay.includes(q);
    });
  }, [groups, search]);

  const effectiveLeaderId =
    selectedLeaderId || (filteredGroups[0]?.leader?._id ?? null);

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
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">리퍼럴그룹</h1>
          <p className="text-sm text-muted-foreground">
            리더 기준으로 멤버 추천 계층도를 표시합니다. (단가/주문 합산은 리더
            본인+직계 기준)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">
              그룹 주문 합산(최근30일)
            </CardDescription>
            <CardTitle className="text-lg">
              {Number(overview?.totalGroupOrders || 0).toLocaleString()}건
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">계정 수</CardDescription>
            <CardTitle className="text-lg">
              {Number(overview?.totalAccounts || 0).toLocaleString()}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">
              그룹 주문 합산(최근30일)
            </CardDescription>
            <CardTitle className="text-lg">
              {Number(overview?.totalGroupOrders || 0).toLocaleString()}건
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-xs">
              평균 당일 단가
            </CardDescription>
            <CardTitle className="text-lg">
              {Number(overview?.avgEffectiveUnitPrice || 0).toLocaleString()}원
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">그룹 목록</CardTitle>
            <CardDescription className="text-xs">
              리더(최상위) 계정 기준
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="조직/이름/이메일 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <div className="space-y-2 max-h-[65vh] overflow-y-auto pr-1">
              {isGroupListLoading ? (
                <div className="text-sm text-muted-foreground">로딩중...</div>
              ) : filteredGroups.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  표시할 그룹이 없습니다.
                </div>
              ) : (
                filteredGroups.map((g) => {
                  const isActive =
                    String(g.leader?._id) === String(effectiveLeaderId);
                  const title =
                    g.leader?.organization ||
                    g.leader?.name ||
                    g.leader?.email ||
                    "";
                  const groupTotalOrders = Number(g.groupTotalOrders || 0);
                  const effectiveUnitPrice = Number(g.effectiveUnitPrice || 0);
                  return (
                    <Button
                      key={g.leader?._id}
                      type="button"
                      variant={isActive ? "default" : "outline"}
                      className="w-full justify-between h-auto py-2 px-3"
                      onClick={() => setSelectedLeaderId(String(g.leader?._id))}
                    >
                      <div className="text-left min-w-0">
                        <div className="truncate text-sm font-medium">
                          {title}
                        </div>
                        <div className="truncate text-[11px] opacity-80">
                          {g.leader?.email || ""}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] opacity-80">
                          <span>
                            최근30일(리더+직계){" "}
                            {groupTotalOrders.toLocaleString()}건 · 단가{" "}
                            {effectiveUnitPrice.toLocaleString()}원
                          </span>
                          {!g.snapshotComputedAt ? (
                            <Badge variant="outline" className="text-[10px]">
                              미생성
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                      <Badge variant="secondary">{g.memberCount}</Badge>
                    </Button>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">계층도</CardTitle>
            <CardDescription className="text-xs">
              추천 관계(`referredByUserId`) 기준 (그룹 전체 구조)
            </CardDescription>
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
                  <div className="text-sm font-medium">
                    당일 단가:{" "}
                    {Number(treeData.effectiveUnitPrice || 0).toLocaleString()}
                    원
                  </div>
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

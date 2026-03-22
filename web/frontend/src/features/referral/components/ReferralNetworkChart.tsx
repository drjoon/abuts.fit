import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ReferralNode = {
  _id: string;
  role?: "requestor" | "salesman" | "devops";
  name?: string;
  email?: string;
  business?: string;
  businessAnchorId?: string;
  active?: boolean;
  lastMonthOrders?: number;
  lastMonthPaidOrders?: number;
  lastMonthBonusOrders?: number;
  lastMonthPaidRevenue?: number;
  lastMonthBonusRevenue?: number;
  children?: ReferralNode[];
};

type ReferralRole = "requestor" | "salesman" | "devops";

const ROLE_COLOR: Record<ReferralRole, string> = {
  requestor: "#3b82f6",
  salesman: "#64748b",
  devops: "#8b5cf6",
};

const ROLE_LABEL: Record<ReferralRole, string> = {
  requestor: "의뢰자",
  salesman: "영업자",
  devops: "개발운영사",
};

type ReferralNetworkChartProps = {
  data: ReferralNode | null;
  maxDepth?: number; // 의뢰자는 1 (직접 소개만), 관리자는 제한 없음
  title?: string;
  visibleRoles?: ReferralRole[];
  legendRoles?: ReferralRole[];
  chartHeight?: number;
  mode?: "tree" | "radial-tree" | "radial-group";
};

export function ReferralNetworkChart({
  data,
  maxDepth = 999,
  title = "소개 네트워크",
  visibleRoles,
  legendRoles = ["requestor", "salesman", "devops"],
  chartHeight = 500,
  mode = "tree",
}: ReferralNetworkChartProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!chartRef.current || !data) return;

    // 차트 인스턴스 생성 또는 재사용
    if (!chartInstanceRef.current) {
      chartInstanceRef.current = echarts.init(chartRef.current);
    }

    const chart = chartInstanceRef.current;
    const allowedRoles = new Set<ReferralRole>(
      (visibleRoles && visibleRoles.length
        ? visibleRoles
        : ["requestor", "salesman", "devops"]) as ReferralRole[],
    );

    const transformNode = (node: ReferralNode, depth: number = 0): any => {
      if (depth > maxDepth) return null;

      const normalizedRole = (node.role || "requestor") as ReferralRole;
      if (depth > 0 && !allowedRoles.has(normalizedRole)) return null;

      const children =
        depth < maxDepth && node.children
          ? node.children
              .map((child) => transformNode(child, depth + 1))
              .filter(Boolean)
          : [];
      const displayName = String(
        node.business || node.name || node.email || node._id,
      ).trim();

      return {
        id: node._id,
        name: displayName,
        rawName: node.business || node.name || node.email || node._id,
        role: normalizedRole,
        active: Boolean(node.active),
        value: node.lastMonthOrders || 0,
        lastMonthOrders: node.lastMonthOrders || 0,
        lastMonthPaidOrders: node.lastMonthPaidOrders || 0,
        lastMonthBonusOrders: node.lastMonthBonusOrders || 0,
        lastMonthPaidRevenue: node.lastMonthPaidRevenue || 0,
        lastMonthBonusRevenue: node.lastMonthBonusRevenue || 0,
        itemStyle: {
          color: ROLE_COLOR[normalizedRole],
          borderColor: node.active ? "#fff" : "#999",
          borderWidth: 2,
        },
        label: {
          show: true,
          formatter: (params: any) => {
            const lines = [params.name];
            if (normalizedRole) {
              lines.push(ROLE_LABEL[normalizedRole]);
            }
            if (node.lastMonthOrders) {
              lines.push(`${node.lastMonthOrders}건`);
            }
            return lines.join("\n");
          },
          fontSize: 11,
          color: "#333",
        },
        children: children.length > 0 ? children : undefined,
      };
    };

    const treeData = transformNode(data);

    if (!treeData) {
      chart.clear();
      return;
    }

    const buildRadialGroupGraph = (root: any) => {
      const members = [
        root,
        ...(Array.isArray(root.children) ? root.children : []),
      ];
      const rootName = root.rawName || root.name;
      const graphNodes = members.map((node: any, index: number) => {
        const isRoot = index === 0;
        const role = (node.role || "requestor") as ReferralRole;
        const childCount = Math.max(0, members.length - 1);
        const radius = childCount <= 2 ? 128 : 150;
        let x = 0;
        let y = 0;
        if (!isRoot) {
          if (childCount === 1) {
            x = 0;
            y = -radius;
          } else if (childCount === 2) {
            x = index === 1 ? -radius * 0.88 : radius * 0.88;
            y = 0;
          } else {
            const angleIndex = index - 1;
            const angle =
              -Math.PI / 2 + (angleIndex * (Math.PI * 2)) / childCount;
            x = Math.cos(angle) * radius;
            y = Math.sin(angle) * radius;
          }
        }
        return {
          id: String(node.id || node.name),
          name: node.name,
          rawName: node.rawName,
          role,
          value: Number(node.lastMonthOrders || node.value || 0),
          lastMonthOrders: Number(node.lastMonthOrders || node.value || 0),
          lastMonthPaidOrders: Number(node.lastMonthPaidOrders || 0),
          lastMonthBonusOrders: Number(node.lastMonthBonusOrders || 0),
          x,
          y,
          fixed: true,
          symbolSize: isRoot ? 84 : 62,
          itemStyle: {
            color: ROLE_COLOR[role],
            borderColor: isRoot ? "#bfdbfe" : "#dbeafe",
            borderWidth: isRoot ? 6 : 4,
            shadowBlur: isRoot ? 24 : 16,
            shadowColor: "rgba(59,130,246,0.24)",
          },
          label: {
            show: true,
            color: isRoot ? "#ffffff" : "#0f172a",
            fontSize: isRoot ? 14 : 12,
            fontWeight: isRoot ? 800 : 700,
            lineHeight: 15,
            backgroundColor: "transparent",
            padding: 0,
            borderRadius: 0,
            formatter: () => {
              const displayName = String(node.name || "");
              const shortName =
                displayName.length > 12
                  ? `${displayName.slice(0, 12)}…`
                  : displayName;
              const lines = [shortName];
              if (!isRoot && role) lines.push(ROLE_LABEL[role]);
              if (node.lastMonthOrders && isRoot) {
                lines.push(`${node.lastMonthOrders}건`);
              }
              return lines.join("\n");
            },
          },
        };
      });
      const links = graphNodes.slice(1).map((node: any) => ({
        source: String(graphNodes[0]?.id || rootName),
        target: String(node.id),
        lineStyle: {
          color: "#93c5fd",
          width: 2,
          curveness: 0,
        },
      }));
      return { graphNodes, links };
    };

    const baseTooltip: echarts.TooltipComponentOption = {
      trigger: "item",
      formatter: (params: any) => {
        const node = params.data;
        const lines = [
          `<strong>${node.rawName || node.name}</strong>`,
          `주문: ${Number(node.lastMonthOrders || node.value || 0)}건`,
        ];
        const paidOrders = Number(node.lastMonthPaidOrders || 0);
        const bonusOrders = Number(node.lastMonthBonusOrders || 0);
        if (paidOrders > 0 || bonusOrders > 0) {
          lines.push(`유료 ${paidOrders}건 / 무료 ${bonusOrders}건`);
        }
        return lines.join("<br/>");
      },
    };

    let option: echarts.EChartsOption;

    if (mode === "radial-group") {
      const { graphNodes, links } = buildRadialGroupGraph(treeData);
      option = {
        tooltip: baseTooltip,
        animationDuration: 550,
        series: [
          {
            type: "graph",
            layout: "none",
            data: graphNodes,
            links,
            roam: false,
            draggable: false,
            left: "12%",
            top: "10%",
            right: "12%",
            bottom: "10%",
            lineStyle: {
              color: "#bfdbfe",
              width: 2.1,
              opacity: 0.84,
              curveness: 0.15,
            },
            edgeSymbol: ["none", "none"],
            emphasis: {
              focus: "adjacency",
              lineStyle: {
                width: 3,
                color: "#60a5fa",
              },
            },
            labelLayout: {
              hideOverlap: true,
            },
            force: {
              repulsion: 0,
              edgeLength: 0,
            },
          },
        ],
      };
    } else {
      option = {
        tooltip: baseTooltip,
        series: [
          {
            type: "tree",
            data: [treeData],
            top: mode === "radial-tree" ? "8%" : "6%",
            left: mode === "radial-tree" ? "14%" : "30%",
            bottom: mode === "radial-tree" ? "8%" : "6%",
            right: mode === "radial-tree" ? "14%" : "30%",
            symbolSize: mode === "radial-tree" ? 17 : 20,
            orient: mode === "radial-tree" ? undefined : "LR",
            layout: mode === "radial-tree" ? "radial" : undefined,
            edgeShape: "polyline",
            edgeForkPosition: mode === "radial-tree" ? undefined : "22%",
            initialTreeDepth: -1,
            label:
              mode === "radial-tree"
                ? {
                    position: [14, 0],
                    verticalAlign: "middle",
                    align: "left",
                    fontSize: 12,
                    fontWeight: 700,
                    distance: 12,
                    overflow: "truncate",
                  }
                : {
                    position: [14, 0],
                    verticalAlign: "middle",
                    align: "left",
                    fontSize: 12,
                    fontWeight: 700,
                    distance: 14,
                    overflow: "truncate",
                  },
            leaves:
              mode === "radial-tree"
                ? {
                    label: {
                      position: [14, 0],
                      verticalAlign: "middle",
                      align: "left",
                      fontSize: 12,
                      fontWeight: 700,
                      distance: 12,
                      overflow: "truncate",
                    },
                  }
                : {
                    label: {
                      position: [14, 0],
                      verticalAlign: "middle",
                      align: "left",
                      fontSize: 12,
                      fontWeight: 700,
                      distance: 14,
                      overflow: "truncate",
                    },
                  },
            expandAndCollapse: true,
            animationDuration: 700,
            animationDurationUpdate: 900,
            emphasis: {
              focus: "descendant",
            },
            lineStyle: {
              color: mode === "radial-tree" ? "#94a3b8" : "#cbd5e1",
              width: mode === "radial-tree" ? 1.3 : 1.6,
            },
          },
        ],
      };
    }

    chart.setOption(option);

    // 리사이즈 핸들러
    const handleResize = () => {
      chart.resize();
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [chartHeight, data, maxDepth, mode, visibleRoles]);

  // 컴포넌트 언마운트 시 차트 정리
  useEffect(() => {
    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
    };
  }, []);

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64 text-muted-foreground">
            소개 데이터가 없습니다.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div
          ref={chartRef}
          className="w-full"
          style={{ height: `${chartHeight}px`, minHeight: `${chartHeight}px` }}
        />
        {legendRoles.length ? (
          <div className="mt-4 flex gap-4 text-sm text-muted-foreground">
            {legendRoles.map((role) => (
              <div key={role} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: ROLE_COLOR[role] }}
                />
                <span>{ROLE_LABEL[role]}</span>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

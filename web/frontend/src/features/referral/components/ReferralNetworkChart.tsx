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
  salesman: "#10b981",
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
};

export function ReferralNetworkChart({
  data,
  maxDepth = 999,
  title = "소개 네트워크",
  visibleRoles,
  legendRoles = ["requestor", "salesman", "devops"],
  chartHeight = 500,
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

    // 트리 데이터 변환 (maxDepth 제한 적용)
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
        name: displayName,
        rawName: node.business || node.name || node.email || node._id,
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

    const option: echarts.EChartsOption = {
      tooltip: {
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
      },
      series: [
        {
          type: "tree",
          data: [treeData],
          top: "6%",
          left: "30%",
          bottom: "6%",
          right: "30%",
          symbolSize: 20,
          orient: "LR", // 좌우 방향
          edgeShape: "polyline",
          edgeForkPosition: "22%",
          initialTreeDepth: -1,
          label: {
            position: "right",
            verticalAlign: "middle",
            align: "left",
            fontSize: 11,
            distance: 10,
            overflow: "truncate",
          },
          leaves: {
            label: {
              position: "right",
              verticalAlign: "middle",
              align: "left",
              fontSize: 11,
              distance: 10,
              overflow: "truncate",
            },
          },
          expandAndCollapse: true,
          animationDuration: 550,
          animationDurationUpdate: 750,
          emphasis: {
            focus: "descendant",
          },
          lineStyle: {
            color: "#cbd5e1",
            width: 1.5,
          },
        },
      ],
    };

    chart.setOption(option);

    // 리사이즈 핸들러
    const handleResize = () => {
      chart.resize();
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [chartHeight, data, maxDepth, visibleRoles]);

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

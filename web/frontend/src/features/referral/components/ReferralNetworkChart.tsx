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
  children?: ReferralNode[];
};

type ReferralNetworkChartProps = {
  data: ReferralNode | null;
  maxDepth?: number; // 의뢰자는 1 (직접 소개만), 관리자는 제한 없음
  title?: string;
};

export function ReferralNetworkChart({
  data,
  maxDepth = 999,
  title = "소개 네트워크",
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

    // 트리 데이터 변환 (maxDepth 제한 적용)
    const transformNode = (
      node: ReferralNode,
      depth: number = 0
    ): any => {
      if (depth > maxDepth) return null;

      const roleColor: Record<string, string> = {
        requestor: "#3b82f6", // 파란색
        salesman: "#10b981", // 초록색
        devops: "#8b5cf6", // 보라색
      };

      const roleLabel: Record<string, string> = {
        requestor: "의뢰자",
        salesman: "영업자",
        devops: "개발운영사",
      };

      const children =
        depth < maxDepth && node.children
          ? node.children
              .map((child) => transformNode(child, depth + 1))
              .filter(Boolean)
          : [];

      return {
        name: node.business || node.name || node.email || node._id,
        value: node.lastMonthOrders || 0,
        itemStyle: {
          color: roleColor[node.role || "requestor"],
          borderColor: node.active ? "#fff" : "#999",
          borderWidth: 2,
        },
        label: {
          show: true,
          formatter: (params: any) => {
            const lines = [params.name];
            if (node.role) {
              lines.push(roleLabel[node.role]);
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
            `<strong>${node.name}</strong>`,
            `주문: ${node.value}건`,
          ];
          return lines.join("<br/>");
        },
      },
      series: [
        {
          type: "tree",
          data: [treeData],
          top: "10%",
          left: "10%",
          bottom: "10%",
          right: "10%",
          symbolSize: 12,
          orient: "LR", // 좌우 방향
          label: {
            position: "right",
            verticalAlign: "middle",
            align: "left",
            fontSize: 11,
          },
          leaves: {
            label: {
              position: "right",
              verticalAlign: "middle",
              align: "left",
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
  }, [data, maxDepth]);

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
          style={{ height: "500px", minHeight: "400px" }}
        />
        <div className="mt-4 flex gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-600" />
            <span>의뢰자</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-600" />
            <span>영업자</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-violet-600" />
            <span>개발운영사</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

import type { PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Clock,
  CheckCircle,
  FileText,
  AlertTriangle,
  Boxes,
  Wrench,
  Factory,
  PackageCheck,
} from "lucide-react";

export const ManufacturerDashboardPage = () => {
  const { user, token } = useAuthStore();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PeriodFilterValue>("30d");
  const [riskModalOpen, setRiskModalOpen] = useState(false);

  if (!user || user.role !== "manufacturer") return null;

  const { data: riskSummaryResponse } = useQuery({
    queryKey: ["manufacturer-dashboard-risk-summary", period],
    enabled: Boolean(token),
    queryFn: async () => {
      const res = await apiFetch<any>({
        path: `/api/requests/dashboard-risk-summary?period=${period}`,
        method: "GET",
        token,
      });
      if (!res.ok) {
        throw new Error("지연 위험 요약 조회에 실패했습니다.");
      }
      return res.data;
    },
    retry: false,
  });

  const { data: managementStatusResponse } = useQuery({
    queryKey: ["manufacturer-dashboard-management-status"],
    enabled: Boolean(token),
    queryFn: async () => {
      const res = await apiFetch<any>({
        path: `/api/manufacturer/management-status`,
        method: "GET",
        token,
      });
      if (!res.ok) {
        throw new Error("관리 상태 조회에 실패했습니다.");
      }
      return res.data;
    },
    retry: false,
  });

  const riskSummary = riskSummaryResponse?.success
    ? (riskSummaryResponse.data?.riskSummary ?? null)
    : null;

  const managementStatus = managementStatusResponse?.success
    ? (managementStatusResponse.data?.status ?? {})
    : {};

  const stats = [
    {
      key: "in-progress",
      label: "진행중",
      value: "0",
      icon: FileText,
      change: "",
    },
    {
      key: "risk",
      label: "지연 위험",
      value: String(riskSummary?.delayedCount ?? 0),
      icon: AlertTriangle,
      change: "",
    },
    {
      key: "warning",
      label: "주의 대상",
      value: String(riskSummary?.warningCount ?? 0),
      icon: Clock,
      change: "",
    },
    {
      key: "on-time",
      label: "정시율",
      value: `${riskSummary?.onTimeRate ?? 100}%`,
      icon: CheckCircle,
      change: "",
    },
    {
      key: "machines",
      label: "가동 장비",
      value: "2대",
      icon: Factory,
      change: "M3, M4",
    },
  ];

  const managementCards = [
    {
      key: "material-change",
      label: "소재 관리",
      description: "소재 재고/교체 관리",
      href: "/dashboard/cnc",
      icon: Boxes,
      meta: ["소재 재고/교체 예약"],
      hasIssue: managementStatus.material?.hasIssue ?? false,
      status: managementStatus.material?.status ?? "이상 없음",
    },
    {
      key: "tools",
      label: "공구 관리",
      description: "공구 수명/오프셋 관리",
      href: "/dashboard/cnc",
      icon: Wrench,
      meta: ["마모/교체 주기 확인"],
      hasIssue: managementStatus.tools?.hasIssue ?? false,
      status: managementStatus.tools?.status ?? "이상 없음",
    },
    {
      key: "machines",
      label: "장비 관리",
      description: "CNC · 프린터 장비 관리",
      href: "/dashboard/cnc",
      icon: Factory,
      meta: ["장비 상태/알람 확인"],
      hasIssue: managementStatus.machines?.hasIssue ?? false,
      status: managementStatus.machines?.status ?? "이상 없음",
    },
    {
      key: "products",
      label: "제품 관리",
      description: "제품/생산 프로파일 관리",
      href: "/dashboard/products",
      icon: PackageCheck,
      meta: ["프로파일/템플릿 관리"],
      hasIssue: managementStatus.products?.hasIssue ?? false,
      status: managementStatus.products?.status ?? "이상 없음",
    },
  ];

  return (
    <>
      <DashboardShell
        title={`안녕하세요, ${user.name}님!`}
        subtitle="제작 현황을 확인하세요."
        headerRight={
          <div className="flex flex-wrap items-center gap-2">
            <PeriodFilter value={period} onChange={setPeriod} />
          </div>
        }
        topSection={
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-stretch">
              {managementCards.map((item) => (
                <Card
                  key={item.key}
                  onClick={() => navigate(item.href)}
                  className="app-glass-card app-glass-card--lg cursor-pointer"
                >
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-3">
                      <item.icon className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="text-sm font-semibold text-slate-900">
                            {item.label}
                          </div>
                          <span
                            className={`text-[11px] font-semibold whitespace-nowrap ${
                              item.hasIssue ? "text-red-600" : "text-green-600"
                            }`}
                          >
                            {item.hasIssue
                              ? item.status || "이상 있음"
                              : "이상 없음"}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground flex flex-col gap-1">
                          <span>{item.description}</span>
                          {item.meta?.map((line) => (
                            <span
                              key={line}
                              className="text-[11px] text-slate-500"
                            >
                              {line}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        }
        stats={
          <>
            {stats.map((stat, index) => (
              <Card
                key={index}
                onClick={() => {
                  if (stat.key === "risk") setRiskModalOpen(true);
                }}
                className="app-glass-card app-glass-card--lg cursor-pointer"
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {stat.label}
                  </CardTitle>
                  <stat.icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  {stat.change && (
                    <p className="text-xs text-muted-foreground">
                      {stat.change}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </>
        }
        mainLeft={null}
        mainRight={null}
      />
      <RiskDetailModal
        open={riskModalOpen}
        onOpenChange={setRiskModalOpen}
        riskSummary={riskSummary}
      />
    </>
  );
};

const RiskDetailModal = ({
  open,
  onOpenChange,
  riskSummary,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  riskSummary: any;
}) => {
  const items = riskSummary?.items || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>발송 마감 위험 상세</DialogTitle>
          <DialogDescription>
            운송장 입력 마감(15:00) 기준으로 임박/지연 의뢰를 확인하고
            조치하세요.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {items.map((item: any) => (
            <div
              key={item.id}
              className="rounded-lg border border-border p-3 space-y-1"
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="text-[10px]">
                  {item.riskLevel === "danger" ? "지연" : "주의"}
                </Badge>
                <span>
                  {item.dueDate
                    ? `발송마감 ${String(item.dueDate).slice(0, 16)}`
                    : "-"}
                </span>
              </div>
              <div className="font-medium text-sm">{item.title}</div>
              <div className="text-xs text-muted-foreground">
                {item.status} • {item.manufacturer || "-"}
              </div>
              <div className="text-xs text-muted-foreground line-clamp-2">
                {item.message}
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-4">
              표시할 지연/주의 의뢰가 없습니다.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ManufacturerDashboardPage;

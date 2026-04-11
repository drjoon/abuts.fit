import type { PeriodFilterValue } from "@/shared/ui/PeriodFilter";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
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
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  ClipboardList,
  FileText,
  Boxes,
  Wrench,
  Factory,
  Package,
  Wallet,
} from "lucide-react";

export const ManufacturerDashboardPage = () => {
  const { user, token } = useAuthStore();
  const [period, setPeriod] = useState<PeriodFilterValue>("30d");
  const [riskModalOpen, setRiskModalOpen] = useState(false);
  const [materialDetailOpen, setMaterialDetailOpen] = useState(false);
  const [toolsDetailOpen, setToolsDetailOpen] = useState(false);
  const [machinesDetailOpen, setMachinesDetailOpen] = useState(false);

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

  const { data: assignedSummaryResponse } = useQuery({
    queryKey: ["manufacturer-dashboard-assigned-summary", period],
    enabled: Boolean(token),
    queryFn: async () => {
      const res = await apiFetch<any>({
        path: `/api/requests/assigned/dashboard-summary?period=${period}`,
        method: "GET",
        token,
      });
      if (!res.ok) {
        throw new Error("제조사 대시보드 요약 조회에 실패했습니다.");
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

  const assignedSummary = assignedSummaryResponse?.success
    ? (assignedSummaryResponse.data ?? {})
    : {};

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.log("[Dashboard] manufacturer risk summary", riskSummaryResponse);
      console.log(
        "[Dashboard] manufacturer assigned summary",
        assignedSummaryResponse,
      );
    }
  }, [riskSummaryResponse, assignedSummaryResponse]);

  const managementStatus = managementStatusResponse?.success
    ? (managementStatusResponse.data?.status ?? {})
    : {};

  const matStatus = managementStatus.material ?? {};
  const toolsStatus = managementStatus.tools ?? {};
  const machinesStatus = managementStatus.machines ?? {};

  const inProgressTotal =
    (assignedSummary.requestCount ?? 0) +
    (assignedSummary.camCount ?? 0) +
    (assignedSummary.machiningCount ?? 0) +
    (assignedSummary.packingCount ?? 0) +
    (assignedSummary.shippingCount ?? 0);

  const riskDelayed = riskSummary?.delayedCount ?? 0;
  const riskWarning = riskSummary?.warningCount ?? 0;
  const hasRisk = riskDelayed > 0 || riskWarning > 0;

  const stageStats = [
    {
      key: "request-cancel",
      label: "의뢰/취소",
      value: `${assignedSummary.requestCount ?? 0}/${assignedSummary.canceledCount ?? 0}`,
      icon: FileText,
      hint: "의뢰 단계 / 취소 건수",
    },
    {
      key: "cam",
      label: "CAM",
      value: String(assignedSummary.camCount ?? 0),
      icon: Wrench,
      hint: "CAM 단계",
    },
    {
      key: "machining",
      label: "가공",
      value: String(assignedSummary.machiningCount ?? 0),
      icon: Factory,
      hint: "가공 단계",
    },
    {
      key: "packing",
      label: "세척·패킹",
      value: String(assignedSummary.packingCount ?? 0),
      icon: Boxes,
      hint: "세척·패킹 단계",
    },
    {
      key: "shipping",
      label: "포장·발송",
      value: String(assignedSummary.shippingCount ?? 0),
      icon: Package,
      hint: "포장·발송 단계",
    },
    {
      key: "tracking",
      label: "추적관리",
      value: String(assignedSummary.trackingCount ?? 0),
      icon: CheckCircle,
      hint: "집하/배송 추적",
    },
  ];

  return (
    <>
      <DashboardShell
        title={`안녕하세요, ${user.name}님!`}
        subtitle="제작 현황을 확인하세요."
        headerRight={
          <div className="flex flex-wrap items-center gap-2">
            {inProgressTotal > 0 && (
              <Badge variant="secondary" className="text-xs font-medium">
                진행 중 {inProgressTotal}건
              </Badge>
            )}
            <PeriodFilter value={period} onChange={setPeriod} />
          </div>
        }
        topSection={
          <div className="space-y-3">
            {hasRisk && (
              <button
                onClick={() => setRiskModalOpen(true)}
                className="w-full text-left rounded-lg border px-4 py-3 transition-colors"
                style={{
                  borderColor: riskDelayed > 0 ? "#fca5a5" : "#fcd34d",
                  background: riskDelayed > 0 ? "#fff1f2" : "#fffbeb",
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <AlertTriangle
                      className={`h-4 w-4 flex-shrink-0 ${
                        riskDelayed > 0 ? "text-red-500" : "text-amber-500"
                      }`}
                    />
                    <span
                      className={`text-sm font-semibold ${
                        riskDelayed > 0 ? "text-red-700" : "text-amber-700"
                      }`}
                    >
                      발송 마감 위험
                    </span>
                    {riskDelayed > 0 && (
                      <span className="text-[10px] font-bold bg-red-600 text-white px-2 py-0.5 rounded-full">
                        지연 {riskDelayed}건
                      </span>
                    )}
                    {riskWarning > 0 && (
                      <span className="text-[10px] font-bold bg-amber-500 text-white px-2 py-0.5 rounded-full">
                        주의 {riskWarning}건
                      </span>
                    )}
                  </div>
                  <ArrowRight
                    className={`h-4 w-4 ${
                      riskDelayed > 0 ? "text-red-400" : "text-amber-400"
                    }`}
                  />
                </div>
              </button>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-stretch">
              {/* 소재 관리 */}
              <Card
                onClick={() => setMaterialDetailOpen(true)}
                className="app-glass-card app-glass-card--lg cursor-pointer"
              >
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <Boxes className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="text-sm font-semibold text-slate-900">
                          소재 관리
                        </div>
                        <span
                          className={`text-[11px] font-semibold whitespace-nowrap ${
                            matStatus.scheduledChanges > 0
                              ? "text-amber-600"
                              : "text-green-600"
                          }`}
                        >
                          {matStatus.scheduledChanges > 0
                            ? `교체 예약 ${matStatus.scheduledChanges}건`
                            : "이상 없음"}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div>전체 {matStatus.totalCount ?? "-"}대</div>
                        {matStatus.groups &&
                          Object.keys(matStatus.groups).length > 0 && (
                            <div className="flex gap-2 flex-wrap">
                              {Object.entries(
                                matStatus.groups as Record<string, number>,
                              )
                                .sort(([a], [b]) => Number(a) - Number(b))
                                .map(([dg, cnt]) => (
                                  <span
                                    key={dg}
                                    className="text-[11px] text-slate-600 font-medium"
                                  >
                                    {dg}mm · {cnt}대
                                  </span>
                                ))}
                            </div>
                          )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 공구 관리 */}
              <Card
                onClick={() => setToolsDetailOpen(true)}
                className="app-glass-card app-glass-card--lg cursor-pointer"
              >
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <Wrench className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="text-sm font-semibold text-slate-900">
                          공구 관리
                        </div>
                        <span
                          className={`text-[11px] font-semibold whitespace-nowrap ${
                            toolsStatus.alarmCount > 0
                              ? "text-red-600"
                              : toolsStatus.warningCount > 0
                                ? "text-amber-600"
                                : "text-green-600"
                          }`}
                        >
                          {toolsStatus.alarmCount > 0
                            ? `교체 필요 ${toolsStatus.alarmCount}`
                            : toolsStatus.warningCount > 0
                              ? `주의 ${toolsStatus.warningCount}`
                              : "이상 없음"}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div className="flex gap-3">
                          {toolsStatus.alarmCount > 0 && (
                            <span className="text-red-600 font-medium">
                              교체 필요 {toolsStatus.alarmCount}
                            </span>
                          )}
                          {toolsStatus.warningCount > 0 && (
                            <span className="text-amber-600 font-medium">
                              주의 {toolsStatus.warningCount}
                            </span>
                          )}
                          {!toolsStatus.alarmCount &&
                            !toolsStatus.warningCount && (
                              <span>전체 공구 정상</span>
                            )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 장비 관리 */}
              <Card
                onClick={() => setMachinesDetailOpen(true)}
                className="app-glass-card app-glass-card--lg cursor-pointer"
              >
                <CardContent className="pt-6">
                  <div className="flex items-start gap-3">
                    <Factory className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="text-sm font-semibold text-slate-900">
                          장비 관리
                        </div>
                        <span
                          className={`text-[11px] font-semibold whitespace-nowrap ${
                            machinesStatus.maintenanceCount > 0 ||
                            machinesStatus.inactiveCount > 0
                              ? "text-amber-600"
                              : "text-green-600"
                          }`}
                        >
                          {machinesStatus.maintenanceCount > 0
                            ? `정비 중 ${machinesStatus.maintenanceCount}대`
                            : machinesStatus.inactiveCount > 0
                              ? `비활성 ${machinesStatus.inactiveCount}대`
                              : "이상 없음"}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div>전체 {machinesStatus.totalCount ?? "-"}대</div>
                        <div className="flex gap-2">
                          {machinesStatus.activeCount > 0 && (
                            <span className="text-[11px] text-slate-600 font-medium">
                              활성 {machinesStatus.activeCount}
                            </span>
                          )}
                          {machinesStatus.maintenanceCount > 0 && (
                            <span className="text-[11px] text-amber-600 font-medium">
                              정비 {machinesStatus.maintenanceCount}
                            </span>
                          )}
                          {machinesStatus.inactiveCount > 0 && (
                            <span className="text-[11px] text-slate-500 font-medium">
                              비활성 {machinesStatus.inactiveCount}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        }
        stats={
          <>
            {stageStats.map((stat) => (
              <Card
                key={stat.key}
                className="app-glass-card app-glass-card--lg"
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm sm:text-md font-medium text-foreground">
                    {stat.label}
                  </CardTitle>
                  <stat.icon className="h-4 w-4 text-slate-600 flex-shrink-0" />
                </CardHeader>
                <CardContent>
                  <div className="text-lg sm:text-xl md:text-2xl font-bold text-foreground whitespace-nowrap tracking-tight">
                    {stat.value}
                  </div>
                  {stat.hint && (
                    <p className="text-xs text-muted-foreground">{stat.hint}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </>
        }
      />
      <RiskDetailModal
        open={riskModalOpen}
        onOpenChange={setRiskModalOpen}
        riskSummary={riskSummary}
      />
      <MaterialDetailModal
        open={materialDetailOpen}
        onOpenChange={setMaterialDetailOpen}
        matStatus={matStatus}
      />
      <ToolsDetailModal
        open={toolsDetailOpen}
        onOpenChange={setToolsDetailOpen}
        toolsStatus={toolsStatus}
      />
      <MachinesDetailModal
        open={machinesDetailOpen}
        onOpenChange={setMachinesDetailOpen}
        machinesStatus={machinesStatus}
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

const MACHINE_STATUS_LABEL: Record<string, string> = {
  active: "활성",
  maintenance: "정비 중",
  inactive: "비활성",
};

const MaterialDetailModal = ({
  open,
  onOpenChange,
  matStatus,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  matStatus: any;
}) => {
  const machines: any[] = matStatus.machines ?? [];
  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("ko-KR", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>소재 관리</DialogTitle>
          <DialogDescription>
            장비별 현재 소재 장착 현황 및 교체 예약
          </DialogDescription>
        </DialogHeader>
        {machines.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">
            등록된 장비가 없습니다.
          </div>
        ) : (
          <div className="space-y-2">
            {machines.map((m: any) => (
              <div key={m.name} className="rounded-lg border p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-800">
                    {m.name}
                  </span>
                  {m.diameterGroup ? (
                    <span className="text-xs font-medium bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                      ⌀{m.diameterGroup}mm
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      소재 미장착
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-4 text-xs text-slate-600">
                  <div>
                    <span className="text-muted-foreground">종류 </span>
                    {m.materialType || "-"}
                  </div>
                  <div>
                    <span className="text-muted-foreground">잔여 </span>
                    {m.remainingLength != null ? `${m.remainingLength}mm` : "-"}
                  </div>
                </div>
                {m.scheduled && (
                  <div className="flex items-center gap-1.5 text-[11px] bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    <span className="font-medium text-amber-700">
                      교체 예약
                    </span>
                    <span className="text-amber-600">
                      ⌀{m.scheduled.newDiameterGroup}mm ·{" "}
                      {m.scheduled.targetTime
                        ? formatDate(m.scheduled.targetTime)
                        : ""}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="pt-1 flex justify-end">
          <Link
            to="/dashboard/cnc"
            className="text-xs text-primary underline-offset-2 hover:underline"
            onClick={() => onOpenChange(false)}
          >
            장비 페이지에서 관리 →
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const TOOL_ALERT_META: Record<string, { label: string; cls: string }> = {
  alarm: { label: "교체 필요", cls: "bg-red-100 text-red-700" },
  warn: { label: "주의", cls: "bg-amber-100 text-amber-700" },
  ok: { label: "정상", cls: "bg-green-100 text-green-700" },
  unknown: { label: "데이터 없음", cls: "bg-slate-100 text-slate-500" },
};

const ToolsDetailModal = ({
  open,
  onOpenChange,
  toolsStatus,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  toolsStatus: any;
}) => {
  const machines: any[] = toolsStatus.machines ?? [];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>공구 관리</DialogTitle>
          <DialogDescription>장비별 공구 수명 현황</DialogDescription>
        </DialogHeader>
        {machines.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">
            등록된 장비가 없습니다.
          </div>
        ) : (
          <div className="space-y-2">
            {machines.map((m: any) => {
              const alertMeta =
                TOOL_ALERT_META[m.alertLevel] ?? TOOL_ALERT_META.unknown;
              const dueTools: any[] = m.dueTools ?? [];
              return (
                <div key={m.name} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-semibold text-slate-800">
                        {m.name}
                      </span>
                      {m.machineId && (
                        <span className="ml-1.5 text-[11px] text-muted-foreground">
                          ({m.machineId})
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                        alertMeta.cls
                      }`}
                    >
                      {alertMeta.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="text-center">
                      <div className="text-muted-foreground text-[10px]">
                        전체
                      </div>
                      <div className="font-semibold text-slate-700">
                        {m.totalTools}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-muted-foreground text-[10px]">
                        교체 필요
                      </div>
                      <div
                        className={`font-semibold ${
                          m.alarmCount > 0 ? "text-red-600" : "text-slate-400"
                        }`}
                      >
                        {m.alarmCount}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-muted-foreground text-[10px]">
                        주의
                      </div>
                      <div
                        className={`font-semibold ${
                          m.warningCount > 0
                            ? "text-amber-600"
                            : "text-slate-400"
                        }`}
                      >
                        {m.warningCount}
                      </div>
                    </div>
                  </div>
                  {dueTools.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {dueTools.map((t: any) => (
                        <span
                          key={t.toolNum}
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                            t.status === "alarm"
                              ? "bg-red-50 text-red-700 border border-red-200"
                              : "bg-amber-50 text-amber-700 border border-amber-200"
                          }`}
                        >
                          T{String(t.toolNum).padStart(2, "0")}{" "}
                          {t.status === "alarm" ? "교체" : "주의"}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div className="pt-1 flex justify-end">
          <Link
            to="/dashboard/cnc"
            className="text-xs text-primary underline-offset-2 hover:underline"
            onClick={() => onOpenChange(false)}
          >
            장비 페이지에서 관리 →
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const MachinesDetailModal = ({
  open,
  onOpenChange,
  machinesStatus,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  machinesStatus: any;
}) => {
  const list: any[] = machinesStatus.list ?? [];
  const total = machinesStatus.totalCount ?? list.length;
  const active = machinesStatus.activeCount ?? 0;
  const maintenance = machinesStatus.maintenanceCount ?? 0;
  const inactive = machinesStatus.inactiveCount ?? 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>장비 관리</DialogTitle>
          <DialogDescription>CNC 장비 상태 현황</DialogDescription>
        </DialogHeader>
        {total > 0 && (
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg bg-green-50 border border-green-100 py-2">
              <div className="font-bold text-lg text-green-700">{active}</div>
              <div className="text-muted-foreground">활성</div>
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-100 py-2">
              <div className="font-bold text-lg text-amber-700">
                {maintenance}
              </div>
              <div className="text-muted-foreground">정비 중</div>
            </div>
            <div className="rounded-lg bg-slate-50 border py-2">
              <div className="font-bold text-lg text-slate-500">{inactive}</div>
              <div className="text-muted-foreground">비활성</div>
            </div>
          </div>
        )}
        {list.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">
            등록된 장비가 없습니다.
          </div>
        ) : (
          <div className="space-y-1.5">
            {list.map((m: any) => (
              <div
                key={m.name}
                className="flex items-center justify-between rounded-lg border px-3 py-2.5"
              >
                <div>
                  <span className="text-sm font-semibold text-slate-800">
                    {m.name}
                  </span>
                  {m.machineId && (
                    <span className="ml-1.5 text-[11px] text-muted-foreground">
                      {m.machineId}
                    </span>
                  )}
                </div>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    m.status === "active"
                      ? "bg-green-100 text-green-700"
                      : m.status === "maintenance"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {MACHINE_STATUS_LABEL[m.status] ?? m.status}
                </span>
              </div>
            ))}
          </div>
        )}
        <div className="pt-1 flex justify-end">
          <Link
            to="/dashboard/cnc"
            className="text-xs text-primary underline-offset-2 hover:underline"
            onClick={() => onOpenChange(false)}
          >
            장비 페이지에서 관리 →
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ManufacturerDashboardPage;

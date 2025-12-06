import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { WorksheetDiameterCardForDashboard } from "@/pages/requestor/WorkSheet";
import type { DiameterStats } from "@/shared/ui/dashboard/WorksheetDiameterCard";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import {
  Clock,
  CheckCircle,
  TrendingUp,
  FileText,
  RefreshCw,
} from "lucide-react";
import { FunctionalItemCard } from "@/components/FunctionalItemCard";

const mockRequestorData = {
  stats: [
    { label: "제출한 의뢰", value: "24", change: "+12%", icon: FileText },
    { label: "제작 중", value: "6", change: "+18%", icon: Clock },
    { label: "배송 중", value: "2", change: "+5%", icon: TrendingUp },
    { label: "완료된 의뢰", value: "14", change: "+22%", icon: CheckCircle },
  ],
  manufacturingSummary: {
    totalActive: 8,
    stages: [
      { key: "design", label: "디자인 검토", count: 3, percent: 38 },
      { key: "cnc", label: "CNC 가공", count: 2, percent: 25 },
      { key: "post", label: "후처리/폴리싱", count: 2, percent: 25 },
      { key: "shipping", label: "출고/배송 준비", count: 1, percent: 12 },
    ],
  },
  riskSummary: {
    delayedCount: 1,
    warningCount: 2,
    onTimeRate: 92,
    items: [
      {
        id: "REQ-002",
        title: "하악 좌측 제2소구치 임플란트",
        manufacturer: "정밀 어벗먼트",
        riskLevel: "warning",
        message: "예상 출고일보다 1일 지연 가능성이 있습니다.",
      },
      {
        id: "REQ-004",
        title: "상악 좌측 제1소구치 임플란트",
        manufacturer: "프리미엄 어벗먼트",
        riskLevel: "danger",
        message: "제조 공정 지연으로 출고일 재조정 필요.",
      },
    ],
  },
  recentRequests: [
    {
      id: "REQ-001",
      title: "상악 우측 제1대구치 임플란트",
      status: "제작중",
      manufacturer: "프리미엄 어벗먼트",
      date: "2025-07-15",
    },
    {
      id: "REQ-002",
      title: "하악 좌측 제2소구치 임플란트",
      status: "배송중",
      manufacturer: "정밀 어벗먼트",
      date: "2025-07-14",
    },
    {
      id: "REQ-003",
      title: "상악 전치부 임플란트",
      status: "완료",
      manufacturer: "스마트 어벗먼트",
      date: "2025-07-13",
    },
  ],
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case "진행중":
    case "제작중":
      return <Badge variant="default">{status}</Badge>;
    case "완료":
      return <Badge variant="secondary">{status}</Badge>;
    case "검토중":
      return <Badge variant="outline">{status}</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
};

export const RequestorDashboardPage = () => {
  const { user, token } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [period, setPeriod] = useState<"7d" | "30d" | "90d" | "all">("30d");
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [selectedBulkIds, setSelectedBulkIds] = useState<
    Record<string, boolean>
  >({});
  const [isRecentModalOpen, setIsRecentModalOpen] = useState(false);
  const [editingRequest, setEditingRequest] = useState<{
    id: string;
    title?: string;
    description?: string;
    clinicName?: string;
    patientName?: string;
    teethText?: string;
    implantManufacturer?: string;
    implantSystem?: string;
    implantType?: string;
  } | null>(null);
  const [editingDescription, setEditingDescription] = useState("");
  const [editingClinicName, setEditingClinicName] = useState("");
  const [editingPatientName, setEditingPatientName] = useState("");
  const [editingTeethText, setEditingTeethText] = useState("");
  const [editingImplantManufacturer, setEditingImplantManufacturer] =
    useState("");
  const [editingImplantSystem, setEditingImplantSystem] = useState("");
  const [editingImplantType, setEditingImplantType] = useState("");

  const {
    data: summaryResponse,
    refetch: refetchSummary,
    isFetching,
  } = useQuery({
    queryKey: ["requestor-dashboard-summary-page", period],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (period) {
        params.set("period", period);
      }
      const res = await fetch(
        `/api/requests/my/dashboard-summary?${params.toString()}`,
        {
          headers: token
            ? {
                Authorization: `Bearer ${token}`,
                "x-mock-role": "requestor",
              }
            : undefined,
        }
      );
      if (!res.ok) {
        throw new Error("대시보드 요약 조회에 실패했습니다.");
      }
      return res.json();
    },
    retry: false,
  });

  const {
    data: bulkResponse,
    isLoading: isBulkLoading,
    isFetching: isBulkFetching,
    refetch: refetchBulk,
  } = useQuery({
    queryKey: ["requestor-bulk-shipping"],
    queryFn: async () => {
      const res = await fetch(`/api/requests/my/bulk-shipping`, {
        headers: token
          ? {
              Authorization: `Bearer ${token}`,
              "x-mock-role": "requestor",
            }
          : undefined,
      });
      if (!res.ok) {
        throw new Error("묶음 배송 후보 조회에 실패했습니다.");
      }
      return res.json();
    },
  });

  const { data: myRequestsResponse, isLoading: isMyRequestsLoading } = useQuery(
    {
      queryKey: ["requestor-my-requests"],
      enabled: isRecentModalOpen && !!token,
      retry: false,
      queryFn: async () => {
        const res = await fetch(`/api/requests/my`, {
          headers: token
            ? {
                Authorization: `Bearer ${token}`,
                "x-mock-role": "requestor",
              }
            : undefined,
        });
        if (!res.ok) {
          throw new Error("의뢰 목록 조회에 실패했습니다.");
        }
        return res.json();
      },
    }
  );

  const bulkData = bulkResponse?.success ? bulkResponse.data : null;

  const myRequests = myRequestsResponse?.success
    ? myRequestsResponse.data?.requests ?? []
    : [];

  const cancelRequest = async (requestId: string) => {
    if (!token) return;

    try {
      const res = await fetch(`/api/requests/${requestId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-mock-role": "requestor",
        },
        body: JSON.stringify({ status: "취소" }),
      });

      if (!res.ok) {
        console.error("의뢰 취소 실패", await res.text());
        return;
      }

      await res.json();

      await queryClient.invalidateQueries({
        queryKey: ["requestor-dashboard-summary-page"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["requestor-my-requests"],
      });
    } catch (error) {
      console.error("의뢰 취소 중 오류", error);
    }
  };

  const baseData = mockRequestorData;
  // API 실패 시에도 mock 대신 빈 리스트를 사용하도록 기본값을 재정의
  let data: any = {
    ...baseData,
    stats: baseData.stats,
    manufacturingSummary: baseData.manufacturingSummary,
    riskSummary: baseData.riskSummary,
    recentRequests: [],
  };
  let diameterStatsFromApi: DiameterStats | undefined;

  if (summaryResponse?.success) {
    data = {
      ...baseData,
      stats: [
        {
          label: "제출한 의뢰",
          value: String(summaryResponse.data.stats.totalRequests ?? 0),
          change: baseData.stats[0]?.change ?? "+0%",
          icon: FileText,
        },
        {
          label: "제작 중",
          value: String(summaryResponse.data.stats.inProduction ?? 0),
          change: baseData.stats[1]?.change ?? "+0%",
          icon: Clock,
        },
        {
          label: "배송 중",
          value: String(summaryResponse.data.stats.inShipping ?? 0),
          change: baseData.stats[2]?.change ?? "+0%",
          icon: TrendingUp,
        },
        {
          label: "완료된 의뢰",
          value: String(summaryResponse.data.stats.completed ?? 0),
          change: baseData.stats[3]?.change ?? "+0%",
          icon: CheckCircle,
        },
      ],
      manufacturingSummary:
        summaryResponse.data.manufacturingSummary ??
        baseData.manufacturingSummary,
      riskSummary: summaryResponse.data.riskSummary ?? baseData.riskSummary,
      recentRequests:
        summaryResponse.data.recentRequests ?? baseData.recentRequests,
    };

    if (summaryResponse.data.diameterStats) {
      diameterStatsFromApi = summaryResponse.data
        .diameterStats as DiameterStats;
    }
  }

  return (
    <div>
      <DashboardShell
        title={`안녕하세요, ${user.name}님!`}
        subtitle="의뢰 현황을 확인하세요."
        headerRight={
          <div className="inline-flex items-center gap-1 rounded-lg border bg-muted p-1 text-xs">
            <span className="px-2 text-muted-foreground">기간</span>
            {["7d", "30d", "90d", "all"].map((value) => {
              const labelMap: Record<string, string> = {
                "7d": "최근 7일",
                "30d": "최근 30일",
                "90d": "최근 90일",
                all: "전체",
              };
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPeriod(value as any)}
                  className={`rounded-md px-2.5 py-1 text-[11px] transition-colors ${
                    period === value
                      ? "bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {labelMap[value]}
                </button>
              );
            })}
          </div>
        }
        stats={
          <>
            {data.stats.map((stat: any, index: number) => (
              <Card
                key={index}
                className="hover:shadow-elegant transition-shadow"
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-md font-medium">
                    {stat.label}
                  </CardTitle>
                  <stat.icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <p className="text-xs text-muted-foreground">
                    <span className="text-green-600">{stat.change}</span> 지난
                    달 대비
                  </p>
                </CardContent>
              </Card>
            ))}
          </>
        }
        topSection={
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
              <div>
                <WorksheetDiameterCardForDashboard
                  stats={diameterStatsFromApi}
                />
              </div>

              <div className="flex flex-col gap-6 h-full">
                <Card className="border-dashed border-orange-300 bg-orange-50/70 flex-none">
                  <CardHeader className="pb-0">
                    <CardTitle className="text-base font-semibold"></CardTitle>
                    <CardDescription className="text-md leading-relaxed text-orange-900/90">
                      아직 배송 신청하지 않은 건들을 모아서 묶음 배송으로 신청할
                      수 있습니다. 배송비를 절감하고 출고 일정을 한눈에 관리해
                      보세요.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-right pt-0">
                    <Button
                      variant="default"
                      className="whitespace-nowrap"
                      onClick={() => setIsBulkModalOpen(true)}
                    >
                      묶음 배송 신청하기
                    </Button>
                  </CardContent>
                </Card>

                <Card
                  className="flex-1 flex flex-col min-h-[220px] cursor-pointer"
                  onClick={() => {
                    refetchSummary();
                    refetchBulk();
                  }}
                >
                  <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
                    <CardTitle className="text-base font-semibold m-0">
                      최근 의뢰
                    </CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsRecentModalOpen(true);
                      }}
                    >
                      전체 보기
                    </Button>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col justify-between pt-0">
                    <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                      {data.recentRequests?.map((item: any) => {
                        const mongoId = item._id || item.id;
                        const displayId = item.requestId || item.id || mongoId;

                        return (
                          <FunctionalItemCard
                            key={displayId}
                            className="flex items-center justify-between p-3 border border-border rounded-lg"
                            onClick={(e) => e.stopPropagation()}
                            onUpdate={() => {
                              if (!mongoId) return;
                              setEditingRequest({
                                id: mongoId,
                                title: item.title || displayId,
                                description: item.description,
                                clinicName:
                                  item.clinicName ||
                                  item.requestor?.organization ||
                                  "",
                                patientName: item.patientName || "",
                                teethText: item.toothNumber || item.tooth || "",
                                implantManufacturer:
                                  item.implantManufacturer ?? "",
                                implantSystem:
                                  item.implantSystem ??
                                  item.specifications?.implantSystem ??
                                  "",
                                implantType:
                                  item.implantType ??
                                  item.specifications?.implantType ??
                                  "",
                              });
                              setEditingDescription(item.description || "");
                              setEditingClinicName(
                                item.clinicName ||
                                  item.requestor?.organization ||
                                  ""
                              );
                              setEditingPatientName(item.patientName || "");
                              setEditingTeethText(
                                item.toothNumber || item.tooth || ""
                              );
                              setEditingImplantManufacturer(
                                item.implantManufacturer || ""
                              );
                              setEditingImplantSystem(
                                item.implantSystem ||
                                  item.specifications?.implantSystem ||
                                  ""
                              );
                              setEditingImplantType(
                                item.implantType ||
                                  item.specifications?.implantType ||
                                  ""
                              );
                            }}
                            onRemove={
                              mongoId ? () => cancelRequest(mongoId) : undefined
                            }
                            confirmTitle="이 의뢰를 취소하시겠습니까?"
                            confirmDescription={
                              <div className="text-md">
                                <div className="font-medium mb-1 truncate">
                                  {item.title || displayId}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {item.manufacturer} • {item.date}
                                </div>
                              </div>
                            }
                            confirmLabel="의뢰 취소"
                            cancelLabel="닫기"
                          >
                            <div className="flex-1">
                              <div className="text-md font-medium truncate">
                                {item.title || displayId}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {item.manufacturer} • {item.date}
                              </div>
                            </div>
                            {getStatusBadge(item.status)}
                          </FunctionalItemCard>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">
                    지연 위험 요약
                  </CardTitle>
                  <CardDescription>
                    예상 출고일 기준으로 지연 가능성이 있는 의뢰를 요약해서
                    보여드립니다.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>
                      지연 가능성 의뢰: {data.riskSummary?.warningCount ?? 0}건
                    </span>
                    <span>
                      지연 확정 의뢰: {data.riskSummary?.delayedCount ?? 0}건
                    </span>
                    <span>
                      제때 출고 비율: {data.riskSummary?.onTimeRate ?? 0}%
                    </span>
                  </div>
                  <div className="space-y-2">
                    {data.riskSummary?.items?.map((item: any) => (
                      <div
                        key={item.id}
                        className="flex items-start justify-between rounded-lg border border-border bg-muted/40 p-3 gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">
                            {item.title}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {item.manufacturer}
                          </div>
                          <div className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
                            {item.message}
                          </div>
                        </div>
                        <div className="ml-2 flex-shrink-0">
                          {item.riskLevel === "danger" ? (
                            <Badge
                              variant="destructive"
                              className="text-[10px]"
                            >
                              지연 위험
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              주의
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        }
      />

      {/* 최근 의뢰 전체 보기 모달 */}
      <Dialog open={isRecentModalOpen} onOpenChange={setIsRecentModalOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden ">
          <DialogHeader>
            <DialogTitle>최근 의뢰 전체 보기</DialogTitle>
          </DialogHeader>
          <div className="mt-3 border rounded-lg bg-muted/30 max-h-[60vh] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
            {isMyRequestsLoading ? (
              <div className="p-4 text-md text-muted-foreground">
                의뢰 목록을 불러오는 중입니다...
              </div>
            ) : !myRequests.length ? (
              <div className="p-4 text-md text-muted-foreground">
                표시할 의뢰가 없습니다.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {myRequests.map((req: any) => {
                  const mongoId = req._id;
                  const displayId = req.requestId || req._id;

                  return (
                    <FunctionalItemCard
                      key={displayId}
                      className="flex items-start justify-between gap-3 p-3 hover:bg-background/80 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                      onUpdate={() => {
                        if (!mongoId) return;
                        setEditingRequest({
                          id: mongoId,
                          title: req.title || displayId,
                          description: req.description,
                          clinicName:
                            req.clinicName || req.requestor?.organization || "",
                          patientName: req.patientName || "",
                          teethText: req.toothNumber || req.tooth || "",
                          implantManufacturer: req.implantManufacturer ?? "",
                          implantSystem:
                            req.implantSystem ??
                            req.specifications?.implantSystem ??
                            "",
                          implantType:
                            req.implantType ??
                            req.specifications?.implantType ??
                            "",
                        });
                        setEditingDescription(req.description || "");
                        setEditingClinicName(
                          req.clinicName || req.requestor?.organization || ""
                        );
                        setEditingPatientName(req.patientName || "");
                        setEditingTeethText(req.toothNumber || req.tooth || "");
                        setEditingImplantManufacturer(
                          req.implantManufacturer || ""
                        );
                        setEditingImplantSystem(
                          req.implantSystem ||
                            req.specifications?.implantSystem ||
                            ""
                        );
                        setEditingImplantType(
                          req.implantType ||
                            req.specifications?.implantType ||
                            ""
                        );
                      }}
                      onRemove={
                        mongoId ? () => cancelRequest(mongoId) : undefined
                      }
                      confirmTitle="이 의뢰를 취소하시겠습니까?"
                      confirmDescription={
                        <div className="text-md">
                          <div className="font-medium mb-1 truncate">
                            {req.title || displayId}
                          </div>
                          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5">
                            {req.patientName && (
                              <span>환자 {req.patientName}</span>
                            )}
                            {req.toothNumber && (
                              <span>• 치아번호 {req.toothNumber}</span>
                            )}
                          </div>
                        </div>
                      }
                      confirmLabel="의뢰 취소"
                      cancelLabel="닫기"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-md font-medium truncate">
                          {req.title || displayId}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground flex flex-wrap gap-x-2 gap-y-0.5">
                          {req.patientName && (
                            <span>환자 {req.patientName}</span>
                          )}
                          {req.toothNumber && (
                            <span>• 치아번호 {req.toothNumber}</span>
                          )}
                          {req.createdAt && (
                            <span>
                              - 접수일{" "}
                              {new Date(req.createdAt)
                                .toISOString()
                                .slice(0, 10)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 text-right">
                        <div className="text-xs font-medium">
                          {req.status || "상태 미정"}
                        </div>
                        <div className="text-[11px] text-muted-foreground max-w-[160px] truncate">
                          {req.manufacturer?.organization ||
                            req.manufacturer?.name ||
                            "제조사 미정"}
                        </div>
                      </div>
                    </FunctionalItemCard>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 의뢰 간단 수정 모달 (설명만 수정) */}
      <Dialog
        open={!!editingRequest}
        onOpenChange={(open) => {
          if (!open) {
            setEditingRequest(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>의뢰 정보 수정</DialogTitle>
          </DialogHeader>
          <div className="mt-2 text-md text-muted-foreground">
            <div className="space-y-6">
              {/* 치과 / 환자 / 치아번호 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-md font-medium text-muted-foreground">
                    치과 이름
                  </label>
                  <input
                    type="text"
                    value={editingClinicName}
                    onChange={(e) => setEditingClinicName(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1"
                    placeholder="예: OO치과"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-md font-medium text-muted-foreground">
                    환자 이름
                  </label>
                  <input
                    type="text"
                    value={editingPatientName}
                    onChange={(e) => setEditingPatientName(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1"
                    placeholder="예: 홍길동"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-md font-medium text-muted-foreground">
                    치아번호
                  </label>
                  <input
                    type="text"
                    value={editingTeethText}
                    onChange={(e) => setEditingTeethText(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1"
                    placeholder="예: 21, 22"
                  />
                </div>
              </div>

              {/* 임플란트 정보 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <label className="text-md font-medium text-muted-foreground">
                    임플란트 제조사
                  </label>
                  <input
                    type="text"
                    value={editingImplantManufacturer}
                    onChange={(e) =>
                      setEditingImplantManufacturer(e.target.value)
                    }
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1"
                    placeholder="예: OSSTEM"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-md font-medium text-muted-foreground">
                    임플란트 시스템
                  </label>
                  <input
                    type="text"
                    value={editingImplantSystem}
                    onChange={(e) => setEditingImplantSystem(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1"
                    placeholder="예: Regular"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-md font-medium text-muted-foreground">
                    임플란트 타입
                  </label>
                  <input
                    type="text"
                    value={editingImplantType}
                    onChange={(e) => setEditingImplantType(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1"
                    placeholder="예: Hex"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-md font-medium text-muted-foreground">
                  메모 / 요청 사항
                </label>
                <textarea
                  value={editingDescription}
                  onChange={(e) => setEditingDescription(e.target.value)}
                  rows={4}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditingRequest(null)}
            >
              닫기
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={async () => {
                if (!editingRequest || !token) {
                  setEditingRequest(null);
                  return;
                }

                try {
                  const payload: any = {
                    description: editingDescription,
                  };

                  if (editingClinicName.trim()) {
                    payload.clinicName = editingClinicName.trim();
                  }
                  if (editingPatientName.trim()) {
                    payload.patientName = editingPatientName.trim();
                  }
                  if (editingTeethText.trim()) {
                    payload.tooth = editingTeethText.trim();
                  }

                  if (editingImplantManufacturer.trim()) {
                    payload.implantManufacturer =
                      editingImplantManufacturer.trim();
                  }
                  if (editingImplantSystem.trim()) {
                    payload.implantSystem = editingImplantSystem.trim();
                  }
                  if (editingImplantType.trim()) {
                    payload.implantType = editingImplantType.trim();
                  }

                  const res = await fetch(
                    `/api/requests/${editingRequest.id}`,
                    {
                      method: "PUT",
                      headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                        "x-mock-role": "requestor",
                      },
                      body: JSON.stringify(payload),
                    }
                  );

                  if (!res.ok) {
                    console.error("의뢰 수정 실패", await res.text());
                  } else {
                    await queryClient.invalidateQueries({
                      queryKey: ["requestor-dashboard-summary-page"],
                    });
                    await queryClient.invalidateQueries({
                      queryKey: ["requestor-my-requests"],
                    });
                  }
                } catch (e) {
                  console.error("의뢰 수정 중 오류", e);
                } finally {
                  setEditingRequest(null);
                }
              }}
            >
              저장
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 묶음 배송 신청 모달 */}
      <Dialog open={isBulkModalOpen} onOpenChange={setIsBulkModalOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle>묶음 배송 신청</DialogTitle>
          </DialogHeader>
          <div className="mt-2 space-y-4 text-md overflow-y-auto max-h-[70vh] pr-1">
            <div className="grid grid-cols-1 md:[grid-template-columns:1fr_1fr_auto_1fr] gap-6 items-stretch">
              {/* 가공전 리스트 */}
              <div className="border rounded-lg p-3 bg-muted/40 flex flex-col gap-2 h-[320px]">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-md font-semibold">가공전</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => {
                      const next: Record<string, boolean> = {
                        ...selectedBulkIds,
                      };
                      (bulkData?.pre ?? []).forEach(
                        (item: BulkShippingItem) => {
                          next[item.id] = true;
                        }
                      );
                      setSelectedBulkIds(next);
                    }}
                  >
                    전체선택
                  </Button>
                </div>
                <div className="flex-1 overflow-y-auto pr-1">
                  <BulkShippingList
                    kind="pre"
                    items={bulkData?.pre ?? []}
                    selected={selectedBulkIds}
                    setSelected={setSelectedBulkIds}
                  />
                </div>
              </div>

              {/* 가공후 리스트 */}
              <div className="border rounded-lg p-3 bg-background flex flex-col gap-2 h-[320px]">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-md font-semibold">가공후</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-[11px]"
                    onClick={() => {
                      const next: Record<string, boolean> = {
                        ...selectedBulkIds,
                      };
                      (bulkData?.post ?? []).forEach(
                        (item: BulkShippingItem) => {
                          next[item.id] = true;
                        }
                      );
                      setSelectedBulkIds(next);
                    }}
                  >
                    전체선택
                  </Button>
                </div>
                <div className="flex-1 overflow-y-auto pr-1">
                  <BulkShippingList
                    kind="post"
                    items={bulkData?.post ?? []}
                    selected={selectedBulkIds}
                    setSelected={setSelectedBulkIds}
                  />
                </div>
              </div>

              {/* 가공후 / 배송대기 사이 수직 구분선 (데스크톱 전용) */}
              <div className="hidden md:flex justify-center">
                <div className="w-px h-full bg-slate-300" />
              </div>

              {/* 배송대기 스테이징 리스트 */}
              <div className="border rounded-lg p-3 bg-slate-50 flex flex-col gap-2 h-[320px] shadow-inner">
                <h3 className="text-md font-semibold mb-1">배송대기</h3>
                <div className="flex-1 overflow-y-auto pr-1">
                  <BulkShippingStagingList
                    allItems={
                      bulkData
                        ? [
                            ...(bulkData.pre ?? []).map(
                              (item: BulkShippingItem) => ({
                                ...item,
                                stage: "pre" as const,
                              })
                            ),
                            ...(bulkData.post ?? []).map(
                              (item: BulkShippingItem) => ({
                                ...item,
                                stage: "post" as const,
                              })
                            ),
                            ...(bulkData.waiting ?? []),
                          ]
                        : []
                    }
                    selected={selectedBulkIds}
                    setSelected={setSelectedBulkIds}
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="text-muted-foreground leading-relaxed text-xs md:text-md">
                직경이 큰 케이스(예: 10mm 이상)는 가공 주기가 길 수 있으므로,
                가공이 끝난 건 위주로 묶는 것을 권장드립니다.
              </div>

              <div className="flex justify-end gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSelectedBulkIds({});
                    setIsBulkModalOpen(false);
                  }}
                >
                  취소
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  disabled={isBulkLoading}
                  onClick={async () => {
                    const selectedIds = Object.keys(selectedBulkIds).filter(
                      (id) => selectedBulkIds[id]
                    );
                    if (!selectedIds.length) {
                      setIsBulkModalOpen(false);
                      return;
                    }

                    try {
                      const res = await fetch(
                        `/api/requests/my/bulk-shipping`,
                        {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({ requestIds: selectedIds }),
                        }
                      );

                      if (!res.ok) {
                        throw new Error("묶음 배송 신청에 실패했습니다.");
                      }

                      await res.json();
                      await queryClient.invalidateQueries({
                        queryKey: ["requestor-bulk-shipping"],
                      });
                    } catch (e) {
                      console.error(e);
                    } finally {
                      setIsBulkModalOpen(false);
                    }
                  }}
                >
                  배송 신청
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

type BulkStage = "pre" | "post";

type BulkShippingItem = {
  id: string;
  title: string;
  clinic: string;
  patient: string;
  tooth: string;
  diameter: string;
  stage?: BulkStage;
};

const BulkShippingList = ({
  kind,
  items,
  selected,
  setSelected,
}: {
  kind: BulkStage;
  items: BulkShippingItem[];
  selected: Record<string, boolean>;
  setSelected: (next: Record<string, boolean>) => void;
}) => {
  // 아직 배송대기 스테이징으로 옮기지 않은 아이템만 표시
  const visible = items.filter((item) => !selected[item.id]);

  if (!visible.length) {
    return (
      <p className="text-[12px] text-muted-foreground">
        표시할 의뢰가 없습니다.
      </p>
    );
  }

  return (
    <div className="space-y-2 text-xs">
      {visible.map((item) => (
        <button
          key={item.id}
          type="button"
          className={`w-full text-left flex items-start gap-2 rounded-md border px-3 py-2 cursor-pointer transition-colors ${
            kind === "pre"
              ? "border-sky-300 bg-sky-50 hover:border-sky-400 hover:bg-sky-100"
              : "border-emerald-300 bg-emerald-50 hover:border-emerald-400 hover:bg-emerald-100"
          }`}
          onClick={() => {
            const next = { ...selected };
            next[item.id] = true;
            setSelected(next);
          }}
        >
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-medium truncate">{item.title}</div>
            <div className="text-[10px] text-muted-foreground flex flex-col gap-0.5 mt-1">
              <span>{item.clinic}</span>
              <span>
                환자 {item.patient} • 치아번호 {item.tooth} • 최대직경{" "}
                {item.diameter}
              </span>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
};

const BulkShippingStagingList = ({
  allItems,
  selected,
  setSelected,
}: {
  allItems: BulkShippingItem[];
  selected: Record<string, boolean>;
  setSelected: (next: Record<string, boolean>) => void;
}) => {
  const selectedItems = allItems.filter((item) => selected[item.id]);

  if (!selectedItems.length) {
    return (
      <p className="text-[12px] text-muted-foreground">
        왼쪽 목록에서 클릭하여 추가하세요.
      </p>
    );
  }

  return (
    <div className="space-y-2 text-xs">
      {selectedItems.map((item) => {
        const isSelected = !!selected[item.id];
        const stageColor =
          item.stage === "pre"
            ? "border-sky-300 bg-sky-50 hover:border-sky-400 hover:bg-sky-100"
            : item.stage === "post"
            ? "border-emerald-300 bg-emerald-50 hover:border-emerald-400 hover:bg-emerald-100"
            : "border-border bg-background hover:border-blue-300 hover:bg-blue-50/60";

        return (
          <button
            key={item.id}
            type="button"
            className={`w-full text-left flex items-start gap-2 rounded-md border px-3 py-2 cursor-pointer transition-colors ${
              isSelected
                ? stageColor
                : "border-border bg-background hover:border-blue-300 hover:bg-blue-50/60"
            }`}
            onClick={() => {
              const next = { ...selected };
              if (isSelected) {
                delete next[item.id];
              } else {
                next[item.id] = true;
              }
              setSelected(next);
            }}
          >
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-medium truncate">
                {item.title}
              </div>
              <div className="text-[10px] text-muted-foreground flex flex-col gap-0.5 mt-1">
                <span>{item.clinic}</span>
                <span>
                  환자 {item.patient} • 치아번호 {item.tooth} • 최대직경{" "}
                  {item.diameter}
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
};

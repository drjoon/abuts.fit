import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useInView } from "react-intersection-observer";
import { useOutletContext } from "react-router-dom";
import { apiFetch } from "@/lib/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/hooks/use-toast";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import { DashboardShellSkeleton } from "@/shared/ui/dashboard/DashboardShellSkeleton";
import { Clock, CheckCircle, TrendingUp, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  RequestorEditRequestDialog,
  type EditingRequestState,
} from "./components/RequestorEditRequestDialog";
import { RequestorDashboardStatsCards } from "./components/RequestorDashboardStatsCards";
import { RequestorPricingReferralPolicyCard } from "./components/RequestorPricingReferralPolicyCard";
import { RequestorRiskSummaryCard } from "@/shared/ui/dashboard/RequestorRiskSummaryCard";
import { RequestorBulkShippingBannerCard } from "./components/RequestorBulkShippingBannerCard";
import { RequestorRecentRequestsCard } from "./components/RequestorRecentRequestsCard";
import type { RequestorDashboardStat } from "./components/RequestorDashboardStatsCards";
import { PeriodFilter } from "@/shared/ui/PeriodFilter";
import {
  WorksheetDiameterCard,
  type DiameterStats,
} from "@/shared/ui/dashboard/WorksheetDiameterCard";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CreditLedgerModal } from "./components/CreditLedgerModal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type DashboardOutletContext = {
  creditBalance: number | null;
  loadingCreditBalance: boolean;
};

export const RequestorDashboardPage = () => {
  const { user, token } = useAuthStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { creditBalance, loadingCreditBalance } =
    useOutletContext<DashboardOutletContext>();

  const [period, setPeriod] = useState<
    "7d" | "30d" | "lastMonth" | "thisMonth" | "90d" | "all"
  >("30d");
  const [creditLedgerOpen, setCreditLedgerOpen] = useState(false);
  const [editingRequest, setEditingRequest] =
    useState<EditingRequestState>(null);
  const [editingDescription, setEditingDescription] = useState("");
  const [editingClinicName, setEditingClinicName] = useState("");
  const [editingPatientName, setEditingPatientName] = useState("");
  const [editingTeethText, setEditingTeethText] = useState("");
  const [editingImplantManufacturer, setEditingImplantManufacturer] =
    useState("");
  const [editingImplantSystem, setEditingImplantSystem] = useState("");
  const [editingImplantType, setEditingImplantType] = useState("");

  const [statsModalOpen, setStatsModalOpen] = useState(false);
  const [statsModalLabel, setStatsModalLabel] = useState<string>("");

  const normalizeStage = (r: any) => {
    // stage 분류는 manufacturerStage가 authoritative (status 기반 로직은 레거시)
    const stage = String(r?.manufacturerStage || "");
    const status = String(r?.status || "");
    const status2 = String(r?.status2 || "");

    // 취소/완료는 일부 레거시 데이터에 남아있을 수 있어 최소한으로만 유지
    if (status === "취소") return "cancel";
    if (status2 === "완료") return "completed";

    if (["shipping", "tracking", "발송", "추적관리"].includes(stage)) {
      return "shipping";
    }
    if (["machining", "packaging", "production", "생산"].includes(stage)) {
      return "production";
    }
    if (["cam", "CAM", "가공전"].includes(stage)) {
      return "cam";
    }
    if (["request", "receive", "의뢰", "의뢰접수"].includes(stage)) {
      return "request";
    }
    return "request";
  };

  const stageGroupByLabel: Record<string, string[] | null> = {
    // 4단계 공통 공정: 의뢰 → CAM → 생산 → 발송
    의뢰: ["request"],
    CAM: ["cam"],
    생산: ["production"],
    발송: ["shipping"],
    "완료/취소": ["completed", "cancel"],
  };

  const filterAbutmentRequest = (r: any) => {
    if (!r) return false;
    const ci = r.caseInfos || {};
    const implantSystem = String(ci.implantSystem || "").trim();
    return Boolean(implantSystem);
  };

  const getModalItems = (all: any[], label: string) => {
    const group = stageGroupByLabel[label];
    const base = (all || []).filter(filterAbutmentRequest);
    if (!group) return base;
    return base.filter((r) => group.includes(normalizeStage(r)));
  };

  const stageLabel = (r: any) => {
    const s = normalizeStage(r);
    if (s === "request") return "의뢰";
    if (s === "cam") return "CAM";
    if (s === "production") return "생산";
    if (s === "shipping") return "발송";
    if (s === "completed") return "완료";
    if (s === "cancel") return "취소";
    return "의뢰";
  };

  const {
    data: infiniteData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: loadingMyRequestsForModal,
  } = useInfiniteQuery({
    queryKey: ["requestor-dashboard-stats-modal-infinite", statsModalLabel],
    queryFn: async ({ pageParam = 1 }) => {
      const res = await apiFetch<any>({
        path: `/api/requests/my?page=${pageParam}&limit=20&sortBy=createdAt&sortOrder=desc`,
        method: "GET",
        token,
        headers: token
          ? {
              "x-mock-role": "requestor",
            }
          : undefined,
      });
      if (!res.ok) throw new Error("의뢰 목록 조회에 실패했습니다.");
      const body = res.data;
      const data = body?.data || body;
      return {
        requests: Array.isArray(data?.requests) ? data.requests : [],
        nextPage:
          data?.pagination?.page < data?.pagination?.pages
            ? data.pagination.page + 1
            : undefined,
      };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled: statsModalOpen && !!token,
    retry: false,
  });

  const { ref: loadMoreRef, inView } = useInView();

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      void fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const modalItems = useMemo(() => {
    const all = infiniteData?.pages.flatMap((page) => page.requests) || [];
    return getModalItems(all, statsModalLabel);
  }, [infiniteData, statsModalLabel]);

  const [insufficientCredit, setInsufficientCredit] = useState(false);

  const {
    data: summaryResponse,
    refetch: refetchSummary,
    isFetching,
    isLoading,
  } = useQuery({
    queryKey: ["requestor-dashboard-summary-page", period],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (period) {
        params.set("period", period);
      }
      const res = await apiFetch<any>({
        path: `/api/requests/my/dashboard-summary?${params.toString()}`,
        method: "GET",
        token,
        headers: token
          ? {
              "x-mock-role": "requestor",
            }
          : undefined,
      });
      if (!res.ok) {
        throw new Error("대시보드 요약 조회에 실패했습니다.");
      }
      return res.data;
    },
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    enabled: !!token,
  });

  // [추가] CAM 승인 대기 중인 건이 있는데 크레딧이 부족한지 확인
  useEffect(() => {
    if (summaryResponse?.success && creditBalance !== null) {
      const stats = summaryResponse.data.stats ?? {};
      const inCam = stats.inCam || 0;

      // CAM 단계에 있는 건이 하나라도 있고, 잔액이 0 이하거나 매우 낮은 경우 하이라이트
      // (정확한 금액 비교는 각 의뢰의 가격을 합산해야 하지만, 여기선 "CAM 단계 존재 & 부족 알림" 수준으로 처리)
      // 사용자 요청: "크레딧이 부족해서 CAM 승인건인데 생산을 시작하지 못하는 경우"
      // 백엔드에서 402 에러를 받은 이력이 있거나, 현재 잔액이 부족한 상태를 UI에서 표현
      if (inCam > 0 && creditBalance < 10000) {
        setInsufficientCredit(true);
      } else {
        setInsufficientCredit(false);
      }
    }
  }, [summaryResponse, creditBalance]);

  const {
    data: bulkResponse,
    isLoading: isBulkLoading,
    isFetching: isBulkFetching,
    refetch: refetchBulk,
  } = useQuery({
    queryKey: ["requestor-bulk-shipping"],
    queryFn: async () => {
      const res = await apiFetch<any>({
        path: "/api/requests/my/bulk-shipping",
        method: "GET",
        token,
        headers: token
          ? {
              "x-mock-role": "requestor",
            }
          : undefined,
      });
      if (!res.ok) {
        throw new Error("묶음 배송 후보 조회에 실패했습니다.");
      }
      return res.data;
    },
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    enabled: !!token,
  });

  const refreshDashboard = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ["requestor-dashboard-summary-page"],
    });
    void queryClient.invalidateQueries({
      queryKey: ["requestor-my-requests"],
    });
    void refetchSummary();
    void refetchBulk();
  }, [queryClient, refetchBulk, refetchSummary]);

  const bulkData = bulkResponse?.success ? bulkResponse.data : null;

  const isInitialLoading =
    isLoading || isBulkLoading || loadingCreditBalance || !summaryResponse;

  if (isInitialLoading) {
    return <DashboardShellSkeleton showMain />;
  }

  const openEditDialogFromRequest = (request: any) => {
    const mongoId = request._id || request.id;
    const displayId = request.requestId || request.id || mongoId;

    if (!mongoId) return;

    const ci = request.caseInfos || {};

    // riskSummary 등에서 넘어온 raw data가 recentRequests 형식과 다를 수 있어 보강
    setEditingRequest({
      id: mongoId,
      requestId: request.requestId || displayId,
      createdAt: request.createdAt || request.date || "",
      estimatedCompletion:
        request.timeline?.estimatedCompletion ||
        request.estimatedCompletion ||
        request.dueDate ||
        "",
      title: request.title || displayId,
      description: request.description || "",
      clinicName:
        ci.clinicName ||
        request.clinicName ||
        request.requestor?.organization ||
        "",
      patientName: ci.patientName || request.patientName || "",
      teethText: ci.tooth || request.toothNumber || request.tooth || "",
      implantManufacturer:
        ci.implantManufacturer || request.implantManufacturer || "",
      implantSystem: ci.implantSystem || request.implantSystem || "",
      implantType: ci.implantType || request.implantType || "",
    });

    setEditingDescription(request.description || "");
    setEditingClinicName(
      ci.clinicName ||
        request.clinicName ||
        request.requestor?.organization ||
        ""
    );
    setEditingPatientName(ci.patientName || request.patientName || "");
    setEditingTeethText(ci.tooth || request.toothNumber || request.tooth || "");
    setEditingImplantManufacturer(
      ci.implantManufacturer || request.implantManufacturer || ""
    );
    setEditingImplantSystem(ci.implantSystem || request.implantSystem || "");
    setEditingImplantType(ci.implantType || request.implantType || "");
  };

  const cancelRequest = async (requestId: string) => {
    if (!token) {
      toast({
        title: "로그인이 필요합니다",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    try {
      const res = await apiFetch<any>({
        path: `/api/requests/${requestId}/status`,
        method: "PATCH",
        token,
        headers: {
          "Content-Type": "application/json",
          "x-mock-role": "requestor",
        },
        jsonBody: { status: "취소" },
      });

      if (!res.ok) {
        const serverMsg = res.data?.message;
        console.error("의뢰 취소 실패", await res.raw.text().catch(() => ""));
        toast({
          title: "의뢰 취소 실패",
          description: serverMsg || "의뢰 단계에서만 취소할 수 있습니다.",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      toast({
        title: "의뢰가 취소되었습니다",
        duration: 2000,
      });

      try {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("abuts:credits:updated"));
        }
      } catch {}

      // UI는 즉시 해제하고, 데이터 갱신은 백그라운드에서 처리
      refreshDashboard();
    } catch (error) {
      console.error("의뢰 취소 중 오류", error);
      toast({
        title: "의뢰 취소 중 오류",
        description: "다시 시도해주세요.",
        variant: "destructive",
        duration: 3000,
      });
    }
  };

  const showSkeleton = (isLoading || isFetching) && !summaryResponse;

  const stats: RequestorDashboardStat[] = (() => {
    if (!summaryResponse?.success) {
      return [
        { label: "의뢰", value: "0", icon: FileText },
        { label: "CAM", value: "0", icon: Clock },
        { label: "생산", value: "0", icon: Clock },
        { label: "발송", value: "0", icon: TrendingUp },
        { label: "완료/취소", value: "0", icon: CheckCircle },
      ];
    }

    const s = summaryResponse.data.stats ?? {};
    return [
      {
        label: "의뢰",
        value: String(s.totalRequests ?? 0),
        change: s.totalRequestsChange ?? "+0%",
        icon: FileText,
      },
      {
        label: "CAM",
        value: String(s.inCam ?? 0),
        change: s.inCamChange ?? "+0%",
        icon: Clock,
      },
      {
        label: "생산",
        value: String(s.inProduction ?? 0),
        change: s.inProductionChange ?? "+0%",
        icon: Clock,
      },
      {
        label: "발송",
        value: String(s.inShipping ?? 0),
        change: s.inShippingChange ?? "+0%",
        icon: TrendingUp,
      },
      {
        label: "완료/취소",
        value: String(s.doneOrCanceled ?? 0),
        change: s.doneOrCanceledChange ?? "+0%",
        icon: CheckCircle,
      },
    ];
  })();

  const riskSummary = summaryResponse?.success
    ? summaryResponse.data.riskSummary ?? null
    : null;

  const recentRequests = summaryResponse?.success
    ? (summaryResponse.data.recentRequests ?? []).filter(
        (r: any) => r?.status !== "취소"
      )
    : [];

  const diameterStatsFromApi: DiameterStats | undefined = (() => {
    if (!summaryResponse?.success) return undefined;
    const apiStats = summaryResponse.data.diameterStats;

    // 백엔드 응답이 배열 형식인 경우 변환
    if (Array.isArray(apiStats)) {
      const buckets = apiStats.map((stat: any, index: number) => ({
        diameter: stat.range?.includes("≤")
          ? 6
          : stat.range?.includes("6-8")
          ? 8
          : stat.range?.includes("8-10")
          ? 10
          : 10,
        shipLabel: stat.leadDays ? `${stat.leadDays}일` : "-",
        ratio: 0, // 계산 필요
        count: stat.count || 0,
      }));

      const total = buckets.reduce((sum, b) => sum + b.count, 0);
      const maxCount = Math.max(...buckets.map((b) => b.count), 1);

      buckets.forEach((b) => {
        b.ratio = b.count / maxCount;
      });

      return { buckets, total };
    }

    return apiStats;
  })();

  const canOpenCreditLedger = user.role === "requestor";

  if (showSkeleton) {
    return <DashboardShellSkeleton />;
  }

  return (
    <div>
      <DashboardShell
        title={`안녕하세요, ${user.name}님!`}
        subtitle="의뢰 현황을 확인하세요."
        headerRight={
          <div className="flex flex-wrap items-center gap-2">
            <PeriodFilter value={period} onChange={setPeriod} />
            {canOpenCreditLedger && (
              <TooltipProvider>
                <Tooltip open={insufficientCredit}>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant={insufficientCredit ? "destructive" : "outline"}
                      size="sm"
                      className={`h-8 transition-all ${
                        insufficientCredit
                          ? "ring-2 ring-destructive ring-offset-2 animate-pulse"
                          : ""
                      }`}
                      onClick={() => setCreditLedgerOpen(true)}
                    >
                      {loadingCreditBalance
                        ? "보유 크레딧: ..."
                        : `보유 크레딧: ${Number(
                            creditBalance || 0
                          ).toLocaleString()}원`}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    className="bg-destructive text-destructive-foreground"
                  >
                    <p>크레딧을 추가 충전하시면 생산이 진행됩니다</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        }
        stats={
          <RequestorDashboardStatsCards
            stats={stats}
            onCardClick={(stat) => {
              setStatsModalLabel(stat.label);
              setStatsModalOpen(true);
            }}
          />
        }
        topSection={
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
              <div className="flex flex-col gap-6">
                <RequestorPricingReferralPolicyCard />
                <RequestorRiskSummaryCard
                  riskSummary={riskSummary}
                  onItemClick={(requestId) => {
                    const found = recentRequests.find(
                      (r) => r.requestId === requestId
                    );
                    if (found) {
                      openEditDialogFromRequest(found);
                    } else {
                      const foundInRisk = riskSummary?.items?.find(
                        (it) => it.id === requestId
                      );
                      if (foundInRisk) {
                        openEditDialogFromRequest({
                          ...foundInRisk,
                          _id: foundInRisk.id,
                        });
                      }
                    }
                  }}
                />
              </div>

              <div className="flex flex-col gap-6">
                <RequestorBulkShippingBannerCard
                  bulkData={bulkData}
                  onRefresh={() => {
                    refetchBulk();
                  }}
                  onOpenBulkModal={() => {}}
                />

                <RequestorRecentRequestsCard
                  items={recentRequests}
                  onRefresh={() => {
                    refetchSummary();
                    refetchBulk();
                  }}
                  onEdit={openEditDialogFromRequest}
                  onCancel={cancelRequest}
                />
              </div>

              <div>
                <WorksheetDiameterCard stats={diameterStatsFromApi} />
              </div>
            </div>
          </div>
        }
      />

      <RequestorEditRequestDialog
        editingRequest={editingRequest}
        editingDescription={editingDescription}
        editingClinicName={editingClinicName}
        editingPatientName={editingPatientName}
        editingTeethText={editingTeethText}
        editingImplantManufacturer={editingImplantManufacturer}
        editingImplantSystem={editingImplantSystem}
        editingImplantType={editingImplantType}
        onChangeDescription={setEditingDescription}
        onChangeClinicName={setEditingClinicName}
        onChangePatientName={setEditingPatientName}
        onChangeTeethText={setEditingTeethText}
        onChangeImplantManufacturer={setEditingImplantManufacturer}
        onChangeImplantSystem={setEditingImplantSystem}
        onChangeImplantType={setEditingImplantType}
        onClose={() => setEditingRequest(null)}
        onSave={async () => {
          if (!editingRequest || !token) {
            setEditingRequest(null);
            return;
          }

          try {
            const payload: any = {
              description: editingDescription,
              caseInfos: {},
            };

            if (editingClinicName.trim()) {
              payload.caseInfos.clinicName = editingClinicName.trim();
            }
            if (editingPatientName.trim()) {
              payload.caseInfos.patientName = editingPatientName.trim();
            }
            if (editingTeethText.trim()) {
              payload.caseInfos.tooth = editingTeethText.trim();
            }

            if (editingImplantManufacturer.trim()) {
              payload.caseInfos.implantManufacturer =
                editingImplantManufacturer.trim();
            }
            if (editingImplantSystem.trim()) {
              payload.caseInfos.implantSystem = editingImplantSystem.trim();
            }
            if (editingImplantType.trim()) {
              payload.caseInfos.implantType = editingImplantType.trim();
            }

            if (Object.keys(payload.caseInfos).length === 0) {
              delete payload.caseInfos;
            }

            const res = await apiFetch<any>({
              path: `/api/requests/${editingRequest.id}`,
              method: "PUT",
              token,
              headers: {
                "Content-Type": "application/json",
                "x-mock-role": "requestor",
              },
              jsonBody: payload,
            });

            if (!res.ok) {
              console.error(
                "의뢰 수정 실패",
                await res.raw.text().catch(() => "")
              );
            } else {
              await refreshDashboard();
            }
          } catch (e) {
            console.error("의뢰 수정 중 오류", e);
          } finally {
            setEditingRequest(null);
          }
        }}
      />

      <CreditLedgerModal
        open={creditLedgerOpen}
        onOpenChange={setCreditLedgerOpen}
      />

      <Dialog open={statsModalOpen} onOpenChange={setStatsModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{statsModalLabel} 세부 내역</DialogTitle>
          </DialogHeader>

          {loadingMyRequestsForModal ? (
            <div className="text-sm text-muted-foreground">불러오는 중...</div>
          ) : modalItems.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              표시할 내역이 없습니다.
            </div>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-auto pr-1">
              {modalItems.map((r: any) => {
                const ci = r?.caseInfos || {};
                const title =
                  String(r?.title || "").trim() ||
                  [ci?.patientName, ci?.tooth].filter(Boolean).join(" ") ||
                  String(r?.requestId || "");
                return (
                  <button
                    key={String(r?._id || r?.id || Math.random())}
                    type="button"
                    className="w-full text-left rounded-md border border-gray-200 bg-white px-3 py-2 hover:bg-gray-50"
                    onClick={() => {
                      setStatsModalOpen(false);
                      openEditDialogFromRequest(r);
                    }}
                  >
                    <div className="text-sm font-semibold text-gray-900 truncate">
                      {title}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      상태: {stageLabel(r)} / 의뢰번호:{" "}
                      {String(r?.requestId || "")}
                    </div>
                  </button>
                );
              })}
              <div ref={loadMoreRef} className="h-4">
                {isFetchingNextPage && (
                  <div className="text-center text-xs text-muted-foreground py-2">
                    불러오는 중...
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch } from "@/lib/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/hooks/use-toast";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import { Clock, CheckCircle, TrendingUp, FileText } from "lucide-react";
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

export const RequestorDashboardPage = () => {
  const { user, token } = useAuthStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [period, setPeriod] = useState<"7d" | "30d" | "90d" | "all">("30d");
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
  });

  const {
    data: bulkResponse,
    isLoading: isBulkLoading,
    isFetching: isBulkFetching,
    refetch: refetchBulk,
  } = useQuery({
    queryKey: ["requestor-bulk-shipping"],
    queryFn: async () => {
      const res = await apiFetch<any>({
        path: `/api/requests/my/bulk-shipping`,
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
  });

  const bulkData = bulkResponse?.success ? bulkResponse.data : null;

  const openEditDialogFromRequest = (request: any) => {
    const mongoId = request._id || request.id;
    const displayId = request.requestId || request.id || mongoId;

    if (!mongoId) return;

    const ci = request.caseInfos || {};

    setEditingRequest({
      id: mongoId,
      title: request.title || displayId,
      description: request.description,
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
          description:
            serverMsg || "의뢰접수/가공전 상태에서만 취소할 수 있습니다.",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      toast({
        title: "의뢰가 취소되었습니다",
        duration: 2000,
      });

      await queryClient.invalidateQueries({
        queryKey: ["requestor-dashboard-summary-page"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["requestor-my-requests"],
      });

      // 화면 반영 보장
      await refetchSummary();
      await refetchBulk();
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

  const stats: RequestorDashboardStat[] = (() => {
    if (!summaryResponse?.success) {
      return [
        { label: "의뢰접수", value: "0", icon: FileText },
        { label: "생산중", value: "0", icon: Clock },
        { label: "배송중", value: "0", icon: TrendingUp },
        { label: "완료", value: "0", icon: CheckCircle },
      ];
    }

    const s = summaryResponse.data.stats ?? {};
    return [
      {
        label: "의뢰접수",
        value: String(s.totalRequests ?? 0),
        change: s.totalRequestsChange ?? "+0%",
        icon: FileText,
      },
      {
        label: "생산중",
        value: String(s.inProduction ?? 0),
        change: s.inProductionChange ?? "+0%",
        icon: Clock,
      },
      {
        label: "배송중",
        value: String(s.inShipping ?? 0),
        change: s.inShippingChange ?? "+0%",
        icon: TrendingUp,
      },
      {
        label: "완료",
        value: String(s.completed ?? 0),
        change: s.completedChange ?? "+0%",
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

  const diameterStatsFromApi: DiameterStats | undefined =
    summaryResponse?.success ? summaryResponse.data.diameterStats : undefined;

  return (
    <div>
      <DashboardShell
        title={`안녕하세요, ${user.name}님!`}
        subtitle="의뢰 현황을 확인하세요."
        headerRight={<PeriodFilter value={period} onChange={setPeriod} />}
        stats={<RequestorDashboardStatsCards stats={stats} />}
        topSection={
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
              <div className="flex flex-col gap-6 h-full">
                <RequestorPricingReferralPolicyCard />
                <RequestorRiskSummaryCard riskSummary={riskSummary} />
              </div>

              <div className="flex flex-col gap-6 h-full">
                <RequestorBulkShippingBannerCard
                  bulkData={bulkData}
                  onRefresh={() => {
                    refetchBulk();
                  }}
                  onOpenBulkModal={() => {
                    // RequestorBulkShippingBannerCard 내부에서 모달을 직접 관리합니다.
                  }}
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
      />
    </div>
  );
};

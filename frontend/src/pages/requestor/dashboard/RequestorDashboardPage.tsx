import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { WorksheetDiameterCardForDashboard } from "@/pages/requestor/WorkSheet";
import type { DiameterStats } from "@/shared/ui/dashboard/WorksheetDiameterCard";
import { DashboardShell } from "@/shared/ui/dashboard/DashboardShell";
import {
  Clock,
  CheckCircle,
  TrendingUp,
  FileText,
} from "lucide-react";
import { RequestorRecentRequestsDialog } from "@/features/requestor/components/dashboard/RequestorRecentRequestsDialog";
import {
  RequestorEditRequestDialog,
  type EditingRequestState,
} from "@/features/requestor/components/dashboard/RequestorEditRequestDialog";
import { RequestorBulkShippingDialog } from "@/features/requestor/components/dashboard/RequestorBulkShippingDialog";
import { RequestorDashboardStatsCards } from "@/features/requestor/components/dashboard/RequestorDashboardStatsCards";
import { RequestorBulkShippingBannerCard } from "@/features/requestor/components/dashboard/RequestorBulkShippingBannerCard";
import { RequestorRecentRequestsCard } from "@/features/requestor/components/dashboard/RequestorRecentRequestsCard";
import { RequestorRiskSummaryCard } from "@/features/requestor/components/dashboard/RequestorRiskSummaryCard";
import type { RequestorDashboardStat } from "@/features/requestor/components/dashboard/RequestorDashboardStatsCards";

export const RequestorDashboardPage = () => {
  const { user, token } = useAuthStore();
  const queryClient = useQueryClient();

  const [period, setPeriod] = useState<"7d" | "30d" | "90d" | "all">("30d");
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [selectedBulkIds, setSelectedBulkIds] = useState<
    Record<string, boolean>
  >({});
  const [isRecentModalOpen, setIsRecentModalOpen] = useState(false);
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

  const openEditDialogFromRequest = (request: any) => {
    const mongoId = request._id || request.id;
    const displayId = request.requestId || request.id || mongoId;

    if (!mongoId) return;

    setEditingRequest({
      id: mongoId,
      title: request.title || displayId,
      description: request.description,
      clinicName: request.clinicName || request.requestor?.organization || "",
      patientName: request.patientName || "",
      teethText: request.toothNumber || request.tooth || "",
      implantManufacturer: request.implantManufacturer ?? "",
      implantSystem:
        request.implantSystem ?? request.specifications?.implantSystem ?? "",
      implantType:
        request.implantType ?? request.specifications?.implantType ?? "",
    });

    setEditingDescription(request.description || "");
    setEditingClinicName(
      request.clinicName || request.requestor?.organization || ""
    );
    setEditingPatientName(request.patientName || "");
    setEditingTeethText(request.toothNumber || request.tooth || "");
    setEditingImplantManufacturer(request.implantManufacturer || "");
    setEditingImplantSystem(
      request.implantSystem || request.specifications?.implantSystem || ""
    );
    setEditingImplantType(
      request.implantType || request.specifications?.implantType || ""
    );
  };

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
    ? summaryResponse.data.recentRequests ?? []
    : [];

  let diameterStatsFromApi: DiameterStats | undefined;
  if (summaryResponse?.success && summaryResponse.data.diameterStats) {
    diameterStatsFromApi = summaryResponse.data.diameterStats as DiameterStats;
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
        stats={<RequestorDashboardStatsCards stats={stats} />}
        topSection={
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
              <div>
                <WorksheetDiameterCardForDashboard
                  stats={diameterStatsFromApi}
                />
              </div>

              <div className="flex flex-col gap-6 h-full">
                <RequestorBulkShippingBannerCard
                  onOpenBulkModal={() => setIsBulkModalOpen(true)}
                />

                <RequestorRecentRequestsCard
                  items={recentRequests}
                  onRefresh={() => {
                    refetchSummary();
                    refetchBulk();
                  }}
                  onOpenRecentModal={() => setIsRecentModalOpen(true)}
                  onEdit={openEditDialogFromRequest}
                  onCancel={cancelRequest}
                />
              </div>

              <RequestorRiskSummaryCard riskSummary={riskSummary} />
            </div>
          </div>
        }
      />

      <RequestorRecentRequestsDialog
        open={isRecentModalOpen}
        onOpenChange={setIsRecentModalOpen}
        isLoading={isMyRequestsLoading}
        requests={myRequests}
        onSelectForEdit={openEditDialogFromRequest}
        onCancelRequest={cancelRequest}
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
              payload.implantManufacturer = editingImplantManufacturer.trim();
            }
            if (editingImplantSystem.trim()) {
              payload.implantSystem = editingImplantSystem.trim();
            }
            if (editingImplantType.trim()) {
              payload.implantType = editingImplantType.trim();
            }

            const res = await fetch(`/api/requests/${editingRequest.id}`, {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
                "x-mock-role": "requestor",
              },
              body: JSON.stringify(payload),
            });

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
      />

      <RequestorBulkShippingDialog
        open={isBulkModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsBulkModalOpen(false);
          } else {
            setIsBulkModalOpen(true);
          }
        }}
        bulkData={bulkData}
        selected={selectedBulkIds}
        setSelected={setSelectedBulkIds}
        isSubmitting={isBulkLoading}
        onSubmit={async (selectedIds) => {
          if (!selectedIds.length) {
            setIsBulkModalOpen(false);
            return;
          }

          try {
            const res = await fetch(`/api/requests/my/bulk-shipping`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ requestIds: selectedIds }),
            });

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
      />
    </div>
  );
};

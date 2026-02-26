import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FunctionalItemCard } from "@/shared/ui/components/FunctionalItemCard";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import { apiFetch } from "@/shared/api/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { Button } from "@/components/ui/button";
import { useToast } from "@/shared/hooks/use-toast";
import { useNewRequestImplant } from "@/pages/requestor/new_request/hooks/useNewRequestImplant";
import { usePresetStorage } from "@/pages/requestor/new_request/hooks/usePresetStorage";
import { RequestDetailDialog } from "@/features/requests/components/RequestDetailDialog";

const EDITABLE_STATUSES = new Set(["의뢰", "CAM", "의뢰접수", "가공전"]); // 의뢰, CAM 단계만 수정 가능

const getStatusBadge = (status: string, manufacturerStage?: string) => {
  if (manufacturerStage) {
    switch (manufacturerStage) {
      case "의뢰":
        return <Badge variant="outline">의뢰</Badge>;
      case "의뢰접수":
        return <Badge variant="outline">의뢰접수</Badge>;
      case "CAM":
        return <Badge variant="default">CAM</Badge>;
      case "생산":
        return <Badge variant="default">생산</Badge>;
      case "발송":
        return <Badge variant="default">발송</Badge>;
      case "추적관리":
        return <Badge variant="secondary">추적관리</Badge>;
      default:
        break;
    }
  }

  switch (status) {
    case "의뢰":
      return <Badge variant="outline">의뢰</Badge>;
    case "의뢰접수":
      return <Badge variant="outline">의뢰접수</Badge>;
    case "가공전":
      return <Badge variant="default">CAM</Badge>;
    case "가공후":
      return <Badge variant="default">생산</Badge>;
    case "배송중":
      return <Badge variant="default">발송</Badge>;
    case "완료":
      return <Badge variant="secondary">완료</Badge>;
    case "취소":
      return <Badge variant="destructive">취소</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

type Props = {
  items: any[];
  onRefresh: () => void;
  onEdit: (item: any) => void;
  onCancel: (id: string) => void;
};

export const RequestorRecentRequestsCard = ({
  items,
  onRefresh,
  onEdit,
  onCancel,
}: Props) => {
  const { token, user } = useAuthStore();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string>("");
  const [detail, setDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editCaseInfos, setEditCaseInfos] = useState<any>(null);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  const {
    connections,
    implantManufacturer,
    setImplantManufacturer,
    implantSystem,
    setImplantSystem,
    implantType,
    setImplantType,
    syncSelectedConnection,
    typeOptions,
  } = useNewRequestImplant({
    token: token || null,
    clinicName: editCaseInfos?.clinicName,
  });

  const {
    presets: clinicPresets,
    addPreset: addClinicPreset,
    clearAllPresets: clearAllClinicPresets,
  } = usePresetStorage("clinic-names");
  const {
    presets: patientPresets,
    addPreset: addPatientPreset,
    clearAllPresets: clearAllPatientPresets,
  } = usePresetStorage("patient-names");
  const {
    presets: teethPresets,
    addPreset: addTeethPreset,
    clearAllPresets: clearAllTeethPresets,
  } = usePresetStorage("teeth-numbers");

  const clinicNameOptions = useMemo(
    () => clinicPresets.map((p) => ({ id: p.id, label: p.label })),
    [clinicPresets],
  );
  const patientNameOptions = useMemo(
    () => patientPresets.map((p) => ({ id: p.id, label: p.label })),
    [patientPresets],
  );
  const teethOptions = useMemo(
    () => teethPresets.map((p) => ({ id: p.id, label: p.label })),
    [teethPresets],
  );

  const handleCancelRequest = async (requestId: string) => {
    if (!requestId) return;
    await Promise.resolve(onCancel(requestId));
  };

  const resolveCurrentCaseInfos = () => {
    const fromDetail = detail?.caseInfos;
    const fromSummary = selectedSummary?.caseInfos;
    return (fromDetail || fromSummary || {}) as any;
  };

  const canEditRequest = (status?: string | null) => {
    if (!status) return false;
    return EDITABLE_STATUSES.has(status);
  };

  const normalizeImplantCaseInfos = (ci: any) => {
    const rawManufacturer =
      typeof ci?.implantManufacturer === "string" ? ci.implantManufacturer : "";
    const rawSystem =
      typeof ci?.implantSystem === "string" ? ci.implantSystem : "";
    const rawType = typeof ci?.implantType === "string" ? ci.implantType : "";

    if (!connections || connections.length === 0) {
      return {
        manufacturer: rawManufacturer,
        system: rawSystem,
        type: rawType,
      };
    }

    const manufacturers = new Set(connections.map((c: any) => c.manufacturer));
    const systems = new Set(connections.map((c: any) => c.system));
    const types = new Set(connections.map((c: any) => c.type));

    const direct = connections.find(
      (c: any) =>
        c.manufacturer === rawManufacturer &&
        c.system === rawSystem &&
        c.type === rawType,
    );
    if (direct) {
      return {
        manufacturer: direct.manufacturer,
        system: direct.system,
        type: direct.type,
      };
    }

    // case1) rawManufacturer 자리에 시스템이 들어간 케이스 (예: Regular / Hex / Hex)
    if (!manufacturers.has(rawManufacturer) && systems.has(rawManufacturer)) {
      let candidates = connections.filter(
        (c: any) => c.system === rawManufacturer,
      );
      if (rawSystem) {
        candidates = candidates.filter((c: any) => c.type === rawSystem);
      } else if (rawType) {
        candidates = candidates.filter((c: any) => c.type === rawType);
      }

      const chosen = candidates[0];
      if (chosen) {
        return {
          manufacturer: chosen.manufacturer,
          system: chosen.system,
          type: chosen.type,
        };
      }
    }

    // case2) 제조사는 맞는데 시스템/유형이 꼬인 케이스
    if (manufacturers.has(rawManufacturer)) {
      let candidates = connections.filter(
        (c: any) => c.manufacturer === rawManufacturer,
      );
      if (rawSystem && systems.has(rawSystem)) {
        candidates = candidates.filter((c: any) => c.system === rawSystem);
      }
      if (rawType && types.has(rawType)) {
        candidates = candidates.filter((c: any) => c.type === rawType);
      }
      const chosen = candidates[0];
      if (chosen) {
        return {
          manufacturer: chosen.manufacturer,
          system: chosen.system,
          type: chosen.type,
        };
      }
    }

    return {
      manufacturer: rawManufacturer,
      system: rawSystem,
      type: rawType,
    };
  };

  const handleSaveEditFromDetail = async () => {
    try {
      if (!token) {
        toast({
          title: "로그인이 필요합니다",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }
      if (!selectedRequestId) return;

      const status = detail?.status || selectedSummary?.status;
      if (status && !canEditRequest(status)) {
        toast({
          title: "변경 불가",
          description: "의뢰 또는 CAM 단계에서만 변경할 수 있습니다.",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      setSavingEdit(true);

      const base = resolveCurrentCaseInfos();

      const cleanedEdit = { ...(editCaseInfos || {}) };

      const payload = {
        caseInfos: {
          ...base,
          ...cleanedEdit,
        },
      };

      const res = await apiFetch<any>({
        path: `/api/requests/${selectedRequestId}`,
        method: "PUT",
        token,
        jsonBody: payload,
        headers: token
          ? {
              "x-mock-role": "requestor",
            }
          : undefined,
      });

      if (!res.ok || !res.data?.success) {
        throw new Error(res.data?.message || "의뢰 변경에 실패했습니다.");
      }

      setDetail(res.data.data);
      setEditCaseInfos(res.data.data?.caseInfos || null);
      toast({
        title: "의뢰 변경 완료",
        duration: 3000,
      });

      setOpen(false);
      setSelectedRequestId("");
      setDetail(null);
      setEditCaseInfos(null);

      await Promise.resolve(onRefresh());
    } catch (err: any) {
      toast({
        title: "의뢰 변경 실패",
        description: err?.message || "다시 시도해주세요.",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCancelFromDetail = async () => {
    const fallbackId =
      selectedRequestId ||
      detail?._id ||
      detail?.id ||
      selectedSummary?._id ||
      selectedSummary?.id;

    if (!fallbackId) {
      toast({
        title: "의뢰 ID를 찾을 수 없습니다",
        variant: "destructive",
        duration: 2500,
      });
      return;
    }

    await handleCancelRequest(fallbackId as string);
    setOpen(false);
    setSelectedRequestId("");
    setDetail(null);
    setEditCaseInfos(null);
  };

  const openCancelConfirmFromDetail = () => {
    if (!selectedRequestId) return;
    setCancelConfirmOpen(true);
  };

  const selectedSummary = useMemo(() => {
    if (!selectedRequestId) return null;
    return items.find((it) => (it._id || it.id) === selectedRequestId) || null;
  }, [items, selectedRequestId]);

  useEffect(() => {
    if (!open) return;

    const ci = resolveCurrentCaseInfos();
    const normalized = normalizeImplantCaseInfos(ci);
    setEditCaseInfos({
      clinicName: ci?.clinicName || "",
      patientName: ci?.patientName || "",
      tooth: ci?.tooth || "",
      implantManufacturer: normalized.manufacturer || "",
      implantSystem: normalized.system || "",
      implantType: normalized.type || "",
      maxDiameter: ci?.maxDiameter ?? null,
      connectionDiameter: ci?.connectionDiameter ?? null,
    });
  }, [open, detail, selectedSummary, connections]);

  useEffect(() => {
    const run = async () => {
      if (!open || !selectedRequestId) return;
      setLoadingDetail(true);
      try {
        const res = await apiFetch<any>({
          path: `/api/requests/${selectedRequestId}`,
          method: "GET",
          token,
          headers: token
            ? {
                "x-mock-role": "requestor",
              }
            : undefined,
        });

        if (res.ok && res.data?.success) {
          setDetail(res.data.data);
        } else {
          setDetail(null);
        }
      } finally {
        setLoadingDetail(false);
      }
    };
    void run();
  }, [open, selectedRequestId, token]);

  useEffect(() => {
    if (!open) {
      setEditCaseInfos(null);
    }
  }, [open]);

  const isCancelableRequest = (r: any) => {
    // 백엔드 정책: "의뢰", "CAM", "의뢰접수", "가공전" 단계일 때 취소 가능
    const status = String(r?.status || "");
    const stage = String(r?.manufacturerStage || "");
    return (
      status === "의뢰" ||
      status === "의뢰접수" ||
      status === "CAM" ||
      status === "가공전" ||
      stage === "의뢰" ||
      stage === "의뢰접수" ||
      stage === "CAM" ||
      stage === "가공전"
    );
  };

  return (
    <Card
      className="app-glass-card app-glass-card--lg cursor-pointer"
      onClick={onRefresh}
    >
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base font-semibold">최근 의뢰</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-between pt-2">
        <div className="space-y-3 max-h-[550px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
          {items.map((item: any) => {
            const rawRequestId = String(item.requestId || "").trim();
            const stableKey = item._id || item.id || rawRequestId || "";
            const displayId = rawRequestId || String(item.id || item._id || "");
            const canCancel = isCancelableRequest(item);
            const priceAmount = item.price?.amount;
            const isRemakeFixed = item.price?.rule === "remake_fixed_10000";

            return (
              <FunctionalItemCard
                key={stableKey || displayId}
                className="flex items-center justify-between p-3 border border-border rounded-lg"
                alwaysShowActions={canCancel}
                onClick={(e) => {
                  e.stopPropagation();
                  const reqId = item._id || item.id;
                  if (!reqId) return;
                  setSelectedRequestId(reqId);
                  setOpen(true);
                }}
                onRemove={
                  canCancel && (item._id || item.id)
                    ? () => handleCancelRequest(item._id || (item.id as string))
                    : undefined
                }
                confirmTitle="이 의뢰를 취소하시겠습니까?"
                confirmDescription={
                  <div className="text-md">
                    <div className="font-medium mb-1 truncate">
                      <div className="flex items-center justify-between gap-4 mb-2">
                        {getStatusBadge(item.status, item.manufacturerStage)}
                        <span className="text-xs text-muted-foreground">
                          {item.createdAt &&
                            new Date(item.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      {item.caseInfos?.clinicName && (
                        <span>{item.caseInfos.clinicName}</span>
                      )}
                      {item.caseInfos?.patientName && (
                        <span className="ml-1">
                          {item.caseInfos.patientName}
                        </span>
                      )}
                      {item.caseInfos?.tooth && (
                        <span className="ml-1">{item.caseInfos.tooth}</span>
                      )}
                      <span className="ml-1">
                        {(() => {
                          const m = item.caseInfos?.implantManufacturer;
                          const s = item.caseInfos?.implantSystem;
                          const t = item.caseInfos?.implantType;
                          if (!m && !s && !t) return "-";
                          return `${m || "-"} / ${s || "-"} / ${t || "-"}`;
                        })()}
                      </span>
                      {item.caseInfos?.maxDiameter && (
                        <span className="ml-1">
                          {item.caseInfos.maxDiameter.toFixed(1)}
                        </span>
                      )}
                      {item.caseInfos?.connectionDiameter && (
                        <span className="ml-1">
                          {item.caseInfos.connectionDiameter.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                }
                confirmLabel="의뢰 취소"
                cancelLabel="닫기"
              >
                <div className="flex-1 min-w-0 mr-2">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="text-sm font-medium truncate text-foreground">
                      {item.title || displayId}
                    </div>
                    {getStatusBadge(item.status, item.manufacturerStage)}
                    {isRemakeFixed && (
                      <Badge variant="secondary" className="text-[10px]">
                        재의뢰 1만원
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-600 truncate">
                    {item.caseInfos?.clinicName && (
                      <span>{item.caseInfos.clinicName}</span>
                    )}
                    {item.caseInfos?.patientName && (
                      <span className="ml-1">{item.caseInfos.patientName}</span>
                    )}
                    {item.caseInfos?.tooth && (
                      <span className="ml-1">#{item.caseInfos.tooth}</span>
                    )}
                    <span className="ml-1">
                      {(() => {
                        const m = item.caseInfos?.implantManufacturer;
                        const s = item.caseInfos?.implantSystem;
                        const t = item.caseInfos?.implantType;
                        if (!m && !s && !t) return "-";
                        return `${m || "-"} / ${s || "-"} / ${t || "-"}`;
                      })()}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-600 mt-0.5 flex items-center gap-2">
                    <span>
                      의뢰:{" "}
                      {item.createdAt &&
                        new Date(item.createdAt).toLocaleDateString()}
                    </span>
                    {priceAmount != null && (
                      <span>
                        금액: {Number(priceAmount).toLocaleString()}원
                      </span>
                    )}
                    {(() => {
                      const eta =
                        item.timeline?.estimatedShipYmd ||
                        item.estimatedShipYmd;
                      if (!eta) return null;
                      const etaDate = String(eta);
                      return (
                        <span className="text-blue-600 font-medium">
                          발송 예정: {etaDate}
                        </span>
                      );
                    })()}
                    {item.deliveryInfoRef?.deliveredAt && (
                      <span className="text-green-600 font-medium">
                        완료:{" "}
                        {new Date(
                          item.deliveryInfoRef.deliveredAt,
                        ).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              </FunctionalItemCard>
            );
          })}
        </div>
      </CardContent>

      <RequestDetailDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setSelectedRequestId("");
            setDetail(null);
            setCancelConfirmOpen(false);
          }
        }}
        request={detail || selectedSummary}
      />
    </Card>
  );
};

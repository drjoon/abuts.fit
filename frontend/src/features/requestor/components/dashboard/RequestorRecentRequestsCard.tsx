import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FunctionalItemCard } from "@/components/FunctionalItemCard";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch } from "@/lib/apiClient";
import { useAuthStore } from "@/store/useAuthStore";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useNewRequestImplant } from "@/features/requestor/hooks/new_requests/useNewRequestImplant";
import { usePresetStorage } from "@/features/requestor/hooks/new_requests/usePresetStorage";
import { NewRequestPatientImplantFields } from "@/pages/requestor/new_request/components/NewRequestDetailsSection";

const EDITABLE_STATUSES = new Set(["의뢰접수", "가공전"]);

const getStatusBadge = (status: string) => {
  switch (status) {
    case "의뢰접수":
      return <Badge variant="outline">{status}</Badge>;
    case "가공전":
    case "가공후":
    case "배송중":
      return <Badge variant="default">{status}</Badge>;
    case "완료":
      return <Badge variant="secondary">{status}</Badge>;
    case "배송대기":
      return <Badge variant="outline">{status}</Badge>;
    default:
      return <Badge>{status}</Badge>;
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
  onEdit: _onEdit,
  onCancel,
}: Props) => {
  const { token, user } = useAuthStore();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string>("");
  const [detail, setDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editCaseInfos, setEditCaseInfos] = useState<any>(null);

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
    [clinicPresets]
  );
  const patientNameOptions = useMemo(
    () => patientPresets.map((p) => ({ id: p.id, label: p.label })),
    [patientPresets]
  );
  const teethOptions = useMemo(
    () => teethPresets.map((p) => ({ id: p.id, label: p.label })),
    [teethPresets]
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

  const handleStartEditFromDetail = () => {
    if (!token) {
      toast({
        title: "로그인이 필요합니다",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    const status = detail?.status || selectedSummary?.status;
    if (status && !canEditRequest(status)) {
      toast({
        title: "변경 불가",
        description:
          "의뢰접수/가공전 상태에서만 환자/임플란트 정보를 변경할 수 있습니다.",
        variant: "destructive",
        duration: 3000,
      });
      return;
    }

    const base = resolveCurrentCaseInfos();
    setEditCaseInfos({
      clinicName: base.clinicName || "",
      patientName: base.patientName || "",
      tooth: base.tooth || "",
      implantSystem: base.implantSystem || "",
      implantType: base.implantType || "",
      connectionType: base.connectionType || "",
    });

    // 임플란트 셀렉트 기본값 동기화
    setImplantManufacturer(base.implantSystem || "");
    setImplantSystem(base.implantType || "");
    setImplantType(base.connectionType || "");
    syncSelectedConnection(
      base.implantSystem || "",
      base.implantType || "",
      base.connectionType || ""
    );

    setEditMode(true);
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
          description: "의뢰접수/가공전 상태에서만 변경할 수 있습니다.",
          variant: "destructive",
          duration: 3000,
        });
        return;
      }

      setSavingEdit(true);

      const base = resolveCurrentCaseInfos();

      // maxDiameter/connectionDiameter는 모달에서 변경 불가 (기존 값 유지)
      const cleanedEdit = { ...(editCaseInfos || {}) };
      delete cleanedEdit.maxDiameter;
      delete cleanedEdit.connectionDiameter;

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
      setEditMode(false);
      toast({
        title: "의뢰 변경 완료",
        duration: 3000,
      });

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
    if (!selectedRequestId) return;
    await handleCancelRequest(selectedRequestId);
    setOpen(false);
    setSelectedRequestId("");
    setDetail(null);
    setEditMode(false);
    setEditCaseInfos(null);
  };

  const selectedSummary = useMemo(() => {
    if (!selectedRequestId) return null;
    return items.find((it) => (it._id || it.id) === selectedRequestId) || null;
  }, [items, selectedRequestId]);

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
      setEditMode(false);
      setEditCaseInfos(null);
    }
  }, [open]);

  return (
    <Card
      className="relative flex flex-col rounded-2xl border border-gray-200 bg-white/80 shadow-sm transition-all hover:shadow-lg flex-1 min-h-[220px] cursor-pointer"
      onClick={onRefresh}
    >
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base font-semibold m-0">최근 의뢰</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-between pt-0">
        <div className="space-y-3 max-h-[240px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
          {items.map((item: any) => {
            const displayId = item.requestId || item.id || item._id || "";

            return (
              <FunctionalItemCard
                key={displayId}
                className="flex items-center justify-between p-3 border border-border rounded-lg"
                onClick={(e) => {
                  e.stopPropagation();
                  const reqId = item._id || item.id;
                  if (!reqId) return;
                  setSelectedRequestId(reqId);
                  setOpen(true);
                }}
                onRemove={
                  item._id || item.id
                    ? () => handleCancelRequest(item._id || (item.id as string))
                    : undefined
                }
                confirmTitle="이 의뢰를 취소하시겠습니까?"
                confirmDescription={
                  <div className="text-md">
                    <div className="font-medium mb-1 truncate">
                      {item.title || displayId}
                    </div>
                    <div className="text-xs text-muted-foreground">
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
                      {item.caseInfos?.implantSystem && (
                        <span className="ml-1">
                          {item.caseInfos.implantSystem}
                        </span>
                      )}
                      {item.caseInfos?.implantType && (
                        <span className="ml-1">
                          {item.caseInfos.implantType}
                        </span>
                      )}
                      {item.caseInfos?.maxDiameter && (
                        <span className="ml-1">
                          {item.caseInfos.maxDiameter.toFixed(1)}
                        </span>
                      )}
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
                    {item.caseInfos?.clinicName && (
                      <span>{item.caseInfos.clinicName}</span>
                    )}
                    {item.caseInfos?.patientName && (
                      <span className="ml-1">{item.caseInfos.patientName}</span>
                    )}
                    {item.caseInfos?.tooth && (
                      <span className="ml-1">{item.caseInfos.tooth}</span>
                    )}
                    {item.caseInfos?.implantSystem && (
                      <span className="ml-1">
                        {item.caseInfos.implantSystem}
                      </span>
                    )}
                    {item.caseInfos?.implantType && (
                      <span className="ml-1">{item.caseInfos.implantType}</span>
                    )}
                    {item.caseInfos?.maxDiameter && (
                      <span className="ml-1">
                        {item.caseInfos.maxDiameter.toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>
              </FunctionalItemCard>
            );
          })}
        </div>
      </CardContent>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setSelectedRequestId("");
            setDetail(null);
          }
        }}
      >
        <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detail?.title || selectedSummary?.title || "의뢰 상세"}
            </DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-2 text-sm text-muted-foreground">
                {loadingDetail ? (
                  <div>불러오는 중...</div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="text-foreground font-medium">상태</div>
                      <div>
                        {getStatusBadge(
                          detail?.status || selectedSummary?.status || "-"
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="text-foreground font-medium">
                        케이스 정보
                      </div>
                      <div>
                        {detail?.caseInfos?.clinicName ||
                          selectedSummary?.caseInfos?.clinicName ||
                          "-"}
                        {detail?.caseInfos?.patientName ||
                        selectedSummary?.caseInfos?.patientName
                          ? ` / ${
                              detail?.caseInfos?.patientName ||
                              selectedSummary?.caseInfos?.patientName
                            }`
                          : ""}
                        {detail?.caseInfos?.tooth ||
                        selectedSummary?.caseInfos?.tooth
                          ? ` / ${
                              detail?.caseInfos?.tooth ||
                              selectedSummary?.caseInfos?.tooth
                            }`
                          : ""}
                      </div>
                      {(detail?.caseInfos?.implantSystem ||
                        selectedSummary?.caseInfos?.implantSystem) && (
                        <div>
                          {detail?.caseInfos?.implantSystem ||
                            selectedSummary?.caseInfos?.implantSystem}
                          {detail?.caseInfos?.implantType ||
                          selectedSummary?.caseInfos?.implantType
                            ? ` / ${
                                detail?.caseInfos?.implantType ||
                                selectedSummary?.caseInfos?.implantType
                              }`
                            : ""}
                        </div>
                      )}
                      {(detail?.caseInfos?.maxDiameter ||
                        selectedSummary?.caseInfos?.maxDiameter) && (
                        <div>
                          최대 직경:{" "}
                          {(
                            detail?.caseInfos?.maxDiameter ??
                            selectedSummary?.caseInfos?.maxDiameter
                          ).toFixed(1)}
                        </div>
                      )}
                    </div>

                    {detail?.price?.amount != null && (
                      <div className="space-y-1">
                        <div className="text-foreground font-medium">가격</div>
                        <div>
                          {Number(detail.price.amount || 0).toLocaleString()}원
                          {detail.price.rule ? ` (${detail.price.rule})` : ""}
                        </div>
                      </div>
                    )}

                    {editMode ? (
                      <div className="pt-4 space-y-3">
                        <NewRequestPatientImplantFields
                          caseInfos={editCaseInfos || {}}
                          setCaseInfos={(updates) => {
                            setEditCaseInfos((prev: any) => ({
                              ...(prev || {}),
                              ...updates,
                            }));

                            // NewRequestPatientImplantFields 내부 매핑을 따라가되,
                            // 셀렉트 UI state도 같이 동기화해서 UX 일관성 유지
                            if (typeof updates.implantSystem === "string") {
                              setImplantManufacturer(updates.implantSystem);
                            }
                            if (typeof updates.implantType === "string") {
                              setImplantSystem(updates.implantType);
                            }
                            if (typeof updates.connectionType === "string") {
                              setImplantType(updates.connectionType);
                            }
                          }}
                          showImplantSelect={true}
                          connections={connections as any}
                          typeOptions={typeOptions}
                          implantManufacturer={implantManufacturer}
                          setImplantManufacturer={setImplantManufacturer}
                          implantSystem={implantSystem}
                          setImplantSystem={setImplantSystem}
                          implantType={implantType}
                          setImplantType={setImplantType}
                          syncSelectedConnection={syncSelectedConnection}
                          clinicNameOptions={clinicNameOptions}
                          patientNameOptions={patientNameOptions}
                          teethOptions={teethOptions}
                          addClinicPreset={addClinicPreset}
                          clearAllClinicPresets={clearAllClinicPresets}
                          addPatientPreset={addPatientPreset}
                          clearAllPatientPresets={clearAllPatientPresets}
                          addTeethPreset={addTeethPreset}
                          clearAllTeethPresets={clearAllTeethPresets}
                          handleAddOrSelectClinic={(label) => {
                            const next = (label || "").trim();
                            if (!next) return;
                            setEditCaseInfos((prev: any) => ({
                              ...(prev || {}),
                              clinicName: next,
                            }));
                            addClinicPreset(next);
                          }}
                        />

                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setEditMode(false)}
                            disabled={savingEdit || loadingDetail}
                          >
                            취소
                          </Button>
                          <Button
                            type="button"
                            onClick={handleSaveEditFromDetail}
                            disabled={savingEdit || loadingDetail}
                          >
                            저장
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="pt-4 flex justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleStartEditFromDetail}
                          disabled={loadingDetail}
                        >
                          의뢰 변경
                        </Button>
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={handleCancelFromDetail}
                          disabled={loadingDetail}
                        >
                          의뢰 취소
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

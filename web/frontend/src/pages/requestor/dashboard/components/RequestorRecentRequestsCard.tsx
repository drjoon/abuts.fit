import { useCallback, useEffect, useMemo, useState } from "react";
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
import { getNormalizedStageLabel } from "@/utils/stage";
import { formatImplantDisplay } from "@/utils/implant";
import { formatDateWithDay, formatDateOnly } from "@/utils/dateFormat";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const EDITABLE_STATUSES = new Set(["의뢰", "CAM"]);

const STAGE_BADGE_BASE =
  "text-[10px] h-4 px-1.5 whitespace-nowrap leading-none flex items-center justify-center";

const STAGE_BADGE_STYLES: Record<
  string,
  {
    variant: "outline" | "default" | "secondary" | "destructive";
    extra?: string;
  }
> = {
  의뢰: { variant: "outline" },
  CAM: { variant: "default" },
  가공: { variant: "default" },
  "세척.패킹": {
    variant: "default",
    extra: "bg-purple-50 text-purple-700 border border-purple-200",
  },
  "포장.발송": {
    variant: "default",
    extra: "bg-blue-50 text-blue-700 border border-blue-200",
  },
  추적관리: { variant: "secondary" },
  취소: { variant: "destructive" },
};

type EditableCaseInfos = {
  clinicName?: string;
  patientName?: string;
  tooth?: string;
  implantManufacturer?: string;
  implantBrand?: string;
  implantFamily?: string;
  implantType?: string;
  retentionGroove?: "none" | "shallow" | "deep";
  maxDiameter?: number | null;
  connectionDiameter?: number | null;
  [key: string]: unknown;
};

type RecentRequestCardItem = {
  _id?: string;
  id?: string;
  requestId?: string;
  title?: string;
  manufacturerStage?: string;
  createdAt?: string;
  estimatedShipYmd?: string;
  daysOverdue?: number;
  daysUntilDue?: number;
  price?: {
    amount?: number;
    rule?: string;
  };
  caseInfos?: EditableCaseInfos;
  timeline?: {
    estimatedShipYmd?: string;
  };
  deliveryInfoRef?: {
    deliveredAt?: string;
  };
  [key: string]: unknown;
};

type ImplantConnection = {
  manufacturer?: string;
  brand?: string;
  family?: string;
  type?: string;
};

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  message?: string;
  error?: string;
};

const resolveStageLabel = (
  item: RecentRequestCardItem | null,
): string | null => {
  if (!item) return null;
  try {
    const label = getNormalizedStageLabel(item);
    if (label) return label;
  } catch {
    return null;
  }
  return null;
};

const renderStageBadge = (item: RecentRequestCardItem | null) => {
  const label = resolveStageLabel(item);
  if (!label) return null;
  const style = STAGE_BADGE_STYLES[label] || { variant: "outline" };
  return (
    <Badge
      variant={style.variant}
      className={`${STAGE_BADGE_BASE} ${style.extra ? style.extra : ""}`.trim()}
    >
      {label}
    </Badge>
  );
};

type Props = {
  items: RecentRequestCardItem[];
  onRefresh: () => void;
  onEdit: (item: RecentRequestCardItem) => void;
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
  const [detail, setDetail] = useState<RecentRequestCardItem | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editCaseInfos, setEditCaseInfos] = useState<EditableCaseInfos | null>(
    null,
  );
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelTarget, setCancelTarget] =
    useState<RecentRequestCardItem | null>(null);

  const {
    connections,
    implantManufacturer,
    setImplantManufacturer,
    implantBrand,
    setImplantBrand,
    implantFamily,
    setImplantFamily,
    implantType,
    setImplantType,
    syncSelectedConnection,
    familyOptions,
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

  const selectedSummary = useMemo(() => {
    if (!selectedRequestId) return null;
    return items.find((it) => (it._id || it.id) === selectedRequestId) || null;
  }, [items, selectedRequestId]);

  const handleCancelRequest = async (requestId: string) => {
    if (!requestId) return;
    await Promise.resolve(onCancel(requestId));
  };

  const resolveCurrentCaseInfos = useCallback((): EditableCaseInfos => {
    const fromDetail = detail?.caseInfos;
    const fromSummary = selectedSummary?.caseInfos;
    return (fromDetail || fromSummary || {}) as EditableCaseInfos;
  }, [detail, selectedSummary]);

  const canEditRequest = (manufacturerStage?: string | null) => {
    if (!manufacturerStage) return false;
    return EDITABLE_STATUSES.has(manufacturerStage);
  };

  const normalizeImplantCaseInfos = useCallback(
    (ci: EditableCaseInfos | null | undefined) => {
      const rawManufacturer =
        typeof ci?.implantManufacturer === "string"
          ? ci.implantManufacturer
          : "";
      const rawBrand =
        typeof ci?.implantBrand === "string" ? ci.implantBrand : "";
      const rawFamily =
        typeof ci?.implantFamily === "string" ? ci.implantFamily : "";
      const rawType = typeof ci?.implantType === "string" ? ci.implantType : "";

      const typedConnections: ImplantConnection[] = Array.isArray(connections)
        ? (connections as ImplantConnection[])
        : [];

      if (typedConnections.length === 0) {
        return {
          manufacturer: rawManufacturer,
          brand: rawBrand,
          family: rawFamily,
          type: rawType,
        };
      }

      const manufacturers = new Set(
        typedConnections.map((c) => c.manufacturer),
      );
      const brands = new Set(typedConnections.map((c) => c.brand));
      const families = new Set(typedConnections.map((c) => c.family));
      const types = new Set(typedConnections.map((c) => c.type));

      const direct = typedConnections.find(
        (c) =>
          c.manufacturer === rawManufacturer &&
          c.brand === rawBrand &&
          c.family === rawFamily &&
          c.type === rawType,
      );
      if (direct) {
        return {
          manufacturer: direct.manufacturer || "",
          brand: direct.brand || "",
          family: direct.family || "",
          type: direct.type || "",
        };
      }

      // 제조사는 맞는데 family/type 기준으로만 좁혀서 복원
      if (manufacturers.has(rawManufacturer)) {
        let candidates = typedConnections.filter(
          (c) => c.manufacturer === rawManufacturer,
        );
        if (rawBrand && brands.has(rawBrand)) {
          candidates = candidates.filter((c) => c.brand === rawBrand);
        }
        if (rawFamily && families.has(rawFamily)) {
          candidates = candidates.filter((c) => c.family === rawFamily);
        }
        if (rawType && types.has(rawType)) {
          candidates = candidates.filter((c) => c.type === rawType);
        }
        const chosen = candidates[0];
        if (chosen) {
          return {
            manufacturer: chosen.manufacturer || "",
            brand: chosen.brand || "",
            family: chosen.family || "",
            type: chosen.type || "",
          };
        }
      }

      return {
        manufacturer: rawManufacturer,
        brand: rawBrand,
        family: rawFamily,
        type: rawType,
      };
    },
    [connections],
  );

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

      const manufacturerStage =
        detail?.manufacturerStage || selectedSummary?.manufacturerStage;
      if (manufacturerStage && !canEditRequest(manufacturerStage)) {
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

      const res = await apiFetch<ApiEnvelope<RecentRequestCardItem>>({
        path: `/api/requests/${selectedRequestId}`,
        method: "PUT",
        token,
        jsonBody: payload,
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "다시 시도해주세요.";
      toast({
        title: "의뢰 변경 실패",
        description: message,
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

  useEffect(() => {
    if (!open) return;

    const ci = resolveCurrentCaseInfos();
    const normalized = normalizeImplantCaseInfos(ci);
    setEditCaseInfos({
      clinicName: ci?.clinicName || "",
      patientName: ci?.patientName || "",
      tooth: ci?.tooth || "",
      implantManufacturer: normalized.manufacturer || "",
      implantBrand: normalized.brand || "",
      implantFamily: normalized.family || "",
      implantType: normalized.type || "",
      maxDiameter: ci?.maxDiameter ?? null,
      connectionDiameter: ci?.connectionDiameter ?? null,
    });
  }, [open, normalizeImplantCaseInfos, resolveCurrentCaseInfos]);

  useEffect(() => {
    const run = async () => {
      if (!open || !selectedRequestId) return;
      setLoadingDetail(true);
      try {
        const res = await apiFetch<ApiEnvelope<RecentRequestCardItem>>({
          path: `/api/requests/${selectedRequestId}`,
          method: "GET",
          token,
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

  const isCancelableRequest = (r: RecentRequestCardItem | null) => {
    const normalizedStageLabel = resolveStageLabel(r);
    return normalizedStageLabel === "의뢰" || normalizedStageLabel === "CAM";
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
          {items.map((item) => {
            const rawRequestId = String(item.requestId || "").trim();
            const stableKey = item._id || item.id || rawRequestId || "";
            const displayId = rawRequestId || String(item.id || item._id || "");
            const canCancel = isCancelableRequest(item);
            const priceAmount = item.price?.amount;
            const isRemakeFixed = item.price?.rule === "remake_fixed_10000";
            const isRemakeMonthlyFree =
              item.price?.rule === "remake_monthly_free_3";
            const retentionGrooveLabel =
              item.caseInfos?.retentionGroove === "deep" ? "있음" : "없음";

            return (
              <FunctionalItemCard
                key={stableKey || displayId}
                className="flex items-center justify-between p-3 border border-border rounded-lg"
                onClick={(e) => {
                  e.stopPropagation();
                  const reqId = item._id || item.id;
                  if (!reqId) return;
                  setSelectedRequestId(reqId);
                  setOpen(true);
                }}
              >
                <TooltipProvider>
                  <div className="absolute top-2 right-2 z-10">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex">
                          <button
                            type="button"
                            className={`inline-flex h-6 min-w-[42px] items-center justify-center rounded-full px-2 text-[11px] font-bold shadow-sm transition-colors ${
                              canCancel
                                ? "bg-red-500 text-white hover:bg-red-600"
                                : "bg-gray-200 text-gray-500 cursor-not-allowed"
                            }`}
                            disabled={!canCancel}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!canCancel) return;
                              setCancelTarget(item);
                            }}
                            aria-label="의뢰 취소"
                          >
                            취소
                          </button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        의뢰, CAM 공정에서만 취소할 수 있습니다.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
                <div className="flex-1 min-w-0 mr-2 pr-12">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="text-sm font-medium truncate text-foreground">
                      {item.title || displayId}
                    </div>
                    {renderStageBadge(item)}
                    {isRemakeFixed && (
                      <Badge variant="secondary" className="text-[10px]">
                        리메이크 1만원
                      </Badge>
                    )}
                    {isRemakeMonthlyFree && (
                      <Badge variant="secondary" className="text-[10px]">
                        리메이크 무료(월 3건)
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
                      {formatImplantDisplay(item.caseInfos)}
                    </span>
                    <span className="ml-1">유지홈 {retentionGrooveLabel}</span>
                  </div>
                  <div className="text-[10px] text-slate-600 mt-0.5 flex items-center gap-2">
                    <span>
                      의뢰: {item.createdAt && formatDateOnly(item.createdAt)}
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
                      return (
                        <span className="text-blue-600 font-medium">
                          발송 예정: {formatDateWithDay(eta)}
                        </span>
                      );
                    })()}
                    {item.deliveryInfoRef?.deliveredAt && (
                      <span className="text-green-600 font-medium">
                        완료: {formatDateOnly(item.deliveryInfoRef.deliveredAt)}
                      </span>
                    )}
                  </div>
                </div>
              </FunctionalItemCard>
            );
          })}
        </div>
      </CardContent>

      <ConfirmDialog
        open={Boolean(cancelTarget)}
        title="이 의뢰를 취소하시겠습니까?"
        description={
          <div className="text-md">
            <div className="font-medium mb-1 truncate">
              <div className="flex items-center justify-between gap-4 mb-2">
                {renderStageBadge(cancelTarget)}
                <span className="text-xs text-muted-foreground">
                  {cancelTarget?.createdAt &&
                    formatDateOnly(cancelTarget.createdAt)}
                </span>
              </div>
              {cancelTarget?.caseInfos?.clinicName && (
                <span>{cancelTarget.caseInfos.clinicName}</span>
              )}
              {cancelTarget?.caseInfos?.patientName && (
                <span className="ml-1">
                  {cancelTarget.caseInfos.patientName}
                </span>
              )}
              {cancelTarget?.caseInfos?.tooth && (
                <span className="ml-1">{cancelTarget.caseInfos.tooth}</span>
              )}
              <span className="ml-1">
                {formatImplantDisplay(cancelTarget?.caseInfos)}
              </span>
              <span className="ml-1">
                유지홈{" "}
                {cancelTarget?.caseInfos?.retentionGroove === "deep"
                  ? "있음"
                  : "없음"}
              </span>
            </div>
          </div>
        }
        confirmLabel="의뢰 취소"
        cancelLabel="닫기"
        onConfirm={async () => {
          const targetId = cancelTarget?._id || cancelTarget?.id;
          if (!targetId) {
            setCancelTarget(null);
            return;
          }
          await handleCancelRequest(String(targetId));
          setCancelTarget(null);
        }}
        onCancel={() => setCancelTarget(null)}
      />

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

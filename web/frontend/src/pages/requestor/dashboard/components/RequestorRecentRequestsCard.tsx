import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { PastRequestsModal } from "@/shared/components/PastRequestsModal";
import { useAppEventListener } from "@/shared/realtime/useAppEventListener";
import { getNormalizedStageLabel } from "@/utils/stage";
import { formatImplantDisplay } from "@/utils/implant";
import { formatDateWithDay, formatDateOnly } from "@/utils/dateFormat";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ShippingModeBadge } from "@/shared/shipping/ShippingModeBadge";
import { resolveQuotedPriceAmount } from "@/shared/shipping/shippingMode";
import { useSystemSettings, CREDIT_SETTINGS_DEFAULTS } from "@/hooks/useSystemSettings";
import {
  PRODUCT_MODE,
  resolveProductMode,
} from "@/pages/manufacturer/worksheet/custom_abutment/utils/request";
import {
  SEMANTIC_CALLOUT,
  STAGE_BADGE_STYLES,
  getProductModeBadgeClassName,
} from "@/shared/ui/semanticStatus";

// change-log:
// - 2026-08-11: 카드 헤더 오른쪽 위에 [지난 의뢰] 버튼·모달 추가(대시보드 상단 헤더에서 이전).
// - 2026-08-11: 뱃지/불완전가공 색 — semanticStatus Primary/Attention/Danger.
// - 2026-08-09: 최근 의뢰 커스텀어벗 수= customAbutment·임플란트 치아만(Pontic 제외).
// - 2026-08-09: 최근 의뢰에 생산/디자인+생산 뱃지. 디자인+생산은 임플란트 대신 치과·환자·어벗 수.
// related files:
// - web/frontend/src/shared/ui/semanticStatus.ts
// - web/frontend/src/pages/requestor/dashboard/RequestorDashboardPage.tsx
// - web/frontend/src/shared/components/PastRequestsModal.tsx
// - web/frontend/src/shared/components/RequestorWorkspaceHeader.tsx
// - web/frontend/src/shared/ui/PricingPolicyDialog.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/PreviewModal.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/components/WorksheetCardGrid.tsx
// - web/frontend/src/pages/manufacturer/worksheet/custom_abutment/utils/request.ts
// - web/frontend/src/shared/realtime/useAppEventListener.ts
// - web/backend/controllers/requests/common.requests.controller.js
// - web/backend/controllers/requests/designPrice.utils.js
// - web/frontend/rules.md
// - web/backend/controllers/requests/expressPrice.utils.js
// - .cursor/rules/design-fee.mdc

const EDITABLE_STATUSES = new Set(["준비", "CAM", "가공"]); // CAM 호환 포함, UI 정책상 준비/가공 단계에서 수정 허용

/** 최근 의뢰 리스트에 한 번에 보여줄 카드 개수(넘치면 스크롤) */
const RECENT_REQUESTS_VISIBLE_COUNT = 2.5;
const RECENT_REQUESTS_LIST_GAP_PX = 12; // space-y-3

const STAGE_BADGE_BASE =
  "text-[10px] h-5 px-1.5 whitespace-nowrap leading-none flex items-center justify-center";

const PRODUCT_MODE_BADGE_STYLES: Record<
  string,
  { label: string; className: string }
> = {
  [PRODUCT_MODE.DESIGN_CUSTOM_ABUTMENT]: {
    label: "디자인+생산",
    className: getProductModeBadgeClassName("design_custom_abutment"),
  },
  [PRODUCT_MODE.CUSTOM_ABUTMENT]: {
    label: "생산",
    className: getProductModeBadgeClassName("custom_abutment"),
  },
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
  productMode?: string | null;
  toothWorks?: Array<{
    toothNumber?: string | null;
    prosthesisType?: string | null;
    customAbutment?: boolean | null;
    implantManufacturer?: string | null;
    implantBrand?: string | null;
    implantFamily?: string | null;
    implantType?: string | null;
  }> | null;
  [key: string]: unknown;
};

type RecentRequestCardItem = {
  _id?: string;
  id?: string;
  requestId?: string;
  source?: string;
  rnd?: {
    doneAt?: string | null;
    unmachinableAt?: string | null;
    unmachinablePotentialAt?: string | null;
    unmachinableConfirmedAt?: string | null;
    unmachinableReason?: string | null;
  } | null;
  title?: string;
  manufacturerStage?: string;
  createdAt?: string;
  estimatedShipYmd?: string;
  daysOverdue?: number;
  daysUntilDue?: number;
  price?: {
    amount?: number;
    expressFee?: number | null;
    expressFeeStatus?: string | null;
    designFee?: number | null;
    abutmentQty?: number | null;
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

const isUnmachinableRequest = (item: RecentRequestCardItem | null) =>
  Boolean(item?.rnd?.unmachinableAt);

const getUnmachinableReason = (item: RecentRequestCardItem | null) =>
  String(item?.rnd?.unmachinableReason || "").trim();

const parseUnmachinableReasonLines = (reasonRaw: string): string[] => {
  const raw = String(reasonRaw || "").trim();
  if (!raw) return [];
  return raw
    .split(/\s*\/\s*|\n+/)
    .map((line) => String(line || "").trim())
    .filter(Boolean);
};

const isManufacturerSampleRequest = (item: RecentRequestCardItem | null) => {
  const source = String(item?.source || "").trim();
  const priceRule = String(item?.price?.rule || "").trim();
  return source === "manufacturer_sample" || priceRule === "manufacturer_sample";
};

const isDesignCustomAbutmentItem = (item: RecentRequestCardItem | null) => {
  if (!item) return false;
  if (resolveProductMode(item) === PRODUCT_MODE.DESIGN_CUSTOM_ABUTMENT) {
    return true;
  }
  return Math.max(0, Number(item?.price?.designFee) || 0) > 0;
};

const isPonticProsthesisType = (prosthesisType: unknown) =>
  /^pontic$/i.test(String(prosthesisType || "").trim());

const isBillableDesignAbutmentRow = (row: {
  toothNumber?: string | null;
  prosthesisType?: string | null;
  customAbutment?: boolean | null;
  implantManufacturer?: string | null;
  implantBrand?: string | null;
  implantFamily?: string | null;
  implantType?: string | null;
} | null | undefined) => {
  const toothNumber = String(row?.toothNumber || "").trim();
  const prosthesisType = String(row?.prosthesisType || "").trim();
  if (!/^[1-4][1-8]$/.test(toothNumber) || !prosthesisType) return false;
  if (isPonticProsthesisType(prosthesisType)) return false;
  if (row?.customAbutment === true) return true;
  return Boolean(
    String(row?.implantManufacturer || "").trim() ||
      String(row?.implantBrand || "").trim() ||
      String(row?.implantFamily || "").trim() ||
      String(row?.implantType || "").trim(),
  );
};

/** 디자인+생산 커스텀어벗 수: price.abutmentQty → toothWorks(커스텀어벗) → tooth 파싱 → 1 */
const resolveCustomAbutmentQty = (item: RecentRequestCardItem | null) => {
  const fromPrice = Math.floor(Number(item?.price?.abutmentQty) || 0);
  if (fromPrice > 0) return fromPrice;

  const works = Array.isArray(item?.caseInfos?.toothWorks)
    ? item.caseInfos.toothWorks
    : [];
  const validWorks = works.filter((row) => {
    const toothNumber = String(row?.toothNumber || "").trim();
    const prosthesisType = String(row?.prosthesisType || "").trim();
    return /^[1-4][1-8]$/.test(toothNumber) && Boolean(prosthesisType);
  });
  if (validWorks.length > 0) {
    return validWorks.filter((row) => isBillableDesignAbutmentRow(row)).length;
  }

  const tooth = String(item?.caseInfos?.tooth || "").trim();
  if (tooth) {
    const parts = tooth
      .split(/[,/·\s]+/)
      .map((p) => p.trim())
      .filter((p) => /^[1-4][1-8]$/.test(p) || /^\d{1,2}$/.test(p));
    if (parts.length > 0) return parts.length;
  }

  return 1;
};

const renderProductModeBadge = (item: RecentRequestCardItem | null) => {
  if (!item) return null;
  const mode = isDesignCustomAbutmentItem(item)
    ? PRODUCT_MODE.DESIGN_CUSTOM_ABUTMENT
    : PRODUCT_MODE.CUSTOM_ABUTMENT;
  const style = PRODUCT_MODE_BADGE_STYLES[mode];
  if (!style) return null;
  return (
    <Badge
      variant="outline"
      className={`${STAGE_BADGE_BASE} ${style.className}`.trim()}
    >
      {style.label}
    </Badge>
  );
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

const renderRecentRequestSummaryLine = (
  item: RecentRequestCardItem | null,
) => {
  if (!item) return null;
  const clinicName = String(item.caseInfos?.clinicName || "").trim();
  const patientName = String(item.caseInfos?.patientName || "").trim();

  if (isDesignCustomAbutmentItem(item)) {
    const qty = resolveCustomAbutmentQty(item);
    return (
      <>
        {clinicName ? <span>{clinicName}</span> : null}
        {patientName ? (
          <span className={clinicName ? "ml-1" : undefined}>{patientName}</span>
        ) : null}
        <span className={clinicName || patientName ? "ml-1" : undefined}>
          커스텀어벗 {qty}개
        </span>
      </>
    );
  }

  const retentionGrooveLabel =
    item.caseInfos?.retentionGroove === "deep" ? "있음" : "없음";
  return (
    <>
      {clinicName ? <span>{clinicName}</span> : null}
      {patientName ? (
        <span className={clinicName ? "ml-1" : undefined}>{patientName}</span>
      ) : null}
      {item.caseInfos?.tooth ? (
        <span className="ml-1">#{item.caseInfos.tooth}</span>
      ) : null}
      <span className="ml-1">{formatImplantDisplay(item.caseInfos)}</span>
      <span className="ml-1">유지홈 {retentionGrooveLabel}</span>
    </>
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
  const { data: systemSettings } = useSystemSettings();
  const expressFee =
    systemSettings?.creditSettings?.expressFee ??
    CREDIT_SETTINGS_DEFAULTS.expressFee;
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
  const [unmachinableInfoOpen, setUnmachinableInfoOpen] = useState(false);
  const [unmachinableTarget, setUnmachinableTarget] =
    useState<RecentRequestCardItem | null>(null);
  const [pastRequestsOpen, setPastRequestsOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [listMaxHeightPx, setListMaxHeightPx] = useState<number | undefined>(
    undefined,
  );

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

  const visibleItems = useMemo(
    () => items.filter((it) => !isManufacturerSampleRequest(it)),
    [items],
  );

  useLayoutEffect(() => {
    const listEl = listRef.current;
    if (!listEl) return;

    const measure = () => {
      const firstItem = listEl.firstElementChild as HTMLElement | null;
      if (!firstItem) {
        setListMaxHeightPx(undefined);
        return;
      }
      const itemHeight = firstItem.getBoundingClientRect().height;
      if (!Number.isFinite(itemHeight) || itemHeight <= 0) {
        setListMaxHeightPx(undefined);
        return;
      }
      const gapCount = Math.floor(RECENT_REQUESTS_VISIBLE_COUNT);
      setListMaxHeightPx(
        itemHeight * RECENT_REQUESTS_VISIBLE_COUNT +
          RECENT_REQUESTS_LIST_GAP_PX * gapCount,
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(listEl);
    const firstItem = listEl.firstElementChild;
    if (firstItem instanceof HTMLElement) observer.observe(firstItem);
    return () => observer.disconnect();
  }, [visibleItems]);

  const selectedSummary = useMemo(() => {
    if (!selectedRequestId) return null;
    return (
      visibleItems.find((it) => (it._id || it.id) === selectedRequestId) || null
    );
  }, [visibleItems, selectedRequestId]);

  const handleCancelRequest = async (requestId: string) => {
    if (!requestId) return;
    await Promise.resolve(onCancel(requestId));
  };

  // 불완전 가공 배지는 안내용으로만 사용한다.

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
          description: "준비 또는 가공 단계에서만 변경할 수 있습니다.",
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

  useAppEventListener({
    enabled: Boolean(open && selectedRequestId && token),
    eventTypes: ["request:hex-rotation-updated"],
    shouldHandle: (evt) => {
      const payload =
        evt?.data && typeof evt.data === "object"
          ? (evt.data as Record<string, unknown>)
          : {};
      const eventRequest =
        payload.request && typeof payload.request === "object"
          ? (payload.request as Record<string, unknown>)
          : {};
      const eventOrgId = String(
        payload.requestorBusinessAnchorId ||
          eventRequest.requestorBusinessAnchorId ||
          eventRequest.businessAnchorId ||
          "",
      ).trim();
      const myOrgId = String(user?.businessAnchorId || "").trim();
      if (!eventOrgId || !myOrgId || eventOrgId !== myOrgId) return false;

      const eventRequestMongoId = String(
        payload.requestMongoId || eventRequest._id || "",
      ).trim();
      const eventRequestId = String(
        payload.requestId || eventRequest.requestId || "",
      ).trim();
      const selectedSummaryRequestId = String(selectedSummary?.requestId || "").trim();

      return (
        (eventRequestMongoId && eventRequestMongoId === selectedRequestId) ||
        (eventRequestId && selectedSummaryRequestId && eventRequestId === selectedSummaryRequestId)
      );
    },
    onMatch: () => {
      void Promise.resolve(onRefresh());

      setLoadingDetail(true);
      void apiFetch<ApiEnvelope<RecentRequestCardItem>>({
        path: `/api/requests/${selectedRequestId}`,
        method: "GET",
        token,
      })
        .then((res) => {
          if (res.ok && res.data?.success) {
            setDetail(res.data.data);
          }
        })
        .finally(() => {
          setLoadingDetail(false);
        });
    },
  });

  useEffect(() => {
    if (!open) {
      setEditCaseInfos(null);
    }
  }, [open]);

  const isCancelableRequest = (r: RecentRequestCardItem | null) => {
    const normalizedStageLabel = resolveStageLabel(r);
    return normalizedStageLabel === "준비";
  };

  return (
    <Card
      className="app-glass-card app-glass-card--lg cursor-pointer h-full flex flex-col"
      onClick={onRefresh}
    >
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base font-semibold">최근 의뢰</CardTitle>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            setPastRequestsOpen(true);
          }}
        >
          지난 의뢰
        </Button>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-between pt-2 min-h-0 overflow-hidden">
        <div
          ref={listRef}
          className="space-y-3 overflow-y-auto pr-1 pl-0.5 pb-1 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent"
          style={
            listMaxHeightPx != null
              ? { maxHeight: `${listMaxHeightPx}px` }
              : undefined
          }
        >
          {visibleItems.map((item) => {
            const rawRequestId = String(item.requestId || "").trim();
            const stableKey = item._id || item.id || rawRequestId || "";
            const displayId = rawRequestId || String(item.id || item._id || "");
            const canCancel = isCancelableRequest(item);
            const priceAmount = resolveQuotedPriceAmount({
              price: item.price,
              shippingMode: item,
              expressFee,
            });
            const isRemakeFixed = item.price?.rule === "remake_fixed_10000";
            const isRemakeMonthlyFree =
              item.price?.rule === "remake_monthly_free_3";

            const isUnmachinable = isUnmachinableRequest(item);
            const isUnmachinableConfirmed = Boolean(
              item?.rnd?.unmachinableConfirmedAt,
            );
            const unmachinableReason = String(
              item?.rnd?.unmachinableReason || "",
            ).trim();

            return (
              <FunctionalItemCard
                key={stableKey || displayId}
                className={`flex items-center justify-between p-3 border rounded-lg ${
                  isUnmachinable
                    ? SEMANTIC_CALLOUT.attention
                    : "border-border"
                }`}
                onClick={(e) => {
                  e.stopPropagation();
                  const reqId = item._id || item.id;
                  if (!reqId) return;
                  setSelectedRequestId(reqId);
                  setOpen(true);
                }}
              >
                {isUnmachinable ? (
                  <div className="absolute top-2 right-2 z-10">
                    <button
                      type="button"
                      className={`inline-flex h-7 min-w-[72px] items-center justify-center rounded-full px-2 text-[11px] font-bold leading-none shadow-sm transition-colors ${SEMANTIC_CALLOUT.attentionSolid}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setUnmachinableTarget(item);
                        setUnmachinableInfoOpen(true);
                      }}
                      aria-label="불완전 가공 사유 보기"
                    >
                      불완전 가공
                    </button>
                  </div>
                ) : (
                  <TooltipProvider>
                    <div className="absolute top-2 right-2 z-10">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex">
                            <button
                              type="button"
                              className={`inline-flex h-7 min-w-[42px] items-center justify-center rounded-full px-2 text-[11px] font-bold leading-none shadow-sm transition-colors ${
                                canCancel
                                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
                          준비 단계에서만 취소할 수 있습니다.
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </TooltipProvider>
                )}
                <div className="flex-1 min-w-0 mr-2 pr-12">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="text-sm font-medium truncate text-foreground">
                      {item.title || displayId}
                    </div>
                    <ShippingModeBadge source={item as any} size="sm" />
                    {renderProductModeBadge(item)}
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
                    {renderRecentRequestSummaryLine(item)}
                  </div>
                  {isUnmachinable && (
                    <div className="text-[11px] text-accent-strong mt-1 truncate flex items-center gap-2">
                      <span>불완전 가공 사유: {unmachinableReason || "미등록"}</span>
                      {isUnmachinableConfirmed && (
                        <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                          확인됨
                        </Badge>
                      )}
                    </div>
                  )}
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
                        <span className="text-primary-strong font-medium">
                          출고 예정: {formatDateWithDay(eta)}
                        </span>
                      );
                    })()}
                    {typeof item.daysUntilDue === "number" &&
                      item.daysUntilDue >= 0 && (
                        <Badge
                          variant="outline"
                          className="text-[10px] h-5 px-1.5 text-primary-strong border-primary-muted bg-primary-soft"
                        >
                          출고 {item.daysUntilDue}일전
                        </Badge>
                      )}
                    {item.deliveryInfoRef?.deliveredAt && (
                      <span className="text-primary-strong font-medium">
                        배송완료: {formatDateOnly(item.deliveryInfoRef.deliveredAt)}
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
                <div className="flex items-center gap-1.5">
                  {renderProductModeBadge(cancelTarget)}
                  {renderStageBadge(cancelTarget)}
                </div>
                <span className="text-xs text-muted-foreground">
                  {cancelTarget?.createdAt &&
                    formatDateOnly(cancelTarget.createdAt)}
                </span>
              </div>
              {renderRecentRequestSummaryLine(cancelTarget)}

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

      <Dialog
        open={unmachinableInfoOpen}
        onOpenChange={(next) => {
          setUnmachinableInfoOpen(next);
          if (!next) setUnmachinableTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md border-accent-muted ring-2 ring-accent-muted/80">
          <DialogHeader>
            <DialogTitle className="text-accent-strong">불완전 가공 안내</DialogTitle>
            <DialogDescription>
              해당 의뢰는 제조사에서 불완전 가공 판정을 받았습니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-md border border-accent-muted bg-accent-soft px-3 py-2">
              <div className="text-xs font-semibold text-accent-strong mb-1">상세 사유</div>
              {(() => {
                const reasonLines = parseUnmachinableReasonLines(
                  getUnmachinableReason(unmachinableTarget),
                );
                if (!reasonLines.length) {
                  return (
                    <div className="text-sm text-accent-strong">
                      불완전 가공 사유가 등록되지 않았습니다.
                    </div>
                  );
                }
                return (
                  <div className="text-sm text-accent-strong space-y-0.5">
                    {reasonLines.map((line, idx) => (
                      <div key={`unmachinable-reason-line-${idx}`}>{line}</div>
                    ))}
                  </div>
                );
              })()}
            </div>
            <div className="text-sm text-slate-700 leading-relaxed">
              문의 사항은 <span className="font-semibold">전화</span>나
              <span className="font-semibold"> 채팅</span>, 혹은
              <span className="font-semibold"> 문의 게시판</span>으로 남겨주세요.
            </div>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setUnmachinableInfoOpen(false)}
              >
                닫기
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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

      <PastRequestsModal
        open={pastRequestsOpen}
        onOpenChange={setPastRequestsOpen}
        title="지난 의뢰"
        onSelectRequest={(r) => {
          setPastRequestsOpen(false);
          onEdit(r as RecentRequestCardItem);
        }}
      />
    </Card>
  );
};

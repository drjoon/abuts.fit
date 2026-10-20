// change-log:
// - 2026-10-21: 임플란트 통합 섹션 — 비활성 pane 흐림 대신 테두리·선택됨 뱃지.
// - 2026-10-21: 프리셋·신규 임플란트 — 한 섹션, catalog/custom 상호 배타 선택.
// - 2026-10-21: 신규 임플란트 안내 문구 — ? 툴팁으로 숨김.
// - 2026-10-21: 신규 임플란트 직접 입력 — 카탈로그 선택 중에도 포커스 시 프리셋 해제 후 입력 가능.
// - 2026-10-21: 신규 임플란트 입력은 프리셋과 XOR. 요청/취소·단건 제출 없이 의뢰하기에서 함께 보낸다.
// - 2026-10-20: 가공 tight 경고 시 확인 & 다음 위 안내·화살표·진행 확인 문구.
// - 2026-10-18: 유지홈 저장값이 비어 있으면 화면에 보이는 「없음」을 바로 저장.
// - 2026-09-20: 유지홈 아래 아노다이징 ON/OFF(계정 기본값 저장).
// - 2026-09-02: lab-handoff 기본 확인 라벨「확인」(S3는 모달 중 사전 업로드). confirmDisabled.
// - 2026-08-28: 확인 중 버튼「처리 중…」(백그라운드 S3 완료 후 API 저장과 구분).
// - 2026-08-28: lab-handoff — 현재 파일 S3 업로드 프로그레스바.
// - 2026-09-07: 신규 임플란트 AlertDialog z-330 — 3D 확인 모달(z-320) 위.
// - 2026-08-28: z-[320]/overlay z-[310] — 플로팅 의뢰상세(z-300) 위에 3D 확인 모달.
// - 2026-08-16: lab-handoff confirmLabel·progressLabel(다파일 큐).
// - 2026-08-16: 어벗생산의뢰·기공의뢰수신 공통 3D 확인 다이얼로그로 통합.
// - 2026-08-16: 유지홈 미선택 허용(강제 선택). 기본 none 자동주입 제거.
// related files:
// - web/frontend/src/pages/requestor/new_request/components/NewRequestDetailDialog.tsx
// - web/frontend/src/shared/components/practice/AbutmentDesignConfirmDialog.tsx
// - web/frontend/src/pages/requestor/new_request/components/NewRequestPatientImplantFields.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, CircleHelp } from "lucide-react";
import { StlPreviewViewer } from "@/features/requests/components/StlPreviewViewer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/shared/ui/cn";
import type {
  CaseInfos,
  Connection,
  NewRequestProductMode,
} from "@/pages/requestor/new_request/hooks/newRequestTypes";
import { NewRequestDesignAbutmentFields } from "@/pages/requestor/new_request/components/NewRequestDesignAbutmentFields";
import { NewRequestPatientImplantFields } from "@/pages/requestor/new_request/components/NewRequestPatientImplantFields";
import { RetentionGrooveField } from "@/shared/components/practice/RetentionGrooveField";
import { AnodizingField } from "@/shared/components/practice/AnodizingField";
import {
  StlMachiningPreflightNotice,
  type StlMachiningPreflight,
} from "@/features/requests/components/StlMachiningPreflightNotice";
import {
  fetchCorrectedStlBlob,
  triggerBrowserFileDownload,
} from "@/features/requests/utils/downloadCorrectedStl";
import {
  NEW_IMPLANT_DEVELOPMENT_ENTRY_HINT_MESSAGES,
  NEW_IMPLANT_DEVELOPMENT_REQUEST_MESSAGE,
  NEW_IMPLANT_QUICK_PRESETS,
} from "@/shared/practice/newImplantQuickPresets";

export type AbutmentModelConfirmVariant = "new-request" | "lab-handoff";

type ImplantEntryMode = "catalog" | "custom";

type ToastFn = (props: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: string;
  duration?: number;
}) => void;

type Option = { id: string; label: string };

export type AbutmentModelConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** new-request: 삭제/확인&다음/건너뛰기. lab-handoff: 취소/확인 */
  variant?: AbutmentModelConfirmVariant;
  detailIndex: number | null;
  selectedPreviewIndex: number | null;
  files: File[];
  detailFile: File | null;
  detailCaseInfos?: CaseInfos;
  setDetailCaseInfos: (updates: Partial<CaseInfos>) => void;
  handleDiameterComputed: (
    filename: string,
    maxDiameter: number,
    connectionDiameter: number,
    totalLength: number,
    taperAngle: number,
    tiltAxisVector?: { x: number; y: number; z: number } | null,
    frontPoint?: { x: number; y: number; z: number } | null,
  ) => void;
  connections: Connection[];
  familyOptions: string[];
  typeOptions: string[];
  implantManufacturer: string;
  setImplantManufacturer: (v: string) => void;
  implantBrand: string;
  setImplantBrand: (v: string) => void;
  implantFamily: string;
  setImplantFamily: (v: string) => void;
  implantType: string;
  setImplantType: (v: string) => void;
  syncSelectedConnection: (
    manufacturer: string,
    brand: string,
    family: string,
    type: string,
  ) => void;
  clinicNameOptions: Option[];
  patientNameOptions: Option[];
  teethOptions: Option[];
  addClinicPreset: (label: string) => void;
  clearAllClinicPresets: () => void;
  addPatientPreset: (label: string) => void;
  clearAllPatientPresets: () => void;
  addTeethPreset: (label: string) => void;
  clearAllTeethPresets: () => void;
  handleAddOrSelectClinic: (label: string) => void;
  onImplantCatalogIssue?: (
    issue: {
      manufacturer: string;
      brand: string;
      family: string;
      type: string;
      reason: "brand_not_in_catalog";
    } | null,
  ) => void;
  highlightUnverifiedArrows: boolean;
  handleRemoveFile: (index: number) => void;
  onVerifyAndNext: (index: number) => Promise<void>;
  onSkip: () => void;
  toast: ToastFn;
  /** 구강스캔(묶음·단일): 커스텀어벗 디자인+생산 고정 */
  lockDesignProductMode?: boolean;
  /** 어벗디자인 STL(<3MB): 커스텀어벗 생산 고정 */
  lockProductionProductMode?: boolean;
  /** 계정 유지홈 기본값 변경 시 저장 */
  onRetentionGrooveAccountSave?: (value: "none" | "deep") => void;
  /** 계정 아노다이징 기본값(미지정 시 ON) */
  defaultAnodizingEnabled?: boolean;
  /** 계정 아노다이징 기본값 변경 시 저장 */
  onAnodizingAccountSave?: (value: boolean) => void;
  /** 프리뷰에서 전환 가능한 파일 인덱스(환자 케이스 멤버 등) */
  previewFileIndices?: number[];
  onSelectPreviewIndex?: (index: number) => void;
  /** lab-handoff 업로드 중 닫기 방지 */
  confirming?: boolean;
  /** lab-handoff 확인 버튼 추가 비활성(예: S3 사전업로드 미완료) */
  confirmDisabled?: boolean;
  /** lab-handoff 확인 버튼 문구(미지정 시「확인」) */
  confirmLabel?: string;
  /** 다파일 큐 진행 표시 (예: 1/3) */
  progressLabel?: string;
  /** 현재 파일 S3 사전업로드 진행률(0~100). null이면 숨김 */
  fileUploadPercent?: number | null;
  fileUploadLabel?: string | null;
  /** 접수 전 가공 검사 결과(신규의뢰만 전달). tight여도 확인을 막지 않는다. */
  machiningPreflight?: StlMachiningPreflight | null;
  /** 보정 디자인을 확인하면 접수 파일을 그 STL로 바꾼다(S3 재업로드 포함). */
  onApplyCorrectedDesign?: (index: number, file: File) => void | Promise<void>;
  /** 3D 확인 모달이 열린 동안 보정 STL을 받아 S3에 올려 둔다. */
  onPrepareCorrectedDesign?: (correctedId: string, sourceName: string) => void;
  /** 준비된 보정 파일. 아직이면 그 작업을 기다린다. 없으면 null. */
  onTakePreparedCorrectedDesign?: (
    correctedId: string,
  ) => Promise<File | null> | null;
  /** 평균 R 0.50mm 이상에서 보정 STL 없이 원본으로 진행한다. */
  onKeepOriginalDesign?: (file: File) => void;
  /** 보정 STL로 의뢰한다. 과삭제 허용을 끈다. */
  onUseCorrectedDesign?: (file: File) => void;
};

export function AbutmentModelConfirmDialog({
  open,
  onOpenChange,
  variant = "new-request",
  detailIndex,
  selectedPreviewIndex,
  files,
  detailFile,
  detailCaseInfos,
  setDetailCaseInfos,
  handleDiameterComputed,
  connections,
  familyOptions,
  typeOptions,
  implantManufacturer,
  setImplantManufacturer,
  implantBrand,
  setImplantBrand,
  implantFamily,
  setImplantFamily,
  implantType,
  setImplantType,
  syncSelectedConnection,
  clinicNameOptions,
  patientNameOptions,
  teethOptions,
  addClinicPreset,
  clearAllClinicPresets,
  addPatientPreset,
  clearAllPatientPresets,
  addTeethPreset,
  clearAllTeethPresets,
  handleAddOrSelectClinic,
  onImplantCatalogIssue,
  highlightUnverifiedArrows,
  handleRemoveFile,
  onVerifyAndNext,
  onSkip,
  toast,
  onRetentionGrooveAccountSave,
  defaultAnodizingEnabled = true,
  onAnodizingAccountSave,
  lockDesignProductMode = false,
  lockProductionProductMode = false,
  previewFileIndices,
  onSelectPreviewIndex,
  confirming = false,
  confirmDisabled = false,
  confirmLabel,
  progressLabel,
  fileUploadPercent = null,
  fileUploadLabel = null,
  machiningPreflight = null,
  onPrepareCorrectedDesign,
  onTakePreparedCorrectedDesign,
  onKeepOriginalDesign,
  onUseCorrectedDesign,
}: AbutmentModelConfirmDialogProps) {
  const isLabHandoff = variant === "lab-handoff";
  const labConfirmLabel = String(confirmLabel || "").trim() || "확인";
  const labProgressLabel = String(progressLabel || "").trim();
  const labConfirmBlocked = confirming || confirmDisabled;
  const uploadPercent =
    typeof fileUploadPercent === "number" && Number.isFinite(fileUploadPercent)
      ? Math.max(0, Math.min(100, Math.round(fileUploadPercent)))
      : null;
  const uploadLabel = String(fileUploadLabel || "").trim();
  const [newSystemManufacturer, setNewSystemManufacturer] = useState("");
  const [newSystemBrand, setNewSystemBrand] = useState("");
  const [newSystemFamily, setNewSystemFamily] = useState("");
  const [implantEntryMode, setImplantEntryMode] =
    useState<ImplantEntryMode>("catalog");
  const [correctedDownloadOpen, setCorrectedDownloadOpen] = useState(false);
  const [correctedDownloading, setCorrectedDownloading] = useState(false);

  const selectCatalogMode = useCallback(() => {
    setImplantEntryMode("catalog");
    setNewSystemManufacturer("");
    setNewSystemBrand("");
    setNewSystemFamily("");
    setDetailCaseInfos({
      implantInputMode: "catalog",
      newSystemRequest: undefined,
    });
  }, [setDetailCaseInfos]);

  const selectCustomMode = useCallback(() => {
    setImplantEntryMode("custom");
    setDetailCaseInfos({
      implantInputMode: "custom",
      implantManufacturer: "",
      implantBrand: "",
      implantFamily: "",
      implantType: "",
    });
    setImplantManufacturer("");
    setImplantBrand("");
    setImplantFamily("");
    setImplantType("");
  }, [
    setDetailCaseInfos,
    setImplantBrand,
    setImplantFamily,
    setImplantManufacturer,
    setImplantType,
  ]);

  const commitCustomImplant = useCallback(
    (next: { manufacturer: string; brand: string; family: string }) => {
      setNewSystemManufacturer(next.manufacturer);
      setNewSystemBrand(next.brand);
      setNewSystemFamily(next.family);
      const manufacturer = next.manufacturer.trim();
      const brand = next.brand.trim();
      const family = next.family.trim();
      const engaged = Boolean(manufacturer || brand || family);
      if (engaged) {
        setImplantEntryMode("custom");
      }
      setDetailCaseInfos({
        ...(engaged
          ? {
              implantManufacturer: "",
              implantBrand: "",
              implantFamily: "",
              implantType: "",
            }
          : {}),
        ...(engaged ? { implantInputMode: "custom" as const } : {}),
        newSystemRequest: engaged
          ? {
              requested: Boolean(manufacturer && brand && family),
              manufacturer,
              brand,
              family,
              message: NEW_IMPLANT_DEVELOPMENT_REQUEST_MESSAGE,
              free: true,
              tag: "신규 임플란트 의뢰",
            }
          : undefined,
      });
      if (engaged) {
        setImplantManufacturer("");
        setImplantBrand("");
        setImplantFamily("");
        setImplantType("");
      }
    },
    [
      setDetailCaseInfos,
      setImplantBrand,
      setImplantFamily,
      setImplantManufacturer,
      setImplantType,
    ],
  );

  const setCatalogCaseInfos = useCallback(
    (updates: Partial<CaseInfos>) => {
      const manufacturer = String(
        updates.implantManufacturer ??
          detailCaseInfos?.implantManufacturer ??
          "",
      ).trim();
      const brand = String(
        updates.implantBrand ?? detailCaseInfos?.implantBrand ?? "",
      ).trim();
      const touchesChosenCatalog =
        ("implantManufacturer" in updates &&
          Boolean(String(updates.implantManufacturer || "").trim())) ||
        ("implantBrand" in updates &&
          Boolean(String(updates.implantBrand || "").trim())) ||
        (("implantFamily" in updates || "implantType" in updates) &&
          Boolean(manufacturer || brand));
      if (touchesChosenCatalog) {
        setImplantEntryMode("catalog");
        setNewSystemManufacturer("");
        setNewSystemBrand("");
        setNewSystemFamily("");
        setDetailCaseInfos({
          ...updates,
          implantInputMode: "catalog",
          newSystemRequest: undefined,
        });
        return;
      }
      setDetailCaseInfos(updates);
    },
    [
      detailCaseInfos?.implantBrand,
      detailCaseInfos?.implantManufacturer,
      setDetailCaseInfos,
    ],
  );

  useEffect(() => {
    if (!open) return;
    const stored = String(detailCaseInfos?.retentionGroove || "").trim();
    if (stored === "none" || stored === "shallow" || stored === "deep") return;
    setDetailCaseInfos({ retentionGroove: "none" });
  }, [detailCaseInfos?.retentionGroove, open, setDetailCaseInfos]);

  const showImplantSelect = true;
  const productMode: NewRequestProductMode = lockProductionProductMode
    ? "custom_abutment"
    : lockDesignProductMode
      ? "design_custom_abutment"
      : detailCaseInfos?.productMode === "design_custom_abutment"
        ? "design_custom_abutment"
        : "custom_abutment";
  const isDesignCustomMode = productMode === "design_custom_abutment";

  const selectablePreviewIndices = useMemo(() => {
    if (Array.isArray(previewFileIndices) && previewFileIndices.length > 0) {
      return previewFileIndices.filter(
        (index) => Number.isInteger(index) && index >= 0 && index < files.length,
      );
    }
    if (detailIndex != null && detailIndex >= 0 && detailIndex < files.length) {
      return [detailIndex];
    }
    return [];
  }, [previewFileIndices, detailIndex, files.length]);

  const activePreviewIndex =
    detailIndex != null && selectablePreviewIndices.includes(detailIndex)
      ? detailIndex
      : (selectablePreviewIndices[0] ?? null);

  useEffect(() => {
    if (!open) return;
    const nsr = detailCaseInfos?.newSystemRequest;
    setNewSystemManufacturer(String(nsr?.manufacturer || ""));
    setNewSystemBrand(String(nsr?.brand || ""));
    setNewSystemFamily(String(nsr?.family || ""));
    const hasCustom = Boolean(
      String(nsr?.manufacturer || "").trim() ||
        String(nsr?.brand || "").trim() ||
        String(nsr?.family || "").trim(),
    );
    if (
      hasCustom &&
      (String(detailCaseInfos?.implantManufacturer || "").trim() ||
        String(detailCaseInfos?.implantBrand || "").trim())
    ) {
      setDetailCaseInfos({
        implantManufacturer: "",
        implantBrand: "",
        implantFamily: "",
        implantType: "",
      });
    }
    const modeFromStore =
      detailCaseInfos?.implantInputMode === "custom" ||
      detailCaseInfos?.implantInputMode === "catalog"
        ? detailCaseInfos.implantInputMode
        : hasCustom
          ? "custom"
          : "catalog";
    setImplantEntryMode(modeFromStore);
    // 파일 전환 시에만 저장된 신규 임플란트 입력을 되돌린다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activePreviewIndex]);

  useEffect(() => {
    if (!open || connections.length === 0) return;
    const manufacturer = String(detailCaseInfos?.implantManufacturer || "").trim();
    if (!manufacturer) return;
    const offered = connections.some(
      (connection) =>
        String(connection.manufacturer || "").trim().toLowerCase() ===
        manufacturer.toLowerCase(),
    );
    if (offered) return;
    setDetailCaseInfos({
      implantManufacturer: "",
      implantBrand: "",
      implantFamily: "",
      implantType: "",
    });
  }, [
    connections,
    detailCaseInfos?.implantManufacturer,
    open,
    setDetailCaseInfos,
  ]);

  const retentionIdPrefix = isLabHandoff ? "lab-handoff-rg" : "new-req-rg";

  const canOfferCorrectedDownload =
    !isLabHandoff &&
    machiningPreflight?.status === "tight" &&
    Boolean(machiningPreflight?.correctedId) &&
    Boolean(detailFile);
  const machiningCheckPending = !isLabHandoff && machiningPreflight?.status === "checking";
  const proceedAsIsAllowed = Boolean(machiningPreflight?.proceedAsIsAllowed);
  const showTightCornerConfirmCue =
    !isLabHandoff && machiningPreflight?.status === "tight" && !machiningCheckPending;
  const highlightConfirmButton =
    !machiningCheckPending &&
    (highlightUnverifiedArrows || showTightCornerConfirmCue);

  const onVerifyAndNextRef = useRef(onVerifyAndNext);
  onVerifyAndNextRef.current = onVerifyAndNext;

  useEffect(() => {
    if (!open || isLabHandoff) return;
    const id = String(machiningPreflight?.correctedId || "").trim();
    if (!id || machiningPreflight?.status !== "tight" || !detailFile) return;
    onPrepareCorrectedDesign?.(id, detailFile.name);
  }, [
    open,
    isLabHandoff,
    machiningPreflight?.correctedId,
    machiningPreflight?.status,
    detailFile,
    onPrepareCorrectedDesign,
  ]);

  const runCorrectedStlDownload = useCallback(async () => {
    if (!detailFile || correctedDownloading) return false;
    setCorrectedDownloading(true);
    try {
      const correctedId = String(machiningPreflight?.correctedId || "").trim();
      if (correctedId) onPrepareCorrectedDesign?.(correctedId, detailFile.name);
      const pending = correctedId
        ? onTakePreparedCorrectedDesign?.(correctedId)
        : null;
      const prepared = pending ? await pending : null;
      if (prepared) {
        triggerBrowserFileDownload(prepared, prepared.name);
      } else {
        const result = await fetchCorrectedStlBlob({
          file: detailFile,
          caseInfos: detailCaseInfos,
        });
        if (!result.ok) {
          toast({
            title: "다운로드 실패",
            description: result.message,
            variant: "destructive",
            duration: 4500,
          });
          return false;
        }
        triggerBrowserFileDownload(result.blob, result.fileName);
      }
      toast({
        title: "보정 디자인을 내려받았습니다.",
        description: "의뢰에는 이 파일을 사용합니다.",
        duration: 3500,
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      toast({
        title: "보정 디자인을 적용하지 못했습니다.",
        description: message || "잠시 후 다시 시도해주세요.",
        variant: "destructive",
        duration: 4500,
      });
      return false;
    } finally {
      setCorrectedDownloading(false);
      setCorrectedDownloadOpen(false);
    }
  }, [
    correctedDownloading,
    detailCaseInfos,
    detailFile,
    machiningPreflight?.correctedId,
    onPrepareCorrectedDesign,
    onTakePreparedCorrectedDesign,
    toast,
  ]);

  /** 부모(handleVerifyFile)와 같은 필수 항목이 비었으면 보정 확인보다 입력 안내가 먼저다. */
  const hasMissingRequiredInfo = useMemo(() => {
    if (isLabHandoff || isDesignCustomMode) return false;
    const rg = String(detailCaseInfos?.retentionGroove || "").trim();
    const retentionReady =
      rg === "none" || rg === "shallow" || rg === "deep" || rg === "";
    const nsr = detailCaseInfos?.newSystemRequest;
    const customReady = Boolean(
      String(nsr?.manufacturer || "").trim() &&
        String(nsr?.brand || "").trim() &&
        String(nsr?.family || "").trim(),
    );
    const catalogReady = Boolean(
      (detailCaseInfos?.implantManufacturer || implantManufacturer) &&
        (detailCaseInfos?.implantBrand || implantBrand) &&
        (detailCaseInfos?.implantFamily || implantFamily) &&
        (detailCaseInfos?.implantType || implantType),
    );
    const implantReady =
      implantEntryMode === "custom" ? customReady : catalogReady;
    return !(
      detailCaseInfos?.clinicName &&
      detailCaseInfos?.patientName &&
      detailCaseInfos?.tooth &&
      implantReady &&
      retentionReady
    );
  }, [
    detailCaseInfos,
    implantBrand,
    implantEntryMode,
    implantFamily,
    implantManufacturer,
    implantType,
    isDesignCustomMode,
    isLabHandoff,
  ]);

  const handleConfirmAndNext = useCallback(() => {
    if (detailIndex === null || machiningCheckPending) return;
    if (canOfferCorrectedDownload && !hasMissingRequiredInfo) {
      setCorrectedDownloadOpen(true);
      return;
    }
    void onVerifyAndNext(detailIndex);
  }, [
    canOfferCorrectedDownload,
    detailIndex,
    hasMissingRequiredInfo,
    machiningCheckPending,
    onVerifyAndNext,
  ]);

  const handleCorrectedProceed = useCallback(async () => {
    const index = detailIndex;
    if (index === null) return;
    if (detailFile) onUseCorrectedDesign?.(detailFile);
    // 보정 STL 준비를 기다리며 멈추지 않는다. 다운로드는 뒤에서 이어가고 다음 단계로 바로 간다.
    void runCorrectedStlDownload();
    setCorrectedDownloadOpen(false);
    await onVerifyAndNextRef.current(index);
  }, [detailFile, detailIndex, onUseCorrectedDesign, runCorrectedStlDownload]);

  const handleProceedAsIs = useCallback(async () => {
    const index = detailIndex;
    if (index === null || !detailFile) return;
    onKeepOriginalDesign?.(detailFile);
    setCorrectedDownloadOpen(false);
    await onVerifyAndNextRef.current(index);
  }, [detailFile, detailIndex, onKeepOriginalDesign]);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (confirming) return;
          onOpenChange(next);
        }}
      >
        <DialogContent
          // Above floating transfer panel (z-300). Same band as ModelPreviewDialog.
          className="new-request-page z-[320] flex w-[calc(100vw-1rem)] max-h-[94vh] max-w-[calc(100vw-1rem)] flex-col gap-3 overflow-y-auto p-4 sm:w-[980px] sm:max-w-[980px] sm:p-5"
          overlayClassName="z-[310]"
        >
          <DialogHeader className="relative shrink-0 space-y-0 pr-8">
            <DialogTitle className="text-lg font-semibold">
              3D 모델 확인 및 정보 입력
              {labProgressLabel ? (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {labProgressLabel}
                </span>
              ) : null}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {isLabHandoff
                ? "3D 모델을 확인하고 환자/임플란트 정보를 입력한 뒤 확인합니다. 파일은 모달이 열린 동안 미리 업로드됩니다."
                : "3D 모델을 확인하고 환자/임플란트 정보를 입력한 뒤 다음 케이스로 이동합니다."}
            </DialogDescription>
          </DialogHeader>

          {uploadPercent != null ? (
            <div
              className="shrink-0 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2"
              role="status"
              aria-live="polite"
            >
              <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="truncate font-medium text-foreground">
                  {uploadLabel || "파일 업로드 중…"}
                </span>
                <span className="shrink-0 tabular-nums">{uploadPercent}%</span>
              </div>
              <Progress value={uploadPercent} className="h-1.5" />
            </div>
          ) : null}

          <div className="grid min-h-0 flex-1 grid-cols-1 items-stretch gap-3 sm:pr-2 lg:grid-cols-[52%_48%] lg:items-start">
            <div className="app-glass-card app-glass-card--lg flex w-full flex-col !p-2 gap-2 lg:self-start">
              <div className="app-glass-card-content shrink-0">
                <div className="relative aspect-[4/3] w-full min-h-[240px] overflow-hidden">
                  {detailFile ? (
                    <StlPreviewViewer
                      file={detailFile}
                      showOverlay={false}
                      showGrid={false}
                      showTightCorner={Boolean(machiningPreflight?.overlay)}
                      correctionSolidVisible={Boolean(machiningPreflight?.overlay)}
                      metadata={
                        machiningPreflight?.overlay
                          ? { tightCorner: machiningPreflight.overlay }
                          : undefined
                      }
                      className="absolute inset-0 h-full w-full min-h-0 md:min-h-0"
                      onDiameterComputed={handleDiameterComputed}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                      3D Preview
                    </div>
                  )}
                </div>
              </div>
              {machiningPreflight ? (
                <StlMachiningPreflightNotice
                  preflight={machiningPreflight}
                  className="w-full shrink-0"
                />
              ) : null}
              {selectablePreviewIndices.length > 1 ? (
                <div className="shrink-0 rounded-lg border border-slate-200 bg-white/80">
                  <ul className="max-h-[7.5rem] overflow-y-auto py-1">
                    {selectablePreviewIndices.map((fileIndex) => {
                      const file = files[fileIndex];
                      if (!file) return null;
                      const selected = activePreviewIndex === fileIndex;
                      return (
                        <li key={`${file.name}:${file.size}:${fileIndex}`}>
                          <button
                            type="button"
                            className={cn(
                              "flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors",
                              selected
                                ? "bg-primary/10 font-medium text-primary"
                                : "text-slate-600 hover:bg-slate-50",
                            )}
                            onClick={() => onSelectPreviewIndex?.(fileIndex)}
                            aria-current={selected ? "true" : undefined}
                          >
                            <span
                              className={cn(
                                "h-1.5 w-1.5 shrink-0 rounded-full",
                                selected ? "bg-primary" : "bg-slate-300",
                              )}
                            />
                            <span className="truncate">{file.name}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="flex h-full min-h-0 flex-col">
              <div className="app-glass-card app-glass-card--lg flex h-full min-h-0 flex-col !p-2">
                <div className="app-glass-card-content flex min-h-0 flex-1 flex-col gap-2 pb-0 text-sm">
                  {isDesignCustomMode ? (
                    <div className="flex min-h-0 flex-1 flex-col">
                      <NewRequestDesignAbutmentFields
                        caseInfos={detailCaseInfos}
                        setCaseInfos={setDetailCaseInfos}
                        readOnly={!detailFile}
                        clinicNameOptions={clinicNameOptions}
                        patientNameOptions={patientNameOptions}
                        addClinicPreset={addClinicPreset}
                        clearAllClinicPresets={clearAllClinicPresets}
                        addPatientPreset={addPatientPreset}
                        clearAllPatientPresets={clearAllPatientPresets}
                        handleAddOrSelectClinic={handleAddOrSelectClinic}
                      />
                    </div>
                  ) : (
                    <div className="flex min-h-0 flex-1 flex-col gap-2">
                      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">
                        임플란트/환자 정보
                      </div>

                      <NewRequestPatientImplantFields
                        caseInfos={detailCaseInfos}
                        setCaseInfos={setCatalogCaseInfos}
                        showImplantSelect={showImplantSelect}
                        readOnly={!detailFile || confirming}
                        implantFieldsLocked={implantEntryMode === "custom"}
                        implantFieldsLockedPassive
                        implantSelectSource="caseInfos"
                        connections={connections}
                        familyOptions={familyOptions}
                        typeOptions={typeOptions}
                        implantManufacturer={implantManufacturer}
                        setImplantManufacturer={setImplantManufacturer}
                        implantBrand={implantBrand}
                        setImplantBrand={setImplantBrand}
                        implantFamily={implantFamily}
                        setImplantFamily={setImplantFamily}
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
                        handleAddOrSelectClinic={handleAddOrSelectClinic}
                        onImplantCatalogIssue={onImplantCatalogIssue}
                        renderImplantSelectSection={
                          isLabHandoff
                            ? undefined
                            : (catalogSelects) => (
                                <div className="overflow-hidden rounded-lg border border-primary-soft bg-white/80">
                                  <div
                                    role="button"
                                    tabIndex={
                                      implantEntryMode === "catalog" || confirming || !detailFile
                                        ? -1
                                        : 0
                                    }
                                    aria-pressed={implantEntryMode === "catalog"}
                                    className={cn(
                                      "px-3 py-2 transition-colors",
                                      implantEntryMode === "catalog"
                                        ? "bg-primary-soft/50 ring-2 ring-inset ring-primary/40"
                                        : "cursor-pointer bg-slate-50/80 ring-1 ring-inset ring-dashed ring-primary/30 hover:bg-primary-soft/25",
                                    )}
                                    onPointerDownCapture={() => {
                                      if (confirming || !detailFile) return;
                                      if (implantEntryMode !== "catalog") {
                                        selectCatalogMode();
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key !== "Enter" && e.key !== " ") return;
                                      if (confirming || !detailFile) return;
                                      if (implantEntryMode !== "catalog") {
                                        e.preventDefault();
                                        selectCatalogMode();
                                      }
                                    }}
                                  >
                                    <div className="mb-1.5 flex items-center justify-between gap-2">
                                      <span className="text-xs font-medium text-slate-600">
                                        카탈로그에서 선택
                                      </span>
                                      {implantEntryMode === "catalog" ? (
                                        <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                          선택됨
                                        </span>
                                      ) : null}
                                    </div>
                                    {catalogSelects}
                                  </div>
                                  <div
                                    className="border-t border-primary-soft/80"
                                    aria-hidden
                                  />
                                  <div
                                    role="button"
                                    tabIndex={
                                      implantEntryMode === "custom" || confirming || !detailFile
                                        ? -1
                                        : 0
                                    }
                                    aria-pressed={implantEntryMode === "custom"}
                                    className={cn(
                                      "flex flex-col gap-2 px-3 py-2 transition-colors",
                                      implantEntryMode === "custom"
                                        ? "bg-primary-soft/50 ring-2 ring-inset ring-primary/40"
                                        : "cursor-pointer bg-slate-50/80 ring-1 ring-inset ring-dashed ring-primary/30 hover:bg-primary-soft/25",
                                    )}
                                    onPointerDownCapture={() => {
                                      if (confirming || !detailFile) return;
                                      if (implantEntryMode !== "custom") {
                                        selectCustomMode();
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key !== "Enter" && e.key !== " ") return;
                                      if (confirming || !detailFile) return;
                                      if (implantEntryMode !== "custom") {
                                        e.preventDefault();
                                        selectCustomMode();
                                      }
                                    }}
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                                      <div className="flex items-center gap-1.5">
                                      <span className="text-sm font-semibold text-slate-700">
                                        찾으시는 임플란트가 없나요?
                                      </span>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <button
                                            type="button"
                                            className="inline-flex text-slate-500 transition-colors hover:text-slate-700"
                                            aria-label="신규 임플란트 개발 안내"
                                            onPointerDown={(e) =>
                                              e.stopPropagation()
                                            }
                                          >
                                            <CircleHelp className="h-4 w-4" />
                                          </button>
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-[min(100vw-2rem,26rem)] text-xs leading-relaxed">
                                          {NEW_IMPLANT_DEVELOPMENT_ENTRY_HINT_MESSAGES.map(
                                            (line) => (
                                              <span key={line}>
                                                {line}
                                                <br />
                                              </span>
                                            ),
                                          )}
                                        </TooltipContent>
                                      </Tooltip>
                                      </div>
                                      {implantEntryMode === "custom" ? (
                                        <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                          선택됨
                                        </span>
                                      ) : null}
                                    </div>
                                    <div
                                      className={cn(
                                        "flex flex-wrap gap-2",
                                        implantEntryMode !== "custom" &&
                                          "pointer-events-none",
                                      )}
                                    >
                                      {NEW_IMPLANT_QUICK_PRESETS.map((preset) => {
                                        const active =
                                          newSystemManufacturer ===
                                            preset.manufacturer &&
                                          newSystemBrand === preset.brand &&
                                          newSystemFamily === preset.family;
                                        return (
                                          <Button
                                            key={preset.label}
                                            type="button"
                                            size="sm"
                                            variant={active ? "default" : "outline"}
                                            className="h-8 shrink-0"
                                            disabled={confirming}
                                            onPointerDown={(e) =>
                                              e.stopPropagation()
                                            }
                                            onClick={() =>
                                              commitCustomImplant({
                                                manufacturer: preset.manufacturer,
                                                brand: preset.brand,
                                                family: preset.family,
                                              })
                                            }
                                          >
                                            {preset.label}
                                          </Button>
                                        );
                                      })}
                                    </div>
                                    <div
                                      className={cn(
                                        "grid grid-cols-1 gap-2 sm:grid-cols-3",
                                        implantEntryMode !== "custom" &&
                                          "pointer-events-none",
                                      )}
                                    >
                                      <Input
                                        placeholder="Manufacturer"
                                        value={newSystemManufacturer}
                                        readOnly={
                                          confirming ||
                                          implantEntryMode !== "custom"
                                        }
                                        onChange={(e) =>
                                          commitCustomImplant({
                                            manufacturer: e.target.value,
                                            brand: newSystemBrand,
                                            family: newSystemFamily,
                                          })
                                        }
                                        disabled={confirming}
                                        className={cn(
                                          implantEntryMode !== "custom" &&
                                            "cursor-pointer bg-white",
                                        )}
                                      />
                                      <Input
                                        placeholder="Brand"
                                        value={newSystemBrand}
                                        readOnly={
                                          confirming ||
                                          implantEntryMode !== "custom"
                                        }
                                        onChange={(e) =>
                                          commitCustomImplant({
                                            manufacturer: newSystemManufacturer,
                                            brand: e.target.value,
                                            family: newSystemFamily,
                                          })
                                        }
                                        disabled={confirming}
                                        className={cn(
                                          implantEntryMode !== "custom" &&
                                            "cursor-pointer bg-white",
                                        )}
                                      />
                                      <Input
                                        placeholder="Family"
                                        value={newSystemFamily}
                                        readOnly={
                                          confirming ||
                                          implantEntryMode !== "custom"
                                        }
                                        onChange={(e) =>
                                          commitCustomImplant({
                                            manufacturer: newSystemManufacturer,
                                            brand: newSystemBrand,
                                            family: e.target.value,
                                          })
                                        }
                                        disabled={confirming}
                                        className={cn(
                                          implantEntryMode !== "custom" &&
                                            "cursor-pointer bg-white",
                                        )}
                                      />
                                    </div>
                                  </div>
                                </div>
                              )
                        }
                      />

                      <RetentionGrooveField
                        value={
                          detailCaseInfos?.retentionGroove === "deep"
                            ? "deep"
                            : "none"
                        }
                        onChange={(next) => {
                          setDetailCaseInfos({ retentionGroove: next });
                          onRetentionGrooveAccountSave?.(next);
                        }}
                        disabled={!detailFile || confirming}
                        idPrefix={retentionIdPrefix}
                        guideContentClassName="new-request-page w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] max-h-[90vh] overflow-y-auto p-6 sm:w-[1120px] sm:max-w-[1120px]"
                      />

                      <AnodizingField
                        value={
                          typeof detailCaseInfos?.anodizingEnabled === "boolean"
                            ? detailCaseInfos.anodizingEnabled
                            : defaultAnodizingEnabled
                        }
                        onChange={(next) => {
                          setDetailCaseInfos({ anodizingEnabled: next });
                          onAnodizingAccountSave?.(next);
                        }}
                        disabled={!detailFile || confirming}
                        idPrefix={`${retentionIdPrefix}-ano`}
                      />

                    </div>
                  )}

                  <DialogFooter className="mt-auto flex shrink-0 flex-col gap-2 !space-x-0 pt-2 sm:flex-row sm:items-center sm:justify-between">
                    {isLabHandoff ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => onOpenChange(false)}
                          disabled={confirming}
                        >
                          취소
                        </Button>
                        <Button
                          type="button"
                          onClick={() => {
                            if (detailIndex !== null) {
                              void onVerifyAndNext(detailIndex);
                            }
                          }}
                          disabled={!detailFile || labConfirmBlocked}
                        >
                          {confirming ? "처리 중…" : labConfirmLabel}
                        </Button>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="destructive"
                            onClick={() => {
                              if (detailIndex !== null) {
                                handleRemoveFile(detailIndex);
                              }
                              onOpenChange(false);
                            }}
                          >
                            삭제
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                          >
                            취소
                          </Button>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="relative">
                            {showTightCornerConfirmCue ? (
                              <div
                                className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-0.5 flex -translate-x-1/2 flex-col items-center gap-0.5"
                                role="status"
                              >
                                <p className="whitespace-nowrap text-xs leading-none text-rose-800">
                                  {proceedAsIsAllowed
                                    ? "확인 & 다음에서 보정 또는 그대로 진행을 고르세요."
                                    : "보정해 의뢰하시겠습니까? 확인 & 다음을 눌러 주세요."}
                                </p>
                                <ArrowDown
                                  className="h-4 w-4 shrink-0 animate-bounce text-rose-600"
                                  aria-hidden
                                />
                              </div>
                            ) : null}
                            <Button
                              type="button"
                              className={cn(
                                highlightConfirmButton &&
                                  (showTightCornerConfirmCue
                                    ? "animate-pulse bg-primary text-white ring-2 ring-rose-400 ring-offset-2 ring-offset-background"
                                    : "animate-bounce bg-primary text-white"),
                              )}
                              disabled={machiningCheckPending}
                              onClick={handleConfirmAndNext}
                            >
                              {machiningCheckPending ? "검사 중…" : "확인 & 다음"}
                            </Button>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            className="text-slate-500"
                            onClick={onSkip}
                            disabled={!files.length}
                          >
                            건너뛰기
                          </Button>
                        </div>
                      </>
                    )}
                  </DialogFooter>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={correctedDownloadOpen}
        onOpenChange={(open) => {
          if (!correctedDownloading) setCorrectedDownloadOpen(open);
        }}
      >
        <AlertDialogContent
          className="new-request-page z-[330] gap-5 sm:max-w-lg"
          overlayClassName="z-[325]"
        >
          <AlertDialogHeader className="space-y-3">
            <AlertDialogTitle>
              {proceedAsIsAllowed
                ? "이대로 의뢰하시겠습니까?"
                : "보정 디자인으로 의뢰하시겠습니까?"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {proceedAsIsAllowed ? (
                  <>
                    평균 코너 반경이 0.50mm 이상입니다.
                    <br />
                    그대로 진행하면 마진 근처에 과삭제 구간이 생길 수 있습니다.
                    <br />
                    보정하면 보철 내면을 다시 만드셔야 합니다.
                  </>
                ) : (
                  <>
                    공구에 맞게 디자인을 바꿔 보정 STL을 드립니다.
                    <br />
                    진행하시면{" "}
                    <strong className="font-semibold text-red-600">
                      보철 내면을 다시
                    </strong>{" "}
                    만드셔야 합니다.
                  </>
                )}
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={correctedDownloading}>취소</AlertDialogCancel>
            {proceedAsIsAllowed ? (
              <Button
                type="button"
                variant="outline"
                disabled={correctedDownloading}
                onClick={() => {
                  void handleProceedAsIs();
                }}
              >
                그대로 진행
              </Button>
            ) : null}
            <AlertDialogAction
              disabled={correctedDownloading}
              onClick={(event) => {
                event.preventDefault();
                void handleCorrectedProceed();
              }}
            >
              {correctedDownloading
                ? "만드는 중…"
                : proceedAsIsAllowed
                  ? "보정해서 의뢰"
                  : "확인"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </>
  );
}

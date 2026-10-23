// change-log:
// - 2026-10-22: STL 프리뷰 — 단일 뷰포트 + 하단 가공 도크(fillet R·경고). 스캔색 토글 숨김.
// - 2026-10-22: 카탈로그 제조사 선택 — 없는 setNewSystemFamily 호출이 선택을 막던 것 제거.
// - 2026-10-22: 좁은 코너는 표시와 경고만. 원본 STL은 고치지 않고 내려받지 않는다.
// - 2026-10-21: 보정 확인 모달은 평균 R과 관계없이 같은 문구·확인만.
// - 2026-10-21: 보정 확인 — 접착 공간이 커져 헐거워질 수 있음. 원하면 보정 STL로 크라운 내면.
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
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { CircleHelp } from "lucide-react";
import { StlPreviewViewer } from "@/features/requests/components/StlPreviewViewer";
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
import { RequestScrewSupplySection } from "@/shared/components/practice/ScrewSupplyField";
import {
  screwManufacturerLabel,
  type ScrewSupply,
} from "@/shared/practice/screwSupply";
import {
  StlMachiningPreflightNotice,
  type StlMachiningPreflight,
} from "@/features/requests/components/StlMachiningPreflightNotice";
import {
  NEW_IMPLANT_DEVELOPMENT_ENTRY_HINT_MESSAGES,
  NEW_IMPLANT_DEVELOPMENT_REQUEST_MESSAGE,
} from "@/shared/practice/newImplantQuickPresets";
import { ImplantCustomNameSuggestInput } from "@/shared/components/practice/ImplantCustomNameSuggestInput";

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
  /** 기공소-치과 스크류 기본값. 치과명이 바뀌면 그 쌍의 기본으로 맞춘다. */
  resolveDefaultScrewSupply?: (clinicName: string) => ScrewSupply;
  /** false면 기본값을 아직 모르므로 빈 값을 어벗츠로 확정하지 않는다 */
  screwPreferenceReady?: boolean;
  /** 스크류를 바꾸면 기공소-치과 기본값으로 저장 */
  onScrewSupplySave?: (value: ScrewSupply, clinicName: string) => void;
  screwSupplySaving?: boolean;
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
  toast: _toast,
  onRetentionGrooveAccountSave,
  defaultAnodizingEnabled = true,
  onAnodizingAccountSave,
  resolveDefaultScrewSupply,
  screwPreferenceReady = true,
  onScrewSupplySave,
  screwSupplySaving = false,
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
  const [implantEntryMode, setImplantEntryMode] =
    useState<ImplantEntryMode>("catalog");

  const selectCatalogMode = useCallback(() => {
    setImplantEntryMode("catalog");
    setNewSystemManufacturer("");
    setNewSystemBrand("");
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
    (next: { manufacturer: string; brand: string }) => {
      setNewSystemManufacturer(next.manufacturer);
      setNewSystemBrand(next.brand);
      const manufacturer = next.manufacturer.trim();
      const brand = next.brand.trim();
      const engaged = Boolean(manufacturer || brand);
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
              requested: Boolean(manufacturer && brand),
              manufacturer,
              brand,
              family: "",
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

  const screwTouchedRef = useRef(false);
  const screwPinnedRef = useRef(false);
  const screwClinicRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      screwTouchedRef.current = false;
      screwPinnedRef.current = false;
      screwClinicRef.current = null;
      return;
    }
    if (!resolveDefaultScrewSupply) return;
    const clinic = String(detailCaseInfos?.clinicName || "").trim();
    const prevClinic = screwClinicRef.current;
    const first = prevClinic === null;
    if (!first && prevClinic !== clinic) {
      if (screwTouchedRef.current && !prevClinic && clinic) {
        const current: ScrewSupply =
          detailCaseInfos?.screwSupply === "manufacturer" ? "manufacturer" : "abuts";
        onScrewSupplySave?.(current, clinic);
        screwClinicRef.current = clinic;
        screwPinnedRef.current = true;
        return;
      }
      screwTouchedRef.current = false;
      screwPinnedRef.current = false;
    }
    screwClinicRef.current = clinic;
    if (first && (detailCaseInfos?.screwSupply === "abuts" || detailCaseInfos?.screwSupply === "manufacturer")) {
      screwPinnedRef.current = true;
      return;
    }
    if (screwTouchedRef.current || screwPinnedRef.current) return;
    if (!screwPreferenceReady) return;
    const next = resolveDefaultScrewSupply(clinic);
    if (detailCaseInfos?.screwSupply !== next) {
      setDetailCaseInfos({ screwSupply: next });
    }
  }, [
    open,
    detailCaseInfos?.clinicName,
    detailCaseInfos?.screwSupply,
    onScrewSupplySave,
    resolveDefaultScrewSupply,
    screwPreferenceReady,
    setDetailCaseInfos,
  ]);

  const screwMakerLabel = useMemo(() => {
    const custom =
      implantEntryMode === "custom"
        ? String(
            newSystemManufacturer ||
              detailCaseInfos?.newSystemRequest?.manufacturer ||
              "",
          ).trim()
        : "";
    const catalogName = String(
      detailCaseInfos?.implantManufacturer || implantManufacturer || "",
    ).trim();
    const raw = custom || catalogName;
    const display = connections.find(
      (row) =>
        String(row.manufacturer || "").trim() === raw &&
        String(row.displayManufacturer || "").trim(),
    )?.displayManufacturer;
    return screwManufacturerLabel([display || raw]);
  }, [
    connections,
    detailCaseInfos?.implantManufacturer,
    detailCaseInfos?.newSystemRequest?.manufacturer,
    implantEntryMode,
    implantManufacturer,
    newSystemManufacturer,
  ]);

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
    const hasCustom = Boolean(
      String(nsr?.manufacturer || "").trim() ||
        String(nsr?.brand || "").trim(),
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

  const highlightConfirmButton = highlightUnverifiedArrows;

  const handleConfirmAndNext = useCallback(() => {
    if (detailIndex === null) return;
    void onVerifyAndNext(detailIndex);
  }, [detailIndex, onVerifyAndNext]);
  // 치과명 목록이 열린 채로 누르면 blur가 모달을 다시 그려 click이 사라진다.
  const confirmFromPointerRef = useRef(false);
  const handleConfirmPointerDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) return;
      confirmFromPointerRef.current = true;
      handleConfirmAndNext();
    },
    [handleConfirmAndNext],
  );
  const handleConfirmClick = useCallback(() => {
    if (confirmFromPointerRef.current) {
      confirmFromPointerRef.current = false;
      return;
    }
    handleConfirmAndNext();
  }, [handleConfirmAndNext]);

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
          className="new-request-page z-[320] flex w-[calc(100vw-1rem)] max-h-[96vh] max-w-[calc(100vw-1rem)] flex-col gap-3 overflow-y-auto p-4 sm:w-[1080px] sm:max-w-[1080px] sm:p-5"
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

          <div className="grid min-h-0 flex-1 grid-cols-1 items-stretch gap-3 sm:pr-2 lg:grid-cols-[52%_48%]">
            <div className="app-glass-card app-glass-card--lg flex min-h-0 w-full flex-col gap-2.5 !p-2.5">
              <div className="flex shrink-0 items-center justify-between gap-2 px-0.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  3D 미리보기
                </span>
                {detailFile ? (
                  <span
                    className="min-w-0 truncate text-xs text-slate-500"
                    title={detailFile.name}
                  >
                    {detailFile.name}
                  </span>
                ) : null}
              </div>

              <div className="app-glass-card-content flex min-h-[280px] min-w-0 flex-1 flex-col gap-2">
                <div
                  className={cn(
                    "relative min-h-[min(52vh,26rem)] min-w-0 flex-1 overflow-hidden rounded-xl",
                    "border border-slate-200/90 bg-[radial-gradient(ellipse_at_50%_35%,#f8fafc_0%,#e2e8f0_100%)]",
                    "shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]",
                  )}
                >
                  {detailFile ? (
                    <StlPreviewViewer
                      file={detailFile}
                      showOverlay={false}
                      showGrid={false}
                      showColorMappingToggle={false}
                      showFilletStatsOverlay={false}
                      showTightCorner={Boolean(machiningPreflight?.overlay)}
                      correctionSolidVisible={Boolean(machiningPreflight?.overlay)}
                      metadata={
                        machiningPreflight?.overlay
                          ? {
                              tightCorner: {
                                ...machiningPreflight.overlay,
                                correctionSolid: null,
                                reliefOverlay: null,
                              },
                            }
                          : undefined
                      }
                      className="absolute inset-0 h-full w-full min-h-0 md:min-h-0"
                      onDiameterComputed={handleDiameterComputed}
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
                      <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
                        Preview
                      </span>
                      <span>3D 파일을 선택하세요</span>
                    </div>
                  )}
                </div>

                {machiningPreflight ? (
                  <StlMachiningPreflightNotice
                    preflight={machiningPreflight}
                    className="shrink-0"
                  />
                ) : null}
              </div>

              {selectablePreviewIndices.length > 1 ? (
                <div className="shrink-0 rounded-xl border border-slate-200/90 bg-slate-50/60 p-1">
                  <ul className="max-h-[7.5rem] overflow-y-auto px-1 py-1">
                    {selectablePreviewIndices.map((fileIndex) => {
                      const file = files[fileIndex];
                      if (!file) return null;
                      const selected = activePreviewIndex === fileIndex;
                      return (
                        <li key={`${file.name}:${file.size}:${fileIndex}`}>
                          <button
                            type="button"
                            className={cn(
                              "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors",
                              selected
                                ? "bg-white font-medium text-primary shadow-sm ring-1 ring-primary/20"
                                : "text-slate-600 hover:bg-white/80",
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
                                <div className="overflow-visible rounded-lg border border-primary-soft bg-white/80">
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
                                        "relative z-[2] grid grid-cols-1 gap-2 sm:grid-cols-2",
                                        implantEntryMode !== "custom" &&
                                          "pointer-events-none",
                                      )}
                                    >
                                      <ImplantCustomNameSuggestInput
                                        field="manufacturer"
                                        placeholder="Manufacturer"
                                        value={newSystemManufacturer}
                                        readOnly={
                                          confirming ||
                                          implantEntryMode !== "custom"
                                        }
                                        disabled={confirming}
                                        className={cn(
                                          implantEntryMode !== "custom" &&
                                            "cursor-pointer bg-white",
                                        )}
                                        onChange={(manufacturer) =>
                                          commitCustomImplant({
                                            manufacturer,
                                            brand: newSystemBrand,
                                          })
                                        }
                                        onPickSuggestion={(row) => {
                                          if (!row.brand) return;
                                          commitCustomImplant({
                                            manufacturer:
                                              row.manufacturer || newSystemManufacturer,
                                            brand: row.brand,
                                          });
                                        }}
                                      />
                                      <ImplantCustomNameSuggestInput
                                        field="brand"
                                        placeholder="Brand"
                                        value={newSystemBrand}
                                        manufacturerContext={newSystemManufacturer}
                                        readOnly={
                                          confirming ||
                                          implantEntryMode !== "custom"
                                        }
                                        disabled={confirming}
                                        className={cn(
                                          implantEntryMode !== "custom" &&
                                            "cursor-pointer bg-white",
                                        )}
                                        onChange={(brand) =>
                                          commitCustomImplant({
                                            manufacturer: newSystemManufacturer,
                                            brand,
                                          })
                                        }
                                        onPickSuggestion={(row) => {
                                          if (
                                            row.manufacturer &&
                                            !newSystemManufacturer.trim()
                                          ) {
                                            commitCustomImplant({
                                              manufacturer: row.manufacturer,
                                              brand: row.brand || newSystemBrand,
                                            });
                                          }
                                        }}
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

                      <RequestScrewSupplySection
                        value={
                          detailCaseInfos?.screwSupply === "manufacturer"
                            ? "manufacturer"
                            : "abuts"
                        }
                        manufacturerLabel={screwMakerLabel}
                        disabled={!detailFile || confirming || screwSupplySaving}
                        idPrefix={`${retentionIdPrefix}-screw`}
                        onChange={(next) => {
                          screwTouchedRef.current = true;
                          screwPinnedRef.current = true;
                          setDetailCaseInfos({ screwSupply: next });
                          onScrewSupplySave?.(
                            next,
                            String(detailCaseInfos?.clinicName || "").trim(),
                          );
                        }}
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
                          <Button
                            type="button"
                            className={cn(
                              highlightConfirmButton &&
                                "animate-bounce bg-primary text-white",
                            )}
                            onPointerDown={handleConfirmPointerDown}
                            onClick={handleConfirmClick}
                          >
                            확인 & 다음
                          </Button>
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
    </>
  );
}

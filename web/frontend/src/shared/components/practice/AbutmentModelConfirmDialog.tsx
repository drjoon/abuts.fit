// change-log:
// - 2026-10-25: 포스트 3mm 이하 유지홈 창은 3D 확인 모달 포커스에 바로 닫히지 않게 연다.
// - 2026-10-24: 3D 확인 모달은 내용 높이에 맞추고 세로 스크롤을 두지 않는다.
// - 2026-10-24: 3D 확인 모달 — 미리보기·입력·하단 버튼을 나눠 읽기 쉽게.
// - 2026-10-24: 스크류 선택 UI 제거. 타입은 연결 규격의 A–E를 그대로 쓴다.
// - 2026-10-24: 유지홈·아노다이징은 한 줄 버튼. 포스트 3mm 이하만 사진 모달(기본 있음).
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
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { CircleHelp, Droplets, Rows3 } from "lucide-react";
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
import { CaseOptionPopoverButton } from "@/shared/components/practice/CaseOptionPopoverButton";
import { ShortPostRetentionDialog } from "@/shared/components/practice/ShortPostRetentionDialog";
import {
  isShortPostLength,
  measuredPostLengthMm,
  type ShortPostRetentionChoice,
} from "@/pages/requestor/new_request/utils/shortPostRetention";
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

function ImplantEntryCard({
  selected,
  disabled,
  title,
  titleExtra,
  onSelect,
  children,
}: {
  selected: boolean;
  disabled: boolean;
  title: string;
  titleExtra?: ReactNode;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={selected || disabled ? -1 : 0}
      aria-pressed={selected}
      className={cn(
        "rounded-xl border px-3 py-2.5 text-left transition-colors",
        selected
          ? "border-primary/40 bg-white shadow-sm"
          : "cursor-pointer border-slate-200 bg-white hover:border-slate-300",
        disabled && "cursor-default",
      )}
      onPointerDownCapture={() => {
        if (disabled || selected) return;
        onSelect();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        if (disabled || selected) return;
        event.preventDefault();
        onSelect();
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
              selected ? "border-primary bg-primary" : "border-slate-300 bg-white",
            )}
            aria-hidden
          >
            {selected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
          </span>
            <span
            className={cn(
              "min-w-0 text-sm font-semibold leading-snug",
              selected ? "text-slate-900" : "text-slate-600",
            )}
          >
            {title}
          </span>
          {titleExtra}
        </div>
        {selected ? (
          <span className="shrink-0 text-xs font-medium text-primary">선택됨</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

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
  /** 이 파일에서 짧은 포스트 유지홈을 이미 골랐으면 그 값 */
  shortPostRetentionChoice?: ShortPostRetentionChoice | null;
  /** 짧은 포스트 유지홈 선택. 현재 파일에만 저장한다. */
  onShortPostRetentionChoice?: (value: ShortPostRetentionChoice) => void;
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
  shortPostRetentionChoice = null,
  onShortPostRetentionChoice,
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
  const [shortPostChoiceOpen, setShortPostChoiceOpen] = useState(false);
  const [shortPostPromptGeneration, setShortPostPromptGeneration] = useState(0);
  const shortPostPromptedRef = useRef(new Set<string>());
  const shortPostPrematureCountRef = useRef(0);

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

  const detailFileKey = detailFile
    ? `${detailFile.name.normalize("NFC")}:${detailFile.size}`
    : "";
  const postLengthMm = measuredPostLengthMm(machiningPreflight);
  const shortPost =
    !isLabHandoff &&
    !isDesignCustomMode &&
    isShortPostLength(postLengthMm);
  const needsShortPostChoice = shortPost && !shortPostRetentionChoice;
  const retentionValue: ShortPostRetentionChoice =
    detailCaseInfos?.retentionGroove === "deep" ? "deep" : "none";
  const anodizingOn =
    typeof detailCaseInfos?.anodizingEnabled === "boolean"
      ? detailCaseInfos.anodizingEnabled
      : defaultAnodizingEnabled;

  useEffect(() => {
    if (!open) return;
    const stored = String(detailCaseInfos?.retentionGroove || "").trim();
    if (stored === "none" || stored === "shallow" || stored === "deep") return;
    setDetailCaseInfos({ retentionGroove: shortPost ? "deep" : "none" });
  }, [
    detailCaseInfos?.retentionGroove,
    open,
    setDetailCaseInfos,
    shortPost,
  ]);

  const prevDetailFileKeyRef = useRef(detailFileKey);
  useEffect(() => {
    if (!open) {
      shortPostPrematureCountRef.current = 0;
      setShortPostChoiceOpen(false);
      return;
    }
    const keyChanged = prevDetailFileKeyRef.current !== detailFileKey;
    if (keyChanged) {
      prevDetailFileKeyRef.current = detailFileKey;
      shortPostPrematureCountRef.current = 0;
    }
    if (!needsShortPostChoice || !detailFileKey) {
      if (keyChanged) setShortPostChoiceOpen(false);
      return;
    }
    if (shortPostChoiceOpen) return;
    if (shortPostPromptedRef.current.has(detailFileKey)) return;
    if (shortPostPrematureCountRef.current >= 3) return;
    const timer = window.setTimeout(() => setShortPostChoiceOpen(true), 0);
    return () => window.clearTimeout(timer);
  }, [
    detailFileKey,
    needsShortPostChoice,
    open,
    shortPostChoiceOpen,
    shortPostPromptGeneration,
  ]);

  const highlightConfirmButton = highlightUnverifiedArrows;

  const handleConfirmAndNext = useCallback(() => {
    if (detailIndex === null) return;
    void onVerifyAndNext(detailIndex);
  }, [detailIndex, onVerifyAndNext]);

  const handleSkip = useCallback(() => {
    onSkip();
  }, [onSkip]);

  const applyShortPostChoice = useCallback(
    (value: ShortPostRetentionChoice) => {
      if (detailFileKey) shortPostPromptedRef.current.add(detailFileKey);
      onShortPostRetentionChoice?.(value);
      setShortPostChoiceOpen(false);
    },
    [detailFileKey, onShortPostRetentionChoice],
  );
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
          if (!next && shortPostChoiceOpen) return;
          onOpenChange(next);
        }}
      >
        <DialogContent
          // Above floating transfer panel (z-300). Same band as ModelPreviewDialog.
          className="new-request-page z-[320] flex w-[min(1080px,calc(100vw-2rem))] max-w-[min(1080px,calc(100vw-2rem))] flex-col gap-0 overflow-hidden p-0 sm:w-[min(1080px,calc(100vw-2rem))] sm:max-w-[min(1080px,calc(100vw-2rem))]"
          overlayClassName="z-[310]"
          onFocusOutside={(event) => {
            if (shortPostChoiceOpen) event.preventDefault();
          }}
          onInteractOutside={(event) => {
            if (shortPostChoiceOpen) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (shortPostChoiceOpen) event.preventDefault();
          }}
        >
          <DialogHeader className="shrink-0 space-y-0 border-b border-slate-200 px-5 py-3 pr-12 text-left">
            <div className="flex items-center gap-2.5">
              <DialogTitle className="text-lg font-semibold tracking-tight">
                3D 모델 확인 및 정보 입력
              </DialogTitle>
              {labProgressLabel ? (
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium tabular-nums text-slate-600">
                  {labProgressLabel}
                </span>
              ) : null}
            </div>
            <DialogDescription className="sr-only">
              {isLabHandoff
                ? "3D 모델을 확인하고 환자/임플란트 정보를 입력한 뒤 확인합니다. 파일은 모달이 열린 동안 미리 업로드됩니다."
                : "3D 모델을 확인하고 환자/임플란트 정보를 입력한 뒤 다음 케이스로 이동합니다."}
            </DialogDescription>
          </DialogHeader>

          {uploadPercent != null ? (
            <div
              className="shrink-0 border-b border-slate-200 bg-slate-50 px-5 py-3"
              role="status"
              aria-live="polite"
            >
              <div className="mb-1.5 flex items-center justify-between gap-2 text-sm text-muted-foreground">
                <span className="truncate font-medium text-foreground">
                  {uploadLabel || "파일 업로드 중…"}
                </span>
                <span className="shrink-0 tabular-nums">{uploadPercent}%</span>
              </div>
              <Progress value={uploadPercent} className="h-1.5" />
            </div>
          ) : null}

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.08fr)_minmax(24rem,0.92fr)]">
            <div className="flex flex-col gap-2.5 border-slate-200 p-3 lg:border-r lg:p-4">
              <div className="shrink-0 px-0.5">
                <p className="text-sm font-semibold text-slate-900">3D 미리보기</p>
                {detailFile ? (
                  <p
                    className="mt-0.5 truncate text-xs text-slate-500"
                    title={detailFile.name}
                  >
                    {detailFile.name}
                  </p>
                ) : null}
              </div>

              <div className="flex min-h-[16rem] min-w-0 flex-1 flex-col gap-2.5">
                <div
                  className={cn(
                    "relative min-h-[16rem] min-w-0 flex-1 overflow-hidden rounded-2xl",
                    "border border-slate-200 bg-[radial-gradient(ellipse_at_50%_32%,#ffffff_0%,#e8eef5_100%)]",
                    "shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]",
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
                <div className="shrink-0 rounded-xl border border-slate-200 bg-white p-1.5">
                  <ul className="px-1 py-1">
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

            <div className="flex flex-col gap-3 bg-slate-50/90 p-3 lg:p-4">
                  {isDesignCustomMode ? (
                    <div className="flex min-h-[28rem] flex-1 flex-col">
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
                    <div className="flex flex-col gap-3">
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
                                <div className="flex flex-col gap-2.5">
                                  <ImplantEntryCard
                                    selected={implantEntryMode === "catalog"}
                                    disabled={confirming || !detailFile}
                                    title="카탈로그에서 선택"
                                    onSelect={selectCatalogMode}
                                  >
                                    {catalogSelects}
                                  </ImplantEntryCard>
                                  <ImplantEntryCard
                                    selected={implantEntryMode === "custom"}
                                    disabled={confirming || !detailFile}
                                    title="찾으시는 임플란트가 없나요?"
                                    onSelect={selectCustomMode}
                                    titleExtra={
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <button
                                            type="button"
                                            className="inline-flex text-slate-400 transition-colors hover:text-slate-700"
                                            aria-label="신규 임플란트 개발 안내"
                                            onPointerDown={(event) =>
                                              event.stopPropagation()
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
                                    }
                                  >
                                    <div
                                      className={cn(
                                        "grid grid-cols-1 gap-3 sm:grid-cols-2",
                                        implantEntryMode !== "custom" &&
                                          "pointer-events-none",
                                      )}
                                    >
                                      <label className="flex min-w-0 flex-col gap-1.5">
                                        <span className="px-0.5 text-xs font-medium text-slate-500">
                                          제조사
                                        </span>
                                        <ImplantCustomNameSuggestInput
                                          field="manufacturer"
                                          placeholder="제조사"
                                          value={newSystemManufacturer}
                                          readOnly={
                                            confirming ||
                                            implantEntryMode !== "custom"
                                          }
                                          disabled={confirming}
                                          className={cn(
                                            "h-10 text-sm",
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
                                                row.manufacturer ||
                                                newSystemManufacturer,
                                              brand: row.brand,
                                            });
                                          }}
                                        />
                                      </label>
                                      <label className="flex min-w-0 flex-col gap-1.5">
                                        <span className="px-0.5 text-xs font-medium text-slate-500">
                                          브랜드
                                        </span>
                                        <ImplantCustomNameSuggestInput
                                          field="brand"
                                          placeholder="브랜드"
                                          value={newSystemBrand}
                                          manufacturerContext={newSystemManufacturer}
                                          readOnly={
                                            confirming ||
                                            implantEntryMode !== "custom"
                                          }
                                          disabled={confirming}
                                          className={cn(
                                            "h-10 text-sm",
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
                                      </label>
                                    </div>
                                  </ImplantEntryCard>
                                </div>
                              )
                        }
                      />

                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          className={cn(
                            "h-10 justify-start gap-2 bg-white px-3 shadow-none",
                            retentionValue === "deep" &&
                              "border-primary/30 bg-primary-soft text-slate-900",
                          )}
                          disabled={!detailFile || confirming}
                          onClick={() => setShortPostChoiceOpen(true)}
                        >
                          <Rows3 className="h-4 w-4 shrink-0" />
                          {retentionValue === "deep" ? "유지홈 있음" : "유지홈 없음"}
                        </Button>
                        <CaseOptionPopoverButton
                          icon={
                            <Droplets
                              className={cn(
                                "h-4 w-4 shrink-0",
                                anodizingOn ? "text-sky-600" : "text-slate-400",
                              )}
                            />
                          }
                          label={anodizingOn ? "아노다이징 On" : "아노다이징 Off"}
                          value={anodizingOn ? "on" : "off"}
                          options={[
                            { value: "on", label: "아노다이징 On" },
                            { value: "off", label: "아노다이징 Off" },
                          ]}
                          disabled={!detailFile || confirming}
                          className={cn(
                            "h-10 w-full justify-start bg-white shadow-none",
                            anodizingOn && "border-sky-200 bg-sky-50 text-slate-900",
                          )}
                          onChange={(next) => {
                            const enabled = next === "on";
                            setDetailCaseInfos({ anodizingEnabled: enabled });
                            onAnodizingAccountSave?.(enabled);
                          }}
                        />
                      </div>

                    </div>
                  )}
            </div>
          </div>

          <DialogFooter className="shrink-0 flex-col gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:space-x-0 sm:px-5">
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
                        <div className="flex w-full items-center gap-2 sm:w-auto">
                          <Button
                            type="button"
                            variant="outline"
                            className="border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
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

                        <div className="flex w-full items-center gap-2 sm:w-auto">
                          <Button
                            type="button"
                            variant="ghost"
                            className="text-slate-500"
                            onClick={handleSkip}
                            disabled={!files.length}
                          >
                            건너뛰기
                          </Button>
                          <Button
                            type="button"
                            className={cn(
                              "min-w-[8.5rem] flex-1 sm:flex-none",
                              highlightConfirmButton &&
                                "animate-bounce bg-primary text-white",
                            )}
                            onPointerDown={handleConfirmPointerDown}
                            onClick={handleConfirmClick}
                          >
                            확인 & 다음
                          </Button>
                        </div>
                      </>
                    )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ShortPostRetentionDialog
        open={shortPostChoiceOpen}
        onOpenChange={setShortPostChoiceOpen}
        postLengthMm={postLengthMm}
        value={shortPostRetentionChoice ?? (shortPost ? "deep" : retentionValue)}
        onConfirm={applyShortPostChoice}
        onPrematureClose={() => {
          shortPostPrematureCountRef.current += 1;
          if (detailFileKey && shortPostPrematureCountRef.current >= 3) {
            shortPostPromptedRef.current.add(detailFileKey);
          }
          setShortPostPromptGeneration((generation) => generation + 1);
        }}
      />
    </>
  );
}

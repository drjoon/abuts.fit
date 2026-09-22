/**
 * 커스텀어벗(어벗·스캔바디) 규격 설정 모달 — 신규의뢰 intake · 제작 변경 follow-up 공용.
 * related files:
 * - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
 * - web/frontend/src/shared/components/practice/PracticeProsthesisFollowUpDialog.tsx
 * - web/frontend/src/shared/components/practice/PracticeCustomSpecsPresetEditDialog.tsx
 * change-log:
 * - 2026-09-22: intake 인라인 모달을 분리. follow-up·intake 공통 사용.
 */
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PracticeCustomSpecsPresetEditDialog } from "@/shared/components/practice/PracticeCustomSpecsPresetEditDialog";
import { PracticeToothCompanySpecFields } from "@/shared/components/practice/PracticeToothCompanySpecFields";
import { PracticeToothImplantChipFields } from "@/shared/components/practice/PracticeToothImplantChipFields";
import { PracticeToothSimpleAbutmentFields } from "@/shared/components/practice/PracticeToothSimpleAbutmentFields";
import {
  isCustomAbutGuideTourStepId,
  PracticeToothWorkGuideTourBanner,
} from "@/shared/components/practice/PracticeToothWorkGuideTourBanner";
import { CUSTOM_ABUT_GUIDE_TARGETS } from "@/shared/guideTour/scrollGuideTourTarget";
import {
  GUIDE_TOUR_DEMO_ABUTMENT_FAVORITES,
  GUIDE_TOUR_DEMO_IMPLANT_FAVORITES,
} from "@/shared/guideTour/guideTourOralPrefill";
import { armPointerClickThroughGuard } from "@/shared/dom/armPointerClickThroughGuard";
import { mergeCncImplantSpecs } from "@/shared/practice/cncImplantCatalog";
import { implantFavoriteDisplayParts } from "@/shared/practice/implantDisplay";
import {
  detectAbutmentModalSide,
  detectScanbodyModalSide,
  readAbutmentSideDraft,
  resolveAbutmentSidePatch,
  syncActiveAbutmentSideDraft,
  type AbutmentSideDraft,
  type AbutmentSideKey,
} from "@/shared/practice/practiceAbutmentSideDraft";
import {
  applyCustomSpecsLastDefaults,
  rememberCustomSpecsLastDefaults,
} from "@/shared/practice/practiceCustomSpecsLastDefaults";
import {
  ABUTMENT_PRODUCT_MODE,
  ABUTMENT_PRODUCT_MODE_LABEL,
  CUSTOM_ABUTMENT_SELECTION,
  clearSimpleAbutmentIfCustomProsthesis,
  emptyToothWorkAbutment,
  emptyToothWorkCustomSpecs,
  hasToothWorkImplantPreset,
  isAbutmentProductMode,
  isCustomAbutmentSelection,
  isSimpleAbutmentMode,
  isSimpleHealingKind,
  pickToothWorkCustomSpecs,
  resolveCustomAbutmentSelection,
  resolveToothAbutmentProductMode,
  SIMPLE_HEALING_LABEL,
  type AbutmentProductMode,
  type CustomAbutmentSelection,
  type PracticeAbutmentFavorite,
  type PracticeImplantFavorite,
  type SimpleSpecOptionCatalog,
  type ToothWorkSelection,
  isCustomAbutmentProsthesisType,
} from "@/shared/practice/transferMemo";
import type { ImplantConnection } from "@/shared/practice/useImplantConnectionCatalog";
import { cn } from "@/shared/ui/cn";

export type CustomAbutmentSpecsWizardStep = "implant" | "abutment";

export type PracticeCustomAbutmentSpecsDialogProps = {
  open: boolean;
  /** false로 닫힐 때 — 확인이면 confirm 이미 처리됨. 그 외는 취소로 취급. */
  onOpenChange: (open: boolean) => void;
  toothWork: ToothWorkSelection | null;
  /** 오픈 시 고정된 어벗|스캔바디 (라디오 pointerdown lock) */
  selectionLock?: CustomAbutmentSelection | null;
  onPatchSpecs: (
    patch: Partial<ReturnType<typeof emptyToothWorkCustomSpecs>>,
  ) => void;
  /** 확인 — 부모는 스냅샷 폐기·모달 닫기 */
  onConfirm: () => void;
  /** 취소 — 부모는 스냅샷 복원·모달 닫기 */
  onCancel: () => void;
  /** 모드 전환(생산만 ↔ 디자인+생산) — 잠금 아닐 때 */
  onAbutmentProductModeChange?: (mode: AbutmentProductMode) => void;
  lockedAbutmentProductMode?: AbutmentProductMode | null;
  alternateAbutmentModePageLabel?: string;
  onAlternateAbutmentModeNavigate?: () => void;
  implantConnections: ImplantConnection[];
  implantFavorites: PracticeImplantFavorite[];
  onImplantFavoritesChange?: (
    next: PracticeImplantFavorite[],
  ) => void | Promise<void>;
  abutmentFavorites: PracticeAbutmentFavorite[];
  onAbutmentFavoritesChange?: (
    next: PracticeAbutmentFavorite[],
  ) => void | Promise<void>;
  directAbutmentFavorites?: PracticeAbutmentFavorite[];
  onDirectAbutmentFavoritesChange?: (
    next: PracticeAbutmentFavorite[],
  ) => void | Promise<void>;
  simpleAbutmentOptions?: SimpleSpecOptionCatalog | null;
  onSimpleAbutmentOptionsChange?: (
    next: SimpleSpecOptionCatalog,
  ) => void | Promise<void>;
  simpleHealingOptions?: SimpleSpecOptionCatalog | null;
  onSimpleHealingOptionsChange?: (
    next: SimpleSpecOptionCatalog,
  ) => void | Promise<void>;
  onPresetEditorOpen?: () => void;
  className?: string;
  overlayClassName?: string;
  /** 가이드 투어(intake 전용) */
  guideTourStepId?: string | null;
  guideTourStep?: number | null;
  showGuideTourBanner?: boolean;
  guideTourTargetId?: string | null;
  onGuideTourExit?: () => void;
  onGuideTourComplete?: () => void;
};

/** 모달 오픈 시 치아 행 준비(CA on · 선택 · last defaults). */
export function prepareCustomAbutmentSpecsOpenRow(
  row: ToothWorkSelection,
  options: {
    selection?: CustomAbutmentSelection | null;
    lockedMode?: AbutmentProductMode | null;
    defaultAbutmentProductMode: AbutmentProductMode;
    tourSimpleDefault?: Partial<
      ReturnType<typeof emptyToothWorkAbutment>
    > | null;
  },
): { row: ToothWorkSelection; selection: CustomAbutmentSelection } {
  const requestedSelection = isCustomAbutmentSelection(options.selection)
    ? options.selection
    : null;
  const cleared = clearSimpleAbutmentIfCustomProsthesis(row);
  const nextSelection =
    requestedSelection ||
    resolveCustomAbutmentSelection({ ...cleared, customAbutment: true }) ||
    CUSTOM_ABUTMENT_SELECTION.ABUTMENT;
  const nextMode = options.lockedMode
    ? options.lockedMode
    : isAbutmentProductMode(cleared.abutmentProductMode)
      ? cleared.abutmentProductMode
      : options.defaultAbutmentProductMode;
  const prevSelection = resolveCustomAbutmentSelection(cleared);
  const selectionChanged =
    Boolean(requestedSelection) &&
    prevSelection != null &&
    prevSelection !== nextSelection;
  const specsBase = selectionChanged
    ? { ...cleared, ...emptyToothWorkAbutment() }
    : cleared;
  const withTourDefault = options.tourSimpleDefault
    ? { ...specsBase, ...options.tourSimpleDefault }
    : specsBase;
  const withLastDefaults = options.tourSimpleDefault
    ? withTourDefault
    : applyCustomSpecsLastDefaults(withTourDefault, nextSelection);
  return {
    selection: nextSelection,
    row: {
      ...withLastDefaults,
      customAbutment: true,
      customAbutmentSelection: nextSelection,
      abutmentProductMode: nextMode,
    },
  };
}

export function PracticeCustomAbutmentSpecsDialog({
  open,
  onOpenChange,
  toothWork,
  selectionLock = null,
  onPatchSpecs,
  onConfirm,
  onCancel,
  onAbutmentProductModeChange,
  lockedAbutmentProductMode = null,
  alternateAbutmentModePageLabel = "기공소에",
  onAlternateAbutmentModeNavigate,
  implantConnections,
  implantFavorites,
  onImplantFavoritesChange,
  abutmentFavorites,
  onAbutmentFavoritesChange,
  directAbutmentFavorites = [],
  onDirectAbutmentFavoritesChange,
  simpleAbutmentOptions = null,
  onSimpleAbutmentOptionsChange,
  simpleHealingOptions = null,
  onSimpleHealingOptionsChange,
  onPresetEditorOpen,
  className,
  overlayClassName,
  guideTourStepId = null,
  guideTourStep = null,
  showGuideTourBanner = false,
  guideTourTargetId = null,
  onGuideTourExit,
  onGuideTourComplete,
}: PracticeCustomAbutmentSpecsDialogProps) {
  const lockedMode = isAbutmentProductMode(lockedAbutmentProductMode)
    ? lockedAbutmentProductMode
    : null;
  const [wizardStep, setWizardStep] =
    useState<CustomAbutmentSpecsWizardStep>("implant");
  const [presetEditOpen, setPresetEditOpen] = useState(false);
  const presetEditOpenRef = useRef(false);
  const [abutmentSideDraftTick, setAbutmentSideDraftTick] = useState(0);
  const dismissKindRef = useRef<"confirm" | "cancel" | null>(null);

  const isPresetGuideTourStep = isCustomAbutGuideTourStepId(guideTourStepId);
  const modalImplantFavorites = isPresetGuideTourStep
    ? GUIDE_TOUR_DEMO_IMPLANT_FAVORITES
    : implantFavorites;
  const modalAbutmentFavorites = isPresetGuideTourStep
    ? GUIDE_TOUR_DEMO_ABUTMENT_FAVORITES
    : abutmentFavorites;

  useEffect(() => {
    if (!open) return;
    setWizardStep("implant");
    presetEditOpenRef.current = false;
    setPresetEditOpen(false);
    dismissKindRef.current = null;
  }, [open]);

  useEffect(() => {
    if (!open || !toothWork) return;
    const selection =
      selectionLock ||
      resolveCustomAbutmentSelection(toothWork) ||
      CUSTOM_ABUTMENT_SELECTION.ABUTMENT;
    syncActiveAbutmentSideDraft({
      toothNumber: toothWork.toothNumber,
      specs: {
        abutmentManufacturer: String(toothWork.abutmentManufacturer || "").trim(),
        abutmentDiameter: String(toothWork.abutmentDiameter || "").trim(),
        abutmentHeight: String(toothWork.abutmentHeight || "").trim(),
      },
      abutmentModal: selection === CUSTOM_ABUTMENT_SELECTION.ABUTMENT,
    });
    setAbutmentSideDraftTick((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open-only sync
  }, [open]);

  const setPresetEditOpenSafe = (next: boolean) => {
    presetEditOpenRef.current = next;
    setPresetEditOpen(next);
    if (next) onPresetEditorOpen?.();
  };

  const applySpecsPatch = (
    patch: Partial<ReturnType<typeof emptyToothWorkCustomSpecs>>,
  ) => {
    onPatchSpecs(patch);
  };

  const patchAbutmentSide = (
    patch: AbutmentSideDraft,
    targetSide: AbutmentSideKey,
  ) => {
    if (!toothWork) return;
    const current = {
      abutmentManufacturer: String(toothWork.abutmentManufacturer || "").trim(),
      abutmentDiameter: String(toothWork.abutmentDiameter || "").trim(),
      abutmentHeight: String(toothWork.abutmentHeight || "").trim(),
    };
    const detectSide =
      targetSide === "simpleAbutment" || targetSide === "directInput"
        ? detectAbutmentModalSide
        : detectScanbodyModalSide;
    const resolved = resolveAbutmentSidePatch({
      toothNumber: toothWork.toothNumber,
      current,
      patch,
      targetSide,
      detectSide,
    });
    setAbutmentSideDraftTick((n) => n + 1);
    onPatchSpecs(resolved);
  };

  const handleCancel = () => {
    if (dismissKindRef.current === "cancel") return;
    dismissKindRef.current = "cancel";
    armPointerClickThroughGuard();
    onCancel();
  };

  const handleConfirm = () => {
    if (isCustomAbutGuideTourStepId(guideTourStepId)) {
      if (wizardStep === "implant") {
        setWizardStep("abutment");
        return;
      }
      onGuideTourComplete?.();
      return;
    }
    if (toothWork) {
      rememberCustomSpecsLastDefaults(toothWork);
    }
    armPointerClickThroughGuard();
    dismissKindRef.current = "confirm";
    onConfirm();
  };

  const switchToAlternateMode = () => {
    if (!toothWork) return;
    const modalMode =
      lockedMode ?? resolveToothAbutmentProductMode(toothWork);
    const alternateMode =
      modalMode === ABUTMENT_PRODUCT_MODE.PRODUCTION
        ? ABUTMENT_PRODUCT_MODE.DESIGN_AND_PRODUCTION
        : ABUTMENT_PRODUCT_MODE.PRODUCTION;
    if (lockedMode) {
      handleCancel();
      onAlternateAbutmentModeNavigate?.();
      return;
    }
    const previous = resolveToothAbutmentProductMode(toothWork);
    if (
      previous === alternateMode &&
      isAbutmentProductMode(toothWork.abutmentProductMode)
    ) {
      return;
    }
    onAbutmentProductModeChange?.(alternateMode);
  };

  if (!toothWork) {
    return null;
  }

  const modalMode = lockedMode ?? resolveToothAbutmentProductMode(toothWork);
  const alternateMode =
    modalMode === ABUTMENT_PRODUCT_MODE.PRODUCTION
      ? ABUTMENT_PRODUCT_MODE.DESIGN_AND_PRODUCTION
      : ABUTMENT_PRODUCT_MODE.PRODUCTION;
  const toothLabel = toothWork.toothNumber
    ? ` (#${toothWork.toothNumber})`
    : "";
  const modalSpecs = pickToothWorkCustomSpecs(toothWork, true);
  const customProsthesis = isCustomAbutmentProsthesisType(
    toothWork.prosthesisType,
  );
  const modalSelection =
    selectionLock ||
    resolveCustomAbutmentSelection(toothWork) ||
    CUSTOM_ABUTMENT_SELECTION.ABUTMENT;
  const isAbutmentModal =
    modalSelection === CUSTOM_ABUTMENT_SELECTION.ABUTMENT;
  const simpleDisabled = customProsthesis;
  const simpleMode = !simpleDisabled && isSimpleAbutmentMode(modalSpecs);
  const freeformSelected =
    !simpleMode &&
    Boolean(
      modalSpecs.abutmentManufacturer ||
        modalSpecs.abutmentDiameter ||
        modalSpecs.abutmentHeight,
    );
  const healingMode =
    !simpleDisabled && isSimpleHealingKind(modalSpecs.abutmentManufacturer);
  const simpleAbutmentDimmed = !simpleMode;
  const directInputDimmed = !freeformSelected;
  const scanbodyDimmed = !freeformSelected;
  const simpleHealingDimmed = !healingMode;
  void abutmentSideDraftTick;
  const toothDraftKey = toothWork.toothNumber;
  const simpleAbutmentDraft = readAbutmentSideDraft(
    toothDraftKey,
    "simpleAbutment",
  );
  const directInputDraft = readAbutmentSideDraft(toothDraftKey, "directInput");
  const scanbodyDraft = readAbutmentSideDraft(toothDraftKey, "scanbody");
  const simpleHealingDraft = readAbutmentSideDraft(
    toothDraftKey,
    "simpleHealing",
  );
  const abutmentSideValue = {
    abutmentManufacturer: modalSpecs.abutmentManufacturer,
    abutmentDiameter: modalSpecs.abutmentDiameter,
    abutmentHeight: modalSpecs.abutmentHeight,
  };
  const simpleAbutmentValue = simpleMode
    ? abutmentSideValue
    : simpleAbutmentDraft;
  const directInputValue = freeformSelected
    ? abutmentSideValue
    : directInputDraft;
  const scanbodyValue = freeformSelected ? abutmentSideValue : scanbodyDraft;
  const simpleHealingValue = healingMode
    ? abutmentSideValue
    : simpleHealingDraft;
  const implantReady = hasToothWorkImplantPreset(modalSpecs);
  const tourImplantFocus =
    isPresetGuideTourStep && wizardStep === "implant";
  const tourAbutmentFocus =
    isPresetGuideTourStep && wizardStep === "abutment";
  const stepSubtitle =
    wizardStep === "implant"
      ? "1/2 · 임플란트 선택"
      : customProsthesis
        ? "2/2 · 스캔바디 선택"
        : isAbutmentModal
          ? "2/2 · 심플어벗 또는 직접 입력"
          : "2/2 · 스캔바디 또는 심플 힐링";
  const selectedImplantHeaderLabel =
    wizardStep === "abutment" && implantReady
      ? (() => {
          const parts = implantFavoriteDisplayParts(
            modalSpecs,
            mergeCncImplantSpecs(implantConnections),
          );
          if (
            parts.line1 === "임플란트" &&
            !String(parts.line2 || "").trim()
          ) {
            return "";
          }
          return [parts.line1, parts.line2].filter(Boolean).join(" / ");
        })()
      : "";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          onOpenChange(true);
          return;
        }
        // 확인·취소 버튼이 이미 onConfirm/onCancel을 호출한 경우
        if (
          dismissKindRef.current === "confirm" ||
          dismissKindRef.current === "cancel"
        ) {
          dismissKindRef.current = null;
          return;
        }
        // 바깥 클릭 등 — 부모가 취소·닫기
        onOpenChange(false);
      }}
    >
      <DialogContent
        className={cn(
          "guide-tour-nested-dialog flex max-h-[calc(100dvh-2rem)] w-[min(52rem,calc(100vw-1.5rem))] flex-col gap-3 overflow-hidden px-5 py-4 sm:max-w-[min(52rem,calc(100vw-1.5rem))] sm:px-6 sm:py-5",
          isPresetGuideTourStep &&
            "!top-[10.5rem] !translate-y-0 max-h-[calc(100dvh-11.5rem)]",
          className,
        )}
        overlayClassName={cn(
          "guide-tour-nested-dialog-overlay",
          overlayClassName,
        )}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
        onPointerDownOutside={
          isPresetGuideTourStep
            ? (event) => {
                event.preventDefault();
              }
            : () => {
                armPointerClickThroughGuard();
              }
        }
        onInteractOutside={
          isPresetGuideTourStep
            ? (event) => {
                event.preventDefault();
              }
            : undefined
        }
        onFocusOutside={
          isPresetGuideTourStep
            ? (event) => {
                event.preventDefault();
              }
            : undefined
        }
        {...(guideTourTargetId &&
        CUSTOM_ABUT_GUIDE_TARGETS.has(guideTourTargetId)
          ? { "data-guide-tour": guideTourTargetId }
          : {})}
      >
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
          <DialogHeader className="shrink-0 space-y-1 text-left">
            <DialogTitle className="text-lg">
              {`${isAbutmentModal ? "직접 어벗" : "간접 어벗"} 설정${toothLabel}`}
            </DialogTitle>
            <p className="text-sm text-slate-500" aria-live="polite">
              {stepSubtitle}
            </p>
            {selectedImplantHeaderLabel ? (
              <p
                className="text-sm font-medium text-primary-strong"
                aria-live="polite"
              >
                {selectedImplantHeaderLabel}
              </p>
            ) : null}
            <DialogDescription className="sr-only">
              {(() => {
                const abutmentSideHint = customProsthesis
                  ? "임플란트를 선택한 뒤 스캔바디를 선택하면 저장되고 닫힙니다."
                  : isAbutmentModal
                    ? "임플란트를 선택한 뒤 심플어벗 또는 직접 입력을 선택하거나, 입력 없이 확인할 수 있습니다."
                    : "임플란트를 선택한 뒤 스캔바디 또는 심플 힐링을 선택하면 저장되고 닫힙니다.";
                if (
                  lockedMode === ABUTMENT_PRODUCT_MODE.DESIGN_AND_PRODUCTION
                ) {
                  return `디자인+생산 의뢰가 선택됩니다. 생산만 의뢰는 어벗생산의뢰 페이지로 이동합니다. ${abutmentSideHint}`;
                }
                if (lockedMode === ABUTMENT_PRODUCT_MODE.PRODUCTION) {
                  return `생산만 의뢰가 선택됩니다. 디자인+생산 의뢰는 ${alternateAbutmentModePageLabel} 페이지로 이동합니다. ${abutmentSideHint}`;
                }
                return `${abutmentSideHint} 확인도 동일하고, 취소하면 열기 전 값으로 돌아갑니다.`;
              })()}
            </DialogDescription>
          </DialogHeader>

          {showGuideTourBanner &&
          isCustomAbutGuideTourStepId(guideTourStepId) &&
          guideTourStep ? (
            <PracticeToothWorkGuideTourBanner
              step={guideTourStep}
              onExit={onGuideTourExit || (() => {})}
              onFinish={onGuideTourExit || (() => {})}
              className="shrink-0"
            />
          ) : null}

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto p-1.5 sm:p-2">
              {wizardStep === "implant" ? (
                <div
                  className={cn(
                    "flex min-h-0 min-w-0 flex-1 flex-col gap-1.5",
                    tourImplantFocus &&
                      "practice-tooth-guide-pulse rounded-xl",
                  )}
                >
                  <PracticeToothImplantChipFields
                    allowPresetEdit={!isPresetGuideTourStep}
                    heading="임플란트"
                    className="min-h-0 flex-1 border-primary/50 bg-primary-soft/60"
                    value={modalSpecs}
                    onChange={(nextImplant) => {
                      applySpecsPatch(nextImplant);
                    }}
                    connections={implantConnections}
                    favorites={modalImplantFavorites}
                    onFavoritesChange={
                      isPresetGuideTourStep
                        ? undefined
                        : onImplantFavoritesChange
                    }
                  />
                </div>
              ) : isAbutmentModal ? (
                <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 items-stretch gap-2.5 sm:grid-cols-2">
                  <PracticeToothSimpleAbutmentFields
                    variant="abutment"
                    heading="심플어벗"
                    dimmed={!simpleDisabled && simpleAbutmentDimmed}
                    disabled={simpleDisabled}
                    disabledHint="커스텀어벗 형태에서는 스캔바디만 선택할 수 있습니다."
                    allowPresetEdit={!isPresetGuideTourStep}
                    optionCatalog={simpleAbutmentOptions}
                    onOptionCatalogChange={
                      isPresetGuideTourStep
                        ? undefined
                        : onSimpleAbutmentOptionsChange
                    }
                    className={cn(
                      "min-h-0",
                      tourAbutmentFocus &&
                        "practice-tooth-guide-pulse rounded-xl",
                    )}
                    value={simpleAbutmentValue}
                    onChange={(nextSimple) => {
                      patchAbutmentSide(nextSimple, "simpleAbutment");
                    }}
                  />
                  <PracticeToothCompanySpecFields
                    heading="직접 입력"
                    companyLabel="회사"
                    dimmed={directInputDimmed}
                    allowPresetEdit={!isPresetGuideTourStep}
                    className={cn(
                      "min-h-0",
                      tourAbutmentFocus &&
                        "practice-tooth-guide-pulse rounded-xl",
                    )}
                    value={directInputValue}
                    onChange={(nextAbutment) => {
                      patchAbutmentSide(nextAbutment, "directInput");
                    }}
                    favorites={directAbutmentFavorites}
                    onFavoritesChange={
                      isPresetGuideTourStep
                        ? undefined
                        : onDirectAbutmentFavoritesChange
                    }
                  />
                </div>
              ) : (
                <div className="grid min-h-0 min-w-0 flex-1 grid-cols-1 items-stretch gap-2.5 sm:grid-cols-2">
                  <PracticeToothCompanySpecFields
                    heading="스캔바디"
                    companyLabel="회사"
                    dimmed={scanbodyDimmed}
                    allowPresetEdit={!isPresetGuideTourStep}
                    className={cn(
                      "min-h-0",
                      tourAbutmentFocus &&
                        "practice-tooth-guide-pulse rounded-xl",
                    )}
                    value={scanbodyValue}
                    onChange={(nextAbutment) => {
                      patchAbutmentSide(nextAbutment, "scanbody");
                    }}
                    favorites={modalAbutmentFavorites}
                    onFavoritesChange={
                      isPresetGuideTourStep
                        ? undefined
                        : onAbutmentFavoritesChange
                    }
                  />
                  <PracticeToothSimpleAbutmentFields
                    variant="healing"
                    heading={SIMPLE_HEALING_LABEL}
                    dimmed={!simpleDisabled && simpleHealingDimmed}
                    disabled={simpleDisabled}
                    disabledHint="커스텀어벗 형태에서는 스캔바디만 선택할 수 있습니다."
                    allowPresetEdit={!isPresetGuideTourStep}
                    optionCatalog={simpleHealingOptions}
                    onOptionCatalogChange={
                      isPresetGuideTourStep
                        ? undefined
                        : onSimpleHealingOptionsChange
                    }
                    className={cn(
                      "min-h-0",
                      tourAbutmentFocus &&
                        "practice-tooth-guide-pulse rounded-xl",
                    )}
                    value={simpleHealingValue}
                    onChange={(nextSimple) => {
                      patchAbutmentSide(nextSimple, "simpleHealing");
                    }}
                  />
                </div>
              )}
            </div>

            <PracticeCustomSpecsPresetEditDialog
              open={presetEditOpen}
              onOpenChange={setPresetEditOpenSafe}
              className={className}
              overlayClassName={overlayClassName}
              value={pickToothWorkCustomSpecs(toothWork, true)}
              onImplantChange={(nextImplant) => {
                applySpecsPatch(nextImplant);
              }}
              onAbutmentChange={(nextAbutment) => {
                applySpecsPatch(nextAbutment);
              }}
              connections={implantConnections}
              implantFavorites={implantFavorites}
              onImplantFavoritesChange={onImplantFavoritesChange}
              abutmentFavorites={abutmentFavorites}
              onAbutmentFavoritesChange={onAbutmentFavoritesChange}
            />
          </div>

          <DialogFooter className="flex shrink-0 flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:space-x-0">
            <div className="flex min-w-0 flex-wrap items-center justify-start gap-2">
              <Button
                type="button"
                className={
                  alternateMode === ABUTMENT_PRODUCT_MODE.PRODUCTION
                    ? "h-auto min-h-10 whitespace-normal rounded-lg border border-[hsl(46_85%_45%)] bg-[hsl(48_96%_58%)] px-3.5 py-1.5 text-center text-[13px] font-semibold leading-snug text-slate-900 shadow-sm hover:bg-[hsl(48_96%_50%)]"
                    : "h-10 min-w-[5.5rem] border-2 border-[hsl(46_85%_52%)] bg-[hsl(48_96%_58%)] px-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-[hsl(48_96%_50%)]"
                }
                onClick={switchToAlternateMode}
              >
                {alternateMode === ABUTMENT_PRODUCT_MODE.PRODUCTION ? (
                  <span className="flex flex-col items-center text-center">
                    <span>STL 파일로</span>
                    <span>어벗 생산 의뢰</span>
                  </span>
                ) : (
                  ABUTMENT_PRODUCT_MODE_LABEL[alternateMode]
                )}
              </Button>
            </div>
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
              {wizardStep === "abutment" ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 min-w-[5.5rem]"
                  onClick={() => setWizardStep("implant")}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  이전
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                className="h-10 min-w-[5.5rem]"
                onClick={handleCancel}
              >
                취소
              </Button>
              {wizardStep === "implant" ? (
                <Button
                  type="button"
                  className="h-10 min-w-[5.5rem]"
                  disabled={!implantReady}
                  onClick={() => setWizardStep("abutment")}
                >
                  다음
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  className="h-10 min-w-[5.5rem]"
                  onClick={handleConfirm}
                >
                  확인
                </Button>
              )}
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// related files:
// - web/frontend/src/shared/components/practice/PracticeToothCompanySpecFields.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/practice/transferMemo.ts
// change-log:
// - 2026-09-14: 직접입력과 직경/높이 선택 하이라이트 분리(카탈로그·BA는 원래 별도).
// - 2026-09-14: fill=flex 가로 채움. 직경/높이 단일 항목은 재클릭 해제 불가.
// - 2026-09-14: 직경·높이 편집 모드(비우기 옆 편집·X·추가·라벨변경·드래그). BA 카탈로그.
// - 2026-09-14: variant=healing — 심플 힐링(종류 없음·직경 6/7/9·높이 S/M/L/XL).
// - 2026-08-25: disabled — 커스텀어벗 보철 형태에서는 심플어벗 선택 불가(스캔바디만).
// - 2026-08-25: 심플어벗 섹션 — 종류(심플어벗/심플밀링)·직경(6–10)·높이(S/M/L). 스캔바디와 XOR.
import { useMemo, useRef, useState, type DragEvent } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addSimpleSpecOption,
  emptyToothWorkAbutment,
  isSimpleAbutmentKind,
  isSimpleHealingKind,
  normalizeSimpleAbutmentOptionCatalog,
  normalizeSimpleHealingOptionCatalog,
  removeSimpleSpecOption,
  renameSimpleSpecOption,
  reorderSimpleSpecOptions,
  SIMPLE_ABUTMENT_DIAMETERS,
  SIMPLE_ABUTMENT_HEIGHTS,
  SIMPLE_ABUTMENT_KINDS,
  SIMPLE_HEALING_DIAMETERS,
  SIMPLE_HEALING_HEIGHTS,
  SIMPLE_HEALING_KIND,
  SIMPLE_HEALING_LABEL,
  type SimpleAbutmentKind,
  type SimpleSpecOptionCatalog,
} from "@/shared/practice/transferMemo";
import { cn } from "@/shared/ui/cn";

export type ToothSimpleAbutmentValues = {
  abutmentManufacturer: string;
  abutmentDiameter: string;
  abutmentHeight: string;
};

type Props = {
  value: ToothSimpleAbutmentValues;
  onChange: (next: ToothSimpleAbutmentValues) => void;
  /** abutment=심플어벗(종류+직경+높이), healing=심플 힐링(직경+높이) */
  variant?: "abutment" | "healing";
  heading?: string;
  className?: string;
  dimmed?: boolean;
  disabled?: boolean;
  disabledHint?: string;
  /** BA 저장 직경·높이 카탈로그. 없으면 기본값 */
  optionCatalog?: SimpleSpecOptionCatalog | null;
  onOptionCatalogChange?: (next: SimpleSpecOptionCatalog) => void | Promise<void>;
  allowPresetEdit?: boolean;
};

type EditKind = "diameter" | "height";
type AddRowKind = EditKind | null;
type RenameTarget = { kind: EditKind; from: string } | null;

const ChoiceChip = ({
  label,
  active,
  onClick,
  onDelete,
  className,
  disabled = false,
  fill = false,
  draggable = false,
  dragging = false,
  dragOver = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  onDelete?: () => void;
  className?: string;
  disabled?: boolean;
  fill?: boolean;
  draggable?: boolean;
  dragging?: boolean;
  dragOver?: boolean;
  onDragStart?: (e: DragEvent) => void;
  onDragEnd?: () => void;
  onDragOver?: (e: DragEvent) => void;
  onDrop?: (e: DragEvent) => void;
}) => (
  <span
    draggable={draggable}
    onDragStart={onDragStart}
    onDragEnd={onDragEnd}
    onDragOver={onDragOver}
    onDrop={onDrop}
    className={cn(
      "h-9 max-w-full items-stretch overflow-hidden rounded-lg border text-sm font-semibold transition-colors",
      fill ? "flex min-w-0 flex-1" : "inline-flex",
      active
        ? "border-service-abut/70 bg-service-abut-soft/60 text-slate-900 shadow-sm"
        : "border-slate-200/90 bg-white text-slate-700",
      disabled && "opacity-50",
      draggable && !disabled && "cursor-grab active:cursor-grabbing",
      dragging && "opacity-60",
      dragOver && !dragging && "ring-1 ring-service-abut/50",
      className,
    )}
  >
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "min-w-0 flex-1 truncate px-2 transition-colors",
        fill ? "text-center" : "text-left",
        !disabled && !active && "hover:border-slate-300 hover:bg-slate-50",
        disabled && "cursor-not-allowed",
      )}
      onClick={onClick}
      aria-pressed={active}
    >
      {label}
    </button>
    {onDelete ? (
      <button
        type="button"
        data-preset-action=""
        disabled={disabled}
        className={cn(
          "flex w-7 shrink-0 items-center justify-center border-l border-inherit text-slate-400 transition-colors hover:bg-destructive-soft hover:text-destructive",
          disabled && "cursor-not-allowed",
        )}
        aria-label={`${label} 삭제`}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    ) : null}
  </span>
);

const KindChip = ({
  label,
  active,
  onClick,
  disabled = false,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) => (
  <button
    type="button"
    disabled={disabled}
    className={cn(
      "h-9 min-w-0 flex-1 rounded-lg border px-2 text-sm font-semibold transition-colors",
      active
        ? "border-service-abut/70 bg-service-abut-soft/60 text-slate-900 shadow-sm"
        : "border-slate-200/90 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
      disabled &&
        "cursor-not-allowed opacity-50 hover:border-slate-200/90 hover:bg-white",
    )}
    onClick={onClick}
  >
    {label}
  </button>
);

const RowAddButton = ({
  onClick,
  disabled = false,
}: {
  onClick: () => void;
  disabled?: boolean;
}) => (
  <Button
    type="button"
    variant="outline"
    size="sm"
    className="h-9 shrink-0 border-dashed border-service-abut/50 px-2 text-xs text-service-abut"
    disabled={disabled}
    onClick={onClick}
  >
    <Plus className="mr-0.5 h-3.5 w-3.5" />
    추가
  </Button>
);

export const PracticeToothSimpleAbutmentFields = ({
  value,
  onChange,
  variant = "abutment",
  heading,
  className,
  dimmed = false,
  disabled = false,
  disabledHint,
  optionCatalog,
  onOptionCatalogChange,
  allowPresetEdit = true,
}: Props) => {
  const isHealing = variant === "healing";
  const resolvedHeading =
    heading || (isHealing ? SIMPLE_HEALING_LABEL : "심플어벗");
  const kind = String(value.abutmentManufacturer || "").trim();
  const diameter = String(value.abutmentDiameter || "").trim();
  const height = String(value.abutmentHeight || "").trim();
  const inactive = disabled || dimmed;

  const catalog = useMemo(
    () =>
      isHealing
        ? normalizeSimpleHealingOptionCatalog(optionCatalog)
        : normalizeSimpleAbutmentOptionCatalog(optionCatalog),
    [isHealing, optionCatalog],
  );
  const diameterFallback = isHealing
    ? SIMPLE_HEALING_DIAMETERS
    : SIMPLE_ABUTMENT_DIAMETERS;
  const heightFallback = isHealing
    ? SIMPLE_HEALING_HEIGHTS
    : SIMPLE_ABUTMENT_HEIGHTS;

  const [presetEditMode, setPresetEditMode] = useState(false);
  const [addRow, setAddRow] = useState<AddRowKind>(null);
  const [addDraft, setAddDraft] = useState("");
  const [renameTarget, setRenameTarget] = useState<RenameTarget>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [optionsBusy, setOptionsBusy] = useState(false);
  const [dragKind, setDragKind] = useState<EditKind | null>(null);
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const suppressClickAfterDragRef = useRef(false);

  const canManage = allowPresetEdit && Boolean(onOptionCatalogChange);
  const showPresetActions = canManage && presetEditMode;

  const activeKind = isHealing
    ? isSimpleHealingKind(kind)
      ? SIMPLE_HEALING_KIND
      : ""
    : isSimpleAbutmentKind(kind)
      ? kind
      : "";
  /** 직접입력과 필드 공유 — 심플 종류가 있을 때만 직경/높이 선택 표시(dimmed여도 초안 표시) */
  const selectionOwnsValues = Boolean(activeKind);
  const activeDiameter =
    selectionOwnsValues && catalog.diameters.includes(diameter) ? diameter : "";
  const activeHeight =
    selectionOwnsValues && catalog.heights.includes(height) ? height : "";
  const hasAny = Boolean(
    activeKind ||
      (selectionOwnsValues &&
        (catalog.diameters.includes(diameter) ||
          catalog.heights.includes(height))),
  );

  const persistCatalog = async (next: SimpleSpecOptionCatalog) => {
    if (!onOptionCatalogChange) return;
    setOptionsBusy(true);
    try {
      void Promise.resolve(onOptionCatalogChange(next)).catch(() => {});
    } finally {
      setOptionsBusy(false);
    }
  };

  const clearDrag = () => {
    setDragKind(null);
    setDragFromIndex(null);
    setDragOverIndex(null);
  };

  const exitPresetEditMode = () => {
    setPresetEditMode(false);
    setAddRow(null);
    setAddDraft("");
    setRenameTarget(null);
    setRenameDraft("");
    clearDrag();
  };

  const cancelAdd = () => {
    setAddRow(null);
    setAddDraft("");
  };

  const cancelRename = () => {
    setRenameTarget(null);
    setRenameDraft("");
  };

  const startRename = (rowKind: EditKind, from: string) => {
    setAddRow(null);
    setAddDraft("");
    setRenameTarget({ kind: rowKind, from });
    setRenameDraft(from);
  };

  const chipDragProps = (rowKind: EditKind, index: number) => {
    if (!showPresetActions || disabled) return {};
    return {
      draggable: true as const,
      dragging: dragKind === rowKind && dragFromIndex === index,
      dragOver:
        dragKind === rowKind &&
        dragOverIndex === index &&
        dragFromIndex != null &&
        dragFromIndex !== index,
      onDragStart: (e: DragEvent) => {
        if (
          (e.target as HTMLElement | null)?.closest?.("[data-preset-action]")
        ) {
          e.preventDefault();
          return;
        }
        suppressClickAfterDragRef.current = false;
        e.dataTransfer.setData("text/plain", `${rowKind}:${index}`);
        e.dataTransfer.effectAllowed = "move";
        setDragKind(rowKind);
        setDragFromIndex(index);
        setDragOverIndex(null);
      },
      onDragEnd: () => clearDrag(),
      onDragOver: (e: DragEvent) => {
        if (dragKind !== rowKind || dragFromIndex == null) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dragOverIndex !== index) setDragOverIndex(index);
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        const raw =
          e.dataTransfer.getData("text/plain") ||
          (dragKind && dragFromIndex != null
            ? `${dragKind}:${dragFromIndex}`
            : "");
        const [rawKind, rawFrom] = String(raw).split(":");
        const fromIndex = Number(rawFrom);
        clearDrag();
        if (rawKind !== rowKind || !Number.isFinite(fromIndex)) return;
        if (fromIndex === index) return;
        suppressClickAfterDragRef.current = true;
        if (rowKind === "diameter") {
          void persistCatalog({
            diameters: reorderSimpleSpecOptions(
              catalog.diameters,
              fromIndex,
              index,
              diameterFallback,
            ),
            heights: catalog.heights,
          });
        } else {
          void persistCatalog({
            diameters: catalog.diameters,
            heights: reorderSimpleSpecOptions(
              catalog.heights,
              fromIndex,
              index,
              heightFallback,
            ),
          });
        }
      },
    };
  };

  const runChipClick = (action: () => void) => {
    if (suppressClickAfterDragRef.current) {
      suppressClickAfterDragRef.current = false;
      return;
    }
    action();
  };

  const selectKind = (next: SimpleAbutmentKind) => {
    if (disabled) return;
    if (activeKind === next) {
      if (dimmed) {
        activateSide();
        return;
      }
      onChange(emptyToothWorkAbutment());
      return;
    }
    onChange({
      abutmentManufacturer: next,
      abutmentDiameter: activeDiameter || diameter,
      abutmentHeight: activeHeight || height,
    });
  };

  const activateSide = () => {
    if (disabled) return;
    if (isHealing) {
      onChange({
        abutmentManufacturer: SIMPLE_HEALING_KIND,
        abutmentDiameter:
          activeDiameter ||
          diameter ||
          (catalog.diameters.length === 1 ? catalog.diameters[0] : ""),
        abutmentHeight:
          activeHeight ||
          height ||
          (catalog.heights.length === 1 ? catalog.heights[0] : ""),
      });
      return;
    }
    const manufacturer =
      activeKind ||
      (isSimpleAbutmentKind(kind) ? kind : "") ||
      SIMPLE_ABUTMENT_KINDS[0];
    onChange({
      abutmentManufacturer: manufacturer,
      abutmentDiameter:
        activeDiameter ||
        diameter ||
        (catalog.diameters.length === 1 ? catalog.diameters[0] : ""),
      abutmentHeight:
        activeHeight ||
        height ||
        (catalog.heights.length === 1 ? catalog.heights[0] : ""),
    });
  };

  const selectDiameter = (next: string) => {
    if (disabled) return;
    const manufacturer = isHealing
      ? SIMPLE_HEALING_KIND
      : activeKind || SIMPLE_ABUTMENT_KINDS[0];
    if (activeDiameter === next) {
      if (dimmed) {
        activateSide();
        return;
      }
      if (catalog.diameters.length <= 1) return;
      onChange({
        abutmentManufacturer: manufacturer,
        abutmentDiameter: "",
        abutmentHeight: activeHeight,
      });
      return;
    }
    onChange({
      abutmentManufacturer: manufacturer,
      abutmentDiameter: next,
      abutmentHeight:
        catalog.heights.length === 1 && !activeHeight
          ? catalog.heights[0]
          : activeHeight || height,
    });
  };

  const selectHeight = (next: string) => {
    if (disabled) return;
    const manufacturer = isHealing
      ? SIMPLE_HEALING_KIND
      : activeKind || SIMPLE_ABUTMENT_KINDS[0];
    if (activeHeight === next) {
      if (dimmed) {
        activateSide();
        return;
      }
      if (catalog.heights.length <= 1) return;
      onChange({
        abutmentManufacturer: manufacturer,
        abutmentDiameter: activeDiameter,
        abutmentHeight: "",
      });
      return;
    }
    onChange({
      abutmentManufacturer: manufacturer,
      abutmentDiameter:
        catalog.diameters.length === 1 && !activeDiameter
          ? catalog.diameters[0]
          : activeDiameter || diameter,
      abutmentHeight: next,
    });
  };

  const confirmAdd = async () => {
    const text = String(addDraft || "").trim();
    if (!text || !addRow) return;
    cancelRename();
    if (addRow === "diameter") {
      const diameters = addSimpleSpecOption(
        catalog.diameters,
        text,
        diameterFallback,
      );
      await persistCatalog({ diameters, heights: catalog.heights });
      onChange({
        abutmentManufacturer: isHealing
          ? SIMPLE_HEALING_KIND
          : activeKind || SIMPLE_ABUTMENT_KINDS[0],
        abutmentDiameter: text,
        abutmentHeight: activeHeight,
      });
    } else {
      const heights = addSimpleSpecOption(
        catalog.heights,
        text,
        heightFallback,
      );
      await persistCatalog({ diameters: catalog.diameters, heights });
      onChange({
        abutmentManufacturer: isHealing
          ? SIMPLE_HEALING_KIND
          : activeKind || SIMPLE_ABUTMENT_KINDS[0],
        abutmentDiameter: activeDiameter,
        abutmentHeight: text,
      });
    }
    cancelAdd();
  };

  const confirmRename = async () => {
    if (!renameTarget) return;
    const nextLabel = String(renameDraft || "").trim();
    if (!nextLabel) return;
    const { kind: rowKind, from } = renameTarget;
    if (nextLabel === from) {
      cancelRename();
      return;
    }
    if (rowKind === "diameter") {
      const diameters = renameSimpleSpecOption(
        catalog.diameters,
        from,
        nextLabel,
        diameterFallback,
      );
      await persistCatalog({ diameters, heights: catalog.heights });
      onChange({
        abutmentManufacturer: isHealing
          ? SIMPLE_HEALING_KIND
          : activeKind || SIMPLE_ABUTMENT_KINDS[0],
        abutmentDiameter:
          diameter.toLowerCase() === from.toLowerCase() ? nextLabel : diameter,
        abutmentHeight: activeHeight,
      });
    } else {
      const heights = renameSimpleSpecOption(
        catalog.heights,
        from,
        nextLabel,
        heightFallback,
      );
      await persistCatalog({ diameters: catalog.diameters, heights });
      onChange({
        abutmentManufacturer: isHealing
          ? SIMPLE_HEALING_KIND
          : activeKind || SIMPLE_ABUTMENT_KINDS[0],
        abutmentDiameter: activeDiameter,
        abutmentHeight:
          height.toLowerCase() === from.toLowerCase() ? nextLabel : height,
      });
    }
    cancelRename();
  };

  const deleteDiameter = async (option: string) => {
    const diameters = removeSimpleSpecOption(
      catalog.diameters,
      option,
      diameterFallback,
    );
    await persistCatalog({ diameters, heights: catalog.heights });
    if (diameter.toLowerCase() === option.toLowerCase()) {
      onChange({
        abutmentManufacturer: isHealing
          ? SIMPLE_HEALING_KIND
          : activeKind || "",
        abutmentDiameter: "",
        abutmentHeight: activeHeight,
      });
    }
  };

  const deleteHeight = async (option: string) => {
    const heights = removeSimpleSpecOption(
      catalog.heights,
      option,
      heightFallback,
    );
    await persistCatalog({ diameters: catalog.diameters, heights });
    if (height.toLowerCase() === option.toLowerCase()) {
      onChange({
        abutmentManufacturer: isHealing
          ? SIMPLE_HEALING_KIND
          : activeKind || "",
        abutmentDiameter: activeDiameter,
        abutmentHeight: "",
      });
    }
  };

  const renderInlineAdd = (rowKind: EditKind, placeholder: string) => {
    if (addRow !== rowKind) return null;
    return (
      <div className="flex shrink-0 items-center gap-1.5">
        <Input
          value={addDraft}
          placeholder={placeholder}
          className="h-9 w-20 text-sm"
          autoFocus
          onChange={(e) => setAddDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void confirmAdd();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              cancelAdd();
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-9 px-2 text-xs"
          disabled={optionsBusy}
          onClick={cancelAdd}
        >
          취소
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-9 px-2 text-xs"
          disabled={optionsBusy || !String(addDraft || "").trim()}
          onClick={() => void confirmAdd()}
        >
          저장
        </Button>
      </div>
    );
  };

  const renderInlineRename = (rowKind: EditKind, from: string) => {
    if (
      !renameTarget ||
      renameTarget.kind !== rowKind ||
      renameTarget.from !== from
    ) {
      return null;
    }
    return (
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <Input
          value={renameDraft}
          placeholder="라벨 변경"
          className="h-9 w-full min-w-0 max-w-[5.5rem] text-sm"
          autoFocus
          onChange={(e) => setRenameDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void confirmRename();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              cancelRename();
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-9 shrink-0 px-2 text-xs"
          disabled={optionsBusy}
          onClick={cancelRename}
        >
          취소
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-9 shrink-0 px-2 text-xs"
          disabled={optionsBusy || !String(renameDraft || "").trim()}
          onClick={() => void confirmRename()}
        >
          저장
        </Button>
      </div>
    );
  };

  const renderOptionRow = (
    rowKind: EditKind,
    options: string[],
    activeValue: string,
    onSelect: (next: string) => void,
    onDelete: (option: string) => void,
  ) => (
    <div className="space-y-1.5">
      <div className="flex gap-1.5">
        {options.map((option, index) =>
          renameTarget?.kind === rowKind && renameTarget.from === option ? (
            <div key={`rename-${rowKind}-${option}`} className="min-w-0 flex-1">
              {renderInlineRename(rowKind, option)}
            </div>
          ) : (
            <ChoiceChip
              key={option}
              label={option}
              active={activeValue === option}
              disabled={disabled}
              fill
              onClick={() =>
                runChipClick(() => {
                  if (showPresetActions) {
                    startRename(rowKind, option);
                    return;
                  }
                  onSelect(option);
                })
              }
              onDelete={
                showPresetActions ? () => void onDelete(option) : undefined
              }
              {...chipDragProps(rowKind, index)}
            />
          ),
        )}
      </div>
      {showPresetActions ? (
        addRow === rowKind ? (
          renderInlineAdd(rowKind, rowKind === "diameter" ? "직경" : "높이")
        ) : (
          <RowAddButton
            disabled={optionsBusy || disabled}
            onClick={() => {
              cancelRename();
              setAddRow(rowKind);
              setAddDraft("");
            }}
          />
        )
      ) : null}
    </div>
  );

  return (
    <div
      role={dimmed && !disabled ? "button" : undefined}
      tabIndex={dimmed && !disabled ? 0 : undefined}
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-3 rounded-xl border border-service-abut-muted/80 bg-service-abut-soft/40 p-3 sm:p-4",
        inactive && "opacity-55",
        dimmed && !disabled && "cursor-pointer",
        disabled && "pointer-events-none",
        className,
      )}
      aria-disabled={disabled || undefined}
      title={disabled ? disabledHint : undefined}
      onClick={() => {
        if (dimmed && !disabled) activateSide();
      }}
      onKeyDown={(e) => {
        if (!dimmed || disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activateSide();
        }
      }}
    >
      <div className="flex shrink-0 items-center justify-between gap-2">
        <p className="text-sm font-semibold text-service-abut">{resolvedHeading}</p>
        <div
          className="flex shrink-0 items-center gap-0.5"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-sm text-slate-500"
            disabled={disabled || !hasAny}
            onClick={() => onChange(emptyToothWorkAbutment())}
          >
            <X className="mr-1 h-4 w-4" />
            비우기
          </Button>
          {canManage ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "h-8 px-2 text-sm",
                presetEditMode
                  ? "font-semibold text-service-abut"
                  : "text-slate-500",
              )}
              disabled={disabled}
              aria-pressed={presetEditMode}
              onClick={() => {
                if (presetEditMode) exitPresetEditMode();
                else setPresetEditMode(true);
              }}
            >
              {presetEditMode ? "완료" : "편집"}
            </Button>
          ) : null}
        </div>
      </div>

      {disabled && disabledHint ? (
        <p className="text-[11px] leading-snug text-slate-500">{disabledHint}</p>
      ) : null}

      {!isHealing ? (
        <div className="space-y-1.5">
          <Label className="text-sm text-slate-600">종류</Label>
          <div className="flex gap-1.5">
            {SIMPLE_ABUTMENT_KINDS.map((option) => (
              <KindChip
                key={option}
                label={option}
                active={activeKind === option}
                disabled={disabled}
                onClick={() => selectKind(option)}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label className="text-sm text-slate-600">직경</Label>
        {renderOptionRow(
          "diameter",
          catalog.diameters,
          activeDiameter,
          selectDiameter,
          deleteDiameter,
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm text-slate-600">높이</Label>
        {renderOptionRow(
          "height",
          catalog.heights,
          activeHeight,
          selectHeight,
          deleteHeight,
        )}
      </div>
    </div>
  );
};

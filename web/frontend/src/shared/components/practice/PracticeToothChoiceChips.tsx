// related files:
// - web/frontend/src/shared/components/practice/PracticeToothCompanySpecFields.tsx
// - web/frontend/src/shared/components/practice/PracticeToothSimpleAbutmentFields.tsx
// - web/frontend/src/shared/components/practice/PracticeToothImplantChipFields.tsx
// change-log:
// - 2026-09-14: dimmed 흐림 강화(opacity-35 + saturate). 칩 하이라이트 제거·활성 패널 테두리.
// - 2026-09-14: dimmed 사이드 칩 하이라이트 제거·활성 패널 테두리 강조(XOR).
// - 2026-09-14: 임플란트·스캔바디·심플어벗/힐링·직접입력 공통 칩 UI(ChoiceChip·추가·헤더·인라인·드래그 훅).
import {
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/shared/ui/cn";

/** abut=스캔바디·심플어벗/힐링·직접입력, primary=임플란트 */
export type PracticeToothChipAccent = "abut" | "primary";

export type PracticeToothChipRenameTarget<K extends string> = {
  kind: K;
  from: string;
} | null;

const ACCENT = {
  abut: {
    active: "border-service-abut/70 bg-service-abut-soft/60 text-slate-900 shadow-sm",
    ring: "ring-service-abut/50",
    add: "border-dashed border-service-abut/50 text-service-abut",
    heading: "text-service-abut",
    editActive: "font-semibold text-service-abut",
    panel: "border-service-abut-muted/80 bg-service-abut-soft/40",
    panelSelected:
      "border-service-abut/70 bg-service-abut-soft/50 shadow-sm ring-1 ring-service-abut/35",
  },
  primary: {
    active: "border-primary/70 bg-primary-soft/60 text-slate-900 shadow-sm",
    ring: "ring-primary/50",
    add: "border-dashed border-primary/50 text-primary-strong",
    heading: "text-primary-strong",
    editActive: "font-semibold text-primary-strong",
    panel: "border-primary-muted/80 bg-primary-soft/50",
    panelSelected:
      "border-primary/70 bg-primary-soft/60 shadow-sm ring-1 ring-primary/35",
  },
} as const;

export type PracticeToothChoiceChipProps = {
  label: string;
  active: boolean;
  onClick: () => void;
  onDelete?: () => void;
  className?: string;
  disabled?: boolean;
  /** 행 가로를 균등 채움 */
  fill?: boolean;
  accent?: PracticeToothChipAccent;
  draggable?: boolean;
  dragging?: boolean;
  dragOver?: boolean;
  onDragStart?: (e: DragEvent) => void;
  onDragEnd?: () => void;
  onDragOver?: (e: DragEvent) => void;
  onDrop?: (e: DragEvent) => void;
};

export const PracticeToothChoiceChip = ({
  label,
  active,
  onClick,
  onDelete,
  className,
  disabled = false,
  fill = false,
  accent = "abut",
  draggable = false,
  dragging = false,
  dragOver = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: PracticeToothChoiceChipProps) => {
  const tone = ACCENT[accent];
  return (
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
          ? tone.active
          : "border-slate-200/90 bg-white text-slate-700",
        disabled && "opacity-50",
        draggable && !disabled && "cursor-grab active:cursor-grabbing",
        dragging && "opacity-60",
        dragOver && !dragging && `ring-1 ${tone.ring}`,
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
};

export const PracticeToothChipAddButton = ({
  onClick,
  disabled = false,
  accent = "abut",
}: {
  onClick: () => void;
  disabled?: boolean;
  accent?: PracticeToothChipAccent;
}) => (
  <Button
    type="button"
    variant="outline"
    size="sm"
    className={cn("h-9 shrink-0 px-2 text-xs", ACCENT[accent].add)}
    disabled={disabled}
    onClick={onClick}
  >
    <Plus className="mr-0.5 h-3.5 w-3.5" />
    추가
  </Button>
);

export type PracticeToothChipInlineEditorProps = {
  value: string;
  placeholder: string;
  busy?: boolean;
  /** narrow=직경/높이, wide=회사·제조사 등 */
  size?: "narrow" | "wide";
  grow?: boolean;
  onChange: (next: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export const PracticeToothChipInlineEditor = ({
  value,
  placeholder,
  busy = false,
  size = "wide",
  grow = false,
  onChange,
  onCancel,
  onConfirm,
}: PracticeToothChipInlineEditorProps) => (
  <div
    className={cn(
      "flex items-center gap-1.5",
      grow ? "min-w-0 flex-1" : "shrink-0",
    )}
  >
    <Input
      value={value}
      placeholder={placeholder}
      className={cn(
        "h-9 text-sm",
        size === "narrow"
          ? grow
            ? "w-full min-w-0 max-w-[5.5rem]"
            : "w-20"
          : grow
            ? "w-full min-w-0 max-w-[10rem]"
            : "w-32 max-w-[10rem]",
      )}
      autoFocus
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onConfirm();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
    />
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-9 shrink-0 px-2 text-xs"
      disabled={busy}
      onClick={onCancel}
    >
      취소
    </Button>
    <Button
      type="button"
      size="sm"
      className="h-9 shrink-0 px-2 text-xs"
      disabled={busy || !String(value || "").trim()}
      onClick={onConfirm}
    >
      저장
    </Button>
  </div>
);

export const PracticeToothChipSectionHeader = ({
  heading,
  accent = "abut",
  badge,
  canClear,
  clearDisabled = false,
  onClear,
  canEdit = false,
  editMode = false,
  editDisabled = false,
  onToggleEdit,
  stopPropagation = false,
}: {
  heading: string;
  accent?: PracticeToothChipAccent;
  badge?: ReactNode;
  canClear: boolean;
  clearDisabled?: boolean;
  onClear: () => void;
  canEdit?: boolean;
  editMode?: boolean;
  editDisabled?: boolean;
  onToggleEdit?: () => void;
  /** dimmed 패널 클릭 전파 차단(심플어벗 XOR) */
  stopPropagation?: boolean;
}) => {
  const tone = ACCENT[accent];
  const stop = stopPropagation
    ? {
        onClick: (e: MouseEvent) => e.stopPropagation(),
        onKeyDown: (e: KeyboardEvent) => e.stopPropagation(),
      }
    : {};
  return (
    <div className="flex shrink-0 items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <p className={cn("text-sm font-semibold", tone.heading)}>{heading}</p>
        {badge}
      </div>
      <div className="flex shrink-0 items-center gap-0.5" {...stop}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2 text-sm text-slate-500"
          disabled={clearDisabled || !canClear}
          onClick={onClear}
        >
          <X className="mr-1 h-4 w-4" />
          비우기
        </Button>
        {canEdit && onToggleEdit ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-8 px-2 text-sm",
              editMode ? tone.editActive : "text-slate-500",
            )}
            disabled={editDisabled}
            aria-pressed={editMode}
            onClick={onToggleEdit}
          >
            {editMode ? "완료" : "편집"}
          </Button>
        ) : null}
      </div>
    </div>
  );
};

export const PracticeToothChipPanel = ({
  accent = "abut",
  className,
  dimmed = false,
  selected = false,
  disabled = false,
  disabledHint,
  onActivate,
  children,
}: {
  accent?: PracticeToothChipAccent;
  className?: string;
  dimmed?: boolean;
  /** 활성 사이드 강조(테두리) — dimmed와 XOR */
  selected?: boolean;
  disabled?: boolean;
  disabledHint?: string;
  onActivate?: () => void;
  children: ReactNode;
}) => {
  const inactive = disabled || dimmed;
  const clickable = Boolean(dimmed && !disabled && onActivate);
  const tone = ACCENT[accent];
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-3 rounded-xl border p-3 sm:p-4 transition-opacity",
        tone.panel,
        inactive && "opacity-35 saturate-50",
        selected && !inactive && tone.panelSelected,
        clickable && "cursor-pointer",
        disabled && "pointer-events-none",
        className,
      )}
      aria-disabled={disabled || undefined}
      title={disabled ? disabledHint : undefined}
      onClick={() => {
        if (clickable) onActivate?.();
      }}
      onKeyDown={(e) => {
        if (!clickable) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate?.();
        }
      }}
    >
      {children}
    </div>
  );
};

export type PracticeToothChipDragProps = {
  draggable: true;
  dragging: boolean;
  dragOver: boolean;
  onDragStart: (e: DragEvent) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
};

export const usePracticeToothChipEdit = <K extends string>(options: {
  canManage: boolean;
  disabled?: boolean;
}) => {
  const { canManage, disabled = false } = options;
  const [presetEditMode, setPresetEditMode] = useState(false);
  const [addRow, setAddRow] = useState<K | null>(null);
  const [addDraft, setAddDraft] = useState("");
  const [renameTarget, setRenameTarget] =
    useState<PracticeToothChipRenameTarget<K>>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [dragKind, setDragKind] = useState<K | null>(null);
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const suppressClickAfterDragRef = useRef(false);

  const showPresetActions = canManage && presetEditMode;

  const clearDrag = () => {
    setDragKind(null);
    setDragFromIndex(null);
    setDragOverIndex(null);
  };

  const cancelAdd = () => {
    setAddRow(null);
    setAddDraft("");
  };

  const cancelRename = () => {
    setRenameTarget(null);
    setRenameDraft("");
  };

  const exitPresetEditMode = () => {
    setPresetEditMode(false);
    cancelAdd();
    cancelRename();
    clearDrag();
  };

  const beginAdd = (kind: K) => {
    cancelRename();
    setAddRow(kind);
    setAddDraft("");
  };

  const startRename = (kind: K, from: string) => {
    cancelAdd();
    setRenameTarget({ kind, from });
    setRenameDraft(from);
  };

  const toggleEditMode = () => {
    if (presetEditMode) exitPresetEditMode();
    else setPresetEditMode(true);
  };

  const runChipClick = (action: () => void) => {
    if (suppressClickAfterDragRef.current) {
      suppressClickAfterDragRef.current = false;
      return;
    }
    action();
  };

  const chipDragProps = (
    kind: K,
    index: number,
    onReorder: (fromIndex: number, toIndex: number) => void,
  ): PracticeToothChipDragProps | Record<string, never> => {
    if (!showPresetActions || disabled) return {};
    return {
      draggable: true as const,
      dragging: dragKind === kind && dragFromIndex === index,
      dragOver:
        dragKind === kind &&
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
        e.dataTransfer.setData("text/plain", `${kind}:${index}`);
        e.dataTransfer.effectAllowed = "move";
        setDragKind(kind);
        setDragFromIndex(index);
        setDragOverIndex(null);
      },
      onDragEnd: () => clearDrag(),
      onDragOver: (e: DragEvent) => {
        if (dragKind !== kind || dragFromIndex == null) return;
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
        if (rawKind !== kind || !Number.isFinite(fromIndex)) return;
        if (fromIndex === index) return;
        suppressClickAfterDragRef.current = true;
        onReorder(fromIndex, index);
      },
    };
  };

  const isRenaming = (kind: K, from: string) =>
    Boolean(
      renameTarget &&
        renameTarget.kind === kind &&
        renameTarget.from === from,
    );

  return {
    presetEditMode,
    showPresetActions,
    addRow,
    addDraft,
    setAddDraft,
    renameTarget,
    renameDraft,
    setRenameDraft,
    cancelAdd,
    cancelRename,
    beginAdd,
    startRename,
    exitPresetEditMode,
    toggleEditMode,
    runChipClick,
    chipDragProps,
    isRenaming,
  };
};

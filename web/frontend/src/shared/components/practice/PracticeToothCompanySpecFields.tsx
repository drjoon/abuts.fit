// related files:
// - web/frontend/src/shared/components/practice/PracticeToothSimpleAbutmentFields.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/practice/transferMemo.ts
// change-log:
// - 2026-09-14: 심플어벗과 직경/높이 선택 하이라이트 분리(필드 공유·카탈로그는 별도).
// - 2026-09-14: fill=flex로 가로 균등 채움 수정. 회사 칩도 fill. 단일 항목은 재클릭 해제 불가(비우기만).
// - 2026-09-14: 추가/이름변경 입력폭 제한. 직경·높이 칩은 심플힐링처럼 가로 균등 채움.
// - 2026-09-14: 편집 모드 칩 클릭 → 라벨 인라인 변경.
// - 2026-09-14: 비우기 옆 「편집」— 편집 모드에서만 칩 X·추가·드래그.
// - 2026-09-14: 회사·직경·높이 칩 드래그 순서 변경.
// - 2026-09-14: 단일 항목 강제선택 제거 — 스캔바디|심플힐링 XOR. 클릭으로만 선택·재클릭 해제.
// - 2026-09-14: 칩 X 삭제·회사/직경/높이 행별 추가.
// - 2026-09-14: 회사·직경·높이 칩 UI(심플어벗과 동일 행 높이). 회사별 직경/높이 프리셋 병합 저장.
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  emptyToothWorkAbutment,
  isSimpleAbutmentKind,
  isSimpleHealingKind,
  listCompanySpecOptions,
  mergeCompanySpecFavorite,
  removeCompanySpecCompany,
  removeCompanySpecDiameter,
  removeCompanySpecHeight,
  renameCompanySpecCompany,
  renameCompanySpecDiameter,
  renameCompanySpecHeight,
  reorderCompanySpecCompanies,
  reorderCompanySpecDiameters,
  reorderCompanySpecHeights,
  type PracticeAbutmentFavorite,
} from "@/shared/practice/transferMemo";
import { cn } from "@/shared/ui/cn";

export type ToothCompanySpecValues = {
  abutmentManufacturer: string;
  abutmentDiameter: string;
  abutmentHeight: string;
};

type Props = {
  value: ToothCompanySpecValues;
  onChange: (next: ToothCompanySpecValues) => void;
  favorites: PracticeAbutmentFavorite[];
  onFavoritesChange?: (next: PracticeAbutmentFavorite[]) => void | Promise<void>;
  heading?: string;
  companyLabel?: string;
  className?: string;
  dimmed?: boolean;
  disabled?: boolean;
  disabledHint?: string;
  allowPresetEdit?: boolean;
};

type AddRowKind = "company" | "diameter" | "height" | null;
type DragKind = "company" | "diameter" | "height";
type RenameTarget = { kind: DragKind; from: string } | null;

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
  /** 심플힐링처럼 행 가로를 균등 채움 */
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
        !disabled &&
          !active &&
          "hover:border-slate-300 hover:bg-slate-50",
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

export const PracticeToothCompanySpecFields = ({
  value,
  onChange,
  favorites,
  onFavoritesChange,
  heading = "직접 입력",
  companyLabel = "회사",
  className,
  dimmed = false,
  disabled = false,
  disabledHint,
  allowPresetEdit = true,
}: Props) => {
  const [presetEditMode, setPresetEditMode] = useState(false);
  const [addRow, setAddRow] = useState<AddRowKind>(null);
  const [addDraft, setAddDraft] = useState("");
  const [renameTarget, setRenameTarget] = useState<RenameTarget>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [favoritesBusy, setFavoritesBusy] = useState(false);
  const [dragKind, setDragKind] = useState<DragKind | null>(null);
  const [dragFromIndex, setDragFromIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const suppressClickAfterDragRef = useRef(false);

  const companyRaw = String(value.abutmentManufacturer || "").trim();
  const diameter = String(value.abutmentDiameter || "").trim();
  const height = String(value.abutmentHeight || "").trim();
  /** 심플어벗/힐링 manufacturer는 직접입력 회사로 취급하지 않음 */
  const company =
    companyRaw &&
    !isSimpleAbutmentKind(companyRaw) &&
    !isSimpleHealingKind(companyRaw)
      ? companyRaw
      : "";
  const inactive = disabled || dimmed;
  const canManage = allowPresetEdit && Boolean(onFavoritesChange);
  /** 선택 모드: 칩만. 편집 모드: X·추가·드래그 */
  const showPresetActions = canManage && presetEditMode;
  /** 심플어벗/힐링과 필드 공유 — 직접입력 회사일 때만 하이라이트(dimmed여도 초안 표시) */
  const selectionOwnsValues = Boolean(company);
  const selectedDiameter = selectionOwnsValues ? diameter : "";
  const selectedHeight = selectionOwnsValues ? height : "";
  const selectedCompany = selectionOwnsValues ? company : "";

  const options = useMemo(
    () => listCompanySpecOptions(favorites, company),
    [favorites, company],
  );

  const persistFavorites = async (next: PracticeAbutmentFavorite[]) => {
    if (!onFavoritesChange) return;
    setFavoritesBusy(true);
    try {
      void Promise.resolve(onFavoritesChange(next)).catch(() => {});
    } finally {
      setFavoritesBusy(false);
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

  const cancelRename = () => {
    setRenameTarget(null);
    setRenameDraft("");
  };

  const startRename = (kind: DragKind, from: string) => {
    setAddRow(null);
    setAddDraft("");
    setRenameTarget({ kind, from });
    setRenameDraft(from);
  };

  const confirmRename = async () => {
    if (!renameTarget) return;
    const nextLabel = String(renameDraft || "").trim();
    if (!nextLabel) return;
    const { kind, from } = renameTarget;
    if (nextLabel === from) {
      cancelRename();
      return;
    }

    if (kind === "company") {
      const merged = renameCompanySpecCompany(favorites, from, nextLabel);
      await persistFavorites(merged);
      if (company.toLowerCase() === from.toLowerCase()) {
        onChange({
          abutmentManufacturer: nextLabel,
          abutmentDiameter: diameter,
          abutmentHeight: height,
        });
      }
      cancelRename();
      return;
    }

    if (!company) return;

    if (kind === "diameter") {
      const merged = renameCompanySpecDiameter(
        favorites,
        company,
        from,
        nextLabel,
      );
      await persistFavorites(merged);
      onChange({
        abutmentManufacturer: company,
        abutmentDiameter:
          diameter.toLowerCase() === from.toLowerCase() ? nextLabel : diameter,
        abutmentHeight: height,
      });
      cancelRename();
      return;
    }

    if (kind === "height") {
      const merged = renameCompanySpecHeight(
        favorites,
        company,
        from,
        nextLabel,
      );
      await persistFavorites(merged);
      onChange({
        abutmentManufacturer: company,
        abutmentDiameter: diameter,
        abutmentHeight:
          height.toLowerCase() === from.toLowerCase() ? nextLabel : height,
      });
      cancelRename();
    }
  };

  const chipDragProps = (kind: DragKind, index: number) => {
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
      onDragEnd: () => {
        clearDrag();
      },
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
          (dragKind && dragFromIndex != null ? `${dragKind}:${dragFromIndex}` : "");
        const [rawKind, rawFrom] = String(raw).split(":");
        const fromIndex = Number(rawFrom);
        clearDrag();
        if (rawKind !== kind || !Number.isFinite(fromIndex)) return;
        if (fromIndex === index) return;
        suppressClickAfterDragRef.current = true;
        if (kind === "company") {
          void persistFavorites(
            reorderCompanySpecCompanies(favorites, fromIndex, index),
          );
        } else if (kind === "diameter" && company) {
          void persistFavorites(
            reorderCompanySpecDiameters(favorites, company, fromIndex, index),
          );
        } else if (kind === "height" && company) {
          void persistFavorites(
            reorderCompanySpecHeights(favorites, company, fromIndex, index),
          );
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

  /** 비활성(dimmed) 카드 클릭·재클릭 시 이 사이드로 전환 */
  const activateSide = () => {
    if (disabled) return;
    if (company) {
      onChange({
        abutmentManufacturer: company,
        abutmentDiameter:
          diameter ||
          (options.diameters.length === 1 ? options.diameters[0] : ""),
        abutmentHeight:
          height || (options.heights.length === 1 ? options.heights[0] : ""),
      });
      return;
    }
    if (options.companies.length === 1) {
      const sole = options.companies[0];
      if (!sole) return;
      const nextOpts = listCompanySpecOptions(favorites, sole);
      onChange({
        abutmentManufacturer: sole,
        abutmentDiameter:
          nextOpts.diameters.length === 1 ? nextOpts.diameters[0] : "",
        abutmentHeight: nextOpts.heights.length === 1 ? nextOpts.heights[0] : "",
      });
    }
  };

  const selectCompany = (nextCompany: string) => {
    if (disabled) return;
    if (company === nextCompany) {
      if (dimmed) {
        activateSide();
        return;
      }
      // 재클릭 해제 — 단, 회사가 1개뿐이면 고정(비우기로만 해제)
      if (options.companies.length <= 1) return;
      onChange(emptyToothWorkAbutment());
      return;
    }
    const nextOpts = listCompanySpecOptions(favorites, nextCompany);
    onChange({
      abutmentManufacturer: nextCompany,
      abutmentDiameter:
        nextOpts.diameters.length === 1
          ? nextOpts.diameters[0]
          : nextOpts.diameters.includes(diameter)
            ? diameter
            : "",
      abutmentHeight:
        nextOpts.heights.length === 1
          ? nextOpts.heights[0]
          : nextOpts.heights.includes(height)
            ? height
            : "",
    });
  };

  const selectDiameter = (next: string) => {
    if (disabled || !company) {
      if (dimmed && !disabled) activateSide();
      return;
    }
    if (diameter === next) {
      if (dimmed) {
        activateSide();
        return;
      }
      if (options.diameters.length <= 1) return;
      onChange({
        abutmentManufacturer: company,
        abutmentDiameter: "",
        abutmentHeight: height,
      });
      return;
    }
    const nextHeight =
      options.heights.length === 1 && !height ? options.heights[0] : height;
    onChange({
      abutmentManufacturer: company,
      abutmentDiameter: next,
      abutmentHeight: nextHeight,
    });
  };

  const selectHeight = (next: string) => {
    if (disabled || !company) {
      if (dimmed && !disabled) activateSide();
      return;
    }
    if (height === next) {
      if (dimmed) {
        activateSide();
        return;
      }
      if (options.heights.length <= 1) return;
      onChange({
        abutmentManufacturer: company,
        abutmentDiameter: diameter,
        abutmentHeight: "",
      });
      return;
    }
    const nextDiameter =
      options.diameters.length === 1 && !diameter ? options.diameters[0] : diameter;
    onChange({
      abutmentManufacturer: company,
      abutmentDiameter: nextDiameter,
      abutmentHeight: next,
    });
  };

  const hasAny = Boolean(selectionOwnsValues && (company || diameter || height));

  // 회사 1개뿐이면 미선택 시 자동 선택(+ 단일 직경/높이 채움). XOR 해제는 「비우기」.
  // 심플어벗/힐링이 선택된 동안에는 덮어쓰지 않음.
  useEffect(() => {
    if (disabled || dimmed || showPresetActions) return;
    if (
      isSimpleAbutmentKind(companyRaw) ||
      isSimpleHealingKind(companyRaw)
    ) {
      return;
    }
    if (options.companies.length !== 1) return;
    const sole = options.companies[0];
    if (!sole) return;
    if (company) return;
    const nextOpts = listCompanySpecOptions(favorites, sole);
    onChange({
      abutmentManufacturer: sole,
      abutmentDiameter:
        nextOpts.diameters.length === 1 ? nextOpts.diameters[0] : "",
      abutmentHeight: nextOpts.heights.length === 1 ? nextOpts.heights[0] : "",
    });
  }, [
    company,
    companyRaw,
    dimmed,
    disabled,
    favorites,
    onChange,
    options.companies,
    showPresetActions,
  ]);

  const cancelAdd = () => {
    setAddRow(null);
    setAddDraft("");
  };

  const confirmAdd = async () => {
    const text = String(addDraft || "").trim();
    if (!text || !addRow) return;
    cancelRename();

    if (addRow === "company") {
      const merged = mergeCompanySpecFavorite(favorites, {
        manufacturer: text,
      });
      await persistFavorites(merged);
      const nextOpts = listCompanySpecOptions(merged, text);
      onChange({
        abutmentManufacturer: text,
        abutmentDiameter:
          nextOpts.diameters.length === 1 ? nextOpts.diameters[0] : "",
        abutmentHeight: nextOpts.heights.length === 1 ? nextOpts.heights[0] : "",
      });
      cancelAdd();
      return;
    }

    if (!company) return;

    if (addRow === "diameter") {
      const merged = mergeCompanySpecFavorite(favorites, {
        manufacturer: company,
        diameter: text,
        height: height || undefined,
      });
      await persistFavorites(merged);
      onChange({
        abutmentManufacturer: company,
        abutmentDiameter: text,
        abutmentHeight: height,
      });
      cancelAdd();
      return;
    }

    if (addRow === "height") {
      const merged = mergeCompanySpecFavorite(favorites, {
        manufacturer: company,
        diameter: diameter || undefined,
        height: text,
      });
      await persistFavorites(merged);
      onChange({
        abutmentManufacturer: company,
        abutmentDiameter: diameter,
        abutmentHeight: text,
      });
      cancelAdd();
    }
  };

  const deleteCompany = async (name: string) => {
    const next = removeCompanySpecCompany(favorites, name);
    await persistFavorites(next);
    if (company.toLowerCase() === name.toLowerCase()) {
      onChange(emptyToothWorkAbutment());
    }
  };

  const deleteDiameter = async (option: string) => {
    if (!company) return;
    const next = removeCompanySpecDiameter(favorites, company, option);
    await persistFavorites(next);
    const opts = listCompanySpecOptions(next, company);
    onChange({
      abutmentManufacturer: company,
      abutmentDiameter:
        diameter.toLowerCase() === option.toLowerCase()
          ? ""
          : opts.diameters.includes(diameter)
            ? diameter
            : "",
      abutmentHeight: opts.heights.includes(height) ? height : "",
    });
  };

  const deleteHeight = async (option: string) => {
    if (!company) return;
    const next = removeCompanySpecHeight(favorites, company, option);
    await persistFavorites(next);
    const opts = listCompanySpecOptions(next, company);
    onChange({
      abutmentManufacturer: company,
      abutmentDiameter: opts.diameters.includes(diameter) ? diameter : "",
      abutmentHeight:
        height.toLowerCase() === option.toLowerCase()
          ? ""
          : opts.heights.includes(height)
            ? height
            : "",
    });
  };

  const renderInlineAdd = (
    kind: Exclude<AddRowKind, null>,
    placeholder: string,
  ) => {
    if (addRow !== kind) return null;
    const narrow = kind === "diameter" || kind === "height";
    return (
      <div className="flex shrink-0 items-center gap-1.5">
        <Input
          value={addDraft}
          placeholder={placeholder}
          className={cn(
            "h-9 text-sm",
            narrow ? "w-20" : "w-32 max-w-[10rem]",
          )}
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
          disabled={favoritesBusy}
          onClick={cancelAdd}
        >
          취소
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-9 px-2 text-xs"
          disabled={favoritesBusy || !String(addDraft || "").trim()}
          onClick={() => void confirmAdd()}
        >
          저장
        </Button>
      </div>
    );
  };

  const renderInlineRename = (kind: DragKind, from: string) => {
    if (
      !renameTarget ||
      renameTarget.kind !== kind ||
      renameTarget.from !== from
    ) {
      return null;
    }
    const narrow = kind === "diameter" || kind === "height";
    return (
      <div
        className={cn(
          "flex items-center gap-1.5",
          narrow ? "min-w-0 flex-1" : "shrink-0",
        )}
      >
        <Input
          value={renameDraft}
          placeholder="라벨 변경"
          className={cn(
            "h-9 text-sm",
            narrow ? "w-full min-w-0 max-w-[5.5rem]" : "w-32 max-w-[10rem]",
          )}
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
          disabled={favoritesBusy}
          onClick={cancelRename}
        >
          취소
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-9 shrink-0 px-2 text-xs"
          disabled={favoritesBusy || !String(renameDraft || "").trim()}
          onClick={() => void confirmRename()}
        >
          저장
        </Button>
      </div>
    );
  };

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
        <p className="text-sm font-semibold text-service-abut">{heading}</p>
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
                  ? "text-service-abut font-semibold"
                  : "text-slate-500",
              )}
              disabled={disabled}
              aria-pressed={presetEditMode}
              onClick={() => {
                if (presetEditMode) {
                  exitPresetEditMode();
                } else {
                  setPresetEditMode(true);
                }
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

      <div className="space-y-1.5">
        <Label className="text-sm text-slate-600">{companyLabel}</Label>
        <div className="space-y-1.5">
          <div className="flex gap-1.5">
            {options.companies.map((name, index) =>
              renameTarget?.kind === "company" && renameTarget.from === name ? (
                <div key={`rename-company-${name}`} className="min-w-0 flex-1">
                  {renderInlineRename("company", name)}
                </div>
              ) : (
                <ChoiceChip
                  key={name}
                  label={name}
                  active={selectedCompany === name}
                  disabled={disabled}
                  fill
                  onClick={() =>
                    runChipClick(() => {
                      if (showPresetActions) {
                        startRename("company", name);
                        return;
                      }
                      selectCompany(name);
                    })
                  }
                  onDelete={
                    showPresetActions ? () => void deleteCompany(name) : undefined
                  }
                  {...chipDragProps("company", index)}
                />
              ),
            )}
          </div>
          {showPresetActions ? (
            addRow === "company" ? (
              renderInlineAdd("company", companyLabel)
            ) : (
              <RowAddButton
                disabled={favoritesBusy || disabled}
                onClick={() => {
                  cancelRename();
                  setAddRow("company");
                  setAddDraft("");
                }}
              />
            )
          ) : options.companies.length === 0 ? (
            <p className="text-xs text-slate-400">
              {canManage ? "편집에서 회사를 추가하세요" : "저장된 회사가 없습니다"}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm text-slate-600">직경</Label>
        {!company ? (
          <p className="text-xs text-slate-400">회사를 먼저 선택하세요</p>
        ) : (
          <div className="space-y-1.5">
            <div className="flex gap-1.5">
              {options.diameters.map((option, index) =>
                renameTarget?.kind === "diameter" &&
                renameTarget.from === option ? (
                  <div key={`rename-diameter-${option}`} className="min-w-0 flex-1">
                    {renderInlineRename("diameter", option)}
                  </div>
                ) : (
                  <ChoiceChip
                    key={option}
                    label={option}
                    active={selectedDiameter === option}
                    disabled={disabled}
                    fill
                    onClick={() =>
                      runChipClick(() => {
                        if (showPresetActions) {
                          startRename("diameter", option);
                          return;
                        }
                        selectDiameter(option);
                      })
                    }
                    onDelete={
                      showPresetActions
                        ? () => void deleteDiameter(option)
                        : undefined
                    }
                    {...chipDragProps("diameter", index)}
                  />
                ),
              )}
            </div>
            {showPresetActions ? (
              addRow === "diameter" ? (
                renderInlineAdd("diameter", "직경")
              ) : (
                <RowAddButton
                  disabled={favoritesBusy || disabled}
                  onClick={() => {
                    cancelRename();
                    setAddRow("diameter");
                    setAddDraft("");
                  }}
                />
              )
            ) : !canManage && options.diameters.length === 0 ? (
              <p className="text-xs text-slate-400">직경 프리셋이 없습니다</p>
            ) : null}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-sm text-slate-600">높이</Label>
        {!company ? (
          <p className="text-xs text-slate-400">회사를 먼저 선택하세요</p>
        ) : (
          <div className="space-y-1.5">
            <div className="flex gap-1.5">
              {options.heights.map((option, index) =>
                renameTarget?.kind === "height" &&
                renameTarget.from === option ? (
                  <div key={`rename-height-${option}`} className="min-w-0 flex-1">
                    {renderInlineRename("height", option)}
                  </div>
                ) : (
                  <ChoiceChip
                    key={option}
                    label={option}
                    active={selectedHeight === option}
                    disabled={disabled}
                    fill
                    onClick={() =>
                      runChipClick(() => {
                        if (showPresetActions) {
                          startRename("height", option);
                          return;
                        }
                        selectHeight(option);
                      })
                    }
                    onDelete={
                      showPresetActions
                        ? () => void deleteHeight(option)
                        : undefined
                    }
                    {...chipDragProps("height", index)}
                  />
                ),
              )}
            </div>
            {showPresetActions ? (
              addRow === "height" ? (
                renderInlineAdd("height", "높이")
              ) : (
                <RowAddButton
                  disabled={favoritesBusy || disabled}
                  onClick={() => {
                    cancelRename();
                    setAddRow("height");
                    setAddDraft("");
                  }}
                />
              )
            ) : !canManage && options.heights.length === 0 ? (
              <p className="text-xs text-slate-400">높이 프리셋이 없습니다</p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

// related files:
// - web/frontend/src/shared/components/practice/PracticeToothImplantFields.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/practice/transferMemo.ts
// change-log:
// - 2026-08-21: 스캔바디 추가 시 현재 선택값 기본 채움. 스피너 직경 0.5·높이 2, 직접입력 제한 없음.
// - 2026-08-21: 프리셋 추가는 목록 sticky 하단(스크롤 시에만 고정). 임플란트와 독립.
import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  emptyToothWorkAbutment,
  type PracticeAbutmentFavorite,
} from "@/shared/practice/transferMemo";
import { cn } from "@/shared/ui/cn";

export type ToothAbutmentValues = {
  abutmentManufacturer: string;
  abutmentDiameter: string;
  abutmentHeight: string;
};

type Props = {
  value: ToothAbutmentValues;
  onChange: (next: ToothAbutmentValues) => void;
  favorites: PracticeAbutmentFavorite[];
  onFavoritesChange?: (next: PracticeAbutmentFavorite[]) => void | Promise<void>;
  /** 섹션 제목 (기본: 커스텀어벗 규격) */
  heading?: string;
  /** 프리셋 목록을 입력 필드 위에 배치 */
  presetsFirst?: boolean;
  /** full=필드+프리셋, fields=필드만, presets=프리셋만 */
  mode?: "full" | "fields" | "presets";
  /** 프리셋 추가·수정·삭제 허용 (기본 true) */
  allowPresetEdit?: boolean;
  /** @deprecated presets 추가는 인라인 입력으로 처리. 무시됨. */
  onAddPreset?: () => void;
  className?: string;
};

/** 프리셋 행(h-8 + py-1.5×2 + border 2px) × 4 + space-y-1.5 × 3. 초과 시 스크롤. */
const PRESET_LIST_CLASS =
  "max-h-[calc(4*(2.75rem+2px)+3*0.375rem)] space-y-1.5 overflow-y-auto overflow-x-hidden pr-1 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100";
/** presets 전용 — 설정 모달에서 상단 모드 버튼 제거 후 여유 공간 활용(최소 8행). */
const PRESET_LIST_CLASS_TALL =
  "min-h-[calc(8*(2.75rem+2px)+7*0.375rem)] flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden pr-1 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100";

const favoriteKey = (row: {
  manufacturer: string;
  diameter: string;
  height: string;
}) =>
  [row.manufacturer, row.diameter, row.height]
    .map((v) => String(v || "").trim().toLowerCase())
    .join("|");

const favoriteLabel = (row: {
  manufacturer: string;
  diameter: string;
  height: string;
}) =>
  [row.manufacturer, row.diameter, row.height]
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .join(" / ") || "어벗 규격";

const formatSteppedNumber = (n: number, step: number) => {
  const decimals = String(step).includes(".")
    ? String(step).split(".")[1]?.length || 0
    : 0;
  return decimals > 0 ? n.toFixed(decimals) : String(Math.round(n));
};

const stepNumericValue = (raw: string, step: number, direction: 1 | -1) => {
  const current = Number.parseFloat(String(raw || "").trim());
  const base = Number.isFinite(current) ? current : 0;
  const next = Math.max(0, Math.round((base + direction * step) * 1000) / 1000);
  return formatSteppedNumber(next, step);
};

const NumericStepperInput = ({
  value,
  placeholder,
  step,
  className,
  onValueChange,
}: {
  value: string;
  placeholder: string;
  /** 스피너(▲▼) 클릭 단위. 직접 입력은 step 제한 없음. */
  step: number;
  className?: string;
  onValueChange: (next: string) => void;
}) => (
  <div className="relative">
    <Input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={value}
      placeholder={placeholder}
      className={[
        className,
        "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
      ]
        .filter(Boolean)
        .join(" ")}
      onChange={(e) => onValueChange(e.target.value)}
    />
    <div className="absolute inset-y-1 right-1 flex w-6 flex-col overflow-hidden rounded border border-slate-200 bg-white">
      <button
        type="button"
        tabIndex={-1}
        className="flex h-1/2 items-center justify-center text-slate-500 hover:bg-slate-50 hover:text-slate-800"
        aria-label="값 증가"
        onClick={() => onValueChange(stepNumericValue(value, step, 1))}
      >
        <ChevronUp className="h-3 w-3" />
      </button>
      <button
        type="button"
        tabIndex={-1}
        className="flex h-1/2 items-center justify-center border-t border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
        aria-label="값 감소"
        onClick={() => onValueChange(stepNumericValue(value, step, -1))}
      >
        <ChevronDown className="h-3 w-3" />
      </button>
    </div>
  </div>
);

export const PracticeToothAbutmentFields = ({
  value,
  onChange,
  favorites,
  onFavoritesChange,
  heading = "커스텀어벗 규격",
  presetsFirst = false,
  mode = "full",
  allowPresetEdit = true,
  onAddPreset: _onAddPreset,
  className,
}: Props) => {
  const [editingFavoriteId, setEditingFavoriteId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ToothAbutmentValues>(emptyToothWorkAbutment());
  const [isAddingPreset, setIsAddingPreset] = useState(false);
  const [addDraft, setAddDraft] = useState<ToothAbutmentValues>(emptyToothWorkAbutment());
  const [favoritesBusy, setFavoritesBusy] = useState(false);
  const showFields = mode === "full" || mode === "fields";
  const showPresets = mode === "full" || mode === "presets";
  const canManagePresets = allowPresetEdit && Boolean(onFavoritesChange);
  const listClass = mode === "presets" ? PRESET_LIST_CLASS_TALL : PRESET_LIST_CLASS;

  const currentFavoriteKey = favoriteKey({
    manufacturer: value.abutmentManufacturer,
    diameter: value.abutmentDiameter,
    height: value.abutmentHeight,
  });
  const canSaveFavorite =
    canManagePresets &&
    Boolean(
      value.abutmentManufacturer || value.abutmentDiameter || value.abutmentHeight,
    ) &&
    !favorites.some((row) => favoriteKey(row) === currentFavoriteKey);

  const persistFavorites = async (next: PracticeAbutmentFavorite[]) => {
    if (!onFavoritesChange) return;
    setFavoritesBusy(true);
    try {
      // 서버 동기화 Promise까지 await 하지 않음 (느린 저장 중 추가 버튼이 잠기지 않게)
      void Promise.resolve(onFavoritesChange(next)).catch(() => {});
    } finally {
      setFavoritesBusy(false);
    }
  };

  const saveCurrentAsFavorite = () =>
    void persistFavorites([
      ...favorites,
      {
        id: `abt-${Date.now().toString(36)}`,
        manufacturer: String(value.abutmentManufacturer || "").trim(),
        diameter: String(value.abutmentDiameter || "").trim(),
        height: String(value.abutmentHeight || "").trim(),
      },
    ]);

  const startAddPreset = () => {
    setEditingFavoriteId(null);
    setAddDraft({
      abutmentManufacturer: String(value.abutmentManufacturer || ""),
      abutmentDiameter: String(value.abutmentDiameter || ""),
      abutmentHeight: String(value.abutmentHeight || ""),
    });
    setIsAddingPreset(true);
  };

  const cancelAddPreset = () => {
    setIsAddingPreset(false);
    setAddDraft(emptyToothWorkAbutment());
  };

  const confirmAddPreset = async () => {
    const manufacturer = String(addDraft.abutmentManufacturer || "").trim();
    const diameter = String(addDraft.abutmentDiameter || "").trim();
    const height = String(addDraft.abutmentHeight || "").trim();
    if (!manufacturer && !diameter && !height) return;
    const nextFavorite: PracticeAbutmentFavorite = {
      id: `abt-${Date.now().toString(36)}`,
      manufacturer,
      diameter,
      height,
    };
    const withoutDup = favorites.filter(
      (row) => favoriteKey(row) !== favoriteKey(nextFavorite),
    );
    await persistFavorites([...withoutDup, nextFavorite]);
    onChange({
      abutmentManufacturer: manufacturer,
      abutmentDiameter: diameter,
      abutmentHeight: height,
    });
    cancelAddPreset();
  };

  const canConfirmAddPreset = Boolean(
    addDraft.abutmentManufacturer ||
      addDraft.abutmentDiameter ||
      addDraft.abutmentHeight,
  );

  const renderAddPresetForm = () => {
    if (!isAddingPreset || !canManagePresets) return null;
    return (
      <div
        key="add-preset-row"
        className="space-y-1.5 rounded-lg border border-primary/70 bg-primary-muted/30 px-2 py-1.5"
      >
        <div className="grid grid-cols-3 gap-1.5">
          <Input
            value={addDraft.abutmentManufacturer}
            placeholder="제조사"
            className="h-9 text-sm"
            onChange={(e) =>
              setAddDraft((prev) => ({
                ...prev,
                abutmentManufacturer: e.target.value,
              }))
            }
          />
          <NumericStepperInput
            value={addDraft.abutmentDiameter}
            placeholder="직경"
            step={0.5}
            className="h-9 pr-8 text-sm"
            onValueChange={(next) =>
              setAddDraft((prev) => ({ ...prev, abutmentDiameter: next }))
            }
          />
          <NumericStepperInput
            value={addDraft.abutmentHeight}
            placeholder="높이"
            step={2}
            className="h-9 pr-8 text-sm"
            onValueChange={(next) =>
              setAddDraft((prev) => ({ ...prev, abutmentHeight: next }))
            }
          />
        </div>
        <div className="flex justify-end gap-1">
          <Button
            type="button"
            size="sm"
            className="h-8 px-3 text-sm"
            disabled={favoritesBusy || !canConfirmAddPreset}
            onClick={() => void confirmAddPreset()}
          >
            <Check className="mr-1 h-3.5 w-3.5" />
            저장
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-3 text-sm"
            disabled={favoritesBusy}
            onClick={cancelAddPreset}
          >
            취소
          </Button>
        </div>
      </div>
    );
  };

  const renderAddPresetButton = () => {
    if (!canManagePresets || isAddingPreset) return null;
    return (
      <button
        type="button"
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300/90 bg-slate-100/90 px-2.5 py-2 text-center text-sm font-medium text-slate-400 shadow-none hover:border-slate-400 hover:bg-slate-200/80 hover:text-slate-600"
        disabled={favoritesBusy}
        onClick={startAddPreset}
      >
        <Plus className="h-4 w-4 shrink-0" />
        추가
      </button>
    );
  };

  const renderSaveFavoriteButton = () => {
    if (!canManagePresets || !showFields) return null;
    return (
      <Button
        type="button"
        variant={canSaveFavorite ? "default" : "outline"}
        size="sm"
        className={
          canSaveFavorite
            ? "h-10 w-full text-sm"
            : "h-10 w-full border-dashed text-sm text-slate-500"
        }
        disabled={!canSaveFavorite}
        onClick={saveCurrentAsFavorite}
      >
        <Plus className="mr-1 h-4 w-4" />
        {favoritesBusy ? "저장 중..." : "현재 입력을 프리셋에 추가"}
      </Button>
    );
  };

  const renderPresets = (placement: "top" | "bottom") => {
    if (!showPresets) return null;
    // 필드가 있을 때 빈 프리셋 CTA는 필드 아래 버튼으로 처리 (높이 맞춤용 flex spacer만 유지)
    if (favorites.length === 0 && showFields) {
      return placement === "bottom" ? (
        <div className="min-h-0 flex-1" aria-hidden />
      ) : null;
    }
    const stretchList = showFields && placement === "bottom";
    return (
      <div
        className={
          placement === "top"
            ? mode === "presets"
              ? "flex min-h-0 flex-1 flex-col space-y-2 pb-1"
              : "space-y-2 pb-1"
            : mode === "presets"
              ? "flex min-h-0 flex-1 flex-col space-y-2"
              : stretchList
                ? "flex min-h-0 flex-1 flex-col space-y-2 border-t border-primary-soft pt-3"
                : "space-y-2 border-t border-primary-soft pt-3"
        }
      >
        {mode !== "presets" ? (
          <div className="flex shrink-0 items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-600">프리셋</p>
            <span className="text-xs text-slate-400">
              {favorites.length === 0 ? "없음" : "클릭하면 적용"}
            </span>
          </div>
        ) : null}
        {favorites.length === 0 && !canManagePresets ? (
          <p className="rounded-lg border border-dashed border-slate-200 bg-white/70 px-3 py-4 text-center text-sm text-slate-400">
            저장된 프리셋이 없습니다
          </p>
        ) : (
          <div
            className={cn(
              "min-h-0",
              mode === "presets" || stretchList ? "flex-1" : null,
              listClass,
            )}
          >
            {favorites.map((fav) => {
              const isEditing = canManagePresets && editingFavoriteId === fav.id;
              const isActive = favoriteKey(fav) === currentFavoriteKey;
              if (isEditing) {
                return (
                  <div
                    key={`edit-${fav.id}`}
                    className="grid grid-cols-3 gap-1.5 rounded-lg border border-primary-muted bg-white p-2"
                  >
                    <Input
                      value={editDraft.abutmentManufacturer}
                      placeholder="제조사"
                      className="h-9 text-sm"
                      onChange={(e) =>
                        setEditDraft((prev) => ({
                          ...prev,
                          abutmentManufacturer: e.target.value,
                        }))
                      }
                    />
                    <NumericStepperInput
                      value={editDraft.abutmentDiameter}
                      placeholder="직경"
                      step={0.5}
                      className="h-9 pr-8 text-sm"
                      onValueChange={(next) =>
                        setEditDraft((prev) => ({ ...prev, abutmentDiameter: next }))
                      }
                    />
                    <NumericStepperInput
                      value={editDraft.abutmentHeight}
                      placeholder="높이"
                      step={2}
                      className="h-9 pr-8 text-sm"
                      onValueChange={(next) =>
                        setEditDraft((prev) => ({ ...prev, abutmentHeight: next }))
                      }
                    />
                    <div className="col-span-3 flex justify-end gap-1">
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 px-3 text-sm"
                        disabled={favoritesBusy}
                        onClick={() => {
                          void persistFavorites(
                            favorites.map((row) =>
                              row.id === fav.id
                                ? {
                                    ...row,
                                    manufacturer: editDraft.abutmentManufacturer.trim(),
                                    diameter: editDraft.abutmentDiameter.trim(),
                                    height: editDraft.abutmentHeight.trim(),
                                  }
                                : row,
                            ),
                          ).then(() => setEditingFavoriteId(null));
                        }}
                      >
                        <Check className="mr-1 h-3.5 w-3.5" />
                        저장
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-3 text-sm"
                        onClick={() => setEditingFavoriteId(null)}
                      >
                        취소
                      </Button>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={fav.id}
                  className={
                    isActive
                      ? "flex items-center gap-1.5 rounded-xl border border-primary/70 bg-primary-muted/50 px-2.5 py-2 shadow-sm"
                      : "flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-2.5 py-2 shadow-sm"
                  }
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate rounded px-1 py-0.5 text-left text-sm font-semibold text-slate-800 hover:text-primary-strong"
                    title={favoriteLabel(fav)}
                    onClick={() =>
                      onChange({
                        abutmentManufacturer: fav.manufacturer,
                        abutmentDiameter: fav.diameter,
                        abutmentHeight: fav.height,
                      })
                    }
                  >
                    {favoriteLabel(fav)}
                  </button>
                  {canManagePresets ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-slate-400"
                        onClick={() => {
                          setIsAddingPreset(false);
                          setEditingFavoriteId(fav.id);
                          setEditDraft({
                            abutmentManufacturer: fav.manufacturer,
                            abutmentDiameter: fav.diameter,
                            abutmentHeight: fav.height,
                          });
                        }}
                        aria-label="프리셋 수정"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-slate-400 hover:text-destructive"
                        disabled={favoritesBusy}
                        onClick={() =>
                          void persistFavorites(favorites.filter((row) => row.id !== fav.id))
                        }
                        aria-label="프리셋 삭제"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  ) : null}
                </div>
              );
            })}
            {canManagePresets ? (
              <div className="sticky bottom-0 z-[1] space-y-1.5 bg-primary-soft pt-1.5">
                {renderAddPresetForm()}
                {renderAddPresetButton()}
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-primary-muted/80 bg-primary-soft/40 p-3 sm:p-4",
        mode === "presets" && "min-h-0 flex-1",
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">{heading}</p>
        {showFields ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-sm text-slate-500"
            onClick={() => onChange(emptyToothWorkAbutment())}
          >
            <X className="mr-1 h-4 w-4" />
            비우기
          </Button>
        ) : (
          <span className="text-xs text-slate-400">
            {favorites.length === 0 ? "없음" : "클릭하면 적용"}
          </span>
        )}
      </div>

      {showPresets && (presetsFirst || mode === "presets") ? renderPresets("top") : null}

      {showFields ? (
        <div className="grid shrink-0 grid-cols-2 gap-3">
          <div className="min-w-0 space-y-1.5">
            <Label className="text-sm text-slate-600">제조사</Label>
            <Input
              value={value.abutmentManufacturer}
              placeholder="예: 지오메디"
              className="h-11 px-3 text-sm"
              onChange={(e) =>
                onChange({ ...value, abutmentManufacturer: e.target.value })
              }
            />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label className="text-sm text-slate-600">직경</Label>
            <NumericStepperInput
              value={value.abutmentDiameter}
              placeholder="예: 4.5"
              step={0.5}
              className="h-11 px-3 pr-8 text-sm"
              onValueChange={(next) =>
                onChange({ ...value, abutmentDiameter: next })
              }
            />
          </div>
          <div className="min-w-0 space-y-1.5">
            <Label className="text-sm text-slate-600">높이</Label>
            <NumericStepperInput
              value={value.abutmentHeight}
              placeholder="예: 5"
              step={2}
              className="h-11 px-3 pr-8 text-sm"
              onValueChange={(next) =>
                onChange({ ...value, abutmentHeight: next })
              }
            />
          </div>
        </div>
      ) : null}

      <div className="shrink-0">{renderSaveFavoriteButton()}</div>

      {showPresets && !presetsFirst && mode !== "presets" ? renderPresets("bottom") : null}
    </div>
  );
};

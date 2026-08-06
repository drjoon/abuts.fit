// related files:
// - web/frontend/src/shared/components/practice/PracticeToothImplantFields.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/practice/transferMemo.ts
import { useState } from "react";
import { BookmarkPlus, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  emptyToothWorkAbutment,
  type PracticeAbutmentFavorite,
} from "@/shared/practice/transferMemo";

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
};

const favoriteKey = (row: {
  manufacturer: string;
  diameter: string;
  height: string;
}) => `${row.manufacturer}|${row.diameter}|${row.height}`.toLowerCase();

const favoriteLabel = (row: {
  manufacturer: string;
  diameter: string;
  height: string;
}) =>
  [row.manufacturer, row.diameter, row.height]
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .join(" / ") || "어벗 규격";

export const PracticeToothAbutmentFields = ({
  value,
  onChange,
  favorites,
  onFavoritesChange,
  heading = "커스텀어벗 규격",
  presetsFirst = false,
}: Props) => {
  const [editingFavoriteId, setEditingFavoriteId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ToothAbutmentValues>(emptyToothWorkAbutment());
  const [favoritesBusy, setFavoritesBusy] = useState(false);

  const currentFavoriteKey = favoriteKey({
    manufacturer: value.abutmentManufacturer,
    diameter: value.abutmentDiameter,
    height: value.abutmentHeight,
  });
  const canSaveFavorite =
    Boolean(onFavoritesChange) &&
    Boolean(
      value.abutmentManufacturer || value.abutmentDiameter || value.abutmentHeight,
    ) &&
    !favorites.some((row) => favoriteKey(row) === currentFavoriteKey);

  const persistFavorites = async (next: PracticeAbutmentFavorite[]) => {
    if (!onFavoritesChange) return;
    setFavoritesBusy(true);
    try {
      await onFavoritesChange(next);
    } finally {
      setFavoritesBusy(false);
    }
  };

  const renderPresets = (placement: "top" | "bottom") => {
    if (!onFavoritesChange) return null;
    return (
      <div
        className={
          placement === "top"
            ? "space-y-2 pb-1"
            : "space-y-2 border-t border-violet-100 pt-3"
        }
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-slate-600">프리셋</p>
          {favorites.length === 0 ? (
            <span className="text-xs text-slate-400">선택 후 저장</span>
          ) : (
            <span className="text-xs text-slate-400">클릭하면 적용</span>
          )}
        </div>
        {favorites.length === 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10 w-full border-dashed text-sm"
            disabled={!canSaveFavorite || favoritesBusy}
            onClick={() =>
              void persistFavorites([
                ...favorites,
                {
                  id: `abt-${Date.now().toString(36)}`,
                  manufacturer: value.abutmentManufacturer,
                  diameter: value.abutmentDiameter,
                  height: value.abutmentHeight,
                },
              ])
            }
          >
            <Plus className="mr-1 h-4 w-4" />
            현재 입력을 프리셋에 추가
          </Button>
        ) : (
          <div className="max-h-36 space-y-1.5 overflow-y-auto pr-0.5">
            {favorites.map((fav) => {
              const isEditing = editingFavoriteId === fav.id;
              const isActive = favoriteKey(fav) === currentFavoriteKey;
              if (isEditing) {
                return (
                  <div
                    key={`edit-${fav.id}`}
                    className="grid grid-cols-3 gap-1.5 rounded-lg border border-violet-200 bg-white p-2"
                  >
                    {(
                      [
                        ["abutmentManufacturer", "제조사"],
                        ["abutmentDiameter", "직경"],
                        ["abutmentHeight", "높이"],
                      ] as const
                    ).map(([key, placeholder]) => (
                      <Input
                        key={key}
                        value={editDraft[key]}
                        placeholder={placeholder}
                        className="h-9 text-sm"
                        onChange={(e) =>
                          setEditDraft((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                      />
                    ))}
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
                      ? "flex items-center gap-1 rounded-lg border border-violet-400 bg-violet-100 px-2 py-1.5"
                      : "flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5"
                  }
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate rounded px-1.5 py-1 text-left text-sm font-medium text-slate-800 hover:text-violet-700"
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-slate-400"
                    onClick={() => {
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
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3 rounded-xl border border-violet-200/80 bg-violet-50/40 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">{heading}</p>
        <div className="flex items-center gap-1">
          {canSaveFavorite ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-sm text-violet-700"
              disabled={favoritesBusy}
              onClick={() =>
                void persistFavorites([
                  ...favorites,
                  {
                    id: `abt-${Date.now().toString(36)}`,
                    manufacturer: value.abutmentManufacturer,
                    diameter: value.abutmentDiameter,
                    height: value.abutmentHeight,
                  },
                ])
              }
            >
              <BookmarkPlus className="mr-1 h-4 w-4" />
              프리셋 저장
            </Button>
          ) : null}
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
        </div>
      </div>

      {presetsFirst ? renderPresets("top") : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-1">
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
        <div className="space-y-1.5">
          <Label className="text-sm text-slate-600">직경</Label>
          <Input
            value={value.abutmentDiameter}
            placeholder="예: 4.5"
            className="h-11 px-3 text-sm"
            onChange={(e) =>
              onChange({ ...value, abutmentDiameter: e.target.value })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm text-slate-600">높이</Label>
          <Input
            value={value.abutmentHeight}
            placeholder="예: 5"
            className="h-11 px-3 text-sm"
            onChange={(e) =>
              onChange({ ...value, abutmentHeight: e.target.value })
            }
          />
        </div>
      </div>

      {!presetsFirst ? renderPresets("bottom") : null}
    </div>
  );
};

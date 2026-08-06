// related files:
// - web/frontend/src/shared/components/practice/PracticeToothImplantFields.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/practice/transferMemo.ts
import { useState } from "react";
import { BookmarkPlus, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  return (
    <div className="space-y-1.5 rounded-md border border-violet-100 bg-violet-50/40 px-2 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-slate-600">커스텀어벗 규격</p>
        <div className="flex items-center gap-1">
          {canSaveFavorite ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[11px] text-violet-700"
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
              <BookmarkPlus className="mr-0.5 h-3 w-3" />
              즐겨찾기
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[11px] text-slate-500"
            onClick={() => onChange(emptyToothWorkAbutment())}
          >
            <X className="mr-0.5 h-3 w-3" />
            비우기
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <Input
          value={value.abutmentManufacturer}
          placeholder="제조사"
          className="h-8 px-2 text-xs"
          onChange={(e) =>
            onChange({ ...value, abutmentManufacturer: e.target.value })
          }
        />
        <Input
          value={value.abutmentDiameter}
          placeholder="직경"
          className="h-8 px-2 text-xs"
          onChange={(e) =>
            onChange({ ...value, abutmentDiameter: e.target.value })
          }
        />
        <Input
          value={value.abutmentHeight}
          placeholder="높이"
          className="h-8 px-2 text-xs"
          onChange={(e) =>
            onChange({ ...value, abutmentHeight: e.target.value })
          }
        />
      </div>

      {onFavoritesChange ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-slate-500">즐겨찾기</p>
            {favorites.length === 0 ? (
              <span className="text-[10px] text-slate-400">선택 후 저장</span>
            ) : null}
          </div>
          {favorites.length === 0 ? null : (
            <div className="max-h-24 space-y-1 overflow-y-auto pr-0.5">
              {favorites.map((fav) => {
                const isEditing = editingFavoriteId === fav.id;
                if (isEditing) {
                  return (
                    <div
                      key={`edit-${fav.id}`}
                      className="grid grid-cols-3 gap-1 rounded border border-violet-200 bg-white p-1"
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
                          className="h-7 text-[11px]"
                          onChange={(e) =>
                            setEditDraft((prev) => ({ ...prev, [key]: e.target.value }))
                          }
                        />
                      ))}
                      <div className="col-span-3 flex justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          className="h-6 px-2 text-[11px]"
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
                          <Check className="mr-0.5 h-3 w-3" />
                          저장
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[11px]"
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
                    className="flex items-center gap-1 rounded border border-slate-200 bg-white/90 px-1.5 py-0.5"
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left text-[11px] text-slate-700 hover:text-violet-700"
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
                      className="h-6 w-6 text-slate-400"
                      onClick={() => {
                        setEditingFavoriteId(fav.id);
                        setEditDraft({
                          abutmentManufacturer: fav.manufacturer,
                          abutmentDiameter: fav.diameter,
                          abutmentHeight: fav.height,
                        });
                      }}
                      aria-label="즐겨찾기 수정"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-slate-400 hover:text-destructive"
                      disabled={favoritesBusy}
                      onClick={() =>
                        void persistFavorites(favorites.filter((row) => row.id !== fav.id))
                      }
                      aria-label="즐겨찾기 삭제"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
          {favorites.length === 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 w-full border-dashed text-[11px]"
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
              <Plus className="mr-1 h-3 w-3" />
              현재 선택을 즐겨찾기에 추가
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

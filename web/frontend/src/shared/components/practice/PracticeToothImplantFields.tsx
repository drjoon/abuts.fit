// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/practice/useImplantConnectionCatalog.ts
// - web/frontend/src/shared/practice/transferMemo.ts
import { useMemo, useState } from "react";
import { BookmarkPlus, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ImplantConnection } from "@/shared/practice/useImplantConnectionCatalog";
import {
  emptyToothWorkImplant,
  type PracticeImplantFavorite,
} from "@/shared/practice/transferMemo";

export type ToothImplantValues = {
  implantManufacturer: string;
  implantBrand: string;
  implantFamily: string;
  implantType: string;
};

type Props = {
  value: ToothImplantValues;
  onChange: (next: ToothImplantValues) => void;
  connections: ImplantConnection[];
  favorites: PracticeImplantFavorite[];
  onFavoritesChange?: (next: PracticeImplantFavorite[]) => void | Promise<void>;
};

const pickFirst = (arr: string[]) => arr[0] || "";
const pickPreferredFamily = (families: string[]) => {
  const regular = families.find((f) => String(f).trim().toLowerCase() === "regular");
  return regular || pickFirst(families);
};

const favoriteKey = (row: {
  manufacturer: string;
  brand: string;
  family: string;
  type: string;
}) =>
  `${row.manufacturer}|${row.brand}|${row.family}|${row.type}`.toLowerCase();

const favoriteLabel = (row: {
  manufacturer: string;
  brand: string;
  family: string;
  type: string;
}) =>
  [row.manufacturer, row.brand, row.family, row.type]
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .join(" / ") || "임플란트";

export const PracticeToothImplantFields = ({
  value,
  onChange,
  connections,
  favorites,
  onFavoritesChange,
}: Props) => {
  const [editingFavoriteId, setEditingFavoriteId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ToothImplantValues>(emptyToothWorkImplant());
  const [favoritesBusy, setFavoritesBusy] = useState(false);

  const connectionOptions = useMemo(
    () =>
      connections
        .filter(
          (c) =>
            typeof c.manufacturer === "string" &&
            typeof c.brand === "string" &&
            c.manufacturer.trim() &&
            c.brand.trim(),
        )
        .slice()
        .sort((a, b) => {
          const manufacturerCompare = a.manufacturer.localeCompare(b.manufacturer, "ko");
          if (manufacturerCompare !== 0) return manufacturerCompare;
          return String(a.brand || "").localeCompare(String(b.brand || ""), "ko");
        }),
    [connections],
  );

  const manufacturerOptions = useMemo(
    () => [...new Set(connectionOptions.map((c) => c.manufacturer))],
    [connectionOptions],
  );

  const brandOptions = useMemo(
    () => [
      ...new Set(
        connectionOptions
          .filter((c) => c.manufacturer === value.implantManufacturer)
          .map((c) => String(c.brand || "").trim())
          .filter(Boolean),
      ),
    ],
    [connectionOptions, value.implantManufacturer],
  );

  const familyOptions = useMemo(
    () => [
      ...new Set(
        connectionOptions
          .filter(
            (c) =>
              c.manufacturer === value.implantManufacturer &&
              c.brand === value.implantBrand,
          )
          .map((c) => String(c.family || "").trim())
          .filter(Boolean),
      ),
    ],
    [connectionOptions, value.implantManufacturer, value.implantBrand],
  );

  const typeOptions = useMemo(
    () => [
      ...new Set(
        connectionOptions
          .filter(
            (c) =>
              c.manufacturer === value.implantManufacturer &&
              c.brand === value.implantBrand &&
              c.family === value.implantFamily,
          )
          .map((c) => String(c.type || "").trim())
          .filter(Boolean),
      ),
    ],
    [
      connectionOptions,
      value.implantManufacturer,
      value.implantBrand,
      value.implantFamily,
    ],
  );

  const manufacturerLabelMap = useMemo(
    () =>
      new Map(
        manufacturerOptions.map((manufacturer) => {
          const sample = connectionOptions.find((c) => c.manufacturer === manufacturer);
          return [manufacturer, sample?.displayManufacturer || manufacturer];
        }),
      ),
    [connectionOptions, manufacturerOptions],
  );

  const brandLabelMap = useMemo(
    () =>
      new Map(
        brandOptions.map((brand) => {
          const sample = connectionOptions.find(
            (c) => c.manufacturer === value.implantManufacturer && c.brand === brand,
          );
          return [brand, sample?.displayBrand || brand];
        }),
      ),
    [connectionOptions, brandOptions, value.implantManufacturer],
  );

  const familyLabelMap = useMemo(
    () =>
      new Map(
        familyOptions.map((family) => {
          const sample = connectionOptions.find(
            (c) =>
              c.manufacturer === value.implantManufacturer &&
              c.brand === value.implantBrand &&
              c.family === family,
          );
          return [family, sample?.displayFamily || family];
        }),
      ),
    [connectionOptions, familyOptions, value.implantManufacturer, value.implantBrand],
  );

  const typeLabelMap = useMemo(
    () =>
      new Map(
        typeOptions.map((type) => {
          const sample = connectionOptions.find(
            (c) =>
              c.manufacturer === value.implantManufacturer &&
              c.brand === value.implantBrand &&
              c.family === value.implantFamily &&
              c.type === type,
          );
          const base = sample?.displayType || type;
          const screw = String(sample?.screwType || "").trim();
          const connRaw = Number(sample?.connectionDiameter ?? sample?.diameter);
          const conn = Number.isFinite(connRaw) ? `Ø${connRaw.toFixed(2)}` : "";
          const extra = [screw ? `스크류 ${screw}` : "", conn].filter(Boolean).join(" / ");
          return [type, extra ? `${base} / ${extra}` : base];
        }),
      ),
    [
      connectionOptions,
      typeOptions,
      value.implantManufacturer,
      value.implantBrand,
      value.implantFamily,
    ],
  );

  const getBrands = (manufacturer: string) => [
    ...new Set(
      connectionOptions
        .filter((c) => c.manufacturer === manufacturer)
        .map((c) => String(c.brand || "").trim())
        .filter(Boolean),
    ),
  ];

  const getFamilies = (manufacturer: string, brand: string) => [
    ...new Set(
      connectionOptions
        .filter((c) => c.manufacturer === manufacturer && c.brand === brand)
        .map((c) => String(c.family || "").trim())
        .filter(Boolean),
    ),
  ];

  const getTypes = (manufacturer: string, brand: string, family: string) => [
    ...new Set(
      connectionOptions
        .filter(
          (c) =>
            c.manufacturer === manufacturer &&
            c.brand === brand &&
            c.family === family,
        )
        .map((c) => String(c.type || "").trim())
        .filter(Boolean),
    ),
  ];

  const currentFavoriteKey = favoriteKey({
    manufacturer: value.implantManufacturer,
    brand: value.implantBrand,
    family: value.implantFamily,
    type: value.implantType,
  });
  const canSaveFavorite =
    Boolean(onFavoritesChange) &&
    Boolean(
      value.implantManufacturer ||
        value.implantBrand ||
        value.implantFamily ||
        value.implantType,
    ) &&
    !favorites.some((row) => favoriteKey(row) === currentFavoriteKey);

  const persistFavorites = async (next: PracticeImplantFavorite[]) => {
    if (!onFavoritesChange) return;
    setFavoritesBusy(true);
    try {
      await onFavoritesChange(next);
    } finally {
      setFavoritesBusy(false);
    }
  };

  return (
    <div className="space-y-1.5 rounded-md border border-sky-100 bg-sky-50/40 px-2 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-medium text-slate-600">임플란트</p>
        <div className="flex items-center gap-1">
          {canSaveFavorite ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-[11px] text-sky-700"
              disabled={favoritesBusy}
              onClick={() =>
                void persistFavorites([
                  ...favorites,
                  {
                    id: `imp-${Date.now().toString(36)}`,
                    manufacturer: value.implantManufacturer,
                    brand: value.implantBrand,
                    family: value.implantFamily,
                    type: value.implantType,
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
            onClick={() => onChange(emptyToothWorkImplant())}
          >
            <X className="mr-0.5 h-3 w-3" />
            비우기
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <Select
          value={value.implantManufacturer || "__empty__"}
          onValueChange={(nextManufacturerRaw) => {
            const nextManufacturer =
              nextManufacturerRaw === "__empty__" ? "" : nextManufacturerRaw;
            const nextBrand = pickFirst(getBrands(nextManufacturer));
            const nextFamily = pickPreferredFamily(getFamilies(nextManufacturer, nextBrand));
            const nextType = pickFirst(getTypes(nextManufacturer, nextBrand, nextFamily));
            onChange({
              implantManufacturer: nextManufacturer,
              implantBrand: nextBrand,
              implantFamily: nextFamily,
              implantType: nextType,
            });
          }}
        >
          <SelectTrigger className="h-8 px-2 text-xs">
            <SelectValue placeholder="제조사">
              {value.implantManufacturer
                ? manufacturerLabelMap.get(value.implantManufacturer) ||
                  value.implantManufacturer
                : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__empty__">제조사</SelectItem>
            {manufacturerOptions.map((m) => (
              <SelectItem key={`mfr-${m}`} value={m}>
                {manufacturerLabelMap.get(m) || m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={value.implantBrand || "__empty__"}
          onValueChange={(nextBrandRaw) => {
            const nextBrand = nextBrandRaw === "__empty__" ? "" : nextBrandRaw;
            const nextFamily = pickPreferredFamily(
              getFamilies(value.implantManufacturer, nextBrand),
            );
            const nextType = pickFirst(
              getTypes(value.implantManufacturer, nextBrand, nextFamily),
            );
            onChange({
              ...value,
              implantBrand: nextBrand,
              implantFamily: nextFamily,
              implantType: nextType,
            });
          }}
          disabled={!value.implantManufacturer}
        >
          <SelectTrigger className="h-8 px-2 text-xs" disabled={!value.implantManufacturer}>
            <SelectValue placeholder="브랜드">
              {value.implantBrand
                ? brandLabelMap.get(value.implantBrand) || value.implantBrand
                : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__empty__">브랜드</SelectItem>
            {brandOptions.map((b) => (
              <SelectItem key={`brand-${b}`} value={b}>
                {brandLabelMap.get(b) || b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={value.implantFamily || "__empty__"}
          onValueChange={(nextFamilyRaw) => {
            const nextFamily = nextFamilyRaw === "__empty__" ? "" : nextFamilyRaw;
            const nextType = pickFirst(
              getTypes(value.implantManufacturer, value.implantBrand, nextFamily),
            );
            onChange({
              ...value,
              implantFamily: nextFamily,
              implantType: nextType,
            });
          }}
          disabled={!value.implantBrand}
        >
          <SelectTrigger className="h-8 px-2 text-xs" disabled={!value.implantBrand}>
            <SelectValue placeholder="패밀리">
              {value.implantFamily
                ? familyLabelMap.get(value.implantFamily) || value.implantFamily
                : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__empty__">패밀리</SelectItem>
            {familyOptions.map((f) => (
              <SelectItem key={`family-${f}`} value={f}>
                {familyLabelMap.get(f) || f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={value.implantType || "__empty__"}
          onValueChange={(nextTypeRaw) => {
            const nextType = nextTypeRaw === "__empty__" ? "" : nextTypeRaw;
            onChange({
              ...value,
              implantType: nextType,
            });
          }}
          disabled={!value.implantFamily}
        >
          <SelectTrigger className="h-8 px-2 text-xs" disabled={!value.implantFamily}>
            <SelectValue placeholder="타입">
              {value.implantType
                ? typeLabelMap.get(value.implantType) || value.implantType
                : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__empty__">타입</SelectItem>
            {typeOptions.map((t) => (
              <SelectItem key={`type-${t}`} value={t}>
                {typeLabelMap.get(t) || t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                      className="grid grid-cols-2 gap-1 rounded border border-sky-200 bg-white p-1 sm:grid-cols-4"
                    >
                      {(
                        [
                          ["implantManufacturer", "제조사"],
                          ["implantBrand", "브랜드"],
                          ["implantFamily", "패밀리"],
                          ["implantType", "타입"],
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
                      <div className="col-span-2 flex justify-end gap-1 sm:col-span-4">
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
                                      manufacturer: editDraft.implantManufacturer.trim(),
                                      brand: editDraft.implantBrand.trim(),
                                      family: editDraft.implantFamily.trim(),
                                      type: editDraft.implantType.trim(),
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
                      className="min-w-0 flex-1 truncate text-left text-[11px] text-slate-700 hover:text-sky-700"
                      title={favoriteLabel(fav)}
                      onClick={() =>
                        onChange({
                          implantManufacturer: fav.manufacturer,
                          implantBrand: fav.brand,
                          implantFamily: fav.family,
                          implantType: fav.type,
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
                          implantManufacturer: fav.manufacturer,
                          implantBrand: fav.brand,
                          implantFamily: fav.family,
                          implantType: fav.type,
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
                    id: `imp-${Date.now().toString(36)}`,
                    manufacturer: value.implantManufacturer,
                    brand: value.implantBrand,
                    family: value.implantFamily,
                    type: value.implantType,
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

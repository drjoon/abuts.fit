// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/practice/useImplantConnectionCatalog.ts
// - web/frontend/src/shared/practice/transferMemo.ts
// - web/frontend/src/shared/practice/roundBarAbutment.ts
// change-log:
// - 2026-08-14: 제조사 선택 마지막에 제조사 추가 요청(환봉 헥스 사이즈 미정) + 안내 모달.
import { useMemo, useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmDialog } from "@/features/support/components/ConfirmDialog";
import type { ImplantConnection } from "@/shared/practice/useImplantConnectionCatalog";
import {
  emptyToothWorkImplant,
  type PracticeImplantFavorite,
} from "@/shared/practice/transferMemo";
import { useRequestorBusinessAccess } from "@/shared/business/useRequestorBusinessAccess";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/shared/hooks/use-toast";
import {
  MANUFACTURER_ADD_REQUEST_VALUE,
  ROUND_BAR_GUIDE_LINES,
  ROUND_BAR_GUIDE_TITLE,
  ROUND_BAR_HEX_TYPE,
  isRoundBarFavorite,
  submitRoundBarManufacturerRequest,
} from "@/shared/practice/roundBarAbutment";
import { cn } from "@/shared/ui/cn";

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
  /** 프리셋 목록을 입력 필드 위에 배치 */
  presetsFirst?: boolean;
  /** full=필드+프리셋, fields=필드만, presets=프리셋만 */
  mode?: "full" | "fields" | "presets";
  /** 프리셋 추가·수정·삭제 허용 (기본 true) */
  allowPresetEdit?: boolean;
  /** 섹션 제목 (기본: 임플란트) */
  heading?: string;
  className?: string;
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

const selectTriggerClass =
  "h-11 min-w-0 px-3 text-sm [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate [&>span]:text-left";

/** 프리셋 행(h-8 + py-1.5×2 + border 2px) × 4 + space-y-1.5 × 3. 초과 시 스크롤. */
const PRESET_LIST_CLASS =
  "max-h-[calc(4*(2.75rem+2px)+3*0.375rem)] space-y-1.5 overflow-y-auto overflow-x-hidden pr-1 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100";

export const PracticeToothImplantFields = ({
  value,
  onChange,
  connections,
  favorites,
  onFavoritesChange,
  presetsFirst = false,
  mode = "full",
  allowPresetEdit = true,
  heading = "임플란트",
  className,
}: Props) => {
  const [editingFavoriteId, setEditingFavoriteId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ToothImplantValues>(emptyToothWorkImplant());
  const [favoritesBusy, setFavoritesBusy] = useState(false);
  const [requestFormOpen, setRequestFormOpen] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [requestDraft, setRequestDraft] = useState({
    manufacturer: "",
    brand: "",
    family: "",
  });
  const { token } = useAuthStore();
  const { toast } = useToast();
  const { kind } = useRequestorBusinessAccess();
  const showFields = mode === "full" || mode === "fields";
  const showPresets = mode === "full" || mode === "presets";
  const canManagePresets = allowPresetEdit && Boolean(onFavoritesChange);
  const allowManufacturerRequest = canManagePresets && kind !== "lab";

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

  const manufacturerOptions = useMemo(() => {
    const options = [...new Set(connectionOptions.map((c) => c.manufacturer))];
    const current = String(value.implantManufacturer || "").trim();
    if (current && !options.includes(current)) options.unshift(current);
    return options;
  }, [connectionOptions, value.implantManufacturer]);

  const brandOptions = useMemo(() => {
    const options = [
      ...new Set(
        connectionOptions
          .filter((c) => c.manufacturer === value.implantManufacturer)
          .map((c) => String(c.brand || "").trim())
          .filter(Boolean),
      ),
    ];
    const current = String(value.implantBrand || "").trim();
    if (current && !options.includes(current)) options.unshift(current);
    return options;
  }, [connectionOptions, value.implantManufacturer, value.implantBrand]);

  const familyOptions = useMemo(() => {
    const options = [
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
    ];
    const current = String(value.implantFamily || "").trim();
    if (current && !options.includes(current)) options.unshift(current);
    return options;
  }, [
    connectionOptions,
    value.implantManufacturer,
    value.implantBrand,
    value.implantFamily,
  ]);

  const typeOptions = useMemo(() => {
    const options = [
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
    ];
    const current = String(value.implantType || "").trim();
    if (current && !options.includes(current)) options.unshift(current);
    return options;
  }, [
    connectionOptions,
    value.implantManufacturer,
    value.implantBrand,
    value.implantFamily,
    value.implantType,
  ]);

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
    canManagePresets &&
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
      // 서버 동기화 Promise까지 await 하지 않음 (느린 저장 중 추가 버튼이 잠기지 않게)
      void Promise.resolve(onFavoritesChange(next)).catch(() => {});
    } finally {
      setFavoritesBusy(false);
    }
  };

  const applyFavorite = (fav: PracticeImplantFavorite) => {
    onChange({
      implantManufacturer: fav.manufacturer,
      implantBrand: fav.brand,
      implantFamily: fav.family,
      implantType: fav.type,
    });
  };

  const saveCurrentAsFavorite = () =>
    void persistFavorites([
      ...favorites,
      {
        id: `imp-${Date.now().toString(36)}`,
        manufacturer: value.implantManufacturer,
        brand: value.implantBrand,
        family: value.implantFamily,
        type: value.implantType,
      },
    ]);

  const closeRequestForm = () => {
    setRequestFormOpen(false);
    setRequestDraft({ manufacturer: "", brand: "", family: "" });
  };

  const submitManufacturerRequest = async () => {
    const manufacturer = requestDraft.manufacturer.trim();
    const brand = requestDraft.brand.trim();
    const family = requestDraft.family.trim();
    if (!manufacturer || !brand || !family) {
      toast({
        title: "입력 필요",
        description: "제조사, 브랜드, 패밀리를 모두 입력해주세요.",
        variant: "destructive",
      });
      return;
    }
    const favoriteId = `imp-rb-${Date.now().toString(36)}`;
    let nextFavorite: PracticeImplantFavorite = {
      id: favoriteId,
      manufacturer,
      brand,
      family,
      type: ROUND_BAR_HEX_TYPE,
      roundBar: true,
      adopted: false,
    };
    setRequestBusy(true);
    try {
      if (token) {
        const result = await submitRoundBarManufacturerRequest({
          token,
          payload: { manufacturer, brand, family, favoriteId },
        });
        if (result.favorite?.id) {
          nextFavorite = {
            ...nextFavorite,
            ...result.favorite,
            type: ROUND_BAR_HEX_TYPE,
            roundBar: true,
          };
        }
      }
      const withoutDup = favorites.filter(
        (row) => favoriteKey(row) !== favoriteKey(nextFavorite) && row.id !== nextFavorite.id,
      );
      await persistFavorites([...withoutDup, nextFavorite]);
      onChange({
        implantManufacturer: nextFavorite.manufacturer,
        implantBrand: nextFavorite.brand,
        implantFamily: nextFavorite.family,
        implantType: ROUND_BAR_HEX_TYPE,
      });
      closeRequestForm();
      setGuideOpen(true);
    } catch (error) {
      toast({
        title: "요청 전달 실패",
        description:
          error instanceof Error ? error.message : "관리자 문의 전달에 실패했습니다.",
        variant: "destructive",
      });
      const withoutDup = favorites.filter(
        (row) => favoriteKey(row) !== favoriteKey(nextFavorite) && row.id !== nextFavorite.id,
      );
      await persistFavorites([...withoutDup, nextFavorite]);
      onChange({
        implantManufacturer: nextFavorite.manufacturer,
        implantBrand: nextFavorite.brand,
        implantFamily: nextFavorite.family,
        implantType: ROUND_BAR_HEX_TYPE,
      });
      closeRequestForm();
      setGuideOpen(true);
    } finally {
      setRequestBusy(false);
    }
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
        disabled={!canSaveFavorite || requestFormOpen}
        onClick={saveCurrentAsFavorite}
      >
        <Plus className="mr-1 h-4 w-4" />
        {favoritesBusy ? "저장 중..." : "현재 선택을 프리셋에 추가"}
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
            ? "space-y-2 pb-1"
            : mode === "presets"
              ? "space-y-2"
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
        {favorites.length === 0 ? (
          canManagePresets ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 w-full border-dashed text-sm"
              disabled={!canSaveFavorite || favoritesBusy}
              onClick={saveCurrentAsFavorite}
            >
              <Plus className="mr-1 h-4 w-4" />
              현재 선택을 프리셋에 추가
            </Button>
          ) : (
            <p className="rounded-lg border border-dashed border-slate-200 bg-white/70 px-3 py-4 text-center text-sm text-slate-400">
              저장된 프리셋이 없습니다
            </p>
          )
        ) : (
          <div className={`min-h-0 ${PRESET_LIST_CLASS}`}>
            {favorites.map((fav) => {
              const isEditing = canManagePresets && editingFavoriteId === fav.id;
              const isActive = favoriteKey(fav) === currentFavoriteKey;
              if (isEditing) {
                return (
                  <div
                    key={`edit-${fav.id}`}
                    className="grid grid-cols-2 gap-1.5 rounded-lg border border-primary-muted bg-white p-2 sm:grid-cols-4"
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
                        className="h-9 text-sm"
                        onChange={(e) =>
                          setEditDraft((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                      />
                    ))}
                    <div className="col-span-2 flex justify-end gap-1 sm:col-span-4">
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
                      ? "flex items-center gap-1 rounded-lg border border-primary/70 bg-primary-soft px-2 py-1.5"
                      : "flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5"
                  }
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center truncate rounded px-1.5 py-1 text-left text-sm font-medium text-slate-800 hover:text-primary-strong"
                    title={favoriteLabel(fav)}
                    onClick={() => applyFavorite(fav)}
                  >
                    <span className="truncate">{favoriteLabel(fav)}</span>
                    {isRoundBarFavorite(fav) ? (
                      <span
                        className={
                          fav.adopted
                            ? "ml-1.5 inline-flex rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700"
                            : "ml-1.5 inline-flex rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
                        }
                      >
                        {fav.adopted ? "도입" : "요청중"}
                      </span>
                    ) : null}
                  </button>
                  {canManagePresets ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0 text-slate-400"
                        onClick={() => {
                          setEditingFavoriteId(fav.id);
                          setEditDraft({
                            implantManufacturer: fav.manufacturer,
                            implantBrand: fav.brand,
                            implantFamily: fav.family,
                            implantType: fav.type,
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
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-primary-muted/80 bg-primary-soft/50 p-3 sm:p-4",
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
            onClick={() => {
              closeRequestForm();
              onChange(emptyToothWorkImplant());
            }}
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

      {showFields && requestFormOpen ? (
        <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-sm text-slate-600">제조사</Label>
            <Input
              value={requestDraft.manufacturer}
              placeholder="제조사 입력"
              className="h-11 text-sm"
              onChange={(e) =>
                setRequestDraft((prev) => ({ ...prev, manufacturer: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm text-slate-600">브랜드</Label>
            <Input
              value={requestDraft.brand}
              placeholder="브랜드 입력"
              className="h-11 text-sm"
              onChange={(e) =>
                setRequestDraft((prev) => ({ ...prev, brand: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm text-slate-600">패밀리</Label>
            <Input
              value={requestDraft.family}
              placeholder="패밀리 입력"
              className="h-11 text-sm"
              onChange={(e) =>
                setRequestDraft((prev) => ({ ...prev, family: e.target.value }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm text-slate-600">타입</Label>
            <Input value={ROUND_BAR_HEX_TYPE} readOnly className="h-11 bg-slate-50 text-sm" />
          </div>
          <div className="col-span-1 flex gap-2 sm:col-span-2">
            <Button
              type="button"
              className="h-10 flex-1 text-sm"
              disabled={requestBusy}
              onClick={() => void submitManufacturerRequest()}
            >
              {requestBusy ? "요청 중..." : "요청"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 flex-1 text-sm"
              disabled={requestBusy}
              onClick={closeRequestForm}
            >
              취소
            </Button>
          </div>
        </div>
      ) : null}

      {showFields && !requestFormOpen ? (
        <div className="grid shrink-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-sm text-slate-600">제조사</Label>
            <Select
              value={value.implantManufacturer || undefined}
              onValueChange={(nextManufacturer) => {
                if (nextManufacturer === MANUFACTURER_ADD_REQUEST_VALUE) {
                  setRequestDraft({
                    manufacturer: "",
                    brand: "",
                    family: "",
                  });
                  setRequestFormOpen(true);
                  return;
                }
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
              <SelectTrigger className={selectTriggerClass}>
                <SelectValue placeholder="제조사 선택" />
              </SelectTrigger>
              <SelectContent>
                {manufacturerOptions.map((m) => (
                  <SelectItem key={`mfr-${m}`} value={m} className="text-sm">
                    {manufacturerLabelMap.get(m) || m}
                  </SelectItem>
                ))}
                {allowManufacturerRequest ? (
                  <>
                    <SelectSeparator />
                    <SelectItem
                      value={MANUFACTURER_ADD_REQUEST_VALUE}
                      className="text-sm font-semibold text-primary-strong"
                    >
                      제조사 추가 요청
                    </SelectItem>
                  </>
                ) : null}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm text-slate-600">브랜드</Label>
            <Select
              value={value.implantBrand || undefined}
              onValueChange={(nextBrand) => {
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
              <SelectTrigger className={selectTriggerClass} disabled={!value.implantManufacturer}>
                <SelectValue placeholder="브랜드 선택" />
              </SelectTrigger>
              <SelectContent>
                {brandOptions.map((b) => (
                  <SelectItem key={`brand-${b}`} value={b} className="text-sm">
                    {brandLabelMap.get(b) || b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm text-slate-600">패밀리</Label>
            <Select
              value={value.implantFamily || undefined}
              onValueChange={(nextFamily) => {
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
              <SelectTrigger className={selectTriggerClass} disabled={!value.implantBrand}>
                <SelectValue placeholder="패밀리 선택" />
              </SelectTrigger>
              <SelectContent>
                {familyOptions.map((f) => (
                  <SelectItem key={`family-${f}`} value={f} className="text-sm">
                    {familyLabelMap.get(f) || f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm text-slate-600">타입</Label>
            <Select
              value={value.implantType || undefined}
              onValueChange={(nextType) => {
                onChange({
                  ...value,
                  implantType: nextType,
                });
              }}
              disabled={!value.implantFamily}
            >
              <SelectTrigger className={selectTriggerClass} disabled={!value.implantFamily}>
                <SelectValue placeholder="타입 선택" />
              </SelectTrigger>
              <SelectContent>
                {typeOptions.map((t) => (
                  <SelectItem key={`type-${t}`} value={t} className="text-sm">
                    {typeLabelMap.get(t) || t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}

      <div className="shrink-0">{requestFormOpen ? null : renderSaveFavoriteButton()}</div>

      {showPresets && !presetsFirst && mode !== "presets" ? renderPresets("bottom") : null}

      <ConfirmDialog
        open={guideOpen}
        title={ROUND_BAR_GUIDE_TITLE}
        description={
          <>
            {ROUND_BAR_GUIDE_LINES[0]}
            <br />
            {ROUND_BAR_GUIDE_LINES[1]}
          </>
        }
        confirmLabel="확인"
        cancelLabel="닫기"
        confirmTone="primary"
        onConfirm={() => setGuideOpen(false)}
        onCancel={() => setGuideOpen(false)}
      />
    </div>
  );
};

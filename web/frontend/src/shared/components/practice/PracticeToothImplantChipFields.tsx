// related files:
// - web/frontend/src/shared/components/practice/PracticeToothChoiceChips.tsx
// - web/frontend/src/shared/components/practice/PracticeToothCompanySpecFields.tsx
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/practice/transferMemo.ts
// - web/frontend/src/shared/practice/cncImplantCatalog.ts
// change-log:
// - 2026-09-14: 제조사 선택 시 BA favorites 직전 규격 복원·완전 선택 시 favorites 선두 저장.
// - 2026-09-14: CNC 6메이저(첨1) 하드코딩 기본 표시. 사용자 추가만 favorites. 내장은 삭제·이름변경 불가.
// - 2026-09-14: ChoiceChip 공통 모듈(PracticeToothChoiceChips) 사용.
// - 2026-09-14: 스캔바디 2/2 칩 UI와 동일 — 제조사·브랜드·패밀리·타입. 비우기·편집(X·추가·드래그·라벨변경).
import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import type { ImplantConnection } from "@/shared/practice/useImplantConnectionCatalog";
import {
  emptyToothWorkImplant,
  listImplantChipOptionsWithCatalog,
  mergeImplantChipFavorite,
  removeImplantChipBrand,
  removeImplantChipFamily,
  removeImplantChipManufacturer,
  removeImplantChipType,
  renameImplantChipBrand,
  renameImplantChipFamily,
  renameImplantChipManufacturer,
  renameImplantChipType,
  reorderImplantChipBrands,
  reorderImplantChipFamilies,
  reorderImplantChipManufacturers,
  reorderImplantChipTypes,
  type ImplantChipOptionItem,
  type PracticeImplantFavorite,
} from "@/shared/practice/transferMemo";
import {
  enrichImplantFavoriteFromCatalog,
  isManufacturerAddRequestFavorite,
  isPendingAbutmentAdoptionWithCatalog,
  resolveAbutmentAdoptionStatusWithCatalog,
  IMPLANT_ADD_REQUEST_OPTION,
} from "@/shared/practice/roundBarAbutment";
import {
  PracticeToothChipAddButton,
  PracticeToothChipInlineEditor,
  PracticeToothChipPanel,
  PracticeToothChipSectionHeader,
  PracticeToothChoiceChip,
  usePracticeToothChipEdit,
} from "@/shared/components/practice/PracticeToothChoiceChips";

export type ToothImplantChipValues = {
  implantManufacturer: string;
  implantBrand: string;
  implantFamily: string;
  implantType: string;
  implantAddRequest?: boolean;
};

type Props = {
  value: ToothImplantChipValues;
  onChange: (next: ToothImplantChipValues) => void;
  favorites: PracticeImplantFavorite[];
  onFavoritesChange?: (next: PracticeImplantFavorite[]) => void | Promise<void>;
  connections?: ImplantConnection[];
  heading?: string;
  className?: string;
  allowPresetEdit?: boolean;
};

type DragKind = "manufacturer" | "brand" | "family" | "type";

const chipKey = (name: string) => String(name || "").trim().toLowerCase();

const optionMatches = (item: ImplantChipOptionItem, selected: string) => {
  const token = chipKey(selected);
  if (!token) return false;
  return chipKey(item.value) === token || chipKey(item.label) === token;
};

export const PracticeToothImplantChipFields = ({
  value,
  onChange,
  favorites,
  onFavoritesChange,
  connections = [],
  heading = "임플란트",
  className,
  allowPresetEdit = true,
}: Props) => {
  const [favoritesBusy, setFavoritesBusy] = useState(false);
  const canManage = allowPresetEdit && Boolean(onFavoritesChange);
  const edit = usePracticeToothChipEdit<DragKind>({ canManage });

  const manufacturer = String(value.implantManufacturer || "").trim();
  const brand = String(value.implantBrand || "").trim();
  const family = String(value.implantFamily || "").trim();
  const type = String(value.implantType || "").trim();

  const options = useMemo(
    () =>
      listImplantChipOptionsWithCatalog(favorites, connections, {
        manufacturer,
        brand,
        family,
      }),
    [favorites, connections, manufacturer, brand, family],
  );

  const persistFavorites = async (next: PracticeImplantFavorite[]) => {
    if (!onFavoritesChange) return;
    setFavoritesBusy(true);
    try {
      void Promise.resolve(onFavoritesChange(next)).catch(() => {});
    } finally {
      setFavoritesBusy(false);
    }
  };

  const findMatchingFavorite = (next: {
    manufacturer: string;
    brand: string;
    family: string;
    type: string;
  }): PracticeImplantFavorite | null => {
    const mKey = chipKey(next.manufacturer);
    const bKey = chipKey(next.brand);
    const fKey = chipKey(next.family);
    const tKey = chipKey(next.type);
    if (!mKey || !bKey || !fKey || !tKey) return null;
    return (
      favorites.find(
        (row) =>
          chipKey(String(row.manufacturer || "")) === mKey &&
          chipKey(String(row.brand || "")) === bKey &&
          chipKey(String(row.family || "")) === fKey &&
          chipKey(String(row.type || "")) === tKey,
      ) || null
    );
  };

  const emitSelection = (next: {
    manufacturer: string;
    brand: string;
    family: string;
    type: string;
  }) => {
    const fav = findMatchingFavorite(next);
    if (fav) {
      const enriched = enrichImplantFavoriteFromCatalog(fav, connections);
      const addRequest = isManufacturerAddRequestFavorite(enriched);
      const pendingUnsupported =
        addRequest ||
        isPendingAbutmentAdoptionWithCatalog(enriched, connections);
      onChange({
        implantManufacturer: enriched.manufacturer,
        implantBrand: enriched.brand,
        implantFamily: enriched.family,
        implantType: addRequest
          ? IMPLANT_ADD_REQUEST_OPTION
          : enriched.type,
        implantAddRequest: pendingUnsupported,
      });
      if (
        enriched.manufacturer &&
        enriched.brand &&
        enriched.family &&
        (addRequest ? true : enriched.type)
      ) {
        rememberLastSelection({
          manufacturer: enriched.manufacturer,
          brand: enriched.brand,
          family: enriched.family,
          type: addRequest ? IMPLANT_ADD_REQUEST_OPTION : enriched.type,
        });
      }
      return;
    }
    const synthetic = enrichImplantFavoriteFromCatalog(
      {
        id: "cnc-chip",
        manufacturer: next.manufacturer,
        brand: next.brand,
        family: next.family,
        type: next.type,
      },
      connections,
    );
    const nextValues = {
      implantManufacturer: synthetic.manufacturer || next.manufacturer,
      implantBrand: synthetic.brand || next.brand,
      implantFamily: synthetic.family || next.family,
      implantType: synthetic.type || next.type,
      implantAddRequest: isPendingAbutmentAdoptionWithCatalog(
        synthetic,
        connections,
      ),
    };
    onChange(nextValues);
    if (
      nextValues.implantManufacturer &&
      nextValues.implantBrand &&
      nextValues.implantFamily &&
      nextValues.implantType
    ) {
      rememberLastSelection({
        manufacturer: nextValues.implantManufacturer,
        brand: nextValues.implantBrand,
        family: nextValues.implantFamily,
        type: nextValues.implantType,
      });
    }
  };

  /** BA favorites 선두에 직전 완전 선택 저장(제조사별 복원용) */
  const rememberLastSelection = (next: {
    manufacturer: string;
    brand: string;
    family: string;
    type: string;
  }) => {
    if (!onFavoritesChange) return;
    const manufacturer = String(next.manufacturer || "").trim();
    const brand = String(next.brand || "").trim();
    const family = String(next.family || "").trim();
    const type = String(next.type || "").trim();
    if (!manufacturer || !brand || !family || !type) return;
    const key = `${manufacturer}|${brand}|${family}|${type}`.toLowerCase();
    const rest = favorites.filter(
      (row) =>
        `${String(row.manufacturer || "").trim()}|${String(row.brand || "").trim()}|${String(row.family || "").trim()}|${String(row.type || "").trim()}`.toLowerCase() !==
        key,
    );
    const existing = favorites.find(
      (row) =>
        `${String(row.manufacturer || "").trim()}|${String(row.brand || "").trim()}|${String(row.family || "").trim()}|${String(row.type || "").trim()}`.toLowerCase() ===
        key,
    );
    void persistFavorites(
      [
        existing || {
          id: `imp-${Date.now().toString(36)}`,
          manufacturer,
          brand,
          family,
          type,
        },
        ...rest,
      ].slice(0, 40),
    );
  };

  const recallForManufacturer = (nextManufacturer: string) => {
    const mKeys = new Set<string>([chipKey(nextManufacturer)]);
    for (const item of options.manufacturers) {
      if (optionMatches(item, nextManufacturer)) {
        mKeys.add(chipKey(item.value));
        mKeys.add(chipKey(item.label));
      }
    }
    const hit = favorites.find((row) => {
      if (!mKeys.has(chipKey(String(row.manufacturer || "")))) return false;
      return Boolean(
        String(row.brand || "").trim() &&
          String(row.family || "").trim() &&
          String(row.type || "").trim(),
      );
    });
    if (!hit) return null;
    // 칩 value(캐논)로 제조사 유지 — brand/family/type은 BA 직전값
    return {
      manufacturer: nextManufacturer,
      brand: String(hit.brand || "").trim(),
      family: String(hit.family || "").trim(),
      type: String(hit.type || "").trim(),
    };
  };

  const autoFillLower = (
    nextManufacturer: string,
    nextBrand = "",
    nextFamily = "",
  ) => {
    const recalled =
      !nextBrand && !nextFamily
        ? recallForManufacturer(nextManufacturer)
        : null;
    if (recalled) return recalled;

    const opts = listImplantChipOptionsWithCatalog(favorites, connections, {
      manufacturer: nextManufacturer,
      brand: nextBrand,
      family: nextFamily,
    });
    const brandOut =
      nextBrand ||
      (opts.brands.length === 1 ? opts.brands[0]?.value || "" : "");
    const familyOpts = listImplantChipOptionsWithCatalog(
      favorites,
      connections,
      {
        manufacturer: nextManufacturer,
        brand: brandOut,
      },
    );
    const familyOut =
      nextFamily ||
      (brandOut && familyOpts.families.length === 1
        ? familyOpts.families[0]?.value || ""
        : "");
    const typeOpts = listImplantChipOptionsWithCatalog(
      favorites,
      connections,
      {
        manufacturer: nextManufacturer,
        brand: brandOut,
        family: familyOut,
      },
    );
    const typeOut =
      familyOut && typeOpts.types.length === 1
        ? typeOpts.types[0]?.value || ""
        : "";
    return {
      manufacturer: nextManufacturer,
      brand: brandOut,
      family: familyOut,
      type: typeOut,
    };
  };

  const confirmRename = async () => {
    if (!edit.renameTarget) return;
    const nextLabel = String(edit.renameDraft || "").trim();
    if (!nextLabel) return;
    const { kind, from } = edit.renameTarget;
    if (nextLabel === from) {
      edit.cancelRename();
      return;
    }

    const builtinBlocked =
      (kind === "manufacturer" &&
        options.manufacturers.some(
          (item) => item.builtin && optionMatches(item, from),
        )) ||
      (kind === "brand" &&
        options.brands.some(
          (item) => item.builtin && optionMatches(item, from),
        )) ||
      (kind === "family" &&
        options.families.some(
          (item) => item.builtin && optionMatches(item, from),
        )) ||
      (kind === "type" &&
        options.types.some(
          (item) => item.builtin && optionMatches(item, from),
        ));
    if (builtinBlocked) {
      edit.cancelRename();
      return;
    }

    if (kind === "manufacturer") {
      const merged = renameImplantChipManufacturer(favorites, from, nextLabel);
      await persistFavorites(merged);
      if (chipKey(manufacturer) === chipKey(from)) {
        emitSelection({ manufacturer: nextLabel, brand, family, type });
      }
      edit.cancelRename();
      return;
    }

    if (!manufacturer) return;

    if (kind === "brand") {
      const merged = renameImplantChipBrand(
        favorites,
        manufacturer,
        from,
        nextLabel,
      );
      await persistFavorites(merged);
      emitSelection({
        manufacturer,
        brand: chipKey(brand) === chipKey(from) ? nextLabel : brand,
        family,
        type,
      });
      edit.cancelRename();
      return;
    }

    if (!brand) return;

    if (kind === "family") {
      const merged = renameImplantChipFamily(
        favorites,
        manufacturer,
        brand,
        from,
        nextLabel,
      );
      await persistFavorites(merged);
      emitSelection({
        manufacturer,
        brand,
        family: chipKey(family) === chipKey(from) ? nextLabel : family,
        type,
      });
      edit.cancelRename();
      return;
    }

    if (!family) return;

    const merged = renameImplantChipType(
      favorites,
      manufacturer,
      brand,
      family,
      from,
      nextLabel,
    );
    await persistFavorites(merged);
    emitSelection({
      manufacturer,
      brand,
      family,
      type: chipKey(type) === chipKey(from) ? nextLabel : type,
    });
    edit.cancelRename();
  };

  const reorderForKind = (
    kind: DragKind,
    fromIndex: number,
    toIndex: number,
  ) => {
    if (kind === "manufacturer") {
      void persistFavorites(
        reorderImplantChipManufacturers(favorites, fromIndex, toIndex),
      );
    } else if (kind === "brand" && manufacturer) {
      void persistFavorites(
        reorderImplantChipBrands(favorites, manufacturer, fromIndex, toIndex),
      );
    } else if (kind === "family" && manufacturer && brand) {
      void persistFavorites(
        reorderImplantChipFamilies(
          favorites,
          manufacturer,
          brand,
          fromIndex,
          toIndex,
        ),
      );
    } else if (kind === "type" && manufacturer && brand && family) {
      void persistFavorites(
        reorderImplantChipTypes(
          favorites,
          manufacturer,
          brand,
          family,
          fromIndex,
          toIndex,
        ),
      );
    }
  };

  const selectManufacturer = (next: string) => {
    if (chipKey(manufacturer) === chipKey(next)) {
      if (options.manufacturers.length <= 1) return;
      const item = options.manufacturers.find((row) =>
        optionMatches(row, next),
      );
      if (item?.builtin) return;
      onChange(emptyToothWorkImplant());
      return;
    }
    emitSelection(autoFillLower(next));
  };

  const selectBrand = (next: string) => {
    if (!manufacturer) return;
    if (chipKey(brand) === chipKey(next)) {
      if (options.brands.length <= 1) return;
      const item = options.brands.find((row) => optionMatches(row, next));
      if (item?.builtin) return;
      emitSelection({ manufacturer, brand: "", family: "", type: "" });
      return;
    }
    emitSelection(autoFillLower(manufacturer, next));
  };

  const selectFamily = (next: string) => {
    if (!manufacturer || !brand) return;
    if (chipKey(family) === chipKey(next)) {
      if (options.families.length <= 1) return;
      const item = options.families.find((row) => optionMatches(row, next));
      if (item?.builtin) return;
      emitSelection({ manufacturer, brand, family: "", type: "" });
      return;
    }
    emitSelection(autoFillLower(manufacturer, brand, next));
  };

  const selectType = (next: string) => {
    if (!manufacturer || !brand || !family) return;
    if (chipKey(type) === chipKey(next)) {
      if (options.types.length <= 1) return;
      const item = options.types.find((row) => optionMatches(row, next));
      if (item?.builtin) return;
      emitSelection({ manufacturer, brand, family, type: "" });
      return;
    }
    emitSelection({ manufacturer, brand, family, type: next });
  };

  const hasAny = Boolean(manufacturer || brand || family || type);

  const selectionStatus = useMemo(() => {
    if (!manufacturer || !brand || !family || !type) return null;
    const fav = findMatchingFavorite({
      manufacturer,
      brand,
      family,
      type,
    });
    const status = resolveAbutmentAdoptionStatusWithCatalog(
      fav || { manufacturer, brand, family, type },
      connections,
    );
    if (status === "adopting") return "도입중";
    if (status === "requesting") return "요청중";
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manufacturer, brand, family, type, favorites, connections]);

  useEffect(() => {
    if (edit.showPresetActions) return;
    if (options.manufacturers.length !== 1) return;
    const sole = options.manufacturers[0];
    if (!sole || sole.builtin || manufacturer) return;
    emitSelection(autoFillLower(sole.value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.manufacturers, manufacturer, edit.showPresetActions, favorites]);

  const confirmAdd = async () => {
    const text = String(edit.addDraft || "").trim();
    if (!text || !edit.addRow) return;
    edit.cancelRename();

    if (edit.addRow === "manufacturer") {
      const merged = mergeImplantChipFavorite(favorites, {
        manufacturer: text,
      });
      await persistFavorites(merged);
      emitSelection(autoFillLower(text));
      edit.cancelAdd();
      return;
    }

    if (!manufacturer) return;

    if (edit.addRow === "brand") {
      const merged = mergeImplantChipFavorite(favorites, {
        manufacturer,
        brand: text,
      });
      await persistFavorites(merged);
      emitSelection(autoFillLower(manufacturer, text));
      edit.cancelAdd();
      return;
    }

    if (!brand) return;

    if (edit.addRow === "family") {
      const merged = mergeImplantChipFavorite(favorites, {
        manufacturer,
        brand,
        family: text,
      });
      await persistFavorites(merged);
      emitSelection(autoFillLower(manufacturer, brand, text));
      edit.cancelAdd();
      return;
    }

    if (!family) return;

    const merged = mergeImplantChipFavorite(favorites, {
      manufacturer,
      brand,
      family,
      type: text,
    });
    await persistFavorites(merged);
    emitSelection({ manufacturer, brand, family, type: text });
    edit.cancelAdd();
  };

  const deleteManufacturer = async (name: string) => {
    const item = options.manufacturers.find((row) => optionMatches(row, name));
    if (item?.builtin) return;
    const next = removeImplantChipManufacturer(favorites, name);
    await persistFavorites(next);
    if (chipKey(manufacturer) === chipKey(name)) {
      onChange(emptyToothWorkImplant());
    }
  };

  const deleteBrand = async (option: string) => {
    if (!manufacturer) return;
    const item = options.brands.find((row) => optionMatches(row, option));
    if (item?.builtin) return;
    const next = removeImplantChipBrand(favorites, manufacturer, option);
    await persistFavorites(next);
    const opts = listImplantChipOptionsWithCatalog(next, connections, {
      manufacturer,
    });
    emitSelection({
      manufacturer,
      brand:
        chipKey(brand) === chipKey(option)
          ? ""
          : opts.brands.some((b) => optionMatches(b, brand))
            ? brand
            : "",
      family: "",
      type: "",
    });
  };

  const deleteFamily = async (option: string) => {
    if (!manufacturer || !brand) return;
    const item = options.families.find((row) => optionMatches(row, option));
    if (item?.builtin) return;
    const next = removeImplantChipFamily(
      favorites,
      manufacturer,
      brand,
      option,
    );
    await persistFavorites(next);
    const opts = listImplantChipOptionsWithCatalog(next, connections, {
      manufacturer,
      brand,
    });
    emitSelection({
      manufacturer,
      brand,
      family:
        chipKey(family) === chipKey(option)
          ? ""
          : opts.families.some((f) => optionMatches(f, family))
            ? family
            : "",
      type: "",
    });
  };

  const deleteType = async (option: string) => {
    if (!manufacturer || !brand || !family) return;
    const item = options.types.find((row) => optionMatches(row, option));
    if (item?.builtin) return;
    const next = removeImplantChipType(
      favorites,
      manufacturer,
      brand,
      family,
      option,
    );
    await persistFavorites(next);
    const opts = listImplantChipOptionsWithCatalog(next, connections, {
      manufacturer,
      brand,
      family,
    });
    emitSelection({
      manufacturer,
      brand,
      family,
      type:
        chipKey(type) === chipKey(option)
          ? ""
          : opts.types.some((t) => optionMatches(t, type))
            ? type
            : "",
    });
  };

  const renderChipRow = ({
    label,
    kind,
    items,
    selected,
    onSelect,
    onDelete,
    canShow,
    lockedHint,
    emptyHint,
  }: {
    label: string;
    kind: DragKind;
    items: ImplantChipOptionItem[];
    selected: string;
    onSelect: (next: string) => void;
    onDelete: (next: string) => void;
    canShow: boolean;
    lockedHint: string;
    emptyHint: string;
  }) => (
    <div className="space-y-1.5">
      <Label className="text-sm text-slate-600">{label}</Label>
      {!canShow ? (
        <p className="text-xs text-slate-400">{lockedHint}</p>
      ) : (
        <div className="space-y-1.5">
          <div className="flex flex-wrap gap-1.5">
            {items.map((item, index) =>
              !item.builtin && edit.isRenaming(kind, item.value) ? (
                <PracticeToothChipInlineEditor
                  key={`rename-${kind}-${item.value}`}
                  value={edit.renameDraft}
                  placeholder="라벨 변경"
                  busy={favoritesBusy}
                  size="wide"
                  grow
                  onChange={edit.setRenameDraft}
                  onCancel={edit.cancelRename}
                  onConfirm={() => void confirmRename()}
                />
              ) : (
                <PracticeToothChoiceChip
                  key={`${kind}-${item.value}`}
                  accent="primary"
                  label={item.label}
                  active={optionMatches(item, selected)}
                  fill
                  onClick={() =>
                    edit.runChipClick(() => {
                      if (edit.showPresetActions) {
                        if (item.builtin) {
                          onSelect(item.value);
                          return;
                        }
                        edit.startRename(kind, item.value);
                        return;
                      }
                      onSelect(item.value);
                    })
                  }
                  onDelete={
                    edit.showPresetActions && !item.builtin
                      ? () => void onDelete(item.value)
                      : undefined
                  }
                  {...(item.builtin
                    ? {}
                    : edit.chipDragProps(kind, index, (from, to) =>
                        reorderForKind(kind, from, to),
                      ))}
                />
              ),
            )}
          </div>
          {edit.showPresetActions ? (
            edit.addRow === kind ? (
              <PracticeToothChipInlineEditor
                value={edit.addDraft}
                placeholder={label}
                busy={favoritesBusy}
                size="wide"
                onChange={edit.setAddDraft}
                onCancel={edit.cancelAdd}
                onConfirm={() => void confirmAdd()}
              />
            ) : (
              <PracticeToothChipAddButton
                accent="primary"
                disabled={favoritesBusy}
                onClick={() => edit.beginAdd(kind)}
              />
            )
          ) : items.length === 0 ? (
            <p className="text-xs text-slate-400">{emptyHint}</p>
          ) : null}
        </div>
      )}
    </div>
  );

  return (
    <PracticeToothChipPanel accent="primary" className={className}>
      <PracticeToothChipSectionHeader
        accent="primary"
        heading={heading}
        badge={
          selectionStatus ? (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">
              {selectionStatus}
            </span>
          ) : null
        }
        canClear={hasAny}
        onClear={() => onChange(emptyToothWorkImplant())}
        canEdit={canManage}
        editMode={edit.presetEditMode}
        onToggleEdit={edit.toggleEditMode}
      />

      {renderChipRow({
        label: "제조사",
        kind: "manufacturer",
        items: options.manufacturers,
        selected: manufacturer,
        onSelect: selectManufacturer,
        onDelete: deleteManufacturer,
        canShow: true,
        lockedHint: "",
        emptyHint: canManage
          ? "편집에서 제조사를 추가하세요"
          : "저장된 제조사가 없습니다",
      })}

      {renderChipRow({
        label: "브랜드",
        kind: "brand",
        items: options.brands,
        selected: brand,
        onSelect: selectBrand,
        onDelete: deleteBrand,
        canShow: Boolean(manufacturer),
        lockedHint: "제조사를 먼저 선택하세요",
        emptyHint: "브랜드 프리셋이 없습니다",
      })}

      {renderChipRow({
        label: "패밀리",
        kind: "family",
        items: options.families,
        selected: family,
        onSelect: selectFamily,
        onDelete: deleteFamily,
        canShow: Boolean(manufacturer && brand),
        lockedHint: "브랜드를 먼저 선택하세요",
        emptyHint: "패밀리 프리셋이 없습니다",
      })}

      {renderChipRow({
        label: "타입",
        kind: "type",
        items: options.types,
        selected: type,
        onSelect: selectType,
        onDelete: deleteType,
        canShow: Boolean(manufacturer && brand && family),
        lockedHint: "패밀리를 먼저 선택하세요",
        emptyHint: "타입 프리셋이 없습니다",
      })}
    </PracticeToothChipPanel>
  );
};

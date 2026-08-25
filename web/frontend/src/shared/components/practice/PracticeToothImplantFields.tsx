// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/practice/useImplantConnectionCatalog.ts
// - web/frontend/src/shared/practice/transferMemo.ts
// - web/frontend/src/shared/practice/roundBarAbutment.ts
// change-log:
// - 2026-08-26: OR(` | `) 결합값을 드롭다운에서 개별 옵션으로 전개.
// - 2026-08-26: 브랜드 매칭·드롭다운 대소문자 무시(철자 같으면 동일).
// - 2026-08-26: 패밀리 드롭다운을 카탈로그(브랜드별) 한정. CNC SSOT·표준 4종 일괄 노출 제거.
// - 2026-08-26: 프리셋 도입중 뱃지 — 카탈로그 일치 시 isPublic/roundBar 플래그 보강.
// - 2026-08-26: 프리셋 추가/수정 제조사 드롭다운에 관리자 공개(도입중) 스펙·삭제 반영.
// - 2026-08-26: 프리셋 라벨 카탈로그 display* 우선(혼합 대소문자 NeoBiotech 유지).
// - 2026-08-26: 요청중→도입중(공개)→도입(뱃지 제거). 미도입은 제조사·견적 제외.
// - 2026-08-25: presets 목록 최소 높이 축소(커스텀어벗 설정 모달 세로·3열 대응).
// - 2026-08-21: 요청중(임플란트 추가 요청) 프리셋도 클릭 선택·활성 표시. 레거시 type=헥스 키 정규화.
// - 2026-08-21: 프리셋 추가는 목록 sticky 하단(스크롤 시에만 고정). 스캔바디와 독립.
// - 2026-08-21: 프리셋 라벨 2줄(제조사·브랜드 / 패밀리·타입). 추가요청 메모는 제조사만+요청중.
// - 2026-08-21: presets 추가=인라인 CNC 드롭다운. 없으면 임플란트 추가 요청(메모 1줄).
// - 2026-08-21: presets 모드에서 목록을 더 길게, 추가 버튼·수정·삭제 관리 UI 노출.
// - 2026-08-14: 추가한 패밀리는 select 항목 옆 X로 삭제.
// - 2026-08-14: 패밀리 선택 Regular/Mini/Narrow/Small Narrow 고정 + 패밀리 추가.
// - 2026-08-14: 제조사 선택 CNC 위·환봉 아래 + 구분선. 환봉은 별도 값이라 카탈로그와 겹쳐도 보임.
// - 2026-08-14: 도입된 프리셋 스펙을 제조사·브랜드·패밀리·타입 선택에 합친다.
// - 2026-08-14: 환봉 도입 배지 라벨을 「환봉」으로 표시.
// - 2026-08-14: 도입 배지에 CNC/환봉 종류 표시.
// - 2026-08-14: 제조사 선택 마지막에 임플란트 추가 요청(환봉 헥스 사이즈 미정) + 안내 모달.
import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
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
  MANUFACTURER_ADD_REQUEST_BRAND,
  MANUFACTURER_ADD_REQUEST_FAMILY,
  MANUFACTURER_ADD_REQUEST_VALUE,
  IMPLANT_ADD_REQUEST_OPTION,
  ROUND_BAR_GUIDE_LINES,
  ROUND_BAR_GUIDE_TITLE,
  isManufacturerAddRequestFavorite,
  isPendingAbutmentAdoptionWithCatalog,
  isRoundBarFavorite,
  enrichImplantFavoriteFromCatalog,
  resolveAbutmentAdoptionStatusWithCatalog,
  submitRoundBarManufacturerRequest,
  expandRoundBarOrCombos,
  splitOrValues,
} from "@/shared/practice/roundBarAbutment";
import { mergeCncImplantSpecs } from "@/shared/practice/cncImplantCatalog";
import { implantFavoriteDisplayParts } from "@/shared/practice/implantDisplay";
import { cn } from "@/shared/ui/cn";

export type ToothImplantValues = {
  implantManufacturer: string;
  implantBrand: string;
  implantFamily: string;
  implantType: string;
  /** 「임플란트 추가 요청」옵션 · 요청중/도입중(미도입) */
  implantAddRequest?: boolean;
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
  /** @deprecated presets 추가는 인라인 드롭다운으로 처리. 무시됨. */
  onAddPreset?: () => void;
  /** 섹션 제목 (기본: 임플란트) */
  heading?: string;
  className?: string;
  /** 가이드투어: 프리셋이 없을 때 추가 폼을 자동으로 연다 */
  guideOpenAdd?: boolean;
};

const STANDARD_IMPLANT_FAMILIES = ["Regular", "Mini", "Narrow", "Small Narrow"] as const;
const FAMILY_ADD_VALUE = "__add_family__";
const ROUND_BAR_MFR_PREFIX = "__rb_mfr__:";

const pickFirst = (arr: string[]) => arr[0] || "";
const uniqueStrings = (values: Array<string | undefined | null>) => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = String(raw || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
};
const manufacturerKey = (value: string) => String(value || "").trim().toLowerCase();
const sameManufacturer = (a: string, b: string) => {
  const left = manufacturerKey(a);
  const right = manufacturerKey(b);
  return Boolean(left) && left === right;
};
/** 제조사: 대소문자만 다른 중복 제거. 먼저 나온(카탈로그) 표기 유지. */
const uniqueManufacturers = (values: Array<string | undefined | null>) => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = String(raw || "").trim();
    if (!value) continue;
    const key = manufacturerKey(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
};
const familyKey = (value: string) => String(value || "").trim().toLowerCase();
const brandKey = (value: string) => String(value || "").trim().toLowerCase();
const sameBrand = (a: string, b: string) => {
  const left = brandKey(a);
  const right = brandKey(b);
  return Boolean(left) && left === right;
};
/** 브랜드: 대소문자만 다른 중복 제거. 먼저 나온(카탈로그) 표기 유지. */
const uniqueBrands = (values: Array<string | undefined | null>) => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = String(raw || "").trim();
    if (!value) continue;
    const key = brandKey(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
};
const resolveBrandForSelect = (brand: string, options: string[]) => {
  const parts = splitOrValues(brand);
  if (!parts.length) return undefined;
  for (const part of parts) {
    const match = options.find((option) => sameBrand(option, part));
    if (match) return match;
  }
  return parts[0];
};
const sameFamily = (a: string, b: string) => familyKey(a) === familyKey(b);
const resolveFamilyForSelect = (family: string, options: string[]) => {
  const parts = splitOrValues(family);
  if (!parts.length) return undefined;
  for (const part of parts) {
    const match = options.find((option) => sameFamily(option, part));
    if (match) return match;
  }
  return parts[0];
};
const typeKey = (value: string) => String(value || "").trim().toLowerCase();
const sameType = (a: string, b: string) => typeKey(a) === typeKey(b);
const resolveTypeForSelect = (type: string, options: string[]) => {
  const parts = splitOrValues(type);
  if (!parts.length) return undefined;
  for (const part of parts) {
    const match = options.find((option) => sameType(option, part));
    if (match) return match;
  }
  return parts[0];
};
const isStandardFamily = (value: string) =>
  STANDARD_IMPLANT_FAMILIES.some((family) => familyKey(family) === familyKey(value));
const pickPreferredFamily = (families: string[]) => {
  const regular = families.find((f) => familyKey(f) === "regular");
  return regular || pickFirst(families);
};

const sortFamilyOptions = (families: string[]) => {
  const standard: string[] = [];
  const custom: string[] = [];
  for (const family of families) {
    if (isStandardFamily(family)) standard.push(family);
    else custom.push(family);
  }
  standard.sort((a, b) => {
    const ai = STANDARD_IMPLANT_FAMILIES.findIndex(
      (item) => familyKey(item) === familyKey(a),
    );
    const bi = STANDARD_IMPLANT_FAMILIES.findIndex(
      (item) => familyKey(item) === familyKey(b),
    );
    return ai - bi;
  });
  custom.sort((a, b) => a.localeCompare(b, "ko"));
  return [...standard, ...custom];
};

/** 카탈로그·커스텀 등 전달된 목록만 합친다(브랜드별 한정). */
const mergeFamilyOptions = (...lists: Array<Iterable<string>>) => {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string) => {
    const value = String(raw || "").trim();
    if (!value) return;
    const key = familyKey(value);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(value);
  };
  for (const list of lists) {
    for (const item of list) push(item);
  }
  return sortFamilyOptions(out);
};

/** 임플란트 추가 요청 폼 — 표준 패밀리 전체 + 커스텀. */
const mergeFamilyOptionsWithAllStandards = (...lists: Array<Iterable<string>>) =>
  mergeFamilyOptions(STANDARD_IMPLANT_FAMILIES, ...lists);

const pushUniqueFamily = (list: string[], raw: string) => {
  const value = String(raw || "").trim();
  if (!value || isStandardFamily(value)) return list;
  if (list.some((item) => familyKey(item) === familyKey(value))) return list;
  return [...list, value];
};

const selectTriggerClass =
  "h-11 min-w-0 px-3 text-sm [&>span]:min-w-0 [&>span]:flex-1 [&>span]:truncate [&>span]:text-left";

const FamilyField = ({
  value,
  onChange,
  disabled,
  options,
  labelMap,
  removableFamilies,
  onAddFamily,
  onRemoveFamily,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  options: string[];
  labelMap?: Map<string, string>;
  removableFamilies?: string[];
  onAddFamily?: (family: string) => void;
  onRemoveFamily?: (family: string) => void;
}) => {
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const removableKeys = useMemo(
    () => new Set((removableFamilies || []).map((family) => familyKey(family))),
    [removableFamilies],
  );

  const closeAdd = () => {
    setAddOpen(false);
    setDraft("");
  };

  const commitAdd = () => {
    const next = draft.trim();
    if (!next) return;
    onAddFamily?.(next);
    onChange(next);
    closeAdd();
  };

  if (addOpen) {
    return (
      <div className="flex gap-1.5">
        <Input
          autoFocus
          value={draft}
          placeholder="패밀리 입력"
          className="h-11 text-sm"
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitAdd();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              closeAdd();
            }
          }}
        />
        <Button
          type="button"
          className="h-11 px-3"
          disabled={disabled || !draft.trim()}
          onClick={commitAdd}
          aria-label="패밀리 추가"
        >
          <Check className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 px-3"
          disabled={disabled}
          onClick={closeAdd}
          aria-label="취소"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <Select
      value={value || undefined}
      onValueChange={(next) => {
        if (next === FAMILY_ADD_VALUE) {
          setAddOpen(true);
          setDraft("");
          return;
        }
        onChange(next);
      }}
      disabled={disabled}
    >
      <SelectTrigger className={selectTriggerClass} disabled={disabled}>
        <SelectValue placeholder="패밀리 선택" />
      </SelectTrigger>
      <SelectContent>
        {options.map((family) => {
          const removable = removableKeys.has(familyKey(family));
          return (
            <SelectItem
              key={`family-${family}`}
              value={family}
              className="text-sm"
              trailing={
                removable ? (
                  <button
                    type="button"
                    className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-destructive"
                    aria-label={`${family} 삭제`}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onPointerUp={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onRemoveFamily?.(family);
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null
              }
            >
              {labelMap?.get(family) || family}
            </SelectItem>
          );
        })}
        <SelectSeparator />
        <SelectItem
          value={FAMILY_ADD_VALUE}
          className="text-sm font-semibold text-primary-strong"
        >
          패밀리 추가
        </SelectItem>
      </SelectContent>
    </Select>
  );
};

/** 요청중(메모 추가요청)은 type을 옵션명으로 맞춰 레거시(헥스)와 선택값이 같은 키로 묶인다. */
const favoriteKey = (row: {
  manufacturer?: string;
  brand?: string;
  family?: string;
  type?: string;
  implantManufacturer?: string;
  implantBrand?: string;
  implantFamily?: string;
  implantType?: string;
}) => {
  const manufacturer = String(
    row.manufacturer ?? row.implantManufacturer ?? "",
  ).trim();
  const brand = String(row.brand ?? row.implantBrand ?? "").trim();
  const family = String(row.family ?? row.implantFamily ?? "").trim();
  const rawType = String(row.type ?? row.implantType ?? "").trim();
  const type =
    brand === MANUFACTURER_ADD_REQUEST_BRAND ||
    rawType === IMPLANT_ADD_REQUEST_OPTION
      ? IMPLANT_ADD_REQUEST_OPTION
      : rawType;
  return `${manufacturer}|${brand}|${family}|${type}`.toLowerCase();
};

/** 공개·미도입 카탈로그 스펙 → 치식에 요청중/도입중(기공소 자체) 플래그 */
const isPendingCatalogSpec = (
  connections: ImplantConnection[],
  manufacturer: string,
  brand: string,
  family: string,
  type: string,
) => {
  const m = manufacturer.trim().toLowerCase();
  const f = family.trim().toLowerCase();
  const t = type.trim().toLowerCase();
  if (!m || !brand.trim()) return false;
  return connections.some((c) => {
    if (!c.roundBar || c.adopted) return false;
    return (
      sameManufacturer(c.manufacturer, manufacturer) &&
      sameBrand(c.brand || "", brand) &&
      (!f || String(c.family || "").trim().toLowerCase() === f) &&
      (!t || String(c.type || "").trim().toLowerCase() === t)
    );
  });
};

/** 프리셋 행(h-8 + py-1.5×2 + border 2px) × 4 + space-y-1.5 × 3. 초과 시 스크롤. */
const PRESET_LIST_CLASS =
  "max-h-[calc(4*(2.75rem+2px)+3*0.375rem)] space-y-1.5 overflow-y-auto overflow-x-hidden pr-1 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100";
/** presets 전용 — 설정 모달에서 상단 모드 버튼 제거 후 여유 공간 활용(최소 8행). */
const PRESET_LIST_CLASS_TALL =
  "min-h-[calc(6*(2.75rem+2px)+5*0.375rem)] flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden pr-1 scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-slate-100";

export const PracticeToothImplantFields = ({
  value,
  onChange,
  connections,
  favorites,
  onFavoritesChange,
  presetsFirst = false,
  mode = "full",
  allowPresetEdit = true,
  onAddPreset: _onAddPreset,
  heading = "임플란트",
  className,
  guideOpenAdd = false,
}: Props) => {
  const [editingFavoriteId, setEditingFavoriteId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<ToothImplantValues>(emptyToothWorkImplant());
  const [editRequestMode, setEditRequestMode] = useState(false);
  const [editRequestMemo, setEditRequestMemo] = useState("");
  const [isAddingPreset, setIsAddingPreset] = useState(false);
  const [addDraft, setAddDraft] = useState<ToothImplantValues>(emptyToothWorkImplant());
  const [addRequestMode, setAddRequestMode] = useState(false);
  const [addRequestMemo, setAddRequestMemo] = useState("");
  const [favoritesBusy, setFavoritesBusy] = useState(false);
  const [requestFormOpen, setRequestFormOpen] = useState(false);
  const [requestBusy, setRequestBusy] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [requestDraft, setRequestDraft] = useState({
    manufacturer: "",
    brand: "",
    family: "",
  });
  const [customFamilies, setCustomFamilies] = useState<string[]>([]);
  const { token } = useAuthStore();
  const { toast } = useToast();
  const { kind } = useRequestorBusinessAccess();
  const showFields = mode === "full" || mode === "fields";
  const showPresets = mode === "full" || mode === "presets";
  const canManagePresets = allowPresetEdit && Boolean(onFavoritesChange);
  const allowManufacturerRequest = canManagePresets && kind !== "lab";
  const listClass = mode === "presets" ? PRESET_LIST_CLASS_TALL : PRESET_LIST_CLASS;

  const connectionOptions = useMemo(() => {
    const fromCatalog = connections
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
      });
    const seen = new Set(
      fromCatalog.map(
        (c) =>
          `${c.manufacturer}|${c.brand}|${c.family}|${c.type}`.toLowerCase(),
      ),
    );
    const canonicalManufacturer = new Map<string, string>();
    for (const c of fromCatalog) {
      const key = manufacturerKey(c.manufacturer);
      if (key && !canonicalManufacturer.has(key)) {
        canonicalManufacturer.set(key, c.manufacturer);
      }
    }
    const fromFavorites = favorites
      .map((fav) => {
        const manufacturer =
          canonicalManufacturer.get(manufacturerKey(fav.manufacturer || "")) ||
          String(fav.manufacturer || "").trim();
        const brand = String(fav.brand || "").trim();
        const family = String(fav.family || "").trim();
        const type = String(fav.type || "").trim();
        if (!manufacturer) return null;
        const key = `${manufacturer}|${brand}|${family}|${type}`.toLowerCase();
        if (seen.has(key)) return null;
        seen.add(key);
        return {
          manufacturer,
          brand,
          family,
          type,
          displayManufacturer: manufacturer,
          displayBrand: brand,
          displayFamily: family,
          displayType: type,
          roundBar: Boolean(fav.roundBar) || Boolean(fav.isPublic),
          adopted: Boolean(fav.adopted),
          isPublic: Boolean(fav.isPublic),
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
    return [...fromFavorites, ...fromCatalog];
  }, [connections, favorites]);

  const cncSpecs = useMemo(() => mergeCncImplantSpecs(connections), [connections]);

  const specRows = useMemo(() => {
    const seen = new Set<string>();
    const rows: Array<{
      manufacturer: string;
      brand: string;
      family: string;
      type: string;
    }> = [];
    const push = (row: {
      manufacturer: string;
      brand: string;
      family: string;
      type: string;
    }) => {
      const combos = expandRoundBarOrCombos({
        manufacturer: row.manufacturer,
        brand: row.brand,
        family: row.family,
        type: row.type,
      });
      for (const combo of combos) {
        const manufacturer = String(combo.manufacturer || "").trim();
        const brand = String(combo.brand || "").trim();
        if (!manufacturer || !brand) continue;
        const family = String(combo.family || "").trim();
        const type = String(combo.type || "").trim();
        const key = `${manufacturer}|${brand}|${family}|${type}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({ manufacturer, brand, family, type });
      }
    };
    for (const c of cncSpecs) {
      push({
        manufacturer: c.manufacturer,
        brand: c.brand,
        family: c.family,
        type: c.type,
      });
    }
    for (const c of connectionOptions) {
      push({
        manufacturer: c.manufacturer,
        brand: String(c.brand || "").trim(),
        family: String(c.family || "").trim(),
        type: String(c.type || "").trim(),
      });
    }
    return rows;
  }, [cncSpecs, connectionOptions]);

  const cncManufacturerOptions = useMemo(() => {
    const catalog = uniqueManufacturers(
      connections
        .filter(
          (c) =>
            typeof c.manufacturer === "string" &&
            typeof c.brand === "string" &&
            c.manufacturer.trim() &&
            c.brand.trim(),
        )
        .map((c) => c.manufacturer),
    );
    const current = String(value.implantManufacturer || "").trim();
    const currentIsRoundBar = favorites.some(
      (fav) =>
        isRoundBarFavorite(fav) &&
        sameManufacturer(fav.manufacturer, current) &&
        sameBrand(fav.brand || "", value.implantBrand) &&
        sameFamily(fav.family || "", value.implantFamily) &&
        sameType(fav.type || "", value.implantType),
    );
    if (
      current &&
      !currentIsRoundBar &&
      !catalog.some((m) => sameManufacturer(m, current))
    ) {
      return uniqueManufacturers([current, ...catalog]);
    }
    return catalog;
  }, [
    connections,
    favorites,
    value.implantManufacturer,
    value.implantBrand,
    value.implantFamily,
    value.implantType,
  ]);

  const cncManufacturerKeySet = useMemo(
    () => new Set(cncManufacturerOptions.map(manufacturerKey)),
    [cncManufacturerOptions],
  );

  const roundBarManufacturerOptions = useMemo(
    () =>
      uniqueManufacturers(
        [
          ...connections
            .filter((c) => Boolean(c.roundBar) || Boolean(c.isPublic))
            .map((c) => c.manufacturer),
          ...favorites
            .filter((fav) => isRoundBarFavorite(fav))
            .map((fav) => fav.manufacturer),
        ].filter(
          (manufacturer) => !cncManufacturerKeySet.has(manufacturerKey(manufacturer)),
        ),
      ),
    [connections, favorites, cncManufacturerKeySet],
  );

  const manufacturerOptions = useMemo(
    () => uniqueManufacturers([...cncManufacturerOptions, ...roundBarManufacturerOptions]),
    [cncManufacturerOptions, roundBarManufacturerOptions],
  );

  const isCurrentRoundBarManufacturer = useMemo(
    () =>
      favorites.some(
        (fav) =>
          isRoundBarFavorite(fav) &&
          sameManufacturer(fav.manufacturer, value.implantManufacturer) &&
          sameBrand(fav.brand || "", value.implantBrand) &&
          sameFamily(fav.family || "", value.implantFamily) &&
          sameType(fav.type || "", value.implantType),
      ),
    [favorites, value],
  );

  const pickRoundBarFavorite = (manufacturer: string) => {
    const rows = favorites.filter(
      (fav) =>
        isRoundBarFavorite(fav) && sameManufacturer(fav.manufacturer, manufacturer),
    );
    const found = rows.find((fav) => fav.adopted) || rows[0] || null;
    if (found) return found;
    const catalogEntry = connections.find(
      (c) =>
        (Boolean(c.roundBar) || Boolean(c.isPublic)) &&
        sameManufacturer(c.manufacturer, manufacturer),
    );
    return catalogEntry || null;
  };

  const favoriteAdoptionStatus = (fav: PracticeImplantFavorite) =>
    resolveAbutmentAdoptionStatusWithCatalog(fav, connections);

  const brandOptions = useMemo(() => {
    const options = uniqueBrands(
      specRows
        .filter((row) => sameManufacturer(row.manufacturer, value.implantManufacturer))
        .map((row) => row.brand),
    );
    const currentParts = splitOrValues(value.implantBrand);
    for (const part of currentParts) {
      if (part && !options.some((option) => sameBrand(option, part))) {
        options.unshift(part);
      }
    }
    return options;
  }, [specRows, value.implantManufacturer, value.implantBrand]);

  const catalogFamilyKeys = useMemo(
    () =>
      new Set(
        specRows
          .filter(
            (row) =>
              sameManufacturer(row.manufacturer, value.implantManufacturer) &&
              sameBrand(row.brand, value.implantBrand),
          )
          .map((row) => familyKey(row.family))
          .filter(Boolean),
      ),
    [specRows, value.implantManufacturer, value.implantBrand],
  );

  const familyOptions = useMemo(() => {
    const fromSpecs = specRows
      .filter(
        (row) =>
          sameManufacturer(row.manufacturer, value.implantManufacturer) &&
          sameBrand(row.brand, value.implantBrand),
      )
      .map((row) => row.family);
    return mergeFamilyOptions(
      fromSpecs,
      customFamilies,
      splitOrValues(value.implantFamily),
    );
  }, [
    specRows,
    customFamilies,
    value.implantManufacturer,
    value.implantBrand,
    value.implantFamily,
  ]);

  const removableFamilies = useMemo(
    () =>
      familyOptions.filter(
        (family) =>
          !isStandardFamily(family) && !catalogFamilyKeys.has(familyKey(family)),
      ),
    [catalogFamilyKeys, familyOptions],
  );

  const typeOptions = useMemo(() => {
    const options = uniqueStrings(
      specRows
        .filter(
          (row) =>
            sameManufacturer(row.manufacturer, value.implantManufacturer) &&
            sameBrand(row.brand, value.implantBrand) &&
            sameFamily(row.family, value.implantFamily),
        )
        .map((row) => row.type),
    );
    const currentParts = splitOrValues(value.implantType);
    for (const part of currentParts) {
      if (part && !options.some((option) => sameType(option, part))) {
        options.unshift(part);
      }
    }
    return options;
  }, [
    specRows,
    value.implantManufacturer,
    value.implantBrand,
    value.implantFamily,
    value.implantType,
  ]);

  const manufacturerLabelMap = useMemo(
    () =>
      new Map(
        manufacturerOptions.map((manufacturer) => {
          const sample = connectionOptions.find((c) =>
            sameManufacturer(c.manufacturer, manufacturer),
          );
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
            (c) =>
              sameManufacturer(c.manufacturer, value.implantManufacturer) &&
              sameBrand(c.brand || "", brand),
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
              sameManufacturer(c.manufacturer, value.implantManufacturer) &&
              sameBrand(c.brand || "", value.implantBrand) &&
              sameFamily(c.family || "", family),
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
              sameManufacturer(c.manufacturer, value.implantManufacturer) &&
              sameBrand(c.brand || "", value.implantBrand) &&
              sameFamily(c.family || "", value.implantFamily) &&
              sameType(c.type || "", type),
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

  const getBrands = (manufacturer: string) =>
    uniqueBrands(
      specRows
        .filter((row) => sameManufacturer(row.manufacturer, manufacturer))
        .map((row) => row.brand),
    );

  const getFamilies = (manufacturer: string, brand: string) =>
    uniqueStrings(
      specRows
        .filter(
          (row) =>
            sameManufacturer(row.manufacturer, manufacturer) && sameBrand(row.brand, brand),
        )
        .map((row) => row.family)
        .filter(Boolean),
    );

  const getTypes = (manufacturer: string, brand: string, family: string) =>
    uniqueStrings(
      specRows
        .filter(
          (row) =>
            sameManufacturer(row.manufacturer, manufacturer) &&
            sameBrand(row.brand, brand) &&
            sameFamily(row.family, family),
        )
        .map((row) => row.type),
    );

  const addBrandOptions = useMemo(
    () => getBrands(addDraft.implantManufacturer),
    [addDraft.implantManufacturer, specRows],
  );

  const addFamilyOptions = useMemo(
    () =>
      mergeFamilyOptions(
        getFamilies(addDraft.implantManufacturer, addDraft.implantBrand),
        splitOrValues(addDraft.implantFamily),
      ),
    [addDraft.implantManufacturer, addDraft.implantBrand, addDraft.implantFamily, specRows],
  );

  const addTypeOptions = useMemo(
    () =>
      getTypes(
        addDraft.implantManufacturer,
        addDraft.implantBrand,
        addDraft.implantFamily,
      ),
    [
      addDraft.implantManufacturer,
      addDraft.implantBrand,
      addDraft.implantFamily,
      specRows,
    ],
  );

  const editBrandOptions = useMemo(
    () => getBrands(editDraft.implantManufacturer),
    [editDraft.implantManufacturer, specRows],
  );

  const editFamilyOptions = useMemo(
    () =>
      mergeFamilyOptions(
        getFamilies(editDraft.implantManufacturer, editDraft.implantBrand),
        splitOrValues(editDraft.implantFamily),
      ),
    [editDraft.implantManufacturer, editDraft.implantBrand, editDraft.implantFamily, specRows],
  );

  const editTypeOptions = useMemo(
    () =>
      getTypes(
        editDraft.implantManufacturer,
        editDraft.implantBrand,
        editDraft.implantFamily,
      ),
    [
      editDraft.implantManufacturer,
      editDraft.implantBrand,
      editDraft.implantFamily,
      specRows,
    ],
  );

  const specBrandLabel = (manufacturer: string, brand: string) => {
    const sample = connectionOptions.find(
      (c) => sameManufacturer(c.manufacturer, manufacturer) && sameBrand(c.brand || "", brand),
    );
    return sample?.displayBrand || brand;
  };

  const specFamilyLabel = (manufacturer: string, brand: string, family: string) => {
    const sample = connectionOptions.find(
      (c) =>
        sameManufacturer(c.manufacturer, manufacturer) &&
        sameBrand(c.brand || "", brand) &&
        sameFamily(c.family || "", family),
    );
    return sample?.displayFamily || family || "(기본)";
  };

  const presetManufacturerSelectValue = (manufacturer: string) => {
    const current = String(manufacturer || "").trim();
    if (!current) return undefined;
    const inRoundBar = roundBarManufacturerOptions.some((m) =>
      sameManufacturer(m, current),
    );
    const inCnc = cncManufacturerOptions.some((m) => sameManufacturer(m, current));
    if (inRoundBar && !inCnc) return `${ROUND_BAR_MFR_PREFIX}${current}`;
    return current;
  };

  const resolvePresetManufacturerValue = (nextManufacturer: string) =>
    nextManufacturer.startsWith(ROUND_BAR_MFR_PREFIX)
      ? nextManufacturer.slice(ROUND_BAR_MFR_PREFIX.length)
      : nextManufacturer;

  const applyPresetManufacturerDraft = (
    nextManufacturer: string,
    apply: (draft: ToothImplantValues) => void,
  ) => {
    const manufacturer = resolvePresetManufacturerValue(nextManufacturer);
    const nextBrand = pickFirst(getBrands(manufacturer));
    const nextFamily = pickPreferredFamily(getFamilies(manufacturer, nextBrand));
    const nextType = pickFirst(getTypes(manufacturer, nextBrand, nextFamily)) || "Hex";
    apply({
      implantManufacturer: manufacturer,
      implantBrand: nextBrand,
      implantFamily: nextFamily,
      implantType: nextType,
    });
  };

  const renderPresetManufacturerSelectItems = () => (
    <>
      <SelectGroup>
        {cncManufacturerOptions.map((m) => (
          <SelectItem key={`preset-mfr-${m}`} value={m} className="text-sm">
            {manufacturerLabelMap.get(m) || m}
          </SelectItem>
        ))}
      </SelectGroup>
      {roundBarManufacturerOptions.length > 0 ? (
        <>
          <SelectSeparator className="my-1.5 h-0.5 bg-slate-300" />
          <SelectGroup>
            {roundBarManufacturerOptions.map((m) => (
              <SelectItem
                key={`preset-rb-mfr-${m}`}
                value={`${ROUND_BAR_MFR_PREFIX}${m}`}
                className="text-sm"
                trailing={
                  <span className="inline-flex rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                    {(() => {
                      const fav = pickRoundBarFavorite(m);
                      const status = resolveAbutmentAdoptionStatusWithCatalog(fav, connections);
                      if (status === "adopting") return "도입중";
                      if (status === "requesting") return "요청중";
                      return "환봉";
                    })()}
                  </span>
                }
              >
                {manufacturerLabelMap.get(m) || m}
              </SelectItem>
            ))}
          </SelectGroup>
        </>
      ) : null}
    </>
  );

  const addCustomFamily = (family: string) => {
    setCustomFamilies((prev) => pushUniqueFamily(prev, family));
  };

  const removeCustomFamily = (family: string) => {
    setCustomFamilies((prev) =>
      prev.filter((item) => familyKey(item) !== familyKey(family)),
    );
    if (familyKey(value.implantFamily) === familyKey(family)) {
      const nextFamily = pickPreferredFamily(
        getFamilies(value.implantManufacturer, value.implantBrand),
      );
      const nextType = pickFirst(
        getTypes(value.implantManufacturer, value.implantBrand, nextFamily),
      );
      onChange({
        ...value,
        implantFamily: nextFamily,
        implantType: nextType,
        implantAddRequest: false,
      });
    }
    if (familyKey(requestDraft.family) === familyKey(family)) {
      setRequestDraft((prev) => ({ ...prev, family: "Regular" }));
    }
  };

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
    const enriched = enrichImplantFavoriteFromCatalog(fav, connections);
    const addRequest = isManufacturerAddRequestFavorite(enriched);
    /** 요청중·도입중(미도입) — 기공의뢰에서 선택 가능, 어벗츠 CNC·견적 제외 */
    const pendingUnsupported =
      addRequest || isPendingAbutmentAdoptionWithCatalog(enriched, connections);
    onChange({
      implantManufacturer: enriched.manufacturer,
      implantBrand: enriched.brand,
      implantFamily: enriched.family,
      implantType: addRequest
        ? IMPLANT_ADD_REQUEST_OPTION
        : enriched.type,
      implantAddRequest: pendingUnsupported,
    });
  };

  const saveCurrentAsFavorite = () =>
    void persistFavorites([
      ...favorites,
      enrichImplantFavoriteFromCatalog(
        {
          id: `imp-${Date.now().toString(36)}`,
          manufacturer: value.implantManufacturer,
          brand: value.implantBrand,
          family: value.implantFamily,
          type: value.implantType,
        },
        connections,
      ),
    ]);

  const startAddPreset = () => {
    setEditingFavoriteId(null);
    setEditRequestMode(false);
    setEditRequestMemo("");
    setAddDraft(emptyToothWorkImplant());
    setAddRequestMode(false);
    setAddRequestMemo("");
    setIsAddingPreset(true);
  };

  useEffect(() => {
    if (!guideOpenAdd) return;
    if (!canManagePresets) return;
    if (favorites.length > 0) return;
    if (isAddingPreset) return;
    startAddPreset();
    // 투어 진입 시 1회 추가 폼 오픈
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guideOpenAdd, favorites.length, canManagePresets]);

  const cancelAddPreset = () => {
    setIsAddingPreset(false);
    setAddDraft(emptyToothWorkImplant());
    setAddRequestMode(false);
    setAddRequestMemo("");
  };

  const startEditPreset = (fav: PracticeImplantFavorite) => {
    setIsAddingPreset(false);
    setAddRequestMode(false);
    setAddRequestMemo("");
    setEditingFavoriteId(fav.id);
    if (isManufacturerAddRequestFavorite(fav)) {
      setEditRequestMode(true);
      setEditRequestMemo(String(fav.manufacturer || "").trim());
      setEditDraft(emptyToothWorkImplant());
      return;
    }
    setEditRequestMode(false);
    setEditRequestMemo("");
    setEditDraft({
      implantManufacturer: fav.manufacturer,
      implantBrand: fav.brand,
      implantFamily: fav.family,
      implantType: fav.type,
    });
  };

  const cancelEditPreset = () => {
    setEditingFavoriteId(null);
    setEditDraft(emptyToothWorkImplant());
    setEditRequestMode(false);
    setEditRequestMemo("");
  };

  const confirmEditPreset = async (favId: string) => {
    if (editRequestMode) {
      const memo = editRequestMemo.trim();
      if (!memo) {
        toast({
          title: "입력 필요",
          description: "임플란트 제조사·제품 브랜드 등을 입력해주세요.",
          variant: "destructive",
        });
        return;
      }
      let nextFavorite: PracticeImplantFavorite = {
        id: favId,
        manufacturer: memo,
        brand: MANUFACTURER_ADD_REQUEST_BRAND,
        family: MANUFACTURER_ADD_REQUEST_FAMILY,
        type: IMPLANT_ADD_REQUEST_OPTION,
        roundBar: true,
        implantAddRequest: true,
        adopted: false,
      };
      setFavoritesBusy(true);
      try {
        if (token) {
          const result = await submitRoundBarManufacturerRequest({
            token,
            payload: {
              manufacturer: memo,
              brand: MANUFACTURER_ADD_REQUEST_BRAND,
              family: MANUFACTURER_ADD_REQUEST_FAMILY,
              favoriteId: favId,
            },
          });
          if (result.favorite?.id) {
            nextFavorite = {
              ...nextFavorite,
              ...result.favorite,
              id: favId,
              type: IMPLANT_ADD_REQUEST_OPTION,
              roundBar: true,
              implantAddRequest: true,
            };
          }
        }
        await persistFavorites(
          favorites.map((row) => (row.id === favId ? { ...row, ...nextFavorite } : row)),
        );
        applyFavorite(nextFavorite);
        cancelEditPreset();
        setGuideOpen(true);
      } catch (error) {
        toast({
          title: "요청 전달 실패",
          description:
            error instanceof Error ? error.message : "관리자 문의 전달에 실패했습니다.",
          variant: "destructive",
        });
        await persistFavorites(
          favorites.map((row) => (row.id === favId ? { ...row, ...nextFavorite } : row)),
        );
        applyFavorite(nextFavorite);
        cancelEditPreset();
        setGuideOpen(true);
      } finally {
        setFavoritesBusy(false);
      }
      return;
    }

    const manufacturer = editDraft.implantManufacturer.trim();
    const brand = editDraft.implantBrand.trim();
    const family = editDraft.implantFamily.trim();
    const type = editDraft.implantType.trim() || "Hex";
    if (!manufacturer || !brand) {
      toast({
        title: "선택 필요",
        description: "제조사와 브랜드를 선택해주세요.",
        variant: "destructive",
      });
      return;
    }
    const nextFavorite: PracticeImplantFavorite = {
      id: favId,
      manufacturer,
      brand,
      family,
      type,
    };
    await persistFavorites(
      favorites.map((row) =>
        row.id === favId
          ? {
              id: favId,
              manufacturer,
              brand,
              family,
              type,
            }
          : row,
      ),
    );
    applyFavorite(nextFavorite);
    cancelEditPreset();
  };

  const canConfirmEditPreset = editRequestMode
    ? Boolean(editRequestMemo.trim())
    : Boolean(editDraft.implantManufacturer && editDraft.implantBrand);

  const confirmAddPreset = async () => {
    if (addRequestMode) {
      const memo = addRequestMemo.trim();
      if (!memo) {
        toast({
          title: "입력 필요",
          description: "임플란트 제조사·제품 브랜드 등을 입력해주세요.",
          variant: "destructive",
        });
        return;
      }
      const favoriteId = `imp-rb-${Date.now().toString(36)}`;
      let nextFavorite: PracticeImplantFavorite = {
        id: favoriteId,
        manufacturer: memo,
        brand: MANUFACTURER_ADD_REQUEST_BRAND,
        family: MANUFACTURER_ADD_REQUEST_FAMILY,
        type: IMPLANT_ADD_REQUEST_OPTION,
        roundBar: true,
        implantAddRequest: true,
        adopted: false,
      };
      setFavoritesBusy(true);
      try {
        if (token) {
          const result = await submitRoundBarManufacturerRequest({
            token,
            payload: {
              manufacturer: memo,
              brand: MANUFACTURER_ADD_REQUEST_BRAND,
              family: MANUFACTURER_ADD_REQUEST_FAMILY,
              favoriteId,
            },
          });
          if (result.favorite?.id) {
            nextFavorite = {
              ...nextFavorite,
              ...result.favorite,
              type: IMPLANT_ADD_REQUEST_OPTION,
              roundBar: true,
              implantAddRequest: true,
            };
          }
        }
        const withoutDup = favorites.filter(
          (row) =>
            favoriteKey(row) !== favoriteKey(nextFavorite) && row.id !== nextFavorite.id,
        );
        await persistFavorites([...withoutDup, nextFavorite]);
        applyFavorite(nextFavorite);
        cancelAddPreset();
        setGuideOpen(true);
      } catch (error) {
        toast({
          title: "요청 전달 실패",
          description:
            error instanceof Error ? error.message : "관리자 문의 전달에 실패했습니다.",
          variant: "destructive",
        });
        const withoutDup = favorites.filter(
          (row) =>
            favoriteKey(row) !== favoriteKey(nextFavorite) && row.id !== nextFavorite.id,
        );
        await persistFavorites([...withoutDup, nextFavorite]);
        applyFavorite(nextFavorite);
        cancelAddPreset();
        setGuideOpen(true);
      } finally {
        setFavoritesBusy(false);
      }
      return;
    }

    const manufacturer = addDraft.implantManufacturer.trim();
    const brand = addDraft.implantBrand.trim();
    const family = addDraft.implantFamily.trim();
    const type = addDraft.implantType.trim() || "Hex";
    if (!manufacturer || !brand) {
      toast({
        title: "선택 필요",
        description: "제조사와 브랜드를 선택해주세요.",
        variant: "destructive",
      });
      return;
    }
    const nextFavorite = enrichImplantFavoriteFromCatalog(
      {
        id: `imp-${Date.now().toString(36)}`,
        manufacturer,
        brand,
        family,
        type,
      },
      connections,
    );
    const withoutDup = favorites.filter(
      (row) => favoriteKey(row) !== favoriteKey(nextFavorite),
    );
    await persistFavorites([...withoutDup, nextFavorite]);
    applyFavorite(nextFavorite);
    cancelAddPreset();
  };

  const canConfirmAddPreset = addRequestMode
    ? Boolean(addRequestMemo.trim())
    : Boolean(addDraft.implantManufacturer && addDraft.implantBrand);

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
      type: IMPLANT_ADD_REQUEST_OPTION,
      roundBar: true,
      implantAddRequest: true,
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
            type: IMPLANT_ADD_REQUEST_OPTION,
            roundBar: true,
            implantAddRequest: true,
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
        implantType: IMPLANT_ADD_REQUEST_OPTION,
        implantAddRequest: true,
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
        implantType: IMPLANT_ADD_REQUEST_OPTION,
        implantAddRequest: true,
      });
      closeRequestForm();
      setGuideOpen(true);
    } finally {
      setRequestBusy(false);
    }
  };

  const renderAddPresetForm = () => {
    if (!isAddingPreset || !canManagePresets) return null;
    const selectClass = "h-9 w-full text-sm";
    return (
      <div
        key="add-preset-row"
        className="space-y-1.5 rounded-xl border border-primary/70 bg-primary-soft/50 px-2.5 py-2 shadow-sm"
      >
        {addRequestMode ? (
          <>
            <Select
              value={MANUFACTURER_ADD_REQUEST_VALUE}
              onValueChange={(nextManufacturer) => {
                if (nextManufacturer === MANUFACTURER_ADD_REQUEST_VALUE) return;
                setAddRequestMode(false);
                setAddRequestMemo("");
                applyPresetManufacturerDraft(nextManufacturer, setAddDraft);
              }}
            >
              <SelectTrigger className={selectClass}>
                <SelectValue placeholder="제조사 선택" />
              </SelectTrigger>
              <SelectContent>
                {renderPresetManufacturerSelectItems()}
                {allowManufacturerRequest ? (
                  <>
                    <SelectSeparator className="my-1.5 h-0.5 bg-slate-300" />
                    <SelectItem
                      value={MANUFACTURER_ADD_REQUEST_VALUE}
                      className="text-sm font-semibold text-primary-strong"
                    >
                      임플란트 추가 요청
                    </SelectItem>
                  </>
                ) : null}
              </SelectContent>
            </Select>
            <Input
              value={addRequestMemo}
              placeholder="임플란트 제조사, 제품 브랜드 등 입력"
              className="h-9 text-sm"
              onChange={(e) => setAddRequestMemo(e.target.value)}
            />
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-1.5">
              <Select
                value={presetManufacturerSelectValue(addDraft.implantManufacturer)}
                onValueChange={(nextManufacturer) => {
                  if (nextManufacturer === MANUFACTURER_ADD_REQUEST_VALUE) {
                    setAddRequestMode(true);
                    setAddDraft(emptyToothWorkImplant());
                    return;
                  }
                  setAddRequestMode(false);
                  setAddRequestMemo("");
                  applyPresetManufacturerDraft(nextManufacturer, setAddDraft);
                }}
              >
                <SelectTrigger className={selectClass}>
                  <SelectValue placeholder="제조사" />
                </SelectTrigger>
                <SelectContent>
                  {renderPresetManufacturerSelectItems()}
                  {allowManufacturerRequest ? (
                    <>
                      <SelectSeparator className="my-1.5 h-0.5 bg-slate-300" />
                      <SelectItem
                        value={MANUFACTURER_ADD_REQUEST_VALUE}
                        className="text-sm font-semibold text-primary-strong"
                      >
                        임플란트 추가 요청
                      </SelectItem>
                    </>
                  ) : null}
                </SelectContent>
              </Select>
              <Select
                value={resolveBrandForSelect(addDraft.implantBrand, addBrandOptions) || undefined}
                disabled={!addDraft.implantManufacturer}
                onValueChange={(nextBrand) => {
                  const nextFamily = pickPreferredFamily(
                    getFamilies(addDraft.implantManufacturer, nextBrand),
                  );
                  const nextType =
                    pickFirst(
                      getTypes(addDraft.implantManufacturer, nextBrand, nextFamily),
                    ) || "Hex";
                  setAddDraft((prev) => ({
                    ...prev,
                    implantBrand: nextBrand,
                    implantFamily: nextFamily,
                    implantType: nextType,
                  }));
                }}
              >
                <SelectTrigger
                  className={selectClass}
                  disabled={!addDraft.implantManufacturer}
                >
                  <SelectValue placeholder="브랜드" />
                </SelectTrigger>
                <SelectContent>
                  {addBrandOptions.map((b) => (
                    <SelectItem key={`add-brand-${b}`} value={b} className="text-sm">
                      {specBrandLabel(addDraft.implantManufacturer, b)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <Select
                value={
                  resolveFamilyForSelect(addDraft.implantFamily, addFamilyOptions) ||
                  undefined
                }
                disabled={!addDraft.implantBrand || addFamilyOptions.length === 0}
                onValueChange={(nextFamily) => {
                  const nextType =
                    pickFirst(
                      getTypes(
                        addDraft.implantManufacturer,
                        addDraft.implantBrand,
                        nextFamily,
                      ),
                    ) || "Hex";
                  setAddDraft((prev) => ({
                    ...prev,
                    implantFamily: nextFamily,
                    implantType: nextType,
                  }));
                }}
              >
                <SelectTrigger
                  className={selectClass}
                  disabled={!addDraft.implantBrand || addFamilyOptions.length === 0}
                >
                  <SelectValue placeholder="패밀리" />
                </SelectTrigger>
                <SelectContent>
                  {addFamilyOptions.map((f) => (
                    <SelectItem key={`add-family-${f}`} value={f} className="text-sm">
                      {specFamilyLabel(
                        addDraft.implantManufacturer,
                        addDraft.implantBrand,
                        f,
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={
                  resolveTypeForSelect(addDraft.implantType, addTypeOptions) || undefined
                }
                disabled={!addDraft.implantBrand}
                onValueChange={(nextType) =>
                  setAddDraft((prev) => ({ ...prev, implantType: nextType }))
                }
              >
                <SelectTrigger className={selectClass} disabled={!addDraft.implantBrand}>
                  <SelectValue placeholder="타입" />
                </SelectTrigger>
                <SelectContent>
                  {addTypeOptions.map((t) => (
                    <SelectItem key={`add-type-${t}`} value={t} className="text-sm">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        <div className="flex justify-end gap-1">
          <Button
            type="button"
            size="sm"
            className="h-8 px-3 text-sm"
            disabled={favoritesBusy || !canConfirmAddPreset}
            onClick={() => void confirmAddPreset()}
          >
            <Check className="mr-1 h-3.5 w-3.5" />
            {addRequestMode ? (favoritesBusy ? "요청 중..." : "요청") : "저장"}
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
                  const selectClass = "h-9 w-full text-sm";
                  return (
                    <div
                      key={`edit-${fav.id}`}
                      className="space-y-1.5 rounded-xl border border-primary/70 bg-primary-soft/50 px-2.5 py-2 shadow-sm"
                    >
                      {editRequestMode ? (
                        <>
                          <Select
                            value={MANUFACTURER_ADD_REQUEST_VALUE}
                            onValueChange={(nextManufacturer) => {
                              if (nextManufacturer === MANUFACTURER_ADD_REQUEST_VALUE) {
                                return;
                              }
                              setEditRequestMode(false);
                              setEditRequestMemo("");
                              applyPresetManufacturerDraft(nextManufacturer, setEditDraft);
                            }}
                          >
                            <SelectTrigger className={selectClass}>
                              <SelectValue placeholder="제조사" />
                            </SelectTrigger>
                            <SelectContent>
                              {renderPresetManufacturerSelectItems()}
                              {allowManufacturerRequest ? (
                                <>
                                  <SelectSeparator className="my-1.5 h-0.5 bg-slate-300" />
                                  <SelectItem
                                    value={MANUFACTURER_ADD_REQUEST_VALUE}
                                    className="text-sm font-semibold text-primary-strong"
                                  >
                                    임플란트 추가 요청
                                  </SelectItem>
                                </>
                              ) : null}
                            </SelectContent>
                          </Select>
                          <Input
                            value={editRequestMemo}
                            placeholder="임플란트 제조사, 제품 브랜드 등 입력"
                            className="h-9 text-sm"
                            onChange={(e) => setEditRequestMemo(e.target.value)}
                          />
                        </>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 gap-1.5">
                            <Select
                              value={presetManufacturerSelectValue(editDraft.implantManufacturer)}
                              onValueChange={(nextManufacturer) => {
                                if (nextManufacturer === MANUFACTURER_ADD_REQUEST_VALUE) {
                                  setEditRequestMode(true);
                                  setEditRequestMemo("");
                                  setEditDraft(emptyToothWorkImplant());
                                  return;
                                }
                                setEditRequestMode(false);
                                setEditRequestMemo("");
                                applyPresetManufacturerDraft(nextManufacturer, setEditDraft);
                              }}
                            >
                              <SelectTrigger className={selectClass}>
                                <SelectValue placeholder="제조사" />
                              </SelectTrigger>
                              <SelectContent>
                                {renderPresetManufacturerSelectItems()}
                                {allowManufacturerRequest ? (
                                  <>
                                    <SelectSeparator className="my-1.5 h-0.5 bg-slate-300" />
                                    <SelectItem
                                      value={MANUFACTURER_ADD_REQUEST_VALUE}
                                      className="text-sm font-semibold text-primary-strong"
                                    >
                                      임플란트 추가 요청
                                    </SelectItem>
                                  </>
                                ) : null}
                              </SelectContent>
                            </Select>
                            <Select
                              value={
                                resolveBrandForSelect(
                                  editDraft.implantBrand,
                                  editBrandOptions,
                                ) || undefined
                              }
                              disabled={!editDraft.implantManufacturer}
                              onValueChange={(nextBrand) => {
                                const nextFamily = pickPreferredFamily(
                                  getFamilies(editDraft.implantManufacturer, nextBrand),
                                );
                                const nextType =
                                  pickFirst(
                                    getTypes(
                                      editDraft.implantManufacturer,
                                      nextBrand,
                                      nextFamily,
                                    ),
                                  ) || "Hex";
                                setEditDraft((prev) => ({
                                  ...prev,
                                  implantBrand: nextBrand,
                                  implantFamily: nextFamily,
                                  implantType: nextType,
                                }));
                              }}
                            >
                              <SelectTrigger
                                className={selectClass}
                                disabled={!editDraft.implantManufacturer}
                              >
                                <SelectValue placeholder="브랜드" />
                              </SelectTrigger>
                              <SelectContent>
                                {editBrandOptions.map((b) => (
                                  <SelectItem
                                    key={`edit-brand-${b}`}
                                    value={b}
                                    className="text-sm"
                                  >
                                    {specBrandLabel(editDraft.implantManufacturer, b)}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="grid grid-cols-2 gap-1.5">
                            <Select
                              value={
                                resolveFamilyForSelect(
                                  editDraft.implantFamily,
                                  editFamilyOptions,
                                ) || undefined
                              }
                              disabled={
                                !editDraft.implantBrand || editFamilyOptions.length === 0
                              }
                              onValueChange={(nextFamily) => {
                                const nextType =
                                  pickFirst(
                                    getTypes(
                                      editDraft.implantManufacturer,
                                      editDraft.implantBrand,
                                      nextFamily,
                                    ),
                                  ) || "Hex";
                                setEditDraft((prev) => ({
                                  ...prev,
                                  implantFamily: nextFamily,
                                  implantType: nextType,
                                }));
                              }}
                            >
                              <SelectTrigger
                                className={selectClass}
                                disabled={
                                  !editDraft.implantBrand || editFamilyOptions.length === 0
                                }
                              >
                                <SelectValue placeholder="패밀리" />
                              </SelectTrigger>
                              <SelectContent>
                                {editFamilyOptions.map((f) => (
                                  <SelectItem
                                    key={`edit-family-${f}`}
                                    value={f}
                                    className="text-sm"
                                  >
                                    {specFamilyLabel(
                                      editDraft.implantManufacturer,
                                      editDraft.implantBrand,
                                      f,
                                    )}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select
                              value={
                                resolveTypeForSelect(
                                  editDraft.implantType,
                                  editTypeOptions,
                                ) || undefined
                              }
                              disabled={!editDraft.implantBrand}
                              onValueChange={(nextType) =>
                                setEditDraft((prev) => ({
                                  ...prev,
                                  implantType: nextType,
                                }))
                              }
                            >
                              <SelectTrigger
                                className={selectClass}
                                disabled={!editDraft.implantBrand}
                              >
                                <SelectValue placeholder="타입" />
                              </SelectTrigger>
                              <SelectContent>
                                {editTypeOptions.map((t) => (
                                  <SelectItem
                                    key={`edit-type-${t}`}
                                    value={t}
                                    className="text-sm"
                                  >
                                    {t}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </>
                      )}
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 px-3 text-sm"
                          disabled={favoritesBusy || !canConfirmEditPreset}
                          onClick={() => void confirmEditPreset(fav.id)}
                        >
                          <Check className="mr-1 h-3.5 w-3.5" />
                          {editRequestMode
                            ? favoritesBusy
                              ? "요청 중..."
                              : "요청"
                            : "저장"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-3 text-sm"
                          disabled={favoritesBusy}
                          onClick={cancelEditPreset}
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
                        ? "flex items-center gap-1.5 rounded-xl border border-primary/70 bg-primary-soft px-2.5 py-2 shadow-sm"
                        : "flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-2.5 py-2 shadow-sm"
                    }
                  >
                    {(() => {
                      const label = implantFavoriteDisplayParts(fav, cncSpecs);
                      const title = label.line2
                        ? `${label.line1} · ${label.line2}`
                        : label.line1;
                      return (
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-start gap-2 rounded px-1 py-0.5 text-left hover:text-primary-strong"
                          title={title}
                          onClick={() => applyFavorite(fav)}
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-slate-800">
                              {label.line1}
                            </span>
                            {label.line2 ? (
                              <span className="mt-0.5 block truncate text-xs font-medium text-slate-500">
                                {label.line2}
                              </span>
                            ) : null}
                          </span>
                          {(() => {
                            const status = resolveAbutmentAdoptionStatusWithCatalog(fav, connections);
                            if (status !== "requesting" && status !== "adopting") {
                              return null;
                            }
                            return (
                              <span className="mt-0.5 inline-flex shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                                {status === "adopting" ? "도입중" : "요청중"}
                              </span>
                            );
                          })()}
                        </button>
                      );
                    })()}
                    {canManagePresets ? (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-slate-400"
                          onClick={() => startEditPreset(fav)}
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
        "flex flex-col gap-3 rounded-xl border border-primary-muted/80 bg-primary-soft/50 p-3 sm:p-4",
        mode === "presets" && "min-h-0 flex-1",
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-2">
        <p className="text-sm font-semibold text-primary-strong">{heading}</p>
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
            <FamilyField
              value={requestDraft.family}
              options={mergeFamilyOptionsWithAllStandards(
                customFamilies,
                requestDraft.family ? [requestDraft.family] : [],
              )}
              removableFamilies={
                requestDraft.family && !isStandardFamily(requestDraft.family)
                  ? pushUniqueFamily(customFamilies, requestDraft.family)
                  : customFamilies
              }
              onAddFamily={addCustomFamily}
              onRemoveFamily={removeCustomFamily}
              onChange={(nextFamily) =>
                setRequestDraft((prev) => ({ ...prev, family: nextFamily }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm text-slate-600">타입</Label>
            <Input value={IMPLANT_ADD_REQUEST_OPTION} readOnly className="h-11 bg-slate-50 text-sm" />
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
              value={
                value.implantManufacturer
                  ? isCurrentRoundBarManufacturer
                    ? `${ROUND_BAR_MFR_PREFIX}${value.implantManufacturer}`
                    : value.implantManufacturer
                  : undefined
              }
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
                if (nextManufacturer.startsWith(ROUND_BAR_MFR_PREFIX)) {
                  const manufacturer = nextManufacturer.slice(ROUND_BAR_MFR_PREFIX.length);
                  const fav = pickRoundBarFavorite(manufacturer);
                  if (fav) {
                    applyFavorite(fav);
                    return;
                  }
                  onChange({
                    implantManufacturer: manufacturer,
                    implantBrand: "",
                    implantFamily: "",
                    implantType: IMPLANT_ADD_REQUEST_OPTION,
                    implantAddRequest: true,
                  });
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
                  implantAddRequest: isPendingCatalogSpec(
                    connections,
                    nextManufacturer,
                    nextBrand,
                    nextFamily,
                    nextType,
                  ),
                });
              }}
            >
              <SelectTrigger className={selectTriggerClass}>
                <SelectValue placeholder="제조사 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {cncManufacturerOptions.map((m) => (
                    <SelectItem key={`mfr-${m}`} value={m} className="text-sm">
                      {manufacturerLabelMap.get(m) || m}
                    </SelectItem>
                  ))}
                </SelectGroup>
                {roundBarManufacturerOptions.length > 0 ? (
                  <>
                    <SelectSeparator className="my-1.5 h-0.5 bg-slate-300" />
                    <SelectGroup>
                      {roundBarManufacturerOptions.map((m) => (
                        <SelectItem
                          key={`rb-mfr-${m}`}
                          value={`${ROUND_BAR_MFR_PREFIX}${m}`}
                          className="text-sm"
                          trailing={
                            <span className="inline-flex rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                              {(() => {
                                const fav = pickRoundBarFavorite(m);
                                const status = resolveAbutmentAdoptionStatusWithCatalog(fav, connections);
                                if (status === "adopting") return "도입중";
                                if (status === "requesting") return "요청중";
                                return "환봉";
                              })()}
                            </span>
                          }
                        >
                          {manufacturerLabelMap.get(m) || m}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                ) : null}
                {allowManufacturerRequest ? (
                  <>
                    <SelectSeparator className="my-1.5 h-0.5 bg-slate-300" />
                    <SelectItem
                      value={MANUFACTURER_ADD_REQUEST_VALUE}
                      className="text-sm font-semibold text-primary-strong"
                    >
                      임플란트 추가 요청
                    </SelectItem>
                  </>
                ) : null}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm text-slate-600">브랜드</Label>
            <Select
              value={resolveBrandForSelect(value.implantBrand, brandOptions) || undefined}
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
                  implantAddRequest: isPendingCatalogSpec(
                    connections,
                    value.implantManufacturer,
                    nextBrand,
                    nextFamily,
                    nextType,
                  ),
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
            <FamilyField
              key={`${value.implantManufacturer}|${value.implantBrand}`}
              value={
                resolveFamilyForSelect(value.implantFamily, familyOptions) || ""
              }
              options={familyOptions}
              labelMap={familyLabelMap}
              removableFamilies={removableFamilies}
              disabled={!value.implantBrand}
              onAddFamily={addCustomFamily}
              onRemoveFamily={removeCustomFamily}
              onChange={(nextFamily) => {
                const nextType =
                  pickFirst(
                    getTypes(
                      value.implantManufacturer,
                      value.implantBrand,
                      nextFamily,
                    ),
                  ) || value.implantType;
                onChange({
                  ...value,
                  implantFamily: nextFamily,
                  implantType: nextType,
                  implantAddRequest: isPendingCatalogSpec(
                    connections,
                    value.implantManufacturer,
                    value.implantBrand,
                    nextFamily,
                    nextType,
                  ),
                });
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm text-slate-600">타입</Label>
            <Select
              value={resolveTypeForSelect(value.implantType, typeOptions) || undefined}
              onValueChange={(nextType) => {
                onChange({
                  ...value,
                  implantType: nextType,
                  implantAddRequest: isPendingCatalogSpec(
                    connections,
                    value.implantManufacturer,
                    value.implantBrand,
                    value.implantFamily,
                    nextType,
                  ),
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

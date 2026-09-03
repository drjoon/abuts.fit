// related files:
// - web/backend/utils/roundBarAbutment.js
// - web/backend/controllers/practiceTransfers/roundBarAbutmentRequest.controller.js
// - web/backend/controllers/admin/admin.roundBarAbutment.controller.js
// - web/frontend/src/shared/components/practice/PracticeToothImplantFields.tsx
// - web/frontend/src/pages/admin/system/AdminRoundBarAbutmentTab.tsx
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// change-log:
// - 2026-09-03: LabPendingAbutmentGuide 표시는 `{라벨} — {치아번호}` (스펙 생략).
// - 2026-08-26: OR(` | `) 스펙 전개 헬퍼(드롭다운 개별 옵션).
// - 2026-08-26: 카탈로그 매칭으로 프리셋 도입중/요청중 뱃지·플래그 보강.
// - 2026-08-26: brand/family/type OR(` | `) 파싱·조인 헬퍼. 요청중/도입중/도입 상태.
// - 2026-08-26: 관리자 추가·isPublic·명시 저장(입력값 그대로).
// - 2026-08-24: 관리자 어벗 추가 요청 삭제 API 클라이언트.
// - 2026-09-02: 공개 카탈로그 미매칭 치식도 도입중 플래그 보강(안내·어벗츠 제외). 심플어벗은 보강 제외.
// - 2026-09-02: 어벗츠 제공만·완료 호버 툴팁 상수.
// - 2026-09-02: matchesRoundBarCatalogSpec — brand/family/type OR(` | `) 토큰 교집합.
// - 2026-09-02: 미제공 안내 라벨 — 기공소 자체 처리 / 어벗츠 생산의뢰(완료)·호버 툴팁.
// - 2026-09-02: 미제공 안내 라벨 — 자체 처리 / 어벗츠 생산의뢰(완료).
// - 2026-09-02: 미제공 안내 라벨 — 자체 처리 / 어벗츠 생산의뢰.
// - 2026-08-23: 미제공 안내 `{치아} : 어벗츠 미제공 커스텀어벗은…`.
// - 2026-08-21: 미제공 CA 안내 INTRO/OUTRO 단문화.
// - 2026-08-21: 미제공 CA 안내 INTRO/OUTRO·혼재 문구. 치아 상세는 LabPendingAbutmentGuide.
// - 2026-08-14: 도입 이벤트가 치과 프리셋에 없으면 행을 추가한다.
// - 2026-08-14: 관리자 타입 수정 패치.
// - 2026-08-14: 도입 실시간 이벤트(`practice:round-bar-request-updated`) 프리셋 patch.
import { apiFetch } from "@/shared/api/apiClient";
import type { PracticeImplantFavorite } from "@/shared/practice/transferMemo";

export const ROUND_BAR_HEX_TYPE = "헥스(사이즈 미정)";
export const MANUFACTURER_ADD_REQUEST_VALUE = "__add_manufacturer_request__";
/** 임플란트 추가 요청(메모 1줄) 저장 시 brand/family 자리표시 */
export const MANUFACTURER_ADD_REQUEST_BRAND = "추가요청";
export const MANUFACTURER_ADD_REQUEST_FAMILY = "미정";
/**
 * 「임플란트 추가 요청」옵션 SSOT.
 * pending/어벗츠 미제공 판별은 implantType=헥스(사이즈 미정)가 아니라 이 옵션·플래그를 쓴다.
 */
export const IMPLANT_ADD_REQUEST_OPTION = "임플란트 추가 요청";
export const ROUND_BAR_REQUEST_UPDATED_EVENT = "practice:round-bar-request-updated";
/** brand/family/type 다중 옵션 저장 구분자 (OR) */
export const ROUND_BAR_OR_JOIN = " | ";
export const ABUTMENT_ADOPTED_KIND = {
  CNC: "cnc",
  ROUND_BAR: "round_bar",
} as const;
export type AbutmentAdoptedKind = "" | "cnc" | "round_bar";

export const normalizeAdoptedKind = (value: unknown): AbutmentAdoptedKind => {
  const raw = String(value || "").trim().toLowerCase().replace(/-/g, "_");
  if (raw === ABUTMENT_ADOPTED_KIND.CNC) return ABUTMENT_ADOPTED_KIND.CNC;
  if (raw === ABUTMENT_ADOPTED_KIND.ROUND_BAR || raw === "roundbar") {
    return ABUTMENT_ADOPTED_KIND.ROUND_BAR;
  }
  return "";
};

/** brand/family/type OR 문자열 → 고유 토큰 배열 */
export const splitOrValues = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of value) {
      for (const part of splitOrValues(item)) {
        const key = part.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(part);
      }
    }
    return out;
  }
  const text = String(value || "").trim();
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/\s*\|\s*/)) {
    const token = String(part || "").trim();
    if (!token) continue;
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(token);
  }
  return out;
};

export const joinOrValues = (
  values: unknown,
  uppercase = false,
): string => {
  const parts = splitOrValues(values).map((v) =>
    uppercase ? String(v).toUpperCase() : String(v),
  );
  return parts.join(ROUND_BAR_OR_JOIN);
};

/** UI 다중 입력용: 비어 있으면 [""] */
export const orValuesForEdit = (value: unknown): string[] => {
  const parts = splitOrValues(value);
  return parts.length > 0 ? parts : [""];
};

/** OR 스펙을 manufacturer×brand×family×type 조합으로 전개(드롭다운·카탈로그). */
export const expandRoundBarOrCombos = ({
  manufacturer,
  brand,
  family,
  type,
  defaultType = "Hex",
}: {
  manufacturer?: string;
  brand?: string;
  family?: string;
  type?: string;
  defaultType?: string;
} = {}) => {
  const mfr = String(manufacturer || "").trim();
  if (!mfr) return [];
  const brands = splitOrValues(brand);
  const families = splitOrValues(family);
  const types = splitOrValues(type);
  const brandList = brands.length ? brands : [""];
  const familyList = families.length ? families : [""];
  const typeList = types.length ? types : [defaultType];
  const out: Array<{
    manufacturer: string;
    brand: string;
    family: string;
    type: string;
  }> = [];
  const seen = new Set<string>();
  for (const b of brandList) {
    for (const f of familyList) {
      for (const t of typeList) {
        const typeValue = String(t || "").trim() || defaultType;
        const key = `${mfr}|${b}|${f}|${typeValue}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          manufacturer: mfr,
          brand: String(b || "").trim(),
          family: String(f || "").trim(),
          type: typeValue,
        });
      }
    }
  }
  return out;
};

/** brand/family/type에 OR(` | `) 다중값이 있는지 */
export const hasOrSpecValues = (row: unknown) => {
  if (!row || typeof row !== "object") return false;
  const r = row as { brand?: string; family?: string; type?: string };
  return (
    splitOrValues(r.brand).length > 1 ||
    splitOrValues(r.family).length > 1 ||
    splitOrValues(r.type).length > 1
  );
};

/**
 * OR 스펙 프리셋을 개별 manufacturer×brand×family×type 행으로 전개.
 * 카탈로그·드롭다운과 동일 — 프리셋 카드에 3.5 | 4.0 합쳐 표시하지 않음.
 */
export const expandImplantFavoriteRow = <T extends PracticeImplantFavorite>(
  row: T,
): T[] => {
  if (!row) return [];
  if (isManufacturerAddRequestFavorite(row)) return [row];
  if (!hasOrSpecValues(row)) return [row];
  const defaultType = isImplantAddRequest(row)
    ? IMPLANT_ADD_REQUEST_OPTION
    : ROUND_BAR_HEX_TYPE;
  const combos = expandRoundBarOrCombos({
    manufacturer: row.manufacturer,
    brand: row.brand,
    family: row.family,
    type: row.type,
    defaultType,
  });
  if (combos.length <= 1) return [row];
  const baseId = String(row.id || "").trim();
  return combos.map((combo, idx) => ({
    ...row,
    id:
      idx === 0 && baseId
        ? baseId
        : baseId
          ? `${baseId}-exp-${idx}`
          : `imp-or-${idx}`,
    manufacturer: combo.manufacturer,
    brand: combo.brand,
    family: combo.family,
    type: combo.type,
  }));
};

/** 프리셋 목록 OR 전개 + 스펙 중복 제거(개별 행 우선). */
export const expandImplantFavoriteList = (
  favorites: PracticeImplantFavorite[],
): PracticeImplantFavorite[] => {
  const list = Array.isArray(favorites) ? favorites : [];
  const out: PracticeImplantFavorite[] = [];
  const seen = new Map<string, number>();
  for (const fav of list) {
    for (const expanded of expandImplantFavoriteRow(fav)) {
      const type = String(expanded.type || "").trim();
      const key = [
        String(expanded.manufacturer || "").trim(),
        String(expanded.brand || "").trim(),
        String(expanded.family || "").trim(),
        type,
      ]
        .map((v) => v.toLowerCase())
        .join("|");
      if (!key.replace(/\|/g, "")) continue;
      if (seen.has(key)) {
        const idx = seen.get(key);
        if (idx == null) continue;
        const prev = out[idx];
        if (!prev.roundBar && expanded.roundBar) {
          out[idx] = { ...prev, ...expanded, id: prev.id || expanded.id };
        }
        continue;
      }
      seen.set(key, out.length);
      out.push(expanded);
    }
  }
  return out;
};

export const ROUND_BAR_GUIDE_TITLE = "안내";
export const ROUND_BAR_GUIDE_LINES = [
  "어벗츠에서 빠른 시일내 준비하겠습니다.",
  "일단 거래하시는 기공소로 주문합니다.",
] as const;
/**
 * 기공소 수신: 임플란트 추가 요청(요청중) — 어벗츠 CNC 미제공.
 * 표시: `{라벨} — {치아번호}` (LabPendingAbutmentGuide, 예: `11, 21`)
 */
export const LAB_PENDING_ABUTMENT_SELF_PROCESS_LABEL = "기공소 자체 처리";
export const LAB_PENDING_ABUTMENT_ABUTS_ORDER_LABEL = "어벗츠 생산의뢰";
/** STL 업로드 후 — 이미 제조사 큐에 등록됨 */
export const LAB_PENDING_ABUTMENT_ABUTS_ORDERED_LABEL = "어벗츠 생산의뢰 완료";
/** 호버 툴팁 — 미제공만 */
export const LAB_PENDING_ABUTMENT_TOOLTIP_SELF_ONLY =
  "어벗츠에서 아직 CNC를 제공하지 않는 임플란트입니다. 해당 커스텀어벗은 기공소에서 자체 제작하세요.";
/** 호버 툴팁 — 어벗츠 제공만(업로드 전) */
export const LAB_PENDING_ABUTMENT_TOOLTIP_ABUTS_ONLY =
  "어벗츠에서 CNC를 제공하는 커스텀어벗입니다. STL을 올려 생산 의뢰하세요.";
/** 호버 툴팁 — 어벗츠 제공만(생산의뢰 완료) */
export const LAB_PENDING_ABUTMENT_TOOLTIP_ABUTS_ORDERED =
  "어벗츠 대상은 이미 생산 의뢰되었습니다. 준비 단계에서는 취소·재업로드할 수 있습니다.";
/** 호버 툴팁 — 미제공 + 어벗츠 대상(업로드 전) */
export const LAB_PENDING_ABUTMENT_TOOLTIP_MIXED =
  "어벗츠 미제공 치아는 기공소에서 자체 제작하고, 어벗츠 대상만 STL을 올려 생산 의뢰하세요.";
/** 호버 툴팁 — 미제공 + 어벗츠 생산의뢰 완료 */
export const LAB_PENDING_ABUTMENT_TOOLTIP_MIXED_ORDERED =
  "어벗츠 미제공 치아는 기공소에서 자체 제작하세요. 어벗츠 대상은 이미 생산 의뢰되었고, 준비 단계에서는 취소·재업로드할 수 있습니다.";
/** @deprecated 라벨 SSOT — SELF_PROCESS_LABEL 사용 */
export const LAB_PENDING_ABUTMENT_GUIDE_BODY =
  LAB_PENDING_ABUTMENT_SELF_PROCESS_LABEL;
/** @deprecated 혼재 시 두 줄(자체 처리 + 어벗츠 생산의뢰) 표시 */
export const LAB_PENDING_ABUTMENT_MIXED_GUIDE_BODY =
  LAB_PENDING_ABUTMENT_ABUTS_ORDER_LABEL;
/** @deprecated */
export const LAB_PENDING_ABUTMENT_GUIDE_INTRO = LAB_PENDING_ABUTMENT_GUIDE_BODY;
export const LAB_PENDING_ABUTMENT_GUIDE_OUTRO = LAB_PENDING_ABUTMENT_GUIDE_BODY;
export const LAB_PENDING_ABUTMENT_MIXED_GUIDE_INTRO =
  LAB_PENDING_ABUTMENT_MIXED_GUIDE_BODY;
export const LAB_PENDING_ABUTMENT_MIXED_GUIDE_OUTRO =
  LAB_PENDING_ABUTMENT_MIXED_GUIDE_BODY;
export const LAB_PENDING_ABUTMENT_GUIDE_LINES = [
  LAB_PENDING_ABUTMENT_SELF_PROCESS_LABEL,
  LAB_PENDING_ABUTMENT_ABUTS_ORDER_LABEL,
  LAB_PENDING_ABUTMENT_ABUTS_ORDERED_LABEL,
] as const;

export type RoundBarAbutmentRequest = {
  id: string;
  practiceAnchorId: string;
  practiceName: string;
  requestedBy: string;
  favoriteId: string;
  inquiryId: string;
  manufacturer: string;
  brand: string;
  family: string;
  type: string;
  adopted: boolean;
  adoptedKind?: AbutmentAdoptedKind;
  isPublic?: boolean;
  adoptedAt?: string | null;
  revertedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type RoundBarRequestPayload = {
  manufacturer: string;
  brand: string;
  family: string;
  favoriteId?: string;
};

export const isRoundBarFavorite = (row: Partial<PracticeImplantFavorite> | null | undefined) =>
  Boolean(row?.roundBar) ||
  Boolean(row?.isPublic) ||
  Boolean(String(row?.roundBarRequestId || "").trim());

/** 임플란트 추가 요청 옵션(프리셋·치식). 레거시 brand=추가요청도 동일. */
export const isImplantAddRequest = (
  row:
    | Partial<PracticeImplantFavorite>
    | Partial<{
        implantAddRequest?: boolean;
        implantBrand?: string;
        implantType?: string;
        brand?: string;
        type?: string;
      }>
    | null
    | undefined,
) => {
  if (!row) return false;
  if (Boolean((row as { implantAddRequest?: boolean }).implantAddRequest)) {
    return true;
  }
  const brand = String(
    (row as { brand?: string }).brand ||
      (row as { implantBrand?: string }).implantBrand ||
      "",
  ).trim();
  if (brand === MANUFACTURER_ADD_REQUEST_BRAND) return true;
  const brandFirst = splitOrValues(brand)[0] || "";
  if (brandFirst === MANUFACTURER_ADD_REQUEST_BRAND) return true;
  const type = String(
    (row as { type?: string }).type ||
      (row as { implantType?: string }).implantType ||
      "",
  ).trim();
  const typeFirst = splitOrValues(type)[0] || type;
  return typeFirst === IMPLANT_ADD_REQUEST_OPTION;
};

/** 메모만 넣은 임플란트 추가 요청(표시는 manufacturer만) */
export const isManufacturerAddRequestFavorite = (
  row: Partial<PracticeImplantFavorite> | null | undefined,
) => isImplantAddRequest(row);

export type AbutmentAdoptionStatus = "" | "requesting" | "adopting" | "adopted";

/**
 * 어벗 추가 요청 상태 SSOT.
 * - requesting(요청중): 치과 요청, 관리자 미공개
 * - adopting(도입중): 공개됨·미도입 → 기공소 자체 처리, 제조사/견적 제외
 * - adopted(도입): 뱃지 없음, 제조사·견적 정상
 */
export const resolveAbutmentAdoptionStatus = (
  row:
    | Partial<{
        roundBar?: boolean;
        roundBarRequestId?: string;
        implantAddRequest?: boolean;
        adopted?: boolean;
        roundBarAdopted?: boolean;
        isPublic?: boolean;
        brand?: string;
        type?: string;
        implantBrand?: string;
        implantType?: string;
      }>
    | null
    | undefined,
): AbutmentAdoptionStatus => {
  if (!row) return "";
  const roundBar =
    Boolean(row.roundBar) ||
    Boolean(String(row.roundBarRequestId || "").trim()) ||
    Boolean(row.isPublic) ||
    isImplantAddRequest(row);
  if (!roundBar) return "";
  if (row.roundBarAdopted === true || row.adopted === true) return "adopted";
  if (Boolean(row.isPublic)) return "adopting";
  return "requesting";
};

export const isPendingAbutmentAdoption = (
  row: Parameters<typeof resolveAbutmentAdoptionStatus>[0],
) => {
  const status = resolveAbutmentAdoptionStatus(row);
  return status === "requesting" || status === "adopting";
};

export type RoundBarCatalogRow = {
  manufacturer?: string;
  brand?: string;
  family?: string;
  type?: string;
  roundBar?: boolean;
  adopted?: boolean;
  isPublic?: boolean;
};

const normalizeSpecToken = (value: unknown) =>
  String(value || "").trim().toLowerCase();

const sameSpecManufacturer = (a: string, b: string) => {
  const left = normalizeSpecToken(a);
  const right = normalizeSpecToken(b);
  return Boolean(left) && left === right;
};

/** OR(` | `) 토큰 교집합. 한쪽이 비면 와일드카드. */
const orSpecTokensOverlap = (a: string, b: string) => {
  const left = splitOrValues(a).map(normalizeSpecToken).filter(Boolean);
  const right = splitOrValues(b).map(normalizeSpecToken).filter(Boolean);
  if (left.length === 0 || right.length === 0) return true;
  return left.some((token) => right.includes(token));
};

/** fav·카탈로그 행 스펙 일치(대소문자 무시, family/type 빈 값·OR 토큰 와일드카드). */
export const matchesRoundBarCatalogSpec = (
  row: { manufacturer?: string; brand?: string; family?: string; type?: string },
  catalogRow: RoundBarCatalogRow,
) => {
  const manufacturer = String(row.manufacturer || "").trim();
  const brand = String(row.brand || "").trim();
  const family = String(row.family || "").trim();
  const type = String(row.type || "").trim();
  const catalogManufacturer = String(catalogRow.manufacturer || "").trim();
  const catalogBrand = String(catalogRow.brand || "").trim();
  const catalogFamily = String(catalogRow.family || "").trim();
  const catalogType = String(catalogRow.type || "").trim();
  if (!manufacturer || !brand || !catalogManufacturer || !catalogBrand) return false;
  if (!sameSpecManufacturer(manufacturer, catalogManufacturer)) return false;
  if (!orSpecTokensOverlap(brand, catalogBrand)) return false;
  if (family && catalogFamily && !orSpecTokensOverlap(family, catalogFamily)) {
    return false;
  }
  if (type && catalogType && !orSpecTokensOverlap(type, catalogType)) {
    return false;
  }
  return true;
};

export const findRoundBarCatalogMatch = (
  catalog: RoundBarCatalogRow[],
  row: { manufacturer?: string; brand?: string; family?: string; type?: string },
): RoundBarCatalogRow | null => {
  for (const entry of catalog) {
    if (!entry.roundBar && !entry.isPublic) continue;
    if (matchesRoundBarCatalogSpec(row, entry)) return entry;
  }
  return null;
};

/**
 * 치식에 도입중/요청중 플래그가 없어도 공개·미도입 카탈로그와 일치하면
 * implantAddRequest·roundBar를 보강(기공소 자체 처리 안내·어벗츠 CNC 제외).
 */
export const enrichToothWorksPendingFromCatalog = <
  T extends {
    customAbutment?: boolean;
    implantManufacturer?: string;
    implantBrand?: string;
    implantFamily?: string;
    implantType?: string;
    implantAddRequest?: boolean;
    roundBar?: boolean;
    isPublic?: boolean;
    adopted?: boolean;
    roundBarAdopted?: boolean;
    roundBarRequestId?: string;
  },
>(
  rows: T[] | null | undefined,
  catalog: RoundBarCatalogRow[] = [],
): T[] => {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return list;
  if (!Array.isArray(catalog) || catalog.length === 0) return list;
  return list.map((row) => {
    if (!row?.customAbutment) return row;
    // 심플어벗(치과 재고)은 기공소 자체 처리 대상이 아님 — labFeeSchedule과 순환 import 방지용 인라인.
    const abutmentManufacturer = String(
      (row as { abutmentManufacturer?: string }).abutmentManufacturer || "",
    ).trim();
    if (abutmentManufacturer === "심플어벗" || abutmentManufacturer === "심플밀링") {
      return row;
    }
    if (row.roundBarAdopted === true || row.adopted === true) return row;
    if (isPendingAbutmentAdoption(row)) return row;
    const match = findRoundBarCatalogMatch(catalog, {
      manufacturer: row.implantManufacturer,
      brand: row.implantBrand,
      family: row.implantFamily,
      type: row.implantType,
    });
    if (!match || match.adopted) return row;
    return {
      ...row,
      implantAddRequest: true,
      roundBar: true,
      isPublic: Boolean(match.isPublic) || undefined,
    };
  });
};

/** 프리셋 자체 플래그가 없어도 공개 카탈로그와 일치하면 도입중/요청중 판별. */
export const resolveAbutmentAdoptionStatusWithCatalog = (
  row: Parameters<typeof resolveAbutmentAdoptionStatus>[0],
  catalog: RoundBarCatalogRow[] = [],
): AbutmentAdoptionStatus => {
  const direct = resolveAbutmentAdoptionStatus(row);
  if (direct) return direct;
  const match = findRoundBarCatalogMatch(catalog, row || {});
  if (!match) return "";
  if (match.adopted) return "adopted";
  if (match.isPublic) return "adopting";
  return "requesting";
};

export const isPendingAbutmentAdoptionWithCatalog = (
  row: Parameters<typeof resolveAbutmentAdoptionStatus>[0],
  catalog: RoundBarCatalogRow[] = [],
) => {
  const status = resolveAbutmentAdoptionStatusWithCatalog(row, catalog);
  return status === "requesting" || status === "adopting";
};

export const enrichImplantFavoriteFromCatalog = <T extends PracticeImplantFavorite>(
  fav: T,
  catalog: RoundBarCatalogRow[],
): T => {
  if (resolveAbutmentAdoptionStatus(fav)) return fav;
  const match = findRoundBarCatalogMatch(catalog, fav);
  if (!match) return fav;
  return {
    ...fav,
    roundBar: true,
    isPublic: Boolean(match.isPublic) || undefined,
    adopted: Boolean(match.adopted) || undefined,
  };
};

export type ImplantFavoriteLabelParts = {
  line1: string;
  line2: string;
  memoOnly: boolean;
};

/** 프리셋 라벨: 1줄=제조사·브랜드, 2줄=패밀리·타입. 추가요청 메모는 제조사만. */
export const implantFavoriteLabelParts = (row: {
  manufacturer?: string;
  brand?: string;
  family?: string;
  type?: string;
  roundBar?: boolean;
  roundBarRequestId?: string;
  adopted?: boolean;
}): ImplantFavoriteLabelParts => {
  const manufacturer = String(row?.manufacturer || "").trim();
  if (isManufacturerAddRequestFavorite(row)) {
    return { line1: manufacturer || "임플란트 추가 요청", line2: "", memoOnly: true };
  }
  const brand = String(row?.brand || "").trim();
  const family = String(row?.family || "").trim();
  const type = String(row?.type || "").trim();
  return {
    line1: [manufacturer, brand].filter(Boolean).join(" / ") || "임플란트",
    line2: [family, type].filter(Boolean).join(" / "),
    memoOnly: false,
  };
};

export type RoundBarRequestUpdatedPayload = {
  practiceAnchorId?: string;
  requestId?: string;
  favoriteId?: string;
  adopted?: boolean;
  adoptedKind?: AbutmentAdoptedKind;
  isPublic?: boolean;
  manufacturer?: string;
  brand?: string;
  family?: string;
  type?: string;
  deleted?: boolean;
};

export const applyRoundBarRequestUpdate = (
  favorites: PracticeImplantFavorite[],
  payload: RoundBarRequestUpdatedPayload | null | undefined,
): PracticeImplantFavorite[] => {
  const requestId = String(payload?.requestId || "").trim();
  const favoriteId = String(payload?.favoriteId || "").trim();
  if (!requestId && !favoriteId) return favorites;
  if (payload?.deleted) {
    return favorites.filter((fav) => {
      if (requestId && String(fav.roundBarRequestId || "").trim() === requestId) {
        return false;
      }
      if (favoriteId && fav.id === favoriteId && !Boolean(fav.adopted)) {
        return false;
      }
      return true;
    });
  }
  const adopted = Boolean(payload?.adopted);
  const adoptedKind = normalizeAdoptedKind(payload?.adoptedKind);
  const isPublic = Boolean(payload?.isPublic);
  const overwriteSpec = isPublic || adopted;
  const manufacturer = String(payload?.manufacturer || "").trim();
  const brand = String(payload?.brand || "").trim();
  const family = String(payload?.family || "").trim();
  const type = String(payload?.type || "").trim() || ROUND_BAR_HEX_TYPE;
  let matched = false;
  const next = favorites.map((fav) => {
    const match =
      (requestId && String(fav.roundBarRequestId || "").trim() === requestId) ||
      (favoriteId && fav.id === favoriteId);
    if (!match) return fav;
    matched = true;
    return {
      ...fav,
      roundBar: true,
      adopted,
      adoptedKind,
      isPublic,
      implantAddRequest: overwriteSpec ? undefined : fav.implantAddRequest,
      roundBarRequestId: requestId || fav.roundBarRequestId,
      manufacturer: overwriteSpec ? manufacturer : manufacturer || fav.manufacturer,
      brand: overwriteSpec ? brand : brand || fav.brand,
      family: overwriteSpec ? family : family || fav.family,
      type: overwriteSpec ? type : type || fav.type,
    };
  });
  if (matched || (!adopted && !isPublic) || !manufacturer) {
    return expandImplantFavoriteList(next);
  }
  return expandImplantFavoriteList([
    {
      id: favoriteId || (requestId ? `imp-rb-${requestId.slice(-8)}` : `imp-rb-${Date.now().toString(36)}`),
      manufacturer,
      brand,
      family,
      type,
      roundBar: true,
      adopted,
      adoptedKind,
      isPublic,
      roundBarRequestId: requestId || undefined,
    },
    ...next,
  ]);
};

export async function submitRoundBarManufacturerRequest(params: {
  token: string;
  payload: RoundBarRequestPayload;
}) {
  const res = await apiFetch<{
    success?: boolean;
    message?: string;
    data?: {
      request?: RoundBarAbutmentRequest;
      favorite?: PracticeImplantFavorite;
    };
  }>({
    path: "/api/practice/transfers/round-bar-requests",
    method: "POST",
    token: params.token,
    jsonBody: {
      manufacturer: String(params.payload.manufacturer || "").trim(),
      brand: String(params.payload.brand || "").trim(),
      family: String(params.payload.family || "").trim(),
      type: IMPLANT_ADD_REQUEST_OPTION,
      implantAddRequest: true,
      favoriteId: String(params.payload.favoriteId || "").trim() || undefined,
    },
    skipCache: true,
  });
  if (!res.ok) {
    throw new Error(res.data?.message || "임플란트 추가 요청에 실패했습니다.");
  }
  return res.data?.data || {};
}

export async function fetchAdminRoundBarRequests(params: {
  token: string;
  q?: string;
  status?: "pending" | "adopted" | "";
}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.status) qs.set("status", params.status);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await apiFetch<{
    success?: boolean;
    message?: string;
    data?: RoundBarAbutmentRequest[];
  }>({
    path: `/api/admin/round-bar-requests${suffix}`,
    method: "GET",
    token: params.token,
    skipCache: true,
  });
  if (!res.ok) {
    throw new Error(res.data?.message || "목록을 불러오지 못했습니다.");
  }
  return Array.isArray(res.data?.data) ? res.data.data : [];
}

export async function createAdminRoundBarRequest(params: {
  token: string;
  payload: Partial<
    Pick<
      RoundBarAbutmentRequest,
      | "manufacturer"
      | "brand"
      | "family"
      | "type"
      | "adopted"
      | "adoptedKind"
      | "isPublic"
    >
  >;
}) {
  const res = await apiFetch<{
    success?: boolean;
    message?: string;
    data?: RoundBarAbutmentRequest;
  }>({
    path: "/api/admin/round-bar-requests",
    method: "POST",
    token: params.token,
    jsonBody: params.payload,
    skipCache: true,
  });
  if (!res.ok) {
    throw new Error(res.data?.message || "추가에 실패했습니다.");
  }
  return res.data?.data || null;
}

export async function patchAdminRoundBarRequest(params: {
  token: string;
  id: string;
  patch: Partial<
    Pick<
      RoundBarAbutmentRequest,
      | "manufacturer"
      | "brand"
      | "family"
      | "type"
      | "adopted"
      | "adoptedKind"
      | "isPublic"
    >
  >;
}) {
  const res = await apiFetch<{
    success?: boolean;
    message?: string;
    data?: RoundBarAbutmentRequest;
  }>({
    path: `/api/admin/round-bar-requests/${encodeURIComponent(params.id)}`,
    method: "PATCH",
    token: params.token,
    jsonBody: params.patch,
    skipCache: true,
  });
  if (!res.ok) {
    throw new Error(res.data?.message || "저장에 실패했습니다.");
  }
  return res.data?.data || null;
}

export async function deleteAdminRoundBarRequest(params: {
  token: string;
  id: string;
}) {
  const res = await apiFetch<{
    success?: boolean;
    message?: string;
    data?: { id?: string };
  }>({
    path: `/api/admin/round-bar-requests/${encodeURIComponent(params.id)}`,
    method: "DELETE",
    token: params.token,
    skipCache: true,
  });
  if (!res.ok) {
    throw new Error(res.data?.message || "삭제에 실패했습니다.");
  }
  return res.data?.data || null;
}

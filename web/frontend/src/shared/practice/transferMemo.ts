// related files:
// - web/frontend/src/shared/components/practice/PracticeTransferRequestIntakePanel.tsx
// - web/frontend/src/shared/practice/toothWorkDraft.ts
// - web/frontend/src/shared/practice/usePracticeToothWorkEditor.ts
// - web/backend/services/practiceTransferProduction.service.js
// - web/backend/controllers/practiceTransfers/practiceTransferSettings.controller.js
// change-log:
// - 2026-09-01: 기공의뢰 caseInfos.tooth는 toothWorks 치식 SSOT(파일명 추출 금지). 단치아면 파일에도 반영.
// - 2026-08-25: 커스텀어벗 보철 형태는 심플어벗 불가 — 어벗 쪽 완성=스캔바디만.
// - 2026-08-25: 심플어벗(심플어벗/심플밀링·직경 6–10·높이 S/M/L) — 스캔바디와 XOR. 완성 시 프리셋 충족.
// - 2026-08-21: 임플란트 추가 요청 프리셋 type을 옵션명으로 정규화(레거시 헥스 → 선택 가능).
// - 2026-08-21: 기공소 수신 — 환봉·제조사 추가요청(요청중) CA는 「커스텀어벗」(기공소 수행). 그 외는 「어벗츠 지급」.
// - 2026-08-16: formatToothNumbersForCard — 의뢰 목록 카드용 치아번호만(11,21).
// - 2026-08-14: 기공소 수신(labFacing) 치식 표시 — 커스텀어벗 → 어벗츠 지급.
// - 2026-08-14: 같은 스펙이면 환봉 도입 프리셋을 일반 프리셋보다 우선한다.
// - 2026-08-14: implantFavorites 환봉 제조사 추가요청(roundBar/adopted/roundBarRequestId).
// - 2026-08-22: skipJig 옵션 삭제. canOffer/resolve 항상 false. [지그제작생략]은 레거시 파싱만.
// - 2026-08-16: 메모 메타 [지그제작생략] — skipJig 스냅샷(기본 true·명시 N만 false).(레거시)
// - 2026-08-13: 커스텀어벗 치아별 생산만/디자인+생산(abutmentProductMode) 저장·직렬화.
// - 2026-08-13: 계정 기본 모드(defaultAbutmentProductMode)는 디자인+생산. 치아 미설정 레거시는 생산만.
// - 2026-08-13: 크라운+커스텀어벗 플래그 직렬화 지원(isCustomAbutmentSupportedProsthesisType).
// - 2026-08-13: 연결 보철에 유지장치·임시치아 추가. 링크 직렬화는 isLinkableProsthesisType.
// - 2026-08-13: 유지장치=브리지 계열(2치+). 임시치아=단독·연결 모두.
// - 2026-08-13: 어벗 체크 시 임플란트·스캔바디 프리셋 필수. 미선택이면 전송 불가.
// - 2026-08-13: 유지장치에 남은 커스텀 플래그는 프리셋 필수로 보지 않는다.
// - 2026-08-19: 임시치아도 크라운·브리지처럼 커스텀어벗 체크·프리셋 필수.
// - 2026-08-19: 브리지 연결 시 한쪽이 임시치아이면 스팬 전체가 임시치아. 커스텀 규격은 형태와 무관하게 유지.
// - 2026-08-20: Pontic UI 제거. 레거시 Pontic은 브리지로 정규화(기공소가 지대치 없음을 추론).
import { isPendingRoundBarAbutment } from "@/shared/practice/labFeeSchedule";
import {
  IMPLANT_ADD_REQUEST_OPTION,
  MANUFACTURER_ADD_REQUEST_BRAND,
  expandImplantFavoriteList,
  isImplantAddRequest,
} from "@/shared/practice/roundBarAbutment";

export const ABUTMENT_PRODUCT_MODE = {
  PRODUCTION: "custom_abutment",
  DESIGN_AND_PRODUCTION: "design_custom_abutment",
} as const;

export type AbutmentProductMode =
  (typeof ABUTMENT_PRODUCT_MODE)[keyof typeof ABUTMENT_PRODUCT_MODE];

/** 계정 설정·신규 커스텀어벗 모달 초기값. 치아 레거시 폴백(resolveToothAbutmentProductMode)과 다름 */
export const DEFAULT_ACCOUNT_ABUTMENT_PRODUCT_MODE =
  ABUTMENT_PRODUCT_MODE.PRODUCTION;

export const isAbutmentProductMode = (value: unknown): value is AbutmentProductMode =>
  value === ABUTMENT_PRODUCT_MODE.PRODUCTION ||
  value === ABUTMENT_PRODUCT_MODE.DESIGN_AND_PRODUCTION;

export const normalizeAccountAbutmentProductMode = (
  value: unknown,
): AbutmentProductMode =>
  isAbutmentProductMode(value) ? value : DEFAULT_ACCOUNT_ABUTMENT_PRODUCT_MODE;

export const ABUTMENT_PRODUCT_MODE_LABEL: Record<AbutmentProductMode, string> = {
  [ABUTMENT_PRODUCT_MODE.PRODUCTION]: "생산만 의뢰",
  [ABUTMENT_PRODUCT_MODE.DESIGN_AND_PRODUCTION]: "디자인+생산 의뢰",
};

export const ABUTMENT_PRODUCT_MODE_SHORT_LABEL: Record<AbutmentProductMode, string> = {
  [ABUTMENT_PRODUCT_MODE.PRODUCTION]: "생산만",
  [ABUTMENT_PRODUCT_MODE.DESIGN_AND_PRODUCTION]: "디자인+생산",
};

const CUSTOM_ABUTMENT_DESIGN_TOKEN = "커스텀어벗디자인생산";
const CUSTOM_ABUTMENT_TOKEN = "커스텀어벗";

export type ToothWorkSelection = {
  toothNumber: string;
  prosthesisType: string;
  customAbutment: boolean;
  /** 커스텀어벗일 때만 의미. 신규 선택은 계정 기본(디자인+생산). 미설정 레거시는 생산만 */
  abutmentProductMode?: AbutmentProductMode;
  bridgeLinkedTeeth: string[];
  /** 커스텀어벗일 때만 의미 있음. 동기화/임시저장 memo에 포함 */
  implantManufacturer?: string;
  implantBrand?: string;
  implantFamily?: string;
  implantType?: string;
  /** 「임플란트 추가 요청」옵션 — 어벗츠 CNC 미제공·기공소 직접 CNC */
  implantAddRequest?: boolean;
  /**
   * 커스텀어벗 규격 (제조사/직경/높이).
   * 스캔바디 프리셋과 심플어벗이 같은 필드를 XOR로 공유한다.
   * 심플어벗일 때 manufacturer=심플어벗|심플밀링, diameter=6–10, height=S|M|L.
   */
  abutmentManufacturer?: string;
  abutmentDiameter?: string;
  abutmentHeight?: string;
};

/** 심플어벗 종류 — abutmentManufacturer에 저장 (스캔바디와 XOR) */
export const SIMPLE_ABUTMENT_KINDS = ["심플어벗", "심플밀링"] as const;
export type SimpleAbutmentKind = (typeof SIMPLE_ABUTMENT_KINDS)[number];
export const SIMPLE_ABUTMENT_DIAMETERS = ["6", "7", "8", "9", "10"] as const;
export type SimpleAbutmentDiameter = (typeof SIMPLE_ABUTMENT_DIAMETERS)[number];
export const SIMPLE_ABUTMENT_HEIGHTS = ["S", "M", "L"] as const;
export type SimpleAbutmentHeight = (typeof SIMPLE_ABUTMENT_HEIGHTS)[number];

export const isSimpleAbutmentKind = (value: unknown): value is SimpleAbutmentKind =>
  (SIMPLE_ABUTMENT_KINDS as readonly string[]).includes(String(value || "").trim());

export const isSimpleAbutmentDiameter = (
  value: unknown,
): value is SimpleAbutmentDiameter =>
  (SIMPLE_ABUTMENT_DIAMETERS as readonly string[]).includes(String(value || "").trim());

export const isSimpleAbutmentHeight = (value: unknown): value is SimpleAbutmentHeight =>
  (SIMPLE_ABUTMENT_HEIGHTS as readonly string[]).includes(String(value || "").trim());

/** 심플어벗 모드(종류만 골라도 true). 스캔바디와 XOR 판별용 */
export const isSimpleAbutmentMode = (
  row: Partial<ToothWorkSelection> | null | undefined,
) => isSimpleAbutmentKind(row?.abutmentManufacturer);

export const resolveToothAbutmentProductMode = (
  row?: Partial<ToothWorkSelection> | null,
): AbutmentProductMode => {
  if (!row?.customAbutment) return ABUTMENT_PRODUCT_MODE.PRODUCTION;
  const raw = String(row.abutmentProductMode || "").trim();
  if (raw === ABUTMENT_PRODUCT_MODE.DESIGN_AND_PRODUCTION) {
    return ABUTMENT_PRODUCT_MODE.DESIGN_AND_PRODUCTION;
  }
  return ABUTMENT_PRODUCT_MODE.PRODUCTION;
};

/**
 * 기공소 보철 배송이 필요한 치식(인레이·크라운·브리지 등).
 * 커스텀어벗 단독·작업X는 제외. 크라운+CA는 보철로 본다.
 */
export const toothWorkHasLabProsthesis = (
  row?: Partial<ToothWorkSelection> | null,
) => {
  const type = String(row?.prosthesisType || "").trim();
  if (!type) return false;
  if (isMissingToothProsthesisType(type)) return false;
  if (isCustomAbutmentProsthesisType(type)) return false;
  return true;
};

/**
 * @deprecated 2026-08-22 skipJig UI/옵션 삭제. 항상 false.
 * 레거시: 「지그 제작 불필요」체크(디자인+생산 CA만·보철 없음).
 */
export const canOfferPracticeTransferSkipJig = (
  _toothWorks?: Array<Partial<ToothWorkSelection> | null> | null,
) => false;

/**
 * @deprecated 2026-08-22 skipJig 옵션 삭제. 항상 false.
 * DB/메모 `[지그제작생략]` 은 레거시 스냅샷 파싱용으로만 남을 수 있음.
 */
export const resolvePracticeTransferSkipJig = (
  _toothWorks?: Array<Partial<ToothWorkSelection> | null> | null,
  _accountOrRequestedSkipJig?: boolean,
) => false;

export const pickToothWorkAbutmentProductMode = (
  row: Partial<ToothWorkSelection> | null | undefined,
  customAbutment: boolean,
): Pick<ToothWorkSelection, "abutmentProductMode"> => {
  if (!customAbutment) return {};
  return {
    abutmentProductMode: resolveToothAbutmentProductMode({
      ...row,
      customAbutment: true,
    }),
  };
};

export type PracticeImplantFavorite = {
  id: string;
  manufacturer: string;
  brand: string;
  family: string;
  type: string;
  roundBar?: boolean;
  /** 「임플란트 추가 요청」옵션 */
  implantAddRequest?: boolean;
  adopted?: boolean;
  adoptedKind?: "cnc" | "round_bar" | "";
  /** 관리자 공개 — 도입 전이면 도입중 */
  isPublic?: boolean;
  roundBarRequestId?: string;
};

export type PracticeAbutmentFavorite = {
  id: string;
  manufacturer: string;
  diameter: string;
  height: string;
};

export const emptyToothWorkImplant = () => ({
  implantManufacturer: "",
  implantBrand: "",
  implantFamily: "",
  implantType: "",
  implantAddRequest: false,
});

export const emptyToothWorkAbutment = () => ({
  abutmentManufacturer: "",
  abutmentDiameter: "",
  abutmentHeight: "",
});

export const emptyToothWorkCustomSpecs = () => ({
  ...emptyToothWorkImplant(),
  ...emptyToothWorkAbutment(),
});

export const pickToothWorkImplant = (
  row: Partial<ToothWorkSelection> | null | undefined,
  customAbutment: boolean,
) => {
  if (!customAbutment) return emptyToothWorkImplant();
  const implantBrand = String(row?.implantBrand || "").trim();
  const implantType = String(row?.implantType || "").trim();
  const implantAddRequest =
    Boolean(row?.implantAddRequest) ||
    implantBrand === MANUFACTURER_ADD_REQUEST_BRAND ||
    implantType === IMPLANT_ADD_REQUEST_OPTION;
  return {
    implantManufacturer: String(row?.implantManufacturer || "").trim(),
    implantBrand,
    implantFamily: String(row?.implantFamily || "").trim(),
    implantType,
    implantAddRequest,
  };
};

export const pickToothWorkAbutment = (
  row: Partial<ToothWorkSelection> | null | undefined,
  customAbutment: boolean,
) => {
  if (!customAbutment) return emptyToothWorkAbutment();
  return {
    abutmentManufacturer: String(row?.abutmentManufacturer || "").trim(),
    abutmentDiameter: String(row?.abutmentDiameter || "").trim(),
    abutmentHeight: String(row?.abutmentHeight || "").trim(),
  };
};

export const pickToothWorkCustomSpecs = (
  row: Partial<ToothWorkSelection> | null | undefined,
  customAbutment: boolean,
) => {
  if (!customAbutment) return emptyToothWorkCustomSpecs();
  return {
    ...pickToothWorkImplant(row, true),
    ...pickToothWorkAbutment(row, true),
  };
};

export const customSpecsKey = (
  row: Partial<ToothWorkSelection> | null | undefined,
) => {
  const specs = pickToothWorkCustomSpecs(row, true);
  return [
    specs.implantManufacturer,
    specs.implantBrand,
    specs.implantFamily,
    specs.implantType,
    specs.abutmentManufacturer,
    specs.abutmentDiameter,
    specs.abutmentHeight,
  ]
    .map((v) => String(v || "").trim().toLowerCase())
    .join("|");
};

export const formatCustomSpecsSummary = (
  row: Partial<ToothWorkSelection> | null | undefined,
) => {
  const implantLabel = formatImplantSummary(row);
  const abutmentLabel = formatAbutmentSummary(row);
  return [implantLabel, abutmentLabel ? `어벗 ${abutmentLabel}` : ""]
    .filter(Boolean)
    .join(" · ");
};

export const formatImplantSummary = (
  row: Partial<ToothWorkSelection> | null | undefined,
) => {
  const manufacturer = String(row?.implantManufacturer || "").trim();
  const brand = String(row?.implantBrand || "").trim();
  // 임플란트 추가 요청(메모만) — brand/type 옵션 자리표시는 숨김
  if (
    Boolean(row?.implantAddRequest) ||
    brand === MANUFACTURER_ADD_REQUEST_BRAND ||
    String(row?.implantType || "").trim() === IMPLANT_ADD_REQUEST_OPTION
  ) {
    return manufacturer || IMPLANT_ADD_REQUEST_OPTION;
  }
  return [manufacturer, brand, row?.implantFamily, row?.implantType]
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .join(" / ");
};

/** 카드용 짧은 표시: 제조사 앞 3글자 / 패밀리 첫 글자 */
export const formatImplantCompact = (
  row: Partial<ToothWorkSelection> | null | undefined,
) => {
  const manufacturer = String(row?.implantManufacturer || "").trim();
  const family = String(row?.implantFamily || "").trim();
  const manufacturerShort = [...manufacturer].slice(0, 3).join("");
  const familyShort = [...family].slice(0, 1).join("");
  if (manufacturerShort && familyShort) return `${manufacturerShort} / ${familyShort}`;
  return manufacturerShort || familyShort || "";
};

export const formatAbutmentSummary = (
  row: Partial<ToothWorkSelection> | null | undefined,
) =>
  [
    String(row?.abutmentManufacturer || "").trim(),
    String(row?.abutmentDiameter || "").trim(),
    String(row?.abutmentHeight || "").trim(),
  ]
    .filter(Boolean)
    .join(" / ");

/** 카드용 짧은 표시: 직경×높이 (심플어벗은 종류 약칭 포함) */
export const formatAbutmentCompact = (
  row: Partial<ToothWorkSelection> | null | undefined,
) => {
  const manufacturer = String(row?.abutmentManufacturer || "").trim();
  const diameter = String(row?.abutmentDiameter || "").trim();
  const height = String(row?.abutmentHeight || "").trim();
  if (isSimpleAbutmentKind(manufacturer)) {
    const kindShort = manufacturer === "심플밀링" ? "밀링" : "심플";
    if (diameter && height) return `${kindShort} ${diameter}×${height}`;
    return [kindShort, diameter || height].filter(Boolean).join(" ");
  }
  if (diameter && height) return `${diameter}×${height}`;
  return diameter || height || "";
};
const serializeImplantSuffix = (row: ToothWorkSelection) => {
  const manufacturer = String(row.implantManufacturer || "").trim();
  const brand = String(row.implantBrand || "").trim();
  const family = String(row.implantFamily || "").trim();
  const type = String(row.implantType || "").trim();
  if (!manufacturer && !brand && !family && !type) return "";
  return `{${manufacturer}/${brand}/${family}/${type}}`;
};

const serializeAbutmentSuffix = (row: ToothWorkSelection) => {
  const manufacturer = String(row.abutmentManufacturer || "").trim();
  const diameter = String(row.abutmentDiameter || "").trim();
  const height = String(row.abutmentHeight || "").trim();
  if (!manufacturer && !diameter && !height) return "";
  return `[${manufacturer}/${diameter}/${height}]`;
};

const serializeCustomSpecsSuffix = (row: ToothWorkSelection) =>
  `${serializeImplantSuffix(row)}${serializeAbutmentSuffix(row)}`;

const serializeCustomAbutmentToken = (row: ToothWorkSelection) =>
  resolveToothAbutmentProductMode(row) === ABUTMENT_PRODUCT_MODE.DESIGN_AND_PRODUCTION
    ? `+${CUSTOM_ABUTMENT_DESIGN_TOKEN}`
    : `+${CUSTOM_ABUTMENT_TOKEN}`;

const stripPrefixedToken = (source: string, token: string) => {
  if (source.startsWith(`${token}+`)) {
    return { hit: true, without: source.slice(token.length + 1).trim() };
  }
  if (source.startsWith(token)) {
    return {
      hit: true,
      without: source.slice(token.length).trim().replace(/^\+/, "").trim(),
    };
  }
  const plusToken = `+${token}`;
  if (source.includes(plusToken)) {
    return { hit: true, without: source.replace(plusToken, "").trim() };
  }
  return { hit: false, without: source };
};

const stripCustomAbutmentToken = (source: string) => {
  const design = stripPrefixedToken(source, CUSTOM_ABUTMENT_DESIGN_TOKEN);
  if (design.hit) {
    return {
      customAbutment: true,
      abutmentProductMode: ABUTMENT_PRODUCT_MODE.DESIGN_AND_PRODUCTION,
      without: design.without,
    };
  }
  const production = stripPrefixedToken(source, CUSTOM_ABUTMENT_TOKEN);
  if (production.hit) {
    return {
      customAbutment: true,
      abutmentProductMode: ABUTMENT_PRODUCT_MODE.PRODUCTION,
      without: production.without,
    };
  }
  return {
    customAbutment: false,
    abutmentProductMode: ABUTMENT_PRODUCT_MODE.PRODUCTION,
    without: source,
  };
};

const parseCustomSpecsSuffix = (value: string) => {
  let source = String(value || "").trim();
  let abutmentManufacturer = "";
  let abutmentDiameter = "";
  let abutmentHeight = "";
  let implantManufacturer = "";
  let implantBrand = "";
  let implantFamily = "";
  let implantType = "";

  const abutMatch = source.match(/\[([^\]]*)\]\s*$/);
  if (abutMatch) {
    const parts = String(abutMatch[1] || "").split("/");
    abutmentManufacturer = String(parts[0] || "").trim();
    abutmentDiameter = String(parts[1] || "").trim();
    abutmentHeight = parts.slice(2).join("/").trim();
    source = source.replace(/\[[^\]]*\]\s*$/, "").trim();
  }

  const implantMatch = source.match(/\{([^}]*)\}\s*$/);
  if (implantMatch) {
    const parts = String(implantMatch[1] || "").split("/");
    implantManufacturer = String(parts[0] || "").trim();
    implantBrand = String(parts[1] || "").trim();
    implantFamily = String(parts[2] || "").trim();
    implantType = parts.slice(3).join("/").trim();
    source = source.replace(/\{[^}]*\}\s*$/, "").trim();
  }

  return {
    without: source,
    implantManufacturer,
    implantBrand,
    implantFamily,
    implantType,
    abutmentManufacturer,
    abutmentDiameter,
    abutmentHeight,
  };
};

export const normalizeImplantFavorites = (items: unknown): PracticeImplantFavorite[] => {
  if (!Array.isArray(items)) return [];
  const out: PracticeImplantFavorite[] = [];
  const seen = new Map<string, number>();
  for (const raw of items) {
    const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const manufacturer = String(row.manufacturer || "").trim();
    const brand = String(row.brand || "").trim();
    const family = String(row.family || "").trim();
    const type = String(row.type || "").trim();
    if (!manufacturer && !brand && !family && !type) continue;
    const id = String(row.id || "").trim() || `imp-${out.length + 1}-${`${manufacturer}|${brand}|${family}|${type}`.toLowerCase().slice(0, 24)}`;
    const roundBarRequestId = String(row.roundBarRequestId || "").trim();
    const roundBar = Boolean(row.roundBar) || Boolean(roundBarRequestId);
    const implantAddRequest = isImplantAddRequest({
      implantAddRequest: Boolean(row.implantAddRequest),
      brand,
      type,
    });
    /** 추가요청은 type을 옵션명으로 통일(레거시 헥스(사이즈 미정) 포함) */
    const normalizedType = implantAddRequest
      ? IMPLANT_ADD_REQUEST_OPTION
      : type;
    const key = `${manufacturer}|${brand}|${family}|${normalizedType}`.toLowerCase();
    const nextRow: PracticeImplantFavorite = {
      id,
      manufacturer,
      brand,
      family,
      type: normalizedType,
      ...(roundBar || implantAddRequest || Boolean(row.isPublic)
        ? {
            roundBar: true,
            implantAddRequest: implantAddRequest || undefined,
            adopted: Boolean(row.adopted),
            adoptedKind:
              String(row.adoptedKind || "").trim() === "round_bar"
                ? "round_bar"
                : String(row.adoptedKind || "").trim() === "cnc"
                  ? "cnc"
                  : "",
            isPublic: Boolean(row.isPublic) || undefined,
            roundBarRequestId,
          }
        : {}),
    };
    if (seen.has(key)) {
      const idx = seen.get(key);
      if (idx != null && !out[idx]?.roundBar && roundBar) out[idx] = nextRow;
      continue;
    }
    seen.set(key, out.length);
    out.push(nextRow);
    if (out.length >= 40) break;
  }
  return expandImplantFavoriteList(out);
};

export const normalizeAbutmentFavorites = (items: unknown): PracticeAbutmentFavorite[] => {
  if (!Array.isArray(items)) return [];
  const out: PracticeAbutmentFavorite[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const manufacturer = String(row.manufacturer || "").trim();
    const diameter = String(row.diameter || "").trim();
    const height = String(row.height || "").trim();
    if (!manufacturer && !diameter && !height) continue;
    const key = `${manufacturer}|${diameter}|${height}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const id = String(row.id || "").trim() || `abt-${out.length + 1}-${key.slice(0, 24)}`;
    out.push({ id, manufacturer, diameter, height });
    if (out.length >= 40) break;
  }
  return out;
};

export type ParsedPracticeTransferMemoMeta = {
  orderDate: string;
  arrivalDate: string;
  arrivalDefaultDays: number;
  prosthesisTypes: string[];
  toothWorks: ToothWorkSelection[];
  patientName: string;
  memo: string;
  /** 의뢰건별 「디자인 컨펌 생략」. 계정 세팅이 아님 */
  skipDesignConfirm: boolean;
  /** @deprecated 2026-08-22 skipJig 옵션 삭제. 레거시 메모/스냅샷 파싱용 */
  skipJig: boolean;
};

export const DEFAULT_PRACTICE_ARRIVAL_OFFSET_DAYS = 7;

/** 브리지 스팬에서 작업하지 않는 칸. 표시·저장 SSOT */
export const NO_WORK_PROSTHESIS_TYPE = "결손치";
export const NO_WORK_PROSTHESIS_TOOLTIP =
  "결손치로 표시하며, 작업·크레딧 소비가 없습니다.";

export const isMissingToothProsthesisType = (prosthesisType: string) => {
  const raw = String(prosthesisType || "").trim();
  const compact = raw.replace(/\s+/g, "");
  return (
    raw === NO_WORK_PROSTHESIS_TYPE ||
    raw === "작업X" ||
    raw === "상실치" ||
    compact.toLowerCase() === "작업x" ||
    compact === "결손치" ||
    /^missing(?:tooth)?$/i.test(compact)
  );
};

export const CUSTOM_ABUTMENT_PROSTHESIS_TYPE = "커스텀어벗";

export const isRetainerProsthesisType = (prosthesisType: string) => {
  const raw = String(prosthesisType || "").trim();
  const compact = raw.replace(/\s+/g, "");
  return compact === "유지장치" || /^retainer$/i.test(raw);
};

export const isTemporaryToothProsthesisType = (prosthesisType: string) => {
  const raw = String(prosthesisType || "").trim();
  const compact = raw.replace(/\s+/g, "");
  return compact === "임시치아" || compact === "가철성임시치아";
};

export const isCustomAbutmentProsthesisType = (prosthesisType: string) => {
  const raw = String(prosthesisType || "").trim();
  const compact = raw.replace(/\s+/g, "");
  return (
    compact === CUSTOM_ABUTMENT_PROSTHESIS_TYPE ||
    /^(?:커스텀)?어벗디자인$/i.test(compact) ||
    /^custom\s*abut(?:ment)?$/i.test(raw)
  );
};

export const toCanonicalProsthesisType = (prosthesisType: string) => {
  if (/^pontic$/i.test(String(prosthesisType || "").trim())) return "브리지";
  if (isMissingToothProsthesisType(prosthesisType)) return NO_WORK_PROSTHESIS_TYPE;
  if (isCustomAbutmentProsthesisType(prosthesisType)) {
    return CUSTOM_ABUTMENT_PROSTHESIS_TYPE;
  }
  if (isTemporaryToothProsthesisType(prosthesisType)) return "임시치아";
  if (isRetainerProsthesisType(prosthesisType)) return "유지장치";
  return String(prosthesisType || "").trim();
};

export const normalizeArrivalDefaultDays = (value: number) =>
  Math.max(0, Math.floor(Number(value || 0)));

export const normalizeProsthesisTypes = (items: string[]) => {
  const canonical = items
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .map((item) => {
      const lowered = item.toLowerCase();
      if (lowered === "pontic") return null;
      if (lowered === "브릿지") return "브리지";
      if (
        lowered === "작업x" ||
        lowered === "결손치" ||
        lowered === "상실치" ||
        lowered === "missing" ||
        lowered === "missing tooth"
      ) {
        return NO_WORK_PROSTHESIS_TYPE;
      }
      const compact = item.replace(/\s+/g, "");
      if (
        compact === CUSTOM_ABUTMENT_PROSTHESIS_TYPE ||
        /^(?:커스텀)?어벗디자인$/i.test(compact)
      ) {
        return CUSTOM_ABUTMENT_PROSTHESIS_TYPE;
      }
      if (/^missing(?:tooth)?$/i.test(compact)) return NO_WORK_PROSTHESIS_TYPE;
      if (compact === "가철성임시치아" || compact === "임시치아") return "임시치아";
      if (compact === "유지장치" || /^retainer$/i.test(item)) return "유지장치";
      return item;
    })
    .filter((item): item is string => Boolean(item));

  const deduped = Array.from(new Set(canonical));
  if (!deduped.some((item) => isMissingToothProsthesisType(item))) {
    deduped.push(NO_WORK_PROSTHESIS_TYPE);
  }
  return deduped;
};

export const isBridgeLikeProsthesisType = (prosthesisType: string) =>
  prosthesisType === "브리지" ||
  isRetainerProsthesisType(prosthesisType) ||
  isMissingToothProsthesisType(prosthesisType);

/** 연결(+)을 유지할 수 있는 형태. 브리지 계열은 2치 이상 필수, 임시치아는 1치부터 가능 */
export const isLinkableProsthesisType = (prosthesisType: string) =>
  isBridgeLikeProsthesisType(prosthesisType) ||
  isTemporaryToothProsthesisType(prosthesisType);

export const isAbutmentDesignProsthesisType = (prosthesisType: string) =>
  isCustomAbutmentProsthesisType(prosthesisType);

export const isCustomAbutmentSupportedProsthesisType = (prosthesisType: string) =>
  isCustomAbutmentProsthesisType(prosthesisType) ||
  prosthesisType === "크라운" ||
  prosthesisType === "브리지" ||
  isTemporaryToothProsthesisType(prosthesisType);

export const hasToothWorkImplantPreset = (
  row: Partial<ToothWorkSelection> | null | undefined,
) => {
  const specs = pickToothWorkImplant(row, true);
  return Boolean(
    specs.implantManufacturer &&
      specs.implantBrand &&
      specs.implantFamily &&
      specs.implantType,
  );
};

export const hasToothWorkScanbodyPreset = (
  row: Partial<ToothWorkSelection> | null | undefined,
) => {
  const specs = pickToothWorkAbutment(row, true);
  if (isSimpleAbutmentKind(specs.abutmentManufacturer)) return false;
  return Boolean(
    specs.abutmentManufacturer &&
      specs.abutmentDiameter &&
      specs.abutmentHeight,
  );
};

/** 심플어벗 종류·직경·높이가 모두 선택된 경우 */
export const hasToothWorkSimpleAbutment = (
  row: Partial<ToothWorkSelection> | null | undefined,
) => {
  const specs = pickToothWorkAbutment(row, true);
  return (
    isSimpleAbutmentKind(specs.abutmentManufacturer) &&
    isSimpleAbutmentDiameter(specs.abutmentDiameter) &&
    isSimpleAbutmentHeight(specs.abutmentHeight)
  );
};

/**
 * 어벗 쪽 완성: 스캔바디 프리셋 또는 심플어벗 규격.
 * 커스텀어벗 보철 형태는 스캔바디만 허용(심플어벗=치과 재고는 크라운·브리지·임시치아+어벗만).
 */
export const hasToothWorkAbutmentSidePreset = (
  row: Partial<ToothWorkSelection> | null | undefined,
) => {
  if (isCustomAbutmentProsthesisType(String(row?.prosthesisType || ""))) {
    return hasToothWorkScanbodyPreset(row);
  }
  return hasToothWorkScanbodyPreset(row) || hasToothWorkSimpleAbutment(row);
};

/** 어벗(커스텀어벗 형태 또는 크라운·브리지·임시치아 체크)에 임플란트·(스캔바디|심플어벗)이 모두 있는지 */
export const hasCompleteAbutmentPresets = (
  row: Partial<ToothWorkSelection> | null | undefined,
) => hasToothWorkImplantPreset(row) && hasToothWorkAbutmentSidePreset(row);

/** 커스텀어벗 보철 형태에 걸린 심플어벗 규격을 비운다 */
export const clearSimpleAbutmentIfCustomProsthesis = <
  T extends Partial<ToothWorkSelection>,
>(
  row: T,
): T => {
  if (!isCustomAbutmentProsthesisType(String(row?.prosthesisType || ""))) {
    return row;
  }
  if (!isSimpleAbutmentKind(row?.abutmentManufacturer)) return row;
  return {
    ...row,
    ...emptyToothWorkAbutment(),
  };
};

export const isAbutmentPresetRequired = (
  row: Partial<ToothWorkSelection> | null | undefined,
) => {
  const type = String(row?.prosthesisType || "");
  if (isCustomAbutmentProsthesisType(type)) return true;
  return (
    Boolean(row?.customAbutment) && isCustomAbutmentSupportedProsthesisType(type)
  );
};

export const isAbutmentPresetMissing = (
  row: Partial<ToothWorkSelection> | null | undefined,
) => isAbutmentPresetRequired(row) && !hasCompleteAbutmentPresets(row);

export const listMissingAbutmentPresetTeeth = (
  rows: readonly Partial<ToothWorkSelection>[] | null | undefined,
) =>
  (Array.isArray(rows) ? rows : [])
    .filter(
      (row) =>
        isAbutmentPresetMissing(row) &&
        /^[1-4][1-8]$/.test(String(row?.toothNumber || "").trim()),
    )
    .map((row) => String(row.toothNumber || "").trim());

const isFdiToothNumber = (value: unknown) =>
  /^[1-4][1-8]$/.test(String(value || "").trim());

/**
 * 기공의뢰 제출 `caseInfos.tooth`.
 * - SSOT는 toothWorks(수동 치식). STL/구강스캔 파일명 추출 금지.
 * - 치식이 하나면 파일 메타에도 넣는다(제조사·스캔 매칭).
 * - 다치아는 파일↔치아 1:1이 아니면 빈 값(제조사 Request는 toothWorks 행별 생성).
 */
export const resolvePracticeCaseToothFromToothWorks = (
  toothWorks: readonly Partial<ToothWorkSelection>[] | null | undefined,
  options?: { fileIndex?: number; fileCount?: number },
): string => {
  const rows = Array.isArray(toothWorks) ? toothWorks : [];
  const caTeeth = rows
    .filter((row) => Boolean(row?.customAbutment))
    .map((row) => String(row?.toothNumber || "").trim())
    .filter(isFdiToothNumber);
  const allTeeth = rows
    .map((row) => String(row?.toothNumber || "").trim())
    .filter(isFdiToothNumber);
  const teeth = caTeeth.length > 0 ? caTeeth : allTeeth;
  if (teeth.length === 0) return "";
  if (teeth.length === 1) return teeth[0];

  const fileCount = Math.max(0, Math.floor(Number(options?.fileCount) || 0));
  const fileIndex = Math.floor(Number(options?.fileIndex) || 0);
  if (
    fileCount > 0 &&
    fileCount === teeth.length &&
    fileIndex >= 0 &&
    fileIndex < teeth.length
  ) {
    return teeth[fileIndex];
  }
  return "";
};

export const getAdjacentTeeth = (toothNumber: string) => {
  const raw = String(toothNumber || "").trim();
  if (!/^[1-4][1-8]$/.test(raw)) return [] as string[];
  const tens = Number(raw[0]);
  const ones = Number(raw[1]);
  const out: string[] = [];

  if (ones > 1) out.push(`${tens}${ones - 1}`);
  if (ones < 8) out.push(`${tens}${ones + 1}`);

  if (ones === 1) {
    if (tens === 1) out.push("21");
    if (tens === 2) out.push("11");
    if (tens === 3) out.push("41");
    if (tens === 4) out.push("31");
  }

  return Array.from(new Set(out));
};

export const toToothMemoSortNumber = (toothNumber: string) => {
  const raw = String(toothNumber || "").trim();
  if (!/^[1-4][1-8]$/.test(raw)) return Number.MAX_SAFE_INTEGER;
  const tens = Number(raw[0]);
  const ones = Number(raw[1]);

  if (tens === 1) return 9 - ones; // 18..11
  if (tens === 2) return 8 + ones; // 21..28
  if (tens === 4) return 16 + (9 - ones); // 48..41
  if (tens === 3) return 24 + ones; // 31..38

  return Number.MAX_SAFE_INTEGER;
};

export const normalizeToothWorks = (items: ToothWorkSelection[]) =>
  items
    .map((row) => {
      const toothNumber = String(row?.toothNumber || "").trim();
      const prosthesisType = toCanonicalProsthesisType(
        String(row?.prosthesisType || "").trim(),
      );
      // 인레이·작업X 등 어벗 비지원 형태를 거쳐도 체크·규격을 잃지 않는다.
      const customAbutment = isCustomAbutmentProsthesisType(prosthesisType)
        ? true
        : Boolean(row?.customAbutment);
      const adjacent = getAdjacentTeeth(toothNumber);
      const bridgeLinkedTeeth =
        isLinkableProsthesisType(prosthesisType) && Array.isArray(row?.bridgeLinkedTeeth)
          ? row.bridgeLinkedTeeth
              .map((v) => String(v || "").trim())
              .filter((v) => adjacent.includes(v))
          : [];

      return {
        toothNumber,
        prosthesisType,
        customAbutment,
        ...pickToothWorkAbutmentProductMode(row, customAbutment),
        bridgeLinkedTeeth,
        ...clearSimpleAbutmentIfCustomProsthesis({
          prosthesisType,
          ...pickToothWorkCustomSpecs(row, customAbutment),
        }),
      };
    })
    .filter((row) => /^[1-4][1-8]$/.test(row.toothNumber) && row.prosthesisType);

/** 공동 작성 동기화용: 치아번호 미입력 행도 유지(전송 검증용 normalizeToothWorks와 분리) */
export const EMPTY_TOOTH_SYNC_TOKEN = "-";

export const normalizeToothWorksForSync = (items: ToothWorkSelection[]) =>
  items
    .map((row) => {
      const rawTooth = String(row?.toothNumber || "").trim();
      const toothNumber =
        !rawTooth || rawTooth === EMPTY_TOOTH_SYNC_TOKEN
          ? ""
          : rawTooth;
      // 형태 미선택이어도 치아번호는 동료에게 전달. 직렬화 시 기본 형태로 채운다.
      const prosthesisType = toCanonicalProsthesisType(
        String(row?.prosthesisType || "").trim() || (toothNumber ? "크라운" : ""),
      );
      // 인레이·작업X를 거쳐도 커스텀 규격을 잃지 않는다(전송 normalize와 분리).
      const customAbutment = isCustomAbutmentProsthesisType(prosthesisType)
        ? true
        : Boolean(row?.customAbutment);
      const adjacent = getAdjacentTeeth(toothNumber);
      const bridgeLinkedTeeth =
        isLinkableProsthesisType(prosthesisType) && Array.isArray(row?.bridgeLinkedTeeth)
          ? row.bridgeLinkedTeeth
              .map((v) => String(v || "").trim())
              .filter((v) => adjacent.includes(v))
          : [];

      return {
        toothNumber,
        prosthesisType,
        customAbutment,
        ...pickToothWorkAbutmentProductMode(row, customAbutment),
        bridgeLinkedTeeth,
        ...clearSimpleAbutmentIfCustomProsthesis({
          prosthesisType,
          ...pickToothWorkCustomSpecs(row, customAbutment),
        }),
      };
    })
    .filter((row) => Boolean(row.prosthesisType) || Boolean(row.toothNumber));

export const parseToothWorks = (value: string) =>
  String(value || "")
    .split("|")
    .map((chunk) => String(chunk || "").trim())
    .filter(Boolean)
    .map((chunk) => {
      const [toothRaw, ...rest] = chunk.split("=");
      const rawTooth = String(toothRaw || "").trim();
      const toothNumber =
        !rawTooth || rawTooth === EMPTY_TOOTH_SYNC_TOKEN ? "" : rawTooth;
      const rhs = String(rest.join("=") || "").trim();
      if (!rhs) {
        return {
          toothNumber,
          prosthesisType: toothNumber ? "크라운" : "",
          customAbutment: false,
          bridgeLinkedTeeth: [] as string[],
          ...emptyToothWorkCustomSpecs(),
        };
      }

      const linkedMatch = rhs.match(/\(([^)]+)\)\s*$/);
      const linkedRaw = linkedMatch ? linkedMatch[1] : "";
      let withoutLinked = linkedMatch ? rhs.replace(/\(([^)]+)\)\s*$/, "").trim() : rhs;
      const specsParsed = parseCustomSpecsSuffix(withoutLinked);
      withoutLinked = specsParsed.without;

      const stripped = stripCustomAbutmentToken(withoutLinked);
      withoutLinked = stripped.without;
      let customAbutment = stripped.customAbutment;
      let abutmentProductMode = stripped.abutmentProductMode;
      if (
        specsParsed.implantManufacturer ||
        specsParsed.implantBrand ||
        specsParsed.implantFamily ||
        specsParsed.implantType ||
        specsParsed.abutmentManufacturer ||
        specsParsed.abutmentDiameter ||
        specsParsed.abutmentHeight
      ) {
        customAbutment = true;
      }

      const prosthesisType = toCanonicalProsthesisType(
        withoutLinked ||
          (customAbutment ? CUSTOM_ABUTMENT_PROSTHESIS_TYPE : toothNumber ? "크라운" : ""),
      );
      const bridgeLinkedTeeth = linkedRaw
        ? linkedRaw
            .split("-")
            .map((v) => String(v || "").trim())
            .filter((v) => v && v !== toothNumber && v !== EMPTY_TOOTH_SYNC_TOKEN)
        : [];

      return {
        toothNumber,
        prosthesisType,
        customAbutment,
        ...pickToothWorkAbutmentProductMode(
          { abutmentProductMode },
          customAbutment,
        ),
        bridgeLinkedTeeth,
        ...pickToothWorkCustomSpecs(specsParsed, customAbutment),
      };
    })
    .filter((row) => Boolean(row.prosthesisType) || Boolean(row.toothNumber));

export const serializeToothWorks = (rows: ToothWorkSelection[]) =>
  normalizeToothWorks(rows)
    .slice()
    .sort((a, b) => toToothMemoSortNumber(a.toothNumber) - toToothMemoSortNumber(b.toothNumber))
    .map((row) => {
      const orderedLinks = [...row.bridgeLinkedTeeth].sort(
        (a, b) => toToothMemoSortNumber(a) - toToothMemoSortNumber(b),
      );
      const linked =
        isLinkableProsthesisType(row.prosthesisType) && orderedLinks.length > 0
          ? `(${[row.toothNumber, ...orderedLinks].join("-")})`
          : "";
      const custom =
        isCustomAbutmentSupportedProsthesisType(row.prosthesisType) && row.customAbutment
          ? `${serializeCustomAbutmentToken(row)}${serializeCustomSpecsSuffix(row)}`
          : "";
      return `${row.toothNumber}=${row.prosthesisType}${custom}${linked}`;
    })
    .join(" | ");

/** 공동 작성용: 치아번호 빈 행도 `-` 토큰으로 직렬화해 동료 화면에 행 수를 맞춘다. */
export const serializeToothWorksForSync = (rows: ToothWorkSelection[]) =>
  normalizeToothWorksForSync(rows)
    .map((row) => {
      const toothToken = row.toothNumber || EMPTY_TOOTH_SYNC_TOKEN;
      const prosthesisType = row.prosthesisType || "크라운";
      const orderedLinks = [...row.bridgeLinkedTeeth].sort(
        (a, b) => toToothMemoSortNumber(a) - toToothMemoSortNumber(b),
      );
      const linked =
        row.toothNumber &&
        isLinkableProsthesisType(prosthesisType) &&
        orderedLinks.length > 0
          ? `(${[row.toothNumber, ...orderedLinks].join("-")})`
          : "";
      const custom =
        (isCustomAbutmentProsthesisType(prosthesisType) || row.customAbutment)
          ? `${serializeCustomAbutmentToken(row)}${serializeCustomSpecsSuffix(row)}`
          : "";
      return `${toothToken}=${prosthesisType}${custom}${linked}`;
    })
    .join(" | ");

export const formatToothWorksForDisplay = (
  rows: ToothWorkSelection[],
  options?: {
    multiline?: boolean;
    /** 기공소 수신: 도입·CNC 커스텀어벗 → 어벗츠 지급. 요청중은 기공소 커스텀어벗 */
    labFacing?: boolean;
  },
) => {
  const normalizedRows = normalizeToothWorks(rows)
    .slice()
    .sort((a, b) => toToothMemoSortNumber(a.toothNumber) - toToothMemoSortNumber(b.toothNumber));
  if (!normalizedRows.length) return "";

  const formattedRows = normalizedRows.map((row) => {
    const pendingLabAbutment = isPendingRoundBarAbutment(row);
    const customAbutmentLabel =
      options?.labFacing && !pendingLabAbutment ? "어벗츠 지급" : "커스텀어벗";
    const prosthesisLabel = options?.labFacing
      ? String(row.prosthesisType || "").replace(/커스텀어벗/g, customAbutmentLabel)
      : row.prosthesisType;
    const details = [prosthesisLabel];
    if (row.customAbutment) {
      const modeLabel =
        ABUTMENT_PRODUCT_MODE_SHORT_LABEL[resolveToothAbutmentProductMode(row)];
      if (!isCustomAbutmentProsthesisType(row.prosthesisType)) {
        details.push(
          options?.labFacing
            ? customAbutmentLabel
            : `${customAbutmentLabel} ${modeLabel}`,
        );
      } else if (!options?.labFacing) {
        details.push(modeLabel);
      }
      const specsSummary = formatCustomSpecsSummary(row);
      if (specsSummary) details.push(specsSummary);
    }
    if (isLinkableProsthesisType(row.prosthesisType) && row.bridgeLinkedTeeth.length > 0) {
      const orderedLinks = [...row.bridgeLinkedTeeth].sort(
        (a, b) => toToothMemoSortNumber(a) - toToothMemoSortNumber(b),
      );
      details.push(`연결 ${[row.toothNumber, ...orderedLinks].join("-")}`);
    }
    return `${row.toothNumber}번: ${details.join(" · ")}`;
  });

  return options?.multiline ? formattedRows.join("\n") : formattedRows.join(" / ");
};

/** 의뢰 목록 카드용 — 치아번호만 (예: 11,21). 보철 형태는 상세 모달. */
export const formatToothNumbersForCard = (
  rows:
    | Array<{ toothNumber?: string | null } | string | null | undefined>
    | null
    | undefined,
): string => {
  const numbers = [
    ...new Set(
      (rows || []).flatMap((row) => {
        const raw =
          typeof row === "string"
            ? String(row || "").trim()
            : String(row?.toothNumber || "").trim();
        if (!raw) return [];
        // "11,21"·공백 구분도 FDI 단위로 쪼갠다(캘린더 caseInfos.tooth 합침값 포함).
        return raw
          .split(/[,/\s]+/)
          .map((part) => String(part || "").trim())
          .filter((n) => /^[1-4][1-8]$/.test(n));
      }),
    ),
  ].sort((a, b) => toToothMemoSortNumber(a) - toToothMemoSortNumber(b));
  return numbers.join(",");
};

const parseLegacyToothWorksSummary = (value: string): ToothWorkSelection[] => {
  const serialized = String(value || "")
    .split(/\s*[,|]\s*/)
    .map((chunk) => String(chunk || "").trim())
    .filter(Boolean)
    .map((chunk) => {
      const match = chunk.match(/^([1-4][1-8])\s*[:=]\s*(.+)$/);
      if (!match) return "";
      return `${match[1]}=${String(match[2] || "").trim()}`;
    })
    .filter(Boolean)
    .join(" | ");

  if (!serialized) return [];
  return parseToothWorks(serialized);
};

export const formatTransferMemoForDisplay = (rawMemo: string) => {
  const memo = String(rawMemo || "").trim();
  if (!memo) return "";

  if (memo.includes("\n")) return memo;

  const compactParts = memo
    .split(/\s*·\s*(?=(?:주문일|치과도착일|도착일|치아별|형태|보철물\s*형태)\b)/)
    .map((part) => String(part || "").trim())
    .filter(Boolean);

  if (compactParts.length <= 1) return memo;

  const sections: string[] = [];
  for (const part of compactParts) {
    const toothPart = part.match(/^치아별\s*(.+)$/);
    if (toothPart) {
      const parsed = parseLegacyToothWorksSummary(toothPart[1]);
      const toothText = formatToothWorksForDisplay(parsed, { multiline: true }) || toothPart[1];
      sections.push(`치아보철\n${toothText}`);
      continue;
    }

    const prosthesisPart = part.match(/^(?:형태|보철물\s*형태)\s*(.+)$/);
    if (prosthesisPart) {
      sections.push(`보철물 형태\n${prosthesisPart[1]}`);
      continue;
    }

    sections.push(part);
  }

  return sections.join("\n\n").trim();
};

export const parsePracticeTransferMemoMeta = (rawMemo: string): ParsedPracticeTransferMemoMeta => {
  const source = String(rawMemo || "").trim();
  const lines = source.split(/\r?\n/);
  const memoLines: string[] = [];
  let orderDate = "";
  let arrivalDate = "";
  let arrivalDefaultDays = DEFAULT_PRACTICE_ARRIVAL_OFFSET_DAYS;
  let prosthesisTypes: string[] = [];
  let toothWorks: ToothWorkSelection[] = [];
  let patientName = "";
  let skipDesignConfirm = true;
  let skipJig = true;

  for (const line of lines) {
    const trimmed = String(line || "").trim();
    if (!trimmed) {
      memoLines.push("");
      continue;
    }

    const orderMatch = trimmed.match(/^\[\s*주문일\s*:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\s*\]$/);
    if (orderMatch) {
      orderDate = orderMatch[1];
      continue;
    }

    const arrivalMatch = trimmed.match(
      /^\[\s*(?:치과도착일|도착일)\s*:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\s*\]$/,
    );
    if (arrivalMatch) {
      arrivalDate = arrivalMatch[1];
      continue;
    }

    const defaultDaysMatch = trimmed.match(/^\[\s*도착기본일수\s*:\s*(\d{1,3})\s*\]$/);
    if (defaultDaysMatch) {
      arrivalDefaultDays = normalizeArrivalDefaultDays(Number(defaultDaysMatch[1]));
      continue;
    }

    const patientNameMatch = trimmed.match(/^\[\s*환자명\s*:\s*(.*)\]$/);
    if (patientNameMatch) {
      patientName = String(patientNameMatch[1] || "").trim();
      continue;
    }

    const prosthesisCatalogMatch = trimmed.match(/^\[\s*보철물형태목록\s*:\s*(.+)\]$/);
    if (prosthesisCatalogMatch) {
      prosthesisTypes = String(prosthesisCatalogMatch[1] || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      continue;
    }

    const legacyProsthesisMatch = trimmed.match(/^\[\s*보철물형태\s*:\s*(.+)\]$/);
    if (legacyProsthesisMatch) {
      prosthesisTypes = String(legacyProsthesisMatch[1] || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      continue;
    }

    const toothWorksMatch = trimmed.match(/^\[\s*치아보철\s*:\s*(.+)\]$/);
    if (toothWorksMatch) {
      toothWorks = parseToothWorks(String(toothWorksMatch[1] || ""));
      continue;
    }

    const skipDesignConfirmMatch = trimmed.match(/^\[\s*디자인컨펌생략\s*:\s*(.+)\]$/);
    if (skipDesignConfirmMatch) {
      const flag = String(skipDesignConfirmMatch[1] || "").trim().toLowerCase();
      skipDesignConfirm =
        flag === "y" ||
        flag === "yes" ||
        flag === "true" ||
        flag === "1" ||
        flag === "생략" ||
        flag === "예";
      continue;
    }

    const skipJigMatch = trimmed.match(/^\[\s*지그제작생략\s*:\s*(.+)\]$/);
    if (skipJigMatch) {
      const flag = String(skipJigMatch[1] || "").trim().toLowerCase();
      skipJig = !(
        flag === "n" ||
        flag === "no" ||
        flag === "0" ||
        flag === "false" ||
        flag === "필요" ||
        flag === "미생략"
      );
      continue;
    }

    memoLines.push(line);
  }

  return {
    orderDate,
    arrivalDate,
    arrivalDefaultDays,
    prosthesisTypes: normalizeProsthesisTypes(prosthesisTypes),
    toothWorks: normalizeToothWorksForSync(toothWorks),
    patientName,
    memo: memoLines.join("\n").replace(/^\s+|\s+$/g, ""),
    skipDesignConfirm,
    skipJig,
  };
};

export const buildPracticeTransferMemo = (params: {
  memo: string;
  orderDate: string;
  arrivalDate: string;
  arrivalDefaultDays: number;
  prosthesisTypes: string[];
  toothWorks: ToothWorkSelection[];
  patientName?: string;
  skipDesignConfirm?: boolean;
  skipJig?: boolean;
}) => {
  const lines = [
    `[주문일: ${String(params.orderDate || "").trim()}]`,
    `[치과도착일: ${String(params.arrivalDate || "").trim()}]`,
    `[도착기본일수: ${normalizeArrivalDefaultDays(params.arrivalDefaultDays)}]`,
    `[환자명: ${String(params.patientName || "").trim()}]`,
    `[보철물형태목록: ${normalizeProsthesisTypes(params.prosthesisTypes).join(", ")}]`,
    `[치아보철: ${serializeToothWorksForSync(params.toothWorks)}]`,
    `[디자인컨펌생략: ${params.skipDesignConfirm !== false ? "Y" : "N"}]`,
    // 레거시(2026-08-22): [지그제작생략] 메모 태그 기록 중단. 파싱만 유지.
  ];
  const memo = String(params.memo || "").trim();
  return memo ? `${lines.join("\n")}\n${memo}` : lines.join("\n");
};

export const formatPracticeTransferMemoDetail = (
  rawMemo: string,
  options?: {
    includeDateSummary?: boolean;
    includeToothWorks?: boolean;
    includePatientName?: boolean;
  },
) => {
  const source = String(rawMemo || "").trim();
  if (!source) return "";

  const hasKnownMeta =
    /\[\s*(주문일|치과도착일|도착일|도착기본일수|환자명|보철물형태목록|보철물형태|치아보철|디자인컨펌생략|지그제작생략)\s*:/i.test(
      source,
    );
  if (!hasKnownMeta) return formatTransferMemoForDisplay(source);

  const parsed = parsePracticeTransferMemoMeta(source);
  const summarySections: string[] = [];
  const includeDateSummary = options?.includeDateSummary !== false;
  const includeToothWorks = options?.includeToothWorks !== false;
  const includePatientName = options?.includePatientName !== false;

  if (includeDateSummary) {
    const dateSummaryParts: string[] = [];
    if (parsed.orderDate) dateSummaryParts.push(`주문일 ${parsed.orderDate}`);
    if (parsed.arrivalDate) dateSummaryParts.push(`치과도착일 ${parsed.arrivalDate}`);
    if (dateSummaryParts.length > 0) {
      summarySections.push(dateSummaryParts.join(" · "));
    }
  }

  if (includePatientName && parsed.patientName) {
    summarySections.push(`환자명 ${parsed.patientName}`);
  }

  if (includeToothWorks) {
    const toothSummary = formatToothWorksForDisplay(parsed.toothWorks, { multiline: true });
    if (toothSummary) {
      summarySections.push(`치아보철\n${toothSummary}`);
    } else if (parsed.prosthesisTypes.length > 0) {
      summarySections.push(`보철물 형태\n${parsed.prosthesisTypes.join(", ")}`);
    }
  }

  const freeMemo = String(parsed.memo || "").trim();
  if (freeMemo) summarySections.push(freeMemo);

  return formatTransferMemoForDisplay(summarySections.join("\n\n").trim());
};

export const stripPracticeTransferMessageEnvelope = (message: string) => {
  const raw = String(message || "").trim();
  if (!raw) return "";

  return raw
    .split(/\r?\n/)
    .map((line) =>
      String(line || "")
        .replace(/\[\s*기공소\s*:[^\]]*\]/gi, "")
        .replace(/\[\s*전송ID\s*:[^\]]*\]/gi, "")
        .trim(),
    )
    .filter(Boolean)
    .join("\n")
    .trim();
};

export const extractTransferMemoFromMessage = (
  message: string,
  options?: { includeDateSummary?: boolean },
) => {
  const stripped = stripPracticeTransferMessageEnvelope(message);
  return formatPracticeTransferMemoDetail(stripped, options);
};

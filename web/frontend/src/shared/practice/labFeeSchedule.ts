// related files:
// - web/backend/utils/labFeeSchedule.js
// - web/frontend/src/shared/pricing/abutsAbutmentService.ts
// - web/frontend/src/shared/practice/practiceTransferFeeQuote.ts
// - web/frontend/src/shared/practice/roundBarAbutment.ts
// - web/frontend/src/shared/components/practice/PracticeTransferFeeEstimate.tsx
// - web/frontend/src/features/settings/tabs/LabFeeScheduleTab.tsx
// - web/backend/tests/unit/labFeeSchedule.test.js
// - 2026-08-26: 미도입(요청중·도입중)도 기공소 커스텀어벗 수가를 합산(0원이면 미도입·수락 시 기공수가 포워드).
// - 2026-08-25: 단독「커스텀어벗」은 심플이어도 지그제외 수가 대상. 크라운+심플만 수가 제외.
// - 2026-08-25: 심플어벗(치과 재고)은 기공소 어벗 수가·견적에서 제외. 스캔바디 커스텀어벗만 과금.
// - 2026-08-22: 치과 멤버십/일반 청구 이중가 제거. resolveAbutsAbutmentUnitPrice는 고시 단일가.
// - 2026-08-13: 마스터 active(기본 off)가 켜져야 설정 완료. 수가 디폴트는 기본값·항목 on.
// - 2026-08-19: 수락 포워드용 missingLabFeeItemNames(해당 보철 미제공·0원).
// - 2026-08-21: 기공수가「배송비」폐지(치과→기공소 무료). normalize에서 strip.
// - 2026-08-25: 기존 수가에 없던 CA는 Off 시드(기공소 옵트인). 카탈로그 신규도 Off 병합.
// - 2026-08-24: items에 CA 행이 없어도 지그포함/제외를 flat·기본가로 보완(어벗 0원 방지).
// - 2026-08-24: 커스텀어벗 수가 unit=perTooth 강제. 레거시 perSet면 단가 무시되던 버그 수정.
// - 2026-08-23: 커스텀어벗 수가 분리 — 지그포함(보철+어벗, 기본 4만)·지그제외(단독 CA, 기본 3만). 레거시「커스텀어벗」→지그포함.
// - 2026-08-21: PTX CA 치과 청구=기공소「커스텀어벗」수가(기본 4만=관리자 기본 기공수가). 어벗츠 1.5/2.5만은 기공소→어벗츠 Request.
// - 2026-08-13: 유지장치 등 perSet는 연결 스팬당 1세트(끊기면 별도). 연결 없는 레거시는 악궁당.
// - 2026-08-19: 임시치아(perNTeeth)도 연결 스팬당 구간 수가(같은 하악 3치·2치는 2세트).
// - 2026-08-20: Pontic 수가 항목 제거. 레거시 Pontic 치아는 브리지 수가. 임시치아 스팬의 구 Pontic은 세트에 포함.
// - 2026-08-13: 견적 라인은 치아번호 10→20→30→40번대 순.
// - 2026-08-17: 번대 안은 정중선 가운데(18→11, 21→28, 38→31, 41→48).
// - 2026-08-13: 유지장치에 남은 커스텀 플래그는 어벗 과금하지 않는다.
// - 2026-08-19: 임시치아+어벗은 임시치아 수가와 기공소 어벗 수가를 함께 합산.
// - 2026-08-19: 임시치아 어벗은 묶음 줄과 분리해 치아별 커스텀어벗 단가 줄로 표시.
// - 2026-08-21: 크라운·브리지·인레이+어벗도 보철 줄과 커스텀어벗 줄을 분리(수가표와 동일).
// - 2026-08-14: 환봉 프리셋 타입 변경 후에도 제조사·브랜드·패밀리로 매칭.
// - 2026-08-14: 환봉 단가 0원은 별도 고지(abutmentRetailNote=quote). 견적에서 열이 사라지지 않게.
// - 2026-08-14: 환봉 요청중·도입·CNC PTX CA 모두 기공소 어벗 수가.
// - 2026-08-15: 치아번호 없는 자리표시 행(빈 toothNumber+기본 크라운)은 견적에서 제외.
// - 2026-08-14: 치과별 기공수가 할증(labFeeMultiplier). 기공비·기공소 어벗만 배수.
// - 2026-08-14: attachLabFeeMinToLines — 자동매칭 예산 하한을 라인에 붙인다.
import {
  normalizeAbutsAbutmentCreditPrices,
  type AbutsAbutmentCreditPrices,
  type AbutsAbutmentPricingTier,
} from "@/shared/pricing/abutsAbutmentService";
import {
  IMPLANT_ADD_REQUEST_OPTION,
  MANUFACTURER_ADD_REQUEST_BRAND,
} from "@/shared/practice/roundBarAbutment";
import { isFollowUpProsthesisPhase, isFinalProsthesisType } from "@/shared/practice/prosthesisFollowUp";

/** 기공수가 할증 배수. 1=없음, 최대 5, 소수 둘째 자리. */
export const normalizeLabFeeMultiplier = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 1) return 1;
  return Math.min(5, Math.round(n * 100) / 100);
};

export const applyLabFeeMultiplierToFees = <
  T extends {
    labFeeTotal?: number;
    labAbutmentTotal?: number;
    abutmentRetailTotal?: number;
    total?: number;
    lines?: Array<{
      labFee?: number;
      labAbutmentFee?: number;
      [key: string]: unknown;
    }>;
  },
>(
  fees: T,
  labFeeMultiplier: unknown,
): T & { labFeeMultiplier: number } => {
  const m = normalizeLabFeeMultiplier(labFeeMultiplier);
  if (m === 1) {
    return { ...fees, labFeeMultiplier: 1 };
  }
  const scale = (n: unknown) => Math.max(0, Math.round(Number(n || 0) * m));
  const labFeeTotal = scale(fees.labFeeTotal);
  const labAbutmentTotal = scale(fees.labAbutmentTotal);
  const abutmentRetailTotal = Math.max(
    0,
    Math.round(Number(fees.abutmentRetailTotal || 0)),
  );
  return {
    ...fees,
    labFeeTotal,
    labAbutmentTotal,
    abutmentRetailTotal,
    total: labFeeTotal + abutmentRetailTotal,
    lines: (Array.isArray(fees.lines) ? fees.lines : []).map((line) => ({
      ...line,
      labFee: scale(line?.labFee),
      labAbutmentFee: scale(line?.labAbutmentFee),
    })),
    labFeeMultiplier: m,
  };
};

export const formatLabFeeMultiplierLabel = (multiplier: unknown): string => {
  const m = normalizeLabFeeMultiplier(multiplier);
  if (m <= 1) return "할증 없음";
  const text = Number.isInteger(m) ? String(m) : String(m);
  return `${text}x 할증`;
};

/** 신속처리 할증(1 | 설정값). 기본 1.2. */
export const PRACTICE_RUSH_FEE_MULTIPLIER = 1;

export const normalizeRushFeeMultiplier = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 1) return 1;
  return Math.min(2, Math.round(n * 100) / 100);
};

/** 할증 폐기로 설정값 무시 → 1. 레거시 >1 스냅샷만 통과. */
export const normalizeConfiguredRushFeeMultiplier = (
  value: unknown,
): number => {
  const n = normalizeRushFeeMultiplier(value);
  return n > 1 ? n : 1;
};

/** UI 표기: `1.2배` (레거시) */
export const formatRushFeeMultiplierLabel = (value?: unknown): string => {
  const m = normalizeRushFeeMultiplier(value);
  if (m <= 1) return "할증 없음";
  const text = Number.isInteger(m) ? String(m) : String(m);
  return `${text}배`;
};

export const applyRushFeeMultiplierToFees = <
  T extends {
    labFeeTotal?: number;
    labAbutmentTotal?: number;
    abutmentRetailTotal?: number;
    total?: number;
    lines?: Array<{
      labFee?: number;
      labAbutmentFee?: number;
      abutmentRetail?: number;
      [key: string]: unknown;
    }>;
  },
>(
  fees: T,
  rushFeeMultiplier: unknown,
): T & { rushFeeMultiplier: number } => {
  const m = normalizeRushFeeMultiplier(rushFeeMultiplier);
  if (m === 1) {
    return { ...fees, rushFeeMultiplier: 1 };
  }
  const scale = (n: unknown) => Math.max(0, Math.round(Number(n || 0) * m));
  const labFeeTotal = scale(fees.labFeeTotal);
  const labAbutmentTotal = scale(fees.labAbutmentTotal);
  const abutmentRetailTotal = scale(fees.abutmentRetailTotal);
  return {
    ...fees,
    labFeeTotal,
    labAbutmentTotal,
    abutmentRetailTotal,
    total: labFeeTotal + abutmentRetailTotal,
    lines: (Array.isArray(fees.lines) ? fees.lines : []).map((line) => ({
      ...line,
      labFee: scale(line?.labFee),
      labAbutmentFee: scale(line?.labAbutmentFee),
      abutmentRetail: scale(line?.abutmentRetail),
    })),
    rushFeeMultiplier: m,
  };
};

export const LAB_FEE_SCHEDULE_KEYS = [
  "crown",
  "bridge",
  "inlay",
  "retainer",
  "removableTemp3",
  "removableTemp6",
  "customAbutmentDesign",
  "customAbutmentDesignAndProduction",
  "customAbutmentWithoutJig",
] as const;

export type LabFeeScheduleKey = (typeof LAB_FEE_SCHEDULE_KEYS)[number];

export type LabFeeSchedule = Record<LabFeeScheduleKey, number>;

/** 기공소 커스텀어벗 수가 항목명. 지그포함=보철+어벗, 지그제외=단독 커스텀어벗. */
export const LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME = "커스텀어벗(지그포함)";
export const LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_NAME = "커스텀어벗(지그제외)";
export const LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_DEFAULT_PRICE = 40000;
export const LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_DEFAULT_PRICE = 30000;

export const isCustomAbutmentWithJigFeeName = (name: string) => {
  const compact = String(name || "")
    .trim()
    .replace(/\s+/g, "");
  return (
    compact === "커스텀어벗" ||
    compact === "커스텀어버트먼트" ||
    compact === "커스텀어벗(지그포함)" ||
    /^customabut(?:ment)?(?:\(withjig\))?$/i.test(compact)
  );
};

export const isCustomAbutmentWithoutJigFeeName = (name: string) => {
  const compact = String(name || "")
    .trim()
    .replace(/\s+/g, "");
  return (
    compact === "커스텀어벗(지그제외)" ||
    /^customabut(?:ment)?\(withoutjig\)$/i.test(compact)
  );
};

/** 견적 라인·툴팁 라벨이 커스텀어벗 수가 행인지(지그포함/제외 포함). */
export const isCustomAbutmentLabFeeLineType = (prosthesisType: string) => {
  const compact = String(prosthesisType || "")
    .trim()
    .replace(/\s+/g, "");
  if (!compact) return false;
  return (
    isCustomAbutmentWithJigFeeName(prosthesisType) ||
    isCustomAbutmentWithoutJigFeeName(prosthesisType) ||
    compact === "커스텀어벗" ||
    /^(?:커스텀)?어벗디자인$/i.test(compact) ||
    /^커스텀어벗\(/.test(compact)
  );
};

/** 기공비 기본 수가(원). 마스터 스위치가 꺼져 있으면 청구하지 않는다. */
export const LAB_FEE_SCHEDULE_DEFAULTS: LabFeeSchedule = {
  crown: 60000,
  bridge: 60000,
  inlay: 50000,
  retainer: 40000,
  removableTemp3: 30000,
  removableTemp6: 50000,
  customAbutmentDesign: 10000,
  /** 레거시 키 → 커스텀어벗(지그포함) */
  customAbutmentDesignAndProduction:
    LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_DEFAULT_PRICE,
  customAbutmentWithoutJig: LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_DEFAULT_PRICE,
};

/** 기공소 미지정(자동매칭) 견적 — 기본수가 없음 */
export const LAB_FEE_SCHEDULE_ZEROS: LabFeeSchedule = {
  crown: 0,
  bridge: 0,
  inlay: 0,
  retainer: 0,
  removableTemp3: 0,
  removableTemp6: 0,
  customAbutmentDesign: 0,
  customAbutmentDesignAndProduction: 0,
  customAbutmentWithoutJig: 0,
};

export const LAB_FEE_SCHEDULE_UNSET_ENABLED: Record<LabFeeScheduleKey, boolean> =
  Object.fromEntries(LAB_FEE_SCHEDULE_KEYS.map((key) => [key, false])) as Record<
    LabFeeScheduleKey,
    boolean
  >;

const hasLabFeeUpdatedAt = (
  schedule?: { updatedAt?: string | Date | null } | null,
) => {
  const raw = schedule?.updatedAt;
  if (raw == null || raw === "") return false;
  const t = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
  return Number.isFinite(t);
};

/** 마스터 스위치(active)가 켜져야 설정 완료. 레거시는 updatedAt만 있으면 완료. */
export const isLabFeeScheduleConfigured = (
  schedule?: { active?: boolean | null; updatedAt?: string | Date | null } | null,
) => {
  if (!schedule || typeof schedule !== "object") return false;
  if (typeof schedule.active === "boolean") return schedule.active === true;
  return hasLabFeeUpdatedAt(schedule);
};

export const buildUnsetLabFeeSchedule = () => ({
  ...LAB_FEE_SCHEDULE_ZEROS,
  remake: { ...LAB_FEE_SCHEDULE_ZEROS },
  enabled: { ...LAB_FEE_SCHEDULE_UNSET_ENABLED },
  active: false,
  updatedAt: null as string | Date | null,
});

export const resolveLabFeeScheduleSource = <
  T extends { active?: boolean | null; updatedAt?: string | Date | null },
>(
  schedule?: T | null,
) => (isLabFeeScheduleConfigured(schedule) ? schedule : buildUnsetLabFeeSchedule());

/** 리메이크 수가. 미설정 시 0원 */
export const LAB_FEE_REMAKE_SCHEDULE_DEFAULTS: LabFeeSchedule = {
  ...LAB_FEE_SCHEDULE_ZEROS,
};

export const DEFAULT_ABUTMENT_RETAIL_PRICE = 40000;

export const isMissingToothProsthesisType = (prosthesisType: string) => {
  const raw = String(prosthesisType || "").trim();
  const compact = raw.replace(/\s+/g, "");
  return (
    raw === "결손치" ||
    raw === "작업X" ||
    raw === "상실치" ||
    compact.toLowerCase() === "작업x" ||
    /^missing(?:tooth)?$/i.test(compact)
  );
};

export const isCustomAbutmentProsthesisType = (prosthesisType: string) => {
  const raw = String(prosthesisType || "").trim();
  const compact = raw.replace(/\s+/g, "");
  return (
    compact === "커스텀어벗" ||
    /^(?:커스텀)?어벗디자인$/i.test(compact) ||
    /^custom\s*abut(?:ment)?$/i.test(raw)
  );
};

export const isCustomAbutmentWork = (row?: {
  prosthesisType?: string;
  type?: string;
  customAbutment?: boolean;
  hasCustomAbutment?: boolean;
} | null) => {
  const prosthesisType = String(row?.prosthesisType || row?.type || "").trim();
  if (!prosthesisType || isMissingToothProsthesisType(prosthesisType)) return false;
  if (isCustomAbutmentProsthesisType(prosthesisType)) return true;
  const compact = prosthesisType.replace(/\s+/g, "");
  if (
    prosthesisType !== "크라운" &&
    prosthesisType !== "브리지" &&
    compact !== "임시치아" &&
    compact !== "가철성임시치아" &&
    !/가철성\s*임시/i.test(prosthesisType)
  ) {
    return false;
  }
  return Boolean(row?.hasCustomAbutment) || Boolean(row?.customAbutment);
};

/** 심플어벗/심플밀링 — 치과 재고. 기공소 커스텀어벗 수가·견적 제외(transferMemo와 동일 판별). */
const SIMPLE_ABUTMENT_KINDS = new Set(["심플어벗", "심플밀링"]);

/**
 * 크라운·브리지·임시치아 + 심플어벗만 기공소 CA 수가에서 제외.
 * 단독「커스텀어벗」형태는 심플이어도 「커스텀어벗(지그제외)」수가 대상.
 */
export const isSimpleAbutmentModeForFee = (
  row?: {
    abutmentManufacturer?: string;
    manufacturer?: string;
    prosthesisType?: string;
    type?: string;
  } | null,
) => {
  const prosthesisType = String(row?.prosthesisType || row?.type || "").trim();
  if (isCustomAbutmentProsthesisType(prosthesisType)) return false;
  return SIMPLE_ABUTMENT_KINDS.has(
    String(row?.abutmentManufacturer || row?.manufacturer || "").trim(),
  );
};

/** @deprecated pending 판별은 IMPLANT_ADD_REQUEST_OPTION / implantAddRequest 사용 */
export const ROUND_BAR_PENDING_IMPLANT_TYPE = "헥스(사이즈 미정)";

export type ImplantFavoriteForFee = {
  manufacturer?: string;
  brand?: string;
  family?: string;
  type?: string;
  roundBar?: boolean;
  implantAddRequest?: boolean;
  adopted?: boolean;
  adoptedKind?: "cnc" | "round_bar" | "";
  isPublic?: boolean;
  roundBarRequestId?: string;
};

type RoundBarToothRow = {
  implantType?: string;
  implantManufacturer?: string;
  implantBrand?: string;
  implantFamily?: string;
  brand?: string;
  type?: string;
  implantAddRequest?: boolean;
  roundBar?: boolean;
  roundBarAdopted?: boolean;
  adopted?: boolean;
  adoptedKind?: "cnc" | "round_bar" | "";
  isPublic?: boolean;
  roundBarRequestId?: string;
};

const implantSpecKeyForFee = (row: {
  manufacturer?: string;
  brand?: string;
  family?: string;
  type?: string;
  implantManufacturer?: string;
  implantBrand?: string;
  implantFamily?: string;
  implantType?: string;
}) =>
  [
    row.implantManufacturer || row.manufacturer,
    row.implantBrand || row.brand,
    row.implantFamily || row.family,
    row.implantType || row.type,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .join("|");

const implantFamilyKeyForFee = (row: {
  manufacturer?: string;
  brand?: string;
  family?: string;
  implantManufacturer?: string;
  implantBrand?: string;
  implantFamily?: string;
}) =>
  [
    row.implantManufacturer || row.manufacturer,
    row.implantBrand || row.brand,
    row.implantFamily || row.family,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .join("|");

const isRoundBarFavoriteRow = (fav?: ImplantFavoriteForFee | null) =>
  Boolean(fav?.roundBar) ||
  Boolean(fav?.isPublic) ||
  Boolean(String(fav?.roundBarRequestId || "").trim());

const findRoundBarFavoriteForFee = (
  row?: RoundBarToothRow | null,
  favorites?: ReadonlyArray<ImplantFavoriteForFee> | null,
) => {
  const list = Array.isArray(favorites) ? favorites : [];
  if (!row || list.length === 0) return null;
  const requestId = String(row.roundBarRequestId || "").trim();
  if (requestId) {
    const byRequest = list.find(
      (fav) => String(fav.roundBarRequestId || "").trim() === requestId,
    );
    if (byRequest) return byRequest;
  }
  const exact = implantSpecKeyForFee(row);
  const byExact = list.find((fav) => implantSpecKeyForFee(fav) === exact);
  if (byExact) return byExact;
  const familyKey = implantFamilyKeyForFee(row);
  if (!familyKey || familyKey === "||") return null;
  return (
    list.find(
      (fav) =>
        isRoundBarFavoriteRow(fav) && implantFamilyKeyForFee(fav) === familyKey,
    ) || null
  );
};

/** 환봉·임플란트 추가 요청(미도입=요청중·도입중). 도입되면 어벗츠 어벗.
 * pending 판별 SSOT: implantAddRequest / roundBar 플래그·요청ID·brand=추가요청·type=임플란트 추가 요청·isPublic 미도입.
 * implantType=헥스(사이즈 미정)만으로는 판별하지 않는다.
 */
export const isPendingRoundBarAbutment = (
  row?: RoundBarToothRow | null,
  favorites?: ReadonlyArray<ImplantFavoriteForFee> | null,
) => {
  if (!row) return false;
  if (row.roundBarAdopted === true || row.adopted === true) return false;
  const brand = String(row.implantBrand || row.brand || "").trim();
  const type = String(row.implantType || row.type || "").trim();
  const flagged =
    Boolean(row.implantAddRequest) ||
    Boolean(row.roundBar) ||
    Boolean((row as { isPublic?: boolean }).isPublic) ||
    Boolean(String(row.roundBarRequestId || "").trim()) ||
    brand === MANUFACTURER_ADD_REQUEST_BRAND ||
    type === IMPLANT_ADD_REQUEST_OPTION;
  if (flagged) {
    const list = Array.isArray(favorites) ? favorites : [];
    if (list.length === 0) return true;
    const match = findRoundBarFavoriteForFee(row, list);
    if (!match) return true;
    return match.adopted !== true;
  }
  const list = Array.isArray(favorites) ? favorites : [];
  if (list.length === 0) return false;
  const match = findRoundBarFavoriteForFee(row, list);
  if (!match) return false;
  if (match.adopted === true) return false;
  return (
    Boolean(match.roundBar) ||
    Boolean((match as { isPublic?: boolean }).isPublic) ||
    Boolean(match.implantAddRequest) ||
    Boolean(String(match.roundBarRequestId || "").trim())
  );
};

export const resolveAdoptedAbutmentKind = (
  row?: RoundBarToothRow | null,
  favorites?: ReadonlyArray<ImplantFavoriteForFee> | null,
): "cnc" | "round_bar" => {
  const match = findRoundBarFavoriteForFee(row, favorites);
  const raw = String(match?.adoptedKind || row?.adoptedKind || "")
    .trim()
    .toLowerCase();
  if (raw === "round_bar") return "round_bar";
  return "cnc";
};

const resolveLabAbutmentUnitPrice = (
  items: LabFeeItem[],
  useRemake: boolean,
  withJig = true,
) => {
  const feeName = withJig
    ? LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME
    : LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_NAME;
  const item = findLabFeeItemForProsthesisType(items, feeName);
  // unit은 normalize가 perTooth로 고정. 레거시 perSet 등도 단가만 쓴다.
  if (!item) return 0;
  return Math.max(0, Math.round(Number(useRemake ? item.remake : item.price) || 0));
};

/** 보철+어벗 → 지그포함, 단독 커스텀어벗 → 지그제외 */
const labAbutmentFeeNameForRow = (row?: {
  prosthesisType?: string;
  type?: string;
} | null) => {
  const prosthesisType = String(row?.prosthesisType || row?.type || "").trim();
  if (isCustomAbutmentProsthesisType(prosthesisType)) {
    return LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_NAME;
  }
  return LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME;
};

const resolveLabAbutmentUnitPriceForRow = (
  items: LabFeeItem[],
  useRemake: boolean,
  row?: { prosthesisType?: string; type?: string } | null,
) => {
  const withJig = !isCustomAbutmentProsthesisType(
    String(row?.prosthesisType || row?.type || "").trim(),
  );
  return resolveLabAbutmentUnitPrice(items, useRemake, withJig);
};

export const isRetainerProsthesisType = (prosthesisType: string) => {
  const raw = String(prosthesisType || "").trim();
  const compact = raw.replace(/\s+/g, "");
  return compact === "유지장치" || /^retainer$/i.test(raw);
};

export const isRemovableTempProsthesisType = (prosthesisType: string) => {
  const raw = String(prosthesisType || "").trim();
  const compact = raw.replace(/\s+/g, "");
  return (
    compact === "가철성임시치아" ||
    compact === "임시치아" ||
    /가철성\s*임시/i.test(raw)
  );
};

/** 기공비 항목명: 임시치아 · 임시치아1 · 임시치아2 */
export const isRemovableTempFeeName = (name: string) => {
  const raw = String(name || "").trim();
  const compact = raw.replace(/\s+/g, "");
  return (
    compact === "가철성임시치아" ||
    compact === "임시치아" ||
    /^임시치아\d+$/.test(compact) ||
    /가철성\s*임시/i.test(raw)
  );
};

export const toothArchFromNumber = (toothNumber: string) => {
  const n = String(toothNumber || "").replace(/\D/g, "");
  const first = n[0];
  if (first === "1" || first === "2") return "upper" as const;
  if (first === "3" || first === "4") return "lower" as const;
  return "other" as const;
};

/** 표시용: 18..11 → 21..28 → 38..31 → 41..48 (10→20→30→40번대).
 * 악궁마다 구치(뒷자리 큼)가 가장자리, 정중선(뒷자리 작음)이 가운데. */
export const toToothDecadeSortNumber = (toothNumber: string) => {
  const tokens = String(toothNumber || "")
    .split(/[^\d]+/)
    .filter((token) => /^[1-4][1-8]$/.test(token));
  if (tokens.length === 0) return Number.MAX_SAFE_INTEGER;
  return Math.min(
    ...tokens.map((token) => {
      const tens = Number(token[0]);
      const ones = Number(token[1]);
      const decadeBase = (tens - 1) * 10;
      // 10·30번대: 후방→정중선(18..11 / 38..31). 20·40번대: 정중선→후방(21..28 / 41..48)
      if (tens === 1 || tens === 3) return decadeBase + (8 - ones);
      return decadeBase + (ones - 1);
    }),
  );
};

export const practiceTransferFeeLineSortRank = (line: {
  prosthesisType?: string;
}) => {
  const type = String(line?.prosthesisType || "");
  if (/임시치아/.test(type)) return 0;
  if (isCustomAbutmentLabFeeLineType(type)) return 2;
  return 1;
};

export const sortPracticeTransferFeeLines = <T extends { toothNumber?: string; prosthesisType?: string }>(
  lines: ReadonlyArray<T>,
): T[] =>
  lines.slice().sort((a, b) => {
    const cat =
      practiceTransferFeeLineSortRank(a) - practiceTransferFeeLineSortRank(b);
    if (cat !== 0) return cat;
    const diff =
      toToothDecadeSortNumber(String(a.toothNumber || "")) -
      toToothDecadeSortNumber(String(b.toothNumber || ""));
    if (diff !== 0) return diff;
    const aMulti = String(a.toothNumber || "").includes(",");
    const bMulti = String(b.toothNumber || "").includes(",");
    if (aMulti !== bMulti) return aMulti ? -1 : 1;
    return String(a.toothNumber || "").localeCompare(String(b.toothNumber || ""), "ko");
  });

const sortToothNumbersForFee = (teeth: readonly string[]) =>
  teeth.slice().sort((a, b) => toToothDecadeSortNumber(a) - toToothDecadeSortNumber(b));

export const removableTempFeeForCount = (
  count: number,
  price3: number,
  price6: number,
) =>
  nTeethFeeForCount(count, [
    { n: 3, price: price3, remake: 0 },
    { n: 6, price: price6, remake: 0 },
  ]);

export const LAB_FEE_ITEM_UNITS = ["perTooth", "perNTeeth", "perSet"] as const;
export type LabFeeItemUnit = (typeof LAB_FEE_ITEM_UNITS)[number];

export const LAB_FEE_ITEM_UNIT_LABELS: Record<LabFeeItemUnit, string> = {
  perTooth: "치아 1개당",
  perNTeeth: "치아 n개당",
  perSet: "1세트당",
};

export const MAX_LAB_FEE_ITEMS = 40;
export const MAX_LAB_FEE_ITEM_TIERS = 8;

export const LAB_FEE_SHIPPING_ITEM_ID = "shipping";
export const LAB_FEE_SHIPPING_ITEM_NAME = "배송비";
/** @deprecated 치과→기공소 배송 무료. */
export const LAB_FEE_SHIPPING_LAB_DEFAULT_PRICE = 0;

export type LabFeeItemTier = {
  n: number;
  price: number;
  remake: number;
};

export type LabFeeItem = {
  id: string;
  name: string;
  unit: LabFeeItemUnit;
  enabled: boolean;
  price: number;
  remake: number;
  tiers: LabFeeItemTier[];
  /** 어벗츠 수가: 기공소 신규 제안 · 관리자 검증 대기 */
  pendingReview?: boolean;
  proposedByLabName?: string;
  proposedByLabAnchorId?: string;
  proposedAt?: string | null;
};

export const nTeethFeeForCount = (
  count: number,
  tiers?: ReadonlyArray<Partial<LabFeeItemTier>> | null,
  remake = false,
) => {
  const list = (Array.isArray(tiers) ? tiers : [])
    .map((tier) => ({
      n: Math.max(1, Math.round(Number(tier?.n || 1))),
      price: Math.max(0, Math.round(Number(remake ? tier?.remake : tier?.price) || 0)),
    }))
    .filter((tier) => Number.isFinite(tier.n) && tier.n > 0)
    .sort((a, b) => a.n - b.n);
  let left = Math.max(0, Math.round(Number(count || 0)));
  if (!list.length || left <= 0) return 0;
  const maxN = list[list.length - 1].n;
  let total = 0;
  while (left > 0) {
    const tier = list.find((row) => left <= row.n) || list[list.length - 1];
    total += tier.price;
    if (left <= tier.n) break;
    left -= maxN;
  }
  return total;
};

export const canonicalizeFeeItemName = (name: string) => {
  const raw = String(name || "").trim();
  if (!raw) return "";
  const compact = raw.replace(/\s+/g, "");
  if (/^pontic$/i.test(raw)) return "브리지";
  if (compact === "브릿지" || compact === "브리지" || /^bridge$/i.test(raw)) return "브리지";
  if (
    compact === "가철성임시치아" ||
    compact === "임시치아" ||
    /^임시치아\d+$/.test(compact) ||
    /가철성\s*임시/i.test(raw)
  ) {
    return "임시치아";
  }
  if (compact === "유지장치" || /^retainer$/i.test(raw)) return "유지장치";
  if (compact === "인레이" || /^inlay$/i.test(raw)) return "인레이";
  if (compact === "크라운" || /^crown$/i.test(raw)) return "크라운";
  if (
    compact === "커스텀어벗(지그제외)" ||
    /^customabut(?:ment)?\(withoutjig\)$/i.test(compact)
  ) {
    return LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_NAME;
  }
  if (
    compact === "커스텀어벗" ||
    compact === "커스텀어버트먼트" ||
    compact === "커스텀어벗(지그포함)" ||
    /^customabut(?:ment)?(?:\(withjig\))?$/i.test(compact)
  ) {
    return LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME;
  }
  if (compact === "배송비" || /^shipping$/i.test(raw)) return "배송비";
  return raw;
};

export const isLabFeeShippingItem = (item?: Partial<LabFeeItem> | null) => {
  if (!item || typeof item !== "object") return false;
  if (String(item.id || "").trim() === LAB_FEE_SHIPPING_ITEM_ID) return true;
  return canonicalizeFeeItemName(String(item.name || "")) === LAB_FEE_SHIPPING_ITEM_NAME;
};

/** @deprecated 신규 시드에 쓰지 않음. */
export const buildLabFeeShippingItem = ({
  price = LAB_FEE_SHIPPING_LAB_DEFAULT_PRICE,
  enabled = false,
}: {
  price?: number;
  enabled?: boolean;
} = {}): LabFeeItem => ({
  id: LAB_FEE_SHIPPING_ITEM_ID,
  name: LAB_FEE_SHIPPING_ITEM_NAME,
  unit: "perSet",
  enabled: enabled === true,
  price: Math.max(0, Math.round(Number(price) || 0)),
  remake: 0,
  tiers: [],
});

/** 레거시「배송비」행 제거. 치과→기공소는 무료. */
export const stripLabFeeShippingItems = (
  items: LabFeeItem[],
): LabFeeItem[] => {
  const list = Array.isArray(items) ? items : [];
  return list.filter((item) => !isLabFeeShippingItem(item));
};

/** @deprecated stripLabFeeShippingItems. 호환: shipping 미삽입·기존 행 제거. */
export const ensureLabFeeShippingItem = (
  items: LabFeeItem[],
  _opts?: { price?: number; enabled?: boolean },
): LabFeeItem[] => stripLabFeeShippingItems(items);

const isRemovedPonticFeeRow = (
  row?: { id?: string; key?: string; name?: string; label?: string } | null,
) => {
  const id = String(row?.id || row?.key || "").trim().toLowerCase();
  const name = String(row?.name || row?.label || "").trim();
  return id === "pontic" || /^pontic$/i.test(name);
};

export const normalizeLabFeeItemUnit = (unit?: string | null): LabFeeItemUnit => {
  const raw = String(unit || "").trim();
  if (raw === "perNTeeth" || raw === "nTeeth" || raw === "perN") return "perNTeeth";
  if (raw === "perSet" || raw === "set") return "perSet";
  return "perTooth";
};

const normalizeLabFeeItemTier = (
  input: Partial<LabFeeItemTier> | null | undefined,
  index: number,
): LabFeeItemTier => {
  const n = Math.max(1, Math.min(32, Math.round(Number(input?.n || index + 1))));
  const price = Math.max(0, Math.round(Number(input?.price || 0)));
  const remake = Math.max(0, Math.round(Number(input?.remake || 0)));
  return {
    n: Number.isFinite(n) ? n : index + 1,
    price: Number.isFinite(price) ? price : 0,
    remake: Number.isFinite(remake) ? remake : 0,
  };
};

export const normalizeLabFeeItem = (
  input?: Partial<LabFeeItem> & { label?: string; key?: string } | null,
  index = 0,
): LabFeeItem => {
  const src = input && typeof input === "object" ? input : {};
  const name = canonicalizeFeeItemName(src.name || src.label || "");
  let unit = normalizeLabFeeItemUnit(src.unit);
  // 커스텀어벗 수가는 치아당만. UI/레거시에서 perSet로 저장된 경우 과금이 0이 되지 않게 강제.
  if (
    isCustomAbutmentWithJigFeeName(name) ||
    isCustomAbutmentWithoutJigFeeName(name)
  ) {
    unit = "perTooth";
  }
  const enabled = src.enabled !== false;
  const price = Math.max(0, Math.round(Number(src.price || 0)));
  const remake = Math.max(0, Math.round(Number(src.remake || 0)));
  const idRaw = String(src.id || src.key || "").trim();
  const id = idRaw || `item-${index + 1}`;
  const tiers = (Array.isArray(src.tiers) ? src.tiers : [])
    .map((tier, tierIndex) => normalizeLabFeeItemTier(tier, tierIndex))
    .slice(0, MAX_LAB_FEE_ITEM_TIERS);
  if (unit === "perNTeeth" && tiers.length === 0) {
    tiers.push(normalizeLabFeeItemTier({ n: 3, price, remake }, 0));
  }
  return {
    id,
    name,
    unit,
    enabled,
    price: Number.isFinite(price) ? price : 0,
    remake: Number.isFinite(remake) ? remake : 0,
    tiers: unit === "perNTeeth" ? tiers : [],
    ...(src.pendingReview === true
      ? {
          pendingReview: true,
          ...(String(src.proposedByLabName || "").trim()
            ? { proposedByLabName: String(src.proposedByLabName).trim() }
            : {}),
          ...(String(src.proposedByLabAnchorId || "").trim()
            ? {
                proposedByLabAnchorId: String(src.proposedByLabAnchorId).trim(),
              }
            : {}),
          ...(src.proposedAt
            ? { proposedAt: String(src.proposedAt) }
            : {}),
        }
      : {}),
  };
};

const migrateLegacyLabFeeItems = (
  input?: Partial<LabFeeSchedule> | { remake?: Partial<LabFeeSchedule>; enabled?: Partial<Record<LabFeeScheduleKey, boolean>> } | null,
): LabFeeItem[] => {
  const schedule = normalizeLabFeeSchedule(input as Partial<LabFeeSchedule>);
  const remake = normalizeLabFeeRemakeSchedule(
    input && typeof input === "object" && "remake" in input && input.remake
      ? input
      : { remake: {} },
  );
  const enabledSrc =
    input && typeof input === "object" && "enabled" in input
      ? (input as { enabled?: Partial<Record<LabFeeScheduleKey, boolean>> }).enabled
      : undefined;
  const on = (key: LabFeeScheduleKey) => enabledSrc?.[key] !== false;
  return [
    { id: "crown", name: "크라운", unit: "perTooth", enabled: on("crown"), price: schedule.crown, remake: remake.crown, tiers: [] },
    { id: "bridge", name: "브리지", unit: "perTooth", enabled: on("bridge"), price: schedule.bridge, remake: remake.bridge, tiers: [] },
    { id: "inlay", name: "인레이", unit: "perTooth", enabled: on("inlay"), price: schedule.inlay, remake: remake.inlay, tiers: [] },
    { id: "retainer", name: "유지장치", unit: "perSet", enabled: on("retainer"), price: schedule.retainer, remake: remake.retainer, tiers: [] },
    {
      id: "temp1",
      name: "임시치아",
      unit: "perNTeeth",
      enabled: on("removableTemp3"),
      price: schedule.removableTemp3,
      remake: remake.removableTemp3,
      tiers: [{ n: 3, price: schedule.removableTemp3, remake: remake.removableTemp3 }],
    },
    {
      id: "temp2",
      name: "임시치아",
      unit: "perNTeeth",
      enabled: on("removableTemp6"),
      price: schedule.removableTemp6,
      remake: remake.removableTemp6,
      tiers: [{ n: 6, price: schedule.removableTemp6, remake: remake.removableTemp6 }],
    },
    {
      id: "customAbutmentWithJig",
      name: LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME,
      unit: "perTooth",
      enabled: on("customAbutmentDesignAndProduction"),
      price: schedule.customAbutmentDesignAndProduction,
      remake: remake.customAbutmentDesignAndProduction,
      tiers: [],
    },
    {
      id: "customAbutmentWithoutJig",
      name: LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_NAME,
      unit: "perTooth",
      enabled:
        on("customAbutmentWithoutJig") && on("customAbutmentDesignAndProduction"),
      price: schedule.customAbutmentWithoutJig,
      remake: remake.customAbutmentWithoutJig,
      tiers: [],
    },
  ];
};

const numberedTempName = (name: string) => {
  const raw = String(name || "").trim() || "임시치아";
  if (isRemovableTempFeeName(name) || isRemovableTempFeeName(raw)) {
    return "임시치아";
  }
  return raw;
};

const expandPerNTeethTierItems = (items: LabFeeItem[]): LabFeeItem[] => {
  const seen = new Set<string>();
  const out: LabFeeItem[] = [];
  const takeId = (wanted: string, fallbackIndex: number) => {
    let id = String(wanted || "").trim() || `item-${fallbackIndex + 1}`;
    if (!seen.has(id)) {
      seen.add(id);
      return id;
    }
    let n = 2;
    while (seen.has(`${id}-${n}`)) n += 1;
    id = `${id}-${n}`;
    seen.add(id);
    return id;
  };
  for (const item of items) {
    if (item.unit !== "perNTeeth" || item.tiers.length <= 1) {
      out.push({ ...item, id: takeId(item.id, out.length) });
      continue;
    }
    item.tiers.forEach((tier, index) => {
      out.push({
        ...item,
        id: takeId(`${item.id}-${index + 1}`, out.length),
        name: numberedTempName(item.name, index),
        price: tier.price,
        remake: tier.remake,
        tiers: [tier],
      });
    });
  }
  return out.slice(0, MAX_LAB_FEE_ITEMS);
};

export const normalizeLabFeeItems = (
  input?:
    | Partial<LabFeeSchedule>
    | { items?: Array<Partial<LabFeeItem>> | null; remake?: Partial<LabFeeSchedule> }
    | LabFeeItem[]
    | null,
): LabFeeItem[] => {
  const src = input && typeof input === "object" ? input : {};
  const rawItems = Array.isArray(src)
    ? src
    : Array.isArray((src as { items?: LabFeeItem[] }).items)
      ? (src as { items: LabFeeItem[] }).items
      : null;
  if (rawItems) {
    const seen = new Set<string>();
    const out: LabFeeItem[] = [];
    for (const row of rawItems) {
      if (out.length >= MAX_LAB_FEE_ITEMS) break;
      if (isRemovedPonticFeeRow(row)) continue;
      if (isLabFeeShippingItem(row)) continue;
      const item = normalizeLabFeeItem(row, out.length);
      if (!item.name) continue;
      if (isLabFeeShippingItem(item)) continue;
      let id = item.id;
      if (!id || seen.has(id)) id = `item-${out.length + 1}`;
      if (
        id === "customAbutment" &&
        isCustomAbutmentWithJigFeeName(item.name)
      ) {
        id = "customAbutmentWithJig";
      }
      if (seen.has(id)) id = `item-${out.length + 1}`;
      seen.add(id);
      out.push({ ...item, id });
    }
    return stripLabFeeShippingItems(
      ensureSplitCustomAbutmentFeeItems(expandPerNTeethTierItems(out), src),
    );
  }
  return migrateLegacyLabFeeItems(src as Partial<LabFeeSchedule>);
};

/**
 * 커스텀어벗(지그포함/제외) 행이 없으면 보완.
 * items에 보철만 있고 CA가 없으면 flat 키가 무시돼 어벗 과금이 0이 되던 버그 방지.
 */
const ensureSplitCustomAbutmentFeeItems = (
  items: LabFeeItem[],
  scheduleSrc?: Partial<LabFeeSchedule> & {
    enabled?: Partial<Record<string, boolean>>;
  } | null,
): LabFeeItem[] => {
  const list = Array.isArray(items) ? items : [];
  const hadExistingItems = list.length > 0;
  const src = scheduleSrc && typeof scheduleSrc === "object" ? scheduleSrc : {};
  const enabledSrc =
    src.enabled && typeof src.enabled === "object" ? src.enabled : {};
  const flatWithJig = Math.max(
    0,
    Math.round(Number(src.customAbutmentDesignAndProduction || 0)),
  );
  const flatWithoutJig = Math.max(
    0,
    Math.round(Number(src.customAbutmentWithoutJig || 0)),
  );
  const withJigEnabled = enabledSrc.customAbutmentDesignAndProduction !== false;
  const withoutJigEnabled =
    enabledSrc.customAbutmentWithoutJig !== false &&
    enabledSrc.customAbutmentDesignAndProduction !== false;

  const out = list.map((item) => {
    if (isCustomAbutmentWithJigFeeName(item.name)) {
      return {
        ...item,
        name: LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME,
        unit: "perTooth" as const,
        tiers: [],
      };
    }
    if (isCustomAbutmentWithoutJigFeeName(item.name)) {
      return {
        ...item,
        name: LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_NAME,
        unit: "perTooth" as const,
        tiers: [],
      };
    }
    return item;
  });
  const withJig = out.find((item) => isCustomAbutmentWithJigFeeName(item.name));
  const withoutJig = out.find((item) =>
    isCustomAbutmentWithoutJigFeeName(item.name),
  );
  const seen = new Set(out.map((item) => item.id));
  const takeId = (wanted: string) => {
    let id = wanted;
    if (!seen.has(id)) {
      seen.add(id);
      return id;
    }
    let n = 2;
    while (seen.has(`${wanted}-${n}`)) n += 1;
    id = `${wanted}-${n}`;
    seen.add(id);
    return id;
  };
  if (!withJig && out.length < MAX_LAB_FEE_ITEMS) {
    const enableNew =
      hadExistingItems && flatWithJig <= 0 ? false : withJigEnabled;
    out.push({
      id: takeId("customAbutmentWithJig"),
      name: LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME,
      unit: "perTooth",
      enabled: enableNew,
      price:
        flatWithJig > 0
          ? flatWithJig
          : LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_DEFAULT_PRICE,
      remake: 0,
      tiers: [],
    });
  }
  if (!withoutJig && out.length < MAX_LAB_FEE_ITEMS) {
    const seed = withJig || withoutJig;
    const enableNew =
      hadExistingItems && flatWithoutJig <= 0
        ? false
        : seed
          ? seed.enabled !== false
          : withoutJigEnabled;
    out.push({
      id: takeId("customAbutmentWithoutJig"),
      name: LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_NAME,
      unit: "perTooth",
      enabled: enableNew,
      price:
        flatWithoutJig > 0
          ? flatWithoutJig
          : LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_DEFAULT_PRICE,
      remake: 0,
      tiers: [],
    });
  }
  return out.slice(0, MAX_LAB_FEE_ITEMS);
};

export const findLabFeeItemForProsthesisType = (
  items: LabFeeItem[] | null | undefined,
  prosthesisType: string,
) => {
  const canon = canonicalizeFeeItemName(prosthesisType);
  if (!canon) return null;
  const matches = (Array.isArray(items) ? items : []).filter((item) => {
    if (item.enabled === false) return false;
    if (isRemovableTempProsthesisType(prosthesisType)) {
      return isRemovableTempFeeName(item.name);
    }
    return canonicalizeFeeItemName(item.name) === canon;
  });
  if (!matches.length) return null;
  if (matches.length === 1) return matches[0];
  const perN = matches.filter((item) => item.unit === "perNTeeth");
  if (perN.length) {
    const tiers = perN.flatMap((item) =>
      item.tiers.length
        ? item.tiers
        : [{ n: 3, price: item.price, remake: item.remake }],
    );
    return { ...perN[0], tiers };
  }
  return matches[0];
};

export const labFeeItemNameForProsthesisType = (prosthesisType: string) => {
  const raw = String(prosthesisType || "").trim();
  if (!raw || isMissingToothProsthesisType(raw)) {
    return "";
  }
  if (isCustomAbutmentProsthesisType(raw)) {
    return LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_NAME;
  }
  if (isRemovableTempProsthesisType(raw)) return "임시치아";
  return canonicalizeFeeItemName(raw);
};

export const labFeeItemNamesNeededForToothWorks = (
  toothWorks?: ReadonlyArray<{
    toothNumber?: string;
    tooth?: string;
    prosthesisType?: string;
    type?: string;
    bridgeLinkedTeeth?: string[];
    customAbutment?: boolean;
    hasCustomAbutment?: boolean;
    abutmentManufacturer?: string;
    manufacturer?: string;
  } | null> | null,
) => {
  const rows = (Array.isArray(toothWorks) ? toothWorks : []).filter(
    (row): row is NonNullable<typeof row> => Boolean(row),
  );
  const absorbed = absorbedNonTempTeethInTempSpans(rows);
  const names: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const toothNumber = String(row.toothNumber || row.tooth || "").trim();
    if (toothNumber && !/^[1-4][1-8]$/.test(toothNumber)) continue;
    if (absorbed.has(toothNumber)) continue;
    const prosthesisType = row.prosthesisType || row.type || "";
    const simple = isSimpleAbutmentModeForFee(row);
    const name = labFeeItemNameForProsthesisType(prosthesisType);
    if (
      name &&
      !seen.has(name) &&
      !(
        simple &&
        isCustomAbutmentProsthesisType(prosthesisType) &&
        name === LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_NAME
      )
    ) {
      seen.add(name);
      names.push(name);
    }
    if (
      isCustomAbutmentWork(row) &&
      !simple &&
      !isCustomAbutmentProsthesisType(prosthesisType) &&
      !seen.has(LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME)
    ) {
      seen.add(LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME);
      names.push(LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME);
    }
  }
  return names;
};

export const labFeeItemMatchesNeedName = (
  item: { name?: string } | null | undefined,
  needName: string,
) => {
  const need = canonicalizeFeeItemName(needName);
  if (!need) return false;
  if (need === "임시치아" || isRemovableTempFeeName(needName)) {
    return isRemovableTempFeeName(item?.name || "");
  }
  return canonicalizeFeeItemName(item?.name || "") === need;
};

const labFeeItemHasChargePrice = (item: LabFeeItem) => {
  if (!item || item.enabled === false) return false;
  const tierPrices = item.tiers.map((tier) =>
    Math.round(Number(tier.price || 0)),
  );
  const price = Math.max(
    0,
    Math.round(Number(item.price || 0)),
    ...tierPrices,
  );
  return price > 0;
};

export const missingLabFeeItemNames = (
  schedule:
    | Partial<LabFeeSchedule>
    | { items?: Array<Partial<LabFeeItem>> | null }
    | LabFeeItem[]
    | null
    | undefined,
  toothWorks?: Parameters<typeof labFeeItemNamesNeededForToothWorks>[0],
) => {
  const needed = labFeeItemNamesNeededForToothWorks(toothWorks);
  const items = normalizeLabFeeItems(schedule);
  return needed.filter(
    (name) =>
      !items.some(
        (item) =>
          labFeeItemMatchesNeedName(item, name) && labFeeItemHasChargePrice(item),
      ),
  );
};

/** 보철 형태 → labFeeSchedule 키. 작업X·커스텀어벗(어벗츠/기공소 어벗 단가)·묶음수가 항목은 null */
export const resolveLabFeeKeyFromProsthesisType = (
  prosthesisType: string,
): LabFeeScheduleKey | null => {
  const raw = String(prosthesisType || "").trim();
  if (!raw) return "crown";
  if (isMissingToothProsthesisType(raw)) return null;
  if (isCustomAbutmentProsthesisType(raw)) return null;
  if (isRetainerProsthesisType(raw)) return "retainer";
  if (isRemovableTempProsthesisType(raw)) return null;
  if (/^pontic$/i.test(raw)) return "bridge";
  if (raw.includes("인레이") || /^inlay$/i.test(raw)) return "inlay";
  if (raw.includes("브리지") || /^bridge$/i.test(raw)) return "bridge";
  if (raw.includes("크라운") || /^crown$/i.test(raw)) return "crown";
  return "crown";
};

export const prosthesisIncludesCustomAbutment = (prosthesisType: string) =>
  isCustomAbutmentProsthesisType(prosthesisType);

export const resolveRemakeLabFeeKey = (row?: {
  prosthesisType?: string;
  type?: string;
  customAbutment?: boolean;
  hasCustomAbutment?: boolean;
  abutmentProductMode?: string;
  productMode?: string;
} | null): LabFeeScheduleKey | null => {
  const prosthesisType = String(row?.prosthesisType || row?.type || "").trim();
  if (!prosthesisType || isMissingToothProsthesisType(prosthesisType)) return null;
  if (isCustomAbutmentProsthesisType(prosthesisType)) {
    const mode = String(row?.abutmentProductMode || row?.productMode || "").trim();
    if (mode === "design_custom_abutment" || /어벗\s*디자인/i.test(prosthesisType)) {
      return "customAbutmentDesign";
    }
    return "customAbutmentDesignAndProduction";
  }
  return resolveLabFeeKeyFromProsthesisType(prosthesisType);
};

/** 플랫폼 고시(membership*) 단가. pricingTier는 무시(멤버십 폐지). */
export const resolveAbutsAbutmentUnitPrice = (args: {
  productMode?: string | null;
  /** @deprecated 무시. 항상 고시 단일가. */
  pricingTier?: AbutsAbutmentPricingTier | null;
  prices?: Partial<AbutsAbutmentCreditPrices> | null;
  kind?: "cnc" | "round_bar" | null;
}) => {
  void args.pricingTier;
  const prices = normalizeAbutsAbutmentCreditPrices(args.prices);
  const isDesign = String(args.productMode || "").trim() === "design_custom_abutment";
  if (args.kind === "round_bar") {
    return isDesign
      ? prices.membershipRoundBarDesignAndProductionPrice
      : prices.membershipRoundBarProductionPrice;
  }
  return isDesign
    ? prices.membershipDesignAndProductionPrice
    : prices.membershipProductionPrice;
};

export const splitPracticeTransferSettlement = (args: {
  labFeeTotal: number;
  abutmentRetailTotal: number;
  feeRateApplied: number;
}) => {
  const labFees = Math.max(0, Math.round(Number(args.labFeeTotal || 0)));
  const abutment = Math.max(0, Math.round(Number(args.abutmentRetailTotal || 0)));
  const rate = Number(args.feeRateApplied || 0);
  const clampedRate = Number.isFinite(rate) ? Math.min(1, Math.max(0, rate)) : 0;
  const abutsFromLab = Math.round(labFees * clampedRate);
  return {
    labSettlementAmount: Math.max(0, labFees - abutsFromLab),
    abutsRevenueAmount: abutsFromLab + abutment,
    total: labFees + abutment,
  };
};

export const normalizeLabFeeSchedule = (input?: Partial<LabFeeSchedule> | null): LabFeeSchedule => {
  const src = input && typeof input === "object" ? input : {};
  const pick = (key: LabFeeScheduleKey) => {
    const n = Math.round(Number(src[key] ?? LAB_FEE_SCHEDULE_DEFAULTS[key]));
    return Number.isFinite(n) && n >= 0 ? n : LAB_FEE_SCHEDULE_DEFAULTS[key];
  };
  return {
    crown: pick("crown"),
    bridge: pick("bridge"),
    inlay: pick("inlay"),
    retainer: pick("retainer"),
    removableTemp3: pick("removableTemp3"),
    removableTemp6: pick("removableTemp6"),
    customAbutmentDesign: pick("customAbutmentDesign"),
    customAbutmentDesignAndProduction: pick("customAbutmentDesignAndProduction"),
    customAbutmentWithoutJig: pick("customAbutmentWithoutJig"),
  };
};

export const normalizeLabFeeRemakeSchedule = (
  input?: Partial<LabFeeSchedule> | { remake?: Partial<LabFeeSchedule> | null } | null,
): LabFeeSchedule => {
  const raw = input && typeof input === "object" ? input : {};
  const src =
    "remake" in raw && raw.remake && typeof raw.remake === "object"
      ? raw.remake
      : ("enabled" in raw || "updatedAt" in raw
          ? {}
          : (raw as Partial<LabFeeSchedule>));
  const pick = (key: LabFeeScheduleKey) => {
    const n = Math.round(Number(src[key] ?? LAB_FEE_REMAKE_SCHEDULE_DEFAULTS[key]));
    return Number.isFinite(n) && n >= 0 ? n : LAB_FEE_REMAKE_SCHEDULE_DEFAULTS[key];
  };
  return {
    crown: pick("crown"),
    bridge: pick("bridge"),
    inlay: pick("inlay"),
    retainer: pick("retainer"),
    removableTemp3: pick("removableTemp3"),
    removableTemp6: pick("removableTemp6"),
    customAbutmentDesign: pick("customAbutmentDesign"),
    customAbutmentDesignAndProduction: pick("customAbutmentDesignAndProduction"),
    customAbutmentWithoutJig: pick("customAbutmentWithoutJig"),
  };
};

export type AbutmentRetailNote = "quote";

export type PracticeTransferFeeLine = {
  toothNumber: string;
  prosthesisType: string;
  /** 기공비(자동매칭 예산 시 상한) */
  labFee: number;
  /** 자동매칭 예산 하한. 있으면 툴팁에서 하한~상한 표시 */
  labFeeMin?: number;
  labAbutmentFee: number;
  labAbutmentPending?: boolean;
  abutmentRetail: number;
  /** 환봉 단가 0원 — 가격 별도 고지 */
  abutmentRetailNote?: AbutmentRetailNote;
};

/** max 견적 라인에 min 스케줄 labFee를 labFeeMin으로 붙인다(치아·보철 키 매칭). */
export const attachLabFeeMinToLines = (
  maxLines: PracticeTransferFeeLine[],
  minLines: ReadonlyArray<Pick<PracticeTransferFeeLine, "toothNumber" | "prosthesisType" | "labFee">>,
): PracticeTransferFeeLine[] => {
  const minByKey = new Map<string, number>();
  for (const line of minLines) {
    const key = `${String(line.toothNumber || "").trim()}\0${String(line.prosthesisType || "").trim()}`;
    if (!minByKey.has(key)) {
      minByKey.set(key, Math.max(0, Math.round(Number(line.labFee || 0))));
    }
  }
  return maxLines.map((line) => {
    const key = `${String(line.toothNumber || "").trim()}\0${String(line.prosthesisType || "").trim()}`;
    const labFeeMin = minByKey.has(key)
      ? minByKey.get(key)
      : undefined;
    if (labFeeMin == null) return line;
    return { ...line, labFeeMin };
  });
};

export type PracticeTransferRetailFees = {
  labFeeTotal: number;
  labAbutmentTotal: number;
  labAbutmentPending: boolean;
  abutmentRetailTotal: number;
  abutmentQuotePending: boolean;
  abutmentQty: number;
  total: number;
  lines: PracticeTransferFeeLine[];
  labFeeMultiplier?: number;
  rushFeeMultiplier?: number;
};

export const computePracticeTransferRetailFees = (params: {
  toothWorks?: ReadonlyArray<{
    toothNumber?: string;
    tooth?: string;
    prosthesisType?: string;
    type?: string;
    customAbutment?: boolean;
    hasCustomAbutment?: boolean;
    abutmentProductMode?: string;
    productMode?: string;
    bridgeLinkedTeeth?: string[];
    implantType?: string;
    implantManufacturer?: string;
    implantBrand?: string;
    implantFamily?: string;
    roundBar?: boolean;
    roundBarAdopted?: boolean;
    adopted?: boolean;
    adoptedKind?: "cnc" | "round_bar" | "";
    roundBarRequestId?: string;
  }> | null;
  implantFavorites?: ReadonlyArray<ImplantFavoriteForFee> | null;
  labFeeSchedule?: (Partial<LabFeeSchedule> & { items?: LabFeeItem[]; remake?: Partial<LabFeeSchedule> }) | null;
  /** @deprecated 무시. 청구 단일 고시 — PTX는 labFeeSchedule 수가. */
  abutmentPricingTier?: AbutsAbutmentPricingTier | null;
  /** @deprecated 무시. 어벗츠 몫은 Request hold. */
  abutmentPrices?: Partial<AbutsAbutmentCreditPrices> | null;
  remake?: boolean;
  skipAbutmentFees?: boolean;
  labFeeMultiplier?: number;
  rushFeeMultiplier?: number;
}): PracticeTransferRetailFees => {
  const useRemake = Boolean(params.remake);
  const items = normalizeLabFeeItems(params.labFeeSchedule);
  const waiveAbutment = Boolean(useRemake || params.skipAbutmentFees);
  const rows = Array.isArray(params.toothWorks) ? params.toothWorks : [];
  const absorbedNonTemp = absorbedNonTempTeethInTempSpans(rows);
  const lines: PracticeTransferFeeLine[] = [];
  const grouped = new Map<string, { item: LabFeeItem; rows: typeof rows }>();
  let labFeeTotal = 0;
  let labAbutmentTotal = 0;
  let labAbutmentPending = false;
  let abutmentRetailTotal = 0;
  let abutmentQuotePending = false;
  let abutmentQty = 0;

  const abutmentSplitForRow = (row: (typeof rows)[number]) => {
    if (
      waiveAbutment ||
      isFollowUpProsthesisPhase(row) ||
      !isCustomAbutmentWork(row) ||
      isSimpleAbutmentModeForFee(row)
    ) {
      return { abuts: 0, lab: 0, pending: false, quote: false, feeName: "" };
    }
    const feeName = labAbutmentFeeNameForRow(row);
    const lab = resolveLabAbutmentUnitPriceForRow(items, useRemake, row);
    if (isPendingRoundBarAbutment(row, params.implantFavorites)) {
      // 요청중·도입중: 기공소 자체 처리 → 제조사·어벗츠 단가 제외.
      // 기공소 커스텀어벗 수가가 있으면 그 금액(0원이면 미도입 표시·수락 시 기공수가 포워드).
      return {
        abuts: 0,
        lab,
        pending: true,
        quote: false,
        feeName,
      };
    }
    const kind = resolveAdoptedAbutmentKind(row, params.implantFavorites);
    // 치과→기공소 수가. abutmentRetail(어벗츠 몫)은 PTX에서 쓰지 않음.
    return {
      abuts: 0,
      lab,
      pending: false,
      quote: kind === "round_bar" && lab === 0,
      feeName,
    };
  };
  const addAbutment = (split: {
    abuts: number;
    lab: number;
    pending: boolean;
    quote?: boolean;
    feeName?: string;
  }) => {
    if (split.abuts > 0 || split.quote) {
      abutmentRetailTotal += split.abuts;
      abutmentQty += 1;
    }
    if (split.lab > 0) {
      labAbutmentTotal += split.lab;
      labFeeTotal += split.lab;
    }
    if (split.pending) labAbutmentPending = true;
    if (split.quote) abutmentQuotePending = true;
  };
  const retailNote = (split: { quote?: boolean }): AbutmentRetailNote | undefined =>
    split.quote ? "quote" : undefined;
  const abutmentLineType = (split: { feeName?: string }) =>
    split.feeName || LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME;

  for (const row of rows) {
    const toothNumber = String(row?.toothNumber || row?.tooth || "").trim();
    // 작성 중 자리표시(치아 미선택·기본 형태만)는 과금하지 않는다
    if (!/^[1-4][1-8]$/.test(toothNumber)) continue;
    const prosthesisType = String(row?.prosthesisType || row?.type || "").trim();
    if (!prosthesisType) continue;
    if (isMissingToothProsthesisType(prosthesisType)) continue;
    if (absorbedNonTemp.has(toothNumber)) continue;

    if (isCustomAbutmentProsthesisType(prosthesisType)) {
      if (useRemake) {
        if (isSimpleAbutmentModeForFee(row)) continue;
        const remakeFee = resolveLabAbutmentUnitPrice(items, true, false);
        const pending = isPendingRoundBarAbutment(row, params.implantFavorites);
        if (!pending) {
          labFeeTotal += remakeFee;
        } else {
          labAbutmentPending = true;
        }
        lines.push({
          toothNumber,
          prosthesisType: LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_NAME,
          labFee: pending ? 0 : remakeFee,
          labAbutmentFee: 0,
          labAbutmentPending: pending,
          abutmentRetail: 0,
        });
        continue;
      }
      const split = abutmentSplitForRow(row);
      if (
        split.abuts <= 0 &&
        split.lab <= 0 &&
        !split.pending &&
        !split.quote
      ) {
        continue;
      }
      addAbutment(split);
      lines.push({
        toothNumber,
        prosthesisType: abutmentLineType(split),
        labFee: 0,
        labAbutmentFee: split.lab,
        labAbutmentPending: split.pending,
        abutmentRetail: split.abuts,
        abutmentRetailNote: retailNote(split),
      });
      continue;
    }

    const item = findLabFeeItemForProsthesisType(items, prosthesisType);
    if (!item) continue;
    if (item.unit === "perTooth") {
      const labFee = Math.max(
        0,
        Math.round(Number(useRemake ? item.remake : item.price) || 0),
      );
      const split = abutmentSplitForRow(row);
      labFeeTotal += labFee;
      addAbutment(split);
      // 수가표와 같이 보철기공비·커스텀어벗을 별도 줄로 표기
      lines.push({
        toothNumber: feeLineToothLabel(row),
        prosthesisType,
        labFee,
        labAbutmentFee: 0,
        labAbutmentPending: false,
        abutmentRetail: 0,
      });
      if (
        split.abuts > 0 ||
        split.lab > 0 ||
        split.pending ||
        split.quote
      ) {
        lines.push({
          toothNumber: feeLineToothLabel(row),
          prosthesisType: abutmentLineType(split),
          labFee: 0,
          labAbutmentFee: split.lab,
          labAbutmentPending: split.pending,
          abutmentRetail: split.abuts,
          abutmentRetailNote: retailNote(split),
        });
      }
      continue;
    }
    if (!grouped.has(item.id)) grouped.set(item.id, { item, rows: [] });
    grouped.get(item.id)?.rows.push(row);
  }

  for (const { item, rows: groupedRows } of grouped.values()) {
    const spanGroups = isRemovableTempFeeName(item.name)
      ? listTempBridgeFeeGroups(rows)
      : groupRowsForSetFee(groupedRows);
    for (const group of spanGroups) {
      const labFee =
        item.unit === "perSet"
          ? Math.max(0, Math.round(Number(useRemake ? item.remake : item.price) || 0))
          : nTeethFeeForCount(group.teeth.length, item.tiers, useRemake);
      labFeeTotal += labFee;
      const sortedTeeth = sortToothNumbersForFee(group.teeth);
      const splitTempAbutment = isRemovableTempFeeName(item.name);
      if (splitTempAbutment) {
        lines.push({
          toothNumber: sortedTeeth.join(","),
          prosthesisType: `${item.name}${group.suffix} ${group.teeth.length}치`,
          labFee,
          labAbutmentFee: 0,
          labAbutmentPending: false,
          abutmentRetail: 0,
        });
        for (const row of rows) {
          const tooth = String(row?.toothNumber || row?.tooth || "").trim();
          if (!group.teeth.includes(tooth)) continue;
          const split = abutmentSplitForRow(row);
          addAbutment(split);
          if (
            split.abuts <= 0 &&
            split.lab <= 0 &&
            !split.pending &&
            !split.quote
          ) {
            continue;
          }
          lines.push({
            toothNumber: tooth,
            prosthesisType: abutmentLineType(split),
            labFee: 0,
            labAbutmentFee: split.lab,
            labAbutmentPending: split.pending,
            abutmentRetail: split.abuts,
            abutmentRetailNote: retailNote(split),
          });
        }
        continue;
      }
      let groupAbutment = 0;
      let groupLabAbutment = 0;
      let groupPending = false;
      let groupQuote = false;
      for (const row of groupedRows) {
        const tooth = String(row?.toothNumber || row?.tooth || "").trim();
        if (!group.teeth.includes(tooth)) continue;
        const split = abutmentSplitForRow(row);
        addAbutment(split);
        groupAbutment += split.abuts;
        groupLabAbutment += split.lab;
        if (split.pending) groupPending = true;
        if (split.quote) groupQuote = true;
      }
      lines.push({
        toothNumber: sortedTeeth.join(","),
        prosthesisType:
          item.unit === "perSet"
            ? `${item.name}${group.suffix}`
            : `${item.name}${group.suffix} ${group.teeth.length}치`,
        labFee,
        labAbutmentFee: groupLabAbutment,
        labAbutmentPending: groupPending,
        abutmentRetail: groupAbutment,
        abutmentRetailNote: groupQuote && groupAbutment === 0 ? "quote" : undefined,
      });
    }
  }

  return applyRushFeeMultiplierToFees(
    applyLabFeeMultiplierToFees(
      {
        labFeeTotal,
        labAbutmentTotal,
        labAbutmentPending,
        abutmentRetailTotal,
        abutmentQuotePending,
        abutmentQty,
        total: labFeeTotal + abutmentRetailTotal,
        lines: sortPracticeTransferFeeLines(lines),
      },
      params.labFeeMultiplier,
    ),
    params.rushFeeMultiplier,
  );
};

type FeeToothRow = {
  toothNumber?: string;
  tooth?: string;
  prosthesisType?: string;
  type?: string;
  bridgeLinkedTeeth?: string[];
};

function feeRowTooth(row?: FeeToothRow | null) {
  return String(row?.toothNumber || row?.tooth || "").trim();
}

function feeRowType(row?: FeeToothRow | null) {
  return String(row?.prosthesisType || row?.type || "").trim();
}

function isPonticProsthesisType(prosthesisType: string) {
  return /^pontic$/i.test(String(prosthesisType || "").trim());
}

/** 임시치아 브리지 스팬을 잇는 형태(브리지·작업X·레거시 Pontic). 유지장치는 제외 */
function isTempBridgeSpanMemberType(type: string) {
  return (
    isRemovableTempProsthesisType(type) ||
    isPonticProsthesisType(type) ||
    isMissingToothProsthesisType(type) ||
    type === "브리지"
  );
}

function isTempBridgeSpanBillableType(type: string) {
  return (
    isRemovableTempProsthesisType(type) ||
    isPonticProsthesisType(type) ||
    type === "브리지"
  );
}

function listTempBridgeFeeGroups(allRows: ReadonlyArray<FeeToothRow | null | undefined>) {
  const memberRows = (Array.isArray(allRows) ? allRows : []).filter((row): row is FeeToothRow => {
    if (!row) return false;
    const tooth = feeRowTooth(row);
    return /^[1-4][1-8]$/.test(tooth) && isTempBridgeSpanMemberType(feeRowType(row));
  });
  const tempRows = memberRows.filter((row) =>
    isRemovableTempProsthesisType(feeRowType(row)),
  );
  if (tempRows.length === 0) return [] as Array<{ suffix: string; teeth: string[] }>;

  const hasLinks = memberRows.some((row) =>
    (Array.isArray(row?.bridgeLinkedTeeth) ? row.bridgeLinkedTeeth : []).some(
      (value) => String(value || "").trim(),
    ),
  );
  if (!hasLinks) return groupRowsByArch(tempRows);

  const remaining = new Set<string>();
  const byTooth = new Map<string, FeeToothRow>();
  for (const row of memberRows) {
    const tooth = feeRowTooth(row);
    if (!tooth) continue;
    remaining.add(tooth);
    if (!byTooth.has(tooth)) byTooth.set(tooth, row);
  }
  const groups: Array<{ suffix: string; teeth: string[] }> = [];
  while (remaining.size > 0) {
    const start = remaining.values().next().value as string;
    remaining.delete(start);
    const stack = [start];
    const teeth: string[] = [];
    while (stack.length > 0) {
      const cur = stack.pop() as string;
      teeth.push(cur);
      for (const linked of collectLinkedTeethForFee(memberRows, cur)) {
        if (!remaining.has(linked)) continue;
        remaining.delete(linked);
        stack.push(linked);
      }
    }
    const hasTemp = teeth.some((tooth) =>
      isRemovableTempProsthesisType(feeRowType(byTooth.get(tooth))),
    );
    if (!hasTemp) continue;
    const billed = teeth.filter((tooth) =>
      isTempBridgeSpanBillableType(feeRowType(byTooth.get(tooth))),
    );
    if (billed.length === 0) continue;
    const arch = toothArchFromNumber(billed[0] || "");
    groups.push({
      suffix: arch === "upper" ? "(상악)" : arch === "lower" ? "(하악)" : "",
      teeth: billed,
    });
  }
  return groups;
}

function feeLineToothLabel(row: FeeToothRow) {
  const tooth = feeRowTooth(row);
  const type = feeRowType(row);
  if (type === "브리지") {
    const teeth = sortToothNumbersForFee(
      Array.from(
        new Set([
          tooth,
          ...(Array.isArray(row?.bridgeLinkedTeeth)
            ? row.bridgeLinkedTeeth.map((value) => String(value || "").trim())
            : []),
        ].filter((value) => /^[1-4][1-8]$/.test(value))),
      ),
    );
    if (teeth.length >= 2) return teeth.join(",");
  }
  return tooth;
}

function rowCoversToothForFee(row: FeeToothRow, tooth: string) {
  const self = feeRowTooth(row);
  if (self === tooth) return true;
  const linked = Array.isArray(row?.bridgeLinkedTeeth) ? row.bridgeLinkedTeeth : [];
  return linked.some((value) => String(value || "").trim() === tooth);
}

function absorbedNonTempTeethInTempSpans(
  allRows: ReadonlyArray<FeeToothRow | null | undefined>,
) {
  const rows = Array.isArray(allRows) ? allRows.filter(Boolean) as FeeToothRow[] : [];
  const finalRows = rows.filter((row) => isFinalProsthesisType(feeRowType(row)));
  const absorbed = new Set<string>();
  for (const group of listTempBridgeFeeGroups(rows)) {
    for (const tooth of group.teeth) {
      const hasPrimaryFinal = finalRows.some((row) => feeRowTooth(row) === tooth);
      if (hasPrimaryFinal) continue;
      const coveredElsewhere = finalRows.some(
        (row) => feeRowTooth(row) !== tooth && rowCoversToothForFee(row, tooth),
      );
      if (coveredElsewhere) absorbed.add(tooth);
    }
  }
  return absorbed;
}

function groupRowsByArch(rows: ReadonlyArray<FeeToothRow>) {
  const groups = new Map<
    "upper" | "lower" | "other",
    { suffix: string; teeth: string[] }
  >();
  for (const row of rows) {
    const tooth = String(row?.toothNumber || row?.tooth || "").trim();
    const arch = toothArchFromNumber(tooth);
    if (!groups.has(arch)) {
      const suffix =
        arch === "upper" ? "(상악)" : arch === "lower" ? "(하악)" : "";
      groups.set(arch, { suffix, teeth: [] });
    }
    groups.get(arch)?.teeth.push(tooth);
  }
  return [...groups.values()];
}

function getAdjacentTeethForFee(toothNumber: string) {
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
  return [...new Set(out)];
}

function collectLinkedTeethForFee(
  rows: ReadonlyArray<FeeToothRow>,
  toothNumber: string,
) {
  const tooth = String(toothNumber || "").trim();
  const adjacent = new Set(getAdjacentTeethForFee(tooth));
  const byTooth = new Map<string, FeeToothRow>();
  for (const row of rows) {
    const other = String(row?.toothNumber || row?.tooth || "").trim();
    if (other && !byTooth.has(other)) byTooth.set(other, row);
  }
  const links = new Set<string>();
  const self = byTooth.get(tooth);
  for (const linked of Array.isArray(self?.bridgeLinkedTeeth)
    ? self.bridgeLinkedTeeth
    : []) {
    const other = String(linked || "").trim();
    if (adjacent.has(other) && byTooth.has(other)) links.add(other);
  }
  for (const [other, row] of byTooth) {
    if (!other || other === tooth || !adjacent.has(other)) continue;
    const otherLinks = Array.isArray(row?.bridgeLinkedTeeth)
      ? row.bridgeLinkedTeeth
      : [];
    if (otherLinks.some((value) => String(value || "").trim() === tooth)) {
      links.add(other);
    }
  }
  return [...links];
}

/** 연결(+)이 있으면 스팬당 1묶음(perSet·임시치아 구간). 연결 없는 레거시는 악궁당 */
function groupRowsForSetFee(rows: ReadonlyArray<FeeToothRow>) {
  const hasLinks = rows.some((row) =>
    (Array.isArray(row?.bridgeLinkedTeeth) ? row.bridgeLinkedTeeth : []).some(
      (value) => String(value || "").trim(),
    ),
  );
  if (!hasLinks) return groupRowsByArch(rows);

  const remaining = new Set<string>();
  for (const row of rows) {
    const tooth = String(row?.toothNumber || row?.tooth || "").trim();
    if (tooth) remaining.add(tooth);
  }
  const groups: Array<{ suffix: string; teeth: string[] }> = [];
  while (remaining.size > 0) {
    const start = remaining.values().next().value as string;
    remaining.delete(start);
    const stack = [start];
    const teeth: string[] = [];
    while (stack.length > 0) {
      const cur = stack.pop() as string;
      teeth.push(cur);
      for (const linked of collectLinkedTeethForFee(rows, cur)) {
        if (!remaining.has(linked)) continue;
        remaining.delete(linked);
        stack.push(linked);
      }
    }
    const arch = toothArchFromNumber(teeth[0] || "");
    groups.push({
      suffix: arch === "upper" ? "(상악)" : arch === "lower" ? "(하악)" : "",
      teeth,
    });
  }
  return groups;
}

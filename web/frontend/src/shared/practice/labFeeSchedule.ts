// related files:
// - web/backend/utils/labFeeSchedule.js
// - web/frontend/src/shared/pricing/abutsAbutmentService.ts
// - web/frontend/src/shared/practice/practiceTransferFeeQuote.ts
// - web/frontend/src/features/settings/tabs/LabFeeScheduleTab.tsx
// - web/backend/tests/unit/labFeeSchedule.test.js
// - 2026-08-13: 미저장(updatedAt 없음) 기공비는 0원·전부 off. 한 번 저장해야 설정 완료.
// - 2026-08-13: 커스텀어벗 단가는 creditSettings 멤버십/일반값을 우선 사용.
// - 2026-08-13: 유지장치 등 perSet는 연결 스팬당 1세트(끊기면 별도). 연결 없는 레거시는 악궁당.
// - 2026-08-13: 견적 라인은 치아번호 10→20→30→40번대 순.
import {
  normalizeAbutsAbutmentCreditPrices,
  type AbutsAbutmentCreditPrices,
  type AbutsAbutmentPricingTier,
} from "@/shared/pricing/abutsAbutmentService";

export const LAB_FEE_SCHEDULE_KEYS = [
  "crown",
  "bridge",
  "inlay",
  "pontic",
  "retainer",
  "removableTemp3",
  "removableTemp6",
  "customAbutmentDesign",
  "customAbutmentDesignAndProduction",
] as const;

export type LabFeeScheduleKey = (typeof LAB_FEE_SCHEDULE_KEYS)[number];

export type LabFeeSchedule = Record<LabFeeScheduleKey, number>;

/** 운영 디폴트·미설정 수가. 기공소가 한 번 저장하기 전에는 0원 */
export const LAB_FEE_SCHEDULE_DEFAULTS: LabFeeSchedule = {
  crown: 0,
  bridge: 0,
  inlay: 0,
  pontic: 0,
  retainer: 0,
  removableTemp3: 0,
  removableTemp6: 0,
  customAbutmentDesign: 0,
  customAbutmentDesignAndProduction: 0,
};

/** 기공소 미지정(자동매칭) 견적 — 기본수가 없음 */
export const LAB_FEE_SCHEDULE_ZEROS: LabFeeSchedule = {
  ...LAB_FEE_SCHEDULE_DEFAULTS,
};

export const LAB_FEE_SCHEDULE_UNSET_ENABLED: Record<LabFeeScheduleKey, boolean> =
  Object.fromEntries(LAB_FEE_SCHEDULE_KEYS.map((key) => [key, false])) as Record<
    LabFeeScheduleKey,
    boolean
  >;

export const isLabFeeScheduleConfigured = (
  schedule?: { updatedAt?: string | Date | null } | null,
) => {
  const raw = schedule?.updatedAt;
  if (raw == null || raw === "") return false;
  const t = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
  return Number.isFinite(t);
};

export const buildUnsetLabFeeSchedule = () => ({
  ...LAB_FEE_SCHEDULE_ZEROS,
  remake: { ...LAB_FEE_SCHEDULE_ZEROS },
  enabled: { ...LAB_FEE_SCHEDULE_UNSET_ENABLED },
  updatedAt: null as string | Date | null,
});

export const resolveLabFeeScheduleSource = <T extends { updatedAt?: string | Date | null }>(
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
  if (/^pontic$/i.test(prosthesisType)) return false;
  return (
    isCustomAbutmentProsthesisType(prosthesisType) ||
    Boolean(row?.hasCustomAbutment) ||
    Boolean(row?.customAbutment)
  );
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

/** 표시용: 11..18 → 21..28 → 31..38 → 41..48. 아치 순회(18→11)와 분리 */
export const toToothDecadeSortNumber = (toothNumber: string) => {
  const tokens = String(toothNumber || "")
    .split(/[^\d]+/)
    .filter((token) => /^[1-4][1-8]$/.test(token));
  if (tokens.length === 0) return Number.MAX_SAFE_INTEGER;
  return Math.min(...tokens.map(Number));
};

export const sortPracticeTransferFeeLines = <T extends { toothNumber?: string }>(
  lines: ReadonlyArray<T>,
): T[] =>
  lines.slice().sort((a, b) => {
    const diff =
      toToothDecadeSortNumber(String(a.toothNumber || "")) -
      toToothDecadeSortNumber(String(b.toothNumber || ""));
    if (diff !== 0) return diff;
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
  if (/^pontic$/i.test(raw)) return "Pontic";
  if (compact === "브릿지" || compact === "브리지" || /^bridge$/i.test(raw)) return "브리지";
  if (
    compact === "가철성임시치아" ||
    compact === "임시치아" ||
    /가철성\s*임시/i.test(raw)
  ) {
    return "임시치아";
  }
  if (compact === "유지장치" || /^retainer$/i.test(raw)) return "유지장치";
  if (compact === "인레이" || /^inlay$/i.test(raw)) return "인레이";
  if (compact === "크라운" || /^crown$/i.test(raw)) return "크라운";
  return raw;
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
  const unit = normalizeLabFeeItemUnit(src.unit);
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
    { id: "pontic", name: "Pontic", unit: "perTooth", enabled: on("pontic"), price: schedule.pontic, remake: remake.pontic, tiers: [] },
    { id: "retainer", name: "유지장치", unit: "perSet", enabled: on("retainer"), price: schedule.retainer, remake: remake.retainer, tiers: [] },
    {
      id: "temp1",
      name: "임시치아1",
      unit: "perNTeeth",
      enabled: on("removableTemp3"),
      price: schedule.removableTemp3,
      remake: remake.removableTemp3,
      tiers: [{ n: 3, price: schedule.removableTemp3, remake: remake.removableTemp3 }],
    },
    {
      id: "temp2",
      name: "임시치아2",
      unit: "perNTeeth",
      enabled: on("removableTemp6"),
      price: schedule.removableTemp6,
      remake: remake.removableTemp6,
      tiers: [{ n: 6, price: schedule.removableTemp6, remake: remake.removableTemp6 }],
    },
  ];
};

const numberedTempName = (name: string, index: number) => {
  const raw = String(name || "").trim() || "임시치아";
  const compact = raw.replace(/\s+/g, "");
  const base = compact.replace(/\d+$/, "") || "임시치아";
  if (isRemovableTempFeeName(name)) return `${base}${index + 1}`;
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
      const item = normalizeLabFeeItem(row, out.length);
      if (!item.name) continue;
      let id = item.id;
      if (!id || seen.has(id)) id = `item-${out.length + 1}`;
      seen.add(id);
      out.push({ ...item, id });
    }
    return expandPerNTeethTierItems(out);
  }
  return migrateLegacyLabFeeItems(src as Partial<LabFeeSchedule>);
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

/** 보철 형태 → labFeeSchedule 키. 작업X·커스텀어벗(어벗츠 단가)·묶음수가 항목은 null */
export const resolveLabFeeKeyFromProsthesisType = (
  prosthesisType: string,
): LabFeeScheduleKey | null => {
  const raw = String(prosthesisType || "").trim();
  if (!raw) return "crown";
  if (isMissingToothProsthesisType(raw)) return null;
  if (isCustomAbutmentProsthesisType(raw)) return null;
  if (isRetainerProsthesisType(raw)) return "retainer";
  if (isRemovableTempProsthesisType(raw)) return null;
  if (/^pontic$/i.test(raw)) return "pontic";
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

export const resolveAbutsAbutmentUnitPrice = (args: {
  productMode?: string | null;
  pricingTier?: AbutsAbutmentPricingTier | null;
  prices?: Partial<AbutsAbutmentCreditPrices> | null;
}) => {
  const prices = normalizeAbutsAbutmentCreditPrices(args.prices);
  const isDesign = String(args.productMode || "").trim() === "design_custom_abutment";
  const membership = args.pricingTier === "membership";
  if (isDesign) {
    return membership
      ? prices.membershipDesignAndProductionPrice
      : prices.regularDesignAndProductionPrice;
  }
  return membership
    ? prices.membershipProductionPrice
    : prices.regularProductionPrice;
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
    pontic: pick("pontic"),
    retainer: pick("retainer"),
    removableTemp3: pick("removableTemp3"),
    removableTemp6: pick("removableTemp6"),
    customAbutmentDesign: pick("customAbutmentDesign"),
    customAbutmentDesignAndProduction: pick("customAbutmentDesignAndProduction"),
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
    pontic: pick("pontic"),
    retainer: pick("retainer"),
    removableTemp3: pick("removableTemp3"),
    removableTemp6: pick("removableTemp6"),
    customAbutmentDesign: pick("customAbutmentDesign"),
    customAbutmentDesignAndProduction: pick("customAbutmentDesignAndProduction"),
  };
};

export type PracticeTransferFeeLine = {
  toothNumber: string;
  prosthesisType: string;
  labFee: number;
  abutmentRetail: number;
};

export type PracticeTransferRetailFees = {
  labFeeTotal: number;
  abutmentRetailTotal: number;
  abutmentQty: number;
  total: number;
  lines: PracticeTransferFeeLine[];
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
  }> | null;
  labFeeSchedule?: (Partial<LabFeeSchedule> & { items?: LabFeeItem[]; remake?: Partial<LabFeeSchedule> }) | null;
  abutmentPricingTier?: AbutsAbutmentPricingTier | null;
  abutmentPrices?: Partial<AbutsAbutmentCreditPrices> | null;
  remake?: boolean;
  skipAbutmentFees?: boolean;
}): PracticeTransferRetailFees => {
  const useRemake = Boolean(params.remake);
  const items = normalizeLabFeeItems(params.labFeeSchedule);
  const remakeSchedule = normalizeLabFeeRemakeSchedule(params.labFeeSchedule);
  const waiveAbutment = Boolean(useRemake || params.skipAbutmentFees);
  const pricingTier: AbutsAbutmentPricingTier =
    params.abutmentPricingTier === "membership" ? "membership" : "regular";
  const rows = Array.isArray(params.toothWorks) ? params.toothWorks : [];
  const lines: PracticeTransferFeeLine[] = [];
  const grouped = new Map<string, { item: LabFeeItem; rows: typeof rows }>();
  let labFeeTotal = 0;
  let abutmentRetailTotal = 0;
  let abutmentQty = 0;

  const abutmentFeeForRow = (row: (typeof rows)[number]) => {
    if (waiveAbutment || !isCustomAbutmentWork(row)) return 0;
    return resolveAbutsAbutmentUnitPrice({
      productMode: row?.abutmentProductMode || row?.productMode,
      pricingTier,
      prices: params.abutmentPrices,
    });
  };
  const addAbutment = (abutmentFee: number) => {
    if (abutmentFee > 0) {
      abutmentRetailTotal += abutmentFee;
      abutmentQty += 1;
    }
  };

  for (const row of rows) {
    const prosthesisType = String(row?.prosthesisType || row?.type || "").trim();
    if (!prosthesisType) continue;
    if (isMissingToothProsthesisType(prosthesisType)) continue;

    if (isCustomAbutmentProsthesisType(prosthesisType)) {
      if (useRemake) {
        const feeKey = resolveRemakeLabFeeKey(row);
        if (!feeKey) continue;
        const labFee = Math.max(0, Math.round(Number(remakeSchedule[feeKey] || 0)));
        labFeeTotal += labFee;
        lines.push({
          toothNumber: String(row?.toothNumber || row?.tooth || "").trim(),
          prosthesisType,
          labFee,
          abutmentRetail: 0,
        });
        continue;
      }
      const abutmentFee = abutmentFeeForRow(row);
      addAbutment(abutmentFee);
      lines.push({
        toothNumber: String(row?.toothNumber || row?.tooth || "").trim(),
        prosthesisType,
        labFee: 0,
        abutmentRetail: abutmentFee,
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
      const abutmentFee = abutmentFeeForRow(row);
      labFeeTotal += labFee;
      addAbutment(abutmentFee);
      lines.push({
        toothNumber: String(row?.toothNumber || row?.tooth || "").trim(),
        prosthesisType,
        labFee,
        abutmentRetail: abutmentFee,
      });
      continue;
    }
    if (!grouped.has(item.id)) grouped.set(item.id, { item, rows: [] });
    grouped.get(item.id)?.rows.push(row);
  }

  for (const { item, rows: groupedRows } of grouped.values()) {
    for (const group of item.unit === "perSet"
      ? groupRowsForSetFee(groupedRows)
      : groupRowsByArch(groupedRows)) {
      const labFee =
        item.unit === "perSet"
          ? Math.max(0, Math.round(Number(useRemake ? item.remake : item.price) || 0))
          : nTeethFeeForCount(group.teeth.length, item.tiers, useRemake);
      labFeeTotal += labFee;
      let groupAbutment = 0;
      for (const row of groupedRows) {
        const tooth = String(row?.toothNumber || row?.tooth || "").trim();
        if (!group.teeth.includes(tooth)) continue;
        const abutmentFee = abutmentFeeForRow(row);
        addAbutment(abutmentFee);
        groupAbutment += abutmentFee;
      }
      const sortedTeeth = sortToothNumbersForFee(group.teeth);
      lines.push({
        toothNumber: sortedTeeth.join(","),
        prosthesisType:
          item.unit === "perSet"
            ? `${item.name}${group.suffix}`
            : `${item.name}${group.suffix} ${group.teeth.length}치`,
        labFee,
        abutmentRetail: groupAbutment,
      });
    }
  }

  return {
    labFeeTotal,
    abutmentRetailTotal,
    abutmentQty,
    total: labFeeTotal + abutmentRetailTotal,
    lines: sortPracticeTransferFeeLines(lines),
  };
};

type FeeToothRow = {
  toothNumber?: string;
  tooth?: string;
  bridgeLinkedTeeth?: string[];
};

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

/** 연결(+)이 있으면 스팬당 1세트. 연결 정보 없는 레거시는 악궁당 1세트 */
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

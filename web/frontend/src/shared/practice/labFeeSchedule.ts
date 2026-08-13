// related files:
// - web/backend/utils/labFeeSchedule.js
// - web/frontend/src/shared/pricing/abutsAbutmentService.ts
// - web/frontend/src/shared/practice/practiceTransferFeeQuote.ts
// - web/frontend/src/features/settings/tabs/LabFeeScheduleTab.tsx
import {
  ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE,
  ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE,
  ABUTS_ABUTMENT_REGULAR_DESIGN_AND_PRODUCTION_PRICE,
  ABUTS_ABUTMENT_REGULAR_PRODUCTION_PRICE,
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

export const LAB_FEE_SCHEDULE_DEFAULTS: LabFeeSchedule = {
  crown: 60000,
  bridge: 60000,
  inlay: 50000,
  pontic: 40000,
  retainer: 40000,
  removableTemp3: 30000,
  removableTemp6: 50000,
  customAbutmentDesign: 10000,
  customAbutmentDesignAndProduction: 35000,
};

/** 기공소 미지정(자동매칭) 견적 — 기본수가 없음 */
export const LAB_FEE_SCHEDULE_ZEROS: LabFeeSchedule = {
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

export const toothArchFromNumber = (toothNumber: string) => {
  const n = String(toothNumber || "").replace(/\D/g, "");
  const first = n[0];
  if (first === "1" || first === "2") return "upper" as const;
  if (first === "3" || first === "4") return "lower" as const;
  return "other" as const;
};

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
  const remake = normalizeLabFeeRemakeSchedule(input);
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
      id: "temp",
      name: "임시치아",
      unit: "perNTeeth",
      enabled: on("removableTemp3") || on("removableTemp6"),
      price: schedule.removableTemp3,
      remake: remake.removableTemp3,
      tiers: [
        { n: 3, price: schedule.removableTemp3, remake: remake.removableTemp3 },
        { n: 6, price: schedule.removableTemp6, remake: remake.removableTemp6 },
      ],
    },
  ];
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
    return out;
  }
  return migrateLegacyLabFeeItems(src as Partial<LabFeeSchedule>);
};

export const findLabFeeItemForProsthesisType = (
  items: LabFeeItem[] | null | undefined,
  prosthesisType: string,
) => {
  const canon = canonicalizeFeeItemName(prosthesisType);
  if (!canon) return null;
  return (
    (Array.isArray(items) ? items : []).find(
      (item) => item.enabled !== false && canonicalizeFeeItemName(item.name) === canon,
    ) || null
  );
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
  if (isCustomAbutmentWork(row)) {
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
}) => {
  const isDesign = String(args.productMode || "").trim() === "design_custom_abutment";
  const membership = args.pricingTier === "membership";
  if (isDesign) {
    return membership
      ? ABUTS_ABUTMENT_MEMBERSHIP_DESIGN_AND_PRODUCTION_PRICE
      : ABUTS_ABUTMENT_REGULAR_DESIGN_AND_PRODUCTION_PRICE;
  }
  return membership
    ? ABUTS_ABUTMENT_MEMBERSHIP_PRODUCTION_PRICE
    : ABUTS_ABUTMENT_REGULAR_PRODUCTION_PRICE;
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
  }> | null;
  labFeeSchedule?: (Partial<LabFeeSchedule> & { items?: LabFeeItem[]; remake?: Partial<LabFeeSchedule> }) | null;
  abutmentPricingTier?: AbutsAbutmentPricingTier | null;
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

  for (const row of rows) {
    const prosthesisType = String(row?.prosthesisType || row?.type || "").trim();
    if (!prosthesisType) continue;
    if (isMissingToothProsthesisType(prosthesisType)) continue;

    if (!useRemake && isCustomAbutmentWork(row)) {
      const abutmentFee = waiveAbutment
        ? 0
        : resolveAbutsAbutmentUnitPrice({
            productMode: row?.abutmentProductMode || row?.productMode,
            pricingTier,
          });
      if (abutmentFee > 0) {
        abutmentRetailTotal += abutmentFee;
        abutmentQty += 1;
      }
      lines.push({
        toothNumber: String(row?.toothNumber || row?.tooth || "").trim(),
        prosthesisType,
        labFee: 0,
        abutmentRetail: abutmentFee,
      });
      continue;
    }

    if (useRemake && isCustomAbutmentWork(row)) {
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

    const item = findLabFeeItemForProsthesisType(items, prosthesisType);
    if (!item) continue;
    if (item.unit === "perTooth") {
      const labFee = Math.max(
        0,
        Math.round(Number(useRemake ? item.remake : item.price) || 0),
      );
      labFeeTotal += labFee;
      lines.push({
        toothNumber: String(row?.toothNumber || row?.tooth || "").trim(),
        prosthesisType,
        labFee,
        abutmentRetail: 0,
      });
      continue;
    }
    if (!grouped.has(item.id)) grouped.set(item.id, { item, rows: [] });
    grouped.get(item.id)?.rows.push(row);
  }

  for (const { item, rows: groupedRows } of grouped.values()) {
    for (const group of groupRowsByArch(groupedRows)) {
      const labFee =
        item.unit === "perSet"
          ? Math.max(0, Math.round(Number(useRemake ? item.remake : item.price) || 0))
          : nTeethFeeForCount(group.teeth.length, item.tiers, useRemake);
      labFeeTotal += labFee;
      lines.push({
        toothNumber: group.teeth.join(","),
        prosthesisType:
          item.unit === "perSet"
            ? `${item.name}${group.suffix}`
            : `${item.name}${group.suffix} ${group.teeth.length}치`,
        labFee,
        abutmentRetail: 0,
      });
    }
  }

  return {
    labFeeTotal,
    abutmentRetailTotal,
    abutmentQty,
    total: labFeeTotal + abutmentRetailTotal,
    lines,
  };
};

function groupRowsByArch(
  rows: ReadonlyArray<{ toothNumber?: string; tooth?: string }>,
) {
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

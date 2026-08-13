// related files:
// - web/backend/rules.md
// - web/backend/models/businessAnchor.model.js
// - web/backend/utils/abutsAbutmentService.js
// - web/backend/utils/creditSettingsDefaults.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
import {
  resolveAbutsAbutmentPricingTier,
  resolveAbutsAbutmentUnitPrice,
} from "./abutsAbutmentService.js";

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
];

export const LAB_FEE_SCHEDULE_DEFAULTS = {
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

/** 리메이크 수가. 미설정 시 0원(기공소가 항목별로 지정) */
export const LAB_FEE_REMAKE_SCHEDULE_DEFAULTS = Object.fromEntries(
  LAB_FEE_SCHEDULE_KEYS.map((key) => [key, 0]),
);

/** 기공소 미지정(자동매칭) 견적 — 기본수가 없음(0원). 기공소 스케줄이 있을 때만 청구. */
export const LAB_FEE_SCHEDULE_ZEROS = Object.fromEntries(
  LAB_FEE_SCHEDULE_KEYS.map((key) => [key, 0]),
);

/** 항목별 서비스 제공 여부. 미설정 시 전부 제공(true) */
export const LAB_FEE_SCHEDULE_ENABLED_DEFAULTS = Object.fromEntries(
  LAB_FEE_SCHEDULE_KEYS.map((key) => [key, true]),
);

export const LAB_TRADING_PARTNER_WINDOW_DAYS = 60;

export const LAB_FEE_ITEM_UNITS = ["perTooth", "perNTeeth", "perSet"];
export const LAB_FEE_ITEM_UNIT_LABELS = {
  perTooth: "치아 1개당",
  perNTeeth: "치아 n개당",
  perSet: "1세트당",
};
export const MAX_LAB_FEE_ITEMS = 40;
export const MAX_LAB_FEE_ITEM_TIERS = 8;

export function isMissingToothProsthesisType(prosthesisType) {
  const raw = String(prosthesisType || "").trim();
  const compact = raw.replace(/\s+/g, "");
  return (
    raw === "작업X" ||
    raw === "상실치" ||
    compact.toLowerCase() === "작업x" ||
    /^missing(?:tooth)?$/i.test(compact)
  );
}

export function isCustomAbutmentProsthesisType(prosthesisType) {
  const raw = String(prosthesisType || "").trim();
  const compact = raw.replace(/\s+/g, "");
  return (
    compact === "커스텀어벗" ||
    /^(?:커스텀)?어벗디자인$/i.test(compact) ||
    /^custom\s*abut(?:ment)?$/i.test(raw)
  );
}

export function isCustomAbutmentWork(row) {
  const prosthesisType = String(row?.prosthesisType || row?.type || "").trim();
  if (!prosthesisType || isMissingToothProsthesisType(prosthesisType)) {
    return false;
  }
  if (/^pontic$/i.test(prosthesisType)) return false;
  return (
    isCustomAbutmentProsthesisType(prosthesisType) ||
    Boolean(row?.hasCustomAbutment) ||
    Boolean(row?.customAbutment)
  );
}

export function isRetainerProsthesisType(prosthesisType) {
  const raw = String(prosthesisType || "").trim();
  const compact = raw.replace(/\s+/g, "");
  return compact === "유지장치" || /^retainer$/i.test(raw);
}

export function isRemovableTempProsthesisType(prosthesisType) {
  const raw = String(prosthesisType || "").trim();
  const compact = raw.replace(/\s+/g, "");
  return (
    compact === "가철성임시치아" ||
    compact === "임시치아" ||
    /가철성\s*임시/i.test(raw)
  );
}

export function toothArchFromNumber(toothNumber) {
  const n = String(toothNumber || "").replace(/\D/g, "");
  const first = n[0];
  if (first === "1" || first === "2") return "upper";
  if (first === "3" || first === "4") return "lower";
  return "other";
}

export function removableTempFeeForCount(count, price3, price6) {
  let left = Math.max(0, Math.round(Number(count || 0)));
  const p3 = Math.max(0, Math.round(Number(price3 || 0)));
  const p6 = Math.max(0, Math.round(Number(price6 || 0)));
  let total = 0;
  while (left > 0) {
    if (left <= 3) {
      total += p3;
      break;
    }
    total += p6;
    if (left <= 6) break;
    left -= 6;
  }
  return total;
}

/** 보철 형태 → labFeeSchedule 키. 작업X·커스텀어벗(어벗츠 단가)·묶음수가 항목은 null */
export function resolveLabFeeKeyFromProsthesisType(prosthesisType) {
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
}

export function prosthesisIncludesCustomAbutment(prosthesisType) {
  return isCustomAbutmentProsthesisType(prosthesisType);
}

/** 리메이크 수가 키. 커스텀어벗은 디자인/디자인+생산, 그 외는 보철 키 */
export function resolveRemakeLabFeeKey(row) {
  const prosthesisType = String(row?.prosthesisType || row?.type || "").trim();
  if (!prosthesisType || isMissingToothProsthesisType(prosthesisType)) {
    return null;
  }
  if (isCustomAbutmentWork(row)) {
    const mode = String(
      row?.abutmentProductMode || row?.productMode || "",
    ).trim();
    if (
      mode === "design_custom_abutment" ||
      /어벗\s*디자인/i.test(prosthesisType)
    ) {
      return "customAbutmentDesign";
    }
    return "customAbutmentDesignAndProduction";
  }
  return resolveLabFeeKeyFromProsthesisType(prosthesisType);
}

export function splitPracticeTransferSettlement({
  labFeeTotal,
  abutmentRetailTotal,
  feeRateApplied,
}) {
  const labFees = Math.max(0, Math.round(Number(labFeeTotal || 0)));
  const abutment = Math.max(0, Math.round(Number(abutmentRetailTotal || 0)));
  const rate = Number(feeRateApplied || 0);
  const clampedRate = Number.isFinite(rate) ? Math.min(1, Math.max(0, rate)) : 0;
  const abutsFromLab = Math.round(labFees * clampedRate);
  return {
    labSettlementAmount: Math.max(0, labFees - abutsFromLab),
    abutsRevenueAmount: abutsFromLab + abutment,
    total: labFees + abutment,
  };
}

export function normalizeLabFeeSchedule(input) {
  const src = input && typeof input === "object" ? input : {};
  const pick = (key) => {
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
    customAbutmentDesignAndProduction: pick(
      "customAbutmentDesignAndProduction",
    ),
  };
}

/** labFeeSchedule.remake — 항목별 리메이크 수가(원). 미설정 0 */
export function normalizeLabFeeRemakeSchedule(input) {
  const raw = input && typeof input === "object" ? input : {};
  const src =
    raw.remake && typeof raw.remake === "object"
      ? raw.remake
      : "enabled" in raw || "updatedAt" in raw
        ? {}
        : raw;
  const pick = (key) => {
    const n = Math.round(
      Number(src[key] ?? LAB_FEE_REMAKE_SCHEDULE_DEFAULTS[key]),
    );
    return Number.isFinite(n) && n >= 0
      ? n
      : LAB_FEE_REMAKE_SCHEDULE_DEFAULTS[key];
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
    customAbutmentDesignAndProduction: pick(
      "customAbutmentDesignAndProduction",
    ),
  };
}

/** labFeeSchedule.enabled — 제공하지 않는 항목은 false */
export function normalizeLabFeeScheduleEnabled(input) {
  const src =
    input && typeof input === "object"
      ? input.enabled && typeof input.enabled === "object"
        ? input.enabled
        : input
      : {};
  const out = {};
  for (const key of LAB_FEE_SCHEDULE_KEYS) {
    if (typeof src[key] === "boolean") {
      out[key] = src[key];
    } else if (src[key] === 0 || src[key] === "0" || src[key] === "false") {
      out[key] = false;
    } else if (src[key] === 1 || src[key] === "1" || src[key] === "true") {
      out[key] = true;
    } else {
      out[key] = LAB_FEE_SCHEDULE_ENABLED_DEFAULTS[key];
    }
  }
  return out;
}

/**
 * toothWorks 행 기준 기공비·어벗츠 커스텀어벗 단가 합산.
 * 커스텀어벗은 기공소 수가가 아니라 어벗츠 멤버십/일반 단가.
 * @returns {{ labFeeTotal, abutmentRetailTotal, abutmentQty, total, lines }}
 */
export function computePracticeTransferRetailFees({
  toothWorks,
  labFeeSchedule,
  abutmentPricingTier,
  skipAbutmentFees = false,
  remake = false,
}) {
  const useRemake = Boolean(remake);
  const schedule = useRemake
    ? normalizeLabFeeRemakeSchedule(labFeeSchedule)
    : normalizeLabFeeSchedule(labFeeSchedule);
  const waiveAbutment = useRemake || Boolean(skipAbutmentFees);
  const pricingTier =
    abutmentPricingTier === "membership" ? "membership" : "regular";
  const rows = Array.isArray(toothWorks) ? toothWorks : [];
  const lines = [];
  const retainerRows = [];
  const removableRows = [];
  let labFeeTotal = 0;
  let abutmentRetailTotal = 0;
  let abutmentQty = 0;

  for (const row of rows) {
    const prosthesisType = String(
      row?.prosthesisType || row?.type || "",
    ).trim();
    if (!prosthesisType) continue;
    if (isMissingToothProsthesisType(prosthesisType)) continue;
    if (isRetainerProsthesisType(prosthesisType)) {
      retainerRows.push(row);
      continue;
    }
    if (isRemovableTempProsthesisType(prosthesisType)) {
      removableRows.push(row);
      continue;
    }

    let labFee = 0;
    let abutmentFee = 0;
    if (useRemake) {
      const feeKey = resolveRemakeLabFeeKey(row);
      if (!feeKey) continue;
      labFee = Math.max(0, Math.round(Number(schedule[feeKey] || 0)));
    } else if (isCustomAbutmentWork(row)) {
      abutmentFee = waiveAbutment
        ? 0
        : resolveAbutsAbutmentUnitPrice({
            productMode: row?.abutmentProductMode || row?.productMode,
            pricingTier,
          });
    } else {
      const feeKey = resolveLabFeeKeyFromProsthesisType(prosthesisType);
      if (!feeKey) continue;
      labFee = Math.max(0, Math.round(Number(schedule[feeKey] || 0)));
    }

    labFeeTotal += labFee;
    if (abutmentFee > 0) {
      abutmentRetailTotal += abutmentFee;
      abutmentQty += 1;
    }
    lines.push({
      toothNumber: String(row?.toothNumber || row?.tooth || "").trim(),
      prosthesisType,
      labFee,
      abutmentRetail: abutmentFee,
    });
  }

  for (const group of groupRowsByArch(retainerRows)) {
    const fee = Math.max(0, Math.round(Number(schedule.retainer || 0)));
    labFeeTotal += fee;
    lines.push({
      toothNumber: group.teeth.join(","),
      prosthesisType: `유지장치${group.suffix}`,
      labFee: fee,
      abutmentRetail: 0,
    });
  }

  for (const group of groupRowsByArch(removableRows)) {
    const fee = removableTempFeeForCount(
      group.teeth.length,
      schedule.removableTemp3,
      schedule.removableTemp6,
    );
    labFeeTotal += fee;
    lines.push({
      toothNumber: group.teeth.join(","),
      prosthesisType: `임시치아${group.suffix} ${group.teeth.length}치`,
      labFee: fee,
      abutmentRetail: 0,
    });
  }

  return {
    labFeeTotal,
    abutmentRetailTotal,
    abutmentQty,
    total: labFeeTotal + abutmentRetailTotal,
    lines,
  };
}

function groupRowsByArch(rows) {
  const groups = new Map();
  for (const row of rows) {
    const tooth = String(row?.toothNumber || row?.tooth || "").trim();
    const arch = toothArchFromNumber(tooth);
    if (!groups.has(arch)) {
      const suffix =
        arch === "upper" ? "(상악)" : arch === "lower" ? "(하악)" : "";
      groups.set(arch, { suffix, teeth: [] });
    }
    groups.get(arch).teeth.push(tooth);
  }
  return [...groups.values()];
}

export { resolveAbutsAbutmentPricingTier, resolveAbutsAbutmentUnitPrice };

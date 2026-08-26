// related files:
// - web/backend/rules.md
// - web/backend/models/businessAnchor.model.js
// - web/backend/utils/abutsAbutmentService.js
// - web/backend/utils/creditSettingsDefaults.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/frontend/src/shared/practice/labFeeSchedule.ts
// - web/frontend/src/shared/components/practice/PracticeTransferFeeEstimate.tsx
// - web/backend/utils/roundBarAbutment.js
// - web/frontend/src/features/settings/tabs/LabFeeScheduleTab.tsx
// - 2026-08-26: 미도입(요청중·도입중)도 기공소 커스텀어벗 수가를 합산(0원이면 미도입·수락 시 기공수가 포워드).
// - 2026-08-25: 단독「커스텀어벗」은 심플이어도 지그제외 수가 대상. 크라운+심플만 수가 제외.
// - 2026-08-25: 심플어벗(치과 재고)은 기공소 어벗 수가·견적에서 제외. 스캔바디 커스텀어벗만 과금.
// - 2026-08-13: 마스터 active(기본 off)가 켜져야 설정 완료. 수가 디폴트는 기본값·항목 on.
// - 2026-08-21: 기공수가「배송비」폐지(치과→기공소 무료). normalize에서 strip. 어벗츠 구간만 박스당.
// - 2026-08-25: 기존 수가에 없던 CA·카탈로그 신규 항목은 Off 시드 + needSetupNames로 기공소 옵트인 안내.
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
// - 2026-08-14: 환봉 단가 0원은 별도 고지(abutmentRetailNote=quote).
// - 2026-08-14: 환봉 요청중·도입·CNC PTX CA 모두 기공소 어벗 수가.
// - 2026-08-17: 신속처리 rushFeeMultiplier — 기공비·기공소 어벗 모두 배수.
// - 2026-08-14: 치과별 기공수가 할증(labFeeMultiplier). 기공비·기공소 어벗만 배수.
// - 2026-08-14: 할증 updatedAt — 의뢰 createdAt 이후 적용분은 해당 건에 소급하지 않음.
// - 2026-08-15: 치아번호 없는 자리표시 행(빈 toothNumber+기본 크라운)은 견적에서 제외.
// - 2026-08-15: 할증 history — 배수 변경·해제(1x)도 기존 의뢰는 당시 배수 유지(다음 건부터).
// - 2026-08-19: 수락·견적 readyToCharge — 마스터 On만으로는 부족, 제공 항목 수가 필요.
import { applyRushFeeMultiplierToFees } from "./practiceTransferRush.js";
import {
  IMPLANT_ADD_REQUEST_OPTION,
  MANUFACTURER_ADD_REQUEST_BRAND,
} from "./roundBarAbutment.js";

export {
  PRACTICE_RUSH_FEE_MULTIPLIER,
  PRACTICE_RUSH_ARRIVAL_BUSINESS_DAYS,
  PRACTICE_NORMAL_MIN_WORK_PLUS_SHIP_DAYS,
  normalizeConfiguredRushFeeMultiplier,
  normalizeRushFeeMultiplier,
  resolveRushFeeMultiplier,
  isPracticeTransferRushProcessing,
  applyRushFeeMultiplierToFees,
} from "./practiceTransferRush.js";

/** 기공수가 할증 배수. 1=없음, 최대 5, 소수 둘째 자리. */
export function normalizeLabFeeMultiplier(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 1) return 1;
  return Math.min(5, Math.round(n * 100) / 100);
}

const toTimeMs = (value) => {
  if (value == null || value === "") return NaN;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : NaN;
};

/** history 항목 정규화. at 없는 항목은 제외. */
function normalizeLabFeeMultiplierHistory(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const entry of list) {
    const atMs = toTimeMs(entry?.at ?? entry?.updatedAt);
    if (!Number.isFinite(atMs)) continue;
    out.push({
      multiplier: normalizeLabFeeMultiplier(entry?.multiplier),
      at: new Date(atMs),
    });
  }
  out.sort((a, b) => a.at.getTime() - b.at.getTime());
  return out;
}

/**
 * as-of용 이벤트 목록.
 * history가 있으면 그대로. 없으면 레거시 updatedAt 한 건으로 시드.
 */
function labFeeMultiplierEventsForRow(row) {
  const history = normalizeLabFeeMultiplierHistory(row?.history);
  if (history.length > 0) return history;
  const appliedMs = toTimeMs(row?.updatedAt);
  if (!Number.isFinite(appliedMs)) return [];
  return [
    {
      multiplier: normalizeLabFeeMultiplier(row?.multiplier),
      at: new Date(appliedMs),
    },
  ];
}

/** lab.labPracticeFeeMultipliers에서 치과별 배수 조회(현재 live). */
export function resolveLabPracticeFeeMultiplier(labDoc, practiceAnchorId) {
  const practiceId = String(practiceAnchorId || "").trim();
  if (!practiceId) return 1;
  const rows = Array.isArray(labDoc?.labPracticeFeeMultipliers)
    ? labDoc.labPracticeFeeMultipliers
    : [];
  for (const row of rows) {
    if (String(row?.practiceAnchorId || "") === practiceId) {
      return normalizeLabFeeMultiplier(row?.multiplier);
    }
  }
  return 1;
}

/**
 * 의뢰 시점 기준 할증.
 * history에서 asOf 이하 최신 배수를 쓴다(변경·1x 해제도 기존 건 소급 금지).
 * history 없는 레거시: updatedAt > asOf 이면 미적용, 아니면 현재 배수.
 */
export function resolveLabPracticeFeeMultiplierAsOf(
  labDoc,
  practiceAnchorId,
  asOf,
) {
  const practiceId = String(practiceAnchorId || "").trim();
  if (!practiceId) return 1;
  const asOfMs = toTimeMs(asOf);
  const rows = Array.isArray(labDoc?.labPracticeFeeMultipliers)
    ? labDoc.labPracticeFeeMultipliers
    : [];
  for (const row of rows) {
    if (String(row?.practiceAnchorId || "") !== practiceId) continue;
    const events = labFeeMultiplierEventsForRow(row);
    if (events.length > 0 && Number.isFinite(asOfMs)) {
      let effective = 1;
      for (const event of events) {
        if (event.at.getTime() <= asOfMs) {
          effective = event.multiplier;
        } else {
          break;
        }
      }
      return effective;
    }
    // 레거시(history·updatedAt 없음): 현재 배수. updatedAt 이후 적용분은 위에서 처리.
    const m = normalizeLabFeeMultiplier(row?.multiplier);
    if (m <= 1) return 1;
    const appliedMs = toTimeMs(row?.updatedAt);
    if (
      Number.isFinite(asOfMs) &&
      Number.isFinite(appliedMs) &&
      appliedMs > asOfMs
    ) {
      return 1;
    }
    return m;
  }
  return 1;
}

/**
 * 목록 upsert.
 * 배수 변경마다 history에 남긴다. 1x 해제해도 과거 할증 이력이 있으면 행을 유지(as-of용).
 */
export function upsertLabPracticeFeeMultiplierList(
  existing,
  practiceAnchorId,
  multiplier,
  { updatedAt = new Date() } = {},
) {
  const practiceId = String(practiceAnchorId || "").trim();
  const m = normalizeLabFeeMultiplier(multiplier);
  const appliedAt =
    updatedAt instanceof Date
      ? updatedAt
      : Number.isFinite(toTimeMs(updatedAt))
        ? new Date(updatedAt)
        : new Date();
  const existingRows = Array.isArray(existing) ? existing : [];
  const prev = existingRows.find(
    (row) => String(row?.practiceAnchorId || "").trim() === practiceId,
  );
  const rows = existingRows
    .filter((row) => String(row?.practiceAnchorId || "").trim() !== practiceId)
    .map((row) => {
      const history = labFeeMultiplierEventsForRow(row);
      const current = normalizeLabFeeMultiplier(row.multiplier);
      return {
        practiceAnchorId: row.practiceAnchorId,
        multiplier: current,
        updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
        history,
      };
    })
    .filter(
      (row) =>
        row.practiceAnchorId &&
        (row.multiplier > 1 || row.history.some((h) => h.multiplier > 1)),
    );

  if (!practiceId) return rows;

  let history = labFeeMultiplierEventsForRow(prev);
  const last = history[history.length - 1];
  const changed = !last || last.multiplier !== m;
  if (changed) {
    history = [...history, { multiplier: m, at: appliedAt }];
  } else if (history.length === 0 && m > 1) {
    history = [{ multiplier: m, at: appliedAt }];
  }

  const keep = m > 1 || history.some((h) => h.multiplier > 1);
  if (keep) {
    rows.push({
      practiceAnchorId: practiceId,
      multiplier: m,
      updatedAt: appliedAt,
      history,
    });
  }
  return rows;
}

/** 기공비·기공소 어벗 라인/합계에만 배수 적용. 어벗츠 어벗 단가는 유지. */
export function applyLabFeeMultiplierToFees(fees, labFeeMultiplier) {
  const m = normalizeLabFeeMultiplier(labFeeMultiplier);
  const base = fees && typeof fees === "object" ? fees : {};
  if (m === 1) {
    return {
      ...base,
      labFeeMultiplier: 1,
    };
  }
  const scale = (n) => Math.max(0, Math.round(Number(n || 0) * m));
  const labFeeTotal = scale(base.labFeeTotal);
  const labAbutmentTotal = scale(base.labAbutmentTotal);
  const abutmentRetailTotal = Math.max(
    0,
    Math.round(Number(base.abutmentRetailTotal || 0)),
  );
  return {
    ...base,
    labFeeTotal,
    labAbutmentTotal,
    abutmentRetailTotal,
    total: labFeeTotal + abutmentRetailTotal,
    lines: (Array.isArray(base.lines) ? base.lines : []).map((line) => ({
      ...line,
      labFee: scale(line?.labFee),
      labAbutmentFee: scale(line?.labAbutmentFee),
    })),
    labFeeMultiplier: m,
  };
}

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
];

/** 기공소 커스텀어벗 수가 항목명. 지그포함=보철+어벗, 지그제외=단독 커스텀어벗. */
export const LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME = "커스텀어벗(지그포함)";
export const LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_NAME = "커스텀어벗(지그제외)";
export const LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_DEFAULT_PRICE = 40000;
export const LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_DEFAULT_PRICE = 30000;

/** 기공비 기본 수가(원). 마스터 스위치가 꺼져 있으면 청구하지 않는다. */
export const LAB_FEE_SCHEDULE_DEFAULTS = {
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

/** @deprecated LAB_FEE_SCHEDULE_DEFAULTS와 동일 */
export const LAB_FEE_SCHEDULE_SAMPLE = LAB_FEE_SCHEDULE_DEFAULTS;

/** 리메이크 수가. 미설정 시 0원(기공소가 항목별로 지정) */
export const LAB_FEE_REMAKE_SCHEDULE_DEFAULTS = Object.fromEntries(
  LAB_FEE_SCHEDULE_KEYS.map((key) => [key, 0]),
);

/** 기공소 미지정(자동매칭) 견적 — 기본수가 없음(0원). 기공소 스케줄이 있을 때만 청구. */
export const LAB_FEE_SCHEDULE_ZEROS = Object.fromEntries(
  LAB_FEE_SCHEDULE_KEYS.map((key) => [key, 0]),
);

/** 저장된 스케줄에서 키가 없을 때(레거시)는 제공(true)으로 본다 */
export const LAB_FEE_SCHEDULE_ENABLED_DEFAULTS = Object.fromEntries(
  LAB_FEE_SCHEDULE_KEYS.map((key) => [key, true]),
);

/** 한 번도 저장하지 않은 기공비 — 전부 미제공 */
export const LAB_FEE_SCHEDULE_UNSET_ENABLED = Object.fromEntries(
  LAB_FEE_SCHEDULE_KEYS.map((key) => [key, false]),
);

function hasLabFeeUpdatedAt(schedule) {
  const raw = schedule?.updatedAt;
  if (raw == null || raw === "") return false;
  const t = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
  return Number.isFinite(t);
}

/** 마스터 스위치(active)가 켜져야 설정 완료. 레거시는 updatedAt만 있으면 완료. */
export function isLabFeeScheduleConfigured(schedule) {
  if (!schedule || typeof schedule !== "object") return false;
  if (typeof schedule.active === "boolean") return schedule.active === true;
  return hasLabFeeUpdatedAt(schedule);
}

/** 제공(on)이고 단가>0인 항목이 하나라도 있으면 true. */
export function hasEnabledLabFeePrices(schedule) {
  return normalizeLabFeeItems(schedule).some(
    (item) =>
      item.enabled !== false && Math.round(Number(item.price || 0)) > 0,
  );
}

/** 수락·견적 SSOT. 마스터 On + 제공 항목 수가. 항목 전부 Off면 0원 청구 금지. */
export function isLabFeeScheduleReadyToCharge(schedule) {
  return (
    isLabFeeScheduleConfigured(schedule) && hasEnabledLabFeePrices(schedule)
  );
}

/** 기공수가가 필요한 치식(작업X·자리표시 제외). 단독·부가 커스텀어벗 포함. */
export function toothWorksNeedLabFee(toothWorks) {
  const rows = Array.isArray(toothWorks) ? toothWorks : [];
  return rows.some((row) => {
    const toothNumber = String(row?.toothNumber || row?.tooth || "").trim();
    if (!/^[1-4][1-8]$/.test(toothNumber)) return false;
    const prosthesisType = String(
      row?.prosthesisType || row?.type || "",
    ).trim();
    if (!prosthesisType || isMissingToothProsthesisType(prosthesisType)) {
      return false;
    }
    return true;
  });
}

export function labFeeItemNameForProsthesisType(prosthesisType) {
  const raw = String(prosthesisType || "").trim();
  if (!raw || isMissingToothProsthesisType(raw)) {
    return "";
  }
  if (isCustomAbutmentProsthesisType(raw)) {
    return LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_NAME;
  }
  if (isRemovableTempProsthesisType(raw)) return "임시치아";
  return canonicalizeFeeItemName(raw);
}

export function labFeeItemNamesNeededForToothWorks(toothWorks) {
  const rows = Array.isArray(toothWorks) ? toothWorks : [];
  const absorbed = absorbedNonTempTeethInTempSpans(rows);
  const names = [];
  const seen = new Set();
  for (const row of rows) {
    const toothNumber = String(row?.toothNumber || row?.tooth || "").trim();
    if (toothNumber && !/^[1-4][1-8]$/.test(toothNumber)) continue;
    if (absorbed.has(toothNumber)) continue;
    const prosthesisType = row?.prosthesisType || row?.type;
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
    // 크라운·브리지·임시치아 + CA → 지그포함 수가도 필요(심플어벗=치과 재고는 제외)
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
}

export function labFeeItemMatchesNeedName(item, needName) {
  const need = canonicalizeFeeItemName(needName);
  if (!need) return false;
  if (need === "임시치아" || isRemovableTempFeeName(needName)) {
    return isRemovableTempFeeName(item?.name);
  }
  return canonicalizeFeeItemName(item?.name) === need;
}

/** 견적 라인·툴팁 라벨이 커스텀어벗 수가 행인지(지그포함/제외 포함). */
export function isCustomAbutmentLabFeeLineType(prosthesisType) {
  const compact = String(prosthesisType || "")
    .trim()
    .replace(/\s+/g, "");
  if (!compact) return false;
  if (isCustomAbutmentProsthesisType(prosthesisType)) return true;
  return (
    compact === LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME.replace(/\s+/g, "") ||
    compact === LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_NAME.replace(/\s+/g, "") ||
    /^커스텀어벗\(/.test(compact)
  );
}

export function isCustomAbutmentWithJigFeeName(name) {
  return (
    canonicalizeFeeItemName(name) === LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME
  );
}

export function isCustomAbutmentWithoutJigFeeName(name) {
  return (
    canonicalizeFeeItemName(name) === LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_NAME
  );
}

function labFeeItemHasChargePrice(item) {
  if (!item || item.enabled === false) return false;
  const tierPrices = Array.isArray(item.tiers)
    ? item.tiers.map((tier) => Math.round(Number(tier?.price || 0)))
    : [];
  const price = Math.max(
    0,
    Math.round(Number(item.price || 0)),
    ...tierPrices,
  );
  return price > 0;
}

/** 이 의뢰 보철 중 제공·단가가 없는 수가 항목명. 치과→기공소 배송은 무료(수가 항목 없음). */
export function missingLabFeeItemNames(schedule, toothWorks) {
  const needed = labFeeItemNamesNeededForToothWorks(toothWorks);
  const items = normalizeLabFeeItems(schedule);
  return needed.filter(
    (name) =>
      !items.some(
        (item) =>
          labFeeItemMatchesNeedName(item, name) && labFeeItemHasChargePrice(item),
      ),
  );
}

export function resolveQuoteLabFeeConfigured({
  usedDefaultSchedule = false,
  schedule = null,
  toothWorks = [],
  remake = false,
  labFeeTotal = 0,
} = {}) {
  if (usedDefaultSchedule) return true;
  if (!isLabFeeScheduleReadyToCharge(schedule)) return false;
  if (remake) return true;
  if (
    toothWorksNeedLabFee(toothWorks) &&
    Math.max(0, Math.round(Number(labFeeTotal || 0))) <= 0
  ) {
    return false;
  }
  return true;
}

export function buildUnsetLabFeeSchedule() {
  return {
    ...LAB_FEE_SCHEDULE_ZEROS,
    remake: { ...LAB_FEE_REMAKE_SCHEDULE_DEFAULTS },
    enabled: { ...LAB_FEE_SCHEDULE_UNSET_ENABLED },
    active: false,
    updatedAt: null,
  };
}

export function buildDefaultLabFeeSchedule() {
  return {
    ...LAB_FEE_SCHEDULE_DEFAULTS,
    remake: { ...LAB_FEE_REMAKE_SCHEDULE_DEFAULTS },
    enabled: { ...LAB_FEE_SCHEDULE_ENABLED_DEFAULTS },
    active: false,
    updatedAt: null,
  };
}

/** 설정 UI용. 미설정이어도 기본 수가·항목 on을 보여 준다. */
export function resolveLabFeeScheduleForSettings(schedule) {
  const hasItems =
    Array.isArray(schedule?.items) && schedule.items.length > 0;
  if (hasItems || isLabFeeScheduleConfigured(schedule)) {
    return schedule;
  }
  const hasPrice = LAB_FEE_SCHEDULE_KEYS.some(
    (key) => Math.round(Number(schedule?.[key] || 0)) > 0,
  );
  if (hasPrice) return schedule;
  return buildDefaultLabFeeSchedule();
}

/** 청구용. 마스터가 꺼져 있으면 0원 */
export function resolveLabFeeScheduleSource(schedule) {
  return isLabFeeScheduleConfigured(schedule)
    ? schedule
    : buildUnsetLabFeeSchedule();
}

export const LAB_TRADING_PARTNER_WINDOW_DAYS = 60;

export const LAB_FEE_ITEM_UNITS = ["perTooth", "perNTeeth", "perSet"];
export const LAB_FEE_ITEM_UNIT_LABELS = {
  perTooth: "치아 1개당",
  perNTeeth: "치아 n개당",
  perSet: "1세트당",
};
export const MAX_LAB_FEE_ITEMS = 40;
export const MAX_LAB_FEE_ITEM_TIERS = 8;

/**
 * 레거시 기공수가「배송비」(치과→기공소). 정책상 무료 — 시드/정규화에서 strip.
 * id/name 판별용으로만 유지.
 */
export const LAB_FEE_SHIPPING_ITEM_ID = "shipping";
export const LAB_FEE_SHIPPING_ITEM_NAME = "배송비";
/** @deprecated 치과→기공소 배송 무료. 호환용 상수만 유지. */
export const LAB_FEE_SHIPPING_ADMIN_DEFAULT_PRICE = 0;
/** @deprecated 치과→기공소 배송 무료. 호환용 상수만 유지. */
export const LAB_FEE_SHIPPING_LAB_DEFAULT_PRICE = 0;

export function isLabFeeShippingItem(item) {
  if (!item || typeof item !== "object") return false;
  if (String(item.id || "").trim() === LAB_FEE_SHIPPING_ITEM_ID) return true;
  return canonicalizeFeeItemName(item.name) === LAB_FEE_SHIPPING_ITEM_NAME;
}

/** @deprecated 신규 시드에 쓰지 않음. */
export function buildLabFeeShippingItem({
  price = LAB_FEE_SHIPPING_LAB_DEFAULT_PRICE,
  enabled = false,
} = {}) {
  return {
    id: LAB_FEE_SHIPPING_ITEM_ID,
    name: LAB_FEE_SHIPPING_ITEM_NAME,
    unit: "perSet",
    enabled: enabled === true,
    price: Math.max(0, Math.round(Number(price) || 0)),
    remake: 0,
    tiers: [],
  };
}

/** 레거시「배송비」행 제거. 치과→기공소는 무료. */
export function stripLabFeeShippingItems(items) {
  const list = Array.isArray(items) ? items : [];
  return list.filter((item) => !isLabFeeShippingItem(item));
}

/** @deprecated stripLabFeeShippingItems 사용. 호환: shipping 미삽입·기존 행 제거. */
export function ensureLabFeeShippingItem(items) {
  return stripLabFeeShippingItems(items);
}

/** 기공수가 배송비 — 항상 0(무료). */
export function resolveLabShippingFeeFromSchedule() {
  return 0;
}

export function isMissingToothProsthesisType(prosthesisType) {
  const raw = String(prosthesisType || "").trim();
  const compact = raw.replace(/\s+/g, "");
  return (
    raw === "결손치" ||
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
  if (isCustomAbutmentProsthesisType(prosthesisType)) return true;
  if (
    prosthesisType !== "크라운" &&
    prosthesisType !== "브리지" &&
    !isRemovableTempProsthesisType(prosthesisType)
  ) {
    return false;
  }
  return Boolean(row?.hasCustomAbutment) || Boolean(row?.customAbutment);
}

/** 심플어벗/심플밀링 — 치과 재고. 기공소 커스텀어벗 수가·견적 제외. */
const SIMPLE_ABUTMENT_KINDS = new Set(["심플어벗", "심플밀링"]);

/**
 * 크라운·브리지·임시치아 + 심플어벗만 기공소 CA 수가에서 제외.
 * 단독「커스텀어벗」형태는 심플이어도 「커스텀어벗(지그제외)」수가 대상.
 */
export function isSimpleAbutmentModeForFee(row) {
  const prosthesisType = String(row?.prosthesisType || row?.type || "").trim();
  if (isCustomAbutmentProsthesisType(prosthesisType)) return false;
  return SIMPLE_ABUTMENT_KINDS.has(
    String(row?.abutmentManufacturer || row?.manufacturer || "").trim(),
  );
}

/** @deprecated pending 판별은 IMPLANT_ADD_REQUEST_OPTION / implantAddRequest 사용 */
export const ROUND_BAR_PENDING_IMPLANT_TYPE = "헥스(사이즈 미정)";

function implantSpecKeyForFee(row) {
  return [
    row?.implantManufacturer || row?.manufacturer,
    row?.implantBrand || row?.brand,
    row?.implantFamily || row?.family,
    row?.implantType || row?.type,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .join("|");
}

function implantFamilyKeyForFee(row) {
  return [
    row?.implantManufacturer || row?.manufacturer,
    row?.implantBrand || row?.brand,
    row?.implantFamily || row?.family,
  ]
    .map((value) => String(value || "").trim().toLowerCase())
    .join("|");
}

function isRoundBarFavoriteRow(fav) {
  return (
    Boolean(fav?.roundBar) ||
    Boolean(fav?.isPublic) ||
    Boolean(String(fav?.roundBarRequestId || "").trim())
  );
}

function findRoundBarFavoriteForFee(row, favorites) {
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
}

/** 환봉·임플란트 추가 요청(미도입=요청중·도입중). 도입되면 어벗츠 어벗.
 * pending 판별 SSOT: implantAddRequest / roundBar 플래그·요청ID·brand=추가요청·type=임플란트 추가 요청·isPublic 미도입.
 * implantType=헥스(사이즈 미정)만으로는 판별하지 않는다.
 */
export function isPendingRoundBarAbutment(row, favorites) {
  if (!row) return false;
  if (row.roundBarAdopted === true || row.adopted === true) return false;
  const brand = String(row.implantBrand || row.brand || "").trim();
  const type = String(row.implantType || row.type || "").trim();
  const flagged =
    Boolean(row.implantAddRequest) ||
    Boolean(row.roundBar) ||
    Boolean(row.isPublic) ||
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
  // 카탈로그에서 고른 공개·미도입 스펙: 프리셋에 매칭되면 도입중으로 취급
  const list = Array.isArray(favorites) ? favorites : [];
  if (list.length === 0) return false;
  const match = findRoundBarFavoriteForFee(row, list);
  if (!match) return false;
  if (match.adopted === true) return false;
  return (
    Boolean(match.roundBar) ||
    Boolean(match.isPublic) ||
    Boolean(match.implantAddRequest) ||
    Boolean(String(match.roundBarRequestId || "").trim())
  );
}

/** 도입된 추가요청의 단가 종류. 미도입·일반 CNC는 cnc */
export function resolveAdoptedAbutmentKind(row, favorites) {
  const match = findRoundBarFavoriteForFee(row, favorites);
  const raw = String(match?.adoptedKind || row?.adoptedKind || "")
    .trim()
    .toLowerCase();
  if (raw === "round_bar") return "round_bar";
  return "cnc";
}

function resolveLabAbutmentUnitPrice(items, useRemake, withJig = true) {
  const feeName = withJig
    ? LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME
    : LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_NAME;
  const item = findLabFeeItemForProsthesisType(items, feeName);
  // unit은 normalize가 perTooth로 고정. 레거시 perSet 등도 단가만 쓴다.
  if (!item) return 0;
  return Math.max(
    0,
    Math.round(Number(useRemake ? item.remake : item.price) || 0),
  );
}

/** 보철+어벗 → 지그포함, 단독 커스텀어벗 → 지그제외 */
function labAbutmentFeeNameForRow(row) {
  const prosthesisType = String(row?.prosthesisType || row?.type || "").trim();
  if (isCustomAbutmentProsthesisType(prosthesisType)) {
    return LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_NAME;
  }
  return LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME;
}

function resolveLabAbutmentUnitPriceForRow(items, useRemake, row) {
  const withJig =
    !isCustomAbutmentProsthesisType(
      String(row?.prosthesisType || row?.type || "").trim(),
    );
  return resolveLabAbutmentUnitPrice(items, useRemake, withJig);
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

/** 기공비 항목명: 임시치아 · 임시치아1 · 임시치아2 */
export function isRemovableTempFeeName(name) {
  const raw = String(name || "").trim();
  const compact = raw.replace(/\s+/g, "");
  return (
    compact === "가철성임시치아" ||
    compact === "임시치아" ||
    /^임시치아\d+$/.test(compact) ||
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

/** 표시용: 18..11 → 21..28 → 38..31 → 41..48 (10→20→30→40번대).
 * 악궁마다 구치(뒷자리 큼)가 가장자리, 정중선(뒷자리 작음)이 가운데. */
export function toToothDecadeSortNumber(toothNumber) {
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
}

export function sortPracticeTransferFeeLines(lines) {
  return (Array.isArray(lines) ? lines : []).slice().sort((a, b) => {
    const diff =
      toToothDecadeSortNumber(a?.toothNumber) -
      toToothDecadeSortNumber(b?.toothNumber);
    if (diff !== 0) return diff;
    const aMulti = String(a?.toothNumber || "").includes(",");
    const bMulti = String(b?.toothNumber || "").includes(",");
    if (aMulti !== bMulti) return aMulti ? -1 : 1;
    return String(a?.toothNumber || "").localeCompare(
      String(b?.toothNumber || ""),
      "ko",
    );
  });
}

/** max 견적 라인에 min 스케줄 labFee를 labFeeMin으로 붙인다. */
export function attachLabFeeMinToLines(maxLines, minLines) {
  const minByKey = new Map();
  for (const line of Array.isArray(minLines) ? minLines : []) {
    const key = `${String(line?.toothNumber || "").trim()}\0${String(line?.prosthesisType || "").trim()}`;
    if (!minByKey.has(key)) {
      minByKey.set(key, Math.max(0, Math.round(Number(line?.labFee || 0))));
    }
  }
  return (Array.isArray(maxLines) ? maxLines : []).map((line) => {
    const key = `${String(line?.toothNumber || "").trim()}\0${String(line?.prosthesisType || "").trim()}`;
    if (!minByKey.has(key)) return line;
    return {
      ...line,
      labFeeMin: minByKey.get(key),
    };
  });
}

function sortToothNumbersForFee(teeth) {
  return (Array.isArray(teeth) ? teeth : []).slice().sort(
    (a, b) => toToothDecadeSortNumber(a) - toToothDecadeSortNumber(b),
  );
}

export function removableTempFeeForCount(count, price3, price6) {
  return nTeethFeeForCount(count, [
    { n: 3, price: price3, remake: 0 },
    { n: 6, price: price6, remake: 0 },
  ]);
}

export function nTeethFeeForCount(count, tiers, remake = false) {
  const list = (Array.isArray(tiers) ? tiers : [])
    .map((tier) => ({
      n: Math.max(1, Math.round(Number(tier?.n || 1))),
      price: Math.max(
        0,
        Math.round(Number(remake ? tier?.remake : tier?.price) || 0),
      ),
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
}

export function canonicalizeFeeItemName(name) {
  const raw = String(name || "").trim();
  if (!raw) return "";
  const compact = raw.replace(/\s+/g, "");
  if (/^pontic$/i.test(raw)) return "브리지";
  if (compact === "브릿지" || compact === "브리지" || /^bridge$/i.test(raw)) {
    return "브리지";
  }
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
  // 관리자 기본 기공수가「커스텀 어벗」·기공소 항목명 공백 변형 → 동일 키
  // 레거시「커스텀어벗」단독명 = 지그포함(보철+어벗)
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
}

export function normalizeLabFeeItemUnit(unit) {
  const raw = String(unit || "").trim();
  if (raw === "perNTeeth" || raw === "nTeeth" || raw === "perN") return "perNTeeth";
  if (raw === "perSet" || raw === "set") return "perSet";
  return "perTooth";
}

function normalizeLabFeeItemTier(input, index) {
  const src = input && typeof input === "object" ? input : {};
  const n = Math.max(1, Math.min(32, Math.round(Number(src.n || index + 1))));
  const price = Math.max(0, Math.round(Number(src.price || 0)));
  const remake = Math.max(0, Math.round(Number(src.remake || 0)));
  return {
    n: Number.isFinite(n) ? n : index + 1,
    price: Number.isFinite(price) ? price : 0,
    remake: Number.isFinite(remake) ? remake : 0,
  };
}

export function normalizeLabFeeItem(input, index = 0) {
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
    tiers.push(
      normalizeLabFeeItemTier({ n: 3, price, remake }, 0),
    );
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
}

function migrateLegacyLabFeeItems(input) {
  const schedule = normalizeLabFeeSchedule(input);
  const remake = normalizeLabFeeRemakeSchedule(
    input && typeof input === "object" && input.remake ? input : { remake: {} },
  );
  const enabled = normalizeLabFeeScheduleEnabled(input);
  return [
    {
      id: "crown",
      name: "크라운",
      unit: "perTooth",
      enabled: enabled.crown !== false,
      price: schedule.crown,
      remake: remake.crown,
      tiers: [],
    },
    {
      id: "bridge",
      name: "브리지",
      unit: "perTooth",
      enabled: enabled.bridge !== false,
      price: schedule.bridge,
      remake: remake.bridge,
      tiers: [],
    },
    {
      id: "inlay",
      name: "인레이",
      unit: "perTooth",
      enabled: enabled.inlay !== false,
      price: schedule.inlay,
      remake: remake.inlay,
      tiers: [],
    },
    {
      id: "retainer",
      name: "유지장치",
      unit: "perSet",
      enabled: enabled.retainer !== false,
      price: schedule.retainer,
      remake: remake.retainer,
      tiers: [],
    },
    {
      id: "temp1",
      name: "임시치아",
      unit: "perNTeeth",
      enabled: enabled.removableTemp3 !== false,
      price: schedule.removableTemp3,
      remake: remake.removableTemp3,
      tiers: [
        {
          n: 3,
          price: schedule.removableTemp3,
          remake: remake.removableTemp3,
        },
      ],
    },
    {
      id: "temp2",
      name: "임시치아",
      unit: "perNTeeth",
      enabled: enabled.removableTemp6 !== false,
      price: schedule.removableTemp6,
      remake: remake.removableTemp6,
      tiers: [
        {
          n: 6,
          price: schedule.removableTemp6,
          remake: remake.removableTemp6,
        },
      ],
    },
    {
      id: "customAbutmentWithJig",
      name: LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME,
      unit: "perTooth",
      enabled: enabled.customAbutmentDesignAndProduction !== false,
      price: schedule.customAbutmentDesignAndProduction,
      remake: remake.customAbutmentDesignAndProduction,
      tiers: [],
    },
    {
      id: "customAbutmentWithoutJig",
      name: LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_NAME,
      unit: "perTooth",
      enabled:
        enabled.customAbutmentWithoutJig !== false &&
        enabled.customAbutmentDesignAndProduction !== false,
      price: schedule.customAbutmentWithoutJig,
      remake: remake.customAbutmentWithoutJig,
      tiers: [],
    },
  ];
}

function numberedTempName(name) {
  const raw = String(name || "").trim() || "임시치아";
  if (isRemovableTempFeeName(name) || isRemovableTempFeeName(raw)) {
    return "임시치아";
  }
  return raw;
}

function expandPerNTeethTierItems(items) {
  const seen = new Set();
  const out = [];
  const takeId = (wanted, fallbackIndex) => {
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
  for (const item of Array.isArray(items) ? items : []) {
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
}

export function normalizeLabFeeItems(input) {
  const src = input && typeof input === "object" ? input : {};
  const rawItems = Array.isArray(src.items)
    ? src.items
    : Array.isArray(src)
      ? src
      : null;
  if (rawItems) {
    const seen = new Set();
    const out = [];
    for (const row of rawItems) {
      if (out.length >= MAX_LAB_FEE_ITEMS) break;
      if (isRemovedPonticFeeRow(row)) continue;
      if (isLabFeeShippingItem(row)) continue;
      const item = normalizeLabFeeItem(row, out.length);
      if (!item.name) continue;
      if (isLabFeeShippingItem(item)) continue;
      let id = item.id;
      if (!id || seen.has(id)) id = `item-${out.length + 1}`;
      // 레거시 id=customAbutment → withJig
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
  return migrateLegacyLabFeeItems(src);
}

/**
 * 커스텀어벗(지그포함/제외) 행이 없으면 보완.
 * 기존 items에 보철만 있고 CA가 없으면 Off로 시드(기공소 옵트인). flat 단가가 있으면 그 값을 씀.
 */
function ensureSplitCustomAbutmentFeeItems(items, scheduleSrc = null) {
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
        unit: "perTooth",
        tiers: [],
      };
    }
    if (isCustomAbutmentWithoutJigFeeName(item.name)) {
      return {
        ...item,
        name: LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_NAME,
        unit: "perTooth",
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
  const takeId = (wanted) => {
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
    // 기존 수가에 없던 CA는 Off. flat 단가가 있으면 레거시 제공 상태를 유지.
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
}

export { ensureSplitCustomAbutmentFeeItems };

/** 저장된 items 이름(정규화 전). ensureSplit·카탈로그 병합으로 생긴 행은 제외. */
export function listRawPersistedLabFeeItemNames(schedule) {
  const src = schedule && typeof schedule === "object" ? schedule : {};
  const names = [];
  const seen = new Set();
  const push = (raw) => {
    const canon = canonicalizeFeeItemName(raw);
    if (!canon || seen.has(canon)) return;
    seen.add(canon);
    names.push(canon);
  };
  if (Array.isArray(src.items) && src.items.length) {
    for (const row of src.items) {
      push(row?.name);
    }
    return names;
  }
  // 레거시 flat만 있으면 마이그레이션 결과를 저장된 것으로 본다.
  for (const item of migrateLegacyLabFeeItems(src)) {
    push(item.name);
  }
  return names;
}

/**
 * 설정 UI용: 관리자 기본 기공수가(On)에만 있고 기공소에 없는 항목을 Off로 붙인다.
 */
export function mergeEnabledCatalogItemsIntoLabFeeItems(
  labItems,
  catalogItems,
) {
  const out = Array.isArray(labItems) ? [...labItems] : [];
  const existing = new Set(
    out.map((item) => canonicalizeFeeItemName(item?.name)).filter(Boolean),
  );
  const catalog = Array.isArray(catalogItems) ? catalogItems : [];
  for (const row of catalog) {
    if (out.length >= MAX_LAB_FEE_ITEMS) break;
    if (!row || row.enabled === false || row.pendingReview === true) continue;
    if (isLabFeeShippingItem(row)) continue;
    const item = normalizeLabFeeItem(
      {
        ...row,
        enabled: false,
        pendingReview: false,
        proposedByLabName: "",
        proposedByLabAnchorId: "",
        proposedAt: null,
      },
      out.length,
    );
    if (!item.name) continue;
    if (isLabFeeShippingItem(item)) continue;
    const canon = canonicalizeFeeItemName(item.name);
    if (!canon || existing.has(canon)) continue;
    existing.add(canon);
    let id = item.id;
    if (!id || out.some((rowItem) => rowItem.id === id)) {
      id = `catalog-${out.length + 1}`;
    }
    out.push({ ...item, id, enabled: false });
  }
  return out.slice(0, MAX_LAB_FEE_ITEMS);
}

/**
 * 기공소가 아직 On·단가를 확정하지 않은 기본 기공수가 이름.
 * - 카탈로그 On 항목이 저장 items에 없거나(신규 추가)
 * - 커스텀어벗(지그포함/제외)은 Off·0원이면 매 세션 안내
 */
export function resolveLabFeeCatalogNeedSetupNames(labSchedule, catalogItems) {
  const labItems = normalizeLabFeeItems(labSchedule);
  const rawNames = new Set(listRawPersistedLabFeeItemNames(labSchedule));
  const names = [];
  const seen = new Set();
  const catalog = Array.isArray(catalogItems) ? catalogItems : [];

  for (const row of catalog) {
    if (!row || row.enabled === false || row.pendingReview === true) continue;
    if (isLabFeeShippingItem(row)) continue;
    const displayName = String(row.name || "").trim();
    const canon = canonicalizeFeeItemName(displayName);
    if (!canon || seen.has(canon)) continue;

    const chargeable = labItems.some(
      (item) =>
        labFeeItemMatchesNeedName(item, displayName) &&
        labFeeItemHasChargePrice(item),
    );
    if (chargeable) continue;

    const isCustomAbutment =
      canon === LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME ||
      canon === LAB_FEE_CUSTOM_ABUTMENT_WITHOUT_JIG_NAME;
    if (!rawNames.has(canon) || isCustomAbutment) {
      seen.add(canon);
      names.push(isCustomAbutment ? canon : displayName);
    }
  }
  return names;
}

function legacyKeyFromItemName(name) {
  const canon = canonicalizeFeeItemName(name);
  if (canon === "크라운") return "crown";
  if (canon === "브리지") return "bridge";
  if (canon === "인레이") return "inlay";
  if (canon === "유지장치") return "retainer";
  if (canon === "임시치아" || isRemovableTempFeeName(name)) return "removableTemp";
  return null;
}

/** items → 레거시 crown/bridge… 키. 기존 견적 경로 호환 */
export function legacyLabFeeScheduleFromItems(items, base) {
  const schedule = normalizeLabFeeSchedule(base);
  const remake = normalizeLabFeeRemakeSchedule(base);
  const enabled = normalizeLabFeeScheduleEnabled(base);
  const tempItems = [];
  for (const item of Array.isArray(items) ? items : []) {
    if (isCustomAbutmentWithJigFeeName(item.name)) {
      schedule.customAbutmentDesignAndProduction = item.price;
      remake.customAbutmentDesignAndProduction = item.remake;
      enabled.customAbutmentDesignAndProduction = item.enabled !== false;
      continue;
    }
    if (isCustomAbutmentWithoutJigFeeName(item.name)) {
      schedule.customAbutmentWithoutJig = item.price;
      remake.customAbutmentWithoutJig = item.remake;
      enabled.customAbutmentWithoutJig = item.enabled !== false;
      continue;
    }
    const key = legacyKeyFromItemName(item.name);
    if (!key) continue;
    if (key === "removableTemp") {
      tempItems.push(item);
      continue;
    }
    schedule[key] = item.unit === "perNTeeth"
      ? Number(item.tiers?.[0]?.price || item.price || 0)
      : item.price;
    remake[key] = item.unit === "perNTeeth"
      ? Number(item.tiers?.[0]?.remake || item.remake || 0)
      : item.remake;
    enabled[key] = item.enabled !== false;
  }
  if (tempItems.length) {
    const tiers = tempItems
      .flatMap((item) =>
        item.unit === "perNTeeth" && item.tiers?.length
          ? item.tiers.map((tier) => ({
              n: tier.n,
              price: tier.price,
              remake: tier.remake,
              enabled: item.enabled !== false,
            }))
          : [
              {
                n: 3,
                price: item.price,
                remake: item.remake,
                enabled: item.enabled !== false,
              },
            ],
      )
      .sort((a, b) => a.n - b.n);
    const first = tiers[0] || { n: 3, price: 0, remake: 0, enabled: true };
    const second = tiers.find((tier) => tier.n !== first.n) || first;
    schedule.removableTemp3 = first.price;
    schedule.removableTemp6 = second.price;
    remake.removableTemp3 = first.remake;
    remake.removableTemp6 = second.remake;
    enabled.removableTemp3 = first.enabled !== false;
    enabled.removableTemp6 = second.enabled !== false;
  }
  return { schedule, remake, enabled };
}

export function findLabFeeItemForProsthesisType(items, prosthesisType) {
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
      item.tiers?.length
        ? item.tiers
        : [{ n: 3, price: item.price, remake: item.remake }],
    );
    return { ...perN[0], tiers };
  }
  return matches[0];
}

/** 보철 형태 → labFeeSchedule 키. 작업X·커스텀어벗(어벗츠 단가)·묶음수가 항목은 null */
export function resolveLabFeeKeyFromProsthesisType(prosthesisType) {
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
}

export function prosthesisIncludesCustomAbutment(prosthesisType) {
  return isCustomAbutmentProsthesisType(prosthesisType);
}

/** 리메이크 수가 키. 단독 커스텀어벗만 디자인/디자인+생산, 그 외는 보철 키 */
export function resolveRemakeLabFeeKey(row) {
  const prosthesisType = String(row?.prosthesisType || row?.type || "").trim();
  if (!prosthesisType || isMissingToothProsthesisType(prosthesisType)) {
    return null;
  }
  if (isCustomAbutmentProsthesisType(prosthesisType)) {
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
    retainer: pick("retainer"),
    removableTemp3: pick("removableTemp3"),
    removableTemp6: pick("removableTemp6"),
    customAbutmentDesign: pick("customAbutmentDesign"),
    customAbutmentDesignAndProduction: pick(
      "customAbutmentDesignAndProduction",
    ),
    customAbutmentWithoutJig: pick("customAbutmentWithoutJig"),
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
    retainer: pick("retainer"),
    removableTemp3: pick("removableTemp3"),
    removableTemp6: pick("removableTemp6"),
    customAbutmentDesign: pick("customAbutmentDesign"),
    customAbutmentDesignAndProduction: pick(
      "customAbutmentDesignAndProduction",
    ),
    customAbutmentWithoutJig: pick("customAbutmentWithoutJig"),
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
 * toothWorks 행 기준 기공비·기공소 커스텀어벗 수가 합산.
 * PTX CA: 단독=「커스텀어벗(지그제외)」, 보철+어벗=「커스텀어벗(지그포함)」.
 * 어벗츠 플랫폼 단가(생산 1.5만 / 디자인+생산 2.5만)는 기공소→어벗츠 Request 과금.
 * 환봉 요청중(헥스 사이즈 미정, 미도입)도 기공소 어벗(pending).
 * 크라운·브리지·임시치아 등에 어벗을 붙이면 기공수가 + 지그포함 수가.
 * @returns {{ labFeeTotal, labAbutmentTotal, labAbutmentPending, abutmentRetailTotal, abutmentQuotePending, abutmentQty, total, lines }}
 */
export function computePracticeTransferRetailFees({
  toothWorks,
  implantFavorites,
  labFeeSchedule,
  /** @deprecated 무시. PTX 치과→기공소는 labFeeSchedule 수가만. */
  abutmentPricingTier: _abutmentPricingTier,
  /** @deprecated 무시. 어벗츠 몫은 Request hold. */
  abutmentPrices: _abutmentPrices,
  skipAbutmentFees = false,
  remake = false,
  labFeeMultiplier = 1,
  rushFeeMultiplier = 1,
  /** @deprecated 치과→기공소 배송 무료. 무시되며 labShippingFee는 항상 0. */
  includeLabShippingFee = false,
}) {
  void _abutmentPricingTier;
  void _abutmentPrices;
  const useRemake = Boolean(remake);
  const items = normalizeLabFeeItems(labFeeSchedule);
  const waiveAbutment = useRemake || Boolean(skipAbutmentFees);
  const rows = Array.isArray(toothWorks) ? toothWorks : [];
  const absorbedNonTemp = absorbedNonTempTeethInTempSpans(rows);
  const lines = [];
  const grouped = new Map();
  let labFeeTotal = 0;
  let labAbutmentTotal = 0;
  let labAbutmentPending = false;
  let abutmentRetailTotal = 0;
  let abutmentQuotePending = false;
  let abutmentQty = 0;

  const abutmentSplitForRow = (row) => {
    if (
      waiveAbutment ||
      !isCustomAbutmentWork(row) ||
      isSimpleAbutmentModeForFee(row)
    ) {
      return { abuts: 0, lab: 0, pending: false, quote: false, feeName: "" };
    }
    const feeName = labAbutmentFeeNameForRow(row);
    const lab = resolveLabAbutmentUnitPriceForRow(items, useRemake, row);
    if (isPendingRoundBarAbutment(row, implantFavorites)) {
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
    const kind = resolveAdoptedAbutmentKind(row, implantFavorites);
    // 치과→기공소 수가. abutmentRetail(어벗츠 몫)은 PTX에서 쓰지 않음.
    return {
      abuts: 0,
      lab,
      pending: false,
      quote: kind === "round_bar" && lab === 0,
      feeName,
    };
  };
  const addAbutment = (split) => {
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
  const retailNote = (split) => (split.quote ? "quote" : undefined);
  const abutmentLineType = (split) =>
    split.feeName || LAB_FEE_CUSTOM_ABUTMENT_WITH_JIG_NAME;

  for (const row of rows) {
    const toothNumber = String(row?.toothNumber || row?.tooth || "").trim();
    // 작성 중 자리표시(치아 미선택·기본 형태만)는 과금하지 않는다
    if (!/^[1-4][1-8]$/.test(toothNumber)) continue;
    const prosthesisType = String(
      row?.prosthesisType || row?.type || "",
    ).trim();
    if (!prosthesisType) continue;
    if (isMissingToothProsthesisType(prosthesisType)) continue;
    if (absorbedNonTemp.has(toothNumber)) continue;

    if (isCustomAbutmentProsthesisType(prosthesisType)) {
      if (useRemake) {
        if (isSimpleAbutmentModeForFee(row)) continue;
        const remakeFee = resolveLabAbutmentUnitPrice(items, true, false);
        const pending = isPendingRoundBarAbutment(row, implantFavorites);
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
        toothNumber,
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
          toothNumber,
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
    grouped.get(item.id).rows.push(row);
  }

  for (const { item, rows: groupedRows } of grouped.values()) {
    const spanGroups = isRemovableTempFeeName(item.name)
      ? listTempBridgeFeeGroups(rows)
      : groupRowsForSetFee(groupedRows);
    for (const group of spanGroups) {
      const labFee =
        item.unit === "perSet"
          ? Math.max(
              0,
              Math.round(Number(useRemake ? item.remake : item.price) || 0),
            )
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
        abutmentRetailNote:
          groupQuote && groupAbutment === 0 ? "quote" : undefined,
      });
    }
  }

  const withLabMult = applyLabFeeMultiplierToFees(
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
    labFeeMultiplier,
  );
  const withRush = applyRushFeeMultiplierToFees(withLabMult, rushFeeMultiplier);
  // 치과→기공소 배송은 무료(기공수가「배송비」폐지). includeLabShippingFee 무시.
  void includeLabShippingFee;
  return { ...withRush, labShippingFee: 0 };
}

function feeRowTooth(row) {
  return String(row?.toothNumber || row?.tooth || "").trim();
}

function feeRowType(row) {
  return String(row?.prosthesisType || row?.type || "").trim();
}

function isPonticProsthesisType(prosthesisType) {
  return /^pontic$/i.test(String(prosthesisType || "").trim());
}

export function isRemovedPonticFeeRow(row) {
  const id = String(row?.id || row?.key || "").trim().toLowerCase();
  const name = String(row?.name || row?.label || "").trim();
  return id === "pontic" || /^pontic$/i.test(name);
}

/** 임시치아 브리지 스팬을 잇는 형태(브리지·작업X·레거시 Pontic). 유지장치는 제외 */
function isTempBridgeSpanMemberType(type) {
  return (
    isRemovableTempProsthesisType(type) ||
    isPonticProsthesisType(type) ||
    isMissingToothProsthesisType(type) ||
    type === "브리지"
  );
}

function isTempBridgeSpanBillableType(type) {
  return (
    isRemovableTempProsthesisType(type) ||
    isPonticProsthesisType(type) ||
    type === "브리지"
  );
}

/** 임시치아 연결 스팬. 중간 브리지·레거시 Pontic은 칸으로 세고 별도 수가를 붙이지 않는다 */
function listTempBridgeFeeGroups(allRows) {
  const memberRows = (Array.isArray(allRows) ? allRows : []).filter((row) => {
    const tooth = feeRowTooth(row);
    return (
      /^[1-4][1-8]$/.test(tooth) && isTempBridgeSpanMemberType(feeRowType(row))
    );
  });
  const tempRows = memberRows.filter((row) =>
    isRemovableTempProsthesisType(feeRowType(row)),
  );
  if (tempRows.length === 0) return [];

  const hasLinks = memberRows.some((row) =>
    (Array.isArray(row?.bridgeLinkedTeeth) ? row.bridgeLinkedTeeth : []).some(
      (value) => String(value || "").trim(),
    ),
  );
  if (!hasLinks) return groupRowsByArch(tempRows);

  const remaining = new Set();
  const byTooth = new Map();
  for (const row of memberRows) {
    const tooth = feeRowTooth(row);
    if (!tooth) continue;
    remaining.add(tooth);
    if (!byTooth.has(tooth)) byTooth.set(tooth, row);
  }
  const groups = [];
  while (remaining.size > 0) {
    const start = remaining.values().next().value;
    remaining.delete(start);
    const stack = [start];
    const teeth = [];
    while (stack.length > 0) {
      const cur = stack.pop();
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
    const arch = toothArchFromNumber(billed[0]);
    groups.push({
      suffix: arch === "upper" ? "(상악)" : arch === "lower" ? "(하악)" : "",
      teeth: billed,
    });
  }
  return groups;
}

function absorbedNonTempTeethInTempSpans(allRows) {
  const byTooth = new Map();
  for (const row of Array.isArray(allRows) ? allRows : []) {
    const tooth = feeRowTooth(row);
    if (/^[1-4][1-8]$/.test(tooth) && !byTooth.has(tooth)) {
      byTooth.set(tooth, row);
    }
  }
  const absorbed = new Set();
  for (const group of listTempBridgeFeeGroups(allRows)) {
    for (const tooth of group.teeth) {
      if (!isRemovableTempProsthesisType(feeRowType(byTooth.get(tooth)))) {
        absorbed.add(tooth);
      }
    }
  }
  return absorbed;
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

function getAdjacentTeethForFee(toothNumber) {
  const raw = String(toothNumber || "").trim();
  if (!/^[1-4][1-8]$/.test(raw)) return [];
  const tens = Number(raw[0]);
  const ones = Number(raw[1]);
  const out = [];
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

function collectLinkedTeethForFee(rows, toothNumber) {
  const tooth = String(toothNumber || "").trim();
  const adjacent = new Set(getAdjacentTeethForFee(tooth));
  const byTooth = new Map();
  for (const row of rows) {
    const other = String(row?.toothNumber || row?.tooth || "").trim();
    if (other && !byTooth.has(other)) byTooth.set(other, row);
  }
  const links = new Set();
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
function groupRowsForSetFee(rows) {
  const hasLinks = rows.some((row) =>
    (Array.isArray(row?.bridgeLinkedTeeth) ? row.bridgeLinkedTeeth : []).some(
      (value) => String(value || "").trim(),
    ),
  );
  if (!hasLinks) return groupRowsByArch(rows);

  const remaining = new Set();
  for (const row of rows) {
    const tooth = String(row?.toothNumber || row?.tooth || "").trim();
    if (tooth) remaining.add(tooth);
  }
  const groups = [];
  while (remaining.size > 0) {
    const start = remaining.values().next().value;
    remaining.delete(start);
    const stack = [start];
    const teeth = [];
    while (stack.length > 0) {
      const cur = stack.pop();
      teeth.push(cur);
      for (const linked of collectLinkedTeethForFee(rows, cur)) {
        if (!remaining.has(linked)) continue;
        remaining.delete(linked);
        stack.push(linked);
      }
    }
    const arch = toothArchFromNumber(teeth[0]);
    groups.push({
      suffix: arch === "upper" ? "(상악)" : arch === "lower" ? "(하악)" : "",
      teeth,
    });
  }
  return groups;
}

export {
  resolveAbutsAbutmentPricingTier,
  resolveAbutsAbutmentUnitPrice,
} from "./abutsAbutmentService.js";

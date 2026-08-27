// related files:
// - web/backend/utils/labFeeSchedule.js
// - web/backend/services/practiceTransferProduction.service.js
// - web/backend/services/practiceTransferBilling.service.js
// - web/frontend/src/shared/practice/practiceWorkPeriod.ts
// change-log:
// - 2026-08-20: 2+2 허용. 1+2·0+2는 경고만(주문 차단 없음).
// - 2026-08-20: 낮 12시 전은 주문일 포함, 이후는 제외(프론트 kstYmdDiffBusinessDays와 동일).
// - 2026-08-17: 신속처리 할증 없음(신규 배수 1). ≤2영업일만 제조 express.
// - 2026-08-17: 신속처리 할증 기본 1.2·(1,2] 정규화. SystemSettings 설정값 반영.
// - 2026-08-17: 신속처리=합계≤3영업일 허용(선택 도착일 유지). 일반은 2+2 이상.
// - 2026-08-17: 기공의뢰 신속처리(의뢰+2일·기공/어벗 할증). 일반 건은 묶음출고만.

import { addKoreanBusinessDays, toKstYmd } from "../controllers/requests/utils.js";

/** @deprecated 신속처리 할증 없음. 레거시 정규화 호환용. */
export const PRACTICE_RUSH_FEE_MULTIPLIER = 1;

/** 신속처리 기본 치과도착 = 주문일 + N영업일(도착일 미지정·초과 시) */
export const PRACTICE_RUSH_ARRIVAL_BUSINESS_DAYS = 2;

/** 신속처리 허용 최대 작업+배송(영업일) */
export const PRACTICE_RUSH_MAX_WORK_PLUS_SHIP_DAYS = 3;

/** @deprecated 제조 shippingMode는 항상 묶음. 지연고지 구간은 RUSH_MAX와 동일. */
export const PRACTICE_EXPRESS_MAX_WORK_PLUS_SHIP_DAYS = 3;

/** 0+2(2영업일) 경고 구간 상한. 주문 거부에는 사용하지 않음. */
export const PRACTICE_NORMAL_MIN_WORK_PLUS_SHIP_DAYS = 3;

export const PRACTICE_RUSH_COURIER_DISCLAIMER =
  "택배 사정으로 도착을 보장하지 않습니다.";

export const PRACTICE_NORMAL_MIN_PERIOD_MESSAGE =
  "0+2영업일은 주문할 수 없습니다.";

/** 청구/스냅샷용. 1 이하면 1, (1,2]는 소수 둘째 자리. */
export function normalizeRushFeeMultiplier(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 1) return 1;
  return Math.min(2, Math.round(n * 100) / 100);
}

/** 플랫폼 설정값. 할증 폐기로 항상 1(레거시 스냅샷 정규화만 >1 가능). */
export function normalizeConfiguredRushFeeMultiplier(value) {
  const n = normalizeRushFeeMultiplier(value);
  return n > 1 ? n : 1;
}

/**
 * 신규 신속처리는 할증 없음.
 * 레거시 billing.rushFeeMultiplier > 1 만 존중(재정산·표시).
 */
export function resolveRushFeeMultiplier({
  rushProcessing = false,
  rushFeeMultiplier = undefined,
  configuredMultiplier = undefined,
} = {}) {
  void rushProcessing;
  void configuredMultiplier;
  const fromBilling = normalizeRushFeeMultiplier(rushFeeMultiplier);
  if (fromBilling > 1) return fromBilling;
  return 1;
}

export function isPracticeTransferRushProcessing(transfer) {
  if (transfer?.production?.rushProcessing === true) return true;
  return normalizeRushFeeMultiplier(transfer?.billing?.rushFeeMultiplier) > 1;
}

/** @deprecated 제조는 항상 묶음. 지연고지 구간 판별은 RUSH_MAX 사용. */
export function isPracticeExpressWorkPlusShipDays(days) {
  return (
    typeof days === "number" &&
    Number.isFinite(days) &&
    days >= 0 &&
    days <= PRACTICE_EXPRESS_MAX_WORK_PLUS_SHIP_DAYS
  );
}

/** 기공비·기공소어벗·어벗츠 어벗 합계/라인 모두 배수(신속처리). */
export function applyRushFeeMultiplierToFees(fees, rushFeeMultiplier) {
  const m = normalizeRushFeeMultiplier(rushFeeMultiplier);
  const base = fees && typeof fees === "object" ? fees : {};
  if (m === 1) {
    return {
      ...base,
      rushFeeMultiplier: 1,
    };
  }
  const scale = (n) => Math.max(0, Math.round(Number(n || 0) * m));
  const labFeeTotal = scale(base.labFeeTotal);
  const labAbutmentTotal = scale(base.labAbutmentTotal);
  const abutmentRetailTotal = scale(base.abutmentRetailTotal);
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
      abutmentRetail: scale(line?.abutmentRetail),
    })),
    rushFeeMultiplier: m,
  };
}

function parseYmdParts(ymd) {
  const m = String(ymd || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
}

function addOneCivilDayYmd(ymd) {
  const p = parseYmdParts(ymd);
  if (!p) return null;
  const next = new Date(Date.UTC(p.y, p.mo - 1, p.d + 1, 12));
  const y = next.getUTCFullYear();
  const mo = String(next.getUTCMonth() + 1).padStart(2, "0");
  const d = String(next.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

function isWeekdayYmd(ymd) {
  const p = parseYmdParts(ymd);
  if (!p) return false;
  const dow = new Date(Date.UTC(p.y, p.mo - 1, p.d, 12)).getUTCDay();
  return dow !== 0 && dow !== 6;
}

function toValidDate(input) {
  if (input == null || input === "") return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getKstHour(input = new Date()) {
  const d = toValidDate(input);
  if (!d) return 0;
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Seoul",
      hour: "numeric",
      hour12: false,
    }).format(d),
  );
  if (!Number.isFinite(hour)) return 0;
  return hour === 24 ? 0 : hour;
}

/** 주문일 포함 컷오프(KST). 이전=오늘 포함, 이후=오늘 제외. */
export const PRACTICE_ORDER_DAY_CUTOFF_HOUR_KST = 12;

function shouldIncludeFromYmd(fromYmd, at) {
  const when = toValidDate(at);
  if (!when) return false;
  const atYmd = toKstYmd(when);
  if (!atYmd || atYmd !== fromYmd) return false;
  return getKstHour(when) < PRACTICE_ORDER_DAY_CUTOFF_HOUR_KST;
}

/**
 * 프론트 kstYmdDiffBusinessDays(includeFromIfBeforeNoon)와 동일(월~금, 공휴일 미제외).
 * 주문일이 at의 KST 날짜이고 낮 12시 전이면 from 포함. 같은 날=0(12시 이후) / 1(12시 전·평일).
 * @param {Date|string|number|null} [at]
 */
export function countWeekdayBusinessDays(fromYmd, toYmd, at = new Date()) {
  const from = String(fromYmd || "").trim();
  const to = String(toYmd || "").trim();
  if (!parseYmdParts(from) || !parseYmdParts(to)) return null;
  if (to < from) {
    const forward = countWeekdayBusinessDays(to, from, null);
    return forward == null ? null : -forward;
  }
  const includeFrom = shouldIncludeFromYmd(from, at);
  if (from === to) {
    return includeFrom && isWeekdayYmd(from) ? 1 : 0;
  }
  let count = 0;
  let cursor = includeFrom ? from : addOneCivilDayYmd(from);
  let guard = 0;
  while (cursor && cursor <= to && guard < 3700) {
    if (isWeekdayYmd(cursor)) count += 1;
    cursor = addOneCivilDayYmd(cursor);
    guard += 1;
  }
  return count;
}

export function parseOrderYmdFromMemo(memo) {
  const matched = String(memo || "").match(
    /\[\s*주문일\s*:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\s*\]/i,
  );
  return String(matched?.[1] || "").trim() || null;
}

export function parseArrivalYmdFromMemo(memo) {
  const matched = String(memo || "").match(
    /\[\s*(?:치과도착일|도착일)\s*:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\s*\]/i,
  );
  return String(matched?.[1] || "").trim() || null;
}

export function upsertMemoOrderYmd(memo, orderYmd) {
  const ymd = String(orderYmd || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return String(memo || "");
  const raw = String(memo || "");
  if (/\[\s*주문일\s*:/i.test(raw)) {
    return raw.replace(/\[\s*주문일\s*:\s*[^\]]*\]/gi, `[주문일: ${ymd}]`);
  }
  return `[주문일: ${ymd}]\n${raw}`.trim();
}

export function upsertMemoArrivalYmd(memo, arrivalYmd) {
  const ymd = String(arrivalYmd || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return String(memo || "");
  const raw = String(memo || "");
  if (/\[\s*(?:치과도착일|도착일)\s*:/i.test(raw)) {
    return raw.replace(
      /\[\s*(?:치과도착일|도착일)\s*:\s*[^\]]*\]/gi,
      `[도착일: ${ymd}]`,
    );
  }
  const orderLine = raw.match(/\[\s*주문일\s*:\s*[^\]]*\]/i);
  if (orderLine && typeof orderLine.index === "number") {
    const end = orderLine.index + orderLine[0].length;
    return `${raw.slice(0, end)}\n[도착일: ${ymd}]${raw.slice(end)}`;
  }
  return `[도착일: ${ymd}]\n${raw}`.trim();
}

/** 신속처리: 주문일+기본 N영업일(공휴일 반영). */
export async function resolveRushArrivalYmd(orderYmd, now = new Date()) {
  const start = String(orderYmd || "").trim() || toKstYmd(now) || null;
  if (!start) return null;
  return addKoreanBusinessDays({
    startYmd: start,
    days: PRACTICE_RUSH_ARRIVAL_BUSINESS_DAYS,
  });
}

/**
 * 생성 시 납품기일 검증·신속처리 도착일 허용(≤3영업일).
 * @returns {{ ok: true, transferMemo, rushFeeMultiplier } | { ok: false, statusCode, message, reason }}
 */
export async function resolvePracticeTransferArrivalPolicy({
  transferMemo,
  rushProcessing = false,
  now = new Date(),
  configuredRushFeeMultiplier = undefined,
}) {
  let memo = String(transferMemo || "");
  const orderYmd = parseOrderYmdFromMemo(memo) || toKstYmd(now);
  let arrivalYmd = parseArrivalYmdFromMemo(memo);
  const rush = Boolean(rushProcessing);

  let configured = configuredRushFeeMultiplier;
  if (rush && configured == null) {
    try {
      const { loadCreditSettingsDefaults } = await import(
        "./creditSettingsDefaults.js"
      );
      const creditSettings = await loadCreditSettingsDefaults();
      configured = creditSettings?.practiceRushFeeMultiplier;
    } catch {
      configured = PRACTICE_RUSH_FEE_MULTIPLIER;
    }
  }
  const rushFeeMultiplier = resolveRushFeeMultiplier({
    rushProcessing: rush,
    configuredMultiplier: configured,
  });

  const days = countWeekdayBusinessDays(orderYmd, arrivalYmd, now);
  if (days == null || days < 0) {
    return {
      ok: false,
      statusCode: 400,
      message: "치과도착일을 확인해주세요.",
      reason: "practice_work_period_invalid",
      orderYmd,
      arrivalYmd,
      workPlusShipDays: days,
    };
  }

  if (rush) {
    return {
      ok: true,
      transferMemo: memo,
      rushFeeMultiplier,
      arrivalYmd,
      orderYmd,
    };
  }
  return {
    ok: true,
    transferMemo: memo,
    rushFeeMultiplier: 1,
    arrivalYmd,
    orderYmd,
  };
}

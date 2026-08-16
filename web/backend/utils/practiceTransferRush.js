// related files:
// - web/backend/utils/labFeeSchedule.js
// - web/backend/services/practiceTransferProduction.service.js
// - web/backend/services/practiceTransferBilling.service.js
// - web/frontend/src/shared/practice/practiceWorkPeriod.ts
// change-log:
// - 2026-08-17: 기공의뢰 신속처리(의뢰+2일·기공/어벗 1.5배). 일반 건은 묶음출고만.

import { addKoreanBusinessDays, toKstYmd } from "../controllers/requests/utils.js";

/** 신속처리 시 기공비·어벗츠 의뢰비 할증 배수 */
export const PRACTICE_RUSH_FEE_MULTIPLIER = 1.5;

/** 신속처리 치과도착 = 주문일 + N영업일 */
export const PRACTICE_RUSH_ARRIVAL_BUSINESS_DAYS = 2;

/** 일반 기공의뢰 최소 작업+배송(영업일) = 2+2 */
export const PRACTICE_NORMAL_MIN_WORK_PLUS_SHIP_DAYS = 4;

export const PRACTICE_RUSH_COURIER_DISCLAIMER =
  "택배 사정에 따라 도착이 늦어질 수 있으며 도착을 보장하지 않습니다.";

export const PRACTICE_NORMAL_MIN_PERIOD_MESSAGE =
  "납품 기일은 작업+배송 2+2영업일 이상이어야 합니다.";

export function normalizeRushFeeMultiplier(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 1) return 1;
  if (Math.abs(n - PRACTICE_RUSH_FEE_MULTIPLIER) < 0.001) {
    return PRACTICE_RUSH_FEE_MULTIPLIER;
  }
  return 1;
}

export function resolveRushFeeMultiplier({
  rushProcessing = false,
  rushFeeMultiplier = undefined,
} = {}) {
  const fromBilling = normalizeRushFeeMultiplier(rushFeeMultiplier);
  if (fromBilling > 1) return fromBilling;
  return rushProcessing ? PRACTICE_RUSH_FEE_MULTIPLIER : 1;
}

export function isPracticeTransferRushProcessing(transfer) {
  if (transfer?.production?.rushProcessing === true) return true;
  return normalizeRushFeeMultiplier(transfer?.billing?.rushFeeMultiplier) > 1;
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

/**
 * 프론트 kstYmdDiffBusinessDays와 동일(월~금, 공휴일 미제외).
 * from 다음날~to 영업일 수. 같은 날=0.
 */
export function countWeekdayBusinessDays(fromYmd, toYmd) {
  const from = String(fromYmd || "").trim();
  const to = String(toYmd || "").trim();
  if (!parseYmdParts(from) || !parseYmdParts(to)) return null;
  if (from === to) return 0;
  if (to < from) {
    const forward = countWeekdayBusinessDays(to, from);
    return forward == null ? null : -forward;
  }
  let count = 0;
  let cursor = addOneCivilDayYmd(from);
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

/** 신속처리: 주문일+2영업일(공휴일 반영). */
export async function resolveRushArrivalYmd(orderYmd, now = new Date()) {
  const start = String(orderYmd || "").trim() || toKstYmd(now) || null;
  if (!start) return null;
  return addKoreanBusinessDays({
    startYmd: start,
    days: PRACTICE_RUSH_ARRIVAL_BUSINESS_DAYS,
  });
}

/**
 * 생성 시 납품기일 검증·신속처리 도착일 강제.
 * @returns {{ ok: true, transferMemo, rushFeeMultiplier } | { ok: false, statusCode, message, reason }}
 */
export async function resolvePracticeTransferArrivalPolicy({
  transferMemo,
  rushProcessing = false,
  now = new Date(),
}) {
  let memo = String(transferMemo || "");
  const orderYmd = parseOrderYmdFromMemo(memo) || toKstYmd(now);
  let arrivalYmd = parseArrivalYmdFromMemo(memo);
  const rush = Boolean(rushProcessing);
  const rushFeeMultiplier = resolveRushFeeMultiplier({ rushProcessing: rush });

  if (rush) {
    const locked = await resolveRushArrivalYmd(orderYmd, now);
    if (!locked) {
      return {
        ok: false,
        statusCode: 400,
        message: "신속처리 도착일을 계산할 수 없습니다.",
        reason: "rush_arrival_unresolved",
      };
    }
    arrivalYmd = locked;
    memo = upsertMemoArrivalYmd(memo, locked);
    return {
      ok: true,
      transferMemo: memo,
      rushFeeMultiplier,
      arrivalYmd,
      orderYmd,
    };
  }

  const days = countWeekdayBusinessDays(orderYmd, arrivalYmd);
  if (days == null || days < PRACTICE_NORMAL_MIN_WORK_PLUS_SHIP_DAYS) {
    return {
      ok: false,
      statusCode: 400,
      message: PRACTICE_NORMAL_MIN_PERIOD_MESSAGE,
      reason: "practice_work_period_too_short",
      orderYmd,
      arrivalYmd,
      workPlusShipDays: days,
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

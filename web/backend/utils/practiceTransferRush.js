// related files:
// - web/backend/utils/labFeeSchedule.js
// - web/backend/services/practiceTransferProduction.service.js
// - web/backend/services/practiceTransferBilling.service.js
// - web/frontend/src/shared/practice/practiceWorkPeriod.ts
// change-log:
// - 2026-08-17: 신속처리 할증 기본 1.2·(1,2] 정규화. SystemSettings 설정값 반영.
// - 2026-08-17: 신속처리=합계≤3영업일 허용(선택 도착일 유지). 일반은 2+2 이상.
// - 2026-08-17: 기공의뢰 신속처리(의뢰+2일·기공/어벗 할증). 일반 건은 묶음출고만.

import { addKoreanBusinessDays, toKstYmd } from "../controllers/requests/utils.js";

/** 신속처리 할증 기본(플랫폼 설정 없을 때). SystemSettings.creditSettings.practiceRushFeeMultiplier */
export const PRACTICE_RUSH_FEE_MULTIPLIER = 1.2;

/** 신속처리 기본 치과도착 = 주문일 + N영업일(도착일 미지정·초과 시) */
export const PRACTICE_RUSH_ARRIVAL_BUSINESS_DAYS = 2;

/** 신속처리 허용 최대 작업+배송(영업일) */
export const PRACTICE_RUSH_MAX_WORK_PLUS_SHIP_DAYS = 3;

/** 일반 기공의뢰 최소 작업+배송(영업일) = 2+2 */
export const PRACTICE_NORMAL_MIN_WORK_PLUS_SHIP_DAYS = 4;

export const PRACTICE_RUSH_COURIER_DISCLAIMER =
  "택배 사정으로 도착을 보장하지 않습니다.";

export const PRACTICE_NORMAL_MIN_PERIOD_MESSAGE =
  "납품 기일은 작업+배송 2+2영업일 이상이어야 합니다. 3영업일 이하는 신속처리로 진행하세요.";

/** 청구/스냅샷용. 1 이하면 1, (1,2]는 소수 둘째 자리. */
export function normalizeRushFeeMultiplier(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 1) return 1;
  return Math.min(2, Math.round(n * 100) / 100);
}

/** 플랫폼 설정값. 비정상이면 기본 배수. */
export function normalizeConfiguredRushFeeMultiplier(value) {
  const n = normalizeRushFeeMultiplier(value);
  return n > 1 ? n : PRACTICE_RUSH_FEE_MULTIPLIER;
}

export function resolveRushFeeMultiplier({
  rushProcessing = false,
  rushFeeMultiplier = undefined,
  configuredMultiplier = undefined,
} = {}) {
  const fromBilling = normalizeRushFeeMultiplier(rushFeeMultiplier);
  if (fromBilling > 1) return fromBilling;
  if (!rushProcessing) return 1;
  return normalizeConfiguredRushFeeMultiplier(configuredMultiplier);
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

  if (rush) {
    const days = countWeekdayBusinessDays(orderYmd, arrivalYmd);
    const withinRush =
      days != null &&
      days >= 0 &&
      days <= PRACTICE_RUSH_MAX_WORK_PLUS_SHIP_DAYS;
    if (!withinRush) {
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
    }
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

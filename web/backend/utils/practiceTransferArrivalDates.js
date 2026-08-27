// change-log:
// - 2026-08-27: 재도착일 — 오늘(KST) 이후는 하나만. 다시 고르면 교체(과거·오늘 이력만 캘린더 유지).
// - 2026-08-27: 치과도착일 누적(arrivalDates). 최종일=배열 끝·메모 태그. 신규 전송 없이 캘린더 다중 표시.
// related files:
// - web/backend/utils/practiceTransferRush.js
// - web/backend/utils/practiceTransferCalendarRange.util.js
// - web/backend/models/practiceTransfer.model.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js

import { toKstYmd } from "../controllers/requests/utils.js";
import {
  parseArrivalYmdFromMemo,
  upsertMemoArrivalYmd,
} from "./practiceTransferRush.js";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 쉐이드 변경 등 — 오늘(KST) 기준 기본 연기 일수(달력일). */
export const PRACTICE_ARRIVAL_SHADE_EXTEND_CIVIL_DAYS = 7;

/**
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizePracticeArrivalDates(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of value) {
    const ymd = String(raw || "").trim();
    if (!YMD_RE.test(ymd) || seen.has(ymd)) continue;
    seen.add(ymd);
    out.push(ymd);
  }
  return out;
}

/**
 * @param {string|null|undefined} ymd
 * @param {number} days
 */
export function addCivilDaysYmd(ymd, days) {
  const raw = String(ymd || "").trim();
  if (!YMD_RE.test(raw)) return null;
  const [y, m, d] = raw.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + Number(days || 0), 12));
  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/**
 * 문서·메모에서 도착일 이력 복원. 없으면 메모 최종일로 시드.
 * @param {{ arrivalDates?: unknown, transferMemo?: unknown } | null | undefined} doc
 * @returns {string[]}
 */
export function resolvePracticeArrivalDates(doc) {
  const fromField = normalizePracticeArrivalDates(doc?.arrivalDates);
  const memoYmd = parseArrivalYmdFromMemo(doc?.transferMemo) || "";
  if (fromField.length === 0) {
    return memoYmd ? [memoYmd] : [];
  }
  if (memoYmd && fromField[fromField.length - 1] !== memoYmd) {
    if (fromField.includes(memoYmd)) {
      return [...fromField.filter((d) => d !== memoYmd), memoYmd];
    }
    return [...fromField, memoYmd];
  }
  return fromField;
}

/**
 * @param {string[]} arrivalDates
 */
export function resolveCurrentArrivalYmd(arrivalDates) {
  const list = normalizePracticeArrivalDates(arrivalDates);
  return list.length ? list[list.length - 1] : null;
}

/**
 * 동일 전송에 재도착일 반영. 새 transfer/과금 없음.
 * 오늘(KST) 이후 날짜는 최종 1개만 — 다시 고르면 교체. 오늘 이전·오늘 이력은 캘린더용으로 유지.
 * @returns {{
 *   ok: true,
 *   arrivalDates: string[],
 *   previousYmd: string | null,
 *   nextYmd: string,
 *   transferMemo: string,
 *   unchanged: boolean,
 * } | { ok: false, statusCode: number, message: string, reason: string }}
 */
export function appendPracticeArrivalDate({
  transferMemo,
  arrivalDates,
  nextYmd,
  now = new Date(),
  offsetCivilDays = PRACTICE_ARRIVAL_SHADE_EXTEND_CIVIL_DAYS,
} = {}) {
  const memo = String(transferMemo || "");
  const currentList = resolvePracticeArrivalDates({
    arrivalDates,
    transferMemo: memo,
  });
  const previousYmd = resolveCurrentArrivalYmd(currentList);

  let next = String(nextYmd || "").trim();
  if (!next) {
    const today = toKstYmd(now);
    next = addCivilDaysYmd(today, offsetCivilDays) || "";
  }
  if (!YMD_RE.test(next)) {
    return {
      ok: false,
      statusCode: 400,
      message: "치과도착일 형식이 올바르지 않습니다.",
      reason: "invalid_arrival_ymd",
    };
  }

  const todayYmd = toKstYmd(now) || "";
  if (todayYmd && next < todayYmd) {
    return {
      ok: false,
      statusCode: 400,
      message: "재도착일은 오늘 이후로 선택해 주세요.",
      reason: "arrival_before_today",
    };
  }

  // 오늘 이후는 최종 1개만(교체). 오늘·과거만 이력으로 남김.
  const historical = currentList
    .filter((d) => d !== next && (!todayYmd || d <= todayYmd))
    .sort();
  const nextList = [...historical, next];

  const unchanged =
    Boolean(previousYmd) &&
    next === previousYmd &&
    nextList.length === currentList.length &&
    nextList.every((d, i) => d === currentList[i]);

  if (unchanged) {
    return {
      ok: true,
      arrivalDates: nextList,
      previousYmd,
      nextYmd: next,
      transferMemo: upsertMemoArrivalYmd(memo, next),
      unchanged: true,
    };
  }

  return {
    ok: true,
    arrivalDates: nextList,
    previousYmd,
    nextYmd: next,
    transferMemo: upsertMemoArrivalYmd(memo, next),
    unchanged: false,
  };
}

/**
 * 오늘(KST) 이후 날짜가 여러 개면 최종(배열 끝)만 남기고 정리.
 * @param {unknown} arrivalDates
 * @param {Date} [now]
 * @returns {string[]}
 */
export function compactPracticeArrivalDatesToSingleFuture(
  arrivalDates,
  now = new Date(),
) {
  const list = normalizePracticeArrivalDates(arrivalDates);
  if (list.length <= 1) return list;
  const todayYmd = toKstYmd(now) || "";
  const current = list[list.length - 1];
  const historical = list
    .filter((d) => d !== current && (!todayYmd || d <= todayYmd))
    .sort();
  return [...historical, current];
}

/**
 * 생성·수정 시 메모 최종 도착일로 이력 맞춤(최초는 단건, 변경 시 누적).
 * @returns {string[]}
 */
export function syncArrivalDatesWithMemoYmd({
  previousArrivalDates,
  previousMemo,
  nextMemo,
} = {}) {
  const nextYmd = parseArrivalYmdFromMemo(nextMemo) || "";
  if (!nextYmd) {
    return resolvePracticeArrivalDates({
      arrivalDates: previousArrivalDates,
      transferMemo: previousMemo,
    });
  }
  const seeded = resolvePracticeArrivalDates({
    arrivalDates: previousArrivalDates,
    transferMemo: previousMemo || nextMemo,
  });
  const result = appendPracticeArrivalDate({
    transferMemo: nextMemo,
    arrivalDates: seeded,
    nextYmd,
  });
  if (!result.ok) return seeded.length ? seeded : [nextYmd];
  return result.arrivalDates;
}

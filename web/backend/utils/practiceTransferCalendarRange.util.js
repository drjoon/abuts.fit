// change-log:
// - 2026-08-28: $expr/$regexFind 제거 — orderDates/arrivalDates elemMatch + 레거시 createdAt.
// - 2026-08-28: 캘린더 응답 post-filter(해석된 일자·미확인 OR) 헬퍼.
// - 2026-08-27: 주문일 누적(orderDates) — 구간 내 아무 날짜라도 매칭
// - 2026-08-27: 치과도착일 누적(arrivalDates) — 구간 내 아무 날짜라도 매칭
// - 2026-08-27: 캘린더 3주 필터에 미확인(전 기간) OR 병합 헬퍼 추가
// - 2026-08-27: 캘린더 표시 구간(fromYmd~toYmd) + 주문일/치과도착일 Mongo 필터 SSOT
// related files:
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/frontend/src/shared/practice/labReceiveCalendarYmdRange.ts
// - web/backend/utils/labReceiveCalendarDateKey.util.js
// - web/backend/utils/practiceTransferRush.js
// - web/backend/utils/practiceTransferArrivalDates.js

import { normalizeLabReceiveCalendarDateKey } from "./labReceiveCalendarDateKey.util.js";
import {
  addCivilDaysYmd,
  resolvePracticeArrivalDates,
  resolvePracticeOrderDates,
} from "./practiceTransferArrivalDates.js";

export const PRACTICE_TRANSFER_CALENDAR_RANGE_MAX = 3000;

/** 레거시(일자 배열 없음) — 메모 일자와 createdAt 어긋남 흡수 */
const LEGACY_CREATED_AT_PAD_DAYS = 14;

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 순환 import 없이 KST YMD만 (krBusinessDays/HolidayCache 비의존) */
const toKstYmdLoose = (value) => {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

/**
 * @param {Record<string, unknown>} query
 * @returns {{ fromYmd: string, toYmd: string, dateKey: "orderDate"|"arrivalDate" } | null}
 */
export function parsePracticeTransferCalendarRangeQuery(query = {}) {
  const fromYmd = String(query.fromYmd || query.from || "").trim();
  const toYmd = String(query.toYmd || query.to || "").trim();
  if (!YMD_RE.test(fromYmd) || !YMD_RE.test(toYmd)) return null;
  if (fromYmd > toYmd) return null;
  const dateKey = normalizeLabReceiveCalendarDateKey(query.dateKey);
  return { fromYmd, toYmd, dateKey };
}

/**
 * 화면 3주 날짜 필터 ∪ 미확인(사이드바 배지와 동일 집합).
 * 창 밖 미확인이 캘린더 조회에서 빠지지 않게 한다.
 * @param {Record<string, unknown>} calendarFilter
 * @param {Record<string, unknown>} unreadFilter
 */
export function mergeCalendarRangeWithUnreadFilter(calendarFilter, unreadFilter) {
  return {
    $or: [calendarFilter, unreadFilter],
  };
}

/**
 * 인덱스 친화 필터. $expr/$regexFind 없음.
 * - 누적 일자 배열: $elemMatch
 * - 배열 없는 레거시: createdAt 창(±pad) — 응답 전 post-filter로 정밀화
 * @param {{ fromYmd: string, toYmd: string, dateKey: "orderDate"|"arrivalDate" }} range
 */
export function buildPracticeTransferCalendarDateRangeFilter(range) {
  const fromYmd = String(range?.fromYmd || "").trim();
  const toYmd = String(range?.toYmd || "").trim();
  const dateKey = normalizeLabReceiveCalendarDateKey(range?.dateKey);
  if (!YMD_RE.test(fromYmd) || !YMD_RE.test(toYmd)) {
    return null;
  }

  const linkedField = dateKey === "orderDate" ? "orderDates" : "arrivalDates";
  const legacyFromYmd =
    addCivilDaysYmd(fromYmd, -LEGACY_CREATED_AT_PAD_DAYS) || fromYmd;
  const legacyToYmd =
    addCivilDaysYmd(toYmd, LEGACY_CREATED_AT_PAD_DAYS) || toYmd;
  const legacyFromDate = new Date(`${legacyFromYmd}T00:00:00.000+09:00`);
  const legacyToDate = new Date(`${legacyToYmd}T23:59:59.999+09:00`);

  return {
    $or: [
      {
        [linkedField]: { $elemMatch: { $gte: fromYmd, $lte: toYmd } },
      },
      {
        $and: [
          {
            $or: [
              { [linkedField]: { $exists: false } },
              { [linkedField]: null },
              { [linkedField]: [] },
            ],
          },
          {
            createdAt: {
              $gte: legacyFromDate,
              $lte: legacyToDate,
            },
          },
        ],
      },
    ],
  };
}

/**
 * 해석된 주문일/도착일이 구간에 걸치는지(메모 시드 포함).
 * @param {object} doc
 * @param {{ fromYmd: string, toYmd: string, dateKey: "orderDate"|"arrivalDate" }} range
 */
export function practiceTransferIntersectsCalendarRange(doc, range) {
  const fromYmd = String(range?.fromYmd || "").trim();
  const toYmd = String(range?.toYmd || "").trim();
  if (!YMD_RE.test(fromYmd) || !YMD_RE.test(toYmd)) return false;
  const dateKey = normalizeLabReceiveCalendarDateKey(range?.dateKey);
  const linked =
    dateKey === "orderDate"
      ? resolvePracticeOrderDates(doc)
      : resolvePracticeArrivalDates(doc);
  if (linked.length > 0) {
    return linked.some((ymd) => ymd >= fromYmd && ymd <= toYmd);
  }
  const createdYmd = toKstYmdLoose(doc?.createdAt);
  return Boolean(createdYmd && createdYmd >= fromYmd && createdYmd <= toYmd);
}

/**
 * Mongo 레거시 창을 넓게 잡은 뒤 정밀 필터.
 * keepExtra: 미확인 등 창 밖이어도 남겨야 하는 문서.
 * @param {object[]} docs
 * @param {{ fromYmd: string, toYmd: string, dateKey: "orderDate"|"arrivalDate" }} range
 * @param {{ keepExtra?: (doc: object) => boolean }} [options]
 */
export function filterTransferDocsToCalendarRange(docs, range, options = {}) {
  const list = Array.isArray(docs) ? docs : [];
  const keepExtra =
    typeof options.keepExtra === "function" ? options.keepExtra : null;
  return list.filter((doc) => {
    if (keepExtra?.(doc)) return true;
    return practiceTransferIntersectsCalendarRange(doc, range);
  });
}

/** 캘린더 목록 Mongo projection — 파일·치식·생산 메타만 */
export const PRACTICE_TRANSFER_CALENDAR_LIST_SELECT = {
  transferId: 1,
  transferMemo: 1,
  tag: 1,
  status: 1,
  matchingMode: 1,
  autoMatch: 1,
  targetLabAnchorId: 1,
  targetLabName: 1,
  practiceBusinessAnchorId: 1,
  practiceUserId: 1,
  orderDates: 1,
  arrivalDates: 1,
  toothWorks: 1,
  files: 1,
  resultFiles: 1,
  production: 1,
  billing: 1,
  remake: 1,
  remakeSourceTransferId: 1,
  isRemake: 1,
  requestorReadAt: 1,
  requestorDownloadedAt: 1,
  workCanceledAt: 1,
  labRejectedAt: 1,
  labRejectedByLabAnchorId: 1,
  createdAt: 1,
  updatedAt: 1,
};

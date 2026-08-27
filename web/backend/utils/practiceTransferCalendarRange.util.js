// change-log:
// - 2026-08-27: 캘린더 3주 필터에 미확인(전 기간) OR 병합 헬퍼 추가
// - 2026-08-27: 캘린더 표시 구간(fromYmd~toYmd) + 주문일/치과도착일 Mongo 필터 SSOT
// related files:
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/frontend/src/shared/practice/labReceiveCalendarYmdRange.ts
// - web/backend/utils/labReceiveCalendarDateKey.util.js
// - web/backend/utils/practiceTransferRush.js

import { normalizeLabReceiveCalendarDateKey } from "./labReceiveCalendarDateKey.util.js";

export const PRACTICE_TRANSFER_CALENDAR_RANGE_MAX = 3000;

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

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
 * transferMemo 주문일/치과도착일 파싱 실패 시 createdAt KST YMD로 대체.
 * @param {{ fromYmd: string, toYmd: string, dateKey: "orderDate"|"arrivalDate" }} range
 */
export function buildPracticeTransferCalendarDateRangeFilter(range) {
  const fromYmd = String(range?.fromYmd || "").trim();
  const toYmd = String(range?.toYmd || "").trim();
  const dateKey = normalizeLabReceiveCalendarDateKey(range?.dateKey);
  if (!YMD_RE.test(fromYmd) || !YMD_RE.test(toYmd)) {
    return null;
  }

  const memoRegex =
    dateKey === "orderDate"
      ? "\\[\\s*주문일\\s*:\\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\\s*\\]"
      : "\\[\\s*(?:치과도착일|도착일)\\s*:\\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\\s*\\]";

  return {
    $expr: {
      $let: {
        vars: {
          memoYmd: {
            $let: {
              vars: {
                matched: {
                  $regexFind: {
                    input: { $ifNull: ["$transferMemo", ""] },
                    regex: memoRegex,
                    options: "i",
                  },
                },
              },
              in: {
                $cond: [
                  { $ne: ["$$matched", null] },
                  { $arrayElemAt: ["$$matched.captures", 0] },
                  null,
                ],
              },
            },
          },
          createdYmd: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt",
              timezone: "Asia/Seoul",
            },
          },
        },
        in: {
          $let: {
            vars: {
              anchorYmd: { $ifNull: ["$$memoYmd", "$$createdYmd"] },
            },
            in: {
              $and: [
                { $ne: ["$$anchorYmd", null] },
                { $gte: ["$$anchorYmd", fromYmd] },
                { $lte: ["$$anchorYmd", toYmd] },
              ],
            },
          },
        },
      },
    },
  };
}

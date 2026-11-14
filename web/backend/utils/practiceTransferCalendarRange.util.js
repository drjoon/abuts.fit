// change-log:
// - 2026-11-14: 캘린더 projection은 환자·치아·날짜·단계 판정용 개수만. 파일 본문은 열 때.
// - 2026-11-14: 캘린더 조회는 일자 인덱스 두 갈래(elemMatch·레거시 createdAt). 파일 본문 제외 인덱스 projection.
// - 2026-09-23: CALENDAR_LIST_SELECT에 assigneeLab*·assigneeKind — 협력 표시「어벗츠 · 파트너」.
// - 2026-09-15: CALENDAR_LIST_SELECT에 prosthesisFeeStages — 단계별 견적 스냅샷.
// - 2026-09-12: CALENDAR_LIST_SELECT에 trashedFiles — 상세 모달 휴지통 타일 유지.
// - 2026-09-11: 캘린더 창 ∪ 미확인·미처리(작업시작 전) 전 기간 OR.
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
 * 화면 날짜 필터 ∪ 주의 건(미확인·미처리 등).
 * 창 밖 건이 캘린더 조회에서 빠지지 않게 한다.
 * @param {Record<string, unknown>} calendarFilter
 * @param {Record<string, unknown>} attentionFilter
 */
export function mergeCalendarRangeWithAttentionFilter(
  calendarFilter,
  attentionFilter,
) {
  return {
    $or: [calendarFilter, attentionFilter],
  };
}

/** @deprecated mergeCalendarRangeWithAttentionFilter 사용 */
export function mergeCalendarRangeWithUnreadFilter(calendarFilter, unreadFilter) {
  return mergeCalendarRangeWithAttentionFilter(calendarFilter, unreadFilter);
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
 * keepExtra: 미확인·미처리 등 창 밖이어도 남겨야 하는 문서.
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

/**
 * 캘린더 창을 정렬 스캔 없이 읽는다.
 * arrivalDates/orderDates 인덱스와 createdAt 인덱스를 각각 타고, 합친 뒤 정밀 필터.
 * @param {import("mongoose").Model} Model
 * @param {{ baseFilter?: object, range: { fromYmd: string, toYmd: string, dateKey?: string }, select?: object, limit?: number }} options
 */
export async function findPracticeTransferDocsInCalendarRange(Model, options = {}) {
  const range = options.range;
  const fromYmd = String(range?.fromYmd || "").trim();
  const toYmd = String(range?.toYmd || "").trim();
  if (!YMD_RE.test(fromYmd) || !YMD_RE.test(toYmd) || fromYmd > toYmd) return [];

  const dateKey = normalizeLabReceiveCalendarDateKey(range?.dateKey);
  const linkedField = dateKey === "orderDate" ? "orderDates" : "arrivalDates";
  const legacyFromYmd =
    addCivilDaysYmd(fromYmd, -LEGACY_CREATED_AT_PAD_DAYS) || fromYmd;
  const legacyToYmd = addCivilDaysYmd(toYmd, LEGACY_CREATED_AT_PAD_DAYS) || toYmd;
  const legacyFromDate = new Date(`${legacyFromYmd}T00:00:00.000+09:00`);
  const legacyToDate = new Date(`${legacyToYmd}T23:59:59.999+09:00`);
  const limit = Math.max(1, Number(options.limit) || PRACTICE_TRANSFER_CALENDAR_RANGE_MAX);
  const baseFilter =
    options.baseFilter && typeof options.baseFilter === "object"
      ? options.baseFilter
      : {};
  const select = options.select && typeof options.select === "object" ? options.select : null;

  const run = (extra) => {
    let query = Model.find({ $and: [baseFilter, extra] });
    if (select) query = query.select(select);
    return query.limit(limit).lean();
  };

  const [dated, legacy] = await Promise.all([
    run({ [linkedField]: { $elemMatch: { $gte: fromYmd, $lte: toYmd } } }),
    run({
      $or: [
        { [linkedField]: { $exists: false } },
        { [linkedField]: null },
        { [linkedField]: [] },
      ],
      createdAt: { $gte: legacyFromDate, $lte: legacyToDate },
    }),
  ]);

  const seen = new Set();
  const merged = [];
  for (const doc of [...dated, ...legacy]) {
    const id = String(doc?._id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    merged.push(doc);
  }
  return filterTransferDocsToCalendarRange(merged, { fromYmd, toYmd, dateKey });
}

/**
 * 캘린더 첫 화면용 projection.
 * 환자·치아·날짜·단계 판정(디자인/보철 개수)만. 파일 이름·키·수가 라인은 열 때 다시 읽는다.
 */
export const PRACTICE_TRANSFER_CALENDAR_INDEX_SELECT = {
  transferId: 1,
  transferMemo: 1,
  tag: 1,
  status: 1,
  matchingMode: 1,
  "autoMatch.completedAt": 1,
  "autoMatch.deadlineAt": 1,
  "autoMatch.claimedAt": 1,
  "autoMatch.declinedLabAnchorIds": 1,
  "autoMatch.subcontractPoolOpen": 1,
  targetLabAnchorId: 1,
  targetLabName: 1,
  assigneeLabAnchorId: 1,
  assigneeLabName: 1,
  assigneeKind: 1,
  practiceBusinessAnchorId: 1,
  practiceUserId: 1,
  orderDates: 1,
  arrivalDates: 1,
  arrivalDeadlineExpiredAt: 1,
  toothWorks: 1,
  prosthesisFollowUps: 1,
  crownFabrication: 1,
  "files.patientName": 1,
  "files.tooth": 1,
  "resultFiles.file.s3Key": 1,
  "production.skipDesignConfirm": 1,
  "production.skipJig": 1,
  "production.designReadyAt": 1,
  "production.designFiles.file.s3Key": 1,
  "production.confirmedAt": 1,
  isRemake: 1,
  remake: 1,
  remakeSourceTransferId: 1,
  requestorReadAt: 1,
  requestorDownloadedAt: 1,
  workCanceledAt: 1,
  labRejectedAt: 1,
  labRejectedByLabAnchorId: 1,
  createdAt: 1,
};

/** 캘린더·목록 Mongo projection — 파일·치식·생산·과금 메타(전체 Mixed 제외) */
export const PRACTICE_TRANSFER_CALENDAR_LIST_SELECT = {
  transferId: 1,
  transferMemo: 1,
  tag: 1,
  status: 1,
  matchingMode: 1,
  "autoMatch.completedAt": 1,
  "autoMatch.deadlineAt": 1,
  targetLabAnchorId: 1,
  targetLabName: 1,
  // 협력/하청 표시·수수료 — 누락 시 redact가 원청「어벗츠기공소」만 반환
  assigneeLabAnchorId: 1,
  assigneeLabName: 1,
  assigneeKind: 1,
  practiceBusinessAnchorId: 1,
  practiceUserId: 1,
  orderDates: 1,
  arrivalDates: 1,
  arrivalDeadlineExpiredAt: 1,
  toothWorks: 1,
  labRequestStagePlans: 1,
  prosthesisFollowUps: 1,
  prosthesisFeeStages: 1,
  files: 1,
  trashedFiles: 1,
  resultFiles: 1,
  // production 전체 대신 나열한다. workScanAutoAlign(워커 상태)은 목록에 쓰지 않는다.
  "production.shippingMode": 1,
  "production.rushProcessing": 1,
  "production.skipDesignConfirm": 1,
  "production.skipJig": 1,
  "production.designFiles": 1,
  "production.labWorkScanFiles": 1,
  "production.workScanAlignment": 1,
  "production.caDesignUploadCountByTooth": 1,
  "production.designReadyAt": 1,
  "production.labDesignConfirmedAt": 1,
  "production.labDesignConfirmedBy": 1,
  "production.practiceDesignConfirmedAt": 1,
  "production.practiceDesignConfirmedBy": 1,
  "production.abutmentProductionStartedAt": 1,
  "production.abutmentShipYmd": 1,
  "production.confirmedAt": 1,
  "production.confirmedBy": 1,
  "production.relatedRequestIds": 1,
  "billing.heldAt": 1,
  "billing.billedAt": 1,
  "billing.settledAt": 1,
  "billing.labSettledAt": 1,
  "billing.abutmentSettledAt": 1,
  "billing.total": 1,
  "billing.labFeeTotal": 1,
  "billing.labAbutmentTotal": 1,
  "billing.abutmentRetailTotal": 1,
  "billing.tempCreditLabFeeTotal": 1,
  "billing.finalLabFeeTotal": 1,
  "billing.feeRateApplied": 1,
  "billing.relationshipKind": 1,
  "billing.lines": 1,
  remake: 1,
  remakeCharges: 1,
  remakeSourceTransferId: 1,
  isRemake: 1,
  manufacturerStage: 1,
  requestorReadAt: 1,
  requestorDownloadedAt: 1,
  requestorDownloadedBy: 1,
  labTechnicianUserId: 1,
  labTechnicianName: 1,
  workCanceledAt: 1,
  labRejectedAt: 1,
  labRejectedByLabAnchorId: 1,
  labBasketTag: 1,
  createdAt: 1,
  updatedAt: 1,
};

/** GET /my page 목록 — autoMatch·billing 전체 포함(subpath와 상위 경로 혼용 금지) */
export const PRACTICE_TRANSFER_MY_LIST_SELECT = (() => {
  const out = { ...PRACTICE_TRANSFER_CALENDAR_LIST_SELECT, autoMatch: 1, billing: 1 };
  for (const k of Object.keys(out)) {
    if (k.startsWith("autoMatch.") || k.startsWith("billing.")) delete out[k];
  }
  return out;
})();

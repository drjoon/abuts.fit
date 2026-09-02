// related files:
// - web/backend/services/practiceTransferComplete.service.js
// - web/backend/utils/practiceTransferArrivalDates.js
// change-log:
// - 2026-09-02: 치과도착일 경과 — CA 어벗 미업로드는 자동완료 제외·기한만료 대상.
import { isAutoMatchCompleted } from "./practiceTransferAutoMatchCore.js";
import { isPracticeTransferDeletedStatus } from "./practiceTransferStage.js";
import { practiceTransferNeedsMoreAbutmentDesigns } from "../services/practiceTransferProduction.service.js";
import {
  resolveCurrentArrivalYmd,
  resolvePracticeArrivalDates,
} from "./practiceTransferArrivalDates.js";

/**
 * 현재 치과도착일(YMD). arrivalDates 끝값 또는 메모 태그.
 * @param {object|null|undefined} doc
 */
export function resolvePracticeTransferCurrentArrivalYmd(doc) {
  return resolveCurrentArrivalYmd(resolvePracticeArrivalDates(doc));
}

/**
 * 도착일이 지났는지(당일 포함 이전은 false → 재지정으로 기한 연장 가능).
 * @param {string|null|undefined} arrivalYmd
 * @param {string|null|undefined} todayYmd
 */
export function isPracticeArrivalDatePast(arrivalYmd, todayYmd) {
  const arrival = String(arrivalYmd || "").trim();
  const today = String(todayYmd || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(arrival)) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return false;
  return arrival < today;
}

/**
 * 수락·미완료·도착일 경과 → 자동 작업완료 대상.
 * 커스텀어벗 STL이 더 필요하면 제외(기한만료 경로).
 * @param {object|null|undefined} doc
 * @param {string} todayYmd
 */
export function isPracticeTransferDueForArrivalAutoComplete(doc, todayYmd) {
  if (!doc) return false;
  if (isPracticeTransferDeletedStatus(doc.status)) return false;
  if (!doc.requestorDownloadedAt) return false;
  if (isAutoMatchCompleted(doc)) return false;
  if (doc.arrivalDeadlineExpiredAt) return false;
  if (practiceTransferNeedsMoreAbutmentDesigns(doc)) return false;
  const arrivalYmd = resolvePracticeTransferCurrentArrivalYmd(doc);
  return isPracticeArrivalDatePast(arrivalYmd, todayYmd);
}

/**
 * 수락·미완료·도착일 경과·어벗 디자인 STL 미완 → 기한만료 대상.
 * @param {object|null|undefined} doc
 * @param {string} todayYmd
 */
export function isPracticeTransferDueForArrivalDeadlineExpire(doc, todayYmd) {
  if (!doc) return false;
  if (isPracticeTransferDeletedStatus(doc.status)) return false;
  if (!doc.requestorDownloadedAt) return false;
  if (isAutoMatchCompleted(doc)) return false;
  if (doc.arrivalDeadlineExpiredAt) return false;
  if (!practiceTransferNeedsMoreAbutmentDesigns(doc)) return false;
  const arrivalYmd = resolvePracticeTransferCurrentArrivalYmd(doc);
  return isPracticeArrivalDatePast(arrivalYmd, todayYmd);
}

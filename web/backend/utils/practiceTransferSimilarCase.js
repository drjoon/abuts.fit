// related files:
// - web/backend/utils/remakePricingPolicy.js
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/frontend/src/shared/components/practice/PracticeSimilarCaseRemakeDialog.tsx
// change-log:
// - 2026-09-21: 감지 기본=무료기간 상한(년×365). 수가 창은 lab freeRemakeYears.
// - 2026-09-14: 감지 창=리메이크 정책 창(180일) 통일.
// - 2026-09-14: 신규 작성 시 동일 환자·치아 감지(리메이크 확인).

import { toKstYmd } from "./krBusinessDays.js";
import {
  isWithinLabFreeRemakeWindow,
  normalizeFreeRemakeYears,
  REMAKE_POLICY_WINDOW_DAYS,
  FREE_REMAKE_YEARS_MAX,
} from "./remakePricingPolicy.js";

/** 동일건 감지 기본 일수 — 기공소 무료기간 상한까지 커버 */
export const SIMILAR_CASE_DETECT_WINDOW_DAYS = 365 * FREE_REMAKE_YEARS_MAX;

export const patientNameFromTransferMemo = (memo) =>
  String(String(memo || "").match(/\[\s*환자명\s*:\s*([^\]]*)\]/)?.[1] || "")
    .trim()
    .normalize("NFC");

export const resolvePracticeTransferPatientName = (doc) => {
  const files = Array.isArray(doc?.files) ? doc.files : [];
  for (const file of files) {
    const name = String(file?.patientName || "")
      .trim()
      .normalize("NFC");
    if (name) return name;
  }
  return patientNameFromTransferMemo(doc?.transferMemo);
};

export const collectToothNumbersFromToothWorks = (toothWorks) => {
  const out = new Set();
  for (const row of Array.isArray(toothWorks) ? toothWorks : []) {
    const tooth = String(row?.toothNumber || "").trim();
    if (tooth) out.add(tooth);
    const linked = Array.isArray(row?.bridgeLinkedTeeth)
      ? row.bridgeLinkedTeeth
      : [];
    for (const linkedTooth of linked) {
      const t = String(linkedTooth || "").trim();
      if (t) out.add(t);
    }
  }
  return Array.from(out);
};

export const parseToothNumbersQuery = (raw) => {
  const parts = Array.isArray(raw)
    ? raw
    : String(raw || "")
        .split(/[,|\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
  return Array.from(
    new Set(parts.map((s) => String(s || "").trim()).filter(Boolean)),
  );
};

export const toothNumbersOverlap = (left, right) => {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length === 0) {
    return false;
  }
  const rightSet = new Set(right);
  return left.some((t) => rightSet.has(t));
};

/**
 * KST 달력 기준 감지 컷오프(지금−days 00:00+09:00).
 * @param {number} days
 * @param {Date} [now]
 */
export function similarCaseDetectCutoffDate(
  days = REMAKE_POLICY_WINDOW_DAYS,
  now = new Date(),
) {
  const nowYmd = toKstYmd(now) || toKstYmd(new Date());
  const cutoff = new Date(`${nowYmd}T00:00:00+09:00`);
  const n = Math.max(
    1,
    Math.min(
      365 * FREE_REMAKE_YEARS_MAX,
      Math.floor(Number(days) || REMAKE_POLICY_WINDOW_DAYS),
    ),
  );
  cutoff.setDate(cutoff.getDate() - n);
  return cutoff;
}

export function escapePatientNameForMemoRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * @param {object} doc
 * @param {{ freeRemakeYears?: unknown }} [opts]
 * @returns {{
 *   _id: string,
 *   transferId: string,
 *   patientName: string,
 *   toothNumbers: string[],
 *   targetLabName: string,
 *   createdAt: Date|null,
 *   orderYmd: string,
 *   freeRemakeYears: number|null,
 *   withinRemakePricingWindow: boolean,
 * }}
 */
export function toSimilarCaseMatchApi(doc, opts = {}) {
  const toothNumbers = collectToothNumbersFromToothWorks(doc?.toothWorks);
  const orderDates = Array.isArray(doc?.orderDates)
    ? doc.orderDates
        .map((d) => String(d || "").trim())
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    : [];
  const createdAt = doc?.createdAt || null;
  const freeRemakeYears = normalizeFreeRemakeYears(opts?.freeRemakeYears);
  return {
    _id: String(doc?._id || ""),
    transferId: String(doc?.transferId || "").trim(),
    patientName: resolvePracticeTransferPatientName(doc),
    toothNumbers,
    targetLabName: String(doc?.targetLabName || "").trim(),
    createdAt,
    orderYmd: orderDates[0] || toKstYmd(createdAt) || "",
    freeRemakeYears,
    withinRemakePricingWindow: isWithinLabFreeRemakeWindow(
      createdAt || orderDates[0] || null,
      freeRemakeYears,
    ),
  };
}

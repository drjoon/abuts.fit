// change-log:
// - 2026-09-13: 스토어 기공물 동봉 — 다음 치과도착일(PTX arrivalDates) + 1주일 이내 활성.
// related files:
// - web/backend/constants/storeShipping.js
// - web/backend/controllers/store/storeOrder.controller.js
// - web/backend/models/practiceTransfer.model.js
import mongoose from "mongoose";
import PracticeTransfer from "../models/practiceTransfer.model.js";
import { getTodayYmdInKst } from "./krBusinessDays.js";
import {
  addCivilDaysYmd,
  resolvePracticeArrivalDates,
} from "./practiceTransferArrivalDates.js";
import { practiceTransferNotDeletedMongoFilter } from "./practiceTransferStage.js";

/** 기공물 동봉 가능: 오늘(KST) 기준 N달력일 이내 치과 도착건. */
export const STORE_LAB_BUNDLE_WITHIN_CIVIL_DAYS = 7;

/**
 * 해당 치과의 다음(오늘 포함) 치과 도착일(KST YMD).
 * SSOT: PracticeTransfer.arrivalDates (+ 메모 시드).
 * @param {string|import("mongoose").Types.ObjectId|null|undefined} businessAnchorId
 * @returns {Promise<{
 *   nextClinicArrivalYmd: string | null,
 *   labBundleEligible: boolean,
 *   labBundleWithinDays: number,
 *   todayYmd: string,
 * }>}
 */
export async function resolveStoreLabBundleEligibility(businessAnchorId) {
  const todayYmd = getTodayYmdInKst();
  const withinDays = STORE_LAB_BUNDLE_WITHIN_CIVIL_DAYS;
  const empty = {
    nextClinicArrivalYmd: null,
    labBundleEligible: false,
    labBundleWithinDays: withinDays,
    todayYmd,
  };
  if (!businessAnchorId || !mongoose.isValidObjectId(businessAnchorId)) {
    return empty;
  }

  const oid = new mongoose.Types.ObjectId(String(businessAnchorId));
  // 탐색 창을 넉넉히 잡아 다음 도착일을 UI에 표시(활성은 7일 이내만).
  const searchToYmd = addCivilDaysYmd(todayYmd, 120) || todayYmd;

  const docs = await PracticeTransfer.find({
    practiceBusinessAnchorId: oid,
    ...practiceTransferNotDeletedMongoFilter(),
    $or: [{ workCanceledAt: null }, { workCanceledAt: { $exists: false } }],
    arrivalDates: { $elemMatch: { $gte: todayYmd, $lte: searchToYmd } },
  })
    .select({ arrivalDates: 1, transferMemo: 1 })
    .limit(80)
    .lean();

  let nextClinicArrivalYmd = null;
  for (const doc of docs) {
    for (const ymd of resolvePracticeArrivalDates(doc)) {
      if (!ymd || ymd < todayYmd) continue;
      if (!nextClinicArrivalYmd || ymd < nextClinicArrivalYmd) {
        nextClinicArrivalYmd = ymd;
      }
    }
  }

  const eligibleToYmd =
    addCivilDaysYmd(todayYmd, withinDays) || todayYmd;
  const labBundleEligible = Boolean(
    nextClinicArrivalYmd &&
      nextClinicArrivalYmd >= todayYmd &&
      nextClinicArrivalYmd <= eligibleToYmd,
  );

  return {
    nextClinicArrivalYmd,
    labBundleEligible,
    labBundleWithinDays: withinDays,
    todayYmd,
  };
}

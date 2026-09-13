// change-log:
// - 2026-09-13: 기공물 동봉=어벗츠 커스텀어벗 제작 포함 + 1주일 이내(CA 발송·PTX 치과도착).
// - 2026-09-13: 스토어 기공물 동봉 — 다음 치과도착일(PTX arrivalDates) + 1주일 이내 활성.
// related files:
// - web/backend/constants/storeShipping.js
// - web/backend/controllers/store/storeOrder.controller.js
// - web/backend/models/practiceTransfer.model.js
// - web/backend/models/request.model.js
import mongoose from "mongoose";
import PracticeTransfer from "../models/practiceTransfer.model.js";
import Request from "../models/request.model.js";
import { getTodayYmdInKst } from "./krBusinessDays.js";
import {
  addCivilDaysYmd,
  resolvePracticeArrivalDates,
} from "./practiceTransferArrivalDates.js";
import { practiceTransferNotDeletedMongoFilter } from "./practiceTransferStage.js";
import { listCustomAbutmentToothWorks } from "../services/practiceTransferProduction.service.js";

/** 기공물 동봉 가능: 오늘(KST) 기준 N달력일 이내 어벗츠 CA 발송·치과도착. */
export const STORE_LAB_BUNDLE_WITHIN_CIVIL_DAYS = 7;

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function isYmdInInclusiveWindow(ymd, fromYmd, toYmd) {
  return Boolean(
    ymd && YMD_RE.test(ymd) && ymd >= fromYmd && ymd <= toYmd,
  );
}

function minYmd(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return a < b ? a : b;
}

/**
 * 해당 치과의 다음(오늘 포함) 치과 도착일(KST YMD).
 * 동봉 가능: 어벗츠 커스텀어벗 제작이 포함된 건만.
 * - CA Request: timeline.estimatedShipYmd 가 1주일 이내 발송
 * - PTX: 커스텀어벗 치식 포함 + 치과도착일 1주일 이내
 * UI 수령 안내: PTX arrivalDates(없으면 CA 발송일).
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
  const eligibleToYmd = addCivilDaysYmd(todayYmd, withinDays) || todayYmd;
  // 탐색 창을 넉넉히 잡아 다음 도착일을 UI에 표시(활성은 7일 이내만).
  const searchToYmd = addCivilDaysYmd(todayYmd, 120) || todayYmd;

  const [caRequests, transferDocs] = await Promise.all([
    Request.find({
      manufacturerStage: { $ne: "취소" },
      "caseInfos.productMode": "custom_abutment",
      "timeline.estimatedShipYmd": {
        $gte: todayYmd,
        $lte: eligibleToYmd,
      },
      $or: [
        { "partnerBilling.practiceBusinessAnchorId": oid },
        { businessAnchorId: oid },
      ],
    })
      .select({
        timeline: 1,
        partnerBilling: 1,
      })
      .limit(40)
      .lean(),
    PracticeTransfer.find({
      practiceBusinessAnchorId: oid,
      ...practiceTransferNotDeletedMongoFilter(),
      $or: [{ workCanceledAt: null }, { workCanceledAt: { $exists: false } }],
      "toothWorks.customAbutment": true,
      arrivalDates: { $elemMatch: { $gte: todayYmd, $lte: searchToYmd } },
    })
      .select({
        arrivalDates: 1,
        transferMemo: 1,
        toothWorks: 1,
      })
      .limit(80)
      .lean(),
  ]);

  let nextClinicArrivalYmd = null;
  let nextCaShipYmd = null;
  let hasCaShipWithinWindow = false;
  let hasCaArrivalWithinWindow = false;

  for (const req of caRequests) {
    const shipYmd = String(req?.timeline?.estimatedShipYmd || "").trim();
    if (!isYmdInInclusiveWindow(shipYmd, todayYmd, eligibleToYmd)) continue;
    hasCaShipWithinWindow = true;
    nextCaShipYmd = minYmd(nextCaShipYmd, shipYmd);
  }

  for (const doc of transferDocs) {
    if (listCustomAbutmentToothWorks(doc?.toothWorks).length === 0) continue;

    for (const ymd of resolvePracticeArrivalDates(doc)) {
      if (!ymd || ymd < todayYmd) continue;
      if (!nextClinicArrivalYmd || ymd < nextClinicArrivalYmd) {
        nextClinicArrivalYmd = ymd;
      }
      if (isYmdInInclusiveWindow(ymd, todayYmd, eligibleToYmd)) {
        hasCaArrivalWithinWindow = true;
      }
    }
  }

  if (!nextClinicArrivalYmd) {
    nextClinicArrivalYmd = nextCaShipYmd;
  }

  const labBundleEligible = Boolean(
    hasCaShipWithinWindow || hasCaArrivalWithinWindow,
  );

  return {
    nextClinicArrivalYmd,
    labBundleEligible,
    labBundleWithinDays: withinDays,
    todayYmd,
  };
}

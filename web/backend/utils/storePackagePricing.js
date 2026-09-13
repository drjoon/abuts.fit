// change-log:
// - 2026-09-13: BA.storePackageBuyer 플래그 SSOT. 충전≥550만 시 자동 ON.
// - 2026-09-13: 유료 크레딧(CHARGE_PAID) 누적 ≥550만 → 스토어 pkg 구매자.
// related files:
// - web/backend/constants/storeCatalog.js
// - web/backend/models/businessAnchor.model.js
// - web/backend/controllers/store/storeOrder.controller.js
import mongoose from "mongoose";
import BusinessAnchor from "../models/businessAnchor.model.js";
import { STORE_PACKAGE_PREPAID_THRESHOLD } from "../constants/storeCatalog.js";

function toObjectId(id) {
  if (!id) return null;
  if (id instanceof mongoose.Types.ObjectId) return id;
  const s = String(id).trim();
  if (!mongoose.Types.ObjectId.isValid(s)) return null;
  return new mongoose.Types.ObjectId(s);
}

/**
 * BA.storePackageBuyer 조회(장부 재집계 없음).
 * @param {string|import("mongoose").Types.ObjectId} businessAnchorId
 * @returns {Promise<{
 *   isPackageBuyer: boolean,
 *   packageThreshold: number,
 *   storePackageBuyerAt: Date|null,
 * }>}
 */
export async function resolveStorePackageBuyer(businessAnchorId) {
  const oid = toObjectId(businessAnchorId);
  const packageThreshold = STORE_PACKAGE_PREPAID_THRESHOLD;
  if (!oid) {
    return {
      isPackageBuyer: false,
      packageThreshold,
      storePackageBuyerAt: null,
    };
  }

  const anchor = await BusinessAnchor.findById(oid)
    .select({ storePackageBuyer: 1, storePackageBuyerAt: 1 })
    .lean();

  return {
    isPackageBuyer: Boolean(anchor?.storePackageBuyer),
    packageThreshold,
    storePackageBuyerAt: anchor?.storePackageBuyerAt || null,
  };
}

/**
 * 550만 이상 충전(단건) 또는 관리자 수동 → 패키지 구매자 ON(멱등).
 * @param {{
 *   businessAnchorId: string|import("mongoose").Types.ObjectId,
 *   chargeAmount?: number,
 *   force?: boolean,
 *   session?: import("mongoose").ClientSession|null,
 * }} args
 */
export async function enableStorePackageBuyerIfEligible({
  businessAnchorId,
  chargeAmount = 0,
  force = false,
  session = null,
}) {
  const oid = toObjectId(businessAnchorId);
  if (!oid) return { updated: false, isPackageBuyer: false };

  const amount = Math.max(0, Math.round(Number(chargeAmount) || 0));
  const eligible =
    force === true || amount >= STORE_PACKAGE_PREPAID_THRESHOLD;
  if (!eligible) {
    const cur = await BusinessAnchor.findById(oid)
      .select({ storePackageBuyer: 1 })
      .session(session || null)
      .lean();
    return {
      updated: false,
      isPackageBuyer: Boolean(cur?.storePackageBuyer),
    };
  }

  const updated = await BusinessAnchor.findOneAndUpdate(
    {
      _id: oid,
      $or: [
        { storePackageBuyer: { $ne: true } },
        { storePackageBuyer: { $exists: false } },
      ],
    },
    {
      $set: {
        storePackageBuyer: true,
        storePackageBuyerAt: new Date(),
      },
    },
    { new: true, session: session || undefined },
  ).select({ storePackageBuyer: 1, storePackageBuyerAt: 1 });

  if (updated) {
    return { updated: true, isPackageBuyer: true };
  }

  return { updated: false, isPackageBuyer: true };
}

/**
 * 관리자 수동 ON/OFF.
 */
export async function setStorePackageBuyer({
  businessAnchorId,
  enabled,
  session = null,
}) {
  const oid = toObjectId(businessAnchorId);
  if (!oid) {
    const err = new Error("invalid_business_anchor");
    err.statusCode = 400;
    throw err;
  }
  const on = Boolean(enabled);
  const doc = await BusinessAnchor.findByIdAndUpdate(
    oid,
    {
      $set: {
        storePackageBuyer: on,
        storePackageBuyerAt: on ? new Date() : null,
      },
    },
    { new: true, session: session || undefined },
  )
    .select({ storePackageBuyer: 1, storePackageBuyerAt: 1, name: 1 })
    .lean();
  if (!doc) {
    const err = new Error("business_not_found");
    err.statusCode = 404;
    throw err;
  }
  return doc;
}

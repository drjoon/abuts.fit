import { Types } from "mongoose";
import BusinessAnchor from "../models/businessAnchor.model.js";
import Request from "../models/request.model.js";
import PricingReferralRolling30dAggregate from "../models/pricingReferralRolling30dAggregate.model.js";
import PricingSsotHealthSnapshot from "../models/pricingSsotHealthSnapshot.model.js";
import {
  getLast30DaysRangeUtc,
  getTodayYmdInKst,
  toKstYmd,
} from "../utils/krBusinessDays.js";

const SHIPPING_TRACKING_STAGES = [
  "shipping",
  "포장.발송",
  "tracking",
  "추적관리",
];

export const buildPricingSsotRange = (now = new Date()) => {
  const range30 = getLast30DaysRangeUtc(now);
  if (!range30) {
    throw new Error("Failed to build 30-day range.");
  }

  const startYmd = toKstYmd(range30.start);
  const endYmd = getTodayYmdInKst();
  if (!startYmd || !endYmd) {
    throw new Error("Failed to resolve KST date window.");
  }

  const startAtKst = new Date(`${startYmd}T00:00:00+09:00`);
  const endAtKst = new Date(`${endYmd}T00:00:00+09:00`);
  if (Number.isNaN(startAtKst.getTime()) || Number.isNaN(endAtKst.getTime())) {
    throw new Error("Invalid KST date conversion.");
  }

  const endExclusiveKst = new Date(endAtKst.getTime());
  endExclusiveKst.setDate(endExclusiveKst.getDate() + 1);

  return {
    startYmd,
    endYmd,
    startAtKst,
    endExclusiveKst,
  };
};

export const computePricingSsotConsistency = async () => {
  const { startYmd, endYmd, startAtKst, endExclusiveKst } =
    buildPricingSsotRange();

  const [snapshotRows, requestRows] = await Promise.all([
    PricingReferralRolling30dAggregate.find({ ymd: endYmd })
      .select({ businessAnchorId: 1, selfBusinessOrders30d: 1, computedAt: 1 })
      .lean(),
    Request.aggregate([
      {
        $match: {
          manufacturerStage: { $in: SHIPPING_TRACKING_STAGES },
          createdAt: {
            $gte: startAtKst,
            $lt: endExclusiveKst,
          },
        },
      },
      {
        $group: {
          _id: "$businessAnchorId",
          requestCount: { $sum: 1 },
        },
      },
    ]),
  ]);

  const requestCountMap = new Map(
    (requestRows || []).map((row) => [
      String(row?._id || "").trim(),
      Number(row?.requestCount || 0),
    ]),
  );

  const mismatchesRaw = (snapshotRows || [])
    .map((row) => {
      const businessAnchorId = String(row?.businessAnchorId || "").trim();
      if (!Types.ObjectId.isValid(businessAnchorId)) return null;

      const requestCount = Number(requestCountMap.get(businessAnchorId) || 0);
      const snapshotCount = Number(row?.selfBusinessOrders30d || 0);
      if (requestCount === snapshotCount) return null;

      return {
        businessAnchorId,
        requestCount,
        snapshotCount,
        gap: requestCount - snapshotCount,
        snapshotComputedAt: row?.computedAt || null,
      };
    })
    .filter(Boolean);

  const mismatchAnchorIds = mismatchesRaw
    .map((row) => String(row.businessAnchorId || "").trim())
    .filter((id) => Types.ObjectId.isValid(id));

  const anchors = mismatchAnchorIds.length
    ? await BusinessAnchor.find({
        _id: {
          $in: mismatchAnchorIds.map((id) => new Types.ObjectId(id)),
        },
      })
        .select({ _id: 1, name: 1, businessType: 1 })
        .lean()
    : [];

  const anchorMap = new Map(
    (anchors || []).map((anchor) => [
      String(anchor?._id || "").trim(),
      anchor,
    ]),
  );

  const mismatches = mismatchesRaw
    .map((row) => {
      const anchor = anchorMap.get(String(row.businessAnchorId || "").trim());
      return {
        businessAnchorId: String(row.businessAnchorId || "").trim(),
        name: String(anchor?.name || ""),
        businessType: String(anchor?.businessType || ""),
        requestCount: Number(row.requestCount || 0),
        snapshotCount: Number(row.snapshotCount || 0),
        gap: Number(row.gap || 0),
        snapshotComputedAt: row.snapshotComputedAt || null,
      };
    })
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));

  return {
    success: mismatches.length === 0,
    range: {
      startYmd,
      endYmd,
    },
    checkedSnapshotCount: Number(snapshotRows?.length || 0),
    mismatchCount: mismatches.length,
    mismatches,
    checkedAt: new Date(),
  };
};

export const storePricingSsotConsistencyResult = async (
  result,
  options = {},
) => {
  const maxMismatchItems = Number(options?.maxMismatchItems || 100);
  const ymd = String(result?.range?.endYmd || "").trim();
  if (!ymd) {
    throw new Error("Cannot store SSOT result without endYmd.");
  }

  const toObjectIdOrNull = (value) => {
    const id = String(value || "").trim();
    return Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null;
  };

  const mismatches = Array.isArray(result?.mismatches)
    ? result.mismatches.slice(0, maxMismatchItems)
    : [];

  await PricingSsotHealthSnapshot.findOneAndUpdate(
    { ymd },
    {
      $set: {
        ymd,
        range: {
          startYmd: String(result?.range?.startYmd || "").trim(),
          endYmd: ymd,
        },
        checkedSnapshotCount: Number(result?.checkedSnapshotCount || 0),
        mismatchCount: Number(result?.mismatchCount || 0),
        success: Boolean(result?.success),
        checkedAt: result?.checkedAt ? new Date(result.checkedAt) : new Date(),
        mismatches: mismatches
          .map((row) => {
            const oid = toObjectIdOrNull(row?.businessAnchorId);
            if (!oid) return null;
            return {
              businessAnchorId: oid,
              name: String(row?.name || ""),
              businessType: String(row?.businessType || ""),
              requestCount: Number(row?.requestCount || 0),
              snapshotCount: Number(row?.snapshotCount || 0),
              gap: Number(row?.gap || 0),
              snapshotComputedAt: row?.snapshotComputedAt
                ? new Date(row.snapshotComputedAt)
                : null,
            };
          })
          .filter(Boolean),
      },
    },
    { upsert: true },
  );
};

export const runPricingSsotConsistencyCheck = async (options = {}) => {
  const result = await computePricingSsotConsistency();
  if (options?.write !== false) {
    await storePricingSsotConsistencyResult(result, options);
  }
  return result;
};

export const getLatestPricingSsotHealthSnapshot = async () =>
  PricingSsotHealthSnapshot.findOne({})
    .sort({ checkedAt: -1, updatedAt: -1 })
    .lean();

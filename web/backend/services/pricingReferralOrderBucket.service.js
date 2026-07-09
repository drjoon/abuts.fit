import { Types } from "mongoose";
import ShippingPackage from "../models/shippingPackage.model.js";
import PricingReferralDailyOrderBucket from "../models/pricingReferralDailyOrderBucket.model.js";
import Request from "../models/request.model.js";

const normalizeAnchorIds = (anchorIds) =>
  Array.from(
    new Set(
      (anchorIds || [])
        .map((id) => String(id || "").trim())
        .filter((id) => Types.ObjectId.isValid(id)),
    ),
  );

export const getPricingReferralOrderCountMapByBusinessAnchorIds = async ({
  businessAnchorIds,
  startYmd,
  endYmd,
}) => {
  const anchorIds = normalizeAnchorIds(businessAnchorIds);
  if (!anchorIds.length || !startYmd || !endYmd) {
    return new Map();
  }

  const startAtKst = new Date(`${startYmd}T00:00:00+09:00`);
  const endAtKst = new Date(`${endYmd}T00:00:00+09:00`);
  if (
    Number.isNaN(startAtKst.getTime()) ||
    Number.isNaN(endAtKst.getTime()) ||
    endAtKst < startAtKst
  ) {
    return new Map();
  }

  const endExclusiveKst = new Date(endAtKst.getTime());
  endExclusiveKst.setDate(endExclusiveKst.getDate() + 1);

  // SSOT 원칙:
  // - 리퍼럴/가격 집계의 원본은 Request 컬렉션 하나만 사용한다.
  // - PricingReferralDailyOrderBucket / ShippingPackage 는 성능/보조 데이터이며,
  //   기준 집계값을 결정하는 원본으로 사용하지 않는다.
  // - 이렇게 해야 패키지 연결 누락/지연이 있어도 가격 정책 수량이 왜곡되지 않는다.
  const rows = await Request.aggregate([
    {
      $match: {
        businessAnchorId: {
          $in: anchorIds.map((id) => new Types.ObjectId(id)),
        },
        manufacturerStage: {
          $in: ["shipping", "포장.발송", "tracking", "추적관리"],
        },
        createdAt: {
          $gte: startAtKst,
          $lt: endExclusiveKst,
        },
      },
    },
    {
      $group: {
        _id: "$businessAnchorId",
        count: { $sum: 1 },
      },
    },
  ]);

  return new Map(
    rows.map((row) => [String(row?._id || "").trim(), Number(row?.count || 0)]),
  );
};

export const recomputePricingReferralDailyOrderBucketsForBusinessAnchorId =
  async (businessAnchorId) => {
    const anchorId = String(businessAnchorId || "").trim();
    if (!Types.ObjectId.isValid(anchorId)) return [];

    const businessAnchorObjectId = new Types.ObjectId(anchorId);
    const packages = await ShippingPackage.find({
      businessAnchorId: businessAnchorObjectId,
    })
      .select({ _id: 1, shipDateYmd: 1, requestIds: 1 })
      .lean();

    const bucketMap = new Map();
    for (const pkg of packages || []) {
      const shipDateYmd = String(pkg?.shipDateYmd || "").trim();
      if (!shipDateYmd) continue;

      const requestIds = Array.from(
        new Set(
          (Array.isArray(pkg?.requestIds) ? pkg.requestIds : [])
            .map((requestId) => String(requestId || "").trim())
            .filter((requestId) => Types.ObjectId.isValid(requestId)),
        ),
      );
      if (!requestIds.length) continue;

      const current = bucketMap.get(shipDateYmd) || {
        requestIds: new Set(),
        packageIds: new Set(),
      };

      const packageId = String(pkg?._id || "").trim();
      if (Types.ObjectId.isValid(packageId)) {
        current.packageIds.add(packageId);
      }

      for (const requestId of requestIds) {
        current.requestIds.add(requestId);
      }

      bucketMap.set(shipDateYmd, current);
    }

    const bucketYmds = Array.from(bucketMap.keys());
    const existingRows = await PricingReferralDailyOrderBucket.find({
      businessAnchorId: businessAnchorObjectId,
    })
      .select({ shipDateYmd: 1 })
      .lean();
    const existingYmds = new Set(
      (existingRows || [])
        .map((row) => String(row?.shipDateYmd || "").trim())
        .filter(Boolean),
    );

    // Gather all request IDs across all buckets so we can filter out canceled requests in one query
    const allRequestIdSet = new Set();
    for (const bucket of bucketMap.values()) {
      for (const rid of bucket.requestIds || []) {
        allRequestIdSet.add(String(rid || "").trim());
      }
    }

    let validRequestIdSet = null;
    if (allRequestIdSet.size > 0) {
      const allRequestIdsArray = Array.from(allRequestIdSet).filter((id) =>
        Types.ObjectId.isValid(id),
      );
      const objectIds = allRequestIdsArray.map((id) => new Types.ObjectId(id));

      // Only include requests that are currently in shipping/tracking stages
      // (exclude canceled and other non-shipping stages). This prevents
      // stale package associations from inflating daily order buckets.
      const validRequests = await Request.find({
        _id: { $in: objectIds },
        manufacturerStage: {
          $in: ["shipping", "포장.발송", "tracking", "추적관리"],
        },
      })
        .select({ _id: 1 })
        .lean();

      validRequestIdSet = new Set(
        (validRequests || []).map((r) => String(r._id)),
      );
    }

    const bulkOps = [];
    const now = new Date();
    for (const [shipDateYmd, bucket] of bucketMap.entries()) {
      const requestIds = Array.from(bucket.requestIds || []);
      const packageIds = Array.from(bucket.packageIds || []);

      // If we have filtered valid IDs, apply the filter; otherwise keep as-is
      let filteredRequestIds = requestIds;
      if (validRequestIdSet !== null) {
        filteredRequestIds = requestIds.filter((id) =>
          validRequestIdSet.has(String(id)),
        );
      }

      bulkOps.push({
        updateOne: {
          filter: {
            businessAnchorId: businessAnchorObjectId,
            shipDateYmd,
          },
          update: {
            $set: {
              businessAnchorId: businessAnchorObjectId,
              shipDateYmd,
              requestIds: filteredRequestIds.map(
                (id) => new Types.ObjectId(id),
              ),
              requestCount: filteredRequestIds.length,
              packageIds: packageIds.map((id) => new Types.ObjectId(id)),
              computedAt: now,
            },
          },
          upsert: true,
        },
      });
    }

    if (bulkOps.length) {
      await PricingReferralDailyOrderBucket.bulkWrite(bulkOps);
    }

    const staleYmds = Array.from(existingYmds).filter(
      (ymd) => !bucketMap.has(ymd),
    );
    if (staleYmds.length) {
      await PricingReferralDailyOrderBucket.deleteMany({
        businessAnchorId: businessAnchorObjectId,
        shipDateYmd: { $in: staleYmds },
      });
    }

    if (!bucketYmds.length && existingYmds.size > 0) {
      await PricingReferralDailyOrderBucket.deleteMany({
        businessAnchorId: businessAnchorObjectId,
      });
    }

    return bucketYmds.sort().map((shipDateYmd) => {
      const bucket = bucketMap.get(shipDateYmd);
      // If we filtered, recompute requestCount from filtered set; otherwise use original size
      const requestCount =
        bucket && validRequestIdSet
          ? Array.from(bucket.requestIds || []).filter((id) =>
              validRequestIdSet.has(String(id)),
            ).length
          : bucket?.requestIds?.size || 0;

      return {
        businessAnchorId: anchorId,
        shipDateYmd,
        requestCount,
      };
    });
  };

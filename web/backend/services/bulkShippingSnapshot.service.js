import { Types } from "mongoose";
import BulkShippingSnapshot from "../models/bulkShippingSnapshot.model.js";
import { buildBulkShippingCandidatesForBusinessAnchorId } from "../controllers/requests/shipping.Requestor.helpers.js";
import { getTodayYmdInKst } from "../controllers/requests/utils.js";

export const recomputeBulkShippingSnapshotForBusinessAnchorId = async (
  businessAnchorId,
) => {
  const anchorId = String(businessAnchorId || "").trim();
  if (!Types.ObjectId.isValid(anchorId)) return null;

  const ymd = getTodayYmdInKst();
  if (!ymd) return null;

  const data = await buildBulkShippingCandidatesForBusinessAnchorId(anchorId);
  const snapshotBusinessAnchorId = new Types.ObjectId(anchorId);

  await BulkShippingSnapshot.findOneAndUpdate(
    { businessAnchorId: snapshotBusinessAnchorId, ymd },
    {
      $set: {
        businessAnchorId: snapshotBusinessAnchorId,
        ymd,
        pre: Array.isArray(data?.pre) ? data.pre : [],
        post: Array.isArray(data?.post) ? data.post : [],
        waiting: Array.isArray(data?.waiting) ? data.waiting : [],
        computedAt: new Date(),
      },
    },
    { upsert: true },
  );

  return {
    businessAnchorId: anchorId,
    ymd,
    pre: Array.isArray(data?.pre) ? data.pre : [],
    post: Array.isArray(data?.post) ? data.post : [],
    waiting: Array.isArray(data?.waiting) ? data.waiting : [],
  };
};

export const getBulkShippingSnapshotForBusinessAnchorId = async (
  businessAnchorId,
) => {
  const anchorId = String(businessAnchorId || "").trim();
  if (!Types.ObjectId.isValid(anchorId)) return null;

  const ymd = getTodayYmdInKst();
  if (!ymd) return null;

  return BulkShippingSnapshot.findOne({
    businessAnchorId: new Types.ObjectId(anchorId),
    ymd,
  })
    .select({
      businessAnchorId: 1,
      ymd: 1,
      pre: 1,
      post: 1,
      waiting: 1,
      computedAt: 1,
    })
    .lean();
};

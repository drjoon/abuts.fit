import { Types } from "mongoose";
import User from "../models/user.model.js";
import { recomputePricingReferralSnapshotForLeaderAnchorId, recomputePricingReferralSnapshotsForAffectedAnchorId } from "./pricingReferralSnapshot.service.js";

export const triggerPricingSnapshotForBusinessAnchorId = (businessAnchorId, reason = "") => {
  const anchorId = String(businessAnchorId || "").trim();
  if (!Types.ObjectId.isValid(anchorId)) return;

  void recomputePricingReferralSnapshotsForAffectedAnchorId(anchorId).catch(
    (error) => {
      console.error(
        `[pricingReferralSnapshot] triggerPricingSnapshotForBusinessAnchorId failed${reason ? ` (${reason})` : ""}`,
        error,
      );
    },
  );
};

export const triggerPricingSnapshotForReferrerAnchorId = (referrerAnchorId, reason = "") => {
  const anchorId = String(referrerAnchorId || "").trim();
  if (!Types.ObjectId.isValid(anchorId)) return;

  void recomputePricingReferralSnapshotForLeaderAnchorId(anchorId).catch(
    (error) => {
      console.error(
        `[pricingReferralSnapshot] triggerPricingSnapshotForReferrerAnchorId failed${reason ? ` (${reason})` : ""}`,
        error,
      );
    },
  );
};

export const triggerPricingSnapshotForRequestDoc = (requestDoc, reason = "") => {
  const businessAnchorId = String(requestDoc?.businessAnchorId || "").trim();
  if (!Types.ObjectId.isValid(businessAnchorId)) return;
  triggerPricingSnapshotForBusinessAnchorId(businessAnchorId, reason);
};

export const triggerPricingSnapshotForUserDoc = async (userDoc, reason = "") => {
  const businessAnchorId = String(userDoc?.businessAnchorId || "").trim();
  const referredByAnchorId = String(userDoc?.referredByAnchorId || "").trim();

  if (Types.ObjectId.isValid(businessAnchorId)) {
    triggerPricingSnapshotForBusinessAnchorId(businessAnchorId, reason);
  }
  if (Types.ObjectId.isValid(referredByAnchorId)) {
    triggerPricingSnapshotForReferrerAnchorId(referredByAnchorId, reason);
  }
};

export const triggerPricingSnapshotForUserId = async (userId, reason = "") => {
  const normalizedUserId = String(userId || "").trim();
  if (!Types.ObjectId.isValid(normalizedUserId)) return;

  const user = await User.findById(normalizedUserId)
    .select({ businessAnchorId: 1, referredByAnchorId: 1 })
    .lean();
  if (!user) return;

  await triggerPricingSnapshotForUserDoc(user, reason);
};

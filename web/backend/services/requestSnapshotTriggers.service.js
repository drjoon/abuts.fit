import { Types } from "mongoose";
import User from "../models/user.model.js";
import { recomputePricingReferralSnapshotsForAffectedAnchorId } from "./pricingReferralSnapshot.service.js";
import { recomputePricingReferralDailyOrderBucketsForBusinessAnchorId } from "./pricingReferralOrderBucket.service.js";
import { recomputeBulkShippingSnapshotForBusinessAnchorId } from "./bulkShippingSnapshot.service.js";
import { recomputeRequestorDashboardSummarySnapshotsForBusinessAnchorId } from "./requestorDashboardSummarySnapshot.service.js";
import { invalidateDashboardAndBulkCachesForBusinessAnchorId } from "./requestDashboardCache.service.js";
import { invalidateAdminReferralCachesForBusinessAnchorId } from "./adminReferralCache.service.js";

const normalizeAnchorId = (value) => String(value || "").trim();

const refreshPricingReferralAggregateForAnchorId = (
  businessAnchorId,
  reason = "",
) => {
  const anchorId = String(businessAnchorId || "").trim();
  if (!Types.ObjectId.isValid(anchorId)) return;

  invalidateDashboardAndBulkCachesForBusinessAnchorId(anchorId);
  invalidateAdminReferralCachesForBusinessAnchorId(anchorId);

  void recomputePricingReferralSnapshotsForAffectedAnchorId(anchorId)
    .then((results) => {
      const affectedAnchorIds = Array.from(
        new Set(
          [
            anchorId,
            ...(results || []).map((row) =>
              String(row?.businessAnchorId || ""),
            ),
          ].filter((value) => Types.ObjectId.isValid(String(value || ""))),
        ),
      );

      for (const affectedAnchorId of affectedAnchorIds) {
        invalidateDashboardAndBulkCachesForBusinessAnchorId(affectedAnchorId);
        invalidateAdminReferralCachesForBusinessAnchorId(affectedAnchorId);
      }

      return Promise.all(
        affectedAnchorIds.map((affectedAnchorId) =>
          recomputeRequestorDashboardSummarySnapshotsForBusinessAnchorId(
            affectedAnchorId,
          ).catch((error) => {
            console.error(
              `[requestorDashboardSummarySnapshot] refreshPricingReferralAggregateForAnchorId failed${reason ? ` (${reason})` : ""}`,
              error,
            );
          }),
        ),
      );
    })
    .catch((error) => {
      console.error(
        `[pricingReferralSnapshot] triggerPricingSnapshotForBusinessAnchorId failed${reason ? ` (${reason})` : ""}`,
        error,
      );
    });
};

export const requestReferralPricingAggregateRefresh = (
  businessAnchorId,
  reason = "",
) => {
  refreshPricingReferralAggregateForAnchorId(businessAnchorId, reason);
};

export const emitBusinessOrderAggregateChanged = (
  businessAnchorId,
  reason = "",
) => {
  const anchorId = normalizeAnchorId(businessAnchorId);
  if (!Types.ObjectId.isValid(anchorId)) return;

  void recomputePricingReferralDailyOrderBucketsForBusinessAnchorId(anchorId)
    .then(() => {
      refreshPricingReferralAggregateForAnchorId(anchorId, reason);
    })
    .catch((error) => {
      console.error(
        `[pricingReferralOrderBucket] emitBusinessOrderAggregateChanged failed${reason ? ` (${reason})` : ""}`,
        error,
      );
    });

  void recomputeBulkShippingSnapshotForBusinessAnchorId(anchorId).catch(
    (error) => {
      console.error(
        `[bulkShippingSnapshot] emitBusinessOrderAggregateChanged failed${reason ? ` (${reason})` : ""}`,
        error,
      );
    },
  );
};

export const emitReferralMembershipChanged = (
  businessAnchorId,
  reason = "",
) => {
  const anchorId = normalizeAnchorId(businessAnchorId);
  if (!Types.ObjectId.isValid(anchorId)) return;

  refreshPricingReferralAggregateForAnchorId(anchorId, reason);
};

export const triggerPricingSnapshotForBusinessAnchorId = (
  businessAnchorId,
  reason = "",
) => {
  emitBusinessOrderAggregateChanged(businessAnchorId, reason);
};

export const triggerPricingSnapshotForReferrerAnchorId = (
  referrerAnchorId,
  reason = "",
) => {
  const anchorId = normalizeAnchorId(referrerAnchorId);
  if (!Types.ObjectId.isValid(anchorId)) return;

  requestReferralPricingAggregateRefresh(anchorId, reason);
};

export const triggerPricingSnapshotForRequestDoc = (
  requestDoc,
  reason = "",
) => {
  const businessAnchorId = normalizeAnchorId(requestDoc?.businessAnchorId);
  if (!Types.ObjectId.isValid(businessAnchorId)) return;
  emitBusinessOrderAggregateChanged(businessAnchorId, reason);
};

export const triggerPricingSnapshotForUserDoc = async (
  userDoc,
  reason = "",
) => {
  const businessAnchorId = normalizeAnchorId(userDoc?.businessAnchorId);
  const referredByAnchorId = normalizeAnchorId(userDoc?.referredByAnchorId);

  if (
    Types.ObjectId.isValid(businessAnchorId) &&
    Types.ObjectId.isValid(referredByAnchorId)
  ) {
    emitReferralMembershipChanged(businessAnchorId, reason);
    return;
  }
  if (Types.ObjectId.isValid(businessAnchorId)) {
    emitBusinessOrderAggregateChanged(businessAnchorId, reason);
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

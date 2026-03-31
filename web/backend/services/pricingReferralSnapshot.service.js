import { Types } from "mongoose";
import User from "../models/user.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
import PricingReferralRolling30dAggregate from "../models/pricingReferralRolling30dAggregate.model.js";
import { getPricingReferralOrderCountMapByBusinessAnchorIds } from "./pricingReferralOrderBucket.service.js";
import {
  getLast30DaysRangeUtc,
  getTodayYmdInKst,
  toKstYmd,
} from "../utils/krBusinessDays.js";

const LEADER_ROLES = new Set(["requestor", "salesman", "devops"]);
const REQUESTOR_GROUP_TYPES = ["requestor"];
const REFERRAL_GROUP_TYPES = ["requestor", "salesman", "devops"];
const ACTIVE_MEMBERSHIP_STATUSES = ["active", "verified"];

const normalizeAnchorIds = (anchorIds) =>
  Array.from(
    new Set(
      (anchorIds || [])
        .map((id) => String(id || "").trim())
        .filter((id) => Types.ObjectId.isValid(id)),
    ),
  );

const resolveLeaderUserByAnchorId = async (businessAnchorId) => {
  const anchorId = String(businessAnchorId || "").trim();
  if (!Types.ObjectId.isValid(anchorId)) return null;

  const rows = await User.find({
    businessAnchorId: new Types.ObjectId(anchorId),
    active: true,
    role: { $in: Array.from(LEADER_ROLES) },
  })
    .select({
      _id: 1,
      role: 1,
      subRole: 1,
      businessId: 1,
      businessAnchorId: 1,
    })
    .lean();

  if (!rows.length) return null;

  const requestorOwner = rows.find(
    (row) => row?.role === "requestor" && row?.subRole === "owner",
  );
  if (requestorOwner) return requestorOwner;

  const salesman = rows.find((row) => row?.role === "salesman");
  if (salesman) return salesman;

  const devops = rows.find((row) => row?.role === "devops");
  if (devops) return devops;

  return rows[0] || null;
};

const buildRequestorDirectCircleAnchorIds = async (businessAnchorId) => {
  const anchorId = String(businessAnchorId || "").trim();
  if (!Types.ObjectId.isValid(anchorId)) return [];

  const selfAnchor = await BusinessAnchor.findById(anchorId)
    .select({ _id: 1, referredByAnchorId: 1, businessType: 1, status: 1 })
    .lean();
  if (!selfAnchor) return [];

  const normalizedBusinessType = String(selfAnchor?.businessType || "").trim();
  const normalizedStatus = String(selfAnchor?.status || "").trim();
  if (
    normalizedBusinessType !== "requestor" ||
    !ACTIVE_MEMBERSHIP_STATUSES.includes(normalizedStatus)
  ) {
    return [];
  }

  const parentAnchorId = String(selfAnchor?.referredByAnchorId || "").trim();
  const [parentAnchor, directChildren] = await Promise.all([
    Types.ObjectId.isValid(parentAnchorId)
      ? BusinessAnchor.findOne({
          _id: new Types.ObjectId(parentAnchorId),
          businessType: "requestor",
          status: { $in: ACTIVE_MEMBERSHIP_STATUSES },
        })
          .select({ _id: 1 })
          .lean()
      : null,
    BusinessAnchor.find({
      referredByAnchorId: new Types.ObjectId(anchorId),
      businessType: "requestor",
      status: { $in: ACTIVE_MEMBERSHIP_STATUSES },
    })
      .select({ _id: 1 })
      .lean(),
  ]);

  return normalizeAnchorIds([
    anchorId,
    String(parentAnchor?._id || "").trim(),
    ...(directChildren || []).map((row) => String(row?._id || "").trim()),
  ]);
};

export const rebuildRequestorDirectCircleMembershipAggregateForAnchorId =
  async (businessAnchorId) => {
    const anchorId = String(businessAnchorId || "").trim();
    if (!Types.ObjectId.isValid(anchorId)) return [];

    const memberAnchorIds = await buildRequestorDirectCircleAnchorIds(anchorId);

    await BusinessAnchor.updateOne(
      { _id: new Types.ObjectId(anchorId) },
      {
        $set: {
          "referralMembershipAggregate.requestorDirectCircleAnchorIds":
            memberAnchorIds.map((id) => new Types.ObjectId(id)),
          "referralMembershipAggregate.requestorDirectCircleMemberCount":
            memberAnchorIds.length,
          "referralMembershipAggregate.updatedAt": new Date(),
        },
      },
    );

    return memberAnchorIds;
  };

export const getStoredRequestorDirectCircleMembershipByAnchorId = async (
  businessAnchorId,
) => {
  const anchorId = String(businessAnchorId || "").trim();
  if (!Types.ObjectId.isValid(anchorId)) {
    return {
      memberAnchorIds: [],
      memberCount: 0,
      updatedAt: null,
    };
  }

  const anchor = await BusinessAnchor.findById(anchorId)
    .select({ referralMembershipAggregate: 1 })
    .lean();

  const memberAnchorIds = normalizeAnchorIds(
    anchor?.referralMembershipAggregate?.requestorDirectCircleAnchorIds || [],
  );

  return {
    memberAnchorIds,
    memberCount: Number(
      anchor?.referralMembershipAggregate?.requestorDirectCircleMemberCount ||
        memberAnchorIds.length ||
        0,
    ),
    updatedAt: anchor?.referralMembershipAggregate?.updatedAt || null,
  };
};

export const getPricingReferralRolling30dAggregateByBusinessAnchorId = async (
  businessAnchorId,
  ymd = getTodayYmdInKst(),
) => {
  const anchorId = String(businessAnchorId || "").trim();
  if (!Types.ObjectId.isValid(anchorId) || !ymd) return null;

  return PricingReferralRolling30dAggregate.findOne({
    businessAnchorId: new Types.ObjectId(anchorId),
    ymd,
  })
    .select({
      businessId: 1,
      businessAnchorId: 1,
      ymd: 1,
      startYmd: 1,
      endYmd: 1,
      groupMemberCount: 1,
      groupTotalOrders30d: 1,
      selfBusinessOrders30d: 1,
      computedAt: 1,
    })
    .lean();
};

export const rebuildRequestorDirectCircleMembershipAggregatesForAffectedAnchorId =
  async (businessAnchorId) => {
    const anchorId = String(businessAnchorId || "").trim();
    if (!Types.ObjectId.isValid(anchorId)) return [];

    const currentAnchor = await BusinessAnchor.findById(anchorId)
      .select({ _id: 1, referredByAnchorId: 1, businessType: 1 })
      .lean();
    if (!currentAnchor) return [];

    const childRequestors = await BusinessAnchor.find({
      referredByAnchorId: new Types.ObjectId(anchorId),
      businessType: "requestor",
    })
      .select({ _id: 1 })
      .lean();

    const affectedRequestorAnchorIds = normalizeAnchorIds([
      String(currentAnchor?.businessType || "").trim() === "requestor"
        ? anchorId
        : "",
      String(currentAnchor?.referredByAnchorId || "").trim(),
      ...(childRequestors || []).map((row) => String(row?._id || "").trim()),
    ]);

    await Promise.all(
      affectedRequestorAnchorIds.map((requestorAnchorId) =>
        rebuildRequestorDirectCircleMembershipAggregateForAnchorId(
          requestorAnchorId,
        ),
      ),
    );

    return affectedRequestorAnchorIds;
  };

export const getDirectReferralCircleAnchorIds = async (
  businessAnchorId,
  options = {},
) => {
  const anchorId = String(businessAnchorId || "").trim();
  if (!Types.ObjectId.isValid(anchorId)) return [];

  const allowedBusinessTypes = Array.isArray(options?.allowedBusinessTypes)
    ? options.allowedBusinessTypes
    : REFERRAL_GROUP_TYPES;

  const selfAnchor = await BusinessAnchor.findById(anchorId)
    .select({ _id: 1, referredByAnchorId: 1, businessType: 1 })
    .lean();
  if (!selfAnchor) return [];

  const parentAnchorId = String(selfAnchor?.referredByAnchorId || "").trim();
  const [parentAnchor, directChildren] = await Promise.all([
    Types.ObjectId.isValid(parentAnchorId)
      ? BusinessAnchor.findById(parentAnchorId)
          .select({ _id: 1, businessType: 1 })
          .lean()
      : null,
    BusinessAnchor.find({
      referredByAnchorId: new Types.ObjectId(anchorId),
      businessType: { $in: allowedBusinessTypes },
    })
      .select({ _id: 1 })
      .lean(),
  ]);

  const ids = new Set([anchorId]);
  if (
    parentAnchor &&
    allowedBusinessTypes.includes(String(parentAnchor?.businessType || ""))
  ) {
    ids.add(String(parentAnchor._id));
  }
  for (const row of directChildren || []) {
    const childId = String(row?._id || "").trim();
    if (Types.ObjectId.isValid(childId)) ids.add(childId);
  }
  return Array.from(ids);
};

export const recomputePricingReferralSnapshotForLeaderAnchorId = async (
  businessAnchorId,
) => {
  const leaderAnchorId = String(businessAnchorId || "").trim();
  if (!Types.ObjectId.isValid(leaderAnchorId)) return null;

  const leader = await resolveLeaderUserByAnchorId(leaderAnchorId);
  if (!leader) return null;

  const now = new Date();
  const range30 = getLast30DaysRangeUtc(now);
  if (!range30) return null;
  const startYmd = toKstYmd(range30.start);
  const endYmd = getTodayYmdInKst();
  const ymd = endYmd;
  if (!startYmd || !endYmd || !ymd) return null;

  // 소개 관계 SSOT는 BusinessAnchor.referredByAnchorId 하나만 사용한다.
  // snapshot이 user row를 읽으면 같은 사업자의 owner/member가 중복 포함되어
  // memberCount와 groupTotalOrders가 다시 부풀 수 있으므로 business anchor만 읽는다.
  const groupAnchorIds =
    leader?.role === "requestor"
      ? await rebuildRequestorDirectCircleMembershipAggregateForAnchorId(
          leaderAnchorId,
        )
      : Array.from(
          new Set(
            [
              leaderAnchorId,
              ...(
                await BusinessAnchor.find({
                  referredByAnchorId: new Types.ObjectId(leaderAnchorId),
                  businessType: { $in: REFERRAL_GROUP_TYPES },
                })
                  .select({ _id: 1 })
                  .lean()
              ).map((row) => String(row?._id || "").trim()),
            ].filter((id) => Types.ObjectId.isValid(id)),
          ),
        );

  const countMap = await getPricingReferralOrderCountMapByBusinessAnchorIds({
    businessAnchorIds: groupAnchorIds,
    startYmd,
    endYmd,
  });

  const groupTotalOrders = groupAnchorIds.reduce(
    (acc, id) => acc + Number(countMap.get(String(id)) || 0),
    0,
  );
  const selfBusinessOrders = Number(countMap.get(String(leaderAnchorId)) || 0);

  const snapshotBusinessId =
    leader?.businessId && Types.ObjectId.isValid(String(leader.businessId))
      ? new Types.ObjectId(String(leader.businessId))
      : null;
  const snapshotBusinessAnchorId = new Types.ObjectId(leaderAnchorId);

  await PricingReferralRolling30dAggregate.findOneAndUpdate(
    { businessAnchorId: snapshotBusinessAnchorId, ymd },
    {
      $set: {
        businessId: snapshotBusinessId,
        businessAnchorId: snapshotBusinessAnchorId,
        ymd,
        startYmd,
        endYmd,
        groupMemberCount: groupAnchorIds.length,
        groupTotalOrders30d: groupTotalOrders,
        selfBusinessOrders30d: selfBusinessOrders,
        computedAt: new Date(),
      },
    },
    { upsert: true },
  );

  return {
    businessAnchorId: leaderAnchorId,
    ymd,
    groupMemberCount: groupAnchorIds.length,
    groupTotalOrders,
    selfBusinessOrders,
  };
};

export const recomputePricingReferralSnapshotsForAffectedAnchorId = async (
  businessAnchorId,
) => {
  const anchorId = String(businessAnchorId || "").trim();
  if (!Types.ObjectId.isValid(anchorId)) return [];

  const currentAnchor = await BusinessAnchor.findById(anchorId)
    .select({ referredByAnchorId: 1, businessType: 1 })
    .lean();

  const leaderAnchorIds =
    String(currentAnchor?.businessType || "") === "requestor"
      ? await rebuildRequestorDirectCircleMembershipAggregatesForAffectedAnchorId(
          anchorId,
        )
      : Array.from(
          new Set(
            [
              anchorId,
              String(currentAnchor?.referredByAnchorId || "").trim(),
            ].filter((id) => Types.ObjectId.isValid(id)),
          ),
        );

  const results = await Promise.all(
    leaderAnchorIds.map((leaderAnchorId) =>
      recomputePricingReferralSnapshotForLeaderAnchorId(leaderAnchorId),
    ),
  );

  return results.filter(Boolean);
};

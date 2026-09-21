// related files:
// - web/backend/rules.md
// - web/backend/jobs/dailyReferralOwnershipResetWorker.js
// - web/backend/server.js
// - web/backend/services/requestSnapshotTriggers.service.js
// - web/backend/models/businessAnchor.model.js
// - rules.md (§2.3 / §2.4)
/**
 * 영업(딜러·영업본부) 소개 귀속 90일 비활성 리셋.
 *
 * - SSOT 쓰기: BusinessAnchor.referredByAnchorId (의뢰자)
 * - 비활성 시계: max(BA.createdAt, 해당 BA의 최근 Request.createdAt)
 * - 대상 추천인: businessType salesman | salesTeam 만 (peer/devops 유지)
 * - 과거 REV_SALESMAN 장부는 건드리지 않음
 */
import { Types } from "mongoose";
import BusinessAnchor from "../models/businessAnchor.model.js";
import Request from "../models/request.model.js";
import User from "../models/user.model.js";
import { emitReferralMembershipChanged } from "./requestSnapshotTriggers.service.js";
import {
  ensureSalesTeamPersonalAnchor,
  resolveSalesTeamReferralAnchorId,
} from "../utils/salesTeamReferral.util.js";
import {
  REFERRAL_OWNERSHIP_INACTIVE_DAYS,
  SALES_REFERRER_BUSINESS_TYPES,
  isSalesReferrerBusinessType,
  resolveLastActivityAt,
  resolveReferralOwnershipCutoffAt,
  shouldResetReferralOwnership,
} from "../utils/referralOwnershipReset.util.js";

export {
  REFERRAL_OWNERSHIP_INACTIVE_DAYS,
  SALES_REFERRER_BUSINESS_TYPES,
  isSalesReferrerBusinessType,
  resolveLastActivityAt,
  resolveReferralOwnershipCutoffAt,
  shouldResetReferralOwnership,
};

async function loadLastRequestAtMap(anchorIds) {
  const ids = (anchorIds || [])
    .map((id) => String(id || "").trim())
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));
  if (!ids.length) return new Map();

  const rows = await Request.aggregate([
    { $match: { businessAnchorId: { $in: ids } } },
    {
      $group: {
        _id: "$businessAnchorId",
        lastRequestAt: { $max: "$createdAt" },
      },
    },
  ]);

  return new Map(
    rows.map((row) => [
      String(row?._id || "").trim(),
      row?.lastRequestAt ? new Date(row.lastRequestAt) : null,
    ]),
  );
}

/**
 * 만료된 영업 소개 귀속을 해제한다.
 * @returns {{ scanned, reset, skipped, errors, dryRun, cutoffAt }}
 */
export async function resetExpiredReferralOwnerships({
  now = new Date(),
  limit = 500,
  dryRun = false,
  inactiveDays = REFERRAL_OWNERSHIP_INACTIVE_DAYS,
  afterId = null,
} = {}) {
  const cutoffAt = resolveReferralOwnershipCutoffAt(now, inactiveDays);
  const batchLimit = Math.max(1, Math.min(2000, Math.floor(Number(limit) || 500)));

  const result = {
    scanned: 0,
    reset: 0,
    skipped: 0,
    errors: 0,
    dryRun: Boolean(dryRun),
    cutoffAt,
    resetAnchorIds: [],
    nextAfterId: null,
    exhausted: false,
  };

  const filter = {
    businessType: "requestor",
    referredByAnchorId: { $ne: null },
  };
  const after = String(afterId || "").trim();
  if (Types.ObjectId.isValid(after)) {
    filter._id = { $gt: new Types.ObjectId(after) };
  }

  const candidates = await BusinessAnchor.find(filter)
    .select({ _id: 1, createdAt: 1, referredByAnchorId: 1 })
    .sort({ _id: 1 })
    .limit(batchLimit)
    .lean();

  if (!candidates.length) {
    result.exhausted = true;
    return result;
  }

  result.nextAfterId = String(candidates[candidates.length - 1]._id);
  result.exhausted = candidates.length < batchLimit;

  const parentIds = Array.from(
    new Set(
      candidates
        .map((row) => String(row?.referredByAnchorId || "").trim())
        .filter((id) => Types.ObjectId.isValid(id)),
    ),
  );

  const parents = await BusinessAnchor.find({
    _id: { $in: parentIds.map((id) => new Types.ObjectId(id)) },
  })
    .select({ _id: 1, businessType: 1 })
    .lean();

  const parentTypeById = new Map(
    parents.map((p) => [String(p._id), String(p.businessType || "")]),
  );

  const salesCandidates = candidates.filter((row) =>
    isSalesReferrerBusinessType(
      parentTypeById.get(String(row.referredByAnchorId || "")),
    ),
  );

  // 페이지 내 non-sales 는 skipped로 집계하지 않고, sales만 scanned
  result.scanned = salesCandidates.length;
  if (!salesCandidates.length) return result;

  const lastRequestMap = await loadLastRequestAtMap(
    salesCandidates.map((row) => row._id),
  );

  for (const row of salesCandidates) {
    const anchorId = String(row._id);
    const formerParentId = String(row.referredByAnchorId || "").trim();
    try {
      const lastActivityAt = resolveLastActivityAt({
        createdAt: row.createdAt,
        lastRequestAt: lastRequestMap.get(anchorId) || null,
      });
      if (
        !shouldResetReferralOwnership({
          lastActivityAt,
          cutoffAt,
        })
      ) {
        result.skipped += 1;
        continue;
      }

      if (dryRun) {
        result.reset += 1;
        result.resetAnchorIds.push(anchorId);
        continue;
      }

      const updated = await BusinessAnchor.findOneAndUpdate(
        {
          _id: row._id,
          businessType: "requestor",
          referredByAnchorId: row.referredByAnchorId,
        },
        { $set: { referredByAnchorId: null } },
        { new: true },
      ).select({ _id: 1 });

      if (!updated) {
        result.skipped += 1;
        continue;
      }

      await User.updateMany(
        { businessAnchorId: row._id },
        { $set: { referredByAnchorId: null } },
      );

      emitReferralMembershipChanged(anchorId, "referral-ownership-reset");
      if (Types.ObjectId.isValid(formerParentId)) {
        emitReferralMembershipChanged(
          formerParentId,
          "referral-ownership-reset-parent",
        );
      }

      result.reset += 1;
      result.resetAnchorIds.push(anchorId);
    } catch (error) {
      result.errors += 1;
      console.error(
        `[referralOwnershipReset] failed anchor=${anchorId}`,
        error,
      );
    }
  }

  return result;
}

/**
 * 소개 귀속이 비어 있는 의뢰자 BA에 소개코드를 재귀속한다.
 * (90일 리셋 후 재영업 경로)
 */
export async function applyReferralCodeToUnownedRequestor({
  requestorBusinessAnchorId,
  referralCode,
  actorUserId = null,
} = {}) {
  const anchorId = String(requestorBusinessAnchorId || "").trim();
  const code = String(referralCode || "")
    .trim()
    .toUpperCase();
  if (!Types.ObjectId.isValid(anchorId)) {
    throw new Error("의뢰자 사업자 정보가 올바르지 않습니다.");
  }
  if (!code) {
    throw new Error("소개 코드를 입력해주세요.");
  }

  const requestorAnchor = await BusinessAnchor.findById(anchorId)
    .select({ _id: 1, businessType: 1, referredByAnchorId: 1 })
    .lean();
  if (!requestorAnchor || requestorAnchor.businessType !== "requestor") {
    throw new Error("의뢰자 사업자만 소개 코드를 적용할 수 있습니다.");
  }
  if (requestorAnchor.referredByAnchorId) {
    throw new Error("이미 소개 귀속이 있습니다. 90일 비활성 리셋 후에만 재적용할 수 있습니다.");
  }

  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const refUser = await User.findOne({
    referralCode: { $regex: `^${escaped}$`, $options: "i" },
    active: { $ne: false },
  })
    .select({ _id: 1, role: 1, businessAnchorId: 1 })
    .lean();

  if (!refUser) {
    throw new Error("유효하지 않은 소개 코드입니다.");
  }

  const role = String(refUser.role || "").trim();
  if (!["salesman", "salesTeam", "requestor", "devops"].includes(role)) {
    throw new Error("이 소개 코드는 적용할 수 없습니다.");
  }

  let referrerAnchorId = String(refUser.businessAnchorId || "").trim();
  if (role === "salesTeam") {
    const full = await User.findById(refUser._id);
    if (full) {
      await ensureSalesTeamPersonalAnchor(full);
      const personal = await resolveSalesTeamReferralAnchorId(full);
      if (personal) referrerAnchorId = String(personal);
    }
  }

  if (!Types.ObjectId.isValid(referrerAnchorId)) {
    throw new Error("추천인 사업자 정보가 없습니다.");
  }
  if (referrerAnchorId === anchorId) {
    throw new Error("본인 소개 코드는 적용할 수 없습니다.");
  }

  const updated = await BusinessAnchor.findOneAndUpdate(
    {
      _id: new Types.ObjectId(anchorId),
      businessType: "requestor",
      referredByAnchorId: null,
    },
    {
      $set: {
        referredByAnchorId: new Types.ObjectId(referrerAnchorId),
        defaultReferralAnchorId: new Types.ObjectId(referrerAnchorId),
      },
    },
    { new: true },
  ).select({ _id: 1, referredByAnchorId: 1 });

  if (!updated) {
    throw new Error("소개 귀속 적용에 실패했습니다. 이미 귀속이 있을 수 있습니다.");
  }

  const userFilter = actorUserId
    ? { _id: actorUserId, businessAnchorId: anchorId }
    : { businessAnchorId: anchorId };
  await User.updateMany(userFilter, {
    $set: { referredByAnchorId: new Types.ObjectId(referrerAnchorId) },
  });

  emitReferralMembershipChanged(anchorId, "referral-ownership-reclaim");
  emitReferralMembershipChanged(
    referrerAnchorId,
    "referral-ownership-reclaim-parent",
  );

  return {
    businessAnchorId: anchorId,
    referredByAnchorId: referrerAnchorId,
    referrerRole: role,
  };
}

// related files:
// - web/backend/utils/requestorReferralWindow.util.js
// - web/backend/services/referralOwnershipReset.service.js
// - web/backend/jobs/dailyReferralOwnershipResetWorker.js
// - web/backend/controllers/auth/auth.controller.js
/**
 * 어벗츠 관리자 소개 코드는 AAA 고정.
 * 소개 귀속이 한 번도 없는 의뢰자는 가입 14일이 지나면 이 코드로 영구 귀속한다.
 * 영업 90일 리셋 뒤 재등록(defaultReferralAnchorId 유지)은 건드리지 않는다.
 */
import crypto from "crypto";
import { Types } from "mongoose";
import BusinessAnchor from "../models/businessAnchor.model.js";
import User from "../models/user.model.js";
import { emitReferralMembershipChanged } from "./requestSnapshotTriggers.service.js";
import {
  ABUTS_ADMIN_REFERRAL_CODE,
  isReservedReferralCode,
  resolveRequestorSignupAt,
  shouldAssignAbutsAdminReferral,
} from "../utils/requestorReferralWindow.util.js";

export { ABUTS_ADMIN_REFERRAL_CODE };

const USER_CODE_SELECT = {
  _id: 1,
  role: 1,
  referralCode: 1,
  businessAnchorId: 1,
  createdAt: 1,
};

function unownedReferralFilter() {
  return {
    $and: [
      {
        $or: [
          { referredByAnchorId: null },
          { referredByAnchorId: { $exists: false } },
        ],
      },
      {
        $or: [
          { defaultReferralAnchorId: null },
          { defaultReferralAnchorId: { $exists: false } },
        ],
      },
    ],
  };
}

async function allocateReplacementReferralCode(role) {
  const normalized = String(role || "").trim();
  const alphaOnly = normalized === "salesTeam";
  const length =
    normalized === "salesTeam" ||
    normalized === "salesman" ||
    normalized === "devops"
      ? 3
      : 5;
  const alphabet = alphaOnly
    ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    : "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let attempt = 0; attempt < 200; attempt += 1) {
    let code = "";
    for (let i = 0; i < length; i += 1) {
      code += alphabet[crypto.randomInt(0, alphabet.length)];
    }
    if (isReservedReferralCode(code)) continue;
    const exists = await User.exists({ referralCode: code });
    if (!exists) return code;
  }
  throw new Error("소개 코드 재발급에 실패했습니다.");
}

async function findAdminBusinessAnchor() {
  return BusinessAnchor.findOne({
    businessType: "admin",
    status: { $ne: "merged" },
  })
    .select({ _id: 1, primaryContactUserId: 1, owners: 1 })
    .sort({ createdAt: 1, _id: 1 })
    .lean();
}

async function resolveCanonicalAdminUser(adminAnchor) {
  const contactId = adminAnchor?.primaryContactUserId;
  if (contactId && Types.ObjectId.isValid(String(contactId))) {
    const contact = await User.findById(contactId).select(USER_CODE_SELECT).lean();
    if (contact && String(contact.role || "") === "admin") return contact;
  }

  const ownerIds = (Array.isArray(adminAnchor?.owners) ? adminAnchor.owners : [])
    .filter((id) => Types.ObjectId.isValid(String(id)));
  if (ownerIds.length) {
    const owner = await User.findOne({ _id: { $in: ownerIds }, role: "admin" })
      .sort({ createdAt: 1, _id: 1 })
      .select(USER_CODE_SELECT)
      .lean();
    if (owner) return owner;
  }

  const linked = await User.findOne({
    role: "admin",
    businessAnchorId: adminAnchor._id,
  })
    .sort({ createdAt: 1, _id: 1 })
    .select(USER_CODE_SELECT)
    .lean();
  if (linked) return linked;

  return User.findOne({ role: "admin" })
    .sort({ createdAt: 1, _id: 1 })
    .select(USER_CODE_SELECT)
    .lean();
}

/**
 * 어벗츠 관리자 소개 코드를 AAA로 맞춘다.
 * @returns {{ ok: boolean, reason?: string, userId?: string, businessAnchorId?: string, referralCode?: string }}
 */
export async function ensureAbutsAdminReferralCode() {
  const adminAnchor = await findAdminBusinessAnchor();
  if (!adminAnchor?._id) {
    return { ok: false, reason: "no_admin_anchor" };
  }

  const canonical = await resolveCanonicalAdminUser(adminAnchor);
  if (!canonical?._id) {
    return { ok: false, reason: "no_admin_user" };
  }

  const holder = await User.findOne({
    referralCode: { $regex: `^${ABUTS_ADMIN_REFERRAL_CODE}$`, $options: "i" },
  })
    .select(USER_CODE_SELECT)
    .lean();

  if (holder && String(holder._id) !== String(canonical._id)) {
    const replacement = await allocateReplacementReferralCode(holder.role);
    const moved = await User.updateOne(
      { _id: holder._id, referralCode: holder.referralCode },
      { $set: { referralCode: replacement } },
    );
    if (!moved?.modifiedCount && String(holder.referralCode || "").toUpperCase() === ABUTS_ADMIN_REFERRAL_CODE) {
      return { ok: false, reason: "code_held" };
    }
    console.log(
      `[abutsAdminReferral] reserved ${ABUTS_ADMIN_REFERRAL_CODE} moved off user=${holder._id}`,
    );
  }

  if (
    String(canonical.referralCode || "")
      .trim()
      .toUpperCase() !== ABUTS_ADMIN_REFERRAL_CODE
  ) {
    await User.updateOne(
      { _id: canonical._id },
      { $set: { referralCode: ABUTS_ADMIN_REFERRAL_CODE } },
    );
  } else if (String(canonical.referralCode || "") !== ABUTS_ADMIN_REFERRAL_CODE) {
    await User.updateOne(
      { _id: canonical._id },
      { $set: { referralCode: ABUTS_ADMIN_REFERRAL_CODE } },
    );
  }

  return {
    ok: true,
    userId: String(canonical._id),
    businessAnchorId: String(adminAnchor._id),
    referralCode: ABUTS_ADMIN_REFERRAL_CODE,
  };
}

export async function resolveAbutsAdminReferralAnchorId() {
  const ensured = await ensureAbutsAdminReferralCode();
  if (!ensured.ok || !Types.ObjectId.isValid(String(ensured.businessAnchorId || ""))) {
    return null;
  }
  return ensured.businessAnchorId;
}

export async function resolveRequestorSignupAtForAnchor(anchor, knownUser = null) {
  const contactId = String(anchor?.primaryContactUserId || "").trim();
  if (
    knownUser &&
    contactId &&
    String(knownUser._id || "") === contactId &&
    knownUser.createdAt
  ) {
    return resolveRequestorSignupAt({
      ownerCreatedAt: knownUser.createdAt,
      anchorCreatedAt: anchor?.createdAt,
    });
  }
  if (Types.ObjectId.isValid(contactId)) {
    const owner = await User.findById(contactId).select({ createdAt: 1 }).lean();
    return resolveRequestorSignupAt({
      ownerCreatedAt: owner?.createdAt,
      anchorCreatedAt: anchor?.createdAt,
    });
  }
  return resolveRequestorSignupAt({ anchorCreatedAt: anchor?.createdAt });
}

export async function assignAbutsAdminReferralToRequestor(anchorId) {
  const id = String(anchorId || "").trim();
  if (!Types.ObjectId.isValid(id)) return null;
  const adminAnchorId = await resolveAbutsAdminReferralAnchorId();
  if (!adminAnchorId) {
    throw new Error("어벗츠 소개 코드가 없습니다.");
  }

  const assignedAt = new Date();
  const updated = await BusinessAnchor.findOneAndUpdate(
    {
      _id: new Types.ObjectId(id),
      businessType: { $in: ["requestor", "practice"] },
      ...unownedReferralFilter(),
    },
    {
      $set: {
        referredByAnchorId: new Types.ObjectId(adminAnchorId),
        defaultReferralAnchorId: new Types.ObjectId(adminAnchorId),
        referralAssignedAt: assignedAt,
        dealershipCommissionRate: null,
      },
    },
    { new: true },
  ).select({ _id: 1, referredByAnchorId: 1 });

  if (!updated) return null;

  await User.updateMany(
    { businessAnchorId: updated._id },
    { $set: { referredByAnchorId: new Types.ObjectId(adminAnchorId) } },
  );
  emitReferralMembershipChanged(String(updated._id), "referral-admin-default");
  emitReferralMembershipChanged(adminAnchorId, "referral-admin-default-parent");

  return {
    businessAnchorId: String(updated._id),
    referredByAnchorId: adminAnchorId,
    referralAssignedAt: assignedAt,
    adminDefault: true,
  };
}

export async function maybeAssignAbutsAdminReferral(anchor, { signupAt, now = new Date() } = {}) {
  const hasReferrer = Boolean(
    anchor?.referredByAnchorId &&
      Types.ObjectId.isValid(String(anchor.referredByAnchorId)),
  );
  const hasPriorDefault = Boolean(
    anchor?.defaultReferralAnchorId &&
      Types.ObjectId.isValid(String(anchor.defaultReferralAnchorId)),
  );
  if (
    !shouldAssignAbutsAdminReferral({
      hasReferrer,
      hasPriorDefault,
      signupAt,
      now,
    })
  ) {
    return null;
  }
  return assignAbutsAdminReferralToRequestor(anchor._id);
}

/**
 * 가입 14일이 지난 미귀속 의뢰자에 어벗츠 소개를 붙인다.
 */
export async function assignExpiredUnownedRequestorReferrals({
  now = new Date(),
  limit = 500,
  afterId = null,
} = {}) {
  const batchLimit = Math.max(1, Math.min(2000, Math.floor(Number(limit) || 500)));
  const result = {
    scanned: 0,
    assigned: 0,
    skipped: 0,
    errors: 0,
    nextAfterId: null,
    exhausted: false,
  };

  const ensured = await ensureAbutsAdminReferralCode();
  if (!ensured.ok) {
    result.errors += 1;
    result.exhausted = true;
    console.error(
      `[abutsAdminReferral] ensure failed reason=${ensured.reason || "unknown"}`,
    );
    return result;
  }

  const filter = {
    businessType: { $in: ["requestor", "practice"] },
    ...unownedReferralFilter(),
  };
  const after = String(afterId || "").trim();
  if (Types.ObjectId.isValid(after)) {
    filter._id = { $gt: new Types.ObjectId(after) };
  }

  const candidates = await BusinessAnchor.find(filter)
    .select({ _id: 1, createdAt: 1, primaryContactUserId: 1 })
    .sort({ _id: 1 })
    .limit(batchLimit)
    .lean();

  if (!candidates.length) {
    result.exhausted = true;
    return result;
  }

  result.scanned = candidates.length;
  result.nextAfterId = String(candidates[candidates.length - 1]._id);
  result.exhausted = candidates.length < batchLimit;

  const contactIds = Array.from(
    new Set(
      candidates
        .map((row) => String(row?.primaryContactUserId || "").trim())
        .filter((id) => Types.ObjectId.isValid(id)),
    ),
  );
  const owners = contactIds.length
    ? await User.find({ _id: { $in: contactIds.map((id) => new Types.ObjectId(id)) } })
        .select({ createdAt: 1 })
        .lean()
    : [];
  const createdAtByOwnerId = new Map(
    owners.map((row) => [String(row._id), row.createdAt || null]),
  );

  for (const row of candidates) {
    try {
      const signupAt = resolveRequestorSignupAt({
        ownerCreatedAt: createdAtByOwnerId.get(String(row.primaryContactUserId || "")) || null,
        anchorCreatedAt: row.createdAt,
      });
      if (
        !shouldAssignAbutsAdminReferral({
          hasReferrer: false,
          hasPriorDefault: false,
          signupAt,
          now,
        })
      ) {
        result.skipped += 1;
        continue;
      }
      const assigned = await assignAbutsAdminReferralToRequestor(row._id);
      if (assigned) result.assigned += 1;
      else result.skipped += 1;
    } catch (error) {
      result.errors += 1;
      console.error(
        `[abutsAdminReferral] assign failed anchor=${row?._id}`,
        error,
      );
    }
  }

  return result;
}

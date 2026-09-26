// related files:
// - web/backend/rules.md
// - web/backend/controllers/users/user.controller.js
// - web/backend/controllers/auth/auth.controller.js
// - web/backend/controllers/businesses/business.controller.js
// - web/backend/utils/requestorCapabilities.js
import crypto from "crypto";
import { Types } from "mongoose";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import User from "../../models/user.model.js";
import {
  hasRequestorProfile,
  resolveRequestorProfile,
  requestorProfilePersistFields,
} from "../../utils/requestorCapabilities.js";
import { emitReferralMembershipChanged } from "../../services/requestSnapshotTriggers.service.js";
import { enableDemoModeAndGrantCreditIfEligible } from "./business.demoMode.util.js";
import { resolveDealershipCommissionPolicy } from "../../services/creditRevenuePolicy.service.js";
import { loadCreditSettingsDefaults } from "../../utils/creditSettingsDefaults.js";

export const isSyntheticPracticeBusinessNumber = (value) => {
  const bn = String(value || "")
    .trim()
    .toLowerCase();
  return bn.startsWith("practice-");
};

export const hasCompletePracticeProfile = (profile) => {
  if (!profile || typeof profile !== "object") return false;
  const clinicName = String(profile.clinicName || "").trim();
  const directorName = String(profile.directorName || "").trim();
  const staffName = String(profile.staffName || "").trim();
  const phone = String(profile.phone || "").trim();
  const clinicPhone = String(profile.clinicPhone || "").trim();
  const address = String(profile.address || "").trim();
  const zipCode = String(profile.zipCode || "").trim();
  return Boolean(
    clinicName &&
      directorName &&
      staffName &&
      phone &&
      clinicPhone &&
      address &&
      zipCode,
  );
};

const buildSyntheticBusinessNumber = () =>
  `practice-${Date.now()}-${crypto.randomInt(1000, 9999)}`;

/**
 * 의뢰자(requestor) 조직 앵커 보장.
 * practice/lab은 kind일 뿐 — 발신 프로필만으로도 Org SSOT(BusinessAnchor)를 만든다.
 * 사업자등록번호가 없으면 synthetic `practice-*` BN을 사용하고,
 * 이후 유료(paid) 등록·검증 시 동일 앵커에 실BN을 올린다.
 */
export async function ensureRequestorOrgAnchor({ user } = {}) {
  if (!user?._id) return null;

  const role = String(user.role || "").trim();
  if (role !== "requestor" && role !== "practice") return null;

  const practiceProfile =
    user.practiceProfile && typeof user.practiceProfile === "object"
      ? user.practiceProfile
      : null;
  if (!hasCompletePracticeProfile(practiceProfile)) return null;

  const clinicName = String(practiceProfile.clinicName || "").trim();
  const directorName = String(practiceProfile.directorName || "").trim();
  const phone = String(practiceProfile.phone || "").trim();
  const clinicPhone = String(practiceProfile.clinicPhone || "").trim();
  const address = String(practiceProfile.address || "").trim();
  const addressDetail = String(practiceProfile.addressDetail || "").trim();
  const zipCode = String(practiceProfile.zipCode || "").trim();
  const email = String(user.email || "").trim();

  const resolved = resolveRequestorProfile({
    userKind: user.requestorKind,
    userServices: user.requestorServices,
    userCaps: user.requestorCapabilities,
    userRole: role,
    businessVerified: false,
  });
  const profile = hasRequestorProfile(resolved)
    ? resolved
    : { kind: "practice", services: { free: false, paid: true } };
  const persist = requestorProfilePersistFields(profile);

  const existingAnchorId = user.businessAnchorId;
  if (existingAnchorId && Types.ObjectId.isValid(String(existingAnchorId))) {
    const anchor = await BusinessAnchor.findById(existingAnchorId);
    if (anchor) {
      const isPrimary =
        String(anchor.primaryContactUserId || "") === String(user._id);
      if (isPrimary) {
        if (String(anchor.businessType || "") === "practice") {
          anchor.businessType = "requestor";
        }
        anchor.name = clinicName || anchor.name;
        anchor.metadata = {
          ...(anchor.metadata && typeof anchor.metadata === "object"
            ? anchor.metadata.toObject?.() || anchor.metadata
            : {}),
          companyName: clinicName,
          representativeName: directorName,
          address,
          addressDetail,
          zipCode,
          phoneNumber: clinicPhone || phone,
          email: email || String(anchor.metadata?.email || ""),
        };
        if (!anchor.requestorKind) {
          anchor.requestorKind = persist.requestorKind;
          anchor.requestorServices = persist.requestorServices;
        }
        if (typeof practiceProfile.usesOralScan === "boolean") {
          anchor.usesOralScan = practiceProfile.usesOralScan;
        }
        if (typeof practiceProfile.requireLabProsthesisUpload === "boolean") {
          anchor.requireLabProsthesisUpload =
            practiceProfile.requireLabProsthesisUpload;
        }
        const ownerIds = Array.isArray(anchor.owners) ? anchor.owners : [];
        if (!ownerIds.some((id) => String(id) === String(user._id))) {
          anchor.owners = [...ownerIds, user._id];
        }
        const memberIds = Array.isArray(anchor.members) ? anchor.members : [];
        if (!memberIds.some((id) => String(id) === String(user._id))) {
          anchor.members = [...memberIds, user._id];
        }
        await anchor.save();
      }

      const userPatch = {
        business: clinicName || String(user.business || ""),
      };
      if (!user.subRole) userPatch.subRole = "owner";
      if (!user.requestorKind) {
        Object.assign(userPatch, persist);
      }
      await User.findByIdAndUpdate(user._id, { $set: userPatch });
      return anchor;
    }
  }

  let stampedDealershipRate = null;
  if (user.referredByAnchorId) {
    try {
      const creditDefaults = await loadCreditSettingsDefaults();
      stampedDealershipRate =
        resolveDealershipCommissionPolicy(creditDefaults).activeRate;
    } catch {
      stampedDealershipRate = 0.2;
    }
  }

  const created = await BusinessAnchor.create({
    businessNumberNormalized: buildSyntheticBusinessNumber(),
    businessType: "requestor",
    name: clinicName,
    status: "active",
    primaryContactUserId: user._id,
    owners: [user._id],
    members: [user._id],
    demoMode: true,
    demoModeStartedAt: new Date(),
    usesOralScan: Boolean(practiceProfile.usesOralScan),
    requireLabProsthesisUpload:
      practiceProfile.requireLabProsthesisUpload !== false,
    ...persist,
    metadata: {
      companyName: clinicName,
      representativeName: directorName,
      address,
      addressDetail,
      zipCode,
      phoneNumber: clinicPhone || phone,
      email,
      businessItem: "",
      businessType: "",
      startDate: "",
      businessNumber: "",
    },
    verification: {
      verified: false,
      verifiedAt: null,
      verifiedBy: null,
    },
    referredByAnchorId: user.referredByAnchorId || null,
    defaultReferralAnchorId: user.referredByAnchorId || null,
    referralAssignedAt: user.referredByAnchorId ? new Date() : null,
    dealershipCommissionRate: stampedDealershipRate,
  });

  await User.findByIdAndUpdate(user._id, {
    $set: {
      businessAnchorId: created._id,
      business: clinicName,
      subRole: "owner",
      ...persist,
    },
  });

  emitReferralMembershipChanged(created._id, "business-anchor-linked");

  try {
    await enableDemoModeAndGrantCreditIfEligible({
      businessAnchorId: created._id,
      userId: user._id,
    });
  } catch (e) {
    console.error("[BusinessAnchor] demo mode grant on org ensure failed", e);
  }

  return created;
}

/**
 * 디지털 설정 → User.practiceProfile + BusinessAnchor(Org SSOT) 동기화.
 * 넘긴 boolean만 갱신한다. 이벤트 신청·회원 설정 공통.
 */
export async function syncPracticeUsesOralScan({
  userId = null,
  businessAnchorId = null,
  usesOralScan,
  requireLabProsthesisUpload,
} = {}) {
  const userSet = {};
  const anchorSet = {};
  if (typeof usesOralScan === "boolean") {
    userSet["practiceProfile.usesOralScan"] = usesOralScan;
    anchorSet.usesOralScan = usesOralScan;
  }
  if (typeof requireLabProsthesisUpload === "boolean") {
    userSet["practiceProfile.requireLabProsthesisUpload"] =
      requireLabProsthesisUpload;
    anchorSet.requireLabProsthesisUpload = requireLabProsthesisUpload;
  }
  if (!Object.keys(anchorSet).length) {
    return { updatedUser: false, updatedAnchor: false };
  }
  userSet["practiceProfile.updatedAt"] = new Date();

  let anchorId = businessAnchorId || null;
  const userOid =
    userId && Types.ObjectId.isValid(String(userId))
      ? new Types.ObjectId(String(userId))
      : null;

  if (!anchorId && userOid) {
    const user = await User.findById(userOid)
      .select({ businessAnchorId: 1 })
      .lean();
    anchorId = user?.businessAnchorId || null;
  }

  const ops = [];
  let updatedUser = false;
  let updatedAnchor = false;

  if (userOid) {
    ops.push(
      User.updateOne(
        { _id: userOid },
        { $set: userSet },
      ).then((r) => {
        updatedUser = Number(r?.modifiedCount || r?.nModified || 0) > 0 || Number(r?.matchedCount || 0) > 0;
      }),
    );
  }

  if (anchorId && Types.ObjectId.isValid(String(anchorId))) {
    ops.push(
      BusinessAnchor.updateOne(
        { _id: anchorId },
        { $set: anchorSet },
      ).then((r) => {
        updatedAnchor =
          Number(r?.modifiedCount || r?.nModified || 0) > 0 ||
          Number(r?.matchedCount || 0) > 0;
      }),
    );
  }

  if (ops.length) await Promise.all(ops);
  return { updatedUser, updatedAnchor, businessAnchorId: anchorId || null };
}

function hasStoredUsesOralScan(doc) {
  return Boolean(
    doc &&
      typeof doc === "object" &&
      Object.prototype.hasOwnProperty.call(doc, "usesOralScan") &&
      typeof doc.usesOralScan === "boolean",
  );
}

function isPracticeRequestorUser(user) {
  if (!user) return false;
  if (user.requestorKind === "practice" || user.role === "practice") return true;
  if (user.requestorKind === "lab") return false;
  return Boolean(user.requestorCapabilities?.practice);
}

/**
 * 스키마 default(false)는 미응답과 같다. lean 문서에 필드가 있을 때만 응답으로 본다.
 * 유저 practiceProfile 또는 소속 사업자 중 하나라도 저장돼 있으면 다시 묻지 않는다.
 */
export async function readPracticeOralScanAnswer(userId) {
  const empty = {
    isPractice: false,
    needsAnswer: false,
    value: null,
    anchorHas: false,
    businessAnchorId: null,
  };
  if (!userId || !Types.ObjectId.isValid(String(userId))) return empty;

  const user = await User.findById(userId)
    .select({
      practiceProfile: 1,
      businessAnchorId: 1,
      requestorKind: 1,
      role: 1,
      requestorCapabilities: 1,
    })
    .lean();
  if (!user) return empty;

  const isPractice = isPracticeRequestorUser(user);
  const pp =
    user.practiceProfile && typeof user.practiceProfile === "object"
      ? user.practiceProfile
      : null;
  const userHas = hasStoredUsesOralScan(pp);

  let anchorHas = false;
  let anchorValue = null;
  const anchorId = user.businessAnchorId || null;
  if (anchorId && Types.ObjectId.isValid(String(anchorId))) {
    const anchor = await BusinessAnchor.findById(anchorId)
      .select({ usesOralScan: 1 })
      .lean();
    anchorHas = hasStoredUsesOralScan(anchor);
    if (anchorHas) anchorValue = Boolean(anchor.usesOralScan);
  }

  const value = userHas
    ? Boolean(pp.usesOralScan)
    : anchorHas
      ? anchorValue
      : null;

  return {
    isPractice,
    needsAnswer: isPractice && value == null,
    value,
    anchorHas,
    businessAnchorId: anchorId,
  };
}

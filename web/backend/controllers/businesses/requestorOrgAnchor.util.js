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

  const created = await BusinessAnchor.create({
    businessNumberNormalized: buildSyntheticBusinessNumber(),
    businessType: "requestor",
    name: clinicName,
    status: "active",
    primaryContactUserId: user._id,
    owners: [user._id],
    members: [user._id],
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
  return created;
}

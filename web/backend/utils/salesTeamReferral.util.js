// related files:
// - web/backend/controllers/salesTeam/salesTeam.controller.js
// - web/backend/controllers/auth/auth.controller.js
import BusinessAnchor from "../models/businessAnchor.model.js";
import User from "../models/user.model.js";

/**
 * Ensure salesTeam user has a personal BusinessAnchor for referral attribution.
 * Does not overwrite an existing non-salesTeam businessAnchorId (e.g. admin org membership).
 * Returns the salesTeam referral anchor id.
 */
export async function ensureSalesTeamPersonalAnchor(userDoc) {
  if (!userDoc?._id) return null;
  if (String(userDoc.role || "") !== "salesTeam") return null;

  const existingOwned = await BusinessAnchor.findOne({
    businessType: "salesTeam",
    $or: [
      { primaryContactUserId: userDoc._id },
      { owners: userDoc._id },
    ],
  })
    .select({ _id: 1 })
    .lean();

  if (existingOwned?._id) {
    if (!userDoc.businessAnchorId) {
      userDoc.businessAnchorId = existingOwned._id;
      userDoc.subRole = userDoc.subRole || "owner";
      await userDoc.save();
    }
    return existingOwned._id;
  }

  const syntheticBn = `salesTeam-${String(userDoc._id)}`.slice(0, 40);
  const anchor = await BusinessAnchor.create({
    businessNumberNormalized: syntheticBn,
    name: `${String(userDoc.name || "영업").trim()} (영업본부)`,
    businessType: "salesTeam",
    status: "active",
    primaryContactUserId: userDoc._id,
    owners: [userDoc._id],
    members: [userDoc._id],
    metadata: {
      companyName: `${String(userDoc.name || "영업").trim()} (영업본부)`,
      representativeName: String(userDoc.name || "").trim(),
      email: String(userDoc.email || "").trim(),
      phoneNumber: String(userDoc.phoneNumber || "").trim(),
    },
  });

  if (!userDoc.businessAnchorId) {
    userDoc.businessAnchorId = anchor._id;
    userDoc.subRole = userDoc.subRole || "owner";
    await userDoc.save();
  }

  return anchor._id;
}

export async function ensureSalesTeamReferralCode(userDoc) {
  const existing = String(userDoc.referralCode || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{3}$/.test(existing)) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let created = null;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      let code = "";
      for (let i = 0; i < 3; i += 1) {
        code += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
      const exists = await User.exists({ referralCode: code });
      if (!exists) {
        userDoc.referralCode = code;
        created = code;
        break;
      }
    }
    if (!created) throw new Error("소개코드 생성에 실패했습니다.");
    await userDoc.save();
  }

  await ensureSalesTeamPersonalAnchor(userDoc);

  return String(userDoc.referralCode || "")
    .trim()
    .toUpperCase();
}

/** Prefer personal salesTeam BA for referral; fall back to businessAnchorId. */
export async function resolveSalesTeamReferralAnchorId(userLeanOrDoc) {
  const userId = userLeanOrDoc?._id;
  if (!userId) return null;
  const owned = await BusinessAnchor.findOne({
    businessType: "salesTeam",
    $or: [{ primaryContactUserId: userId }, { owners: userId }],
  })
    .select({ _id: 1 })
    .lean();
  if (owned?._id) return owned._id;
  return userLeanOrDoc.businessAnchorId || null;
}

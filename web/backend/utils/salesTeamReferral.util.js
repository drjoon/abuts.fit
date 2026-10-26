// related files:
// - web/backend/controllers/salesTeam/salesTeam.controller.js
// - web/backend/controllers/auth/auth.controller.js
import User from "../models/user.model.js";
import { isReservedReferralCode } from "./requestorReferralWindow.util.js";

/**
 * salesTeam 전용 사업자는 두지 않는다.
 * 마케팅영업부 소개 귀속은 계정에 이미 연결된 어벗츠 앵커를 쓴다.
 */
export async function ensureSalesTeamPersonalAnchor() {
  return null;
}

export async function ensureSalesTeamReferralCode(userDoc) {
  const existing = String(userDoc.referralCode || "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{3}$/.test(existing) || isReservedReferralCode(existing)) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let created = null;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      let code = "";
      for (let i = 0; i < 3; i += 1) {
        code += alphabet[Math.floor(Math.random() * alphabet.length)];
      }
      if (isReservedReferralCode(code)) continue;
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

/** 소개 귀속 앵커. 마케팅영업부는 어벗츠 소속 앵커다. */
export async function resolveSalesTeamReferralAnchorId(userLeanOrDoc) {
  return userLeanOrDoc?.businessAnchorId || null;
}

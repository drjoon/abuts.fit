// related files:
// - web/backend/rules.md
// - web/backend/controllers/requests/common.review.helpers.js
// - web/backend/controllers/credits/credit.controller.js
// - web/backend/models/creditLedger.model.js
import User from "../../models/user.model.js";
import SignupVerification from "../../models/signupVerification.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";
import CreditLedger from "../../models/creditLedger.model.js";
import {
  generateToken,
  generateRefreshToken,
  verifyToken,
} from "../../utils/jwt.util.js";
import { Types } from "mongoose";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import {
  assertSignupVerifications,
  consumeSignupVerifications,
} from "./signupVerification.controller.js";
import {
  logSecurityEvent,
  logAuthFailure,
} from "../../controllers/admin/admin.shared.controller.js";
import { triggerPricingSnapshotForUserDoc } from "../../services/requestSnapshotTriggers.service.js";
import { sendEmail } from "../../utils/email.util.js";
import { getFrontendBaseUrl } from "../../utils/url.util.js";

const createReferralCode = (length, alphaOnly = false) => {
  const alphabet = alphaOnly
    ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    : "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return code;
};

const ensureUniqueReferralCode = async (length, alphaOnly = false) => {
  for (let i = 0; i < 200; i += 1) {
    const code = createReferralCode(length, alphaOnly);
    const exists = await User.exists({ referralCode: code });
    if (!exists) return code;
  }
  throw new Error("Failed to create referralCode after 200 attempts");
};

const REFERRAL_ALLOWED_ROLES = new Set(["requestor", "salesman", "devops"]);
const SIGNUP_LINK_REFERRER_ALLOWED_ROLES = new Set(["requestor", "salesman"]);

function getAllowedSignupRolesForReferrerRole(referrerRole) {
  const normalizedReferrerRole = String(referrerRole || "").trim();
  if (normalizedReferrerRole === "requestor") {
    return ["requestor"];
  }
  if (normalizedReferrerRole === "salesman") {
    return ["requestor", "salesman"];
  }
  return [];
}

function getReferralRoleMismatchMessage({ signupRole, referrerRole }) {
  const normalizedSignupRole = String(signupRole || "").trim();
  const normalizedReferrerRole = String(referrerRole || "").trim();
  if (
    normalizedReferrerRole === "requestor" &&
    normalizedSignupRole !== "requestor"
  ) {
    return "의뢰자 소개 링크로는 의뢰자만 가입할 수 있습니다.";
  }
  if (
    normalizedReferrerRole === "salesman" &&
    normalizedSignupRole !== "requestor" &&
    normalizedSignupRole !== "salesman"
  ) {
    return "영업자 소개 링크로는 의뢰자 또는 영업자만 가입할 수 있습니다.";
  }
  return "소개 링크와 가입 역할이 맞지 않습니다.";
}

async function resolveDefaultDevopsReferrer() {
  const defaultDevopsUser = await User.findOne({
    role: "devops",
    active: true,
    businessAnchorId: { $ne: null },
  })
    .select({ _id: 1, businessAnchorId: 1, createdAt: 1 })
    .sort({ createdAt: 1, _id: 1 })
    .lean();

  if (!defaultDevopsUser) {
    throw new Error(
      "기본 소개 개발운영사 계정을 찾을 수 없습니다. 개발운영사 사업자를 먼저 준비해주세요.",
    );
  }

  const businessAnchorId = String(
    defaultDevopsUser.businessAnchorId || "",
  ).trim();
  if (!Types.ObjectId.isValid(businessAnchorId)) {
    throw new Error("기본 소개 개발운영사 사업자 정보가 올바르지 않습니다.");
  }

  const anchorExists = await BusinessAnchor.exists({
    _id: new Types.ObjectId(businessAnchorId),
  });
  if (!anchorExists) {
    throw new Error("기본 소개 개발운영사 사업자를 찾을 수 없습니다.");
  }

  return {
    referredByAnchorId: new Types.ObjectId(businessAnchorId),
  };
}

async function resolveReferrerTargets({
  referredByEmail,
  referredByReferralCode,
  socialToken,
  signupRole,
}) {
  let resolvedReferralCode = String(referredByReferralCode || "")
    .trim()
    .toUpperCase();
  let resolvedReferralEmail = String(referredByEmail || "")
    .trim()
    .toLowerCase();

  if (!resolvedReferralCode && !resolvedReferralEmail && socialToken) {
    const decoded = verifyToken(String(socialToken || "").trim());
    if (decoded?.type === "social_signup") {
      resolvedReferralCode = String(decoded.ref || "")
        .trim()
        .toUpperCase();
      resolvedReferralEmail = String(decoded.referredByEmail || "")
        .trim()
        .toLowerCase();
    }
  }

  const normalizedSignupRole = String(signupRole || "").trim();

  if (!resolvedReferralCode && !resolvedReferralEmail) {
    if (normalizedSignupRole === "requestor" || normalizedSignupRole === "practice") {
      return resolveDefaultDevopsReferrer();
    }
    return {
      referredByAnchorId: null,
      referrerRole: null,
      allowedSignupRoles: [],
    };
  }

  let refUser = null;
  if (resolvedReferralEmail) {
    refUser = await User.findOne({ email: resolvedReferralEmail })
      .select({
        _id: 1,
        role: 1,
        active: 1,
        businessId: 1,
        businessAnchorId: 1,
      })
      .lean();
  } else if (resolvedReferralCode) {
    refUser = await User.findOne({
      referralCode: { $regex: `^${resolvedReferralCode}$`, $options: "i" },
    })
      .select({
        _id: 1,
        role: 1,
        active: 1,
        businessId: 1,
        businessAnchorId: 1,
      })
      .lean();
  }

  if (!refUser || refUser.active === false) {
    throw new Error("추천인을 찾을 수 없습니다.");
  }

  if (!REFERRAL_ALLOWED_ROLES.has(String(refUser.role || ""))) {
    throw new Error("추천인은 의뢰자/영업자/개발운영사 계정만 가능합니다.");
  }

  const normalizedReferrerRole = String(refUser.role || "").trim();
  if (!SIGNUP_LINK_REFERRER_ALLOWED_ROLES.has(normalizedReferrerRole)) {
    throw new Error("소개 링크 가입은 의뢰자 또는 영업자 소개만 가능합니다.");
  }

  const allowedSignupRoles = getAllowedSignupRolesForReferrerRole(
    normalizedReferrerRole,
  );
  if (!allowedSignupRoles.includes(normalizedSignupRole)) {
    throw new Error(
      getReferralRoleMismatchMessage({
        signupRole: normalizedSignupRole,
        referrerRole: normalizedReferrerRole,
      }),
    );
  }

  const refBusinessAnchorId = String(refUser.businessAnchorId || "").trim();
  if (!Types.ObjectId.isValid(refBusinessAnchorId)) {
    throw new Error(
      "추천인 사업자 정보가 없습니다. 사업자 등록 후 다시 시도해주세요.",
    );
  }

  const anchorExists = await BusinessAnchor.exists({
    _id: new Types.ObjectId(refBusinessAnchorId),
  });
  if (!anchorExists) {
    throw new Error("추천인 사업자 정보를 찾을 수 없습니다.");
  }

  return {
    referredByAnchorId: new Types.ObjectId(refBusinessAnchorId),
    referrerRole: normalizedReferrerRole,
    allowedSignupRoles,
  };
}

// $ 는 .env 파일의 변수 확장 문자이므로 비밀번호에 사용하지 않는다.
// 이 규칙은 시딩(PASSWORD_ALPHABET), 회원가입, 비밀번호 재설정 모두에 동일하게 적용한다.
const isStrongPassword = (password) => {
  const p = String(password || "");
  if (p.length < 10) return false;
  if (p.includes("$")) return false;
  if (!/[!@#%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p)) return false;
  return true;
};

const HANGUL_BASE = 0xac00;
const HANGUL_END = 0xd7a3;
const CHOSEONG = [
  "g",
  "kk",
  "n",
  "d",
  "tt",
  "r",
  "m",
  "b",
  "pp",
  "s",
  "ss",
  "",
  "j",
  "jj",
  "ch",
  "k",
  "t",
  "p",
  "h",
];
const JUNGSEONG = [
  "a",
  "ae",
  "ya",
  "yae",
  "eo",
  "e",
  "yeo",
  "ye",
  "o",
  "wa",
  "wae",
  "oe",
  "yo",
  "u",
  "wo",
  "we",
  "wi",
  "yu",
  "eu",
  "ui",
  "i",
];
const JONGSEONG = [
  "",
  "k",
  "k",
  "ks",
  "n",
  "nj",
  "nh",
  "t",
  "l",
  "lk",
  "lm",
  "lb",
  "ls",
  "lt",
  "lp",
  "lh",
  "m",
  "p",
  "ps",
  "t",
  "t",
  "ng",
  "t",
  "t",
  "k",
  "t",
  "p",
  "h",
];

const romanizeHangulSyllable = (ch) => {
  const code = ch.charCodeAt(0);
  if (code < HANGUL_BASE || code > HANGUL_END) return "";

  const sIndex = code - HANGUL_BASE;
  const cho = Math.floor(sIndex / (21 * 28));
  const jung = Math.floor((sIndex % (21 * 28)) / 28);
  const jong = sIndex % 28;

  return `${CHOSEONG[cho]}${JUNGSEONG[jung]}${JONGSEONG[jong]}`;
};

const toAsciiSlug = (value = "") => {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";

  let out = "";
  for (const ch of raw) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      out += romanizeHangulSyllable(ch);
      continue;
    }
    if ((code >= 97 && code <= 122) || (code >= 48 && code <= 57)) {
      out += ch;
      continue;
    }
    if (ch === " " || ch === "-" || ch === "_") {
      out += "-";
      continue;
    }
  }

  return out
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
};

const createPracticePseudoEmail = (seed = "practice") => {
  const base = toAsciiSlug(seed).slice(0, 32);
  const suffix = `${Date.now()}${crypto.randomInt(1000, 9999)}`;
  return `practice.${base || "clinic"}-${suffix}@abuts.fit`;
};

const createPracticeAnchorBusinessNumber = () => {
  return `practice-${Date.now()}-${crypto.randomInt(1000, 9999)}`;
};

const normalizeDigits = (value) => String(value || "").replace(/\D/g, "");

const sendLoginSuccessResponse = async ({
  user,
  res,
  successMessage = "로그인 성공",
}) => {
  user.lastLogin = Date.now();
  if (!user.referralCode) {
    const len = String(user.role || "") === "salesman" ? 4 : 5;
    user.referralCode = await ensureUniqueReferralCode(len);
  }
  await user.save();

  const token = generateToken({ userId: user._id, role: user.role });
  const refreshToken = generateRefreshToken(user._id);

  const userWithoutPassword = { ...user.toObject() };
  delete userWithoutPassword.password;

  res.status(200).json({
    success: true,
    message: successMessage,
    data: {
      user: userWithoutPassword,
      token,
      refreshToken,
    },
  });
};

function isShippingRefType(refType) {
  return refType === "SHIPPING_PACKAGE" || refType === "SHIPPING_FEE";
}

function resolveLedgerSplit(absAmount, spentPaidAmount, spentBonusAmount) {
  const abs = Math.max(0, Number(absAmount) || 0);
  const paidRaw = Number(spentPaidAmount);
  const bonusRaw = Number(spentBonusAmount);

  const hasPaid = Number.isFinite(paidRaw);
  const hasBonus = Number.isFinite(bonusRaw);
  if (!hasPaid && !hasBonus) return null;

  let paid = Math.max(0, hasPaid ? paidRaw : 0);
  let bonus = Math.max(0, hasBonus ? bonusRaw : 0);

  const splitSum = paid + bonus;
  if (splitSum <= 0) return null;

  if (splitSum > abs) {
    let overflow = splitSum - abs;
    const reducePaid = Math.min(paid, overflow);
    paid -= reducePaid;
    overflow -= reducePaid;
    if (overflow > 0) {
      bonus = Math.max(0, bonus - overflow);
    }
  } else if (splitSum < abs) {
    paid += abs - splitSum;
  }

  return { paid, bonus };
}

async function getBusinessCreditBalanceBreakdown(businessAnchorId) {
  const normalizedBusinessAnchorId = String(businessAnchorId || "").trim();
  if (!Types.ObjectId.isValid(normalizedBusinessAnchorId)) {
    return {
      balance: 0,
      paidCredit: 0,
      bonusRequestCredit: 0,
      bonusShippingCredit: 0,
    };
  }

  const rows = await CreditLedger.find({
    businessAnchorId: new Types.ObjectId(normalizedBusinessAnchorId),
  })
    .sort({ createdAt: 1, _id: 1 })
    .select({
      type: 1,
      amount: 1,
      refType: 1,
      spentPaidAmount: 1,
      spentBonusAmount: 1,
    })
    .lean();

  let paid = 0;
  let bonusRequest = 0;
  let bonusShipping = 0;

  for (const r of rows) {
    const type = String(r?.type || "");
    const amount = Number(r?.amount || 0);
    const refType = String(r?.refType || "");

    if (!Number.isFinite(amount)) continue;

    const absAmount = Math.abs(amount);

    if (type === "CHARGE") {
      paid += absAmount;
      continue;
    }
    if (type === "BONUS") {
      if (refType === "FREE_SHIPPING_CREDIT") {
        bonusShipping += absAmount;
      } else {
        bonusRequest += absAmount;
      }
      continue;
    }
    if (type === "ADJUST") {
      paid += amount;
      continue;
    }

    if (type === "SPEND") {
      const split = resolveLedgerSplit(
        absAmount,
        r?.spentPaidAmount,
        r?.spentBonusAmount,
      );

      if (split) {
        if (isShippingRefType(refType)) {
          const fromBonusShipping = Math.min(bonusShipping, split.bonus);
          bonusShipping -= fromBonusShipping;
          paid -= split.paid + Math.max(0, split.bonus - fromBonusShipping);
        } else {
          const fromBonusRequest = Math.min(bonusRequest, split.bonus);
          bonusRequest -= fromBonusRequest;
          paid -= split.paid + Math.max(0, split.bonus - fromBonusRequest);
        }
        continue;
      }

      let spend = absAmount;
      if (isShippingRefType(refType)) {
        const fromBonusShipping = Math.min(bonusShipping, spend);
        bonusShipping -= fromBonusShipping;
        spend -= fromBonusShipping;
      } else {
        const fromBonusRequest = Math.min(bonusRequest, spend);
        bonusRequest -= fromBonusRequest;
        spend -= fromBonusRequest;
      }
      paid -= spend;
      continue;
    }

    if (type === "REFUND") {
      const split = resolveLedgerSplit(
        absAmount,
        r?.spentPaidAmount,
        r?.spentBonusAmount,
      );

      if (split) {
        if (isShippingRefType(refType)) {
          bonusShipping += split.bonus;
        } else {
          bonusRequest += split.bonus;
        }
        paid += split.paid;
      } else {
        paid += absAmount;
      }
    }
  }

  const paidCredit = Math.max(0, Math.round(paid));
  const bonusRequestCredit = Math.max(0, Math.round(bonusRequest));
  const bonusShippingCredit = Math.max(0, Math.round(bonusShipping));
  return {
    balance: paidCredit + bonusRequestCredit + bonusShippingCredit,
    paidCredit,
    bonusRequestCredit,
    bonusShippingCredit,
  };
}

// // 회원가입
// export const signup = async (req, res) => {
//   try {
//     const { email, password, name } = req.body;

//     const existingUser = await User.findOne({ email });
//     if (existingUser) {
//       return res
//         .status(409)
//         .json({ success: false, message: "이미 가입된 이메일입니다." });
//     }

//     const user = new User({ email, password, name });
//     await user.save();

//     res
//       .status(201)
//       .json({ success: true, message: "회원가입이 완료되었습니다." });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: "서버 오류가 발생했습니다.",
//       error: error.message,
//     });
//   }
// };

// // 로그인
// export const login = async (req, res) => {
//   try {
//     const { email, password } = req.body;
//     const user = await User.findOne({ email });

//     if (!user) {
//       return res
//         .status(401)
//         .json({
//           success: false,
//           message: "이메일 또는 비밀번호가 일치하지 않습니다.",
//         });
//     }

//     const isMatch = await user.comparePassword(password);
//     if (!isMatch) {
//       return res
//         .status(401)
//         .json({
//           success: false,
//           message: "이메일 또는 비밀번호가 일치하지 않습니다.",
//         });
//     }

//     const accessToken = generateToken({ id: user._id, role: user.role });
//     const refreshToken = generateRefreshToken({
//       id: user._id,
//       role: user.role,
//     });

//     res.cookie("refreshToken", refreshToken, {
//       httpOnly: true,
//       secure: process.env.NODE_ENV === "production",
//     });

//     res.status(200).json({
//       success: true,
//       data: {
//         token: accessToken,
//         user: {
//           id: user._id,
//           email: user.email,
//           name: user.name,
//           role: user.role,
//         },
//       },
//     });
//   } catch (error) {
//     res
//       .status(500)
//       .json({
//         success: false,
//         message: "서버 오류가 발생했습니다.",
//         error: error.message,
//       });
//   }
// };

// // 로그아웃
// export const logout = (req, res) => {
//   res.clearCookie("refreshToken");
//   res.status(200).json({ success: true, message: "로그아웃 되었습니다." });
// };

// // 토큰 갱신
// export const refreshToken = (req, res) => {
//   const refreshToken = req.cookies.refreshToken;
//   if (!refreshToken)
//     return res
//       .status(401)
//       .json({ success: false, message: "리프레시 토큰이 없습니다." });

//   try {
//     const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
//     const accessToken = generateToken({ id: decoded.id, role: decoded.role });
//     res.status(200).json({ success: true, data: { token: accessToken } });
//   } catch (error) {
//     res
//       .status(403)
//       .json({ success: false, message: "리프레시 토큰이 유효하지 않습니다." });
//   }
// };

// // 비밀번호 재설정 요청
// export const requestPasswordReset = async (req, res) => {
//   res.status(501).json({ message: "Not Implemented" });
// };

// // 비밀번호 재설정
// export const resetPassword = async (req, res) => {
//   res.status(501).json({ message: "Not Implemented" });
// };

// // 내 정보 조회
// export const getMe = async (req, res) => {
//   try {
//     const user = await User.findById(req.user.id).select("-password");
//     if (!user) {
//       return res
//         .status(404)
//         .json({ success: false, message: "사용자를 찾을 수 없습니다." });
//     }
//     res.status(200).json({ success: true, data: user });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: "서버 오류가 발생했습니다.",
//       error: error.message,
//     });
//   }
// };

// // 내 정보 수정
// export const updateMe = async (req, res) => {
//   try {
//     const { name, password } = req.body;
//     const user = await User.findById(req.user.id);

//     if (!user) {
//       return res
//         .status(404)
//         .json({ success: false, message: "사용자를 찾을 수 없습니다." });
//     }

//     if (name) user.name = name;
//     if (password) {
//       user.password = password;
//     }

//     const updatedUser = await user.save();
//     updatedUser.password = undefined;

//     res.status(200).json({ success: true, data: updatedUser });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: "서버 오류가 발생했습니다.",
//       error: error.message,
//     });
//   }
// };

// // 회원 탈퇴
// export const deleteMe = async (req, res) => {
//   try {
//     const user = await User.findByIdAndDelete(req.user.id);
//     if (!user) {
//       return res
//         .status(404)
//         .json({ success: false, message: "사용자를 찾을 수 없습니다." });
//     }
//     res.clearCookie("refreshToken");
//     res
//       .status(200)
//       .json({ success: true, message: "회원 탈퇴가 완료되었습니다." });
//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: "서버 오류가 발생했습니다.",
//       error: error.message,
//     });
//   }
// };

/**
 * 회원가입
 * @route POST /api/auth/register
 */
async function register(req, res) {
  try {
    const {
      name,
      email,
      password,
      role,
      requestorType,
      referredByEmail,
      referredByReferralCode,
      socialProvider,
      socialProviderUserId,
      socialToken,
      signupChannel,
      clinicName,
    } = req.body;

    const normalizedRole = String(role || "requestor").trim();
    const isPracticeSignup =
      String(signupChannel || "").trim() === "practice_dropzone";

    const normalizedEmailInput = String(email || "")
      .trim()
      .toLowerCase();
    const normalizedEmail =
      normalizedEmailInput ||
      (isPracticeSignup
        ? createPracticePseudoEmail(clinicName || name || "practice")
        : "");

    // 필수 필드 검증
    if (!name || !normalizedEmail || (!password && !socialProvider)) {
      return res.status(400).json({
        success: false,
        message: "필수 필드가 누락되었습니다.",
        requiredFields: ["name", "email", "password"],
      });
    }

    if (!socialProvider && !isStrongPassword(password)) {
      return res.status(400).json({
        success: false,
        message:
          "비밀번호는 10자 이상이며 특수문자(!@#%^&* 등)를 포함해야 합니다. $는 사용할 수 없습니다.",
      });
    }

    // 이메일 중복 확인
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "이미 등록된 이메일입니다.",
      });
    }

    let referredByAnchorId = null;
    try {
      const referrerTargets = await resolveReferrerTargets({
        referredByEmail,
        referredByReferralCode,
        socialToken,
        signupRole: normalizedRole,
      });
      referredByAnchorId = referrerTargets?.referredByAnchorId || null;
    } catch (refError) {
      return res.status(400).json({
        success: false,
        message: refError?.message || "추천인 정보가 올바르지 않습니다.",
      });
    }

    const referralCodeLength =
      normalizedRole === "salesman" || normalizedRole === "devops" ? 3 : 5;
    const referralCode = await ensureUniqueReferralCode(referralCodeLength);

    if (
      normalizedRole !== "requestor" &&
      normalizedRole !== "manufacturer" &&
      normalizedRole !== "admin" &&
      normalizedRole !== "salesman" &&
      normalizedRole !== "devops" &&
      normalizedRole !== "practice"
    ) {
      return res.status(400).json({
        success: false,
        message: "유효하지 않은 역할입니다.",
      });
    }

    // 모든 역할 이메일 인증 통일 (소셜 로그인 제외)
    // 단, practice 공개 드롭존 signupChannel은 치과명+비밀번호 가입 UX를 위해 이메일 인증을 생략한다.
    if (!socialProvider && !isPracticeSignup) {
      const ok = await assertSignupVerifications({
        email: normalizedEmail,
      });
      if (!ok) {
        return res.status(400).json({
          success: false,
          message: "이메일 인증을 완료해주세요.",
        });
      }
    }

    // 사용자 생성 - 모든 역할 즉시 승인 (통일된 가입/온보딩 플로우)
    const isInstantApprove = true;

    const userDoc = {
      name,
      email: normalizedEmail,
      password: password || generateRandomPassword(),
      role: normalizedRole,
      subRole: null, // 사업자 가입 완료 시 owner로 설정됨
      referralCode,
      referredByAnchorId,
      onboardingWizardCompleted: false, // 모든 역할 온보딩 필요
      approvedAt: isInstantApprove ? new Date() : null,
      active: isInstantApprove,
      ...(!socialProvider ? { isVerified: true } : {}),
    };

    // 소셜 로그인 정보가 있으면 추가
    if (socialProvider && socialProviderUserId) {
      userDoc.social = {
        provider: socialProvider,
        providerUserId: socialProviderUserId,
      };
    }

    const user = new User(userDoc);
    await user.save();

    // 모든 역할 이메일 인증 consume 처리 통일 (소셜 로그인 제외)
    if (!socialProvider && !isPracticeSignup) {
      try {
        await consumeSignupVerifications({
          email: normalizedEmail,
          userId: user._id,
        });
      } catch (e) {
        console.error("[register] consumeSignupVerifications failed", e);
      }
    }

    await triggerPricingSnapshotForUserDoc(user, "auth-register");

    // 비밀번호 제외한 사용자 정보 반환
    const freshUser = await User.findById(user._id).select("-password");
    const userWithoutPassword = {
      ...(freshUser ? freshUser.toObject() : user.toObject()),
    };
    delete userWithoutPassword.password;

    const isApproved = Boolean(userWithoutPassword.approvedAt);
    const token = isApproved
      ? generateToken({ userId: user._id, role: user.role })
      : null;
    const refreshToken = isApproved ? generateRefreshToken(user._id) : null;

    res.status(201).json({
      success: true,
      message: isApproved
        ? "회원가입이 완료되었습니다."
        : "가입 신청이 접수되었습니다. 관리자가 승인하면 로그인할 수 있습니다.",
      data: {
        user: userWithoutPassword,
        token,
        refreshToken,
      },
    });
  } catch (error) {
    console.error("[register] failed", error);
    res.status(500).json({
      success: false,
      message: "회원가입 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 추천인 검증
 * @route POST /api/auth/referral/validate
 */
async function validateReferral(req, res) {
  try {
    const raw = String(req.body?.value || "").trim();
    if (!raw) {
      return res.status(400).json({
        success: false,
        message: "추천인 이메일 또는 코드를 입력해주세요.",
      });
    }

    let refUser = null;
    let businessName = "";
    const isEmail = /@/.test(raw);

    if (isEmail) {
      const refEmail = raw.toLowerCase();
      refUser = await User.findOne({ email: refEmail })
        .select({ _id: 1, role: 1, active: 1, name: 1, businessAnchorId: 1 })
        .lean();
    } else {
      refUser = await User.findOne({
        referralCode: { $regex: `^${raw}$`, $options: "i" },
      })
        .select({ _id: 1, role: 1, active: 1, name: 1, businessAnchorId: 1 })
        .lean();
    }

    if (!refUser || refUser.active === false) {
      return res.status(400).json({
        success: false,
        message: "추천인을 찾을 수 없습니다.",
      });
    }

    if (!REFERRAL_ALLOWED_ROLES.has(String(refUser.role || ""))) {
      return res.status(400).json({
        success: false,
        message: "추천인은 의뢰자/영업자/개발운영사 계정만 가능합니다.",
      });
    }

    const normalizedReferrerRole = String(refUser.role || "").trim();
    if (!SIGNUP_LINK_REFERRER_ALLOWED_ROLES.has(normalizedReferrerRole)) {
      return res.status(400).json({
        success: false,
        message: "소개 링크 가입은 의뢰자 또는 영업자 소개만 가능합니다.",
      });
    }

    const refBusinessAnchorId = String(refUser.businessAnchorId || "").trim();
    if (!Types.ObjectId.isValid(refBusinessAnchorId)) {
      return res.status(400).json({
        success: false,
        message:
          "추천인 사업자 정보가 없습니다. 사업자 등록 후 다시 시도해주세요.",
      });
    }
    const anchor = await BusinessAnchor.findById(refBusinessAnchorId)
      .select({ name: 1 })
      .lean();
    businessName = anchor?.name || "";

    return res.status(200).json({
      success: true,
      data: {
        id: refUser._id,
        name: refUser.name || "",
        role: normalizedReferrerRole,
        businessName,
        allowedSignupRoles: getAllowedSignupRolesForReferrerRole(
          normalizedReferrerRole,
        ),
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "추천인 확인 중 오류가 발생했습니다.",
    });
  }
}

/**
 * 로그인
 * @route POST /api/auth/login
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;
    const clientIp =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "";

    // 이메일 정규화
    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();

    // 이메일로 사용자 찾기
    const user = await User.findOne({ email: normalizedEmail }).select(
      "+password",
    );
    if (!user) {
      await logSecurityEvent({
        action: "LOGIN_FAILED_USER_NOT_FOUND",
        severity: "medium",
        status: "failed",
        details: { email: normalizedEmail },
        ipAddress: clientIp,
      });
      return res.status(401).json({
        success: false,
        message: "이메일 또는 비밀번호가 올바르지 않습니다.",
      });
    }

    // 비밀번호 확인
    try {
      // 비밀번호가 있는지 확인
      if (!user.password) {
        console.error("사용자 객체에 비밀번호가 없습니다.");
        return res.status(500).json({
          success: false,
          message: "내부 서버 오류가 발생했습니다.",
        });
      }

      const isPasswordValid = await user.comparePassword(password);

      if (!isPasswordValid) {
        await logSecurityEvent({
          userId: user._id,
          action: "LOGIN_FAILED_BAD_PASSWORD",
          severity: "medium",
          status: "failed",
          details: { email: normalizedEmail },
          ipAddress: clientIp,
        });
        return res.status(401).json({
          success: false,
          message: "이메일 또는 비밀번호가 올바르지 않습니다.",
        });
      }
    } catch (error) {
      console.error("비밀번호 검증 오류:", error);
      return res.status(401).json({
        success: false,
        message: "비밀번호 검증 중 오류가 발생했습니다.",
      });
    }

    // 비활성화 또는 미승인 계정 확인
    if (!user.active || !user.approvedAt) {
      await logSecurityEvent({
        userId: user._id,
        action: "LOGIN_FAILED_INACTIVE_USER",
        severity: "low",
        status: "blocked",
        details: { email: normalizedEmail },
        ipAddress: clientIp,
      });
      return res.status(401).json({
        success: false,
        message: "승인 대기 중인 계정입니다. 관리자 승인이 필요합니다.",
      });
    }

    await sendLoginSuccessResponse({
      user,
      res,
      successMessage: "로그인 성공",
    });
    await logSecurityEvent({
      userId: user._id,
      action: "LOGIN_SUCCESS",
      severity: "info",
      status: "success",
      details: { email: normalizedEmail },
      ipAddress: clientIp,
    });
  } catch (error) {
    await logSecurityEvent({
      action: "LOGIN_FAILED_ERROR",
      severity: "high",
      status: "failed",
      details: { email: req.body?.email, error: error.message },
      ipAddress: req.ip || "",
    });
    res.status(500).json({
      success: false,
      message: "로그인 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 치과명 기반 로그인
 * @route POST /api/auth/practice/login
 *
 * related files:
 * - web/frontend/src/features/auth/LoginPage.tsx
 * - web/frontend/src/store/useAuthStore.ts
 * - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
 */
async function practiceLogin(req, res) {
  try {
    const { clinicName, password } = req.body || {};
    const clientIp =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "";

    const normalizedClinicName = String(clinicName || "").trim();
    if (!normalizedClinicName || !String(password || "").trim()) {
      return res.status(400).json({
        success: false,
        message: "치과명과 비밀번호를 입력해주세요.",
      });
    }

    const candidates = await User.find({
      role: "practice",
      business: normalizedClinicName,
    }).select("+password");

    if (!Array.isArray(candidates) || candidates.length === 0) {
      await logSecurityEvent({
        action: "PRACTICE_LOGIN_FAILED_USER_NOT_FOUND",
        severity: "medium",
        status: "failed",
        details: { clinicName: normalizedClinicName },
        ipAddress: clientIp,
      });
      return res.status(401).json({
        success: false,
        message: "치과명 또는 비밀번호가 올바르지 않습니다.",
      });
    }

    let matchedUser = null;
    for (const candidate of candidates) {
      const isPasswordValid = await candidate.comparePassword(password);
      if (isPasswordValid) {
        matchedUser = candidate;
        break;
      }
    }

    if (!matchedUser) {
      await logSecurityEvent({
        action: "PRACTICE_LOGIN_FAILED_BAD_PASSWORD",
        severity: "medium",
        status: "failed",
        details: { clinicName: normalizedClinicName },
        ipAddress: clientIp,
      });
      return res.status(401).json({
        success: false,
        message: "치과명 또는 비밀번호가 올바르지 않습니다.",
      });
    }

    if (!matchedUser.active || !matchedUser.approvedAt) {
      await logSecurityEvent({
        userId: matchedUser._id,
        action: "PRACTICE_LOGIN_FAILED_INACTIVE_USER",
        severity: "low",
        status: "blocked",
        details: { clinicName: normalizedClinicName },
        ipAddress: clientIp,
      });
      return res.status(401).json({
        success: false,
        message: "승인 대기 중인 계정입니다. 관리자 승인이 필요합니다.",
      });
    }

    await sendLoginSuccessResponse({
      user: matchedUser,
      res,
      successMessage: "치과 로그인 성공",
    });

    await logSecurityEvent({
      userId: matchedUser._id,
      action: "LOGIN_SUCCESS",
      severity: "info",
      status: "success",
      details: { clinicName: normalizedClinicName, loginType: "practice" },
      ipAddress: clientIp,
    });
  } catch (error) {
    await logSecurityEvent({
      action: "PRACTICE_LOGIN_FAILED_ERROR",
      severity: "high",
      status: "failed",
      details: { clinicName: req.body?.clinicName, error: error.message },
      ipAddress: req.ip || "",
    });
    res.status(500).json({
      success: false,
      message: "로그인 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * practice 간소 가입
 * @route POST /api/auth/practice/register
 */
async function practiceRegister(req, res) {
  try {
    const clinicName = String(req.body?.clinicName || "").trim();
    const staffName = String(req.body?.staffName || "").trim();
    const password = String(req.body?.password || "");
    const phone = String(req.body?.phone || "").trim();
    const address = String(req.body?.address || "").trim();
    const addressDetail = String(req.body?.addressDetail || "").trim();
    const zipCode = String(req.body?.zipCode || "").trim();

    if (!clinicName || !password || !staffName || !phone || !address || !zipCode) {
      return res.status(400).json({
        success: false,
        message: "치과명, 담당직원명, 비밀번호, 전화번호, 주소, 우편번호는 필수입니다.",
      });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        success: false,
        message:
          "비밀번호는 10자 이상이며 특수문자(!@#%^&* 등)를 포함해야 합니다. $는 사용할 수 없습니다.",
      });
    }

    const { referredByAnchorId } = await resolveReferrerTargets({
      referredByEmail: "",
      referredByReferralCode: "",
      socialToken: "",
      signupRole: "practice",
    });

    let normalizedEmail = "";
    let existingByEmail = null;
    for (let i = 0; i < 5; i += 1) {
      normalizedEmail = createPracticePseudoEmail(clinicName || staffName || "practice");
      existingByEmail = await User.findOne({ email: normalizedEmail })
        .select({ _id: 1 })
        .lean();
      if (!existingByEmail) break;
    }
    if (existingByEmail || !normalizedEmail) {
      return res.status(500).json({
        success: false,
        message: "가입용 계정 생성에 실패했습니다. 잠시 후 다시 시도해주세요.",
      });
    }

    const referralCode = await ensureUniqueReferralCode(5);

    const user = new User({
      name: staffName || clinicName,
      email: normalizedEmail,
      password,
      role: "practice",
      subRole: "owner",
      referralCode,
      referredByAnchorId: referredByAnchorId || null,
      onboardingWizardCompleted: false,
      approvedAt: new Date(),
      active: true,
      isVerified: true,
      business: clinicName,
      phoneNumber: phone,
      practiceProfile: {
        clinicName,
        staffName,
        phone,
        address,
        addressDetail,
        zipCode,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      address: {
        street: address,
        zipCode,
        country: "KR",
      },
    });
    await user.save();

    const businessAnchor = await BusinessAnchor.create({
      businessNumberNormalized: createPracticeAnchorBusinessNumber(),
      businessType: "practice",
      name: clinicName,
      status: "active",
      primaryContactUserId: user._id,
      referredByAnchorId: referredByAnchorId || null,
      defaultReferralAnchorId: referredByAnchorId || null,
      metadata: {
        companyName: clinicName,
        representativeName: staffName,
        address,
        addressDetail,
        zipCode,
        phoneNumber: phone,
        email: "",
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
      shippingPolicy: {
        weeklyBatchDays: ["mon", "wed", "fri"],
        updatedAt: new Date(),
      },
      owners: [user._id],
      members: [],
    });

    user.businessAnchorId = businessAnchor._id;
    user.business = clinicName;
    user.subRole = "owner";
    await user.save();

    const freshUser = await User.findById(user._id).select("-password");
    const userWithoutPassword = {
      ...(freshUser ? freshUser.toObject() : user.toObject()),
    };
    delete userWithoutPassword.password;

    const token = generateToken({ userId: user._id, role: user.role });
    const refreshToken = generateRefreshToken(user._id);

    return res.status(201).json({
      success: true,
      message: "회원가입이 완료되었습니다.",
      data: {
        user: userWithoutPassword,
        token,
        refreshToken,
      },
    });
  } catch (error) {
    console.error("[practiceRegister] failed", error);
    return res.status(500).json({
      success: false,
      message: "practice 가입 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * practice 비밀번호 찾기(본인확인)
 * @route POST /api/auth/practice/password/find
 */
async function practiceFindPassword(req, res) {
  try {
    const clinicName = String(req.body?.clinicName || "").trim();
    const staffName = String(req.body?.staffName || "").trim();
    const phone = normalizeDigits(req.body?.phone || "");

    if (!clinicName || !staffName || !phone) {
      return res.status(400).json({
        success: false,
        message: "치과명, 담당직원명, 전화번호를 입력해주세요.",
      });
    }

    const candidates = await User.find({
      role: "practice",
      business: clinicName,
      name: staffName,
      active: true,
    })
      .select({ _id: 1, phoneNumber: 1, business: 1, name: 1, practiceProfile: 1 })
      .lean();

    const matched = (candidates || []).filter((u) => {
      const p1 = normalizeDigits(u?.phoneNumber || "");
      const p2 = normalizeDigits(u?.practiceProfile?.phone || "");
      return phone && (phone === p1 || phone === p2);
    });

    if (!matched.length) {
      return res.status(404).json({
        success: false,
        message: "입력한 정보와 일치하는 계정을 찾을 수 없습니다.",
      });
    }

    if (matched.length > 1) {
      return res.status(409).json({
        success: false,
        message:
          "동일 정보로 여러 계정이 확인되었습니다. 관리자에게 비밀번호 변경을 요청해주세요.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "계정이 확인되었습니다. 새 비밀번호를 설정해주세요.",
      data: {
        clinicName,
        staffName,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "비밀번호 찾기 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * practice 비밀번호 변경(본인확인 기반)
 * @route POST /api/auth/practice/password/change
 */
async function practiceChangePassword(req, res) {
  try {
    const clinicName = String(req.body?.clinicName || "").trim();
    const staffName = String(req.body?.staffName || "").trim();
    const phone = normalizeDigits(req.body?.phone || "");
    const newPassword = String(req.body?.newPassword || "");

    if (!clinicName || !staffName || !phone || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "치과명, 담당직원명, 전화번호, 새 비밀번호를 입력해주세요.",
      });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        success: false,
        message:
          "비밀번호는 10자 이상이며 특수문자(!@#%^&* 등)를 포함해야 합니다. $는 사용할 수 없습니다.",
      });
    }

    const candidates = await User.find({
      role: "practice",
      business: clinicName,
      name: staffName,
      active: true,
    }).select("+password");

    const matched = (candidates || []).filter((u) => {
      const p1 = normalizeDigits(u?.phoneNumber || "");
      const p2 = normalizeDigits(u?.practiceProfile?.phone || "");
      return phone && (phone === p1 || phone === p2);
    });

    if (!matched.length) {
      return res.status(404).json({
        success: false,
        message: "입력한 정보와 일치하는 계정을 찾을 수 없습니다.",
      });
    }

    if (matched.length > 1) {
      return res.status(409).json({
        success: false,
        message:
          "동일 정보로 여러 계정이 확인되었습니다. 관리자에게 비밀번호 변경을 요청해주세요.",
      });
    }

    const user = matched[0];
    user.password = newPassword;
    await user.save();

    return res.status(200).json({
      success: true,
      message: "비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "비밀번호 변경 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 토큰 갱신
 * @route POST /api/auth/refresh-token
 */
async function refreshToken(req, res) {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: "리프레시 토큰이 필요합니다.",
      });
    }

    // 리프레시 토큰 검증 (실제로는 DB에서 토큰 확인 등의 추가 검증 필요)
    const decoded = require("jsonwebtoken").verify(
      refreshToken,
      process.env.REFRESH_TOKEN_SECRET || "your_refresh_token_secret",
    );

    // 사용자 조회
    const user = await User.findById(decoded.userId);
    if (!user || !user.active) {
      return res.status(401).json({
        success: false,
        message: "유효하지 않은 토큰입니다.",
      });
    }

    // 새 액세스 토큰 발급
    const newToken = generateToken({ userId: user._id, role: user.role });

    res.status(200).json({
      success: true,
      message: "토큰이 갱신되었습니다.",
      data: {
        token: newToken,
      },
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      message: "토큰 갱신에 실패했습니다.",
      error: error.message,
    });
  }
}

/**
 * 현재 사용자 정보 조회
 * @route GET /api/auth/me
 */
async function getCurrentUser(req, res) {
  try {
    res.set("x-abuts-handler", "auth.getCurrentUser");

    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "인증이 필요합니다.",
      });
    }

    if (Array.isArray(user)) {
      return res.status(500).json({
        success: false,
        message: "인증 사용자 정보 형식이 올바르지 않습니다.",
      });
    }

    // DB에서 최신 사용자 정보 조회 (businessAnchorId 등 업데이트된 정보 반영)
    const freshUser = await User.findById(user._id).select("-password").lean();

    if (!freshUser) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }

    // DB 버전 추가 (프론트엔드 localStorage 초기화 판단용)
    const { getDbVersion } = await import("../../config/dbVersion.js");
    const dbVersion = getDbVersion();

    res.status(200).json({
      success: true,
      data: {
        ...freshUser,
        dbVersion,
      },
    });
  } catch (error) {
    res.set("x-abuts-handler", "auth.getCurrentUser");
    res.status(500).json({
      success: false,
      message: "사용자 정보 조회 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 비밀번호 변경
 * @route PUT /api/auth/change-password
 */
async function changePassword(req, res) {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user._id;
    const clientIp =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "";

    // 사용자 조회 (비밀번호 포함)
    const user = await User.findById(userId).select("+password");

    // 현재 비밀번호 확인
    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
      await logAuthFailure(req, "CHANGE_PASSWORD_BAD_CURRENT", user);
      return res.status(400).json({
        success: false,
        message: "현재 비밀번호가 올바르지 않습니다.",
      });
    }

    // 새 비밀번호 설정
    user.password = newPassword;
    console.log("[changePassword] 저장 전 비밀번호:", user.password);
    await user.save();
    console.log("[changePassword] 저장 후 비밀번호:", user.password);

    res.status(200).json({
      success: true,
      message: "비밀번호가 성공적으로 변경되었습니다.",
    });
    await logSecurityEvent({
      userId: user._id,
      action: "CHANGE_PASSWORD_SUCCESS",
      severity: "info",
      status: "success",
      details: { userId, email: user.email },
      ipAddress: clientIp,
    });
  } catch (error) {
    await logAuthFailure(req, "CHANGE_PASSWORD_ERROR", req.user);
    res.status(500).json({
      success: false,
      message: "비밀번호 변경 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 비밀번호 재설정 요청
 * @route POST /api/auth/forgot-password
 */
async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    const clientIp =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "";

    // 사용자 조회
    const user = await User.findOne({ email });
    if (!user) {
      await logAuthFailure(req, "FORGOT_PASSWORD_USER_NOT_FOUND");
      return res.status(404).json({
        success: false,
        message: "해당 이메일로 등록된 사용자가 없습니다.",
      });
    }

    // 비밀번호 재설정 토큰 생성
    const resetToken = crypto.randomBytes(32).toString("hex");

    // 토큰 해싱 (보안 강화)
    const hashedToken = await bcrypt.hash(resetToken, 10);
    // 사용자 정보에 토큰 저장
    user.resetPasswordToken = hashedToken; // 이 부분은 토큰이므로 이중 해시와 무관
    user.resetPasswordExpires = Date.now() + 3600000; // 1시간 후 만료
    await user.save();

    const frontendBase = getFrontendBaseUrl(req);
    const resetUrl = new URL("/reset-password", frontendBase);
    resetUrl.searchParams.set("token", resetToken);
    resetUrl.searchParams.set("email", email);

    try {
      await sendEmail({
        to: email,
        subject: "[abuts.fit] 비밀번호 재설정 안내",
        html: `
          <p>안녕하세요.</p>
          <p>아래 버튼을 클릭하여 비밀번호를 재설정해주세요.</p>
          <p style="margin: 24px 0;">
            <a href="${resetUrl.toString()}" style="display:inline-block;padding:12px 24px;background:#5b6bff;color:#fff;border-radius:8px;text-decoration:none;">비밀번호 재설정</a>
          </p>
          <p>버튼이 작동하지 않으면 아래 링크를 브라우저에 복사해 붙여넣어주세요.</p>
          <p>${resetUrl.toString()}</p>
          <p>이 링크는 1시간 동안만 유효합니다.</p>
          <p>감사합니다.<br/>abuts.fit 팀</p>
        `,
        text: `아래 링크를 열어 비밀번호를 재설정해주세요 (1시간 유효)\n${resetUrl.toString()}`,
      });
    } catch (error) {
      console.error("[forgotPassword] email send failed:", error);
      await logAuthFailure(req, "FORGOT_PASSWORD_EMAIL_SEND_FAIL", user);
      return res.status(500).json({
        success: false,
        message: "이메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.",
      });
    }

    res.status(200).json({
      success: true,
      message: "비밀번호 재설정 링크가 이메일로 전송되었습니다.",
    });
    await logSecurityEvent({
      userId: user._id,
      action: "FORGOT_PASSWORD_REQUEST",
      severity: "info",
      status: "success",
      details: { email },
      ipAddress: clientIp,
    });
  } catch (error) {
    await logAuthFailure(req, "FORGOT_PASSWORD_ERROR");
    res.status(500).json({
      success: false,
      message: "비밀번호 재설정 요청 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 비밀번호 재설정
 * @route POST /api/auth/reset-password
 */
async function resetPassword(req, res) {
  try {
    const token = req.params?.token || req.body?.token;
    const { newPassword } = req.body;
    const clientIp =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "";

    if (!token || !newPassword) {
      await logAuthFailure(req, "RESET_PASSWORD_MISSING_FIELDS");
      return res.status(400).json({
        success: false,
        message: "토큰과 새 비밀번호를 모두 입력해주세요.",
      });
    }

    if (!isStrongPassword(newPassword)) {
      await logAuthFailure(req, "RESET_PASSWORD_WEAK_PASSWORD");
      return res.status(400).json({
        success: false,
        message:
          "비밀번호는 10자 이상이며 특수문자(!@#%^&* 등)를 포함해야 합니다. $는 사용할 수 없습니다.",
      });
    }

    // 토큰으로 사용자 찾기
    const user = await User.findOne({
      resetPasswordToken: { $exists: true },
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      await logAuthFailure(req, "RESET_PASSWORD_TOKEN_NOT_FOUND");
      return res.status(400).json({
        success: false,
        message: "비밀번호 재설정 토큰이 유효하지 않거나 만료되었습니다.",
      });
    }

    // 토큰 검증
    const isTokenValid = await bcrypt.compare(token, user.resetPasswordToken);
    if (!isTokenValid) {
      await logAuthFailure(req, "RESET_PASSWORD_TOKEN_INVALID", user);
      return res.status(400).json({
        success: false,
        message: "비밀번호 재설정 토큰이 유효하지 않습니다.",
      });
    }

    // 새 비밀번호 설정
    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: "비밀번호가 성공적으로 재설정되었습니다.",
    });
    await logSecurityEvent({
      userId: user._id,
      action: "RESET_PASSWORD_SUCCESS",
      severity: "info",
      status: "success",
      details: { email: user.email },
      ipAddress: clientIp,
    });
  } catch (error) {
    await logAuthFailure(req, "RESET_PASSWORD_ERROR");
    res.status(500).json({
      success: false,
      message: "비밀번호 재설정 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 로그아웃
 * @route POST /api/auth/logout
 * 참고: JWT는 서버에서 무효화할 수 없으므로 클라이언트에서 토큰을 삭제하는 방식으로 구현
 */
function logout(req, res) {
  res.status(200).json({
    success: true,
    message: "로그아웃 되었습니다.",
  });
}
async function withdraw(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "인증 정보가 없습니다.",
      });
    }

    const user = await User.findById(userId)
      .select({
        name: 1,
        email: 1,
        originalEmail: 1,
        role: 1,
        businessId: 1,
        businessAnchorId: 1,
      })
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }

    let isRequestorOwner = false;
    const businessAnchorId = user?.businessAnchorId || null;
    if (user.role === "requestor" && businessAnchorId) {
      const anchor = await BusinessAnchor.findById(businessAnchorId)
        .select({ primaryContactUserId: 1 })
        .lean();
      if (anchor) {
        isRequestorOwner =
          String(anchor.primaryContactUserId) === String(userId);
      }
    }

    let paidBalance = 0;
    if (user.role === "requestor" && isRequestorOwner && businessAnchorId) {
      const breakdown =
        await getBusinessCreditBalanceBreakdown(businessAnchorId);
      paidBalance = Number(breakdown?.paidCredit || 0);
      if (paidBalance > 0) {
        const refundAccountRaw = req.body?.refundReceiveAccount || {};
        const bank = String(refundAccountRaw?.bank || "").trim();
        const accountNumber = String(
          refundAccountRaw?.accountNumber || "",
        ).trim();
        const holderName = String(refundAccountRaw?.holderName || "").trim();

        if (!bank || !accountNumber || !holderName) {
          return res.status(400).json({
            success: false,
            message:
              "잔여 유료 크레딧 환불을 위해 은행/계좌번호/예금주가 필요합니다.",
            data: { paidBalance },
          });
        }

        const uniqueKey = `account_withdraw_refund:${String(
          businessAnchorId,
        )}:${String(userId)}`;
        await CreditLedger.updateOne(
          { uniqueKey },
          {
            $setOnInsert: {
              businessAnchorId,
              userId,
              type: "ADJUST",
              amount: -paidBalance,
              refType: "ACCOUNT_WITHDRAW",
              refId: userId,
              uniqueKey,
            },
          },
          { upsert: true },
        );
      }
    }

    const originalEmail = String(user.originalEmail || user.email || "")
      .trim()
      .toLowerCase();
    const tombstoneEmail = `deleted+${String(userId)}.${Date.now()}@abuts.fit`;

    await User.updateOne(
      { _id: userId },
      {
        $set: {
          active: false,
          deletedAt: new Date(),
          originalEmail: originalEmail || null,
          email: tombstoneEmail,
        },
      },
    );

    return res.json({
      success: true,
      message: "계정 해지가 완료되었습니다.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "계정 해지 처리 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export default {
  register,
  validateReferral,
  login,
  practiceLogin,
  practiceRegister,
  practiceFindPassword,
  practiceChangePassword,
  refreshToken,
  getCurrentUser,
  changePassword,
  forgotPassword,
  resetPassword,
  logout,
  withdraw,
};

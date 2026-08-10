// related files:
// - web/backend/rules.md
// - web/backend/modules/auth/auth.routes.js
// - web/frontend/src/features/layout/AccountSwitcher.tsx
// - web/frontend/src/store/useAuthStore.ts
// - web/backend/services/creditBalance.service.js
// - web/backend/controllers/requests/common.review.helpers.js
// - web/backend/controllers/credits/credit.controller.js
// - web/backend/models/ledgerJournal.model.js
// - web/backend/models/ledgerLine.model.js
import User from "../../models/user.model.js";
import SignupVerification from "../../models/signupVerification.model.js";
import BusinessAnchor from "../../models/businessAnchor.model.js";

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
import { getBusinessCreditBalanceSnapshot } from "../../services/creditBalance.service.js";
import { postGeneralLedgerJournal } from "../../services/generalLedger.service.js";
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

async function getBusinessCreditBalanceBreakdown(businessAnchorId) {
  const normalizedBusinessAnchorId = String(businessAnchorId || "").trim();
  if (!Types.ObjectId.isValid(normalizedBusinessAnchorId)) {
    return {
      balance: 0,
      paidCredit: 0,
      freeRequestCredit: 0,
      freeShippingCredit: 0,
    };
  }

  const snapshot = await getBusinessCreditBalanceSnapshot({
    businessAnchorId: normalizedBusinessAnchorId,
    upsertIfMissing: true,
  });

  return {
    balance: Number(snapshot?.balance || 0),
    paidCredit: Number(snapshot?.paidCredit || 0),
    freeRequestCredit: Number(snapshot?.freeRequestCredit || 0),
    freeShippingCredit: Number(snapshot?.freeShippingCredit || 0),
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

    // 레거시 practice + 통합 의뢰자(practice). 치과명: business 또는 practiceProfile.clinicName
    const candidates = await User.find({
      $and: [
        {
          $or: [
            { role: "practice" },
            {
              role: "requestor",
              $or: [
                { requestorKind: "practice" },
                { "requestorCapabilities.practice": true },
                // 마이그레이션 전 레거시 키
                { "requestorCapabilities.clinic": true },
              ],
            },
          ],
        },
        {
          $or: [
            { business: normalizedClinicName },
            { "practiceProfile.clinicName": normalizedClinicName },
          ],
        },
      ],
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
 * 드롭존 최소 가입 — 의뢰인(requestor) + practice 무료 경로
 * 필수: 치과명·담당자명·이메일·비밀번호·휴대폰(치과 공용 혹은 담당자)(+인증).
 * 주소/Org 앵커는 온보딩에서 완성.
 * @route POST /api/auth/practice/register
 *
 * related files:
 * - web/frontend/src/pages/practice/PracticeDropzonePage.tsx
 * - web/frontend/rules.md
 * - web/backend/utils/requestorCapabilities.js
 */
async function practiceRegister(req, res) {
  try {
    const password = String(req.body?.password || "");
    const phone = String(req.body?.phone || "").trim();
    const clinicName = String(req.body?.clinicName || "").trim();
    const directorName = String(req.body?.directorName || "").trim();
    const staffName = String(req.body?.staffName || "").trim();
    const normalizedEmail = String(req.body?.email || "")
      .trim()
      .toLowerCase();

    if (
      !password ||
      !phone ||
      !normalizedEmail ||
      !clinicName ||
      !directorName ||
      !staffName
    ) {
      return res.status(400).json({
        success: false,
        message:
          "치과명, 원장님명, 담당자명, 이메일, 비밀번호, 휴대폰(치과 공용 혹은 담당자)은 필수입니다.",
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "이메일 형식이 올바르지 않습니다.",
      });
    }

    const phoneDigits = normalizeDigits(phone);
    if (!/^01[016789]\d{7,8}$/.test(phoneDigits)) {
      return res.status(400).json({
        success: false,
        message: "휴대폰 번호 형식이 올바르지 않습니다.",
      });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        success: false,
        message:
          "비밀번호는 10자 이상이며 특수문자(!@#%^&* 등)를 포함해야 합니다. $는 사용할 수 없습니다.",
      });
    }

    const existingByEmail = await User.findOne({ email: normalizedEmail })
      .select({ _id: 1 })
      .lean();
    if (existingByEmail) {
      return res.status(400).json({
        success: false,
        message: "이미 등록된 이메일입니다.",
      });
    }

    const verified = await assertSignupVerifications({
      email: normalizedEmail,
      phone: phoneDigits,
    });
    if (!verified) {
      return res.status(400).json({
        success: false,
        message: "이메일과 휴대폰 인증을 완료해주세요.",
      });
    }

    const { referredByAnchorId } = await resolveReferrerTargets({
      referredByEmail: "",
      referredByReferralCode: "",
      socialToken: "",
      signupRole: "requestor",
    });

    const referralCode = await ensureUniqueReferralCode(5);

    // 최소 가입: role=requestor + practice. 주소/Org 앵커는 온보딩에서 완성.
    const user = new User({
      name: staffName,
      email: normalizedEmail,
      password,
      role: "requestor",
      subRole: "owner",
      referralCode,
      referredByAnchorId: referredByAnchorId || null,
      requestorKind: "practice",
      requestorServices: { free: true, paid: false },
      signupChannel: "practice_dropzone",
      onboardingWizardCompleted: false,
      approvedAt: new Date(),
      active: true,
      isVerified: true,
      phoneNumber: phone,
      phoneVerifiedAt: new Date(),
      practiceProfile: {
        clinicName,
        directorName,
        staffName,
        phone,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });
    await user.save();

    try {
      await consumeSignupVerifications({
        email: normalizedEmail,
        phone: phoneDigits,
        userId: user._id,
      });
    } catch (e) {
      console.error("[practiceRegister] consumeSignupVerifications failed", e);
    }

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
      message: "의뢰인 가입 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

/**
 * 드롭존 비밀번호 찾기(본인확인) — 레거시 practice + 의뢰인(requestor)
 * @route POST /api/auth/practice/password/find
 */
async function practiceFindPassword(req, res) {
  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const clinicName = String(req.body?.clinicName || "").trim();
    const staffName = String(req.body?.staffName || "").trim();
    const phone = normalizeDigits(req.body?.phone || "");

    if (!phone || (!email && (!clinicName || !staffName))) {
      return res.status(400).json({
        success: false,
        message: "이메일과 휴대폰, 또는 치과명·담당직원명·휴대폰을 입력해주세요.",
      });
    }

    const dropzoneRoles = { $in: ["practice", "requestor"] };
    let candidates = [];
    if (email) {
      candidates = await User.find({
        role: dropzoneRoles,
        email,
        active: true,
      })
        .select({ _id: 1, phoneNumber: 1, business: 1, name: 1, email: 1, practiceProfile: 1 })
        .lean();
    } else {
      candidates = await User.find({
        role: dropzoneRoles,
        business: clinicName,
        name: staffName,
        active: true,
      })
        .select({ _id: 1, phoneNumber: 1, business: 1, name: 1, email: 1, practiceProfile: 1 })
        .lean();
    }

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
        email: matched[0]?.email || email || "",
        clinicName: matched[0]?.business || clinicName,
        staffName: matched[0]?.name || staffName,
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
 * 드롭존 비밀번호 변경(본인확인 기반) — 레거시 practice + 의뢰인(requestor)
 * @route POST /api/auth/practice/password/change
 */
async function practiceChangePassword(req, res) {
  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const clinicName = String(req.body?.clinicName || "").trim();
    const staffName = String(req.body?.staffName || "").trim();
    const phone = normalizeDigits(req.body?.phone || "");
    const newPassword = String(req.body?.newPassword || "");

    if (!phone || !newPassword || (!email && (!clinicName || !staffName))) {
      return res.status(400).json({
        success: false,
        message:
          "이메일과 휴대폰·새 비밀번호, 또는 치과명·담당직원명·휴대폰·새 비밀번호를 입력해주세요.",
      });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        success: false,
        message:
          "비밀번호는 10자 이상이며 특수문자(!@#%^&* 등)를 포함해야 합니다. $는 사용할 수 없습니다.",
      });
    }

    const dropzoneRoles = { $in: ["practice", "requestor"] };
    let candidates = [];
    if (email) {
      candidates = await User.find({
        role: dropzoneRoles,
        email,
        active: true,
      }).select("+password");
    } else {
      candidates = await User.find({
        role: dropzoneRoles,
        business: clinicName,
        name: staffName,
        active: true,
      }).select("+password");
    }

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

        const idempotencyKey = `gl:account_withdraw_refund:${String(
          businessAnchorId,
        )}:${String(userId)}`;

        const glResult = await postGeneralLedgerJournal({
          idempotencyKey,
          eventType: "ADJUST",
          businessAnchorId,
          refType: "ACCOUNT_WITHDRAW",
          refId: userId,
          createdBy: userId,
          meta: {
            reason: "account_withdraw_refund",
            refundReceiveAccount: {
              bank,
              accountNumber,
              holderName,
            },
          },
          lines: [
            {
              accountCode: "REQ_PAID_CREDIT",
              ownerRole: "requestor",
              ownerId: businessAnchorId,
              amount: -paidBalance,
              amountExcludingVat: -paidBalance,
              vatAmount: 0,
              amountIncludingVat: -paidBalance,
              creditKind: "PAID",
              refType: "ACCOUNT_WITHDRAW",
              refId: userId,
            },
          ],
        });


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

/**
 * 같은 사업자(businessAnchorId) 소속 동료 계정 목록
 * @route GET /api/auth/colleagues
 *
 * related files:
 * - web/backend/modules/auth/auth.routes.js
 * - web/frontend/src/features/layout/AccountSwitcher.tsx
 */
async function listColleagues(req, res) {
  try {
    const myAnchorId = req.user?.businessAnchorId
      ? String(req.user.businessAnchorId)
      : "";
    if (!myAnchorId || !Types.ObjectId.isValid(myAnchorId)) {
      return res.status(200).json({
        success: true,
        data: { colleagues: [] },
      });
    }

    const rows = await User.find({
      businessAnchorId: new Types.ObjectId(myAnchorId),
      _id: { $ne: req.user._id },
      active: true,
      approvedAt: { $ne: null },
    })
      .select({
        name: 1,
        email: 1,
        role: 1,
        subRole: 1,
        profileImage: 1,
        business: 1,
      })
      .sort({ subRole: 1, name: 1 })
      .lean();

    const colleagues = (Array.isArray(rows) ? rows : []).map((row) => ({
      id: String(row._id),
      name: String(row.name || ""),
      email: String(row.email || ""),
      role: String(row.role || ""),
      subRole: row.subRole ? String(row.subRole) : null,
      profileImage:
        typeof row.profileImage === "string" ? row.profileImage : null,
      companyName: String(row.business || ""),
    }));

    // owner를 staff보다 앞에 두기 (subRole 알파벳 정렬로는 owner가 뒤로 감)
    colleagues.sort((a, b) => {
      const rank = (sub) => (sub === "owner" ? 0 : sub === "staff" ? 1 : 2);
      const d = rank(a.subRole) - rank(b.subRole);
      if (d !== 0) return d;
      return String(a.name).localeCompare(String(b.name), "ko");
    });

    return res.status(200).json({
      success: true,
      data: { colleagues },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "동료 계정 목록을 불러오지 못했습니다.",
      error: error.message,
    });
  }
}

/**
 * 같은 사업자 소속 다른 계정으로 전환 (대상 계정 비밀번호 확인)
 * @route POST /api/auth/switch-account
 *
 * related files:
 * - web/backend/modules/auth/auth.routes.js
 * - web/frontend/src/store/useAuthStore.ts
 * - web/frontend/src/features/layout/AccountSwitcher.tsx
 */
async function switchAccount(req, res) {
  try {
    const clientIp =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "";
    const targetUserId = String(req.body?.userId || "").trim();
    const password = String(req.body?.password || "");

    if (!targetUserId || !Types.ObjectId.isValid(targetUserId)) {
      return res.status(400).json({
        success: false,
        message: "전환할 계정을 선택해주세요.",
      });
    }
    if (!password) {
      return res.status(400).json({
        success: false,
        message: "비밀번호를 입력해주세요.",
      });
    }

    const myAnchorId = req.user?.businessAnchorId
      ? String(req.user.businessAnchorId)
      : "";
    if (!myAnchorId || !Types.ObjectId.isValid(myAnchorId)) {
      return res.status(403).json({
        success: false,
        message: "사업자에 소속된 계정만 전환할 수 있습니다.",
      });
    }

    if (String(req.user._id) === targetUserId) {
      return res.status(400).json({
        success: false,
        message: "현재 로그인 중인 계정입니다.",
      });
    }

    const target = await User.findById(targetUserId).select("+password");
    if (!target) {
      await logSecurityEvent({
        userId: req.user._id,
        action: "ACCOUNT_SWITCH_FAILED_NOT_FOUND",
        severity: "medium",
        status: "failed",
        details: { targetUserId },
        ipAddress: clientIp,
      });
      return res.status(404).json({
        success: false,
        message: "전환할 계정을 찾을 수 없습니다.",
      });
    }

    const targetAnchorId = target.businessAnchorId
      ? String(target.businessAnchorId)
      : "";
    if (targetAnchorId !== myAnchorId) {
      await logSecurityEvent({
        userId: req.user._id,
        action: "ACCOUNT_SWITCH_FAILED_DIFFERENT_BUSINESS",
        severity: "high",
        status: "blocked",
        details: { targetUserId, myAnchorId, targetAnchorId },
        ipAddress: clientIp,
      });
      return res.status(403).json({
        success: false,
        message: "같은 사업자 소속 계정만 전환할 수 있습니다.",
      });
    }

    if (!target.password) {
      return res.status(400).json({
        success: false,
        message: "비밀번호가 설정되지 않은 계정입니다.",
      });
    }

    const isPasswordValid = await target.comparePassword(password);
    if (!isPasswordValid) {
      await logSecurityEvent({
        userId: req.user._id,
        action: "ACCOUNT_SWITCH_FAILED_BAD_PASSWORD",
        severity: "medium",
        status: "failed",
        details: { targetUserId, targetEmail: target.email },
        ipAddress: clientIp,
      });
      return res.status(401).json({
        success: false,
        message: "비밀번호가 올바르지 않습니다.",
      });
    }

    if (!target.active || !target.approvedAt) {
      await logSecurityEvent({
        userId: req.user._id,
        action: "ACCOUNT_SWITCH_FAILED_INACTIVE",
        severity: "low",
        status: "blocked",
        details: { targetUserId },
        ipAddress: clientIp,
      });
      return res.status(401).json({
        success: false,
        message: "승인 대기 중이거나 비활성화된 계정입니다.",
      });
    }

    await sendLoginSuccessResponse({
      user: target,
      res,
      successMessage: "계정 전환 성공",
    });

    await logSecurityEvent({
      userId: target._id,
      action: "ACCOUNT_SWITCH_SUCCESS",
      severity: "info",
      status: "success",
      details: {
        fromUserId: String(req.user._id),
        toUserId: String(target._id),
        businessAnchorId: myAnchorId,
      },
      ipAddress: clientIp,
    });
  } catch (error) {
    await logSecurityEvent({
      userId: req.user?._id,
      action: "ACCOUNT_SWITCH_FAILED_ERROR",
      severity: "high",
      status: "failed",
      details: { error: error.message, targetUserId: req.body?.userId },
      ipAddress: req.ip || "",
    });
    return res.status(500).json({
      success: false,
      message: "계정 전환 중 오류가 발생했습니다.",
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
  listColleagues,
  switchAccount,
  changePassword,
  forgotPassword,
  resetPassword,
  logout,
  withdraw,
};

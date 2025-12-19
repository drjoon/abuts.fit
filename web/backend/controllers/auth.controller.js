import User from "../models/user.model.js";
import RequestorOrganization from "../models/requestorOrganization.model.js";
import CreditLedger from "../models/creditLedger.model.js";
import jwt from "jsonwebtoken";
import { generateToken, generateRefreshToken } from "../utils/jwt.util.js";
import { Types } from "mongoose";
import crypto from "crypto";
import {
  assertSignupVerifications,
  consumeSignupVerifications,
} from "./signupVerification.controller.js";

const createReferralCode = () => {
  return crypto.randomBytes(9).toString("base64url");
};

const ensureUniqueReferralCode = async () => {
  for (let i = 0; i < 5; i += 1) {
    const code = createReferralCode();
    const exists = await User.exists({ referralCode: code });
    if (!exists) return code;
  }
  throw new Error("리퍼럴 코드 생성에 실패했습니다.");
};

const isStrongPassword = (password) => {
  const p = String(password || "");
  if (p.length < 10) return false;
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p)) return false;
  return true;
};

async function getOrganizationCreditBalanceBreakdown(organizationId) {
  const rows = await CreditLedger.find({ organizationId })
    .sort({ createdAt: 1, _id: 1 })
    .select({ type: 1, amount: 1 })
    .lean();

  let paid = 0;
  let bonus = 0;

  for (const r of rows) {
    const type = String(r?.type || "");
    const amount = Number(r?.amount || 0);

    if (!Number.isFinite(amount)) continue;

    if (type === "CHARGE") {
      paid += amount;
      continue;
    }
    if (type === "BONUS") {
      bonus += amount;
      continue;
    }
    if (type === "REFUND") {
      paid += amount;
      continue;
    }
    if (type === "ADJUST") {
      paid += amount;
      continue;
    }
    if (type === "SPEND") {
      let spend = Math.abs(amount);
      const fromBonus = Math.min(bonus, spend);
      bonus -= fromBonus;
      spend -= fromBonus;
      paid -= spend;
    }
  }

  const paidBalance = Math.max(0, Math.round(paid));
  const bonusBalance = Math.max(0, Math.round(bonus));
  return {
    balance: paidBalance + bonusBalance,
    paidBalance,
    bonusBalance,
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
      referredByUserId,
      referredByReferralCode,
      socialProvider,
      socialProviderUserId,
    } = req.body;

    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();

    // 필수 필드 검증
    if (!name || !normalizedEmail || !password) {
      return res.status(400).json({
        success: false,
        message: "필수 필드가 누락되었습니다.",
        requiredFields: ["name", "email", "password"],
      });
    }

    if (!socialProvider && !isStrongPassword(password)) {
      return res.status(400).json({
        success: false,
        message: "비밀번호는 10자 이상이며 특수문자를 포함해야 합니다.",
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

    let referredByObjectId = null;
    if (referredByUserId) {
      if (!Types.ObjectId.isValid(referredByUserId)) {
        return res.status(400).json({
          success: false,
          message: "유효하지 않은 추천인 ID입니다.",
        });
      }

      const refUser = await User.findById(referredByUserId)
        .select({ _id: 1, role: 1, active: 1 })
        .lean();

      if (!refUser || refUser.active === false) {
        return res.status(400).json({
          success: false,
          message: "추천인을 찾을 수 없습니다.",
        });
      }

      if (refUser.role !== "requestor") {
        return res.status(400).json({
          success: false,
          message: "추천인은 의뢰자 계정만 가능합니다.",
        });
      }

      referredByObjectId = new Types.ObjectId(referredByUserId);
    } else if (referredByReferralCode) {
      const code = String(referredByReferralCode).trim();
      if (!code) {
        return res.status(400).json({
          success: false,
          message: "유효하지 않은 추천 코드입니다.",
        });
      }

      const refUser = await User.findOne({ referralCode: code })
        .select({ _id: 1, role: 1, active: 1 })
        .lean();

      if (!refUser || refUser.active === false) {
        return res.status(400).json({
          success: false,
          message: "추천인을 찾을 수 없습니다.",
        });
      }

      if (refUser.role !== "requestor") {
        return res.status(400).json({
          success: false,
          message: "추천인은 의뢰자 계정만 가능합니다.",
        });
      }

      referredByObjectId = new Types.ObjectId(refUser._id);
    }

    const referralCode = await ensureUniqueReferralCode();

    const normalizedRole = role || "requestor";

    if (normalizedRole === "requestor") {
      if (!socialProvider) {
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
    }

    const effectiveOrganization = "";

    // 사용자 생성
    const userDoc = {
      name,
      email: normalizedEmail,
      password,
      role: normalizedRole,
      organization: effectiveOrganization,
      referralCode,
      referredByUserId: referredByObjectId,
      approvedAt: new Date(),
      ...(normalizedRole === "requestor" && !socialProvider
        ? { isVerified: true }
        : {}),
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

    if (normalizedRole === "requestor" && !socialProvider) {
      try {
        await consumeSignupVerifications({
          email: normalizedEmail,
          userId: user._id,
        });
      } catch (e) {
        console.error("[register] consumeSignupVerifications failed", e);
      }
    }

    // 비밀번호 제외한 사용자 정보 반환
    const freshUser = await User.findById(user._id).select("-password");
    const userWithoutPassword = {
      ...(freshUser ? freshUser.toObject() : user.toObject()),
    };
    delete userWithoutPassword.password;

    // 토큰 생성
    const token = generateToken({ userId: user._id, role: user.role });
    const refreshToken = generateRefreshToken(user._id);

    res.status(201).json({
      success: true,
      message: "회원가입이 완료되었습니다.",
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
 * 로그인
 * @route POST /api/auth/login
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    // 이메일 정규화
    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();

    // 이메일로 사용자 찾기
    const user = await User.findOne({ email: normalizedEmail }).select(
      "+password"
    );
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "이메일 또는 비밀번호가 올바르지 않습니다.",
      });
    }

    // 비밀번호 확인
    try {
      console.log(
        `로그인 시도: ${normalizedEmail}, 비밀번호 길이: ${password?.length}`
      );

      // 비밀번호가 있는지 확인
      if (!user.password) {
        console.error("사용자 객체에 비밀번호가 없습니다.");
        return res.status(500).json({
          success: false,
          message: "내부 서버 오류가 발생했습니다.",
        });
      }

      const isPasswordValid = await user.comparePassword(password);
      console.log(`비밀번호 검증 결과: ${isPasswordValid}`);

      if (!isPasswordValid) {
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

    // 비활성화된 계정 확인
    if (!user.active) {
      return res.status(401).json({
        success: false,
        message: "비활성화된 계정입니다.",
      });
    }

    // 마지막 로그인 시간 업데이트 + 리퍼럴 코드 보장
    user.lastLogin = Date.now();
    if (!user.referralCode) {
      user.referralCode = await ensureUniqueReferralCode();
    }
    await user.save();

    // 토큰 생성
    const token = generateToken({ userId: user._id, role: user.role });
    const refreshToken = generateRefreshToken(user._id);

    // 비밀번호 제외한 사용자 정보
    const userWithoutPassword = { ...user.toObject() };
    delete userWithoutPassword.password;

    res.status(200).json({
      success: true,
      message: "로그인 성공",
      data: {
        user: userWithoutPassword,
        token,
        refreshToken,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "로그인 중 오류가 발생했습니다.",
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
      process.env.REFRESH_TOKEN_SECRET || "your_refresh_token_secret"
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

    res.status(200).json({
      success: true,
      data: user,
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

    // 사용자 조회 (비밀번호 포함)
    const user = await User.findById(userId).select("+password");

    // 현재 비밀번호 확인
    const isPasswordValid = await user.comparePassword(currentPassword);
    if (!isPasswordValid) {
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
  } catch (error) {
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

    // 사용자 조회
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "해당 이메일로 등록된 사용자가 없습니다.",
      });
    }

    // 비밀번호 재설정 토큰 생성
    const resetToken = require("crypto").randomBytes(32).toString("hex");

    // 토큰 해싱 (보안 강화)
    const hashedToken = await bcrypt.hash(resetToken, 10);
    // 사용자 정보에 토큰 저장
    user.resetPasswordToken = hashedToken; // 이 부분은 토큰이므로 이중 해시와 무관
    user.resetPasswordExpires = Date.now() + 3600000; // 1시간 후 만료
    await user.save();

    // 실제 서비스에서는 이메일 전송 로직 구현
    // 여기서는 토큰만 반환 (개발 목적)

    res.status(200).json({
      success: true,
      message: "비밀번호 재설정 링크가 이메일로 전송되었습니다.",
      // 개발 환경에서만 토큰 노출 (실제 서비스에서는 제거)
      resetToken:
        process.env.NODE_ENV === "development" ? resetToken : undefined,
    });
  } catch (error) {
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
    const { token, newPassword } = req.body;

    // 토큰으로 사용자 찾기
    const user = await User.findOne({
      resetPasswordToken: { $exists: true },
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "비밀번호 재설정 토큰이 유효하지 않거나 만료되었습니다.",
      });
    }

    // 토큰 검증
    const isTokenValid = await bcrypt.compare(token, user.resetPasswordToken);
    if (!isTokenValid) {
      return res.status(400).json({
        success: false,
        message: "비밀번호 재설정 토큰이 유효하지 않습니다.",
      });
    }

    // 새 비밀번호 설정
    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    console.log("[resetPassword] 저장 전 비밀번호:", user.password);
    await user.save();
    console.log("[resetPassword] 저장 후 비밀번호:", user.password);

    res.status(200).json({
      success: true,
      message: "비밀번호가 성공적으로 재설정되었습니다.",
    });
  } catch (error) {
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
        email: 1,
        originalEmail: 1,
        role: 1,
        organizationId: 1,
      })
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }

    if (user.role === "requestor") {
      const organizationId = user.organizationId;
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: "기공소 정보가 없는 사용자는 탈퇴할 수 없습니다.",
        });
      }

      const { paidBalance } = await getOrganizationCreditBalanceBreakdown(
        organizationId
      );
      if (paidBalance > 0) {
        return res.status(400).json({
          success: false,
          message:
            "잔여 유료 크레딧이 있는 상태에서는 탈퇴할 수 없습니다. 고객센터를 통해 환불 처리 후 탈퇴해주세요.",
          data: { paidBalance },
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
      }
    );

    return res.json({
      success: true,
      message: "해지가 완료되었습니다.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "탈퇴 처리 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

export default {
  register,
  login,
  refreshToken,
  getCurrentUser,
  changePassword,
  forgotPassword,
  resetPassword,
  logout,
  withdraw,
};

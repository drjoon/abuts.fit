import crypto from "crypto";
import User from "../models/user.model.js";
import { generateToken, generateRefreshToken } from "../utils/jwt.util.js";
import RequestorOrganization from "../models/requestorOrganization.model.js";

const FRONTEND_URL = process.env.OAUTH_FRONTEND_URL || "http://localhost:8080";

function getBackendBaseUrl(req) {
  const configured = String(process.env.BACKEND_PUBLIC_URL || "").trim();
  if (configured) return configured;
  const proto = (req.headers["x-forwarded-proto"] || req.protocol || "http")
    .toString()
    .split(",")[0]
    .trim();
  return `${proto}://${req.get("host")}`;
}

function redirectToFrontend(res, params) {
  const url = new URL("/oauth/callback", FRONTEND_URL);
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null) continue;
    url.searchParams.set(k, String(v));
  }
  return res.redirect(url.toString());
}

function createReferralCode() {
  return crypto.randomBytes(9).toString("base64url");
}

async function ensureUniqueReferralCode() {
  for (let i = 0; i < 5; i += 1) {
    const code = createReferralCode();
    const exists = await User.exists({ referralCode: code });
    if (!exists) return code;
  }
  throw new Error("리퍼럴 코드 생성에 실패했습니다.");
}

function generateRandomPassword() {
  return crypto.randomBytes(18).toString("base64url");
}

async function completeSignup(req, res) {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "인증 정보가 없습니다.",
      });
    }

    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }

    if (!user.social?.provider) {
      return res.status(400).json({
        success: false,
        message: "소셜 로그인 사용자만 가입 완료 처리가 가능합니다.",
      });
    }

    if (user.approvedAt) {
      return res.status(200).json({
        success: true,
        message: "이미 가입이 완료된 계정입니다.",
        data: user,
      });
    }

    const { requestorType, organization, phoneNumber } = req.body || {};
    const normalizedPhoneDigits = String(phoneNumber || "").replace(/\D/g, "");
    const normalizedRequestorType = String(requestorType || "").trim();

    if (!normalizedPhoneDigits) {
      return res.status(400).json({
        success: false,
        message: "휴대폰번호를 입력해주세요.",
      });
    }

    if (!/^\d{10,11}$/.test(normalizedPhoneDigits)) {
      return res.status(400).json({
        success: false,
        message: "휴대폰번호 형식을 확인해주세요.",
      });
    }

    if (!normalizedRequestorType) {
      return res.status(400).json({
        success: false,
        message: "주대표/공동대표/직원을 선택해주세요.",
      });
    }

    const isStaff = normalizedRequestorType === "staff";
    const isCoOwner = normalizedRequestorType === "co_owner";
    const orgName = String(organization || "").trim();

    if (!isStaff && !orgName) {
      return res.status(400).json({
        success: false,
        message: "기공소명을 입력해주세요.",
      });
    }

    let nextPosition = "staff";
    if (!isStaff) nextPosition = "principal";
    if (isCoOwner) nextPosition = "vice_principal";

    user.role = "requestor";
    user.position = nextPosition;
    user.phoneNumber = normalizedPhoneDigits;
    user.organization = isStaff ? "" : orgName;
    user.approvedAt = new Date();

    await user.save();

    if (user.role === "requestor" && user.position === "principal") {
      const trimmed = String(user.organization || "").trim();
      if (trimmed) {
        try {
          const createdOrg = await RequestorOrganization.create({
            name: trimmed,
            owner: user._id,
            coOwners: [],
            members: [user._id],
            joinRequests: [],
          });
          user.organizationId = createdOrg._id;
          user.organization = createdOrg.name;
          await user.save();
        } catch (e) {
          console.error(
            "[completeSignup] organization create/update failed",
            e
          );

          try {
            let fallbackOrg = await RequestorOrganization.findOne({
              name: trimmed,
              $or: [{ owner: user._id }, { coOwners: user._id }],
            })
              .select({ _id: 1, name: 1 })
              .lean();

            if (!fallbackOrg) {
              const matches = await RequestorOrganization.find({
                name: trimmed,
              })
                .select({ _id: 1, name: 1, owner: 1, coOwners: 1, members: 1 })
                .limit(10)
                .lean();

              if (Array.isArray(matches)) {
                const meId = String(user._id);
                const owned = matches.find(
                  (m) =>
                    String(m.owner) === meId ||
                    (Array.isArray(m.coOwners) &&
                      m.coOwners.some((c) => String(c) === meId))
                );
                const member = matches.find(
                  (m) =>
                    Array.isArray(m.members) &&
                    m.members.some((x) => String(x) === meId)
                );
                fallbackOrg = owned || member || null;
              }
            }

            if (!fallbackOrg?._id) {
              const created2 = await RequestorOrganization.create({
                name: trimmed,
                owner: user._id,
                coOwners: [],
                members: [user._id],
                joinRequests: [],
              });
              fallbackOrg = { _id: created2._id, name: created2.name };
            }

            if (fallbackOrg?._id) {
              await User.findByIdAndUpdate(user._id, {
                $set: {
                  organizationId: fallbackOrg._id,
                  organization: trimmed,
                },
              });
            }
          } catch (fallbackError) {
            console.error(
              "[completeSignup] organization fallback failed",
              fallbackError
            );
          }
        }
      }
    }

    const fresh = await User.findById(user._id).select("-password");
    return res.status(200).json({
      success: true,
      message: "가입이 완료되었습니다.",
      data: fresh,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "가입 완료 처리 중 오류가 발생했습니다.",
      error: error.message,
    });
  }
}

async function findOrCreateUserFromSocial({
  email,
  name,
  provider,
  providerUserId,
}) {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();
  if (!normalizedEmail) {
    throw new Error("소셜 계정에서 이메일을 가져올 수 없습니다.");
  }

  let user = await User.findOne({
    "social.provider": provider,
    "social.providerUserId": providerUserId,
    active: true,
  }).select("-password");
  if (user) return user;

  user = await User.findOne({ email: normalizedEmail, active: true }).select(
    "-password"
  );
  if (user) return user;

  const inactive = await User.findOne({
    active: false,
    $or: [
      { email: normalizedEmail },
      { originalEmail: normalizedEmail },
      {
        "social.provider": provider,
        "social.providerUserId": providerUserId,
      },
    ],
  })
    .select({ _id: 1, email: 1, originalEmail: 1 })
    .lean();

  if (inactive) {
    const prevOriginalEmail = String(inactive.originalEmail || normalizedEmail)
      .trim()
      .toLowerCase();

    if (
      String(inactive.email || "")
        .trim()
        .toLowerCase() === normalizedEmail
    ) {
      const tombstoneEmail = `deleted+${String(
        inactive._id
      )}.${Date.now()}@abuts.fit`;
      await User.updateOne(
        { _id: inactive._id, email: inactive.email },
        {
          $set: {
            email: tombstoneEmail,
            originalEmail: prevOriginalEmail || null,
          },
        }
      );
    }

    const referralCode = await ensureUniqueReferralCode();

    const newUser = new User({
      name: String(name || "사용자"),
      email: normalizedEmail,
      password: generateRandomPassword(),
      role: "requestor",
      position: "staff",
      referralCode,
      approvedAt: null,
      active: true,
      organization: "",
      phoneNumber: "",
      preferences: { language: "ko" },
      social: {
        provider,
        providerUserId,
      },
      replacesUserId: inactive._id,
    });

    await newUser.save();
    await User.updateOne(
      { _id: inactive._id },
      { $set: { replacedByUserId: newUser._id } }
    );

    user = await User.findById(newUser._id).select("-password");
    return user;
  }

  const referralCode = await ensureUniqueReferralCode();

  const newUser = new User({
    name: String(name || "사용자"),
    email: normalizedEmail,
    password: generateRandomPassword(),
    role: "requestor",
    position: "staff",
    referralCode,
    approvedAt: null,
    active: true,
    organization: "",
    phoneNumber: "",
    preferences: { language: "ko" },
    social: {
      provider,
      providerUserId,
    },
  });

  await newUser.save();
  user = await User.findById(newUser._id).select("-password");
  return user;
}

async function googleStart(req, res) {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
  if (!clientId) {
    return redirectToFrontend(res, {
      error: "GOOGLE_CLIENT_ID가 설정되지 않았습니다.",
      provider: "google",
    });
  }

  const backendBase = getBackendBaseUrl(req);
  const redirectUri = `${backendBase}/api/auth/oauth/google/callback`;

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");

  return res.redirect(url.toString());
}

async function googleCallback(req, res) {
  try {
    const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
    const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || "").trim();

    if (!clientId || !clientSecret) {
      return redirectToFrontend(res, {
        error: "구글 OAuth 환경변수가 설정되지 않았습니다.",
        provider: "google",
      });
    }

    const code = String(req.query.code || "");
    if (!code) {
      return redirectToFrontend(res, {
        error: "구글 인증 코드가 없습니다.",
        provider: "google",
      });
    }

    const backendBase = getBackendBaseUrl(req);
    const redirectUri = `${backendBase}/api/auth/oauth/google/callback`;

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    });

    const tokenJson = await tokenRes.json().catch(() => null);
    const accessToken = tokenJson?.access_token;

    if (!tokenRes.ok || !accessToken) {
      return redirectToFrontend(res, {
        error: "구글 토큰 발급에 실패했습니다.",
        provider: "google",
      });
    }

    const profileRes = await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    const profile = await profileRes.json().catch(() => null);
    if (!profileRes.ok || !profile) {
      return redirectToFrontend(res, {
        error: "구글 사용자 정보를 가져오지 못했습니다.",
        provider: "google",
      });
    }

    // 기존 계정 확인 (생성하지 않음)
    const normalizedEmail = String(profile.email || "")
      .trim()
      .toLowerCase();
    let existingUser = await User.findOne({
      "social.provider": "google",
      "social.providerUserId": String(profile.sub || ""),
      active: true,
    }).select("-password");

    if (!existingUser) {
      existingUser = await User.findOne({
        email: normalizedEmail,
        active: true,
      }).select("-password");
    }

    // 기존 계정이 있으면 로그인
    if (existingUser) {
      const token = generateToken({
        userId: existingUser._id,
        role: existingUser.role,
      });
      const refreshToken = generateRefreshToken(existingUser._id);
      const needsSignup = existingUser?.approvedAt ? "0" : "1";

      return redirectToFrontend(res, {
        token,
        refreshToken,
        provider: "google",
        needsSignup,
      });
    }

    // 신규 사용자: 소셜 정보를 JWT에 담아 회원가입 페이지로
    const socialInfoToken = generateToken({
      type: "social_signup",
      email: profile.email,
      name: profile.name,
      provider: "google",
      providerUserId: String(profile.sub || ""),
    });

    return redirectToFrontend(res, {
      socialToken: socialInfoToken,
      provider: "google",
      needsSignup: "1",
    });
  } catch (error) {
    return redirectToFrontend(res, {
      error: error?.message || "구글 로그인 중 오류가 발생했습니다.",
      provider: "google",
    });
  }
}

async function kakaoStart(req, res) {
  const clientId = String(process.env.KAKAO_CLIENT_ID || "").trim();
  if (!clientId) {
    return redirectToFrontend(res, {
      error: "KAKAO_CLIENT_ID가 설정되지 않았습니다.",
      provider: "kakao",
    });
  }

  const backendBase = getBackendBaseUrl(req);
  const redirectUri = `${backendBase}/api/auth/oauth/kakao/callback`;

  const url = new URL("https://kauth.kakao.com/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "account_email profile_nickname");

  return res.redirect(url.toString());
}

async function kakaoCallback(req, res) {
  try {
    const clientId = String(process.env.KAKAO_CLIENT_ID || "").trim();
    const clientSecret = String(process.env.KAKAO_CLIENT_SECRET || "").trim();

    if (!clientId) {
      return redirectToFrontend(res, {
        error: "카카오 OAuth 환경변수가 설정되지 않았습니다.",
        provider: "kakao",
      });
    }

    const code = String(req.query.code || "");
    if (!code) {
      return redirectToFrontend(res, {
        error: "카카오 인증 코드가 없습니다.",
        provider: "kakao",
      });
    }

    const backendBase = getBackendBaseUrl(req);
    const redirectUri = `${backendBase}/api/auth/oauth/kakao/callback`;

    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      redirect_uri: redirectUri,
      code,
    });

    if (clientSecret) {
      tokenBody.set("client_secret", clientSecret);
    }

    const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody,
    });

    const tokenJson = await tokenRes.json().catch(() => null);
    const accessToken = tokenJson?.access_token;

    if (!tokenRes.ok || !accessToken) {
      return redirectToFrontend(res, {
        error: "카카오 토큰 발급에 실패했습니다.",
        provider: "kakao",
      });
    }

    const profileRes = await fetch("https://kapi.kakao.com/v2/user/me", {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const profile = await profileRes.json().catch(() => null);
    if (!profileRes.ok || !profile) {
      return redirectToFrontend(res, {
        error: "카카오 사용자 정보를 가져오지 못했습니다.",
        provider: "kakao",
      });
    }

    const email = profile?.kakao_account?.email;
    const name =
      profile?.kakao_account?.profile?.nickname ||
      profile?.properties?.nickname ||
      "사용자";

    // 기존 계정 확인 (생성하지 않음)
    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();
    let existingUser = await User.findOne({
      "social.provider": "kakao",
      "social.providerUserId": String(profile.id || ""),
      active: true,
    }).select("-password");

    if (!existingUser) {
      existingUser = await User.findOne({
        email: normalizedEmail,
        active: true,
      }).select("-password");
    }

    // 기존 계정이 있으면 로그인
    if (existingUser) {
      const token = generateToken({
        userId: existingUser._id,
        role: existingUser.role,
      });
      const refreshToken = generateRefreshToken(existingUser._id);
      const needsSignup = existingUser?.approvedAt ? "0" : "1";

      return redirectToFrontend(res, {
        token,
        refreshToken,
        provider: "kakao",
        needsSignup,
      });
    }

    // 신규 사용자: 소셜 정보를 JWT에 담아 회원가입 페이지로
    const socialInfoToken = generateToken({
      type: "social_signup",
      email,
      name,
      provider: "kakao",
      providerUserId: String(profile.id || ""),
    });

    return redirectToFrontend(res, {
      socialToken: socialInfoToken,
      provider: "kakao",
      needsSignup: "1",
    });
  } catch (error) {
    return redirectToFrontend(res, {
      error: error?.message || "카카오 로그인 중 오류가 발생했습니다.",
      provider: "kakao",
    });
  }
}

export default {
  googleStart,
  googleCallback,
  kakaoStart,
  kakaoCallback,
  completeSignup,
};

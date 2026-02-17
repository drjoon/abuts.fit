import crypto from "crypto";
import User from "../../models/user.model.js";
import { generateToken, generateRefreshToken } from "../../utils/jwt.util.js";
import RequestorOrganization from "../../models/requestorOrganization.model.js";

function getFrontendBaseUrl(req) {
  const configured = String(
    process.env.OAUTH_FRONTEND_URL || process.env.FRONTEND_PUBLIC_URL || "",
  ).trim();
  if (configured) return configured;

  const proto = (
    req.headers["cloudfront-forwarded-proto"] ||
    req.headers["x-forwarded-proto"] ||
    req.protocol ||
    "http"
  )
    .toString()
    .split(",")[0]
    .trim();
  return `${proto}://${req.get("host")}`;
}

function getBackendBaseUrl(req) {
  const configured = String(process.env.BACKEND_PUBLIC_URL || "").trim();
  if (configured) return configured;
  const proto = (
    req.headers["cloudfront-forwarded-proto"] ||
    req.headers["x-forwarded-proto"] ||
    req.protocol ||
    "http"
  )
    .toString()
    .split(",")[0]
    .trim();
  return `${proto}://${req.get("host")}`;
}

function redirectToFrontend(req, res, params) {
  const url = new URL("/oauth/callback", getFrontendBaseUrl(req));
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null) continue;
    url.searchParams.set(k, String(v));
  }
  return res.redirect(url.toString());
}

function createReferralCode() {
  return crypto.randomBytes(9).toString("base64url");
}

function encodeOAuthState(input) {
  try {
    const json = JSON.stringify(input || {});
    return Buffer.from(json, "utf8").toString("base64url");
  } catch {
    return "";
  }
}

function decodeOAuthState(raw) {
  try {
    const s = String(raw || "").trim();
    if (!s) return null;
    const json = Buffer.from(s, "base64url").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
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

    user.role = "requestor";
    user.organization = "";
    user.approvedAt = new Date();

    await user.save();

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
    "-password",
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
        inactive._id,
      )}.${Date.now()}@abuts.fit`;
      await User.updateOne(
        { _id: inactive._id, email: inactive.email },
        {
          $set: {
            email: tombstoneEmail,
            originalEmail: prevOriginalEmail || null,
          },
        },
      );
    }

    const referralCode = await ensureUniqueReferralCode();

    const newUser = new User({
      name: String(name || "사용자"),
      email: normalizedEmail,
      password: generateRandomPassword(),
      role: "requestor",
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
      { $set: { replacedByUserId: newUser._id } },
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
    return redirectToFrontend(req, res, {
      error: "GOOGLE_CLIENT_ID가 설정되지 않았습니다.",
      provider: "google",
    });
  }

  const intent = String(req.query.intent || "").trim();
  const role = String(req.query.role || "").trim();
  const ref = String(req.query.ref || "").trim();
  const state =
    intent === "signup"
      ? encodeOAuthState({ intent: "signup", role, ref })
      : "";

  const backendBase = getBackendBaseUrl(req);
  const redirectUri = `${backendBase}/api/auth/oauth/google/callback`;

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  if (state) url.searchParams.set("state", state);
  if (intent === "signup") {
    url.searchParams.set("prompt", "select_account");
  }

  return res.redirect(url.toString());
}

async function googleCallback(req, res) {
  try {
    const clientId = String(process.env.GOOGLE_CLIENT_ID || "").trim();
    const clientSecret = String(process.env.GOOGLE_CLIENT_SECRET || "").trim();

    if (!clientId || !clientSecret) {
      return redirectToFrontend(req, res, {
        error: "구글 OAuth 환경변수가 설정되지 않았습니다.",
        provider: "google",
      });
    }

    const code = String(req.query.code || "");
    if (!code) {
      return redirectToFrontend(req, res, {
        error: "구글 인증 코드가 없습니다.",
        provider: "google",
      });
    }

    const oauthState = decodeOAuthState(req.query.state);
    const isSignupIntent = oauthState?.intent === "signup";
    const intentRole = String(oauthState?.role || "").trim();
    const intentRef = String(oauthState?.ref || "").trim();

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
      return redirectToFrontend(req, res, {
        error: "구글 토큰 발급에 실패했습니다.",
        provider: "google",
      });
    }

    const profileRes = await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    const profile = await profileRes.json().catch(() => null);
    if (!profileRes.ok || !profile) {
      return redirectToFrontend(req, res, {
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
      if (isSignupIntent) {
        return redirectToFrontend(req, res, {
          error: "이미 가입된 소셜 계정입니다. 로그인해주세요.",
          provider: "google",
        });
      }

      const token = generateToken({
        userId: existingUser._id,
        role: existingUser.role,
      });
      const refreshToken = generateRefreshToken(existingUser._id);
      const needsSignup = existingUser?.approvedAt ? "0" : "1";

      return redirectToFrontend(req, res, {
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

    return redirectToFrontend(req, res, {
      socialToken: socialInfoToken,
      provider: "google",
      needsSignup: "1",
      ...(intentRole ? { role: intentRole } : {}),
      ...(intentRef ? { ref: intentRef } : {}),
    });
  } catch (error) {
    return redirectToFrontend(req, res, {
      error: error?.message || "구글 로그인 중 오류가 발생했습니다.",
      provider: "google",
    });
  }
}

async function kakaoStart(req, res) {
  const clientId = String(process.env.KAKAO_CLIENT_ID || "").trim();
  if (!clientId) {
    return redirectToFrontend(req, res, {
      error: "KAKAO_CLIENT_ID가 설정되지 않았습니다.",
      provider: "kakao",
    });
  }

  const intent = String(req.query.intent || "").trim();
  const role = String(req.query.role || "").trim();
  const ref = String(req.query.ref || "").trim();
  const state =
    intent === "signup"
      ? encodeOAuthState({ intent: "signup", role, ref })
      : "";

  const backendBase = getBackendBaseUrl(req);
  const redirectUri = `${backendBase}/api/auth/oauth/kakao/callback`;

  const url = new URL("https://kauth.kakao.com/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "account_email profile_nickname");
  if (state) url.searchParams.set("state", state);
  if (intent === "signup") {
    url.searchParams.set("prompt", "login");
  }

  return res.redirect(url.toString());
}

async function kakaoCallback(req, res) {
  try {
    const clientId = String(process.env.KAKAO_CLIENT_ID || "").trim();
    const clientSecret = String(process.env.KAKAO_CLIENT_SECRET || "").trim();

    if (!clientId) {
      return redirectToFrontend(req, res, {
        error: "카카오 OAuth 환경변수가 설정되지 않았습니다.",
        provider: "kakao",
      });
    }

    const code = String(req.query.code || "");
    if (!code) {
      return redirectToFrontend(req, res, {
        error: "카카오 인증 코드가 없습니다.",
        provider: "kakao",
      });
    }

    const oauthState = decodeOAuthState(req.query.state);
    const isSignupIntent = oauthState?.intent === "signup";
    const intentRole = String(oauthState?.role || "").trim();
    const intentRef = String(oauthState?.ref || "").trim();

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
      return redirectToFrontend(req, res, {
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
      return redirectToFrontend(req, res, {
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
      if (isSignupIntent) {
        return redirectToFrontend(req, res, {
          error: "이미 가입된 소셜 계정입니다. 로그인해주세요.",
          provider: "kakao",
        });
      }

      const token = generateToken({
        userId: existingUser._id,
        role: existingUser.role,
      });
      const refreshToken = generateRefreshToken(existingUser._id);
      const needsSignup = existingUser?.approvedAt ? "0" : "1";

      return redirectToFrontend(req, res, {
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

    return redirectToFrontend(req, res, {
      socialToken: socialInfoToken,
      provider: "kakao",
      needsSignup: "1",
      ...(intentRole ? { role: intentRole } : {}),
      ...(intentRef ? { ref: intentRef } : {}),
    });
  } catch (error) {
    return redirectToFrontend(req, res, {
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

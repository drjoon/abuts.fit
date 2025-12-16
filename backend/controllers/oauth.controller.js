import crypto from "crypto";
import User from "../models/user.model.js";
import { generateToken, generateRefreshToken } from "../utils/jwt.util.js";

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

  let user = await User.findOne({ email: normalizedEmail }).select("-password");
  if (user) return user;

  const referralCode = await ensureUniqueReferralCode();

  const newUser = new User({
    name: String(name || "사용자"),
    email: normalizedEmail,
    password: generateRandomPassword(),
    role: "requestor",
    position: "principal",
    referralCode,
    approvedAt: new Date(),
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

    const user = await findOrCreateUserFromSocial({
      email: profile.email,
      name: profile.name,
      provider: "google",
      providerUserId: String(profile.sub || ""),
    });

    const token = generateToken({ userId: user._id, role: user.role });
    const refreshToken = generateRefreshToken(user._id);

    return redirectToFrontend(res, {
      token,
      refreshToken,
      provider: "google",
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

    const user = await findOrCreateUserFromSocial({
      email,
      name,
      provider: "kakao",
      providerUserId: String(profile.id || ""),
    });

    const token = generateToken({ userId: user._id, role: user.role });
    const refreshToken = generateRefreshToken(user._id);

    return redirectToFrontend(res, {
      token,
      refreshToken,
      provider: "kakao",
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
};

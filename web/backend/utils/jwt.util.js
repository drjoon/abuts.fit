// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
import jwt from "jsonwebtoken";

/** 로그인 세션(액세스·리프레시 JWT) 만료. jsonwebtoken `ms` 형식 */
export const AUTH_TOKEN_EXPIRES_IN = "3y";

/**
 * JWT 토큰 생성
 * @param {Object} payload - 토큰에 포함될 데이터
 * @param {String} expiresIn - 토큰 만료 시간 (기본값: 3년)
 * @returns {String} 생성된 JWT 토큰
 */
export function generateToken(payload, expiresIn = AUTH_TOKEN_EXPIRES_IN) {
  // Mongoose 모델 인스턴스인 경우 필요한 데이터만 추출
  let tokenPayload;

  if (payload && payload._id) {
    // Mongoose 모델 인스턴스인 경우
    tokenPayload = {
      userId: payload._id,
      role: payload.role || "requestor",
    };
  } else {
    // 일반 객체인 경우 그대로 사용
    tokenPayload = payload;
  }

  return jwt.sign(
    tokenPayload,
    process.env.JWT_SECRET || "your_jwt_secret_key",
    {
      expiresIn,
    },
  );
}

/**
 * JWT 토큰 검증
 * @param {String} token - 검증할 JWT 토큰
 * @returns {Object} 디코딩된 토큰 데이터
 */
export function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET || "your_jwt_secret_key");
}

/**
 * 리프레시 토큰 생성
 * @param {String} userId - 사용자 ID
 * @returns {String} 생성된 리프레시 토큰
 */
export function generateRefreshToken(userId) {
  return jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET || "your_jwt_refresh_secret_key",
    {
      expiresIn: AUTH_TOKEN_EXPIRES_IN,
    },
  );
}

export default {
  generateToken,
  verifyToken,
  generateRefreshToken,
};

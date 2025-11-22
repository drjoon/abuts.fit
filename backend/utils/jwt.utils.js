import jwt from "jsonwebtoken";

/**
 * JWT 토큰 생성
 * @param {Object} payload - 토큰에 포함될 데이터
 * @param {String} expiresIn - 토큰 만료 시간 (기본값: '1d')
 * @returns {String} 생성된 JWT 토큰
 */
export const generateToken = (payload, expiresIn = "1d") => {
  return jwt.sign(payload, process.env.JWT_SECRET || "your_jwt_secret_key", {
    expiresIn,
  });
};

/**
 * JWT 토큰 검증
 * @param {String} token - 검증할 JWT 토큰
 * @returns {Object} 디코딩된 토큰 데이터
 */
export const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET || "your_jwt_secret_key");
  } catch (error) {
    throw new Error("유효하지 않은 토큰입니다.");
  }
};

/**
 * 리프레시 토큰 생성
 * @param {String} userId - 사용자 ID
 * @returns {String} 생성된 리프레시 토큰
 */
export const generateRefreshToken = (userId) => {
  return jwt.sign(
    { userId },
    process.env.REFRESH_TOKEN_SECRET || "your_refresh_token_secret",
    {
      expiresIn: "7d",
    }
  );
};

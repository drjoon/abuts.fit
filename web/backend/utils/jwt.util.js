import jwt from "jsonwebtoken";

/**
 * JWT 토큰 생성
 * @param {Object} payload - 토큰에 포함될 데이터
 * @param {String} expiresIn - 토큰 만료 시간 (기본값: '1d')
 * @returns {String} 생성된 JWT 토큰
 */
export function generateToken(payload, expiresIn = "1d") {
  // Mongoose 모델 인스턴스인 경우 필요한 데이터만 추출
  let tokenPayload;
  
  if (payload && payload._id) {
    // Mongoose 모델 인스턴스인 경우
    tokenPayload = {
      userId: payload._id,
      role: payload.role || 'requestor'
    };
  } else {
    // 일반 객체인 경우 그대로 사용
    tokenPayload = payload;
  }
  
  return jwt.sign(tokenPayload, process.env.JWT_SECRET || "your_jwt_secret_key", {
    expiresIn,
  });
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
      expiresIn: "7d", // 리프레시 토큰은 더 긴 유효 기간
    }
  );
}

export default {
  generateToken,
  verifyToken,
  generateRefreshToken,
};

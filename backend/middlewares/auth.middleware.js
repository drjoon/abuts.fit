import { verifyToken } from "../utils/jwt.utils";
import User from "../models/user.model";

/**
 * 인증 미들웨어
 * 요청 헤더에서 토큰을 추출하고 검증하여 사용자 정보를 req.user에 추가
 */
const authenticate = async (req, res, next) => {
  try {
    // 헤더에서 토큰 추출
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "인증 토큰이 필요합니다.",
      });
    }

    // Bearer 제거하고 토큰만 추출
    const token = authHeader.split(" ")[1];

    // 토큰 검증
    const decoded = verifyToken(token);

    // 사용자 정보 조회
    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다.",
      });
    }

    // 사용자가 비활성화된 경우
    if (!user.active) {
      return res.status(401).json({
        success: false,
        message: "비활성화된 계정입니다.",
      });
    }

    // 요청 객체에 사용자 정보 추가
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "인증에 실패했습니다.",
      error: error.message,
    });
  }
};

/**
 * 권한 확인 미들웨어
 * @param {Array} roles - 허용된 역할 배열
 */
const authorize = (roles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "인증이 필요합니다.",
      });
    }

    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "이 작업을 수행할 권한이 없습니다.",
      });
    }

    next();
  };
};

module.exports = {
  authenticate,
  authorize,
};

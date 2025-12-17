import { verifyToken } from "../utils/jwt.utils.js";
import User from "../models/user.model.js";
import { Types } from "mongoose";

/**
 * 인증 미들웨어
 * 요청 헤더에서 토큰을 추출하고 검증하여 사용자 정보를 req.user에 추가
 */
export const authenticate = async (req, res, next) => {
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

    // 개발용 MOCK 토큰 우회 (프론트 mock 로그인과 연동)
    if (process.env.NODE_ENV !== "production" && token === "MOCK_DEV_TOKEN") {
      const decodeMockHeader = (value) => {
        if (typeof value !== "string") return value;
        try {
          return decodeURIComponent(value);
        } catch {
          return value;
        }
      };

      const mockRole =
        decodeMockHeader(req.headers["x-mock-role"]) || "manufacturer";
      const mockPosition =
        decodeMockHeader(req.headers["x-mock-position"]) || "staff";
      const mockUserIdRaw = decodeMockHeader(req.headers["x-mock-user-id"]);
      const mockEmail =
        decodeMockHeader(req.headers["x-mock-email"]) ||
        `mock-${mockRole}@abuts.fit`;
      const mockName = decodeMockHeader(req.headers["x-mock-name"]) || "사용자";
      const mockOrganization =
        decodeMockHeader(req.headers["x-mock-organization"]) || "";
      const mockPhone = decodeMockHeader(req.headers["x-mock-phone"]) || "";
      const now = new Date();

      // 역할별 고정 ObjectId 사용 (Draft 권한 검증을 위해 일관된 ID 필요)
      const MOCK_USER_IDS = {
        requestor: "000000000000000000000001",
        manufacturer: "000000000000000000000002",
        admin: "000000000000000000000003",
      };

      const headerId = String(mockUserIdRaw || "").trim();
      const mockId =
        headerId && Types.ObjectId.isValid(headerId)
          ? headerId
          : MOCK_USER_IDS[mockRole] || MOCK_USER_IDS.manufacturer;

      const isDefaultMockId = mockId === (MOCK_USER_IDS[mockRole] || "");
      const mockReferralCode = isDefaultMockId
        ? `mock_${mockRole}`
        : `mock_${mockRole}_${mockId}`;

      let dbUser = await User.findById(mockId).select("-password");

      if (!dbUser) {
        const created = new User({
          _id: new Types.ObjectId(mockId),
          name: String(mockName),
          email: String(mockEmail).toLowerCase(),
          password: "mock_password_1234",
          role: String(mockRole),
          position: String(mockPosition),
          phoneNumber: String(mockPhone),
          organization: String(mockOrganization),
          referralCode: mockReferralCode,
          approvedAt: now,
          active: true,
        });
        await created.save();
        dbUser = await User.findById(mockId).select("-password");
      }

      if (dbUser) {
        const patch = {};
        if (mockName && dbUser.name !== mockName) patch.name = String(mockName);
        if (mockPosition && dbUser.position !== mockPosition)
          patch.position = String(mockPosition);
        if (mockOrganization && dbUser.organization !== mockOrganization) {
          patch.organization = String(mockOrganization);
        }
        if (mockPhone && dbUser.phoneNumber !== mockPhone) {
          patch.phoneNumber = String(mockPhone);
        }
        if (Object.keys(patch).length > 0) {
          await User.findByIdAndUpdate(mockId, { $set: patch }, { new: false });
          dbUser = await User.findById(mockId).select("-password");
        }
      }

      req.user = dbUser || {
        _id: new Types.ObjectId(mockId),
        referralCode: `mock_${mockRole}`,
        role: mockRole,
        position: mockPosition,
        active: true,
        approvedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      return next();
    }

    // 토큰 검증
    const decoded = verifyToken(token);

    const userId = decoded?.userId;
    if (!userId || Array.isArray(userId)) {
      return res.status(401).json({
        success: false,
        message: "인증에 실패했습니다.",
      });
    }

    // 사용자 정보 조회
    const user = await User.findById(userId).select("-password");

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
export const authorize = (roles = []) => {
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

/**
 * 직위 확인 미들웨어
 * @param {Array} positions - 허용된 직위 배열
 */
export const authorizePosition = (positions = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "인증이 필요합니다.",
      });
    }

    if (positions.length && !positions.includes(req.user.position)) {
      return res.status(403).json({
        success: false,
        message: "이 작업을 수행할 권한(직위)이 없습니다.",
      });
    }

    next();
  };
};

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

    // 개발환경: /shipping-estimate 같은 공용 계산 API는 Authorization 없이도 x-mock-role로 접근 가능
    const isShippingEstimate = req.originalUrl?.includes("/shipping-estimate");
    const allowMockWithoutAuth =
      process.env.NODE_ENV !== "production" &&
      (req.__allowMockAuth === true || isShippingEstimate) &&
      typeof req.headers["x-mock-role"] === "string" &&
      String(req.headers["x-mock-role"]).trim();

    if (
      (!authHeader || !authHeader.startsWith("Bearer ")) &&
      allowMockWithoutAuth
    ) {
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
      const mockUserIdRaw = decodeMockHeader(req.headers["x-mock-user-id"]);
      const mockEmail =
        decodeMockHeader(req.headers["x-mock-email"]) ||
        `mock-${mockRole}@abuts.fit`;
      const mockName = decodeMockHeader(req.headers["x-mock-name"]) || "사용자";
      const mockOrganization =
        decodeMockHeader(req.headers["x-mock-organization"]) || "";
      const mockPhone = decodeMockHeader(req.headers["x-mock-phone"]) || "";
      const now = new Date();

      const MOCK_USER_IDS = {
        requestor: "000000000000000000000001",
        manufacturer: "000000000000000000000002",
        admin: "000000000000000000000003",
        salesman: "000000000000000000000004",
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
          phoneNumber: String(mockPhone),
          organization: String(mockOrganization),
          referralCode: mockReferralCode,
          approvedAt: now,
          active: true,
        });
        await created.save();
        dbUser = await User.findById(mockId).select("-password");
      }

      req.user = dbUser || {
        _id: new Types.ObjectId(mockId),
        referralCode: `mock_${mockRole}`,
        role: mockRole,
        active: true,
        approvedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      return next();
    }

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.warn("[auth] Missing/invalid Authorization header", {
        path: req.originalUrl,
        method: req.method,
        ip: req.ip,
        forwardedFor: req.headers["x-forwarded-for"],
        hasAuthorizationHeader: Boolean(req.headers.authorization),
        headerKeys: Object.keys(req.headers || {}).sort(),
      });
      res.set("Cache-Control", "no-store");
      res.set("Pragma", "no-cache");
      res.set("Vary", "Authorization");
      res.set("x-abuts-auth-reason", "missing_authorization");
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
        salesman: "000000000000000000000004",
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
        active: true,
        approvedAt: now,
        createdAt: now,
        updatedAt: now,
      };
      return next();
    }

    // 토큰 검증
    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (tokenError) {
      console.error("[auth] Token verification failed:", {
        error: tokenError.message,
        tokenLength: token.length,
        jwtSecret: process.env.JWT_SECRET ? "SET" : "NOT_SET",
      });
      res.set("Cache-Control", "no-store");
      res.set("Pragma", "no-cache");
      res.set("Vary", "Authorization");
      res.set("x-abuts-auth-reason", "token_verification_failed");
      return res.status(401).json({
        success: false,
        message: "인증에 실패했습니다.",
      });
    }

    const userId = decoded?.userId;
    if (!userId || Array.isArray(userId)) {
      console.error("[auth] Invalid userId in token:", { userId });
      res.set("Cache-Control", "no-store");
      res.set("Pragma", "no-cache");
      res.set("Vary", "Authorization");
      res.set("x-abuts-auth-reason", "invalid_user_id");
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
      res.set("Cache-Control", "no-store");
      res.set("Pragma", "no-cache");
      res.set("Vary", "Authorization");
      res.set("x-abuts-auth-reason", "user_inactive");
      return res.status(401).json({
        success: false,
        message: "비활성화된 계정입니다.",
      });
    }

    // 요청 객체에 사용자 정보 추가
    req.user = user;
    next();
  } catch (error) {
    res.set("Cache-Control", "no-store");
    res.set("Pragma", "no-cache");
    res.set("Vary", "Authorization");
    res.set("x-abuts-auth-reason", "auth_middleware_error");
    return res.status(401).json({
      success: false,
      message: "인증에 실패했습니다.",
      error: error.message,
    });
  }
};

/**
 * 권한 확인 미들웨어
 * @param {Array<string>} roles - 허용된 역할 배열
 * @param {{adminRoles?: string[], manufacturerRoles?: string[], requestorRoles?: string[]}} options
 */
export const authorize = (roles = [], options = {}) => {
  return (req, res, next) => {
    if (process.env.NODE_ENV !== "production" && options?.allowMock === true) {
      req.__allowMockAuth = true;
    }

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "인증이 필요합니다.",
      });
    }

    const roleAllowed = roles.length === 0 || roles.includes(req.user.role);
    if (!roleAllowed) {
      return res.status(403).json({
        success: false,
        message: "이 작업을 수행할 권한이 없습니다.",
      });
    }

    const { adminRoles, manufacturerRoles, requestorRoles } = options;
    if (
      req.user.role === "admin" &&
      Array.isArray(adminRoles) &&
      adminRoles.length > 0 &&
      !adminRoles.includes(req.user.adminRole)
    ) {
      return res.status(403).json({
        success: false,
        message: "이 작업을 수행할 권한이 없습니다.",
      });
    }

    if (
      req.user.role === "manufacturer" &&
      Array.isArray(manufacturerRoles) &&
      manufacturerRoles.length > 0 &&
      !manufacturerRoles.includes(req.user.manufacturerRole)
    ) {
      return res.status(403).json({
        success: false,
        message: "이 작업을 수행할 권한이 없습니다.",
      });
    }

    if (
      req.user.role === "requestor" &&
      Array.isArray(requestorRoles) &&
      requestorRoles.length > 0 &&
      !requestorRoles.includes(req.user.requestorRole)
    ) {
      return res.status(403).json({
        success: false,
        message: "이 작업을 수행할 권한이 없습니다.",
      });
    }

    next();
  };
};

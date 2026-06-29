import { verifyToken } from "../utils/jwt.utils.js";
import User from "../models/user.model.js";
import BusinessAnchor from "../models/businessAnchor.model.js";
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
 * @param {{subRoles?: string[]}} options - subRole 체크 옵션 (owner, staff)
 */
export const authorize = (roles = [], options = {}) => {
  return async (req, res, next) => {
    try {
      if (
        process.env.NODE_ENV !== "production" &&
        options?.allowMock === true
      ) {
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

      // SSOT: subRole 체크 (모든 역할에 대해 통합된 subRoles 옵션 사용)
      const { subRoles } = options;
      if (Array.isArray(subRoles) && subRoles.length > 0) {
        let effectiveSubRole = String(req.user.subRole || "").trim();

        // 레거시 계정 치유: requestor + businessAnchorId 있음 + subRole 비어있으면
        // 사업자 앵커 기준으로 owner/staff를 추론해 DB/req.user에 반영
        if (
          !effectiveSubRole &&
          req.user.role === "requestor" &&
          req.user.businessAnchorId
        ) {
          try {
            const anchor = await BusinessAnchor.findById(
              req.user.businessAnchorId,
            )
              .select({ primaryContactUserId: 1, owners: 1 })
              .lean();

            const me = String(req.user._id || "");
            const isOwner =
              !!anchor &&
              (String(anchor?.primaryContactUserId || "") === me ||
                (Array.isArray(anchor?.owners) &&
                  anchor.owners.some((u) => String(u) === me)));

            const inferredSubRole = isOwner ? "owner" : "staff";

            await User.updateOne(
              { _id: req.user._id, subRole: null },
              { $set: { subRole: inferredSubRole } },
            );

            req.user.subRole = inferredSubRole;
            effectiveSubRole = inferredSubRole;

            console.log("[authorize] subRole healed for legacy user", {
              path: req.path,
              userId: req.user._id,
              role: req.user.role,
              businessAnchorId: req.user.businessAnchorId,
              inferredSubRole,
            });
          } catch (healError) {
            console.warn("[authorize] subRole heal failed", {
              path: req.path,
              userId: req.user?._id,
              error: healError?.message,
            });
          }
        }

        const hasRequiredSubRole = subRoles.includes(effectiveSubRole);

        // 레거시 계정 호환: requestor인데 subRole이 비어있고,
        // 해당 라우트가 owner/staff 모두 허용하는 경우에만 통과시킨다.
        // (owner 전용 라우트에는 적용하지 않음)
        const isLegacyRequestorWithoutSubRole =
          !effectiveSubRole &&
          req.user.role === "requestor" &&
          !!req.user.businessAnchorId &&
          subRoles.includes("owner") &&
          subRoles.includes("staff");

        console.log("[authorize] subRole check:", {
          path: req.path,
          userId: req.user._id,
          role: req.user.role,
          subRole: req.user.subRole,
          effectiveSubRole,
          requiredSubRoles: subRoles,
          hasRequiredSubRole,
          isLegacyRequestorWithoutSubRole,
        });

        if (!hasRequiredSubRole && !isLegacyRequestorWithoutSubRole) {
          return res.status(403).json({
            success: false,
            message: "이 작업을 수행할 권한이 없습니다.",
          });
        }
      }

      next();
    } catch (error) {
      console.error("[authorize] middleware error", {
        path: req.path,
        method: req.method,
        userId: req.user?._id,
        error: error?.message,
      });
      return res.status(500).json({
        success: false,
        message: "권한 확인 중 오류가 발생했습니다.",
      });
    }
  };
};

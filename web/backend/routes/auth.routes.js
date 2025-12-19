import { Router } from "express";
const router = Router();
import authController from "../controllers/auth.controller.js";
import oauthController from "../controllers/oauth.controller.js";
import { authenticate } from "../middlewares/auth.middleware.js";
import {
  sendSignupEmailVerification,
  verifySignupEmailVerification,
} from "../controllers/signupVerification.controller.js";

// 회원가입
router.post("/register", authController.register);

// 로그인
router.post("/login", authController.login);

// 토큰 갱신
router.post("/refresh-token", authController.refreshToken);

// 현재 사용자 정보 조회 (인증 필요)
router.get("/me", authenticate, authController.getCurrentUser);

// 비밀번호 변경 (인증 필요)
router.put("/change-password", authenticate, authController.changePassword);

// 비밀번호 재설정 요청 (인증 불필요)
router.post("/forgot-password", authController.forgotPassword);

// 비밀번호 재설정 (인증 불필요)
router.post("/reset-password/:token", authController.resetPassword);

router.post("/signup/email-verification/send", sendSignupEmailVerification);
router.post("/signup/email-verification/verify", verifySignupEmailVerification);

// 로그아웃 (인증 필요)
router.post("/logout", authenticate, authController.logout);
router.post("/withdraw", authenticate, authController.withdraw);

router.get("/oauth/google/start", oauthController.googleStart);
router.get("/oauth/google/callback", oauthController.googleCallback);
router.get("/oauth/kakao/start", oauthController.kakaoStart);
router.get("/oauth/kakao/callback", oauthController.kakaoCallback);
router.post(
  "/oauth/complete-signup",
  authenticate,
  oauthController.completeSignup
);

export default router;

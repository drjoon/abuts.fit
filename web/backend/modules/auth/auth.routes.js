// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - web/backend/controllers/auth/auth.controller.js
// - web/frontend/src/features/layout/AccountSwitcher.tsx
// - web/frontend/src/store/useAuthStore.ts
import { Router } from "express";
const router = Router();
import authController from "../../controllers/auth/auth.controller.js";
import oauthController from "../../controllers/auth/oauth.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";
import {
  sendSignupEmailVerification,
  verifySignupEmailCode,
  confirmSignupEmail,
  getSignupEmailVerificationStatus,
  sendSignupPhoneVerification,
  verifySignupPhoneCode,
  getSignupPhoneVerificationStatus,
} from "../../controllers/auth/signupVerification.controller.js";
import {
  upsertSignupDraft,
  getSignupDraft,
  deleteSignupDraft,
} from "../../controllers/auth/signupDraft.controller.js";

// 회원가입
router.post("/register", authController.register);
router.post("/referral/validate", authController.validateReferral);

// 로그인
router.post("/login", authController.login);
router.post("/practice/login", authController.practiceLogin);
router.post("/practice/register", authController.practiceRegister);
router.post("/practice/password/find", authController.practiceFindPassword);
router.post("/practice/password/change", authController.practiceChangePassword);

// 토큰 갱신
router.post("/refresh-token", authController.refreshToken);

// 현재 사용자 정보 조회 (인증 필요)
router.get("/me", authenticate, authController.getCurrentUser);

// 같은 사업자 동료 계정 목록 / 계정 전환 (모든 role)
router.get("/colleagues", authenticate, authController.listColleagues);
router.post("/switch-account", authenticate, authController.switchAccount);

// 비밀번호 변경 (인증 필요)
router.put("/change-password", authenticate, authController.changePassword);

// 비밀번호 재설정 요청 (인증 불필요)
router.post("/forgot-password", authController.forgotPassword);

// 비밀번호 재설정 (인증 불필요)
router.post("/reset-password/:token", authController.resetPassword);

router.post("/signup/email-verification/send", sendSignupEmailVerification);
router.post("/signup/email-verification/verify", verifySignupEmailCode);
router.get("/signup/email-verification/confirm", confirmSignupEmail);
router.get(
  "/signup/email-verification/status",
  getSignupEmailVerificationStatus,
);
router.post("/signup/phone-verification/send", sendSignupPhoneVerification);
router.post("/signup/phone-verification/verify", verifySignupPhoneCode);
router.get("/signup/phone-verification/status", getSignupPhoneVerificationStatus);

router.put("/signup/draft", upsertSignupDraft);
router.get("/signup/draft", getSignupDraft);
router.delete("/signup/draft", deleteSignupDraft);

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
  oauthController.completeSignup,
);

export default router;

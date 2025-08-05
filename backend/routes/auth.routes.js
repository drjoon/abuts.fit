import { Router } from "express";
const router = Router();
import authController from "../controllers/auth.controller";
import { authenticate } from "../middlewares/auth.middleware";

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

// 로그아웃 (인증 필요)
router.post("/logout", authenticate, authController.logout);

export default router;

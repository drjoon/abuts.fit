import { Router } from "express";
import * as bgController from "../controllers/bg.controller.js";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";

const router = Router();

// BG 프로그램들은 전용 토큰이나 특정 IP에서만 접근 가능하도록 설정할 수도 있으나,
// 일단은 admin 권한으로 접근 가능하도록 설정하거나 별도 보안 정책 적용 가능.
router.post("/register-file", bgController.registerProcessedFile);
router.get("/status", bgController.getBgStatus);

export default router;

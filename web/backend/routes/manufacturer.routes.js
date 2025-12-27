import { Router } from "express";
import { authenticate, authorize } from "../middlewares/auth.middleware.js";
import {
  recordManufacturerPayment,
  listManufacturerPayments,
  sendUrgentMessage,
} from "../controllers/manufacturer.controller.js";
import {
  sendVerificationCode,
  verifyCode,
} from "../controllers/phoneVerification.controller.js";

const router = Router();

router.use(authenticate);
router.use(authorize(["manufacturer", "admin"]));

// 입금 내역 기록
router.post("/payments", recordManufacturerPayment);
router.get("/payments", listManufacturerPayments);

// 긴급 메시지 발송
router.post("/messages/urgent", sendUrgentMessage);

// 전화번호 인증
router.post("/phone/send-code", sendVerificationCode);
router.post("/phone/verify-code", verifyCode);

export default router;

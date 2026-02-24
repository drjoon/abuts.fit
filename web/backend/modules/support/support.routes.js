import { Router } from "express";
import supportController from "../../controllers/support/support.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";

const router = Router();

// 게스트 문의 접수 (비로그인 전용)
router.post("/guest-inquiries", supportController.createGuestInquiry);

// 사업자등록 문의 접수 (로그인)
router.post(
  "/business-registration-inquiries",
  authenticate,
  supportController.createBusinessRegistrationInquiry,
);

// 일반 문의 (로그인)
router.post("/inquiries", authenticate, supportController.createInquiry);
router.get("/inquiries", authenticate, supportController.listMyInquiries);

export default router;

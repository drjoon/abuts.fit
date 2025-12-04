import { Router } from "express";
import supportController from "../controllers/support.controller.js";

const router = Router();

// 게스트 문의 접수 (비로그인 전용)
router.post("/guest-inquiries", supportController.createGuestInquiry);

export default router;

import { Router } from "express";
import aiController from "../controllers/ai.controller.js";

const router = Router();

// 파일명 리스트를 받아 Gemini로 구조화된 정보 추출 (개발 단계에서는 인증 없이 사용)
router.post("/parse-filenames", aiController.parseFilenames);

export default router;

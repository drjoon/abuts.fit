// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
// - 2026-09-16: POST /parse-bankbook 통장 사본 OCR.
import { Router } from "express";
import aiController from "../../controllers/ai/ai.controller.js";
import {
  clearCustomAbutmentDesignPreference,
  chooseCustomAbutmentManualDesign,
  confirmCustomAbutmentDesign,
  customAbutmentDesignChat,
  getCustomAbutmentDesignPreference,
  getCustomAbutmentDesignSnapshot,
  presignCustomAbutmentDesignSnapshot,
  requestManualCustomAbutmentDesign,
  saveCustomAbutmentDesignPaint,
  saveCustomAbutmentDesignPreference,
  saveCustomAbutmentDesignSnapshot,
} from "../../controllers/ai/customAbutmentDesignChat.controller.js";
import {
  getCustomAbutmentGenerationLogic,
  recordCustomAbutmentGenerationEdits,
} from "../../controllers/ai/abutmentDesignLogic.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";

const router = Router();

// 파일명 리스트를 받아 Gemini로 구조화된 정보 추출 (개발 단계에서는 인증 없이 사용)
router.post("/parse-filenames", aiController.parseFilenames);
router.post(
  "/parse-business-license",
  authenticate,
  aiController.parseBusinessLicense
);
router.post(
  "/parse-bankbook",
  authenticate,
  aiController.parseBankbook
);
router.post(
  "/recognize-lot-number",
  authenticate,
  aiController.recognizeLotNumber
);
router.post(
  "/custom-abutment-design-chat",
  authenticate,
  customAbutmentDesignChat
);
router.post(
  "/custom-abutment-design-manual",
  authenticate,
  chooseCustomAbutmentManualDesign
);
router.get(
  "/custom-abutment-design-preference",
  authenticate,
  getCustomAbutmentDesignPreference
);
router.get(
  "/custom-abutment-design-snapshot",
  authenticate,
  getCustomAbutmentDesignSnapshot
);
router.post(
  "/custom-abutment-design-snapshot/file",
  authenticate,
  presignCustomAbutmentDesignSnapshot
);
router.put(
  "/custom-abutment-design-snapshot",
  authenticate,
  saveCustomAbutmentDesignSnapshot
);
router.put(
  "/custom-abutment-design-paint",
  authenticate,
  saveCustomAbutmentDesignPaint
);
router.post(
  "/custom-abutment-design-confirm",
  authenticate,
  confirmCustomAbutmentDesign
);
router.post(
  "/custom-abutment-design-manual-request",
  authenticate,
  requestManualCustomAbutmentDesign
);
router.put(
  "/custom-abutment-design-preference",
  authenticate,
  saveCustomAbutmentDesignPreference
);
router.delete(
  "/custom-abutment-design-preference",
  authenticate,
  clearCustomAbutmentDesignPreference
);
router.get(
  "/custom-abutment-design-logic",
  authenticate,
  getCustomAbutmentGenerationLogic
);
router.post(
  "/custom-abutment-design-edits",
  authenticate,
  recordCustomAbutmentGenerationEdits
);

export default router;

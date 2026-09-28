// related files:
// - web/backend/controllers/practiceTransfers/practiceTransferShare.controller.js
// - web/frontend/src/pages/public/CaseSharePage.tsx
// 공유 링크 — 로그인은 선택. 공개 범위(누구나·지정 계정·관계자) 판정은 컨트롤러가 한다.
import { Router } from "express";
import { authenticateOptional } from "../../middlewares/auth.middleware.js";
import {
  getPublicCaseShare,
  streamPublicCaseShareFile,
} from "../../controllers/practiceTransfers/practiceTransferShare.controller.js";

const router = Router();

router.get("/:token", authenticateOptional, getPublicCaseShare);
router.get("/:token/files/:fileKey", authenticateOptional, streamPublicCaseShareFile);

export default router;

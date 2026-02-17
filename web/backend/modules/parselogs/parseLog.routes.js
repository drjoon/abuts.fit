/**
 * ParseLog 라우트 (ESM 스타일)
 */

import { Router } from "express";
import * as parseLogController from "../../controllers/parseLog.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";

const router = Router();

// 로그 저장 (인증 필수)
router.post("/", authenticate, parseLogController.createParseLog);

// 틀린 로그 조회
router.get("/incorrect", parseLogController.getIncorrectLogs);

// 자주 틀리는 패턴 분석
router.get("/analysis/mismatches", parseLogController.analyzeMismatches);

// 로그 통계
router.get("/stats", parseLogController.getStatistics);

// 로그 내보내기 (JSON)
router.get("/export/json", parseLogController.exportLogsAsJSON);

// 로그 내보내기 (CSV)
router.get("/export/csv", parseLogController.exportLogsAsCSV);

export default router;

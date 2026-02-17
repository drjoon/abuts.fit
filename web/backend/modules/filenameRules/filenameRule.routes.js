/**
 * FilenameRule 라우트 (ESM 스타일)
 */

import { Router } from "express";
import * as filenameRuleController from "../../controllers/filenameRule.controller.js";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";

const router = Router();

// 활성 룰 조회 (공개)
router.get("/", filenameRuleController.getActiveRules);

// 모든 룰 조회 (관리자용)
router.get(
  "/all",
  authenticate,
  authorize("admin"),
  filenameRuleController.getAllRules
);

// 룰 생성 (관리자용)
router.post(
  "/",
  authenticate,
  authorize("admin"),
  filenameRuleController.createRule
);

// 룰 업데이트 (관리자용)
router.put(
  "/:ruleId",
  authenticate,
  authorize("admin"),
  filenameRuleController.updateRule
);

// 룰 활성화/비활성화 (관리자용)
router.patch(
  "/:ruleId/toggle",
  authenticate,
  authorize("admin"),
  filenameRuleController.toggleRuleActive
);

// 룰 정확도 업데이트 (관리자용)
router.patch(
  "/:ruleId/accuracy",
  authenticate,
  authorize("admin"),
  filenameRuleController.updateRuleAccuracy
);

// 룰 삭제 (관리자용)
router.delete(
  "/:ruleId",
  authenticate,
  authorize("admin"),
  filenameRuleController.deleteRule
);

// 룰 통계 (관리자용)
router.get(
  "/stats",
  authenticate,
  authorize("admin"),
  filenameRuleController.getRuleStatistics
);

// 여러 룰 일괄 생성/업데이트 (관리자용, AI 도구용)
router.post(
  "/batch",
  authenticate,
  authorize("admin"),
  filenameRuleController.batchUpsertRules
);

export default router;

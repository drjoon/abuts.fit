import { Router } from "express";
const router = Router();

import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import { getReferralGroupTree } from "../../controllers/admin/admin.referral.controller.js";

// 모든 인증된 사용자가 자신의 소개 트리를 조회할 수 있음
router.get(
  "/:leaderId/tree",
  authenticate,
  authorize(["admin", "requestor", "salesman", "devops"]),
  getReferralGroupTree,
);

export default router;

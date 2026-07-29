import express from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import {
  cancelPracticeTransfersBatch,
  createPracticeTransfer,
  getMyPracticeTransfers,
} from "../../controllers/practiceTransfers/practiceTransfer.controller.js";

const router = express.Router();

// related files:
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/backend/models/practiceTransfer.model.js
// practice(치과) 전송 전용 라우트 (Request 컬렉션과 분리)
router.post(
  "/",
  authenticate,
  authorize(["practice", "admin"], { subRoles: ["owner", "staff"] }),
  createPracticeTransfer,
);

router.get(
  "/my",
  authenticate,
  authorize(["practice", "admin"], { subRoles: ["owner", "staff"] }),
  getMyPracticeTransfers,
);

router.post(
  "/cancel-batch",
  authenticate,
  authorize(["practice", "admin"], { subRoles: ["owner", "staff"] }),
  cancelPracticeTransfersBatch,
);

export default router;

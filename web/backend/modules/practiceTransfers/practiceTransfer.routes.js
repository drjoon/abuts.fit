// related files:
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
import express from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import {
  cancelPracticeTransfersBatch,
  clearMyPracticeTransferDraft,
  createPracticeTransfer,
  getMyPracticeTransferDraft,
  getMyPracticeTransfers,
  getReceivedPracticeTransfers,
  getReceivedPracticeTransferUnreadCount,
  markReceivedPracticeTransferRead,
  upsertPracticeTransferDraft,
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

router.get(
  "/draft",
  authenticate,
  authorize(["practice", "admin"], { subRoles: ["owner", "staff"] }),
  getMyPracticeTransferDraft,
);

router.post(
  "/draft",
  authenticate,
  authorize(["practice", "admin"], { subRoles: ["owner", "staff"] }),
  upsertPracticeTransferDraft,
);

router.delete(
  "/draft",
  authenticate,
  authorize(["practice", "admin"], { subRoles: ["owner", "staff"] }),
  clearMyPracticeTransferDraft,
);

router.get(
  "/received",
  authenticate,
  authorize(["requestor", "admin"]),
  getReceivedPracticeTransfers,
);

router.get(
  "/received-unread-count",
  authenticate,
  authorize(["requestor", "admin"]),
  getReceivedPracticeTransferUnreadCount,
);

router.post(
  "/:transferId/mark-read",
  authenticate,
  authorize(["requestor", "admin"]),
  markReceivedPracticeTransferRead,
);

router.post(
  "/cancel-batch",
  authenticate,
  authorize(["practice", "admin"], { subRoles: ["owner", "staff"] }),
  cancelPracticeTransfersBatch,
);

export default router;

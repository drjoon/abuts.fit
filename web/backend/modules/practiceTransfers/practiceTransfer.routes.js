// related files:
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/controllers/practiceTransfers/practiceTransferSettings.controller.js
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
import express from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import {
  cancelPracticeTransfersBatch,
  clearMyPracticeTransferDraft,
  createPracticeTransfer,
  getMyPracticeTransferDraft,
  listPracticeTransferDrafts,
  restorePracticeTransferDraft,
  getMyPracticeTransfers,
  getReceivedPracticeTransfers,
  getReceivedPracticeTransferUnreadCount,
  markReceivedPracticeTransferRead,
  markReceivedPracticeTransferDownloaded,
  restorePracticeTransfersBatch,
  upsertPracticeTransferDraft,
} from "../../controllers/practiceTransfers/practiceTransfer.controller.js";
import {
  getPracticeTransferSettings,
  upsertPracticeTransferSettings,
} from "../../controllers/practiceTransfers/practiceTransferSettings.controller.js";

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
  "/settings",
  authenticate,
  authorize(["practice", "requestor", "admin"]),
  getPracticeTransferSettings,
);

router.post(
  "/settings",
  authenticate,
  authorize(["practice", "requestor", "admin"]),
  upsertPracticeTransferSettings,
);

router.get(
  "/draft",
  authenticate,
  authorize(["practice", "admin"], { subRoles: ["owner", "staff"] }),
  getMyPracticeTransferDraft,
);

router.get(
  "/drafts",
  authenticate,
  authorize(["practice", "admin"], { subRoles: ["owner", "staff"] }),
  listPracticeTransferDrafts,
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

router.post(
  "/draft/restore",
  authenticate,
  authorize(["practice", "admin"], { subRoles: ["owner", "staff"] }),
  restorePracticeTransferDraft,
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
  "/:transferId/mark-downloaded",
  authenticate,
  authorize(["requestor", "admin"]),
  markReceivedPracticeTransferDownloaded,
);

router.post(
  "/cancel-batch",
  authenticate,
  authorize(["practice", "admin"], { subRoles: ["owner", "staff"] }),
  cancelPracticeTransfersBatch,
);

router.post(
  "/restore-batch",
  authenticate,
  authorize(["practice", "admin"], { subRoles: ["owner", "staff"] }),
  restorePracticeTransfersBatch,
);

export default router;

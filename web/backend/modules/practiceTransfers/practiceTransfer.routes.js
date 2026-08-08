// related files:
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/controllers/practiceTransfers/practiceTransferSettings.controller.js
// - web/frontend/src/pages/practice/PracticeFileTransferPage.tsx
// - web/frontend/src/pages/requestor/practice/RequestorPracticePage.tsx
import express from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import {
  authorizePracticeTransferReceive,
  authorizePracticeTransferSend,
} from "../../middlewares/practiceTransferAuth.middleware.js";
import {
  cancelPracticeTransfersBatch,
  clearMyPracticeTransferDraft,
  createPracticeTransfer,
  emptyPracticeTransferTrash,
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

const sendAuth = authorizePracticeTransferSend({
  subRoles: ["owner", "staff"],
});
const receiveAuth = authorizePracticeTransferReceive();

// practice 전송 전용 라우트 (Request 컬렉션과 분리)
// 발신: legacy practice 또는 requestor+practice
router.post("/", authenticate, sendAuth, createPracticeTransfer);

router.get("/my", authenticate, sendAuth, getMyPracticeTransfers);

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

router.get("/draft", authenticate, sendAuth, getMyPracticeTransferDraft);

router.get("/drafts", authenticate, sendAuth, listPracticeTransferDrafts);

router.post("/draft", authenticate, sendAuth, upsertPracticeTransferDraft);

router.delete("/draft", authenticate, sendAuth, clearMyPracticeTransferDraft);

router.post(
  "/draft/restore",
  authenticate,
  sendAuth,
  restorePracticeTransferDraft,
);

router.post("/trash/empty", authenticate, sendAuth, emptyPracticeTransferTrash);

router.get("/received", authenticate, receiveAuth, getReceivedPracticeTransfers);

// 배지 폴링용: lab 미선택(치과-only)도 403 대신 unreadCount=0
router.get(
  "/received-unread-count",
  authenticate,
  authorize(["requestor", "admin"]),
  getReceivedPracticeTransferUnreadCount,
);

router.post(
  "/:transferId/mark-read",
  authenticate,
  receiveAuth,
  markReceivedPracticeTransferRead,
);

router.post(
  "/:transferId/mark-downloaded",
  authenticate,
  receiveAuth,
  markReceivedPracticeTransferDownloaded,
);

router.post(
  "/cancel-batch",
  authenticate,
  sendAuth,
  cancelPracticeTransfersBatch,
);

router.post(
  "/restore-batch",
  authenticate,
  sendAuth,
  restorePracticeTransfersBatch,
);

export default router;

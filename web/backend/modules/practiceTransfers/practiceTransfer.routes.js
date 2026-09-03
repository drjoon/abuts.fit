// related files:
// - web/backend/controllers/practiceTransfers/practiceTransfer.controller.js
// - web/backend/controllers/practiceTransfers/practiceTransferSettings.controller.js
// - web/backend/controllers/practiceTransfers/roundBarAbutmentRequest.controller.js
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
  clearAllPracticeTransferDrafts,
  clearMyPracticeTransferDraft,
  createPracticeTransfer,
  emptyPracticeTransferTrash,
  getMyPracticeTransferDraft,
  listPracticeTransferDrafts,
  restorePracticeTransferDraft,
  getMyPracticeTransfers,
  listSubcontractDirectBlockedLabs,
  getPracticeTransferQuoteContext,
  getReceivedPracticeTransfers,
  getReceivedPracticeTransferUnreadCount,
  markReceivedPracticeTransferRead,
  markReceivedPracticeTransferAccepted,
  markReceivedPracticeTransferComplete,
  appendReceivedPracticeTransferResultFiles,
  markReceivedPracticeTransferRelease,
  markReceivedPracticeTransferReject,
  openSubcontractPracticeTransfer,
  markReceivedPracticeTransferDownloaded,
  confirmPracticeTransferAbutmentDesign,
  confirmPracticeTransferProduction,
  remakePracticeTransfers,
  restorePracticeTransfersBatch,
  retargetPracticeTransferLab,
  upsertPracticeTransferDraft,
  upsertPracticeTransferLabRating,
  updatePracticeTransferContent,
  appendPracticeTransferArrival,
  appendPracticeTransferProsthesis,
  cancelPracticeTransferProsthesisFollowUp,
  updatePracticeTransferProsthesisFollowUp,
} from "../../controllers/practiceTransfers/practiceTransfer.controller.js";
import { handoffPracticeTransferAbutmentDesign } from "../../controllers/requests/designHandoff.controller.js";
import {
  getPracticeTransferSettings,
  upsertPracticeTransferSettings,
} from "../../controllers/practiceTransfers/practiceTransferSettings.controller.js";
import { createRoundBarAbutmentRequest } from "../../controllers/practiceTransfers/roundBarAbutmentRequest.controller.js";

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
  "/subcontract-direct-blocked-labs",
  authenticate,
  sendAuth,
  listSubcontractDirectBlockedLabs,
);

router.get(
  "/quote-context",
  authenticate,
  authorize(["practice", "requestor", "admin"]),
  getPracticeTransferQuoteContext,
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

router.post(
  "/round-bar-requests",
  authenticate,
  authorize(["practice", "requestor", "admin"]),
  createRoundBarAbutmentRequest,
);

router.get("/draft", authenticate, sendAuth, getMyPracticeTransferDraft);

router.get("/drafts", authenticate, sendAuth, listPracticeTransferDrafts);

router.post(
  "/drafts/clear-all",
  authenticate,
  sendAuth,
  clearAllPracticeTransferDrafts,
);

router.post("/draft", authenticate, sendAuth, upsertPracticeTransferDraft);

router.delete("/draft", authenticate, sendAuth, clearMyPracticeTransferDraft);

router.post(
  "/draft/restore",
  authenticate,
  sendAuth,
  restorePracticeTransferDraft,
);

router.post("/trash/empty", authenticate, sendAuth, emptyPracticeTransferTrash);

router.post("/remake", authenticate, sendAuth, remakePracticeTransfers);

router.post(
  "/:transferId/update-content",
  authenticate,
  sendAuth,
  updatePracticeTransferContent,
);

router.post(
  "/:transferId/append-arrival",
  authenticate,
  sendAuth,
  appendPracticeTransferArrival,
);

router.post(
  "/:transferId/append-prosthesis",
  authenticate,
  sendAuth,
  appendPracticeTransferProsthesis,
);

router.post(
  "/:transferId/cancel-prosthesis-follow-up",
  authenticate,
  sendAuth,
  cancelPracticeTransferProsthesisFollowUp,
);

router.post(
  "/:transferId/update-prosthesis-follow-up",
  authenticate,
  sendAuth,
  updatePracticeTransferProsthesisFollowUp,
);

router.get("/received", authenticate, receiveAuth, getReceivedPracticeTransfers);

// 배지 초기/보정용(수신 소켓으로 갱신). lab 미선택도 403 대신 unreadCount=0
router.get(
  "/received-unread-count",
  authenticate,
  authorize(["requestor", "internalLab", "admin"]),
  getReceivedPracticeTransferUnreadCount,
);

router.post(
  "/:transferId/lab-rating",
  authenticate,
  sendAuth,
  upsertPracticeTransferLabRating,
);

router.post(
  "/:transferId/mark-read",
  authenticate,
  receiveAuth,
  markReceivedPracticeTransferRead,
);

router.post(
  "/:transferId/mark-accepted",
  authenticate,
  receiveAuth,
  markReceivedPracticeTransferAccepted,
);

router.post(
  "/:transferId/mark-complete",
  authenticate,
  receiveAuth,
  markReceivedPracticeTransferComplete,
);

router.post(
  "/:transferId/result-files",
  authenticate,
  receiveAuth,
  appendReceivedPracticeTransferResultFiles,
);

router.post(
  "/:transferId/confirm-abutment-design",
  authenticate,
  receiveAuth,
  confirmPracticeTransferAbutmentDesign,
);

router.post(
  "/:transferId/abutment-design-handoff",
  authenticate,
  receiveAuth,
  handoffPracticeTransferAbutmentDesign,
);

router.post(
  "/:transferId/confirm-production",
  authenticate,
  sendAuth,
  confirmPracticeTransferProduction,
);

router.post(
  "/:transferId/mark-release",
  authenticate,
  receiveAuth,
  markReceivedPracticeTransferRelease,
);

router.post(
  "/:transferId/mark-reject",
  authenticate,
  receiveAuth,
  markReceivedPracticeTransferReject,
);

router.post(
  "/:transferId/open-subcontract",
  authenticate,
  receiveAuth,
  openSubcontractPracticeTransfer,
);

router.post(
  "/:transferId/retarget-lab",
  authenticate,
  sendAuth,
  retargetPracticeTransferLab,
);

// 레거시 별칭 — 의뢰수락과 동일 (다운로드로 상태 전이하지 않음; FE는 mark-accepted 사용)
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

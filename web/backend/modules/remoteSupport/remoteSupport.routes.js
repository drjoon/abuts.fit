// related files:
// - web/backend/controllers/remoteSupport/remoteSupport.controller.js
// - web/backend/app.js
import { Router } from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import {
  getIceConfig,
  createSession,
  inviteSession,
  acceptSession,
  declineSession,
  startSession,
  endSession,
  updateSessionNotes,
  listSessions,
  listMySessions,
  getSession,
  postMessage,
  getStats,
  searchStaffUsers,
} from "../../controllers/remoteSupport/remoteSupport.controller.js";

const router = Router();

const STAFF_OR_ADMIN = [
  "admin",
  "practice",
  "requestor",
  "internalLab",
  "labTeam",
];

router.use(authenticate);

router.get("/ice-config", authorize(STAFF_OR_ADMIN), getIceConfig);
router.get("/stats", authorize(["admin"]), getStats);
router.get("/users/search", authorize(["admin"]), searchStaffUsers);

router.get("/sessions", authorize(["admin"]), listSessions);
router.get("/sessions/mine", authorize(STAFF_OR_ADMIN), listMySessions);
router.post(
  "/sessions",
  authorize(["practice", "requestor", "internalLab", "labTeam"]),
  createSession,
);
router.post("/sessions/invite", authorize(["admin"]), inviteSession);
router.get("/sessions/:id", authorize(STAFF_OR_ADMIN), getSession);
router.post("/sessions/:id/accept", authorize(STAFF_OR_ADMIN), acceptSession);
router.post("/sessions/:id/decline", authorize(STAFF_OR_ADMIN), declineSession);
router.post("/sessions/:id/start", authorize(STAFF_OR_ADMIN), startSession);
router.post("/sessions/:id/end", authorize(STAFF_OR_ADMIN), endSession);
router.patch("/sessions/:id", authorize(["admin"]), updateSessionNotes);
router.post("/sessions/:id/messages", authorize(STAFF_OR_ADMIN), postMessage);

export default router;

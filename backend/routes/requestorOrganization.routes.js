import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import * as requestorOrganizationController from "../controllers/requestorOrganization.controller.js";

const router = Router();

router.use(authenticate);

router.get("/me", requestorOrganizationController.getMyOrganization);

router.post(
  "/join-requests",
  requestorOrganizationController.requestJoinOrganization
);
router.get(
  "/join-requests/me",
  requestorOrganizationController.getMyJoinRequests
);
router.get(
  "/join-requests/pending",
  requestorOrganizationController.getPendingJoinRequestsForOwner
);
router.post(
  "/join-requests/:userId/approve",
  requestorOrganizationController.approveJoinRequest
);
router.post(
  "/join-requests/:userId/reject",
  requestorOrganizationController.rejectJoinRequest
);

export default router;

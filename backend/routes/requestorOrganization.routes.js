import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import * as requestorOrganizationController from "../controllers/requestorOrganization.controller.js";

const router = Router();

router.use(authenticate);

router.get("/me", requestorOrganizationController.getMyOrganization);

router.get("/search", requestorOrganizationController.searchOrganizations);

router.put("/me", requestorOrganizationController.updateMyOrganization);

router.get("/co-owners", requestorOrganizationController.getCoOwners);
router.post("/co-owners", requestorOrganizationController.addCoOwner);
router.delete(
  "/co-owners/:userId",
  requestorOrganizationController.removeCoOwner
);

router.post(
  "/join-requests",
  requestorOrganizationController.requestJoinOrganization
);
router.post(
  "/join-requests/:organizationId/cancel",
  requestorOrganizationController.cancelJoinRequest
);
router.post(
  "/join-requests/:organizationId/leave",
  requestorOrganizationController.leaveOrganization
);
router.get(
  "/join-requests/me",
  requestorOrganizationController.getMyJoinRequests
);
router.get(
  "/join-requests/pending",
  requestorOrganizationController.getPendingJoinRequestsForOwner
);
router.get("/staff", requestorOrganizationController.getMyStaffMembers);
router.delete(
  "/staff/:userId",
  requestorOrganizationController.removeStaffMember
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

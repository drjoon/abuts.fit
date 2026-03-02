import { Router } from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import * as requestorOrganizationController from "../../controllers/organizations/requestorOrganization.controller.js";
import * as leadTimeController from "../../controllers/organizations/leadTime.controller.js";

const router = Router();

router.use(authenticate);

// 조회는 모두 가능
router.get("/me", requestorOrganizationController.getMyOrganization);
router.get("/search", requestorOrganizationController.searchOrganizations);
router.get(
  "/manufacturer-lead-times",
  leadTimeController.getManufacturerLeadTimes,
);

// 조직 정보 수정
router.put(
  "/me",
  authorize(["requestor", "salesman", "manufacturer", "admin"]),
  requestorOrganizationController.updateMyOrganization,
);

router.delete(
  "/me/business-license",
  requestorOrganizationController.clearMyBusinessLicense,
);

// 대표(owners) 관리
router.get(
  "/owners",
  authorize(["requestor", "salesman", "manufacturer", "admin"]),
  requestorOrganizationController.getRepresentatives,
);
router.post(
  "/owners",
  authorize(["requestor", "salesman", "manufacturer", "admin"]),
  requestorOrganizationController.addOwner,
);
router.delete(
  "/owners/:userId",
  authorize(["requestor", "salesman", "manufacturer", "admin"]),
  requestorOrganizationController.removeOwner,
);

// 가입 요청/탈퇴: 일반 기능 (직원도 가입 요청 취소/탈퇴는 가능해야 함)
router.post(
  "/join-requests",
  requestorOrganizationController.requestJoinOrganization,
);
router.post(
  "/join-requests/:organizationId/cancel",
  authorize(["requestor", "salesman", "manufacturer", "admin"]),
  requestorOrganizationController.cancelJoinRequest,
);
router.post(
  "/join-requests/:organizationId/leave",
  authorize(["requestor", "salesman", "manufacturer", "admin"]),
  requestorOrganizationController.leaveOrganization,
);
router.get(
  "/join-requests/me",
  requestorOrganizationController.getMyJoinRequests,
);

// 직원 관리 (가입 승인/거절/목록/삭제)
router.get(
  "/join-requests/pending",
  authorize(["requestor", "salesman", "manufacturer", "admin"]),
  requestorOrganizationController.getPendingJoinRequestsForOwner,
);
router.get(
  "/staff",
  authorize(["requestor", "salesman", "manufacturer", "admin"]),
  requestorOrganizationController.getMyStaffMembers,
);
router.delete(
  "/staff/:userId",
  authorize(["requestor", "salesman", "manufacturer", "admin"]),
  requestorOrganizationController.removeStaffMember,
);
router.post(
  "/join-requests/:userId/approve",
  authorize(["requestor", "salesman", "manufacturer", "admin"]),
  requestorOrganizationController.approveJoinRequest,
);
router.post(
  "/join-requests/:userId/reject",
  authorize(["requestor", "salesman", "manufacturer", "admin"]),
  requestorOrganizationController.rejectJoinRequest,
);

export default router;

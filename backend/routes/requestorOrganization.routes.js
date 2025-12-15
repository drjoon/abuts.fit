import { Router } from "express";
import {
  authenticate,
  authorizePosition,
} from "../middlewares/auth.middleware.js";
import * as requestorOrganizationController from "../controllers/requestorOrganization.controller.js";

const router = Router();

router.use(authenticate);

// 조회는 모두 가능
router.get("/me", requestorOrganizationController.getMyOrganization);
router.get("/search", requestorOrganizationController.searchOrganizations);

// 조직 정보 수정: 주대표/부대표
router.put(
  "/me",
  authorizePosition(["principal", "vice_principal"]),
  requestorOrganizationController.updateMyOrganization
);

router.delete(
  "/me/business-license",
  authorizePosition(["principal", "vice_principal"]),
  requestorOrganizationController.clearMyBusinessLicense
);

// 공동 대표 관리: 주대표만 가능
router.get(
  "/co-owners",
  authorizePosition(["principal"]),
  requestorOrganizationController.getCoOwners
);
router.post(
  "/co-owners",
  authorizePosition(["principal"]),
  requestorOrganizationController.addCoOwner
);
router.delete(
  "/co-owners/:userId",
  authorizePosition(["principal"]),
  requestorOrganizationController.removeCoOwner
);

// 가입 요청/탈퇴: 일반 기능 (직원도 가입 요청 취소/탈퇴는 가능해야 함)
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

// 직원 관리 (가입 승인/거절/목록/삭제): 주대표/부대표
router.get(
  "/join-requests/pending",
  authorizePosition(["principal", "vice_principal"]),
  requestorOrganizationController.getPendingJoinRequestsForOwner
);
router.get(
  "/staff",
  authorizePosition(["principal", "vice_principal"]),
  requestorOrganizationController.getMyStaffMembers
);
router.delete(
  "/staff/:userId",
  authorizePosition(["principal", "vice_principal"]),
  requestorOrganizationController.removeStaffMember
);
router.post(
  "/join-requests/:userId/approve",
  authorizePosition(["principal", "vice_principal"]),
  requestorOrganizationController.approveJoinRequest
);
router.post(
  "/join-requests/:userId/reject",
  authorizePosition(["principal", "vice_principal"]),
  requestorOrganizationController.rejectJoinRequest
);

export default router;

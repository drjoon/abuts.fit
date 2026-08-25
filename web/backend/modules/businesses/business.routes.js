// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
import { Router } from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import * as businessController from "../../controllers/businesses/business.api.controller.js";
import * as leadTimeController from "../../controllers/businesses/leadTime.controller.js";

const BUSINESS_ACCOUNT_ROLES = [
  "requestor",
  "salesman",
  "manufacturer",
  "internalLab",
  "admin",
  "devops",
  "labTeam",
  "salesTeam",
];
const BUSINESS_ORG_ROLES = [...BUSINESS_ACCOUNT_ROLES, "practice"];

const router = Router();

// 공개 검색(치과 드롭존 등 비로그인 화면에서 사용)
router.get("/search-public", businessController.searchBusinesses);
router.get("/public/:id", businessController.getBusinessPublicById);

router.use(authenticate);

// 조회는 모두 가능
router.get("/me", businessController.getMyBusiness);
router.get("/search", businessController.searchBusinesses);
router.get(
  "/manufacturer-lead-times",
  leadTimeController.getManufacturerLeadTimes,
);
router.get("/me/request-settings", businessController.getMyRequestSettings);

// 사업자 정보 수정
router.put(
  "/me",
  authorize(BUSINESS_ACCOUNT_ROLES),
  businessController.updateMyBusiness,
);

router.patch(
  "/me",
  authorize(BUSINESS_ACCOUNT_ROLES),
  businessController.updateMyBusiness,
);

router.get(
  "/me/auto-match-participation",
  authorize(["requestor", "internalLab", "admin"]),
  businessController.getMyAutoMatchParticipation,
);

router.post(
  "/me/auto-match-participation",
  authorize(["requestor", "internalLab", "admin"]),
  businessController.setMyAutoMatchParticipation,
);

router.post(
  "/me/exit-demo",
  authorize(["requestor", "practice"]),
  businessController.exitMyDemoMode,
);

router.put(
  "/me/request-settings",
  authorize(BUSINESS_ACCOUNT_ROLES),
  businessController.updateMyRequestSettings,
);

router.post(
  "/postal-code-lookup",
  authorize(BUSINESS_ACCOUNT_ROLES),
  businessController.lookupPostalCode,
);

router.post(
  "/check-business-number",
  authorize(BUSINESS_ACCOUNT_ROLES),
  businessController.checkBusinessNumberDuplicate,
);

router.put(
  "/business-shipping-address",
  authorize(["manufacturer", "admin"]),
  businessController.updateBusinessShippingAddress,
);

router.delete(
  "/me/business-license",
  businessController.clearMyBusinessLicense,
);

// 대표(owners) 관리
router.get(
  "/owners",
  authorize(BUSINESS_ORG_ROLES),
  businessController.getRepresentatives,
);
router.post(
  "/owners",
  authorize(BUSINESS_ORG_ROLES),
  businessController.addOwner,
);
router.delete(
  "/owners/:userId",
  authorize(BUSINESS_ORG_ROLES),
  businessController.removeOwner,
);

// 가입 요청/탈퇴: 일반 기능 (직원도 가입 요청 취소/탈퇴는 가능해야 함)
router.post("/join-requests", businessController.requestJoinBusiness);
router.post(
  "/join-requests/:businessId/cancel",
  authorize(BUSINESS_ORG_ROLES),
  businessController.cancelJoinRequest,
);
router.post(
  "/join-requests/:businessId/leave",
  authorize(BUSINESS_ORG_ROLES),
  businessController.leaveBusiness,
);
router.get("/join-requests/me", businessController.getMyJoinRequests);

// 직원 관리 (가입 승인/거절/목록/삭제)
router.get(
  "/join-requests/pending",
  authorize(BUSINESS_ORG_ROLES),
  businessController.getPendingJoinRequestsForOwner,
);
router.get(
  "/staff",
  authorize(BUSINESS_ORG_ROLES),
  businessController.getMyStaffMembers,
);
router.delete(
  "/staff/:userId",
  authorize(BUSINESS_ORG_ROLES),
  businessController.removeMember,
);
router.post(
  "/join-requests/:userId/approve",
  authorize(BUSINESS_ORG_ROLES),
  businessController.approveJoinRequest,
);
router.post(
  "/join-requests/:userId/reject",
  authorize(BUSINESS_ORG_ROLES),
  businessController.rejectJoinRequest,
);

// 임직원 부서 (admin · practice · requestor)
const DEPARTMENT_BUSINESS_ROLES = ["admin", "practice", "requestor"];

router.get(
  "/departments",
  authorize(DEPARTMENT_BUSINESS_ROLES),
  businessController.listDepartments,
);
router.post(
  "/departments",
  authorize(DEPARTMENT_BUSINESS_ROLES),
  businessController.createDepartment,
);
router.patch(
  "/departments/:departmentId",
  authorize(DEPARTMENT_BUSINESS_ROLES),
  businessController.updateDepartment,
);
router.delete(
  "/departments/:departmentId",
  authorize(DEPARTMENT_BUSINESS_ROLES),
  businessController.deleteDepartment,
);
router.patch(
  "/staff/:userId/department",
  authorize(DEPARTMENT_BUSINESS_ROLES),
  businessController.assignStaffDepartment,
);

export default router;

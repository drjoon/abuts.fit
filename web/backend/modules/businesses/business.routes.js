import { Router } from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import * as businessController from "../../controllers/businesses/business.api.controller.js";
import * as leadTimeController from "../../controllers/businesses/leadTime.controller.js";

const router = Router();

router.use(authenticate);

// 조회는 모두 가능
router.get("/me", businessController.getMyBusiness);
router.get("/search", businessController.searchBusinesses);
router.get(
  "/manufacturer-lead-times",
  leadTimeController.getManufacturerLeadTimes,
);

// 사업자 정보 수정
router.put(
  "/me",
  authorize(["requestor", "salesman", "manufacturer", "admin", "devops"]),
  businessController.updateMyBusiness,
);

router.patch(
  "/me",
  authorize(["requestor", "salesman", "manufacturer", "admin", "devops"]),
  businessController.updateMyBusiness,
);

router.post(
  "/postal-code-lookup",
  authorize(["requestor", "salesman", "manufacturer", "admin", "devops"]),
  businessController.lookupPostalCode,
);

router.post(
  "/check-business-number",
  authorize(["requestor", "salesman", "manufacturer", "admin", "devops"]),
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
  authorize(["requestor", "salesman", "manufacturer", "admin", "devops"]),
  businessController.getRepresentatives,
);
router.post(
  "/owners",
  authorize(["requestor", "salesman", "manufacturer", "admin", "devops"]),
  businessController.addOwner,
);
router.delete(
  "/owners/:userId",
  authorize(["requestor", "salesman", "manufacturer", "admin", "devops"]),
  businessController.removeOwner,
);

// 가입 요청/탈퇴: 일반 기능 (직원도 가입 요청 취소/탈퇴는 가능해야 함)
router.post(
  "/join-requests",
  businessController.requestJoinBusiness,
);
router.post(
  "/join-requests/:businessId/cancel",
  authorize(["requestor", "salesman", "manufacturer", "admin"]),
  businessController.cancelJoinRequest,
);
router.post(
  "/join-requests/:businessId/leave",
  authorize(["requestor", "salesman", "manufacturer", "admin"]),
  businessController.leaveBusiness,
);
router.get(
  "/join-requests/me",
  businessController.getMyJoinRequests,
);

// 직원 관리 (가입 승인/거절/목록/삭제)
router.get(
  "/join-requests/pending",
  authorize(["requestor", "salesman", "manufacturer", "admin", "devops"]),
  businessController.getPendingJoinRequestsForOwner,
);
router.get(
  "/staff",
  authorize(["requestor", "salesman", "manufacturer", "admin", "devops"]),
  businessController.getMyStaffMembers,
);
router.delete(
  "/staff/:userId",
  authorize(["requestor", "salesman", "manufacturer", "admin", "devops"]),
  businessController.removeMember,
);
router.post(
  "/join-requests/:userId/approve",
  authorize(["requestor", "salesman", "manufacturer", "admin", "devops"]),
  businessController.approveJoinRequest,
);
router.post(
  "/join-requests/:userId/reject",
  authorize(["requestor", "salesman", "manufacturer", "admin", "devops"]),
  businessController.rejectJoinRequest,
);

export default router;

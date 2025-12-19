import { Router } from "express";
const router = Router();
import adminController from "../controllers/admin.controller.js";
import {
  authenticate,
  authorize,
  authorizePosition,
} from "../middlewares/auth.middleware.js";
import {
  adminListBankTransactions,
  adminListChargeOrders,
  adminManualMatch,
  adminUpsertBankTransaction,
} from "../controllers/adminCreditBPlan.controller.js";

// 모든 라우트에 인증 및 관리자 권한 확인 미들웨어 적용
router.use(authenticate);
router.use(authorize(["admin"]));

// 사용자 관리: Master, Manager만 가능
router.get(
  "/users",
  authorizePosition(["master", "manager"]),
  adminController.getAllUsers
);
router.get(
  "/users/:id",
  authorizePosition(["master", "manager"]),
  adminController.getUserById
);
router.put(
  "/users/:id",
  authorizePosition(["master", "manager"]),
  adminController.updateUser
);
router.delete(
  "/users/:id",
  authorizePosition(["master", "manager"]),
  adminController.deleteUser
);
router.patch(
  "/users/:id/toggle-active",
  authorizePosition(["master", "manager"]),
  adminController.toggleUserActive
);
router.patch(
  "/users/:id/change-role",
  authorizePosition(["master", "manager"]),
  adminController.changeUserRole
);

// 의뢰 관리: Staff도 조회는 가능 (모니터링)
router.get("/requests", adminController.getAllRequests);
router.get("/requests/:id", adminController.getRequestById);
// 상태 변경/할당은 Master/Manager만? 혹은 Staff도 모니터링 중 개입 필요?
// "모니터링, 고객지원" -> 보통 조회 위주. 상태 변경은 권한이 필요할 수 있음.
// 일단 Master/Manager로 제한하고 필요시 품.
router.patch(
  "/requests/:id/status",
  authorizePosition(["master", "manager"]),
  adminController.updateRequestStatus
);
router.patch(
  "/requests/:id/assign",
  authorizePosition(["master", "manager"]),
  adminController.assignManufacturer
);

// 대시보드 통계: Master/Manager
router.get(
  "/dashboard",
  authorizePosition(["master", "manager"]),
  adminController.getDashboardStats
);
router.get(
  "/credits/b-plan/charge-orders",
  authorizePosition(["master", "manager", "staff"]),
  adminListChargeOrders
);
router.get(
  "/credits/b-plan/bank-transactions",
  authorizePosition(["master", "manager", "staff"]),
  adminListBankTransactions
);
router.post(
  "/credits/b-plan/bank-transactions/upsert",
  authorizePosition(["master", "manager"]),
  adminUpsertBankTransaction
);
router.post(
  "/credits/b-plan/match",
  authorizePosition(["master", "manager"]),
  adminManualMatch
);

// 가격/리퍼럴 정책 통계: Master/Manager
router.get(
  "/pricing-stats",
  authorizePosition(["master", "manager"]),
  adminController.getPricingStats
);
router.get(
  "/pricing-stats/users",
  authorizePosition(["master", "manager"]),
  adminController.getPricingStatsByUser
);

// 시스템 로그: Master/Manager
router.get(
  "/logs",
  authorizePosition(["master", "manager"]),
  adminController.getSystemLogs
);

// 활동 로그: Master/Manager
router.get(
  "/activity-logs",
  authorizePosition(["master", "manager"]),
  adminController.getActivityLogs
);

// 시스템 설정: Master/Manager
router.get(
  "/settings",
  authorizePosition(["master", "manager"]),
  adminController.getSystemSettings
);
router.put(
  "/settings",
  authorizePosition(["master", "manager"]),
  adminController.updateSystemSettings
);

export default router;

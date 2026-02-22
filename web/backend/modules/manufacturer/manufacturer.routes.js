import { Router } from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import {
  recordManufacturerPayment,
  listManufacturerPayments,
  sendUrgentMessage,
  getManufacturerCreditLedger,
  getManufacturerDailySettlementSnapshots,
  getManufacturerDailySettlementSnapshotStatus,
  triggerManufacturerDailySettlementSnapshotRecalc,
} from "../../controllers/manufacturers/manufacturer.controller.js";
import { getManagementStatus } from "./manufacturer.controller.js";
import {
  sendVerificationCode,
  verifyCode,
} from "../../controllers/auth/phoneVerification.controller.js";

const router = Router();

router.use(authenticate);
router.use(authorize(["manufacturer", "admin"]));

// 관리 상태 조회
router.get(
  "/management-status",
  authorize(["manufacturer", "admin"], {
    manufacturerRoles: ["owner", "staff"],
  }),
  getManagementStatus,
);

// 입금 내역 기록 (금전 관련: manufacturer owner만)
router.post(
  "/payments",
  authorize(["manufacturer", "admin"], { manufacturerRoles: ["owner"] }),
  recordManufacturerPayment,
);
// 조회는 staff 가능
router.get(
  "/payments",
  authorize(["manufacturer", "admin"], {
    manufacturerRoles: ["owner", "staff"],
  }),
  listManufacturerPayments,
);

// 제조사 크레딧(정산) 원장
router.get(
  "/credits/ledger",
  authorize(["manufacturer", "admin"], {
    manufacturerRoles: ["owner", "staff"],
  }),
  getManufacturerCreditLedger,
);

// 제조사 일별 정산 스냅샷
router.get(
  "/credits/daily-snapshots",
  authorize(["manufacturer", "admin"], {
    manufacturerRoles: ["owner", "staff"],
  }),
  getManufacturerDailySettlementSnapshots,
);

// 제조사 일별 정산 스냅샷 status/recalc
router.get(
  "/credits/daily-snapshots/status",
  authorize(["manufacturer", "admin"], {
    manufacturerRoles: ["owner", "staff"],
  }),
  getManufacturerDailySettlementSnapshotStatus,
);
router.post(
  "/credits/daily-snapshots/recalc",
  authorize(["manufacturer", "admin"], {
    manufacturerRoles: ["owner", "staff"],
  }),
  triggerManufacturerDailySettlementSnapshotRecalc,
);

// 긴급 메시지 발송
router.post(
  "/messages/urgent",
  authorize(["manufacturer", "admin"], {
    manufacturerRoles: ["owner", "staff"],
  }),
  sendUrgentMessage,
);

// 전화번호 인증
router.post(
  "/phone/send-code",
  authorize(["manufacturer", "admin"], {
    manufacturerRoles: ["owner", "staff"],
  }),
  sendVerificationCode,
);
router.post(
  "/phone/verify-code",
  authorize(["manufacturer", "admin"], {
    manufacturerRoles: ["owner", "staff"],
  }),
  verifyCode,
);

export default router;

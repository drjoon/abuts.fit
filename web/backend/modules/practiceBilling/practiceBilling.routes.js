// related files:
// - web/backend/controllers/credits/practiceOpenBanking.controller.js
// - web/backend/app.js
import { Router } from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import {
  getPracticeBillingOverviewApi,
  listPracticeLabDepositsApi,
  transferPracticeLabDepositApi,
  reauthPracticeObConsentApi,
  registerPracticeObConsentApi,
  retryPracticeSettlementApi,
  triggerCurrentMonthSettlementConfirmApi,
} from "../../controllers/credits/practiceOpenBanking.controller.js";

const router = Router();

router.use(authenticate);
router.use(authorize(["requestor", "practice", "admin"]));

router.get("/overview", getPracticeBillingOverviewApi);
router.post("/consent", registerPracticeObConsentApi);
router.post("/reauth", reauthPracticeObConsentApi);
router.post("/retry-settlement/:settlementId", retryPracticeSettlementApi);
router.post("/confirm-month", triggerCurrentMonthSettlementConfirmApi);
router.get("/deposits", listPracticeLabDepositsApi);
router.post("/deposits", transferPracticeLabDepositApi);

export default router;

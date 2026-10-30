// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
import { Router } from "express";
const router = Router();

import { authenticate, authenticateOptional, authorize, requireSettlementAccess } from "../../middlewares/auth.middleware.js";
import {
  getMyCreditBalance,
  getMyCreditSpendInsights,
  getLabSettlementDailySummary,
  listMyLabSettlementBatchItems,
} from "../../controllers/credits/credit.controller.js";
import { listMyCreditLedger } from "../../controllers/credits/creditLedger.controller.js";
import { getMyCreditLedgerStats } from "../../controllers/credits/creditLedgerStats.controller.js";
import {
  createChargeOrder,
  listMyChargeOrders,
  cancelMyChargeOrder,
  requestTaxInvoice,
  listMyTaxInvoices,
  getMyTaxInvoice,
} from "../../controllers/credits/creditBPlan.controller.js";
import {
  getMyConversionQuote,
  getLabDemoConversions,
  confirmLabDemoConversion,
} from "../../controllers/credits/conversionInvoice.controller.js";
import {
  sendVerificationCode,
  verifyCode,
} from "../../controllers/auth/phoneVerification.controller.js";
import { getPublicCreditSettings } from "../../controllers/admin/admin.settings.controller.js";

// 공개 조회. 로그인 의뢰자면 자기 BA 판매가 오버라이드를 반영한다.
router.get("/settings", authenticateOptional, getPublicCreditSettings);

router.use(authenticate);

router.get("/balance", getMyCreditBalance);
router.get("/conversion-quote", authorize(["requestor"]), requireSettlementAccess, getMyConversionQuote);
router.get("/lab-demo-conversions", authorize(["requestor", "internalLab"]), requireSettlementAccess, getLabDemoConversions);
router.post(
  "/lab-demo-conversions/:invoiceId/confirm",
  authorize(["requestor"]),
  requireSettlementAccess,
  confirmLabDemoConversion,
);
router.get("/insights/spend", requireSettlementAccess, getMyCreditSpendInsights);
router.get("/settlement/daily-summary", requireSettlementAccess, getLabSettlementDailySummary);
router.get("/settlement/payouts", requireSettlementAccess, listMyLabSettlementBatchItems);
router.get("/orders", requireSettlementAccess, listMyChargeOrders);
router.get("/ledger", requireSettlementAccess, listMyCreditLedger);
router.get("/ledger/stats", requireSettlementAccess, getMyCreditLedgerStats);
router.get("/b-plan/orders", requireSettlementAccess, listMyChargeOrders);
router.post("/b-plan/orders", requireSettlementAccess, createChargeOrder);
router.post("/orders", requireSettlementAccess, createChargeOrder);
router.post("/orders/:chargeOrderId/cancel", requireSettlementAccess, cancelMyChargeOrder);
router.post("/b-plan/orders/:chargeOrderId/cancel", requireSettlementAccess, cancelMyChargeOrder);

// 세금계산서
router.post("/tax-invoices", requireSettlementAccess, requestTaxInvoice);
router.get("/tax-invoices", requireSettlementAccess, listMyTaxInvoices);
router.get("/tax-invoices/:id", requireSettlementAccess, getMyTaxInvoice);

// 전화번호 인증
router.post("/phone/send-code", sendVerificationCode);
router.post("/phone/verify-code", verifyCode);

export default router;

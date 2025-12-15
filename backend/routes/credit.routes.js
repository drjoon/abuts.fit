import { Router } from "express";
const router = Router();

import {
  authenticate,
  authorizePosition,
} from "../middlewares/auth.middleware.js";
import {
  createCreditOrder,
  listMyCreditOrders,
  getMyCreditBalance,
  getMyCreditSpendInsights,
  confirmVirtualAccountPayment,
  cancelMyCreditOrder,
  requestCreditRefund,
} from "../controllers/credit.controller.js";

router.use(authenticate);
// 크레딧/결제 관련 기능은 주대표/부대표만 접근 가능
router.use(authorizePosition(["principal", "vice_principal"]));

router.get("/balance", getMyCreditBalance);
router.get("/insights/spend", getMyCreditSpendInsights);
router.get("/orders", listMyCreditOrders);
router.post("/orders", createCreditOrder);
router.post("/orders/:orderId/cancel", cancelMyCreditOrder);
router.post("/payments/confirm", confirmVirtualAccountPayment);
router.post("/refunds", requestCreditRefund);

export default router;

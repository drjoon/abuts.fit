import { Router } from "express";
const router = Router();

import { authenticate } from "../middlewares/auth.middleware.js";
import {
  createCreditOrder,
  listMyCreditOrders,
  getMyCreditBalance,
  confirmVirtualAccountPayment,
  cancelMyCreditOrder,
  requestCreditRefund,
} from "../controllers/credit.controller.js";

router.use(authenticate);

router.get("/balance", getMyCreditBalance);
router.get("/orders", listMyCreditOrders);
router.post("/orders", createCreditOrder);
router.post("/orders/:orderId/cancel", cancelMyCreditOrder);
router.post("/payments/confirm", confirmVirtualAccountPayment);
router.post("/refunds", requestCreditRefund);

export default router;

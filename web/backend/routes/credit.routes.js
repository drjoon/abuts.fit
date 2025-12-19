import { Router } from "express";
const router = Router();

import { authenticate } from "../middlewares/auth.middleware.js";
import {
  getMyCreditBalance,
  getMyCreditSpendInsights,
} from "../controllers/credit.controller.js";
import { listMyCreditLedger } from "../controllers/creditLedger.controller.js";
import {
  createChargeOrder,
  listMyChargeOrders,
  cancelMyChargeOrder,
} from "../controllers/creditBPlan.controller.js";

router.use(authenticate);

router.get("/balance", getMyCreditBalance);
router.get("/insights/spend", getMyCreditSpendInsights);
router.get("/orders", listMyChargeOrders);
router.get("/ledger", listMyCreditLedger);
router.get("/b-plan/orders", listMyChargeOrders);
router.post("/b-plan/orders", createChargeOrder);
router.post("/orders", createChargeOrder);
router.post("/orders/:chargeOrderId/cancel", cancelMyChargeOrder);
router.post("/b-plan/orders/:chargeOrderId/cancel", cancelMyChargeOrder);

export default router;

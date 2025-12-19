import { Router } from "express";
const router = Router();

import {
  authenticate,
  authorizePosition,
} from "../middlewares/auth.middleware.js";
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
// 크레딧/결제 관련 기능은 주대표/부대표만 접근 가능
router.use(authorizePosition(["principal", "vice_principal"]));

router.get("/balance", getMyCreditBalance);
router.get("/insights/spend", getMyCreditSpendInsights);
router.get("/orders", listMyChargeOrders);
router.get("/ledger", listMyCreditLedger);
router.get("/b-plan/orders", listMyChargeOrders);
router.post(
  "/b-plan/orders",
  authorizePosition(["principal"]),
  createChargeOrder
);
router.post("/orders", authorizePosition(["principal"]), createChargeOrder);
router.post(
  "/orders/:chargeOrderId/cancel",
  authorizePosition(["principal"]),
  cancelMyChargeOrder
);
router.post(
  "/b-plan/orders/:chargeOrderId/cancel",
  authorizePosition(["principal"]),
  cancelMyChargeOrder
);

export default router;

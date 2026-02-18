import { Router } from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import {
  getSalesmanDashboard,
  getSalesmanLedger,
} from "../../controllers/salesman/salesman.controller.js";

const router = Router();

router.use(authenticate);
router.use(authorize(["salesman"]));

router.get("/dashboard", getSalesmanDashboard);
router.get("/ledger", getSalesmanLedger);

export default router;

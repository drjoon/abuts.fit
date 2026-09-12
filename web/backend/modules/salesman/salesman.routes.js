// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
import { Router } from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import {
  getSalesmanDashboard,
  getSalesmanLedger,
  getPlatformPitch,
} from "../../controllers/salesman/salesman.controller.js";

const router = Router();

router.use(authenticate);
router.use(authorize(["salesman", "devops"]));

router.get("/dashboard", getSalesmanDashboard);
router.get("/ledger", getSalesmanLedger);
router.get("/platform-pitch", getPlatformPitch);

export default router;

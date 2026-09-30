// related files:
// - web/backend/app.js
// - web/backend/controllers/admin/opsMonthlyReport.controller.js
import { Router } from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import { getOpsMonthlyReport } from "../../controllers/admin/opsMonthlyReport.controller.js";

const router = Router();

router.use(authenticate);
router.use(authorize(["admin", "devops"]));
router.get("/monthly", getOpsMonthlyReport);

export default router;

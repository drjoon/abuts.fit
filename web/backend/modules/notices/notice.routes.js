// related files:
// - web/backend/controllers/dashboardNotice.controller.js
// - web/backend/app.js
import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { getActiveDashboardNotices } from "../../controllers/dashboardNotice.controller.js";

const router = Router();

router.get("/active", authenticate, getActiveDashboardNotices);

export default router;

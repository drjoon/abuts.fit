// related files:
// - web/backend/app.js
// - web/backend/controllers/devops/designDeadline.controller.js
import { Router } from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import {
  getDesignDeadlineSettings,
  updateDesignDeadlineSettings,
} from "../../controllers/devops/designDeadline.controller.js";

const router = Router();

router.use(authenticate);
router.use(authorize(["devops", "admin"]));

router.get("/", getDesignDeadlineSettings);
router.put("/", updateDesignDeadlineSettings);

export default router;

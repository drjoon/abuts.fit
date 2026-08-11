// related files:
// - web/backend/app.js
// - web/backend/controllers/devops/designAccess.controller.js
// - web/backend/utils/designAccess.js
import { Router } from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import {
  listDesignAccess,
  patchDesignAccess,
} from "../../controllers/devops/designAccess.controller.js";

const router = Router();

router.use(authenticate);
router.use(authorize(["devops", "admin"]));

router.get("/", listDesignAccess);
router.patch("/:anchorId", patchDesignAccess);

export default router;

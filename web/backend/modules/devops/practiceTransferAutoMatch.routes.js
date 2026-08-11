// related files:
// - web/backend/app.js
// - web/backend/controllers/devops/practiceTransferAutoMatch.controller.js
// - web/backend/utils/practiceTransferAutoMatch.js
import { Router } from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import {
  listPracticeTransferAutoMatch,
  patchPracticeTransferAutoMatch,
} from "../../controllers/devops/practiceTransferAutoMatch.controller.js";

const router = Router();

router.use(authenticate);
router.use(authorize(["devops", "admin"]));

router.get("/", listPracticeTransferAutoMatch);
router.patch("/:anchorId", patchPracticeTransferAutoMatch);

export default router;

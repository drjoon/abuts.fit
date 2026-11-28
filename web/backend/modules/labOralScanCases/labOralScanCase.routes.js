// related files:
// - web/backend/app.js
// - web/backend/controllers/labOralScanCases/labOralScanCase.controller.js
import { Router } from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import {
  createLabOralScanCase,
  getLabOralScanCase,
  listLabOralScanCases,
  patchLabOralScanCase,
} from "../../controllers/labOralScanCases/labOralScanCase.controller.js";

const router = Router();

router.use(authenticate);
router.use(authorize(["requestor", "lab", "internalLab", "admin"]));

router.get("/", listLabOralScanCases);
router.post("/", createLabOralScanCase);
router.get("/:caseId", getLabOralScanCase);
router.patch("/:caseId", patchLabOralScanCase);

export default router;

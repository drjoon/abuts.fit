// related files:
// - web/backend/app.js
// - web/backend/controllers/practiceLabDirectSettlement.controller.js
import { Router } from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import {
  confirmLabDirectSettlementApi,
  getLabDirectSettlementsApi,
  patchLabDirectSettlementApi,
  saveLabTrusteeChoiceApi,
} from "../../controllers/practiceLabDirectSettlement.controller.js";

const router = Router();

router.use(authenticate);
router.use(authorize(["requestor", "lab", "internalLab", "admin"]));

router.get("/", getLabDirectSettlementsApi);
router.post("/trustee", saveLabTrusteeChoiceApi);
router.patch("/:id", patchLabDirectSettlementApi);
router.post("/:id/confirm-deposit", confirmLabDirectSettlementApi);

export default router;

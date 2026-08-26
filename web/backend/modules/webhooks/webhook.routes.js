// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
import { Router } from "express";
import { receiveInboundMail } from "../../controllers/webhooks/mailWebhook.controller.js";
import { handleBankWebhook } from "../../controllers/webhooks/bankWebhook.controller.js";
import { handleMachiningStartedWebhook } from "../../controllers/webhooks/machiningWebhook.controller.js";
import { handleThreeShapeWebhook } from "../../controllers/webhooks/threeShapeWebhook.controller.js";

const router = Router();
router.post("/mail", receiveInboundMail);
router.post("/bank", handleBankWebhook);
router.post("/machining-start", handleMachiningStartedWebhook);
router.post("/3shape", handleThreeShapeWebhook);

export default router;

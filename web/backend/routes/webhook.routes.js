import { Router } from "express";
import { receiveInboundMail } from "../controllers/mailWebhook.controller.js";
import { handleBankWebhook } from "../controllers/bankWebhook.controller.js";
import { handleMachiningStartedWebhook } from "../controllers/machiningWebhook.controller.js";
import { handleHanjinTrackingWebhook } from "../controllers/hanjinWebhook.controller.js";

const router = Router();
router.post("/mail", receiveInboundMail);
router.post("/bank", handleBankWebhook);
router.post("/machining-start", handleMachiningStartedWebhook);
router.post("/hanjin", handleHanjinTrackingWebhook);

export default router;

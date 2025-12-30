import { Router } from "express";
import { receiveInboundMail } from "../controllers/mailWebhook.controller.js";
import { handleBankWebhook } from "../controllers/bankWebhook.controller.js";
import { handleMachiningStartedWebhook } from "../controllers/machiningWebhook.controller.js";

const router = Router();
router.post("/mail", receiveInboundMail);
router.post("/bank", handleBankWebhook);
router.post("/machining-start", handleMachiningStartedWebhook);

export default router;

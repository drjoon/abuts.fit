import { Router } from "express";
import { receiveInboundMail } from "../controllers/mailWebhook.controller.js";
import { handleBankWebhook } from "../controllers/bankWebhook.controller.js";

const router = Router();
router.post("/mail", receiveInboundMail);
router.post("/bank", handleBankWebhook);

export default router;

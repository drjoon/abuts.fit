import { Router } from "express";
import { receiveInboundMail } from "../controllers/mailWebhook.controller.js";
import { receiveBoltaTaxInvoiceWebhook } from "../controllers/boltaWebhook.controller.js";

const router = Router();
router.post("/mail", receiveInboundMail);
router.post("/bolta", receiveBoltaTaxInvoiceWebhook);

export default router;

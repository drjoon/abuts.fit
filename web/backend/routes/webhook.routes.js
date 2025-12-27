import { Router } from "express";
import { receiveInboundMail } from "../controllers/mailWebhook.controller.js";

const router = Router();
router.post("/mail", receiveInboundMail);

export default router;

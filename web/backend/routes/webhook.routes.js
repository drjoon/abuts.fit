import { Router } from "express";
const router = Router();

import { handleTossWebhook } from "../controllers/tossWebhook.controller.js";

router.post("/toss", handleTossWebhook);

export default router;

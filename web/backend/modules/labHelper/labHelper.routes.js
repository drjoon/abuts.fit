// related files:
// - web/backend/controllers/labHelper/labHelperAlarm.controller.js
// - web/backend/services/labHelperAlarm.service.js
// - web/backend/app.js
// change-log:
// - 2026-10-03: 기공소 PC 헬퍼 알람 wait API.

import express from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { waitLabHelperAlarm } from "../../controllers/labHelper/labHelperAlarm.controller.js";

const router = express.Router();

router.use(authenticate);
router.get("/alarms/wait", waitLabHelperAlarm);

export default router;

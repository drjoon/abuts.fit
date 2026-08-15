// related files:
// - web/backend/controllers/labTradingPartners/labTradingPartner.controller.js
// - web/backend/app.js
import express from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import {
  listLabTradingPartners,
  createLabTradingPartnerInvite,
  cancelLabTradingPartnerInvite,
  getLabTradingPartnerWindow,
  getInvitePreview,
  bindLabTradingPartnerInvite,
  getLabFeeSchedule,
  updateLabFeeSchedule,
  updateLabPracticeFeeMultiplier,
} from "../../controllers/labTradingPartners/labTradingPartner.controller.js";

const router = express.Router();

router.get("/invite-preview", getInvitePreview);

router.get(
  "/window",
  authenticate,
  authorize(["requestor", "admin"]),
  getLabTradingPartnerWindow,
);

router.get(
  "/fee-schedule",
  authenticate,
  authorize(["requestor", "internalLab", "admin"]),
  getLabFeeSchedule,
);

router.put(
  "/fee-schedule",
  authenticate,
  authorize(["requestor", "internalLab", "admin"]),
  updateLabFeeSchedule,
);

router.put(
  "/practice-fee-multiplier",
  authenticate,
  authorize(["requestor", "admin"]),
  updateLabPracticeFeeMultiplier,
);

router.post(
  "/bind",
  authenticate,
  authorize(["requestor", "admin"]),
  bindLabTradingPartnerInvite,
);

router.get(
  "/",
  authenticate,
  authorize(["requestor", "admin"]),
  listLabTradingPartners,
);

router.post(
  "/",
  authenticate,
  authorize(["requestor", "admin"]),
  createLabTradingPartnerInvite,
);

router.post(
  "/:id/cancel",
  authenticate,
  authorize(["requestor", "admin"]),
  cancelLabTradingPartnerInvite,
);

export default router;

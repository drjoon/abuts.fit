// related files:
// - web/backend/controllers/labTradingPartners/labTradingPartner.controller.js
// - web/backend/app.js
// - 2026-08-20: 치과별 기공수가 할증 PUT은 기공소(requestor lab)와 어벗츠기공소(internalLab) 모두.
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
  updateLabPracticePartnerMemo,
  getLabPracticeSpecialSupplyPrices,
  updateLabPracticeSpecialSupplyPrices,
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
  authorize(["requestor", "internalLab", "admin"]),
  updateLabPracticeFeeMultiplier,
);

router.put(
  "/practice-partner-memo",
  authenticate,
  authorize(["requestor", "internalLab", "admin"]),
  updateLabPracticePartnerMemo,
);

router.get(
  "/special-supply-prices",
  authenticate,
  authorize(["requestor", "internalLab", "admin"]),
  getLabPracticeSpecialSupplyPrices,
);

router.put(
  "/special-supply-prices",
  authenticate,
  authorize(["requestor", "internalLab", "admin"]),
  updateLabPracticeSpecialSupplyPrices,
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

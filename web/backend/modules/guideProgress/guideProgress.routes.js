import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware.js";
import {
  getGuideProgress,
  patchGuideStep,
  resetGuideProgress,
} from "../controllers/guideProgress.controller.js";

const router = Router();

router.use(authenticate);

router.get("/:tourId", getGuideProgress);
router.patch("/:tourId/steps/:stepId", patchGuideStep);
router.post("/:tourId/reset", resetGuideProgress);

export default router;

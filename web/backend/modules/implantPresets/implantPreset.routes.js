// related files:
// - web/backend/rules.md
// - web/backend/app.js
// - web/backend/server.js
import { Router } from "express";
import implantPresetController from "../../controllers/presets/implantPreset.controller.js";
import {
  authenticate,
  authenticateOptional,
} from "../../middlewares/auth.middleware.js";

const router = Router();

router.get(
  "/",
  authenticateOptional,
  implantPresetController.getImplantPresets,
);
router.get(
  "/find-by-diameter",
  implantPresetController.findImplantPresetByDiameter,
);

// Find a preset for a specific case
router.get("/find", authenticate, implantPresetController.findPreset);

export default router;

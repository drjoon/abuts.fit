import { Router } from "express";
import implantPresetController from "../../controllers/presets/implantPreset.controller.js";
import { authenticate } from "../../middlewares/auth.middleware.js";

const router = Router();

router.get("/", implantPresetController.getImplantPresets);
router.get(
  "/find-by-diameter",
  implantPresetController.findImplantPresetByDiameter,
);

// Find a preset for a specific case
router.get("/find", authenticate, implantPresetController.findPreset);

export default router;

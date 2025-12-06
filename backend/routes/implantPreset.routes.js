import { Router } from "express";
import implantPresetController from "../controllers/implantPreset.controller.js";
import { auth } from "../middleware/index.js";

const router = Router();

// Find a preset for a specific case
router.get("/find", auth.verifyToken, implantPresetController.findPreset);

export default router;

// related files:
// - web/backend/app.js
// - web/backend/controllers/labDesignPresets/labDesignPreset.controller.js
import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import * as controller from "../../controllers/labDesignPresets/labDesignPreset.controller.js";

const router = Router();

router.use(authenticate);

router.get("/", controller.getLabDesignPresets);
router.put("/", controller.saveLabDesignPresets);

export default router;

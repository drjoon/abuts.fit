import { Router } from "express";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { suggestImplantNames } from "../../controllers/implantNameRegistry.controller.js";

const router = Router();

router.get("/suggest", authenticate, suggestImplantNames);

export default router;

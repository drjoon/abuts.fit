// related files:
// - web/backend/controllers/integrations/threeShape.controller.js
// - web/backend/app.js
import express from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import {
  connectThreeShapeIntegration,
  disconnectThreeShapeIntegration,
  getThreeShapeIntegration,
  listThreeShapeIntegrationsAdmin,
  syncThreeShapeIntegration,
} from "../../controllers/integrations/threeShape.controller.js";

const router = express.Router();

router.get(
  "/",
  authenticate,
  authorize(["requestor", "internalLab", "admin"]),
  getThreeShapeIntegration,
);

router.post(
  "/connect",
  authenticate,
  authorize(["requestor", "internalLab", "admin"]),
  connectThreeShapeIntegration,
);

router.post(
  "/disconnect",
  authenticate,
  authorize(["requestor", "internalLab", "admin"]),
  disconnectThreeShapeIntegration,
);

router.post(
  "/sync",
  authenticate,
  authorize(["requestor", "internalLab", "admin"]),
  syncThreeShapeIntegration,
);

router.get(
  "/admin/connections",
  authenticate,
  authorize(["admin"]),
  listThreeShapeIntegrationsAdmin,
);

export default router;

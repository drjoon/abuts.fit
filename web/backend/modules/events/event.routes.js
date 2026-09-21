// related files:
// - web/backend/controllers/events/marketingEvent.controller.js
// - web/backend/app.js
import { Router } from "express";
import {
  listPublicEvents,
  getPublicEvent,
  suggestEventPlaces,
  applyToEvent,
  getMyEventApplication,
} from "../../controllers/events/marketingEvent.controller.js";
import {
  authenticate,
  authenticateOptional,
} from "../../middlewares/auth.middleware.js";

const router = Router();

router.get("/places/suggest", suggestEventPlaces);
router.get("/", listPublicEvents);
router.get("/:slug/my-application", authenticate, getMyEventApplication);
router.get("/:slug", getPublicEvent);
router.post("/:slug/applications", authenticateOptional, applyToEvent);

export default router;

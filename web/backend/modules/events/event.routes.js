// related files:
// - web/backend/controllers/events/marketingEvent.controller.js
// - web/backend/app.js
import { Router } from "express";
import {
  listPublicEvents,
  getPublicEvent,
  suggestEventPlaces,
  applyToEvent,
} from "../../controllers/events/marketingEvent.controller.js";

const router = Router();

router.get("/places/suggest", suggestEventPlaces);
router.get("/", listPublicEvents);
router.get("/:slug", getPublicEvent);
router.post("/:slug/applications", applyToEvent);

export default router;

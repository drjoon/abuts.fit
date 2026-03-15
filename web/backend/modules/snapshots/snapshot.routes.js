import { Router } from "express";
import { authenticate, authorize } from "../../middlewares/auth.middleware.js";
import {
  recalcAllSnapshots,
  getAdminSnapshotsStatus,
} from "../../controllers/snapshots/snapshot.controller.js";

const router = Router();

router.use(authenticate);
router.use(
  authorize(["admin", "manufacturer"], {
    adminRoles: ["owner"],
    manufacturerRoles: ["owner", "staff"],
  }),
);

router.get(
  "/admin-status",
  authorize(["admin"], { adminRoles: ["owner"] }),
  getAdminSnapshotsStatus,
);
router.post("/recalc-all", recalcAllSnapshots);

export default router;
